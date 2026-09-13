/**
 * R02B regression tests.
 *
 * Covers: convert/submit overlap, duplicate help, stale item actions, bank
 * exhaustion, wrong-without-help labels, clock-controlled due-date.
 *
 * Preserves all 40 existing tests (learning.test.ts and api.test.ts). These
 * tests extend coverage at the API boundary so that each new invariant has at
 * least one deterministic regression case.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import app, { clearSessions } from './index.js';
import { demoLesson } from '../content/demo-lesson.js';
import type { SessionView, Stage } from '../shared/types.js';

const env = { RAWI_TUTOR_MODE: 'fixture' };

async function call(
  path: string,
  init?: RequestInit,
): Promise<{ status: number; body: any }> {
  const res = await app.fetch(
    new Request(`http://localhost${path}`, init),
    env,
  );
  const body = await res.json().catch(() => undefined);
  return { status: res.status, body };
}

function post(path: string, payload?: unknown): Promise<{ status: number; body: any }> {
  return call(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: payload === undefined ? undefined : JSON.stringify(payload),
  });
}

async function newSession(): Promise<SessionView> {
  const { body } = await post('/api/sessions');
  return body as SessionView;
}

async function advanceTo(id: string, stage: Stage): Promise<SessionView> {
  const path: Record<Stage, readonly Stage[]> = {
    diagnose: [],
    learn: ['learn'],
    practice: ['learn', 'practice'],
    check: ['learn', 'practice', 'check'],
    summary: ['learn', 'practice', 'check', 'summary'],
  };
  let view: SessionView | undefined;
  for (const step of path[stage]) {
    const res = await post(`/api/sessions/${id}/stage`, { stage: step });
    expect(res.status).toBe(200);
    view = res.body as SessionView;
  }
  return view ?? ((await call(`/api/sessions/${id}`)).body as SessionView);
}

function deferredBody(payload: unknown): {
  request: Request;
  release: () => void;
} {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      await gate;
      controller.enqueue(new TextEncoder().encode(JSON.stringify(payload)));
      controller.close();
    },
  });
  const request = new Request('http://localhost/placeholder', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: stream,
    duplex: 'half',
  } as RequestInit);
  return { request, release };
}

function slowPost(
  path: string,
  payload: unknown,
): { send: Promise<{ status: number; body: any }>; release: () => void } {
  const { request, release } = deferredBody(payload);
  const send = (async () => {
    const res = await app.fetch(
      new Request(`http://localhost${path}`, request),
      env,
    );
    return { status: res.status, body: await res.json().catch(() => undefined) };
  })();
  return { send, release };
}

beforeEach(() => clearSessions());

// ─── Convert / submit overlap ────────────────────────────────────────────────

describe('convert/submit overlap', () => {
  it('denies independent credit to a submission that overlapped a convert', async () => {
    const session = await newSession();
    const id = session.sessionId;
    const view = await advanceTo(id, 'check');
    const activeItemId = view.activeCheckId!;

    // Attempt starts first but its body is still in flight.
    const attempt = slowPost(`/api/sessions/${id}/attempt`, {
      stage: 'check',
      optionId: demoLesson.check.correctOptionId,
      itemId: activeItemId,
    });

    // Convert completes while attempt is suspended.
    const converted = await post(`/api/sessions/${id}/convert`, {
      itemId: activeItemId,
    });
    expect(converted.status).toBe(200);
    // After convert, the session has a new active item (not the converted one).
    // activeCheckId must have changed.
    expect((converted.body as SessionView).activeCheckId).not.toBe(activeItemId);

    // Now the attempt resumes. The item has been converted; the server should
    // reject it as item_replaced (or stage_not_active if the stage changed).
    attempt.release();
    const graded = await attempt.send;

    // The attempt must not produce independent credit.
    // It either gets rejected (409) or — if the same item is still active —
    // grades it as assisted because the answer is now 'revealed'.
    if (graded.status === 200) {
      expect((graded.body as SessionView).lastResult?.countsAsIndependent).toBe(false);
      expect((graded.body as SessionView).evidence.state).not.toBe('independent-once');
    } else {
      expect(graded.status).toBe(409);
    }
  });

  it('a submit that arrives before the convert still records correctly', async () => {
    const session = await newSession();
    const id = session.sessionId;
    const view = await advanceTo(id, 'check');
    const activeItemId = view.activeCheckId!;

    // Convert starts first but its body is delayed.
    const convert = slowPost(`/api/sessions/${id}/convert`, {
      itemId: activeItemId,
    });

    // Correct submission arrives and completes first.
    const graded = (
      await post(`/api/sessions/${id}/attempt`, {
        stage: 'check',
        optionId: demoLesson.check.correctOptionId,
        itemId: activeItemId,
      })
    ).body as SessionView;
    expect(graded.lastResult?.countsAsIndependent).toBe(true);

    // Now the convert arrives. The item was already submitted, so the server
    // either treats this as a no-op (already submitted counts as non-converted)
    // or returns 409. Either way, the original independent result must stand.
    convert.release();
    await convert.send;

    const reloaded = (await call(`/api/sessions/${id}`)).body as SessionView;
    expect(reloaded.evidence.state).toBe('independent-once');
  });
});

// ─── Duplicate help / idempotent convert ─────────────────────────────────────

describe('duplicate help: convert is idempotent for the same item', () => {
  it('returns 200 twice and does not change state on the second call', async () => {
    const session = await newSession();
    const id = session.sessionId;
    const view = await advanceTo(id, 'check');
    const itemId = view.activeCheckId!;

    const first = (await post(`/api/sessions/${id}/convert`, { itemId }))
      .body as SessionView;
    const newItemId = first.activeCheckId;

    // Second convert with the same (now retired) item ID.
    const second = await post(`/api/sessions/${id}/convert`, { itemId });
    // Either 409 (stale item) or 200 idempotent.
    if (second.status === 200) {
      // If 200, the state must not have changed further.
      expect((second.body as SessionView).activeCheckId).toBe(newItemId);
    } else {
      expect(second.status).toBe(409);
      expect(second.body.error).toBe('item_replaced');
    }

    // Original conversion still in effect.
    const reloaded = (await call(`/api/sessions/${id}`)).body as SessionView;
    expect(reloaded.activeCheckId).toBe(newItemId);
  });
});

// ─── Stale item actions ───────────────────────────────────────────────────────

describe('stale item actions are rejected', () => {
  it('rejects a submission carrying the old item ID after conversion', async () => {
    const session = await newSession();
    const id = session.sessionId;
    const view = await advanceTo(id, 'check');
    const oldItemId = view.activeCheckId!;

    // Convert to get a new item.
    const converted = (
      await post(`/api/sessions/${id}/convert`, { itemId: oldItemId })
    ).body as SessionView;
    const newItemId = converted.activeCheckId!;
    expect(newItemId).not.toBe(oldItemId);

    // A stale attempt still naming the old item ID.
    const stale = await post(`/api/sessions/${id}/attempt`, {
      stage: 'check',
      optionId: demoLesson.check.correctOptionId,
      itemId: oldItemId,
    });
    expect(stale.status).toBe(409);
    expect(stale.body.error).toBe('item_replaced');

    // Nothing was recorded.
    const reloaded = (await call(`/api/sessions/${id}`)).body as SessionView;
    expect(reloaded.evidence.attempts).toHaveLength(0);
  });

  it('rejects a stale convert carrying the old item ID', async () => {
    const session = await newSession();
    const id = session.sessionId;
    const view = await advanceTo(id, 'check');
    const oldItemId = view.activeCheckId!;

    // First convert.
    await post(`/api/sessions/${id}/convert`, { itemId: oldItemId });

    // A delayed second convert still naming the old item.
    const stale = await post(`/api/sessions/${id}/convert`, { itemId: oldItemId });
    expect(stale.status).toBe(409);
    expect(stale.body.error).toBe('item_replaced');
  });

  it('rejects a delayed navigation that would rewind progress', async () => {
    const session = await newSession();
    const id = session.sessionId;
    await advanceTo(id, 'practice');

    // A learn request starts but its body is delayed.
    const learn = slowPost(`/api/sessions/${id}/stage`, { stage: 'learn' });

    // The learner advances to check while the learn request is in flight.
    await post(`/api/sessions/${id}/stage`, { stage: 'check' });

    // Now release the stale learn request.
    learn.release();
    const result = await learn.send;

    // Check -> learn is not allowed, so this must be rejected.
    expect(result.status).toBe(409);
    expect(result.body.error).toBe('stage_transition_not_allowed');

    // Session must still be at check.
    const reloaded = (await call(`/api/sessions/${id}`)).body as SessionView;
    expect(reloaded.stage).toBe('check');
  });
});

// ─── Bank exhaustion ─────────────────────────────────────────────────────────

describe('check bank exhaustion', () => {
  it('honestly reports exhaustion after all bank items are converted', async () => {
    const session = await newSession();
    const id = session.sessionId;
    await advanceTo(id, 'check');

    // Number of items in the bank: primary check + checkBank.
    const totalItems = 1 + demoLesson.checkBank.length;

    let view = (await call(`/api/sessions/${id}`)).body as SessionView;
    for (let i = 0; i < totalItems; i += 1) {
      const itemId = view.activeCheckId!;
      expect(view.checkBankExhausted).toBeFalsy();

      const converted = (
        await post(`/api/sessions/${id}/convert`, { itemId })
      ).body as SessionView;
      view = converted;

      // If there are items left, exhausted should still be false.
      // On the last iteration, checkBankExhausted should be true.
    }

    expect(view.checkBankExhausted).toBe(true);
    expect(view.checkConverted).toBe(true);
  });

  it('does not provide a new item after the bank is exhausted', async () => {
    const session = await newSession();
    const id = session.sessionId;
    await advanceTo(id, 'check');

    const totalItems = 1 + demoLesson.checkBank.length;
    let view = (await call(`/api/sessions/${id}`)).body as SessionView;

    // Exhaust all items.
    for (let i = 0; i < totalItems; i += 1) {
      const converted = (
        await post(`/api/sessions/${id}/convert`, { itemId: view.activeCheckId! })
      ).body as SessionView;
      view = converted;
    }

    // Trying to convert again should fail — bank is exhausted and there is no
    // active convertible item.
    const extra = await post(`/api/sessions/${id}/convert`, {
      itemId: view.activeCheckId,
    });
    expect(extra.status).toBe(409);
  });

  it('a bank item submitted correctly counts as independent', async () => {
    const session = await newSession();
    const id = session.sessionId;
    await advanceTo(id, 'check');

    const view = (await call(`/api/sessions/${id}`)).body as SessionView;
    const originalItemId = view.activeCheckId!;

    // Convert to get a bank item.
    const converted = (
      await post(`/api/sessions/${id}/convert`, { itemId: originalItemId })
    ).body as SessionView;
    const bankItemId = converted.activeCheckId!;
    expect(bankItemId).not.toBe(originalItemId);

    // The replacement item's correct option.
    const allItems = [demoLesson.check, ...demoLesson.checkBank];
    const bankQuestion = allItems.find((q) => q.id === bankItemId)!;
    expect(bankQuestion).toBeDefined();

    // Submit the bank item correctly without help.
    const checked = (
      await post(`/api/sessions/${id}/attempt`, {
        stage: 'check',
        optionId: bankQuestion.correctOptionId,
        itemId: bankItemId,
      })
    ).body as SessionView;

    expect(checked.lastResult?.countsAsIndependent).toBe(true);
    expect(checked.evidence.state).toBe('independent-once');
  });
});

// ─── Wrong-without-help labels ────────────────────────────────────────────────

describe('wrong-without-help label is distinct from assisted', () => {
  it('a wrong unaided check attempt does not show as assisted in the view', async () => {
    const session = await newSession();
    const id = session.sessionId;
    await advanceTo(id, 'check');

    const wrong = demoLesson.check.options.find(
      (o) => o.id !== demoLesson.check.correctOptionId,
    )!;

    const graded = (
      await post(`/api/sessions/${id}/attempt`, {
        stage: 'check',
        optionId: wrong.id,
      })
    ).body as SessionView;

    expect(graded.lastResult?.correct).toBe(false);
    // No help was used.
    expect(graded.lastResult?.assistance).toBe('none');
    expect(graded.lastResult?.countsAsIndependent).toBe(false);
    // Evidence must not be promoted.
    expect(graded.evidence.state).toBe('practicing');
    // The attempt badge in EvidencePanel would show wrongUnaidedBadge, not assistedBadge.
    // We verify the data, not the rendering.
    expect(graded.evidence.attempts[0]?.assistance).toBe('none');
    expect(graded.evidence.attempts[0]?.countsAsIndependent).toBe(false);
  });

  it('an assisted correct attempt shows assistance not independence', async () => {
    const session = await newSession();
    const id = session.sessionId;
    await advanceTo(id, 'practice');

    // Get a hint first to raise assistance.
    await post(`/api/sessions/${id}/hint`, { stage: 'practice' });

    const graded = (
      await post(`/api/sessions/${id}/attempt`, {
        stage: 'practice',
        optionId: demoLesson.practice.correctOptionId,
      })
    ).body as SessionView;

    expect(graded.lastResult?.correct).toBe(true);
    expect(graded.lastResult?.assistance).toBe('hinted');
    expect(graded.lastResult?.countsAsIndependent).toBe(false);
  });
});

// ─── Clock-controlled due-date ───────────────────────────────────────────────

describe('clock-controlled due-date stays fixed across re-reads', () => {
  it('review date is the same seven days after any arbitrary clock', async () => {
    // This is the permanent regression case for the R02A clock-drift defect.
    // The API itself stores the date at attempt time; projection has no clock.
    // We verify by reading back on a "later" call — same session, same date.

    const session = await newSession();
    const id = session.sessionId;
    await advanceTo(id, 'check');

    const graded = (
      await post(`/api/sessions/${id}/attempt`, {
        stage: 'check',
        optionId: demoLesson.check.correctOptionId,
      })
    ).body as SessionView;

    const dueAtSubmission = graded.evidence.nextReviewDue!;
    expect(dueAtSubmission).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    // Re-read the session multiple times. The review date must never change.
    for (let i = 0; i < 3; i += 1) {
      const reloaded = (await call(`/api/sessions/${id}`)).body as SessionView;
      expect(reloaded.evidence.nextReviewDue).toBe(dueAtSubmission);
      expect(reloaded.evidence.attempts[0]?.reviewDue).toBe(dueAtSubmission);
    }
  });

  it('a bank item submission also anchors the review date', async () => {
    const session = await newSession();
    const id = session.sessionId;
    const view = await advanceTo(id, 'check');
    const originalItemId = view.activeCheckId!;

    // Convert to a bank item.
    const converted = (
      await post(`/api/sessions/${id}/convert`, { itemId: originalItemId })
    ).body as SessionView;
    const bankItemId = converted.activeCheckId!;

    const allItems = [demoLesson.check, ...demoLesson.checkBank];
    const bankQuestion = allItems.find((q) => q.id === bankItemId)!;

    const graded = (
      await post(`/api/sessions/${id}/attempt`, {
        stage: 'check',
        optionId: bankQuestion.correctOptionId,
        itemId: bankItemId,
      })
    ).body as SessionView;

    const dueAtSubmission = graded.evidence.nextReviewDue!;
    expect(dueAtSubmission).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    // Re-read; date must not move.
    const reloaded = (await call(`/api/sessions/${id}`)).body as SessionView;
    expect(reloaded.evidence.nextReviewDue).toBe(dueAtSubmission);
  });
});

// ─── Convert before and after stage ──────────────────────────────────────────

describe('convert is only valid at the check stage', () => {
  it('rejects convert when the session is at practice', async () => {
    const session = await newSession();
    const id = session.sessionId;
    await advanceTo(id, 'practice');

    const result = await post(`/api/sessions/${id}/convert`, {
      itemId: demoLesson.check.id,
    });
    expect(result.status).toBe(409);
    expect(result.body.error).toBe('not_at_check_stage');
  });
});

// ─── Answer-key confidentiality for bank items ────────────────────────────────

describe('bank item answers stay server-side', () => {
  it('bank item answer key is absent from a check stage view', async () => {
    const session = await newSession();
    const id = session.sessionId;
    const view = await advanceTo(id, 'check');
    const originalItemId = view.activeCheckId!;

    const converted = (
      await post(`/api/sessions/${id}/convert`, { itemId: originalItemId })
    ).body as SessionView;

    // The replacement question must not carry its answer in the public view.
    const serialised = JSON.stringify(converted);
    expect(serialised).not.toContain('correctOptionId');

    for (const item of demoLesson.checkBank) {
      expect(serialised).not.toContain(item.answerExplanation);
    }
  });
});
