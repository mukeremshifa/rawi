import { beforeEach, describe, expect, it, vi } from 'vitest';
import { demoLesson } from '../content/demo-lesson.js';
import type { SessionView } from '../shared/types.js';
import {
  createSession as createLearningSession,
  submitAttempt,
  type SessionState,
} from './learning.js';

vi.mock('./auth.js', () => ({
  extractBearerToken(header: string | null) {
    return header?.replace(/^Bearer\s+/i, '') ?? null;
  },
  async verifyJwt(token: string) {
    if (token === 'learner-a' || token === 'learner-b') {
      return { userId: token, email: `${token}@example.test` };
    }
    return null;
  },
}));

import app, { clearSessions } from './index.js';

interface StoredSession {
  id: string;
  user_id: string;
  lesson_id: string;
  state: SessionState;
  version: number;
  created_at: string;
  updated_at: string;
}

const configuredEnv = {
  RAWI_TUTOR_MODE: 'fixture',
  SUPABASE_URL: 'https://project.example',
  SUPABASE_ANON_KEY: 'sb_publishable_test',
  SUPABASE_SERVICE_KEY: 'sb_secret_test',
};

const stored = new Map<string, StoredSession>();
let createStatus = 201;
let updateStatus = 204;
let forceConflict = false;

function ownerFrom(url: URL): string | null {
  return url.searchParams.get('user_id')?.replace(/^eq\./, '') ?? null;
}

function idFrom(url: URL): string | null {
  return url.searchParams.get('id')?.replace(/^eq\./, '') ?? null;
}

function restFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const requestUrl = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  const url = new URL(requestUrl);

  if (url.pathname.endsWith('/invite_enrollments')) {
    return Promise.resolve(Response.json([{ id: 'enrollment' }]));
  }

  if (url.pathname.endsWith('/rpc/create_learning_session')) {
    if (createStatus !== 201) {
      return Promise.resolve(new Response('', { status: createStatus }));
    }
    const body = JSON.parse(String(init?.body)) as {
      p_id: string;
      p_user_id: string;
      p_lesson_id: string;
      p_state: SessionState;
      p_check_item_ids: string[];
    };
    const exposure = [...stored.values()]
      .filter(
        (row) =>
          row.user_id === body.p_user_id && row.lesson_id === body.p_lesson_id,
      )
      .flatMap((row) => row.state.exposedCheckIds)
      .filter((itemId) => body.p_check_item_ids.includes(itemId));
    const state = createLearningSession(body.p_id, demoLesson, exposure);
    const saved: StoredSession = {
      id: body.p_id,
      user_id: body.p_user_id,
      lesson_id: body.p_lesson_id,
      state,
      version: state.version,
      created_at: '2026-09-14T12:00:00.000Z',
      updated_at: '2026-09-14T12:00:00.000Z',
    };
    stored.set(saved.id, saved);
    return Promise.resolve(Response.json([saved], { status: 201 }));
  }

  if (!url.pathname.endsWith('/sessions')) {
    return Promise.resolve(new Response('not found', { status: 404 }));
  }

  const method = init?.method ?? 'GET';
  const owner = ownerFrom(url);
  const id = idFrom(url);
  if (method === 'PATCH') {
    if (updateStatus !== 204) {
      return Promise.resolve(new Response('', { status: updateStatus }));
    }
    const expectedVersion = Number(
      url.searchParams.get('version')?.replace(/^eq\./, ''),
    );
    const row = id ? stored.get(id) : undefined;
    if (forceConflict || !row || row.user_id !== owner || row.version !== expectedVersion) {
      return Promise.resolve(
        new Response(null, { status: 204, headers: { 'Content-Range': '*/0' } }),
      );
    }
    const body = JSON.parse(String(init?.body)) as {
      state: SessionState;
      version: number;
      lesson_id: string;
    };
    stored.set(row.id, {
      ...row,
      state: body.state,
      version: body.version,
      lesson_id: body.lesson_id,
      updated_at: '2026-09-14T12:01:00.000Z',
    });
    return Promise.resolve(
      new Response(null, { status: 204, headers: { 'Content-Range': '*/1' } }),
    );
  }

  const rows = [...stored.values()].filter(
    (row) => (!owner || row.user_id === owner) && (!id || row.id === id),
  );
  if (url.searchParams.get('select') === 'state') {
    return Promise.resolve(Response.json(rows.map((row) => ({ state: row.state }))));
  }
  return Promise.resolve(Response.json(rows));
}

async function call(
  learner: 'learner-a' | 'learner-b',
  path: string,
  init?: RequestInit,
): Promise<{ status: number; body: any }> {
  const headers = new Headers(init?.headers);
  headers.set('Authorization', `Bearer ${learner}`);
  if (init?.body) headers.set('Content-Type', 'application/json');
  const response = await app.fetch(
    new Request(`http://localhost${path}`, { ...init, headers }),
    configuredEnv,
  );
  return {
    status: response.status,
    body: await response.json().catch(() => undefined),
  };
}

function post(
  learner: 'learner-a' | 'learner-b',
  path: string,
  body?: unknown,
) {
  return call(learner, path, {
    method: 'POST',
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

beforeEach(() => {
  stored.clear();
  createStatus = 201;
  updateStatus = 204;
  forceConflict = false;
  clearSessions();
  vi.stubGlobal('fetch', vi.fn(restFetch));
});

describe('configured persistence authority', () => {
  it('fails closed when durable storage is selected without a service key', async () => {
    const response = await app.fetch(
      new Request('http://localhost/api/sessions', { method: 'POST' }),
      {
        RAWI_TUTOR_MODE: 'fixture',
        RAWI_STORAGE_MODE: 'supabase',
        SUPABASE_URL: configuredEnv.SUPABASE_URL,
        SUPABASE_ANON_KEY: configuredEnv.SUPABASE_ANON_KEY,
      },
    );
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: 'persistence_unavailable',
    });
  });

  it('does not let another authenticated owner mutate a known session ID', async () => {
    const created = await post('learner-a', '/api/sessions');
    const session = created.body as SessionView;

    const attack = await post(
      'learner-b',
      `/api/sessions/${session.sessionId}/stage`,
      { stage: 'learn' },
    );

    expect(attack).toEqual({ status: 404, body: { error: 'session_not_found' } });
    expect(stored.get(session.sessionId)?.state.stage).toBe('diagnose');
  });

  it('mutates an owned cold-cache session and resumes the confirmed save', async () => {
    const state = createLearningSession('cold-session', demoLesson);
    stored.set(state.sessionId, {
      id: state.sessionId,
      user_id: 'learner-a',
      lesson_id: state.lessonId,
      state,
      version: state.version,
      created_at: '2026-09-14T12:00:00.000Z',
      updated_at: '2026-09-14T12:00:00.000Z',
    });

    const changed = await post(
      'learner-a',
      '/api/sessions/cold-session/stage',
      { stage: 'learn', expectedStage: 'diagnose' },
    );
    expect(changed.status).toBe(200);
    expect((changed.body as SessionView).stage).toBe('learn');
    expect(stored.get('cold-session')?.version).toBe(2);

    clearSessions();
    const resumed = await call('learner-a', '/api/sessions/cold-session');
    expect(resumed.status).toBe(200);
    expect((resumed.body as SessionView).stage).toBe('learn');
  });

  it('returns a retryable conflict without claiming a rejected save succeeded', async () => {
    const created = await post('learner-a', '/api/sessions');
    const session = created.body as SessionView;
    forceConflict = true;

    const changed = await post(
      'learner-a',
      `/api/sessions/${session.sessionId}/stage`,
      { stage: 'learn' },
    );

    expect(changed).toEqual({ status: 409, body: { error: 'session_conflict' } });
    expect(stored.get(session.sessionId)?.state.stage).toBe('diagnose');
  });

  it('returns unavailable when creation or a required update cannot be saved', async () => {
    createStatus = 503;
    const create = await post('learner-a', '/api/sessions');
    expect(create).toEqual({
      status: 503,
      body: { error: 'persistence_unavailable' },
    });

    createStatus = 201;
    const created = await post('learner-a', '/api/sessions');
    const session = created.body as SessionView;
    updateStatus = 503;
    const update = await post(
      'learner-a',
      `/api/sessions/${session.sessionId}/stage`,
      { stage: 'learn' },
    );
    expect(update).toEqual({
      status: 503,
      body: { error: 'persistence_unavailable' },
    });
    expect(stored.get(session.sessionId)?.state.stage).toBe('diagnose');
  });

  it('carries authored check exposure into a newly created session', async () => {
    const prior = createLearningSession('prior-session', demoLesson);
    stored.set(prior.sessionId, {
      id: prior.sessionId,
      user_id: 'learner-a',
      lesson_id: prior.lessonId,
      state: prior,
      version: prior.version,
      created_at: '2026-09-14T12:00:00.000Z',
      updated_at: '2026-09-14T12:00:00.000Z',
    });

    const created = await post('learner-a', '/api/sessions');
    expect(created.status).toBe(201);
    expect((created.body as SessionView).activeCheckId).toBe(demoLesson.checkBank[0]?.id);
  });

  it('uses check-specific evidence in both session detail and list projections', async () => {
    const initial = createLearningSession('diagnostic-only', demoLesson);
    const diagnosticOnly = submitAttempt(
      initial,
      demoLesson.diagnostic,
      'diagnose',
      demoLesson.diagnostic.correctOptionId,
      new Date('2026-09-14T12:00:00.000Z'),
    ).state;
    stored.set(initial.sessionId, {
      id: initial.sessionId,
      user_id: 'learner-a',
      lesson_id: initial.lessonId,
      state: diagnosticOnly,
      version: diagnosticOnly.version,
      created_at: '2026-09-14T12:00:00.000Z',
      updated_at: '2026-09-14T12:00:00.000Z',
    });

    const detail = await call('learner-a', '/api/sessions/diagnostic-only');
    const list = await call('learner-a', '/api/sessions');
    expect((detail.body as SessionView).evidence.state).toBe('practicing');
    expect(list.body.sessions[0].evidenceState).toBe('practicing');
    expect(list.body.sessions[0].nextReviewDue).toBeUndefined();
  });
});
