import {
  createEmptyCard,
  fsrs,
  generatorParameters,
  Rating,
  State,
  type Card as FsrsCard,
  type FSRS,
  type Grade as FsrsGrade,
} from 'ts-fsrs';

import type { AssistanceLevel } from '../../shared/contract.ts';

/**
 * The scheduler, wrapped once, **on the server**.
 *
 * ── Why it moved ──────────────────────────────────────────────────────────
 *
 * SynapseDeck computed FSRS in the browser, which is defensible there: the
 * learner grades themselves, so the client already holds the input. In Rawi the
 * learner cannot self-report (invariant 7), the grade is *derived* from an
 * attempt the server assessed, and the due date is written onto an immutable
 * log row (invariant 4). A schedule computed in the browser would be a schedule
 * the browser could choose, which is the one thing the product promises it
 * cannot.
 *
 * ── The adaptation that matters: there are no rating buttons ──────────────
 *
 * FSRS wants Again / Hard / Good / Easy. Rawi never asks. The grade is read off
 * what actually happened:
 *
 *   incorrect                    -> Again
 *   correct, answer revealed     -> Again   (they saw it; this is not recall)
 *   correct, hint used           -> Hard
 *   correct, unaided             -> Good
 *
 * **There is deliberately no path to `Easy`.** Easy means "this was trivially
 * recalled", and nothing Rawi observes distinguishes trivial from merely
 * correct — inferring it from response time would be inventing a measurement.
 * Invariant 10: never fabricate. The cost is slightly slower interval growth,
 * which is a cost worth paying to keep every input to the schedule something
 * the log can defend.
 *
 * Everything here is pure: no database, no React, no clock read that is not
 * passed in as `now`. That is what makes a simulated month testable.
 *
 * Configuration: ts-fsrs 5.x, default weights, default request_retention (0.90),
 * fuzz **disabled** — a deterministic due date is worth more here than the
 * load-spreading fuzz buys, because the date is written to an immutable row and
 * a test that cannot predict it cannot assert on it.
 */

export type FsrsStateName = 'new' | 'learning' | 'review' | 'relearning';

const STATE_TO_DB = {
  [State.New]: 'new',
  [State.Learning]: 'learning',
  [State.Review]: 'review',
  [State.Relearning]: 'relearning',
} as const satisfies Record<State, FsrsStateName>;

const DB_TO_STATE = {
  new: State.New,
  learning: State.Learning,
  review: State.Review,
  relearning: State.Relearning,
} as const satisfies Record<FsrsStateName, State>;

export function toDbState(state: State): FsrsStateName {
  return STATE_TO_DB[state];
}

export function fromDbState(state: FsrsStateName): State {
  return DB_TO_STATE[state];
}

/** The scheduling columns a concept carries. Database shapes, not ts-fsrs ones. */
export interface ConceptScheduling {
  stability: number;
  difficulty: number;
  elapsedDays: number;
  scheduledDays: number;
  reps: number;
  lapses: number;
  state: FsrsStateName;
  /** ISO timestamp, or null for a concept never reviewed. */
  lastReview: string | null;
  /** ISO timestamp. */
  due: string;
}

let instance: FSRS | null = null;

function scheduler(): FSRS {
  instance ??= fsrs(generatorParameters({ enable_fuzz: false }));
  return instance;
}

export function newScheduling(now: Date): ConceptScheduling {
  return fromFsrsCard(createEmptyCard(now));
}

function fromFsrsCard(card: FsrsCard): ConceptScheduling {
  return {
    stability: card.stability,
    difficulty: card.difficulty,
    elapsedDays: card.elapsed_days,
    scheduledDays: card.scheduled_days,
    reps: card.reps,
    lapses: card.lapses,
    state: toDbState(card.state),
    lastReview: card.last_review ? new Date(card.last_review).toISOString() : null,
    due: new Date(card.due).toISOString(),
  };
}

function toFsrsCard(scheduling: ConceptScheduling): FsrsCard {
  return {
    due: new Date(scheduling.due),
    stability: scheduling.stability,
    difficulty: scheduling.difficulty,
    elapsed_days: scheduling.elapsedDays,
    scheduled_days: scheduling.scheduledDays,
    reps: scheduling.reps,
    lapses: scheduling.lapses,
    state: fromDbState(scheduling.state),
    last_review: scheduling.lastReview ? new Date(scheduling.lastReview) : undefined,
  } as FsrsCard;
}

/**
 * The derivation described in the header. One function, so "what grade was
 * that" has exactly one answer and a test can walk every combination.
 */
export function gradeFromAttempt(input: {
  correct: boolean;
  assistance: AssistanceLevel;
}): FsrsGrade {
  if (!input.correct) return Rating.Again;
  if (input.assistance === 'revealed') return Rating.Again;
  if (input.assistance === 'hinted') return Rating.Hard;
  return Rating.Good;
}

export interface ScheduleResult {
  scheduling: ConceptScheduling;
  /** Whole days until the next re-check. What `rules.ts` anchors to the attempt. */
  intervalDays: number;
  /** YYYY-MM-DD, UTC. The form the log and the contract both use. */
  dueDate: string;
}

/** Advance a concept's schedule given one assessed attempt. */
export function schedule(input: {
  current: ConceptScheduling | null;
  correct: boolean;
  assistance: AssistanceLevel;
  now: Date;
}): ScheduleResult {
  const card = toFsrsCard(input.current ?? newScheduling(input.now));
  const grade = gradeFromAttempt({ correct: input.correct, assistance: input.assistance });

  const next = scheduler().next(card, input.now, grade);
  const scheduling = fromFsrsCard(next.card);
  const due = new Date(scheduling.due);

  // Ceil, not round: a re-check that lands earlier than the model asked for is
  // a re-check the model did not sanction.
  const intervalDays = Math.max(
    1,
    Math.ceil((due.getTime() - input.now.getTime()) / 86_400_000),
  );

  return { scheduling, intervalDays, dueDate: due.toISOString().slice(0, 10) };
}

/** Whether a concept is due as of `now`, comparing dates rather than instants. */
export function isDue(dueDate: string | null, now: Date): boolean {
  if (!dueDate) return false;
  return dueDate <= now.toISOString().slice(0, 10);
}
