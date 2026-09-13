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
} from './learning.js';
import {
  clearSessions,
  getSession,
  putSession,
  questionForStage,
  toSessionView,
} from './lesson-store.js';
import type { Stage } from '../shared/types.js';

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
  return c.json(toSessionView(state, demoLesson, new Date()), 201);
});

/** Re-read a session. A refresh takes this path, and assistance survives it. */
app.get('/api/sessions/:id', (c) => {
  const state = getSession(c.req.param('id'));
  if (!state) return c.json({ error: 'session_not_found' }, 404);
  return c.json(toSessionView(state, demoLesson, new Date()));
});

/** Move to a named stage. Stage changes never reset assistance. */
app.post('/api/sessions/:id/stage', async (c) => {
  const state = getSession(c.req.param('id'));
  if (!state) return c.json({ error: 'session_not_found' }, 404);

  const body = await safeJson(c.req.raw);
  const parsed = z.object({ stage: stageSchema }).safeParse(body);
  if (!parsed.success) return c.json({ error: 'invalid_stage' }, 400);

  let next = setStage(state, parsed.data.stage as Stage);
  if (parsed.data.stage === 'learn') next = markExplanationSeen(next);
  putSession(next);
  return c.json(toSessionView(next, demoLesson, new Date()));
});

/** Ask for the next hint. Raises assistance for that question, permanently. */
app.post('/api/sessions/:id/hint', async (c) => {
  const state = getSession(c.req.param('id'));
  if (!state) return c.json({ error: 'session_not_found' }, 404);

  const parsed = hintSchema.safeParse(await safeJson(c.req.raw));
  if (!parsed.success) return c.json({ error: 'invalid_request' }, 400);

  const question = questionForStage(demoLesson, parsed.data.stage);
  if (!question) return c.json({ error: 'no_question_at_stage' }, 400);

  const { state: next } = requestHint(state, question);
  putSession(next);
  return c.json(toSessionView(next, demoLesson, new Date()));
});

/** Reveal the answer. Permanently marks the question as assisted. */
app.post('/api/sessions/:id/reveal', async (c) => {
  const state = getSession(c.req.param('id'));
  if (!state) return c.json({ error: 'session_not_found' }, 404);

  const parsed = hintSchema.safeParse(await safeJson(c.req.raw));
  if (!parsed.success) return c.json({ error: 'invalid_request' }, 400);

  const question = questionForStage(demoLesson, parsed.data.stage);
  if (!question) return c.json({ error: 'no_question_at_stage' }, 400);

  const next = revealAnswer(state, question);
  putSession(next);
  return c.json(toSessionView(next, demoLesson, new Date()));
});

/** Grade a submission. Idempotent per question. */
app.post('/api/sessions/:id/attempt', async (c) => {
  const state = getSession(c.req.param('id'));
  if (!state) return c.json({ error: 'session_not_found' }, 404);

  const parsed = submitSchema.safeParse(await safeJson(c.req.raw));
  if (!parsed.success) return c.json({ error: 'invalid_request' }, 400);

  const question = questionForStage(demoLesson, parsed.data.stage);
  if (!question) return c.json({ error: 'no_question_at_stage' }, 400);

  // Validate the option ID against the authored allowlist rather than trusting
  // whatever the client sent. A bogus ID is a bad request, not a wrong answer.
  if (!question.options.some((o) => o.id === parsed.data.optionId)) {
    return c.json({ error: 'unknown_option' }, 400);
  }

  const { state: next } = submitAttempt(
    state,
    question,
    parsed.data.stage as Stage,
    parsed.data.optionId,
    new Date(),
  );
  putSession(next);
  return c.json(toSessionView(next, demoLesson, new Date()));
});

async function safeJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return undefined;
  }
}

export { app, clearSessions };
export default app;
