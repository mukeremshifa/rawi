/**
 * HTTP-level tests.
 *
 * These exercise the routes the browser actually calls, including the failure
 * cases that matter: unknown sessions, malformed bodies and option IDs the
 * server never authored. Input from the browser is untrusted (AGENTS.md).
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

/**
 * Walk a session to `stage` through the declared transitions.
 *
 * R02A refuses stage jumps, so a test that wants to be "at the check" has to
 * get there the way a learner does. Tests assert on the walk succeeding, so a
 * transition rule change cannot quietly leave a test asserting nothing.
 */
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

beforeEach(() => clearSessions());

describe('health', () => {
  it('declares itself as fixture data', async () => {
    const { status, body } = await call('/api/health');
    expect(status).toBe(200);
    expect(body.fixtureData).toBe(true);
    expect(body.tutorMode).toBe('fixture');
  });
});

describe('session lifecycle', () => {
  it('starts at the diagnostic with no assistance', async () => {
    const session = await newSession();
    expect(session.stage).toBe('diagnose');
    expect(session.assistance).toBe('none');
    expect(session.question?.id).toBe(demoLesson.diagnostic.id);
    expect(session.evidence.state).toBe('not-checked');
    expect(session.fixtureData).toBe(true);
  });

  it('returns 404 for an unknown session rather than inventing one', async () => {
    const { status, body } = await call('/api/sessions/does-not-exist');
    expect(status).toBe(404);
    expect(body.error).toBe('session_not_found');
  });

  it('re-reads the same state on a refresh', async () => {
    const session = await newSession();
    await advanceTo(session.sessionId, 'practice');
    await post(`/api/sessions/${session.sessionId}/reveal`, { stage: 'practice' });

    const { body: reloaded } = await call(`/api/sessions/${session.sessionId}`);
    // The reveal is still in force after what is, to the server, a fresh GET.
    expect((reloaded as SessionView).assistance).toBe('revealed');
  });
});

describe('input validation', () => {
  it('rejects an option the server did not author', async () => {
    const session = await newSession();
    const { status, body } = await post(
      `/api/sessions/${session.sessionId}/attempt`,
      { stage: 'diagnose', optionId: 'not-a-real-option' },
    );
    expect(status).toBe(400);
    expect(body.error).toBe('unknown_option');
  });

  it('rejects a malformed body', async () => {
    const session = await newSession();
    const { status } = await post(`/api/sessions/${session.sessionId}/attempt`, {
      stage: 'diagnose',
    });
    expect(status).toBe(400);
  });

  it('rejects an unknown stage', async () => {
    const session = await newSession();
    const { status } = await post(`/api/sessions/${session.sessionId}/stage`, {
      stage: 'admin',
    });
    expect(status).toBe(400);
  });

  it('rejects a hint request at a stage with no question', async () => {
    const session = await newSession();
    // Reach summary legitimately, so the request fails for the reason under
    // test rather than for being addressed to an inactive stage.
    await advanceTo(session.sessionId, 'summary');
    const { status, body } = await post(
      `/api/sessions/${session.sessionId}/hint`,
      { stage: 'summary' },
    );
    expect(status).toBe(400);
    expect(body.error).toBe('no_question_at_stage');
  });
});

describe('a complete learner journey', () => {
  it('runs diagnose -> learn -> practice -> check and records evidence', async () => {
    const session = await newSession();
    const id = session.sessionId;

    // Diagnose: answer wrongly, as a stuck learner would.
    const wrongDiag = demoLesson.diagnostic.options.find(
      (o) => o.id !== demoLesson.diagnostic.correctOptionId,
    )!;
    const diag = (await post(`/api/sessions/${id}/attempt`, {
      stage: 'diagnose',
      optionId: wrongDiag.id,
    })).body as SessionView;
    expect(diag.lastResult?.correct).toBe(false);

    // Learn: the explanation and its source excerpt become available.
    const learn = (await post(`/api/sessions/${id}/stage`, { stage: 'learn' }))
      .body as SessionView;
    expect(learn.explanation?.sourceExcerpt?.permission).toBeTruthy();

    // Practice: take a hint, then answer correctly. Assisted, by design.
    await post(`/api/sessions/${id}/stage`, { stage: 'practice' });

    const hinted = (await post(`/api/sessions/${id}/hint`, { stage: 'practice' }))
      .body as SessionView;
    expect(hinted.revealedHints).toHaveLength(1);

    const practiced = (await post(`/api/sessions/${id}/attempt`, {
      stage: 'practice',
      optionId: demoLesson.practice.correctOptionId,
    })).body as SessionView;
    expect(practiced.lastResult?.correct).toBe(true);
    expect(practiced.lastResult?.countsAsIndependent).toBe(false);

    // Check: fresh item, no help, correct. This is the evidence that counts.
    await post(`/api/sessions/${id}/stage`, { stage: 'check' });
    const checked = (await post(`/api/sessions/${id}/attempt`, {
      stage: 'check',
      optionId: demoLesson.check.correctOptionId,
    })).body as SessionView;

    expect(checked.lastResult?.countsAsIndependent).toBe(true);
    expect(checked.evidence.state).toBe('independent-once');
    expect(checked.evidence.attempts).toHaveLength(3);
    expect(checked.evidence.nextReviewDue).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('does not reach independent-once when the check answer was revealed', async () => {
    const session = await newSession();
    const id = session.sessionId;

    await advanceTo(id, 'check');
    // Reveal is not offered in the check UI, but the API must refuse to treat
    // a revealed answer as independent even if the route is called directly.
    await post(`/api/sessions/${id}/reveal`, { stage: 'check' });

    const checked = (await post(`/api/sessions/${id}/attempt`, {
      stage: 'check',
      optionId: demoLesson.check.correctOptionId,
    })).body as SessionView;

    expect(checked.lastResult?.correct).toBe(true);
    expect(checked.lastResult?.countsAsIndependent).toBe(false);
    expect(checked.evidence.state).toBe('practicing');
    expect(checked.evidence.nextReviewDue).toBeUndefined();
  });

  it('ignores a double-submitted answer', async () => {
    const session = await newSession();
    const id = session.sessionId;
    await advanceTo(id, 'check');

    const payload = {
      stage: 'check',
      optionId: demoLesson.check.correctOptionId,
    };
    await post(`/api/sessions/${id}/attempt`, payload);
    const second = (await post(`/api/sessions/${id}/attempt`, payload))
      .body as SessionView;

    expect(second.evidence.attempts).toHaveLength(1);
  });
});

/**
 * R02A regression tests: overlapping requests.
 *
 * These are the tests that would have caught the defect documented in
 * docs/NEXT_STEPS.md gap 1. They do not simulate concurrency loosely - they
 * construct it deterministically, by giving one request a body the server has
 * to await while another request runs to completion in that window.
 */
describe('overlapping requests cannot lose recorded assistance', () => {
  /**
   * A Request whose body resolves only when `release()` is called.
   *
   * This is the precise shape of the original bug: the handler suspends at
   * `await req.json()`. Anything that ran in R01 between the session read and
   * the write was silently discarded. Holding the body open lets a test place
   * a second request exactly in that window, every run, with no timing luck.
   */
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
      // Required when the body is a stream.
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

  it('denies independent credit to an attempt that overlapped a reveal', async () => {
    const session = await newSession();
    const id = session.sessionId;
    await advanceTo(id, 'check');

    // The learner's attempt starts first, but its body is still in flight.
    const attempt = slowPost(`/api/sessions/${id}/attempt`, {
      stage: 'check',
      optionId: demoLesson.check.correctOptionId,
    });

    // While it is suspended, a reveal completes. The answer is now assisted.
    const revealed = await post(`/api/sessions/${id}/reveal`, { stage: 'check' });
    expect(revealed.status).toBe(200);
    expect((revealed.body as SessionView).assistance).toBe('revealed');

    // Now the attempt resumes and is graded.
    attempt.release();
    const graded = (await attempt.send).body as SessionView;

    // The answer is still correct, but it must NOT be independent, and the
    // reveal must not have been rolled back. In R01 both failed: the attempt
    // wrote state it had read before the reveal existed.
    expect(graded.lastResult?.correct).toBe(true);
    expect(graded.lastResult?.countsAsIndependent).toBe(false);
    expect(graded.lastResult?.assistance).toBe('revealed');
    expect(graded.assistance).toBe('revealed');
    expect(graded.evidence.state).toBe('practicing');
    expect(graded.evidence.nextReviewDue).toBeUndefined();
  });

  it('refuses a hint whose stage the learner left while it was in flight', async () => {
    const session = await newSession();
    const id = session.sessionId;
    await advanceTo(id, 'practice');

    const hint = slowPost(`/api/sessions/${id}/hint`, { stage: 'practice' });
    // A legal navigation completes while the hint request is suspended.
    await post(`/api/sessions/${id}/stage`, { stage: 'learn' });

    hint.release();
    const result = await hint.send;

    // The hint was addressed to a stage the session has left, so it is refused
    // rather than applied to whatever question is now active.
    expect(result.status).toBe(409);
    expect(result.body.error).toBe('stage_not_active');

    const reloaded = (await call(`/api/sessions/${id}`)).body as SessionView;
    expect(reloaded.stage).toBe('learn');
  });

  it('records one attempt when two identical submissions overlap', async () => {
    const session = await newSession();
    const id = session.sessionId;
    await advanceTo(id, 'check');

    const payload = { stage: 'check', optionId: demoLesson.check.correctOptionId };
    const first = slowPost(`/api/sessions/${id}/attempt`, payload);
    const second = slowPost(`/api/sessions/${id}/attempt`, payload);

    // Both bodies are released before either has been graded: a genuine double
    // submit, not a sequential retry.
    first.release();
    second.release();
    const [a, b] = await Promise.all([first.send, second.send]);

    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    const latest = (await call(`/api/sessions/${id}`)).body as SessionView;
    expect(latest.evidence.attempts).toHaveLength(1);
    expect(latest.evidence.attempts[0]?.countsAsIndependent).toBe(true);
  });
});

describe('commands must name the active stage', () => {
  it('refuses a jump straight from the diagnostic to the scored check', async () => {
    const session = await newSession();
    const { status, body } = await post(
      `/api/sessions/${session.sessionId}/stage`,
      { stage: 'check' },
    );
    // R01 returned 200 here, letting a learner reach the scored check without
    // passing through the teaching stages.
    expect(status).toBe(409);
    expect(body.error).toBe('stage_transition_not_allowed');

    const unchanged = (await call(`/api/sessions/${session.sessionId}`))
      .body as SessionView;
    expect(unchanged.stage).toBe('diagnose');
  });

  it('refuses an attempt addressed to a stage the learner has left', async () => {
    const session = await newSession();
    const id = session.sessionId;
    await advanceTo(id, 'practice');

    // A stale tab still showing the diagnostic submits its answer.
    const { status, body } = await post(`/api/sessions/${id}/attempt`, {
      stage: 'diagnose',
      optionId: demoLesson.diagnostic.correctOptionId,
    });
    expect(status).toBe(409);
    expect(body.error).toBe('stage_not_active');

    // Nothing was recorded against the question now in front of the learner.
    const latest = (await call(`/api/sessions/${id}`)).body as SessionView;
    expect(latest.evidence.attempts).toHaveLength(0);
  });

  it('treats navigating to the current stage as a no-op, not an error', async () => {
    const session = await newSession();
    const id = session.sessionId;
    await advanceTo(id, 'learn');

    const { status, body } = await post(`/api/sessions/${id}/stage`, {
      stage: 'learn',
    });
    expect(status).toBe(200);
    expect((body as SessionView).stage).toBe('learn');
  });
});

describe('recorded evidence does not change when it is read later', () => {
  it('keeps the review date fixed when the session is re-read', async () => {
    const session = await newSession();
    const id = session.sessionId;
    await advanceTo(id, 'check');

    const graded = (await post(`/api/sessions/${id}/attempt`, {
      stage: 'check',
      optionId: demoLesson.check.correctOptionId,
    })).body as SessionView;
    const dueAtSubmission = graded.evidence.nextReviewDue;
    expect(dueAtSubmission).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    // Re-read the same session. The projection takes no clock at all, so this
    // is the same read the learner makes after sleeping; R01 recomputed the
    // date from the read time and moved it forward every day.
    const later = (await call(`/api/sessions/${id}`)).body as SessionView;
    expect(later.evidence.nextReviewDue).toBe(dueAtSubmission);
    expect(later.evidence.attempts[0]?.reviewDue).toBe(dueAtSubmission);
  });

  it('replays the original result rather than describing it with later help', async () => {
    const session = await newSession();
    const id = session.sessionId;
    await advanceTo(id, 'check');

    const first = (await post(`/api/sessions/${id}/attempt`, {
      stage: 'check',
      optionId: demoLesson.check.correctOptionId,
    })).body as SessionView;
    expect(first.lastResult?.countsAsIndependent).toBe(true);
    expect(first.lastResult?.assistance).toBe('none');

    // The learner reveals the answer after being graded. Reading the worked
    // explanation is legitimate and must not rewrite what already happened.
    await post(`/api/sessions/${id}/reveal`, { stage: 'check' });

    const replay = (await post(`/api/sessions/${id}/attempt`, {
      stage: 'check',
      optionId: demoLesson.check.correctOptionId,
    })).body as SessionView;

    // R01 replayed the old correctness alongside the question's CURRENT
    // assistance, producing "correct, independent, revealed" - a combination
    // describing no real event.
    expect(replay.lastResult?.assistance).toBe('none');
    expect(replay.lastResult?.countsAsIndependent).toBe(true);
    expect(replay.evidence.attempts).toHaveLength(1);
    expect(replay.evidence.state).toBe('independent-once');
  });
});
