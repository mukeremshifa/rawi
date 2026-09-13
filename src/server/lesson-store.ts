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
 * `now` is injected rather than read from the clock so review dates are
 * testable at timezone boundaries (a DELIVERY.md R06 concern, cheap to honour
 * now).
 */
export function toSessionView(
  state: SessionState,
  lesson: AuthoredLesson,
  now: Date,
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
      nextReviewDue: nextReviewDue(attempts, lesson.check.id, now),
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
