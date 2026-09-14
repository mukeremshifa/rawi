/**
 * Rawi Worker API.
 *
 * R03 additions over R02B:
 *  - Env includes SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_KEY.
 *    When the URL and service key are present the Worker uses Supabase
 *    for auth and durable session storage. When the server settings are absent the Worker
 *    falls back to the in-memory fixture path so existing tests keep passing.
 *  - GET  /api/me          — returns authenticated user info or 401
 *  - GET  /api/sessions    — returns session list for the authenticated user
 *  - POST /api/sessions    — creates and durably stores a new session
 *  - GET  /api/sessions/:id — reads from Supabase (ownership-scoped) or memory
 *  - All mutating session routes persist the committed state to Supabase.
 *
 * Auth flow:
 *  1. Browser completes a Supabase Auth flow and receives an access token.
 *  2. JWT is sent in Authorization: Bearer <token>.
 *  3. verifyJwt() checks the signature against the project JWKS and extracts userId.
 *  4. Routes that create sessions additionally require an active enrollment row.
 *
 * Fixture storage mode:
 *  - Routes behave as they did in R01/R02: in-memory only, no auth.
 *  - It is selected explicitly, or only when no Supabase setting is present.
 *    A partially configured deployment fails closed instead of using memory.
 *
 * Storage orchestration:
 *  - Configured mutations read the owner-scoped row, apply one pure command,
 *    and await a confirmed version-guarded commit before returning success.
 *  - Configured mode never reads or writes the isolate-local session Map.
 */
import { Hono } from 'hono';
import { z } from 'zod';
import { demoLesson } from '../content/demo-lesson.js';
import {
  convertCheck,
  createSession as createLearningSession,
  markExplanationSeen,
  requestHint,
  revealAnswer,
  setStage,
  submitAttempt,
  type SessionState,
} from './learning.js';
import {
  clearSessions,
  applySessionUpdate,
  getSession as memGetSession,
  putSession,
  questionForStage,
  reject,
  toSessionView,
  updateSession as memUpdateSession,
  type UpdateOutcome,
} from './lesson-store.js';
import * as db from './db.js';
import { verifyJwt, extractBearerToken, type AuthenticatedUser } from './auth.js';
import type { Stage } from '../shared/types.js';
import type { Context } from 'hono';

export interface Env {
  /** Set to "fixture" in R01/R02. A real provider key is not read anywhere yet. */
  readonly RAWI_TUTOR_MODE?: string;
  /** "supabase" fails closed if any required durable setting is absent. */
  readonly RAWI_STORAGE_MODE?: 'fixture' | 'supabase';
  /** R03: Supabase project URL (safe to expose). */
  readonly SUPABASE_URL?: string;
  /** R03: Supabase anon/public key (safe to expose). */
  readonly SUPABASE_ANON_KEY?: string;
  /** R03: Supabase secret/service-role key. NEVER expose — server-only. */
  readonly SUPABASE_SERVICE_KEY?: string;
}

type HonoEnv = { Bindings: Env; Variables: { user?: AuthenticatedUser } };

const app = new Hono<HonoEnv>();

// ─── Schema ───────────────────────────────────────────────────────────────────

const stageSchema = z.enum([
  'diagnose',
  'learn',
  'practice',
  'check',
  'summary',
]);

const submitSchema = z.object({
  stage: stageSchema,
  optionId: z.string().min(1).max(64),
  /**
   * R02B: item identity for the check stage. When present, the server rejects
   * the request if the active check item has been replaced since the client
   * built this request, even if the stage name still matches.
   * R03: required when stage is 'check'.
   */
  itemId: z.string().min(1).max(64).optional(),
  /** Optional learner reasoning. Stored nowhere in R01; length-capped anyway. */
  explanation: z.string().max(2000).optional(),
});

const hintSchema = z.object({
  stage: stageSchema,
  /** R02B/R03: item identity guard. Required when stage is 'check'. */
  itemId: z.string().min(1).max(64).optional(),
});

const stageCommandSchema = z.object({
  stage: stageSchema,
  /**
   * R03 stale-navigation guard. If supplied, the server rejects the request
   * when the session's current stage does not match this value. A delayed
   * navigate-back-to-learn built against a practice view is rejected when the
   * session has since advanced to check, even though check→learn might
   * otherwise be legal from the new stage.
   */
  expectedStage: stageSchema.optional(),
});

const convertSchema = z.object({
  /**
   * The item ID the client is converting. Must equal state.activeCheckId.
   * Supplying the ID makes this an idempotent, item-specific command: if the
   * active item has already been replaced, a delayed retry does not convert
   * the new one.
   */
  itemId: z.string().min(1).max(64),
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** True when the server-side Supabase connection is configured. */
function dbConfig(env: Env): db.DbConfig | null {
  if (env.SUPABASE_URL && env.SUPABASE_SERVICE_KEY) {
    return { supabaseUrl: env.SUPABASE_URL, serviceKey: env.SUPABASE_SERVICE_KEY };
  }
  return null;
}

function configuredStorage(env: Env): boolean {
  if (env.RAWI_STORAGE_MODE) return env.RAWI_STORAGE_MODE === 'supabase';
  return Boolean(
    env.SUPABASE_URL || env.SUPABASE_ANON_KEY || env.SUPABASE_SERVICE_KEY,
  );
}

/**
 * Verify the request's JWT and return the authenticated user, or null.
 * Does not reject — callers decide whether auth is required.
 */
async function authenticateRequest(c: Context<HonoEnv>): Promise<AuthenticatedUser | null> {
  const existing = c.get('user');
  if (existing) return existing;

  const token = extractBearerToken(c.req.header('Authorization') ?? null);
  if (!token) return null;
  const user = await verifyJwt(token, c.env?.SUPABASE_URL);
  if (user) c.set('user', user);
  return user;
}

// ─── Routes ───────────────────────────────────────────────────────────────────

/** Health check, and a clear statement of what this build is. */
app.get('/api/health', (c) =>
  c.json({
    ok: true,
    fixtureData: true,
    tutorMode: c.env?.RAWI_TUTOR_MODE ?? 'fixture',
    dbConfigured: Boolean(dbConfig(c.env ?? {})),
  }),
);

/** Public browser configuration. The privileged service key is never projected. */
app.get('/api/auth/config', (c) => {
  const config = dbConfig(c.env ?? {});
  return c.json({
    configured: configuredStorage(c.env ?? {}),
    serverReady: Boolean(config),
    supabaseUrl: c.env?.SUPABASE_URL ?? null,
    supabaseAnonKey: c.env?.SUPABASE_ANON_KEY ?? null,
  });
});

/**
 * Authenticated user info. Returns 401 when no valid JWT is provided.
 * The browser uses this to show a login/logout state.
 */
app.get('/api/me', async (c) => {
  const user = await authenticateRequest(c);
  if (!user) return c.json({ error: 'unauthenticated' }, 401);

  const config = dbConfig(c.env ?? {});
  if (!config && configuredStorage(c.env ?? {})) return unavailable(c);
  const enrollment = config
    ? await db.isEnrolled(config, user.userId)
    : { ok: true as const, value: false };
  if (!enrollment.ok) return unavailable(c);

  return c.json({
    userId: user.userId,
    email: user.email,
    enrolled: enrollment.value,
  });
});

/**
 * List sessions for the authenticated user.
 * Returns a lightweight summary for the resume/Continue UI.
 * Fixture mode returns an empty durable-session list.
 */
app.get('/api/sessions', async (c) => {
  const config = dbConfig(c.env ?? {});
  if (!config) {
    return configuredStorage(c.env ?? {})
      ? unavailable(c)
      : c.json({ sessions: [] });
  }

  const user = await authenticateRequest(c);
  if (!user) return c.json({ error: 'unauthenticated' }, 401);

  const sessions = await db.listSessions(config, user.userId, demoLesson);
  if (!sessions.ok) return unavailable(c);
  return c.json({ sessions: sessions.value });
});

/**
 * Start a lesson. Returns a fresh session with the diagnostic question.
 *
 * R03: when DB is configured and the user is authenticated and enrolled,
 * the new session is persisted to Supabase. In fixture/fallback mode the
 * session lives in Worker memory only.
 */
app.post('/api/sessions', async (c) => {
  const config = dbConfig(c.env ?? {});
  if (!config && configuredStorage(c.env ?? {})) return unavailable(c);
  let user: AuthenticatedUser | null = null;
  if (config) {
    user = await authenticateRequest(c);
    if (!user) return c.json({ error: 'unauthenticated' }, 401);
    const enrollment = await db.isEnrolled(config, user.userId);
    if (!enrollment.ok) return unavailable(c);
    if (!enrollment.value) {
      return c.json({ error: 'not_enrolled' }, 403);
    }
  }

  const sessionId = crypto.randomUUID();
  let state = createLearningSession(sessionId, demoLesson);

  if (config && user) {
    const checkItemIds = [demoLesson.check, ...demoLesson.checkBank].map(
      (item) => item.id,
    );
    const created = await db.createSession(
      config,
      user.userId,
      state,
      checkItemIds,
    );
    if (!created.ok) {
      return created.reason === 'conflict'
        ? c.json({ error: 'session_conflict' }, 409)
        : unavailable(c);
    }
    state = created.value;
  } else {
    putSession(state);
  }

  return c.json(toSessionView(state, demoLesson), 201);
});

/**
 * Re-read a session. A refresh takes this path, and assistance survives it.
 *
 * R03: in durable mode, reads only from Supabase (so another device or a new
 * isolate can resume). Explicit fixture mode uses the in-memory store.
 */
app.get('/api/sessions/:id', async (c) => {
  const sessionId = c.req.param('id');
  const config = dbConfig(c.env ?? {});

  if (!config && configuredStorage(c.env ?? {})) return unavailable(c);

  if (config) {
    const user = await authenticateRequest(c);
    if (!user) return c.json({ error: 'unauthenticated' }, 401);
    const loaded = await db.getSession(config, user.userId, sessionId);
    if (!loaded.ok) return unavailable(c);
    if (loaded.value) {
      return c.json(toSessionView(loaded.value, demoLesson));
    }
    // Authenticated, but the session was not found under this user ID.
    return c.json({ error: 'session_not_found' }, 404);
  }

  // Fallback: in-memory only when durable mode is not configured.
  const state = memGetSession(sessionId);
  if (!state) return c.json({ error: 'session_not_found' }, 404);
  return c.json(toSessionView(state, demoLesson));
});

/** Move to a named stage. Stage changes never reset assistance. */
app.post('/api/sessions/:id/stage', async (c) => {
  const parsed = stageCommandSchema.safeParse(await safeJson(c.req.raw));
  if (!parsed.success) return c.json({ error: 'invalid_stage' }, 400);
  const { stage: target, expectedStage } = parsed.data;

  const outcome = await updateSessionForRequest(c, (state) => {
    // Invariant 5 + R03 stale-navigation guard: an illegal jump or a stale
    // command built against an old view is refused.
    const moved = setStage(state, target as Stage, expectedStage as Stage | undefined);
    if (!moved) reject('stage_transition_not_allowed', 409);
    return target === 'learn' ? markExplanationSeen(moved) : moved;
  });

  if (outcome instanceof Response) return outcome;
  return respond(c, outcome);
});

/** Ask for the next hint. Raises assistance for that question, permanently. */
app.post('/api/sessions/:id/hint', async (c) => {
  const parsed = hintSchema.safeParse(await safeJson(c.req.raw));
  if (!parsed.success) return c.json({ error: 'invalid_request' }, 400);
  const { stage, itemId } = parsed.data;

  const outcome = await updateSessionForRequest(c, (state) => {
    const question = activeQuestion(state, stage as Stage, itemId);
    return requestHint(state, question).state;
  });

  if (outcome instanceof Response) return outcome;
  return respond(c, outcome);
});

/** Reveal the answer. Permanently marks the question as assisted. */
app.post('/api/sessions/:id/reveal', async (c) => {
  const parsed = hintSchema.safeParse(await safeJson(c.req.raw));
  if (!parsed.success) return c.json({ error: 'invalid_request' }, 400);
  const { stage, itemId } = parsed.data;

  const outcome = await updateSessionForRequest(c, (state) => {
    const question = activeQuestion(state, stage as Stage, itemId);
    return revealAnswer(state, question);
  });

  if (outcome instanceof Response) return outcome;
  return respond(c, outcome);
});

/** Grade a submission. Idempotent per question. */
app.post('/api/sessions/:id/attempt', async (c) => {
  const parsed = submitSchema.safeParse(await safeJson(c.req.raw));
  if (!parsed.success) return c.json({ error: 'invalid_request' }, 400);
  const { stage, optionId, itemId } = parsed.data;
  // The clock is read once, before the command, so the recorded time does not
  // depend on how long the critical section took.
  const now = new Date();

  const outcome = await updateSessionForRequest(c, (state) => {
    const question = activeQuestion(state, stage as Stage, itemId);

    // Validate the option ID against the authored allowlist rather than
    // trusting whatever the client sent. A bogus ID is a bad request, not a
    // wrong answer.
    if (!question.options.some((o) => o.id === optionId)) {
      reject('unknown_option');
    }

    return submitAttempt(state, question, stage as Stage, optionId, now).state;
  });

  if (outcome instanceof Response) return outcome;
  return respond(c, outcome);
});

/**
 * Convert the active check item to help/practice.
 *
 * R02B. The body must carry the item ID the client is converting. The server
 * selects the next unexposed bank item atomically. If the item has already been
 * converted (same ID, assistance = 'revealed'), the request is idempotent and
 * returns 200 with the current state. If the item ID does not match the active
 * check (stale request against a replaced item), returns 409. If the bank is
 * already exhausted (all items have been converted), returns 409.
 *
 * R03 teach-before-check: after converting, the session moves to 'learn' so
 * the learner re-reads the explanation before the fresh check item is presented.
 * This fixes the probe gap where help was granted without a teaching step.
 */
app.post('/api/sessions/:id/convert', async (c) => {
  const parsed = convertSchema.safeParse(await safeJson(c.req.raw));
  if (!parsed.success) return c.json({ error: 'invalid_request' }, 400);
  const { itemId } = parsed.data;

  const outcome = await updateSessionForRequest(c, (state) => {
    if (state.stage !== 'check') {
      reject('not_at_check_stage', 409);
    }
    if (state.activeCheckId !== itemId) {
      // Stale: the active item has already been replaced. The client should
      // reload and show the replacement.
      reject('item_replaced', 409);
    }

    // If the active item is already converted (assistance = 'revealed') and
    // the bank is exhausted, reject — there is nothing new to offer.
    const activeQState =
      state.questions[itemId] ?? { assistance: 'none', submitted: false };
    if (activeQState.assistance === 'revealed' && !activeQState.submitted) {
      reject('check_bank_exhausted', 409);
    }

    const converted = convertCheck(state, demoLesson, itemId);

    // R03 teach-before-check: transition to learn so the learner sees the
    // explanation before the replacement item. markExplanationSeen ensures
    // the explanation content is included in the projected view.
    const withTeach = setStage(converted, 'learn');
    if (!withTeach) {
      // This branch should not be reachable since check→learn is now in
      // ALLOWED_TRANSITIONS; return converted state if somehow it is.
      return converted;
    }
    return markExplanationSeen(withTeach);
  });

  if (outcome instanceof Response) return outcome;
  return respond(c, outcome);
});

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Resolve the question a command may act on.
 *
 * Three separate guards, all evaluated inside the critical section:
 *  - the client's stage must be the stage the session is actually on;
 *  - that stage must actually carry a question;
 *  - R02B: when itemId is supplied and the stage is 'check', the item ID must
 *    match state.activeCheckId, so a delayed request against a replaced item is
 *    rejected even though both items share the same stage name.
 *  - R03: itemId is REQUIRED for check-stage commands. Omitting it on a check
 *    command returns 400. This prevents ambiguous commands that cannot prove
 *    they are targeting the current item.
 */
function activeQuestion(state: SessionState, stage: Stage, itemId?: string) {
  if (state.stage !== stage) reject('stage_not_active', 409);
  const question = questionForStage(demoLesson, stage, state);
  if (!question) reject('no_question_at_stage');

  // R03: itemId is required at the check stage.
  if (stage === 'check' && itemId === undefined) {
    reject('item_id_required');
  }

  // R02B item-identity guard for the check stage.
  if (stage === 'check' && itemId !== undefined && question.id !== itemId) {
    reject('item_replaced', 409);
  }

  return question;
}

/** Read, apply and conditionally commit one owner-scoped mutation. */
async function updateSessionForRequest(
  c: Context<HonoEnv>,
  apply: (state: SessionState) => SessionState,
): Promise<UpdateOutcome | Response> {
  const config = dbConfig(c.env ?? {});
  const sessionId = c.req.param('id');
  if (!sessionId) return c.json({ error: 'session_not_found' }, 404);
  if (!config) {
    return configuredStorage(c.env ?? {})
      ? unavailable(c)
      : memUpdateSession(sessionId, apply);
  }

  const user = await authenticateRequest(c);
  if (!user) return c.json({ error: 'unauthenticated' }, 401);

  const loaded = await db.getSession(config, user.userId, sessionId);
  if (!loaded.ok) return unavailable(c);
  if (!loaded.value) return c.json({ error: 'session_not_found' }, 404);

  const current = loaded.value;
  const outcome = applySessionUpdate(current, apply);
  if (!outcome.ok) return outcome;

  const saved = await db.updateSession(
    config,
    user.userId,
    outcome.state,
    current.version,
  );
  if (!saved.ok) {
    return saved.reason === 'conflict'
      ? c.json({ error: 'session_conflict' }, 409)
      : unavailable(c);
  }

  return outcome;
}

function unavailable(c: Context<HonoEnv>) {
  return c.json({ error: 'persistence_unavailable' }, 503);
}

/** Turn an atomic update outcome into the HTTP response. */
function respond(c: Context<HonoEnv>, outcome: UpdateOutcome) {
  if (outcome.ok) return c.json(toSessionView(outcome.state, demoLesson));
  if (outcome.failure.kind === 'not-found') {
    return c.json({ error: 'session_not_found' }, 404);
  }
  const { error, status } = outcome.failure.reason;
  return c.json({ error }, status);
}

async function safeJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return undefined;
  }
}

export { app, clearSessions };
export default app;
