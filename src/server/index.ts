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
  startReview,
  submitAttempt,
  type SessionState,
} from './learning.js';
import {
  clearSessions,
  applySessionUpdate,
  getSession as memGetSession,
  listMemorySessions,
  putSession,
  projectLearningEvidence,
  questionForStage,
  reject,
  toSessionView,
  updateSession as memUpdateSession,
  type UpdateOutcome,
} from './lesson-store.js';
import * as db from './db.js';
import { verifyJwt, extractBearerToken, type AuthenticatedUser } from './auth.js';
import type { Stage } from '../shared/types.js';
import { MemoryAiBudget } from './ai-budget.js';
import {
  DEFAULT_MODEL,
  MAX_LEARNER_CHARS,
  PROMPT_VERSION,
  TutorError,
  conservativeReservationMicros,
  tutor,
  type TutorConfig,
} from './tutor.js';
import {
  addFixtureIssue,
  addFixtureSource,
  clearFixtureOperations,
  deleteFixtureOperations,
  deleteFixtureSource,
  getFixtureSource,
  listFixtureIssues,
  listFixtureSources,
} from './operations-store.js';
import type { Context } from 'hono';

/** Generated bindings plus optional secrets/operator settings not committed to config. */
export type RawiEnv = Partial<Omit<Env, 'RAWI_STORAGE_MODE' | 'RAWI_UPLOADS_ENABLED'>> & {
  readonly RAWI_STORAGE_MODE?: 'fixture' | 'supabase';
  readonly RAWI_UPLOADS_ENABLED?: string;
  readonly OPENAI_API_KEY?: string;
  readonly RAWI_AI_GLOBAL_MONTHLY_CAP_USD?: string;
  readonly RAWI_AI_LEARNER_MONTHLY_CAP_USD?: string;
  readonly RAWI_OPERATOR_NAME?: string;
  readonly RAWI_OPERATOR_CONTACT?: string;
  readonly RAWI_FOUNDER_USER_IDS?: string;
  readonly RAWI_LOCAL_ADMIN_TOKEN?: string;
};

type HonoEnv = { Bindings: RawiEnv; Variables: { user?: AuthenticatedUser } };

const app = new Hono<HonoEnv>();

// ─── Schema ───────────────────────────────────────────────────────────────────

const stageSchema = z.enum([
  'diagnose',
  'learn',
  'practice',
  'check',
  'review',
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

const tutorSchema = z.object({
  sessionId: z.string().min(1).max(120),
  message: z.string().trim().min(1).max(MAX_LEARNER_CHARS),
  idempotencyKey: z.string().min(8).max(120),
  sourceIds: z.array(z.string().min(1).max(120)).max(3).optional(),
}).strict();

const pastedSourceSchema = z.object({
  title: z.string().trim().min(1).max(120),
  text: z.string().trim().min(1).max(50_000),
  permissionAcknowledged: z.literal(true),
}).strict();

const issueSchema = z.object({
  sessionId: z.string().min(1).max(120).optional(),
  category: z.enum(['content', 'technical', 'privacy', 'other']),
  description: z.string().trim().min(1).max(2_000),
}).strict();

const deleteDataSchema = z.object({ confirmation: z.literal('DELETE') }).strict();
const enrollmentSchema = z.object({
  userId: z.string().uuid(),
  status: z.enum(['enrolled', 'suspended']),
  adultEligibilityConfirmed: z.boolean(),
}).strict();
const retentionSchema = z.object({
  action: z.enum(['preview', 'purge']),
  confirmation: z.literal('PURGE').optional(),
}).strict();

const fixtureBudget = new MemoryAiBudget();

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** True when the server-side Supabase connection is configured. */
function dbConfig(env: RawiEnv): db.DbConfig | null {
  if (env.RAWI_STORAGE_MODE === 'fixture') return null;
  if (env.SUPABASE_URL && env.SUPABASE_SERVICE_KEY) {
    return { supabaseUrl: env.SUPABASE_URL, serviceKey: env.SUPABASE_SERVICE_KEY };
  }
  return null;
}

function configuredStorage(env: RawiEnv): boolean {
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

app.get('/api/course', (c) =>
  c.json({
    id: demoLesson.id,
    title: demoLesson.title,
    objective: demoLesson.objective,
    curriculumVersion: demoLesson.curriculumVersion,
    reviewerStatus: demoLesson.reviewerStatus,
    concepts: [demoLesson.conceptName],
    sources: demoLesson.sources,
  }),
);

app.get('/api/privacy', (c) => {
  const retentionDays = parsePositiveInteger(c.env?.RAWI_RETENTION_DAYS, 30, 365);
  return c.json({
    audience: 'Invitation-only UAE adult college pilot (18–24)',
    eligibility: 'You must be at least 18 and explicitly enrolled by the pilot operator.',
    operatorName: c.env?.RAWI_OPERATOR_NAME ?? null,
    operatorContact: c.env?.RAWI_OPERATOR_CONTACT ?? null,
    retentionDays,
    uploadsEnabled: c.env?.RAWI_UPLOADS_ENABLED === 'true',
    pdfUploadsEnabled: false,
    legalReviewComplete: false,
  });
});

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
      : c.json({
          sessions: listMemorySessions()
            .map((state) => {
              const evidence = projectLearningEvidence(state, demoLesson);
              return {
                sessionId: state.sessionId,
                lessonId: state.lessonId,
                version: state.version,
                updatedAt: state.attempts.at(-1)?.at ?? '1970-01-01T00:00:00.000Z',
                evidenceState: evidence.state,
                nextReviewDue: evidence.nextReviewDue,
                reviewAvailable: Boolean(
                  evidence.nextReviewDue &&
                  evidence.nextReviewDue <= new Date().toISOString().slice(0, 10) &&
                  state.exposedReviewIds.length < demoLesson.reviewBank.length,
                ),
              };
            })
            .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)),
        });
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

/** Start a due delayed review with a never-before-exposed review-bank item. */
app.post('/api/sessions/:id/review', async (c) => {
  const nowHeader = c.req.header('X-Rawi-Test-Now');
  const now = nowHeader && c.env?.RAWI_TUTOR_MODE === 'fixture'
    ? new Date(nowHeader)
    : new Date();
  if (Number.isNaN(now.getTime())) return c.json({ error: 'invalid_clock' }, 400);

  const outcome = await updateSessionForRequest(c, (state) => {
    const next = startReview(state, demoLesson, now);
    if (!next) {
      const exhausted = state.exposedReviewIds.length >= demoLesson.reviewBank.length;
      reject(exhausted ? 'review_bank_exhausted' : 'review_not_due', 409);
    }
    return next;
  });
  if (outcome instanceof Response) return outcome;
  return respond(c, outcome);
});

/** Bounded course-grounded tutor. It cannot mutate learning evidence. */
app.post('/api/tutor', async (c) => {
  const parsed = tutorSchema.safeParse(await safeJson(c.req.raw));
  if (!parsed.success) return c.json({ error: 'invalid_request' }, 400);

  const loaded = await loadSessionForRequest(c, parsed.data.sessionId);
  if (loaded instanceof Response) return loaded;
  const { state, userId, config: database } = loaded;
  if (state.stage === 'check' || state.stage === 'review') {
    const activeId = state.stage === 'check' ? state.activeCheckId : state.activeReviewId;
    if (activeId && !state.questions[activeId]?.submitted) {
      return c.json({ error: 'independent_check_active' }, 409);
    }
  }

  const tutorConfig = readTutorConfig(c.env ?? {});
  if (!tutorConfig) {
    return c.json({
      error: 'tutor_disabled',
      fallback: demoLesson.explanation,
    }, 503);
  }

  const callInput = {
    requestId: parsed.data.idempotencyKey,
    learnerId: userId,
    message: parsed.data.message,
    requestedSourceIds: parsed.data.sourceIds,
    lesson: demoLesson,
  };

  if (tutorConfig.mode === 'fixture') {
    return c.json((await tutor(tutorConfig, callInput)).reply);
  }

  if (!database) {
    return c.json({ error: 'tutor_requires_durable_budget' }, 503);
  }
  const globalCap = usdCapMicros(c.env?.RAWI_AI_GLOBAL_MONTHLY_CAP_USD);
  const learnerCap = usdCapMicros(c.env?.RAWI_AI_LEARNER_MONTHLY_CAP_USD);
  if (!globalCap || !learnerCap) {
    return c.json({ error: 'tutor_disabled' }, 503);
  }

  const reservation = await db.reserveAiUsage(database, {
    userId,
    idempotencyKey: parsed.data.idempotencyKey,
    provider: 'openai',
    model: tutorConfig.model,
    promptVersion: PROMPT_VERSION,
    curriculumVersion: demoLesson.curriculumVersion,
    amountMicrosUsd: conservativeReservationMicros(tutorConfig),
    globalCapMicrosUsd: globalCap,
    learnerCapMicrosUsd: learnerCap,
  });
  if (!reservation.ok) return unavailable(c);
  if (!reservation.value.ok) {
    const status = reservation.value.reason === 'in_progress' ? 409 : 429;
    return c.json({ error: reservation.value.reason }, status);
  }
  if (reservation.value.replay) {
    return c.json(reservation.value.reservation.response);
  }

  try {
    const result = await tutor(tutorConfig, callInput);
    const settled = await db.settleAiUsage(database, {
      userId,
      reservationId: reservation.value.reservation.id,
      status: 'settled',
      actualMicrosUsd: result.actualCostMicrosUsd,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      response: result.reply,
    });
    if (!settled.ok) return unavailable(c);
    return c.json(result.reply);
  } catch (error) {
    const tutorError = error instanceof TutorError
      ? error
      : new TutorError('provider_unavailable', true);
    await db.settleAiUsage(database, {
      userId,
      reservationId: reservation.value.reservation.id,
      status: 'ambiguous',
      failureCategory: tutorError.code,
    });
    const status = tutorError.code === 'provider_timeout' ? 504 : 502;
    return c.json({
      error: tutorError.code,
      fallback: demoLesson.explanation,
    }, status);
  }
});

app.get('/api/sources', async (c) => {
  const learner = await learnerForRequest(c);
  if (learner instanceof Response) return learner;
  if (!learner.config) return c.json({ sources: listFixtureSources(learner.userId) });
  const listed = await db.listLearnerSources(learner.config, learner.userId);
  return listed.ok ? c.json({ sources: listed.value }) : unavailable(c);
});

/** Pasted-text ingestion. Disabled unless the readiness flag is explicit. */
app.post('/api/sources/pasted-text', async (c) => {
  if (c.env?.RAWI_UPLOADS_ENABLED !== 'true') {
    return c.json({ error: 'uploads_disabled' }, 403);
  }
  const parsed = pastedSourceSchema.safeParse(await safeJson(c.req.raw));
  if (!parsed.success) return c.json({ error: 'invalid_source' }, 400);
  const learner = await learnerForRequest(c);
  if (learner instanceof Response) return learner;
  const sha256 = await sha256Hex(parsed.data.text);
  if (!learner.config) {
    const result = addFixtureSource({
      id: crypto.randomUUID(),
      userId: learner.userId,
      title: parsed.data.title,
      kind: 'pasted-text',
      status: 'ready',
      chars: parsed.data.text.length,
      sha256,
      createdAt: new Date().toISOString(),
      extractedText: parsed.data.text,
    });
    return c.json(result, result.duplicate ? 200 : 201);
  }
  const created = await db.createLearnerSource(learner.config, {
    userId: learner.userId,
    title: parsed.data.title,
    text: parsed.data.text,
    sha256,
  });
  if (!created.ok) {
    return created.reason === 'conflict'
      ? c.json({ error: 'source_conflict' }, 409)
      : unavailable(c);
  }
  return c.json(created.value, created.value.duplicate ? 200 : 201);
});

app.get('/api/sources/:id/preview', async (c) => {
  const learner = await learnerForRequest(c);
  if (learner instanceof Response) return learner;
  if (!learner.config) {
    const source = getFixtureSource(learner.userId, c.req.param('id'));
    return source
      ? c.json(source)
      : c.json({ error: 'source_not_found' }, 404);
  }
  const source = await db.getLearnerSource(
    learner.config,
    learner.userId,
    c.req.param('id'),
  );
  if (!source.ok) return unavailable(c);
  return source.value
    ? c.json(source.value)
    : c.json({ error: 'source_not_found' }, 404);
});

/** PDF extraction is deliberately unavailable until it fits the free Worker CPU budget. */
app.post('/api/sources/pdf', (c) => c.json({
  error: 'pdf_processing_unavailable',
  limits: { maxBytes: 2_000_000, maxPages: 20, textBasedOnly: true },
}, 415));

app.delete('/api/sources/:id', async (c) => {
  const learner = await learnerForRequest(c);
  if (learner instanceof Response) return learner;
  if (!learner.config) {
    return deleteFixtureSource(learner.userId, c.req.param('id'))
      ? c.json({ deleted: true })
      : c.json({ error: 'source_not_found' }, 404);
  }
  const deleted = await db.deleteLearnerSource(
    learner.config,
    learner.userId,
    c.req.param('id'),
  );
  if (!deleted.ok) return unavailable(c);
  return deleted.value
    ? c.json({ deleted: true })
    : c.json({ error: 'source_not_found' }, 404);
});

app.post('/api/issues', async (c) => {
  const parsed = issueSchema.safeParse(await safeJson(c.req.raw));
  if (!parsed.success) return c.json({ error: 'invalid_issue' }, 400);
  const learner = await learnerForRequest(c);
  if (learner instanceof Response) return learner;
  if (parsed.data.sessionId) {
    const owned = await loadSessionForRequest(c, parsed.data.sessionId);
    if (owned instanceof Response) return owned;
  }
  if (!learner.config) {
    const id = crypto.randomUUID();
    addFixtureIssue({
      id,
      userId: learner.userId,
      sessionId: parsed.data.sessionId,
      category: parsed.data.category,
      description: parsed.data.description,
      status: 'open',
      createdAt: new Date().toISOString(),
    });
    return c.json({ id }, 201);
  }
  const created = await db.createIssue(learner.config, {
    userId: learner.userId,
    sessionId: parsed.data.sessionId,
    category: parsed.data.category,
    description: parsed.data.description,
  });
  return created.ok ? c.json(created.value, 201) : unavailable(c);
});

app.get('/api/account/export', async (c) => {
  const learner = await learnerForRequest(c);
  if (learner instanceof Response) return learner;
  if (!learner.config) {
    return c.json({
      exportedAt: new Date().toISOString(),
      userId: learner.userId,
      synthetic: true,
      sessions: listMemorySessions(),
      sources: listFixtureSources(learner.userId),
      issues: listFixtureIssues(learner.userId),
      aiUsage: [],
    });
  }
  const exported = await db.exportLearnerData(learner.config, learner.userId);
  return exported.ok ? c.json(exported.value) : unavailable(c);
});

app.delete('/api/account', async (c) => {
  const parsed = deleteDataSchema.safeParse(await safeJson(c.req.raw));
  if (!parsed.success) return c.json({ error: 'confirmation_required' }, 400);
  const learner = await learnerForRequest(c);
  if (learner instanceof Response) return learner;
  if (!learner.config) {
    clearSessions();
    deleteFixtureOperations(learner.userId);
    return c.json({ deleted: true, synthetic: true });
  }
  const deleted = await db.deleteLearnerData(learner.config, learner.userId);
  return deleted.ok ? c.json({ deleted: true, counts: deleted.value }) : unavailable(c);
});

app.get('/api/founder/metrics', async (c) => {
  const founder = await authorizeFounder(c);
  if (!founder) return c.json({ error: 'forbidden' }, 403);
  const config = dbConfig(c.env ?? {});
  if (!config) {
    const sessions = listMemorySessions();
    const learnerIds = sessions.length > 0 ? 1 : 0;
    return c.json({
      synthetic: true,
      enrolled: learnerIds,
      activated: learnerIds,
      completed: sessions.some((session) => session.stage === 'summary') ? 1 : 0,
      returned: sessions.some((session) => session.attempts.some((a) => a.stage === 'review')) ? 1 : 0,
      delayedEligible: sessions.some((session) => session.attempts.some((a) => a.stage === 'check' && a.countsAsIndependent)) ? 1 : 0,
      delayedRetained: sessions.some((session) => session.attempts.some((a) => a.stage === 'review' && a.countsAsIndependent)) ? 1 : 0,
      aiCalls: 0,
      aiCostUsd: 0,
      issuesOpen: listFixtureIssues('fixture-learner').length,
    });
  }
  const metrics = await db.founderMetrics(config);
  return metrics.ok ? c.json(metrics.value) : unavailable(c);
});

app.post('/api/founder/enrollments', async (c) => {
  if (!(await authorizeFounder(c))) return c.json({ error: 'forbidden' }, 403);
  const parsed = enrollmentSchema.safeParse(await safeJson(c.req.raw));
  if (!parsed.success) return c.json({ error: 'invalid_enrollment' }, 400);
  if (parsed.data.status === 'enrolled' && !parsed.data.adultEligibilityConfirmed) {
    return c.json({ error: 'adult_confirmation_required' }, 400);
  }
  const config = dbConfig(c.env ?? {});
  if (!config) return c.json({ error: 'persistence_unavailable' }, 503);
  const saved = await db.setEnrollment(config, {
    userId: parsed.data.userId,
    status: parsed.data.status,
    adultConfirmed: parsed.data.adultEligibilityConfirmed,
  });
  return saved.ok ? c.json({ saved: true }) : unavailable(c);
});

app.post('/api/founder/retention', async (c) => {
  if (!(await authorizeFounder(c))) return c.json({ error: 'forbidden' }, 403);
  const parsed = retentionSchema.safeParse(await safeJson(c.req.raw));
  if (!parsed.success) return c.json({ error: 'invalid_request' }, 400);
  if (parsed.data.action === 'purge' && parsed.data.confirmation !== 'PURGE') {
    return c.json({ error: 'confirmation_required' }, 400);
  }
  const config = dbConfig(c.env ?? {});
  if (!config) return c.json({ error: 'persistence_unavailable' }, 503);
  const days = parsePositiveInteger(c.env?.RAWI_RETENTION_DAYS, 30, 365);
  const outcome = await db.applyRetention(config, days, parsed.data.action === 'purge');
  return outcome.ok ? c.json(outcome.value) : unavailable(c);
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
  if ((stage === 'check' || stage === 'review') && itemId === undefined) {
    reject('item_id_required');
  }

  // R02B item-identity guard for the check stage.
  if ((stage === 'check' || stage === 'review') && itemId !== undefined && question.id !== itemId) {
    reject('item_replaced', 409);
  }

  return question;
}

async function loadSessionForRequest(
  c: Context<HonoEnv>,
  sessionId: string,
): Promise<
  | { state: SessionState; userId: string; config: db.DbConfig | null }
  | Response
> {
  const config = dbConfig(c.env ?? {});
  if (!config) {
    if (configuredStorage(c.env ?? {})) return unavailable(c);
    const state = memGetSession(sessionId);
    return state
      ? { state, userId: 'fixture-learner', config: null }
      : c.json({ error: 'session_not_found' }, 404);
  }
  const user = await authenticateRequest(c);
  if (!user) return c.json({ error: 'unauthenticated' }, 401);
  const loaded = await db.getSession(config, user.userId, sessionId);
  if (!loaded.ok) return unavailable(c);
  return loaded.value
    ? { state: loaded.value, userId: user.userId, config }
    : c.json({ error: 'session_not_found' }, 404);
}

async function learnerForRequest(
  c: Context<HonoEnv>,
): Promise<{ userId: string; config: db.DbConfig | null } | Response> {
  const config = dbConfig(c.env ?? {});
  if (!config) {
    return configuredStorage(c.env ?? {})
      ? unavailable(c)
      : { userId: 'fixture-learner', config: null };
  }
  const user = await authenticateRequest(c);
  return user
    ? { userId: user.userId, config }
    : c.json({ error: 'unauthenticated' }, 401);
}

async function authorizeFounder(c: Context<HonoEnv>): Promise<boolean> {
  const config = dbConfig(c.env ?? {});
  if (config) {
    const user = await authenticateRequest(c);
    const allowed = new Set(
      (c.env?.RAWI_FOUNDER_USER_IDS ?? '')
        .split(',')
        .map((id) => id.trim())
        .filter(Boolean),
    );
    return Boolean(user && allowed.has(user.userId));
  }
  const expected = c.env?.RAWI_LOCAL_ADMIN_TOKEN;
  const provided = c.req.header('X-Rawi-Admin-Token');
  return Boolean(expected && provided && await timingSafeTextEqual(provided, expected));
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
    const declared = Number(req.headers.get('content-length') ?? '0');
    if (declared > 64 * 1024) return undefined;
    const reader = req.body?.getReader();
    if (!reader) return undefined;
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      total += part.value.byteLength;
      if (total > 64 * 1024) {
        await reader.cancel();
        return undefined;
      }
      chunks.push(part.value);
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return undefined;
  }
}

function readTutorConfig(env: RawiEnv): TutorConfig | null {
  const mode = env.RAWI_TUTOR_MODE ?? 'fixture';
  if (mode === 'fixture') {
    return {
      mode: 'fixture',
      model: 'deterministic-course-fixture',
      inputUsdPerMillion: 0,
      outputUsdPerMillion: 0,
      timeoutMs: 8_000,
    };
  }
  if (mode !== 'openai' || !env.OPENAI_API_KEY) return null;
  const inputPrice = positiveNumber(env.RAWI_OPENAI_INPUT_USD_PER_MILLION, 0.2);
  const outputPrice = positiveNumber(env.RAWI_OPENAI_OUTPUT_USD_PER_MILLION, 1.2);
  const timeoutMs = parsePositiveInteger(env.RAWI_AI_TIMEOUT_MS, 8_000, 20_000);
  if (!inputPrice || !outputPrice) return null;
  return {
    mode: 'openai',
    apiKey: env.OPENAI_API_KEY,
    model: env.RAWI_OPENAI_MODEL ?? DEFAULT_MODEL,
    inputUsdPerMillion: inputPrice,
    outputUsdPerMillion: outputPrice,
    timeoutMs,
  };
}

function positiveNumber(value: string | undefined, fallback: number): number | null {
  const parsed = value === undefined ? fallback : Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function parsePositiveInteger(
  value: string | undefined,
  fallback: number,
  maximum: number,
): number {
  const parsed = value === undefined ? fallback : Number(value);
  return Number.isInteger(parsed) && parsed > 0 && parsed <= maximum
    ? parsed
    : fallback;
}

function usdCapMicros(value: string | undefined): number | null {
  if (value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0
    ? Math.floor(parsed * 1_000_000)
    : null;
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

async function timingSafeTextEqual(left: string, right: string): Promise<boolean> {
  const [leftHash, rightHash] = await Promise.all([
    crypto.subtle.digest('SHA-256', new TextEncoder().encode(left)),
    crypto.subtle.digest('SHA-256', new TextEncoder().encode(right)),
  ]);
  const leftBytes = new Uint8Array(leftHash);
  const rightBytes = new Uint8Array(rightHash);
  let difference = 0;
  for (let index = 0; index < leftBytes.length; index += 1) {
    difference |= leftBytes[index]! ^ rightBytes[index]!;
  }
  return difference === 0;
}

export {
  app,
  clearSessions,
  clearFixtureOperations,
  fixtureBudget,
};
export default app;
