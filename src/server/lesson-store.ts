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
 *
 * R02B adds:
 *  - activeCheckId in the projected view (so the client detects item replacement)
 *  - checkConverted / checkBankExhausted flags
 *  - questionForStage uses state.activeCheckId for the check stage
 *  - item-identity validation inside the critical section
 */
import type {
  EvidenceSummary,
  PublicQuestion,
  SessionView,
  Stage,
} from '../shared/types.js';
import type { AuthoredLesson, AuthoredQuestion } from '../content/demo-lesson.js';
import {
  evidenceState,
  isCheckBankExhausted,
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

/** Fixture-only inspection used by learner export and deterministic metrics. */
export function listMemorySessions(): readonly SessionState[] {
  return [...sessions.values()];
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

  const outcome = applySessionUpdate(current, apply);
  if (!outcome.ok) return outcome;

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

  const committed = outcome.state;
  sessions.set(sessionId, committed);
  return { ok: true, state: committed };
}

/**
 * Apply one pure learning command and assign its next durable version.
 *
 * Both stores use this function: fixture mode commits its result to the local
 * Map, while configured mode conditionally commits it to Postgres. Keeping the
 * command/error/version rules here prevents the two persistence paths from
 * interpreting the same learner action differently.
 */
export function applySessionUpdate(
  current: SessionState,
  apply: (state: SessionState) => SessionState,
): UpdateOutcome {
  try {
    const next = apply(current);
    const committed =
      next === current ? current : { ...next, version: current.version + 1 };
    return { ok: true, state: committed };
  } catch (err) {
    if (err instanceof CommandError) {
      return { ok: false, failure: { kind: 'rejected', reason: err.rejection } };
    }
    throw err;
  }
}

/**
 * The question the learner is looking at, given the stage.
 *
 * R02B: for the check stage, returns the item currently selected in
 * state.activeCheckId, not always lesson.check. This way a stale request
 * carrying the old item ID will be caught by the item-identity guard in the
 * handler before it can act on the wrong question.
 */
export function questionForStage(
  lesson: AuthoredLesson,
  stage: Stage,
  state?: SessionState,
): AuthoredQuestion | undefined {
  switch (stage) {
    case 'diagnose':
      return lesson.diagnostic;
    case 'practice':
      return lesson.practice;
    case 'check': {
      if (!state) return lesson.check;
      const allItems = [lesson.check, ...lesson.checkBank];
      return allItems.find((q) => q.id === state.activeCheckId);
    }
    case 'review': {
      if (!state?.activeReviewId) return undefined;
      return lesson.reviewBank.find((q) => q.id === state.activeReviewId);
    }
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
 *
 * R02B: exposes activeCheckId, checkConverted, checkBankExhausted so the client
 * can render the exhaustion state and detect item replacement.
 */
export function toSessionView(
  state: SessionState,
  lesson: AuthoredLesson,
): SessionView {
  const question = questionForStage(lesson, state.stage, state);
  const qState = question ? questionState(state, question.id) : undefined;

  // Hints are sliced to the number actually requested: the browser never
  // receives a hint the learner has not unlocked.
  const revealedHints =
    question && qState ? question.hints.slice(0, qState.hintsUsed) : [];

  // The answer is included only once the learner revealed it or was graded.
  const showAnswer =
    question && qState && (qState.assistance === 'revealed' || qState.submitted);

  const evidence = projectLearningEvidence(state, lesson);

  // R02B: determine converted and exhausted states for the active check item.
  const activeCheckQState = questionState(state, state.activeCheckId);
  // A check item is "converted" when it was revealed without being submitted —
  // that is the explicit help conversion path. Once submitted it is answered,
  // not just converted.
  const checkConverted =
    activeCheckQState.assistance === 'revealed' && !activeCheckQState.submitted;
  const checkBankExhausted = isCheckBankExhausted(state, lesson);

  return {
    sessionId: state.sessionId,
    lessonId: lesson.id,
    lessonTitle: lesson.title,
    conceptId: lesson.conceptId,
    conceptName: lesson.conceptName,
    mode: stageToMode(state.stage),
    stage: state.stage,
    question: question ? toPublicQuestion(question) : undefined,
    activeCheckId: state.activeCheckId,
    checkConverted,
    checkBankExhausted,
    revealedHints,
    hintsAvailable: question ? question.hints.length : 0,
    revealedAnswer: showAnswer && question ? question.answerExplanation : undefined,
    explanation:
      state.stage === 'learn' || state.explanationSeen
        ? lesson.explanation
        : undefined,
    assistance: qState ? qState.assistance : 'none',
    lastResult: state.lastResult,
    evidence,
    fixtureData: true,
    delayedReview: state.stage === 'review',
  };
}

/** Common check-specific projection used by detail and session-list views. */
export function projectLearningEvidence(
  state: SessionState,
  lesson: AuthoredLesson,
): EvidenceSummary {
  const checkItemIds = [lesson.check, ...lesson.checkBank].map((item) => item.id);
  const reviewItemIds = lesson.reviewBank.map((item) => item.id);
  return {
    conceptId: lesson.conceptId,
    conceptName: lesson.conceptName,
    state: evidenceState(state.attempts, checkItemIds, reviewItemIds),
    attempts: state.attempts,
    nextReviewDue: nextReviewDue(state.attempts, checkItemIds, reviewItemIds),
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
    case 'review':
    case 'summary':
      return 'review';
  }
}
