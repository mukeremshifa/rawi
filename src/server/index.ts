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
 */
import { Hono } from 'hono';
import { z } from 'zod';
import { demoLesson } from '../content/demo-lesson.js';
import {
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
  /** Optional learner reasoning. Stored nowhere in R01; length-capped anyway. */
  explanation: z.string().max(2000).optional(),
});

const hintSchema = z.object({ stage: stageSchema });

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
  const stage = parsed.data.stage as Stage;

  return respond(
    c,
    updateSession(c.req.param('id'), (state) => {
      const question = activeQuestion(state, stage);
      return requestHint(state, question).state;
    }),
  );
});

/** Reveal the answer. Permanently marks the question as assisted. */
app.post('/api/sessions/:id/reveal', async (c) => {
  const parsed = hintSchema.safeParse(await safeJson(c.req.raw));
  if (!parsed.success) return c.json({ error: 'invalid_request' }, 400);
  const stage = parsed.data.stage as Stage;

  return respond(
    c,
    updateSession(c.req.param('id'), (state) => {
      const question = activeQuestion(state, stage);
      return revealAnswer(state, question);
    }),
  );
});

/** Grade a submission. Idempotent per question. */
app.post('/api/sessions/:id/attempt', async (c) => {
  const parsed = submitSchema.safeParse(await safeJson(c.req.raw));
  if (!parsed.success) return c.json({ error: 'invalid_request' }, 400);
  const { stage, optionId } = parsed.data;
  // The clock is read once, before the command, so the recorded time does not
  // depend on how long the critical section took.
  const now = new Date();

  return respond(
    c,
    updateSession(c.req.param('id'), (state) => {
      const question = activeQuestion(state, stage as Stage);

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
 * Resolve the question a command may act on.
 *
 * Two separate guards, both evaluated inside the critical section:
 *  - the client's stage must be the stage the session is actually on, so a
 *    request built against a screen the learner has since left cannot act on
 *    the question now in front of them;
 *  - that stage must actually carry a question.
 */
function activeQuestion(state: SessionState, stage: Stage) {
  if (state.stage !== stage) reject('stage_not_active', 409);
  const question = questionForStage(demoLesson, stage);
  if (!question) reject('no_question_at_stage');
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
