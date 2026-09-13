/**
 * Rawi Worker API skeleton.
 *
 * Thin by design: each route validates its input, calls one learning function,
 * persists the result and projects a view. No learning rule lives here - the
 * rules are in learning.ts, so the HTTP layer can be replaced or tested
 * separately. research/architecture.md: "Route handlers translate HTTP into
 * those functions."
 *
 * R01 has no authentication. Session IDs are opaque and unguessable, but they
 * are not an authorization boundary and this API must not be deployed publicly
 * as-is. R03 adds Supabase auth and per-learner ownership checks.
 *
 * R02A ordering rule, and the reason this file changed: every mutating handler
 * must finish ALL its awaits - reading and validating the body - before it
 * touches session state, then do the whole read-decide-write inside one
 * synchronous updateSession() command. R01 read the session first and awaited
 * the body afterwards, so a reveal could land in that gap and be overwritten by
 * an attempt that had already decided it was unassisted.
 *
 * R02B adds:
 *  - POST /api/sessions/:id/convert — explicit check-to-help conversion.
 *    Body: { itemId: string }. Must match state.activeCheckId; stale IDs are
 *    rejected 409. Idempotent when the same item is already converted.
 *  - Item-identity guard: attempt, hint and reveal carry an optional itemId.
 *    When supplied, it must equal state.activeCheckId (for the check stage)
 *    so a delayed request against a replaced item is caught even though both
 *    items share the same stage name.
 *  - Honest reload: 404 is now a distinct "session_not_found" case; network
 *    errors no longer claim the view is current (App.tsx handles this).
 */
import { Hono } from 'hono';
import { z } from 'zod';
import { demoLesson } from '../content/demo-lesson.js';
import {
  convertCheck,
  createSession,
  markExplanationSeen,
  requestHint,
  revealAnswer,
  setStage,
  submitAttempt,
  type SessionState,
} from './learning.js';
import {
  clearSessions,
  getSession,
  putSession,
  questionForStage,
  reject,
  toSessionView,
  updateSession,
  type UpdateOutcome,
} from './lesson-store.js';
import type { Stage } from '../shared/types.js';
import type { Context } from 'hono';

export interface Env {
  /** Set to "fixture" in R01. A real provider key is not read anywhere yet. */
  readonly RAWI_TUTOR_MODE?: string;
}

const app = new Hono<{ Bindings: Env }>();

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
   */
  itemId: z.string().min(1).max(64).optional(),
  /** Optional learner reasoning. Stored nowhere in R01; length-capped anyway. */
  explanation: z.string().max(2000).optional(),
});

const hintSchema = z.object({
  stage: stageSchema,
  /** R02B: same item-identity guard as attempt. */
  itemId: z.string().min(1).max(64).optional(),
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

/** Health check, and a clear statement of what this build is. */
app.get('/api/health', (c) =>
  c.json({
    ok: true,
    fixtureData: true,
    tutorMode: c.env?.RAWI_TUTOR_MODE ?? 'fixture',
  }),
);

/** Start a lesson. Returns a fresh session with the diagnostic question. */
app.post('/api/sessions', (c) => {
  const sessionId = crypto.randomUUID();
  const state = createSession(sessionId, demoLesson);
  putSession(state);
  return c.json(toSessionView(state, demoLesson), 201);
});

/** Re-read a session. A refresh takes this path, and assistance survives it. */
app.get('/api/sessions/:id', (c) => {
  const state = getSession(c.req.param('id'));
  if (!state) return c.json({ error: 'session_not_found' }, 404);
  return c.json(toSessionView(state, demoLesson));
});

/** Move to a named stage. Stage changes never reset assistance. */
app.post('/api/sessions/:id/stage', async (c) => {
  const parsed = z
    .object({ stage: stageSchema })
    .safeParse(await safeJson(c.req.raw));
  if (!parsed.success) return c.json({ error: 'invalid_stage' }, 400);
  const target = parsed.data.stage as Stage;

  return respond(
    c,
    updateSession(c.req.param('id'), (state) => {
      // Invariant 5: an illegal jump is refused against the state as it is at
      // this instant, not as the client believed it to be.
      const moved = setStage(state, target);
      if (!moved) reject('stage_transition_not_allowed', 409);
      return target === 'learn' ? markExplanationSeen(moved) : moved;
    }),
  );
});

/** Ask for the next hint. Raises assistance for that question, permanently. */
app.post('/api/sessions/:id/hint', async (c) => {
  const parsed = hintSchema.safeParse(await safeJson(c.req.raw));
  if (!parsed.success) return c.json({ error: 'invalid_request' }, 400);
  const { stage, itemId } = parsed.data;

  return respond(
    c,
    updateSession(c.req.param('id'), (state) => {
      const question = activeQuestion(state, stage as Stage, itemId);
      return requestHint(state, question).state;
    }),
  );
});

/** Reveal the answer. Permanently marks the question as assisted. */
app.post('/api/sessions/:id/reveal', async (c) => {
  const parsed = hintSchema.safeParse(await safeJson(c.req.raw));
  if (!parsed.success) return c.json({ error: 'invalid_request' }, 400);
  const { stage, itemId } = parsed.data;

  return respond(
    c,
    updateSession(c.req.param('id'), (state) => {
      const question = activeQuestion(state, stage as Stage, itemId);
      return revealAnswer(state, question);
    }),
  );
});

/** Grade a submission. Idempotent per question. */
app.post('/api/sessions/:id/attempt', async (c) => {
  const parsed = submitSchema.safeParse(await safeJson(c.req.raw));
  if (!parsed.success) return c.json({ error: 'invalid_request' }, 400);
  const { stage, optionId, itemId } = parsed.data;
  // The clock is read once, before the command, so the recorded time does not
  // depend on how long the critical section took.
  const now = new Date();

  return respond(
    c,
    updateSession(c.req.param('id'), (state) => {
      const question = activeQuestion(state, stage as Stage, itemId);

      // Validate the option ID against the authored allowlist rather than
      // trusting whatever the client sent. A bogus ID is a bad request, not a
      // wrong answer.
      if (!question.options.some((o) => o.id === optionId)) {
        reject('unknown_option');
      }

      return submitAttempt(state, question, stage as Stage, optionId, now).state;
    }),
  );
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
 */
app.post('/api/sessions/:id/convert', async (c) => {
  const parsed = convertSchema.safeParse(await safeJson(c.req.raw));
  if (!parsed.success) return c.json({ error: 'invalid_request' }, 400);
  const { itemId } = parsed.data;

  return respond(
    c,
    updateSession(c.req.param('id'), (state) => {
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

      return convertCheck(state, demoLesson, itemId);
    }),
  );
});

/**
 * Resolve the question a command may act on.
 *
 * Three separate guards, all evaluated inside the critical section:
 *  - the client's stage must be the stage the session is actually on;
 *  - that stage must actually carry a question;
 *  - R02B: when itemId is supplied and the stage is 'check', the item ID must
 *    match state.activeCheckId, so a delayed request against a replaced item is
 *    rejected even though both items share the same stage name.
 */
function activeQuestion(state: SessionState, stage: Stage, itemId?: string) {
  if (state.stage !== stage) reject('stage_not_active', 409);
  const question = questionForStage(demoLesson, stage, state);
  if (!question) reject('no_question_at_stage');

  // R02B item-identity guard for the check stage.
  if (stage === 'check' && itemId !== undefined && question.id !== itemId) {
    reject('item_replaced', 409);
  }

  return question;
}

/** Turn an atomic update outcome into the HTTP response. */
function respond(c: Context<{ Bindings: Env }>, outcome: UpdateOutcome) {
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
