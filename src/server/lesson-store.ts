/**
 * Session storage and the browser-facing projection.
 *
 * Two responsibilities, deliberately together:
 *  - where session state lives (R01: in Worker memory)
 *  - toSessionView(), the single function that decides what the browser sees
 *
 * Everything the learner must not have before submitting - correct option IDs,
 * answer explanations, unrequested hints - is filtered out here. AGENTS.md:
 * "Keep API secrets and unrevealed check answers out of the production browser
 * bundle."
 *
 * R01 limitation, stated plainly: this Map is per-isolate and non-durable. A
 * Worker restart drops sessions. R03 replaces this file with Supabase-backed
 * storage; learning.ts and the HTTP routes do not change.
 *
 * R02A adds updateSession(): the only supported way to change a session. It
 * reads, applies and writes with no await in between, so two overlapping
 * requests cannot both act on the same old state. Each write bumps a version,
 * which is what R03 will compare in a transactional UPDATE ... WHERE version =
 * $n. See docs/NEXT_STEPS.md gap 1.
 */
import type {
  PublicQuestion,
  SessionView,
  Stage,
} from '../shared/types.js';
import type { AuthoredLesson, AuthoredQuestion } from '../content/demo-lesson.js';
import {
  evidenceState,
  nextReviewDue,
  questionState,
  type SessionState,
} from './learning.js';

const sessions = new Map<string, SessionState>();

export function putSession(state: SessionState): void {
  sessions.set(state.sessionId, state);
}

export function getSession(sessionId: string): SessionState | undefined {
  return sessions.get(sessionId);
}

export function deleteSession(sessionId: string): void {
  sessions.delete(sessionId);
}

/** Test helper: drop all sessions between cases. */
export function clearSessions(): void {
  sessions.clear();
}

/** Why an atomic update did not apply. Handlers map these onto HTTP codes. */
export type UpdateFailure =
  | { readonly kind: 'not-found' }
  | { readonly kind: 'rejected'; readonly reason: CommandRejection };

/**
 * A rejection raised by the command itself while inside the critical section:
 * the session existed, but the requested change was not legal against the
 * state as it actually was at that moment.
 */
export interface CommandRejection {
  readonly error: string;
  readonly status: 400 | 409;
}

export type UpdateOutcome =
  | { readonly ok: true; readonly state: SessionState }
  | { readonly ok: false; readonly failure: UpdateFailure };

/** Thrown by a command to abort the update without writing. */
export class CommandError extends Error {
  constructor(readonly rejection: CommandRejection) {
    super(rejection.error);
    this.name = 'CommandError';
  }
}

/** Reject a command from inside an atomic update. Never writes. */
export function reject(error: string, status: 400 | 409 = 400): never {
  throw new CommandError({ error, status });
}

/**
 * Apply a command to one session atomically.
 *
 * `apply` MUST be synchronous. That is the whole mechanism: because it cannot
 * await, no other request can run between the read and the write, so a command
 * always decides against the state it will overwrite. Sequential idempotency
 * (learning.ts invariant 4) does not give this - it only dedupes a repeat of a
 * request that already finished.
 */
export function updateSession(
  sessionId: string,
  apply: (state: SessionState) => SessionState,
): UpdateOutcome {
  const current = sessions.get(sessionId);
  if (!current) return { ok: false, failure: { kind: 'not-found' } };

  let next: SessionState;
  try {
    next = apply(current);
  } catch (err) {
    if (err instanceof CommandError) {
      return { ok: false, failure: { kind: 'rejected', reason: err.rejection } };
    }
    throw err;
  }

  // Optimistic-concurrency check. In R01 memory the read above cannot go stale,
  // but asserting it here means the contract is already correct when R03 swaps
  // this Map for a store that can.
  const stored = sessions.get(sessionId);
  if (!stored || stored.version !== current.version) {
    return {
      ok: false,
      failure: { kind: 'rejected', reason: { error: 'session_conflict', status: 409 } },
    };
  }

  const committed: SessionState =
    next === current ? current : { ...next, version: current.version + 1 };
  sessions.set(sessionId, committed);
  return { ok: true, state: committed };
}

/** The question the learner is looking at, given the stage. */
export function questionForStage(
  lesson: AuthoredLesson,
  stage: Stage,
): AuthoredQuestion | undefined {
  switch (stage) {
    case 'diagnose':
      return lesson.diagnostic;
    case 'practice':
      return lesson.practice;
    case 'check':
      return lesson.check;
    case 'learn':
    case 'summary':
      return undefined;
  }
}

/**
 * Strip an authored question down to what the browser may receive.
 * correctOptionId and answerExplanation are dropped by construction: this
 * builds a new object rather than deleting fields, so a newly authored secret
 * field cannot leak by being forgotten.
 */
function toPublicQuestion(question: AuthoredQuestion): PublicQuestion {
  return {
    id: question.id,
    prompt: question.prompt,
    options: question.options.map((o) => ({ id: o.id, label: o.label })),
    explainPrompt: question.explainPrompt,
  };
}

/**
 * Project server state into the learner-facing view.
 *
 * Pure in the state: the same SessionState always projects to the same view.
 * R01 passed `now` in here and computed the review date from it, which made the
 * date drift every day the learner reloaded. The date is now anchored on the
 * attempt (learning.ts invariant 6), so projection needs no clock at all - and
 * a function with no clock cannot reintroduce that class of bug.
 */
export function toSessionView(
  state: SessionState,
  lesson: AuthoredLesson,
): SessionView {
  const question = questionForStage(lesson, state.stage);
  const qState = question ? questionState(state, question.id) : undefined;

  // Hints are sliced to the number actually requested: the browser never
  // receives a hint the learner has not unlocked.
  const revealedHints =
    question && qState ? question.hints.slice(0, qState.hintsUsed) : [];

  // The answer is included only once the learner revealed it or was graded.
  const showAnswer =
    question && qState && (qState.assistance === 'revealed' || qState.submitted);

  const attempts = state.attempts;

  return {
    sessionId: state.sessionId,
    lessonId: lesson.id,
    lessonTitle: lesson.title,
    conceptId: lesson.conceptId,
    conceptName: lesson.conceptName,
    mode: stageToMode(state.stage),
    stage: state.stage,
    question: question ? toPublicQuestion(question) : undefined,
    revealedHints,
    hintsAvailable: question ? question.hints.length : 0,
    revealedAnswer: showAnswer && question ? question.answerExplanation : undefined,
    explanation:
      state.stage === 'learn' || state.explanationSeen
        ? lesson.explanation
        : undefined,
    assistance: qState ? qState.assistance : 'none',
    lastResult: state.lastResult,
    evidence: {
      conceptId: lesson.conceptId,
      conceptName: lesson.conceptName,
      state: evidenceState(attempts, lesson.check.id),
      attempts,
      nextReviewDue: nextReviewDue(attempts, lesson.check.id),
    },
    fixtureData: true,
  };
}

function stageToMode(stage: Stage): SessionView['mode'] {
  switch (stage) {
    case 'diagnose':
    case 'practice':
      return 'practice';
    case 'learn':
      return 'learn';
    case 'check':
      return 'check';
    case 'summary':
      return 'review';
  }
}
