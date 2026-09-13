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
 *  4. Submitting the same attempt twice is idempotent: one recorded attempt,
 *     and the replay reports exactly what was originally recorded.
 *  5. Commands act on the active stage only, and stages move along declared
 *     transitions. A command naming a stale stage is rejected, not silently
 *     applied to a different question (docs/NEXT_STEPS.md gap 1).
 *  6. A recorded attempt is immutable, including the review date anchored to
 *     it. Reading the same evidence on a later day does not move it (gap 2).
 *
 * The functions are pure: they take a state and return the next state. The
 * store (lesson-store.ts) decides where that state lives and serialises the
 * read-apply-write. At R03 the store moves to Supabase and this file does not
 * change.
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
  /** Bumped on every committed write. The store compares it to detect a
   * conflicting concurrent update; R03 uses it as the WHERE-clause guard. */
  readonly version: number;
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
    version: 1,
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
    // Invariant 4. Replay the attempt exactly as it was recorded. Reading
    // `assistance` from the question's CURRENT state would describe a result
    // using help the learner took after submitting, so the same attempt could
    // be explained two different ways (docs/NEXT_STEPS.md gap 2).
    const existing = state.attempts.find((a) => a.questionId === question.id);
    if (!existing) {
      // submitted with no recorded attempt is not a state this module can
      // produce; treat it as corruption rather than inventing a result.
      throw new Error(`submitted question ${question.id} has no recorded attempt`);
    }
    const result: AttemptResult = {
      questionId: question.id,
      correct: existing.correct,
      assistance: existing.assistance,
      countsAsIndependent: existing.countsAsIndependent,
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
    // Invariant 6. Anchored here, at the moment of the attempt, so the date
    // shown never depends on when the learner happens to reload.
    reviewDue: countsAsIndependent ? addDays(now, REVIEW_INTERVAL_DAYS) : undefined,
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

/**
 * Stage transitions the learner may actually make (invariant 5).
 *
 * This is a product rule, written down rather than implied. The path forward is
 * diagnose -> learn -> practice -> check -> summary. Going back to an earlier
 * teaching stage is allowed - rereading the explanation is not cheating, and
 * assistance already recorded does not disappear. Skipping ahead to `check` is
 * NOT allowed: a learner must not reach a scored check without passing through
 * the teaching stages, and R01 silently permitted a diagnose -> check jump.
 * When product decides to support testing out, it becomes an explicit command
 * here, not an unguarded client-supplied stage.
 */
const ALLOWED_TRANSITIONS: Readonly<Record<Stage, readonly Stage[]>> = {
  diagnose: ['learn'],
  learn: ['diagnose', 'practice'],
  practice: ['learn', 'check'],
  check: ['summary'],
  summary: ['learn', 'practice'],
};

export function canTransition(from: Stage, to: Stage): boolean {
  // A no-op transition is always fine: a retried or duplicated navigation
  // request should not be an error.
  if (from === to) return true;
  return ALLOWED_TRANSITIONS[from].includes(to);
}

/**
 * Move the learner to a new stage. Stage changes never touch assistance.
 * Returns undefined when the transition is not allowed, so the caller can
 * reject without writing.
 */
export function setStage(
  state: SessionState,
  stage: Stage,
): SessionState | undefined {
  if (!canTransition(state.stage, stage)) return undefined;
  if (state.stage === stage) return state;
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

/** UTC date, `days` after `from`, as YYYY-MM-DD. */
export function addDays(from: Date, days: number): string {
  const due = new Date(from.getTime());
  due.setUTCDate(due.getUTCDate() + days);
  return due.toISOString().slice(0, 10);
}

/**
 * The due date for the concept's next review.
 *
 * Invariant 6: this reads the date stored on the qualifying attempt instead of
 * recomputing it from the current clock. Projection is now a pure read of
 * recorded evidence, so the same attempt shows the same date on any later day.
 * R06 owns the full queue and any subsequent scheduling policy.
 */
export function nextReviewDue(
  attempts: readonly RecordedAttempt[],
  checkQuestionId: string,
): string | undefined {
  const qualifying = attempts.find(
    (a) => a.questionId === checkQuestionId && a.countsAsIndependent,
  );
  return qualifying?.reviewDue;
}
