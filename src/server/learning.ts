/**
 * The learning rules. This module is the authority on assistance, grading and
 * evidence; nothing else may decide them.
 *
 * Invariants enforced here (docs/PRODUCT.md "Modes and state rules"):
 *  1. Assistance is monotonic: none -> hinted -> revealed, never backwards.
 *     A refresh, a second tab, or a mode switch cannot reset it.
 *  2. An attempt counts as independent only if it is correct AND no assistance
 *     was used on that question.
 *  3. A revealed question can never later be graded as an unseen check.
 *  4. Submitting the same attempt twice is idempotent: one recorded attempt.
 *
 * The functions are pure: they take a state and return the next state. The
 * store (lesson-store.ts) decides where that state lives. At R03 the store
 * moves to Supabase and this file does not change.
 */
import type {
  AssistanceLevel,
  AttemptResult,
  EvidenceState,
  RecordedAttempt,
  Stage,
} from '../shared/types.js';
import type { AuthoredLesson, AuthoredQuestion } from '../content/demo-lesson.js';

/** Per-question progress held by the server. */
export interface QuestionState {
  readonly questionId: string;
  readonly assistance: AssistanceLevel;
  /** How many hints have been handed out, capped at the authored count. */
  readonly hintsUsed: number;
  /** True once graded, so a repeat submission is not recorded twice. */
  readonly submitted: boolean;
}

/** Full server-side session state. Never sent to the browser as-is. */
export interface SessionState {
  readonly sessionId: string;
  readonly lessonId: string;
  readonly stage: Stage;
  readonly questions: Readonly<Record<string, QuestionState>>;
  readonly attempts: readonly RecordedAttempt[];
  readonly lastResult?: AttemptResult;
  /** Set when the learner has seen the teaching explanation. */
  readonly explanationSeen: boolean;
}

const ASSISTANCE_RANK: Record<AssistanceLevel, number> = {
  none: 0,
  hinted: 1,
  revealed: 2,
};

/**
 * Invariant 1. Assistance only ever increases. Every path that records help
 * goes through this function, so there is one place to audit.
 */
export function raiseAssistance(
  current: AssistanceLevel,
  next: AssistanceLevel,
): AssistanceLevel {
  return ASSISTANCE_RANK[next] > ASSISTANCE_RANK[current] ? next : current;
}

export function emptyQuestionState(questionId: string): QuestionState {
  return { questionId, assistance: 'none', hintsUsed: 0, submitted: false };
}

export function createSession(
  sessionId: string,
  lesson: AuthoredLesson,
): SessionState {
  return {
    sessionId,
    lessonId: lesson.id,
    stage: 'diagnose',
    questions: {
      [lesson.diagnostic.id]: emptyQuestionState(lesson.diagnostic.id),
      [lesson.practice.id]: emptyQuestionState(lesson.practice.id),
      [lesson.check.id]: emptyQuestionState(lesson.check.id),
    },
    attempts: [],
    explanationSeen: false,
  };
}

export function questionState(
  state: SessionState,
  questionId: string,
): QuestionState {
  return state.questions[questionId] ?? emptyQuestionState(questionId);
}

function withQuestion(state: SessionState, next: QuestionState): SessionState {
  return {
    ...state,
    questions: { ...state.questions, [next.questionId]: next },
  };
}

/**
 * Hand out the next hint. Raises assistance to 'hinted' - which is why a
 * hinted-then-correct answer can never be independent evidence.
 */
export function requestHint(
  state: SessionState,
  question: AuthoredQuestion,
): { state: SessionState; hints: readonly string[] } {
  const current = questionState(state, question.id);
  const hintsUsed = Math.min(current.hintsUsed + 1, question.hints.length);
  const next: QuestionState = {
    ...current,
    hintsUsed,
    // Only actually raise assistance if a hint was really available.
    assistance:
      hintsUsed > 0
        ? raiseAssistance(current.assistance, 'hinted')
        : current.assistance,
  };
  return {
    state: withQuestion(state, next),
    hints: question.hints.slice(0, hintsUsed),
  };
}

/**
 * Reveal the answer. Invariant 3: this permanently marks the question, so a
 * later correct submission on it is recorded as assisted, not independent.
 */
export function revealAnswer(
  state: SessionState,
  question: AuthoredQuestion,
): SessionState {
  const current = questionState(state, question.id);
  return withQuestion(state, {
    ...current,
    assistance: raiseAssistance(current.assistance, 'revealed'),
  });
}

export function markExplanationSeen(state: SessionState): SessionState {
  return { ...state, explanationSeen: true };
}

/**
 * Grade a submission and record the evidence.
 *
 * Invariant 4: if this question was already submitted, the state is returned
 * unchanged apart from re-presenting the existing result. A double-click or a
 * replayed request therefore cannot append a second attempt or flip evidence.
 */
export function submitAttempt(
  state: SessionState,
  question: AuthoredQuestion,
  stage: Stage,
  optionId: string,
  now: Date,
): { state: SessionState; result: AttemptResult } {
  const current = questionState(state, question.id);

  if (current.submitted) {
    const existing = state.attempts.find((a) => a.questionId === question.id);
    const result: AttemptResult = {
      questionId: question.id,
      correct: existing?.correct ?? false,
      assistance: current.assistance,
      countsAsIndependent: existing?.countsAsIndependent ?? false,
      feedback: question.answerExplanation,
    };
    return { state: { ...state, lastResult: result }, result };
  }

  const correct = optionId === question.correctOptionId;
  const assistance = current.assistance;
  // Invariant 2: independence requires both correctness and zero assistance.
  const countsAsIndependent = correct && assistance === 'none';

  const recorded: RecordedAttempt = {
    questionId: question.id,
    stage,
    correct,
    assistance,
    countsAsIndependent,
    at: now.toISOString(),
  };

  const result: AttemptResult = {
    questionId: question.id,
    correct,
    assistance,
    countsAsIndependent,
    feedback: question.answerExplanation,
  };

  const nextState: SessionState = {
    ...withQuestion(state, { ...current, submitted: true }),
    attempts: [...state.attempts, recorded],
    lastResult: result,
  };

  return { state: nextState, result };
}

/** Move the learner to a new stage. Stage changes never touch assistance. */
export function setStage(state: SessionState, stage: Stage): SessionState {
  return { ...state, stage };
}

/**
 * Derive the evidence state from recorded attempts only.
 *
 * Note what is absent: no model output, no confidence score, and no way for a
 * caller to set this directly. PRODUCT.md requires progress to be descriptive
 * and derived from actual independent performance.
 */
export function evidenceState(
  attempts: readonly RecordedAttempt[],
  checkQuestionId: string,
): EvidenceState {
  const independentCheck = attempts.some(
    (a) => a.questionId === checkQuestionId && a.countsAsIndependent,
  );
  if (independentCheck) return 'independent-once';

  return attempts.length > 0 ? 'practicing' : 'not-checked';
}

/** Days until the first delayed check, per the 7-day follow-up in PRODUCT.md. */
export const REVIEW_INTERVAL_DAYS = 7;

export function nextReviewDue(
  attempts: readonly RecordedAttempt[],
  checkQuestionId: string,
  now: Date,
): string | undefined {
  const state = evidenceState(attempts, checkQuestionId);
  if (state !== 'independent-once' && state !== 'retained-on-review') {
    return undefined;
  }
  const due = new Date(now.getTime());
  due.setUTCDate(due.getUTCDate() + REVIEW_INTERVAL_DAYS);
  return due.toISOString().slice(0, 10);
}
