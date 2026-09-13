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
import type { SessionView } from '../shared/types.js';

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
    await post(`/api/sessions/${session.sessionId}/stage`, { stage: 'practice' });
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

    await post(`/api/sessions/${id}/stage`, { stage: 'check' });
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
    await post(`/api/sessions/${id}/stage`, { stage: 'check' });

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
