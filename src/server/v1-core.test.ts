import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { demoLesson } from '../content/demo-lesson.js';
import type { SessionView } from '../shared/types.js';
import { MemoryAiBudget } from './ai-budget.js';
import {
  app,
  clearFixtureOperations,
  clearSessions,
} from './index.js';
import {
  createSession,
  markExplanationSeen,
  setStage,
  startReview,
  submitAttempt,
} from './learning.js';
import { projectLearningEvidence } from './lesson-store.js';
import { retrieveCourseSources } from './retrieval.js';
import {
  actualCostMicros,
  conservativeReservationMicros,
  tutor,
  type TutorConfig,
} from './tutor.js';

const fixtureEnv = { RAWI_TUTOR_MODE: 'fixture' } as const;

async function request(
  path: string,
  init?: RequestInit,
  env: Record<string, string> = fixtureEnv,
) {
  const response = await app.fetch(new Request(`http://localhost${path}`, init), env);
  return { response, body: await response.json().catch(() => undefined) as any };
}

async function post(path: string, body?: unknown, env?: Record<string, string>) {
  return request(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  }, env);
}

beforeEach(() => {
  clearSessions();
  clearFixtureOperations();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('R04 bounded tutor', () => {
  const openAiConfig: TutorConfig = {
    mode: 'openai',
    apiKey: 'test-key',
    model: 'gpt-5.6-luna',
    inputUsdPerMillion: 0.2,
    outputUsdPerMillion: 1.2,
    timeoutMs: 1000,
  };

  it('retrieves only authorized course sources and rejects unknown requested IDs', () => {
    expect(retrieveCourseSources(demoLesson, 'substitute price').length).toBeGreaterThan(0);
    expect(() => retrieveCourseSources(demoLesson, 'anything', ['private-other-user'])).toThrow(
      'unauthorized_source_reference',
    );
  });

  it('uses provider-confirmed tokens for cost and validates citations', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      id: 'resp_test',
      model: 'gpt-5.6-luna-2026-08-01',
      status: 'completed',
      output_text: JSON.stringify({
        teaching: 'A related good changed, so the curve shifts.',
        sourceIds: ['rawi-demo-example-v1'],
      }),
      usage: { input_tokens: 100, output_tokens: 25 },
    }), { status: 200, headers: { 'content-type': 'application/json' } })));

    const result = await tutor(openAiConfig, {
      requestId: 'request-123',
      learnerId: 'learner-1',
      message: 'What does a substitute price do?',
      requestedSourceIds: ['rawi-demo-example-v1'],
      lesson: demoLesson,
    });
    expect(result.reply.sourceIds).toEqual(['rawi-demo-example-v1']);
    expect(result.reply.usage).toEqual({ inputTokens: 100, outputTokens: 25, costUsd: 0.00005 });
    expect(result.actualCostMicrosUsd).toBe(actualCostMicros(openAiConfig, 100, 25));
  });

  it('fails closed on malformed output and fabricated citations', async () => {
    const provider = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        id: 'resp_bad', model: 'gpt-5.6-luna', status: 'completed', output_text: 'not json',
        usage: { input_tokens: 5, output_tokens: 5 },
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        id: 'resp_citation', model: 'gpt-5.6-luna', status: 'completed',
        output_text: JSON.stringify({ teaching: 'Unsupported', sourceIds: ['made-up'] }),
        usage: { input_tokens: 5, output_tokens: 5 },
      }), { status: 200 }));
    vi.stubGlobal('fetch', provider);

    const input = {
      requestId: 'request-456', learnerId: 'learner-1', message: 'Explain demand', lesson: demoLesson,
    };
    await expect(tutor(openAiConfig, input)).rejects.toMatchObject({ code: 'malformed_model_output' });
    await expect(tutor(openAiConfig, input)).rejects.toMatchObject({ code: 'unsupported_source_reference' });
  });

  it('classifies a provider timeout as ambiguous so its reservation is retained', async () => {
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      if (init?.signal?.aborted) throw new DOMException('aborted', 'AbortError');
      return new Response('{}');
    }));
    await expect(tutor({ ...openAiConfig, timeoutMs: 1 }, {
      requestId: 'request-timeout', learnerId: 'learner', message: 'Explain demand', lesson: demoLesson,
    })).rejects.toMatchObject({ code: 'provider_timeout', ambiguous: true });
  });

  it('reserves atomically across concurrent requests and replays only settled output', () => {
    const ledger = new MemoryAiBudget();
    const amount = conservativeReservationMicros(openAiConfig);
    const attempts = Array.from({ length: 3 }, (_, index) => ledger.reserve({
      learnerId: `learner-${index}`,
      idempotencyKey: `request-${index}`,
      month: '2026-09-01',
      amountMicrosUsd: amount,
      globalCapMicrosUsd: amount * 2,
      learnerCapMicrosUsd: amount,
    }));
    expect(attempts.filter((result) => result.ok)).toHaveLength(2);
    expect(attempts[2]).toEqual({ ok: false, reason: 'global_cap' });

    const learnerLedger = new MemoryAiBudget();
    const first = learnerLedger.reserve({
      learnerId: 'learner', idempotencyKey: 'same-request', month: '2026-09-01',
      amountMicrosUsd: amount, globalCapMicrosUsd: amount * 3, learnerCapMicrosUsd: amount,
    });
    expect(first.ok).toBe(true);
    expect(learnerLedger.reserve({
      learnerId: 'learner', idempotencyKey: 'second-request', month: '2026-09-01',
      amountMicrosUsd: amount, globalCapMicrosUsd: amount * 3, learnerCapMicrosUsd: amount,
    })).toEqual({ ok: false, reason: 'learner_cap' });
    learnerLedger.settle('learner', 'same-request', 'settled', { text: 'cached' });
    const replay = learnerLedger.reserve({
      learnerId: 'learner', idempotencyKey: 'same-request', month: '2026-09-01',
      amountMicrosUsd: amount, globalCapMicrosUsd: amount * 3, learnerCapMicrosUsd: amount,
    });
    expect(replay).toMatchObject({ ok: true, replay: true });
  });

  it('keeps the tutor out of an active independent check', async () => {
    const created = await post('/api/sessions');
    const session = created.body as SessionView;
    for (const stage of ['learn', 'practice', 'check'] as const) {
      await post(`/api/sessions/${session.sessionId}/stage`, { stage });
    }
    const blocked = await post('/api/tutor', {
      sessionId: session.sessionId,
      message: 'Tell me the answer',
      idempotencyKey: 'request-blocked-1',
    });
    expect(blocked.response.status).toBe(409);
    expect(blocked.body.error).toBe('independent_check_active');
  });
});

describe('R06 delayed review', () => {
  it('uses a distinct due item, records retention, and schedules the next review', () => {
    let state = createSession('review-session', demoLesson);
    state = markExplanationSeen(setStage(state, 'learn')!);
    state = setStage(state, 'practice')!;
    state = setStage(state, 'check')!;
    state = submitAttempt(
      state,
      demoLesson.check,
      'check',
      demoLesson.check.correctOptionId,
      new Date('2026-09-01T23:59:59Z'),
    ).state;
    state = setStage(state, 'summary')!;

    expect(startReview(state, demoLesson, new Date('2026-09-07T23:59:59Z'))).toBeUndefined();
    const review = startReview(state, demoLesson, new Date('2026-09-08T00:00:00Z'))!;
    expect(review.activeReviewId).toBe('q-review-1');
    expect([demoLesson.check, ...demoLesson.checkBank].map((q) => q.id)).not.toContain(review.activeReviewId);

    const answered = submitAttempt(
      review,
      demoLesson.reviewBank[0]!,
      'review',
      demoLesson.reviewBank[0]!.correctOptionId,
      new Date('2026-09-08T10:00:00Z'),
    ).state;
    const evidence = projectLearningEvidence(answered, demoLesson);
    expect(evidence.state).toBe('retained-on-review');
    expect(evidence.nextReviewDue).toBe('2026-09-22');
    expect(submitAttempt(
      answered,
      demoLesson.reviewBank[0]!,
      'review',
      demoLesson.reviewBank[0]!.correctOptionId,
      new Date('2026-09-09T10:00:00Z'),
    ).state.attempts).toHaveLength(2);
  });
});

describe('R07/R08 operations', () => {
  const uploadsEnv = { RAWI_TUTOR_MODE: 'fixture', RAWI_UPLOADS_ENABLED: 'true' };

  it('bounds and deduplicates pasted text, refuses PDF, and deletes ownership-scoped source', async () => {
    const first = await post('/api/sources/pasted-text', {
      title: 'My notes', text: 'Demand changes when a determinant changes.', permissionAcknowledged: true,
    }, uploadsEnv);
    expect(first.response.status).toBe(201);
    const duplicate = await post('/api/sources/pasted-text', {
      title: 'Copy', text: 'Demand changes when a determinant changes.', permissionAcknowledged: true,
    }, uploadsEnv);
    expect(duplicate.response.status).toBe(200);
    expect(duplicate.body.duplicate).toBe(true);
    expect((await request('/api/sources', undefined, uploadsEnv)).body.sources).toHaveLength(1);
    const preview = await request(`/api/sources/${first.body.source.id}/preview`, undefined, uploadsEnv);
    expect(preview.body.text).toBe('Demand changes when a determinant changes.');
    expect((await post('/api/sources/pdf', {}, uploadsEnv)).response.status).toBe(415);
    const deleted = await request(`/api/sources/${first.body.source.id}`, { method: 'DELETE' }, uploadsEnv);
    expect(deleted.body.deleted).toBe(true);
  });

  it('reports issues, exports learner data, requires delete confirmation, and protects founder data', async () => {
    const session = (await post('/api/sessions')).body as SessionView;
    expect((await post('/api/issues', {
      sessionId: session.sessionId, category: 'technical', description: 'A test issue',
    })).response.status).toBe(201);
    const exported = await request('/api/account/export');
    expect(exported.body.synthetic).toBe(true);
    expect(exported.body.issues).toHaveLength(1);
    expect((await request('/api/founder/metrics')).response.status).toBe(403);
    const metrics = await request('/api/founder/metrics', {
      headers: { 'X-Rawi-Admin-Token': 'local-secret' },
    }, { RAWI_TUTOR_MODE: 'fixture', RAWI_LOCAL_ADMIN_TOKEN: 'local-secret' });
    expect(metrics.response.status).toBe(200);
    expect(metrics.body.synthetic).toBe(true);
    expect((await request('/api/account', { method: 'DELETE', body: '{}' })).response.status).toBe(400);
    expect((await request('/api/account', {
      method: 'DELETE', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ confirmation: 'DELETE' }),
    })).body.deleted).toBe(true);
  });
});
