/**
 * The learning rules. This module is the authority on assistance, grading and
 * evidence; nothing else may decide them.
 *
 * ── The invariants enforced here ──────────────────────────────────────────
 *
 *  1. **Assistance is monotonic**: `none -> hinted -> revealed`, never
 *     backwards. Not by reload, not by a second tab, not by a mode switch.
 *     Every path that records help goes through `raiseAssistance`, so there is
 *     one place to audit.
 *  2. **Independent means correct AND unaided.** An attempt is independent
 *     evidence only if it was correct *and* no assistance was in force on that
 *     item. **Using Ask during a check is assistance**, and arrives here as an
 *     assistance raise like any other.
 *  3. **A revealed item can never later be graded as an unseen check.** Reveal
 *     marks the item permanently, so a later correct submission on it is
 *     recorded as assisted.
 *  4. **Recorded attempts are immutable**, including the review date anchored
 *     to them. Reading the same evidence on a later day does not move it — the
 *     date is stored on the attempt, not recomputed from the current clock.
 *     A replayed submission reports exactly what was originally recorded.
 *  5. **Exhausting the item bank is an honest terminal state.** The server
 *     never recycles a seen item as fresh.
 *  6. **No mastery percentage.** `evidenceState` derives a described state from
 *     the attempt log. There is no way for a caller to set it and no number
 *     anywhere in its return type.
 *  7. **The server owns every rule.** These functions are the server's; the
 *     browser calls routes that call them.
 *  8. Commands act on the item and stage they name. A command naming a replaced
 *     item or a stale stage is rejected, not silently applied to whatever
 *     happens to be active now.
 *
 * ── Why these are pure functions ──────────────────────────────────────────
 *
 * They take a state and return the next state. `session.ts` decides where that
 * state lives and serialises read-apply-write against the `version` column.
 * That split is what lets `tests/invariants/` prove each rule without a
 * database, a clock, or a network — every one of them is a table-driven test
 * over these functions, and a rule you cannot test in three lines is a rule
 * that will quietly stop holding.
 */

import type {
  AssistanceLevel,
  EvidenceState,
  SessionStage,
} from '../../shared/contract.ts';
import type { Task } from '../../shared/content.ts';

/** Per-item progress held by the server. Never sent to the browser as-is. */
export interface ItemState {
  readonly itemId: string;
  readonly assistance: AssistanceLevel;
  /** How many hints have been handed out, capped at the authored count. */
  readonly hintsUsed: number;
  /** True once graded, so a repeat submission is not recorded twice. */
  readonly submitted: boolean;
  /** Set when Ask was used on this item. Recorded on the attempt. */
  readonly usedAsk: boolean;
}

/** One row of the append-only log, as the server writes it. */
export interface RecordedAttempt {
  readonly id: string;
  readonly conceptId: string;
  readonly itemId: string;
  readonly familyId: string;
  readonly purpose: Task['purpose'];
  readonly stage: SessionStage;
  readonly correct: boolean;
  readonly assistance: AssistanceLevel;
  readonly countsAsIndependent: boolean;
  readonly usedAsk: boolean;
  readonly at: string;
  readonly reviewDue: string | null;
  /** The key that produced it, so a replay can find it. */
  readonly idempotencyKey: string;
}

/** Full server-side session state. */
export interface SessionState {
  readonly sessionId: string;
  readonly workspaceId: string;
  readonly conceptId: string;
  /** Bumped on every committed write; the `UPDATE … WHERE version = $n` guard. */
  readonly version: number;
  readonly stage: SessionStage;
  readonly items: Readonly<Record<string, ItemState>>;
  readonly attempts: readonly RecordedAttempt[];
  readonly teachingSeen: boolean;
  /** The item currently offered. `null` at `teach` and `summary`. */
  readonly activeItemId: string | null;
  /**
   * Every item this session has shown. Invariant 5: an exposed item is never
   * selected again as the fresh one, even after a reveal or a conversion.
   */
  readonly exposedItemIds: readonly string[];
  /** Families already used, so a re-check can require a different one. */
  readonly seenFamilyIds: readonly string[];
  readonly lastFeedback: { tone: 'good' | 'uncertain' | 'revisit'; text: string } | null;
  readonly startedAt: string;
}

const ASSISTANCE_RANK: Record<AssistanceLevel, number> = {
  none: 0,
  hinted: 1,
  revealed: 2,
};

/**
 * Invariant 1. Assistance only ever increases.
 *
 * Deliberately total and deliberately boring: given any two levels it returns
 * the higher one. There is no `lowerAssistance`, no `clearAssistance`, and no
 * parameter that makes this go backwards. That absence is the invariant.
 */
export function raiseAssistance(
  current: AssistanceLevel,
  next: AssistanceLevel,
): AssistanceLevel {
  return ASSISTANCE_RANK[next] > ASSISTANCE_RANK[current] ? next : current;
}

export function emptyItemState(itemId: string): ItemState {
  return { itemId, assistance: 'none', hintsUsed: 0, submitted: false, usedAsk: false };
}

export function itemState(state: SessionState, itemId: string): ItemState {
  return state.items[itemId] ?? emptyItemState(itemId);
}

function withItem(state: SessionState, next: ItemState): SessionState {
  return { ...state, items: { ...state.items, [next.itemId]: next } };
}

/**
 * Select the next item the session should offer.
 *
 * `excludeFamilies` is what makes the delayed re-check a re-check: for a review
 * it carries every family already used, so the chosen item cannot be the same
 * question in different clothes. For an ordinary stage it is empty.
 *
 * Returns `null` when nothing qualifies — which the caller must surface as
 * exhaustion rather than by relaxing the filter (invariant 5).
 */
export function selectNextItem(
  tasks: readonly Task[],
  purpose: Task['purpose'],
  exposedItemIds: readonly string[],
  excludeFamilies: readonly string[] = [],
): Task | null {
  return (
    tasks.find(
      (task) =>
        task.purpose === purpose &&
        !exposedItemIds.includes(task.id) &&
        !excludeFamilies.includes(task.family_id),
    ) ?? null
  );
}

export function createSession(input: {
  sessionId: string;
  workspaceId: string;
  conceptId: string;
  firstItem: Task | null;
  /** Items this learner has already seen in earlier sessions on this concept. */
  previouslyExposedItemIds: readonly string[];
  now: Date;
}): SessionState {
  const exposed = [...new Set(input.previouslyExposedItemIds)];
  return {
    sessionId: input.sessionId,
    workspaceId: input.workspaceId,
    conceptId: input.conceptId,
    version: 1,
    stage: 'diagnose',
    items: input.firstItem ? { [input.firstItem.id]: emptyItemState(input.firstItem.id) } : {},
    attempts: [],
    teachingSeen: false,
    activeItemId: input.firstItem?.id ?? null,
    exposedItemIds: input.firstItem ? [...exposed, input.firstItem.id] : exposed,
    seenFamilyIds: input.firstItem ? [input.firstItem.family_id] : [],
    lastFeedback: null,
    startedAt: input.now.toISOString(),
  };
}

/**
 * Hand out the next hint.
 *
 * Raises assistance to `hinted` — which is exactly why a hinted-then-correct
 * answer can never be independent evidence. Assistance is raised only if a hint
 * was genuinely available: charging the learner for a hint that does not exist
 * would be a lie in the direction that costs them.
 */
export function requestHint(
  state: SessionState,
  task: Task,
): { state: SessionState; hints: readonly string[] } {
  const current = itemState(state, task.id);
  const hintsUsed = Math.min(current.hintsUsed + 1, task.hints.length);
  const next: ItemState = {
    ...current,
    hintsUsed,
    assistance:
      hintsUsed > 0 ? raiseAssistance(current.assistance, 'hinted') : current.assistance,
  };
  return { state: withItem(state, next), hints: task.hints.slice(0, hintsUsed) };
}

/**
 * Invariant 2, second half: **using Ask during a check is assistance.**
 *
 * It arrives here rather than in the Ask route so that "what counts as help"
 * has one definition. The learner is warned before the question is sent; this
 * is the recording, not the surprise.
 */
export function recordAskAsSupport(state: SessionState, itemId: string): SessionState {
  const current = itemState(state, itemId);
  return withItem(state, {
    ...current,
    usedAsk: true,
    assistance: raiseAssistance(current.assistance, 'hinted'),
  });
}

/**
 * Reveal the answer.
 *
 * Invariant 3: this marks the item permanently, so a later correct submission
 * on it is recorded as assisted, not independent. There is no path back.
 */
export function revealAnswer(state: SessionState, task: Task): SessionState {
  const current = itemState(state, task.id);
  return withItem(state, {
    ...current,
    assistance: raiseAssistance(current.assistance, 'revealed'),
  });
}

export function markTeachingSeen(state: SessionState): SessionState {
  return { ...state, teachingSeen: true };
}

/** Days until the first delayed re-check. FSRS refines this; see scheduling/. */
export const FIRST_REVIEW_INTERVAL_DAYS = 7;

/** UTC date `days` after `from`, as YYYY-MM-DD. */
export function addDays(from: Date, days: number): string {
  const due = new Date(from.getTime());
  due.setUTCDate(due.getUTCDate() + days);
  return due.toISOString().slice(0, 10);
}

/**
 * Grade a submission and record the evidence.
 *
 * ── Invariant 4, and why the replay path reads the attempt ────────────────
 *
 * If this item was already submitted, the recorded attempt is replayed
 * verbatim. Reading `assistance` from the item's *current* state would describe
 * a past result using help the learner took afterwards — so the same attempt
 * could be explained two different ways depending on when you asked. The log is
 * the only thing that gets to say what happened.
 *
 * `reviewDue` is likewise written here, at the moment of the attempt, so the
 * date shown never depends on when the learner happens to reload.
 */
export function submitAttempt(input: {
  state: SessionState;
  task: Task;
  /** The server's judgement. This function does not decide correctness. */
  correct: boolean;
  attemptId: string;
  idempotencyKey: string;
  now: Date;
  /** Days until the re-check, from the scheduler. */
  reviewIntervalDays: number;
}): { state: SessionState; attempt: RecordedAttempt; replayed: boolean } {
  const { state, task, now } = input;
  const current = itemState(state, task.id);

  if (current.submitted) {
    const existing = state.attempts.find((attempt) => attempt.itemId === task.id);
    if (!existing) {
      // `submitted` with no recorded attempt is not a state this module can
      // produce. Treat it as corruption rather than inventing a result.
      throw new Error(`submitted item ${task.id} has no recorded attempt`);
    }
    return { state, attempt: existing, replayed: true };
  }

  const assistance = current.assistance;
  // Invariant 2. Both halves, in one expression, in one place.
  const countsAsIndependent = input.correct && assistance === 'none';

  const attempt: RecordedAttempt = {
    id: input.attemptId,
    conceptId: state.conceptId,
    itemId: task.id,
    familyId: task.family_id,
    purpose: task.purpose,
    stage: state.stage,
    correct: input.correct,
    assistance,
    countsAsIndependent,
    usedAsk: current.usedAsk,
    at: now.toISOString(),
    reviewDue: countsAsIndependent ? addDays(now, input.reviewIntervalDays) : null,
    idempotencyKey: input.idempotencyKey,
  };

  return {
    state: {
      ...withItem(state, { ...current, submitted: true }),
      attempts: [...state.attempts, attempt],
    },
    attempt,
    replayed: false,
  };
}

/**
 * Offer a different item, retiring the current one.
 *
 * Invariant 3 + 5: the retired item is marked `revealed` so it can never later
 * count as an unseen check, and the replacement must be an item this session
 * has not shown. **No graded attempt is invented** — the learner did not answer
 * it, and the log says only what happened.
 *
 * Returns `null` when there is no replacement. The caller surfaces that as
 * `item_bank_exhausted`; it does not relax the filter.
 */
export function replaceActiveItem(
  state: SessionState,
  tasks: readonly Task[],
  itemId: string,
  purpose: Task['purpose'],
): SessionState | null {
  if (state.activeItemId !== itemId) return null;

  const retired = withItem(state, {
    ...itemState(state, itemId),
    assistance: raiseAssistance(itemState(state, itemId).assistance, 'revealed'),
  });

  const next = selectNextItem(tasks, purpose, retired.exposedItemIds);
  if (!next) return null;

  return {
    ...withItem(retired, emptyItemState(next.id)),
    activeItemId: next.id,
    exposedItemIds: [...retired.exposedItemIds, next.id],
    seenFamilyIds: [...new Set([...retired.seenFamilyIds, next.family_id])],
  };
}

/** Invariant 5, as a question the caller can ask before promising anything. */
export function isItemBankExhausted(
  state: SessionState,
  tasks: readonly Task[],
  purpose: Task['purpose'],
): boolean {
  return selectNextItem(tasks, purpose, state.exposedItemIds) === null;
}

/**
 * Stage transitions the learner may actually make.
 *
 * A product rule, written down rather than implied. Forward is
 * `diagnose -> teach -> practice -> check -> summary`. Going back to a teaching
 * stage is allowed — rereading an explanation is not cheating, and assistance
 * already recorded does not disappear. **Skipping ahead to `check` is not**: a
 * learner must not reach a check without passing through teaching. When
 * "testing out" becomes a product decision it becomes an explicit command here,
 * not an unguarded client-supplied stage.
 */
const ALLOWED_TRANSITIONS: Readonly<Record<SessionStage, readonly SessionStage[]>> = {
  diagnose: ['teach'],
  teach: ['diagnose', 'practice'],
  practice: ['teach', 'check'],
  check: ['summary', 'practice', 'teach'],
  review: ['summary', 'teach'],
  summary: ['teach', 'practice'],
};

export function canTransition(from: SessionStage, to: SessionStage): boolean {
  // A no-op transition is fine: a retried navigation should not be an error.
  if (from === to) return true;
  return ALLOWED_TRANSITIONS[from].includes(to);
}

/**
 * Move to a new stage. Stage changes never touch assistance.
 *
 * Invariant 8: when the client says where it thought the session was and the
 * session is actually somewhere else, the command is a stale request built
 * against an old view. Returning `null` lets the caller reject without writing.
 */
export function setStage(
  state: SessionState,
  to: SessionStage,
  expectedCurrentStage: SessionStage,
): SessionState | null {
  if (state.stage !== expectedCurrentStage) return null;
  if (!canTransition(state.stage, to)) return null;
  if (state.stage === to) return state;
  return { ...state, stage: to };
}

/**
 * Derive the evidence state from recorded attempts only.
 *
 * Note what is absent: no model output, no confidence, no number, and no way
 * for a caller to set this directly (invariants 6 and 7).
 *
 * `retained-on-review` requires the review attempt to be from a **different
 * family** than the one that earned `independent-once`. Without that clause a
 * re-check could re-ask the same question in different clothes and the state
 * would claim something the log does not support.
 */
export function evidenceState(attempts: readonly RecordedAttempt[]): EvidenceState {
  const independent = attempts.filter((attempt) => attempt.countsAsIndependent);
  if (independent.length === 0) {
    return attempts.length > 0 ? 'practicing' : 'not-checked';
  }

  const first = independent[0]!;
  const retained = independent.some(
    (attempt) =>
      attempt.purpose === 'review' &&
      attempt.familyId !== first.familyId &&
      attempt.at > first.at,
  );
  return retained ? 'retained-on-review' : 'independent-once';
}

/**
 * The attempt that earned the current state — the one the evidence view points
 * at when it says "here is what you actually did".
 */
export function earningAttempt(
  attempts: readonly RecordedAttempt[],
): RecordedAttempt | null {
  const independent = attempts.filter((attempt) => attempt.countsAsIndependent);
  if (independent.length === 0) return null;
  const state = evidenceState(attempts);
  if (state === 'retained-on-review') {
    const first = independent[0]!;
    return (
      independent.find(
        (attempt) =>
          attempt.purpose === 'review' &&
          attempt.familyId !== first.familyId &&
          attempt.at > first.at,
      ) ?? first
    );
  }
  return independent[0]!;
}

/**
 * When the next re-check is due.
 *
 * Invariant 4: this **reads** the date stored on the qualifying attempt rather
 * than recomputing it from the current clock, so the same attempt shows the
 * same date on any later day.
 */
export function nextReviewDue(attempts: readonly RecordedAttempt[]): string | null {
  for (let index = attempts.length - 1; index >= 0; index -= 1) {
    const attempt = attempts[index]!;
    if (attempt.countsAsIndependent && attempt.reviewDue) return attempt.reviewDue;
  }
  return null;
}
