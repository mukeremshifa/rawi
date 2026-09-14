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
 *  7. (R02B) Commands that target a specific check item carry its ID. A stale
 *     request for a replaced item is rejected, even if both items are at stage
 *     "check". Duplicate conversion requests are idempotent.
 *  8. (R02B) Conversion records the event without inventing a graded answer or
 *     rewriting any previously submitted result. A converted item is retired
 *     from independent use within the session. Exhausting the bank is an honest
 *     terminal state; the server never recycles a converted item as "fresh".
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
  /**
   * ID of the check question currently selected for independent assessment.
   * Starts as the lesson's primary check. When the learner converts it, the
   * server selects the next unexposed bank item and updates this field.
   * Undefined only before the check stage is first reached.
   */
  readonly activeCheckId: string;
  /**
   * IDs of all check items that have been exposed to this session: the active
   * one plus any that were converted. A converted item may still be practiced
   * but is never selected again as the "fresh" independent check.
   */
  readonly exposedCheckIds: readonly string[];
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
    activeCheckId: lesson.check.id,
    exposedCheckIds: [lesson.check.id],
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
 * Convert the active check item to help/practice.
 *
 * Invariant 8: marks the active item as converted (via assistance = 'revealed'
 * to permanently retire it from independent credit) without inventing a graded
 * answer. The server then selects the next unexposed bank item as the new
 * active check. If no unexposed item exists, the bank is exhausted.
 *
 * Idempotent when called with the same item ID that is still active AND the
 * bank is NOT exhausted — returns state unchanged. If the bank is already
 * exhausted (all items exposed and the active one is already converted), returns
 * state unchanged so the caller (route handler) can detect exhaustion and reject.
 *
 * The caller is responsible for rejecting:
 *   - wrong itemId → 'item_replaced'
 *   - already exhausted (no progress made) → the handler detects by comparing
 *     pre/post state
 */
export function convertCheck(
  state: SessionState,
  lesson: AuthoredLesson,
  itemId: string,
): SessionState {
  if (state.activeCheckId !== itemId) {
    // Stale request — the item has already been replaced. This is not an error:
    // the caller (store) will reject it as a stale-item conflict.
    return state;
  }

  const current = questionState(state, itemId);

  // Idempotent: already converted means assistance is 'revealed'. If there is
  // no replacement available (bank exhausted), return unchanged so the route
  // handler can detect no-op on an already-exhausted bank.
  if (current.assistance === 'revealed') {
    return state;
  }

  // Mark the item as assisted-revealed, permanently retiring it from
  // independent use. We do NOT record a graded attempt.
  const retired = withQuestion(state, {
    ...current,
    assistance: raiseAssistance(current.assistance, 'revealed'),
  });

  // Select the next unexposed bank item.
  const allItems = [lesson.check, ...lesson.checkBank];
  const nextItem = allItems.find(
    (q) => !retired.exposedCheckIds.includes(q.id) && q.id !== itemId,
  );

  if (!nextItem) {
    // Bank exhausted — no replacement available. Return retired state (active
    // item is now revealed, no new activeCheckId). The route handler detects
    // exhaustion by checking isCheckBankExhausted after conversion.
    return retired;
  }

  // Register the new item as exposed and initialise its question state.
  const newExposed = [...retired.exposedCheckIds, nextItem.id];
  const withNewItem = withQuestion(retired, emptyQuestionState(nextItem.id));

  return {
    ...withNewItem,
    activeCheckId: nextItem.id,
    exposedCheckIds: newExposed,
  };
}

/**
 * True when every item in the bank (including the primary check) has been
 * either submitted or converted to help within this session.
 */
export function isCheckBankExhausted(
  state: SessionState,
  lesson: AuthoredLesson,
): boolean {
  const allItems = [lesson.check, ...lesson.checkBank];
  const unexposed = allItems.filter((q) => !state.exposedCheckIds.includes(q.id));
  if (unexposed.length > 0) return false;

  // All items are exposed. Exhausted means the active one was also converted
  // (revealed) and there is no unexposed replacement.
  const activeState = questionState(state, state.activeCheckId);
  return activeState.assistance === 'revealed' && !activeState.submitted;
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
 *
 * R03: practice -> check is no longer a direct transition when the explanation
 * has not yet been seen. Instead, convert on the check stage triggers a
 * teach-before-fresh-check flow: after converting, the session moves to learn
 * so the learner sees the explanation before the replacement item. The route
 * handler owns this transition; the table here stays minimal.
 */
const ALLOWED_TRANSITIONS: Readonly<Record<Stage, readonly Stage[]>> = {
  diagnose: ['learn'],
  learn: ['diagnose', 'practice'],
  practice: ['learn', 'check'],
  check: ['summary', 'practice', 'learn'],
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
 *
 * R03 stale-navigation guard: if `expectedCurrentStage` is provided, the
 * transition is only applied when the session's actual current stage matches.
 * A command carrying an expected stage that does not match the server's actual
 * stage is a stale request built against an old view; returning the current
 * state unchanged is the safe action, and the caller rejects with 409.
 *
 * Returns undefined when the transition is not allowed or (if expectedCurrent
 * is supplied) when the guard fails, so the caller can reject without writing.
 */
export function setStage(
  state: SessionState,
  stage: Stage,
  expectedCurrentStage?: Stage,
): SessionState | undefined {
  // Stale-navigation guard: if the client told us where it thought the session
  // was, and the session is actually somewhere else, reject rather than apply.
  if (expectedCurrentStage !== undefined && state.stage !== expectedCurrentStage) {
    return undefined;
  }
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
 *
 * R02B: any check bank item counts for promotion, not just the primary check.
 */
export function evidenceState(
  attempts: readonly RecordedAttempt[],
  checkItemIds: readonly string[],
): EvidenceState {
  const independentCheck = attempts.some(
    (a) => checkItemIds.includes(a.questionId) && a.countsAsIndependent,
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
 *
 * R02B: any check bank item qualifies.
 */
export function nextReviewDue(
  attempts: readonly RecordedAttempt[],
  checkItemIds: readonly string[],
): string | undefined {
  const qualifying = attempts.find(
    (a) => checkItemIds.includes(a.questionId) && a.countsAsIndependent,
  );
  return qualifying?.reviewDue;
}
