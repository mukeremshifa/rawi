/**
 * Shared learning vocabulary for Rawi.
 *
 * These types are the contract between the browser and the Worker API. The
 * browser renders them; only the server may produce them. Anything the learner
 * must not see before submitting (expected answers, rubrics) is deliberately
 * absent from every type in this file — see src/server/lesson-store.ts.
 */

/** Activity modes from docs/PRODUCT.md "Modes and state rules". */
export type Mode = 'learn' | 'practice' | 'check' | 'review';

/**
 * Evidence state for one concept. Deliberately descriptive rather than a
 * mastery percentage: PRODUCT.md forbids turning model confidence into a score.
 */
export type EvidenceState =
  | 'not-checked'
  | 'practicing'
  | 'independent-once'
  | 'retained-on-review';

/** How much help the learner used on an attempt. Ordered weakest to strongest. */
export type AssistanceLevel = 'none' | 'hinted' | 'revealed';

/** A single teaching step the learner can be shown. */
export interface Explanation {
  readonly id: string;
  readonly body: string;
  /** Excerpt from the reviewed source pack, shown beside the explanation. */
  readonly sourceExcerpt?: SourceExcerpt;
}

export interface SourceExcerpt {
  readonly sourceId: string;
  readonly title: string;
  readonly version: string;
  readonly excerpt: string;
  /** Authorship/licence basis. AGENTS.md requires this to be recorded. */
  readonly permission: string;
}

/** A multiple-choice option as shown to the learner (no correctness marker). */
export interface AnswerOption {
  readonly id: string;
  readonly label: string;
}

/** A question as the browser is allowed to see it. */
export interface PublicQuestion {
  readonly id: string;
  readonly prompt: string;
  readonly options: readonly AnswerOption[];
  /** Prompt asking the learner to explain their reasoning, if any. */
  readonly explainPrompt?: string;
}

/** Result of one graded submission, decided by the server. */
export interface AttemptResult {
  readonly questionId: string;
  readonly correct: boolean;
  /** Assistance in force when this attempt was submitted. */
  readonly assistance: AssistanceLevel;
  /** True only when correct AND assistance === 'none'. */
  readonly countsAsIndependent: boolean;
  readonly feedback: string;
}

/**
 * Commands that act on a specific check item carry this identity so the server
 * can reject a request built against a replaced or stale item even when both
 * occupy the same stage.
 */
export interface ItemRef {
  /** The question ID the client believes is active. */
  readonly itemId: string;
}

/** The learner-visible state of a lesson session, owned by the server. */
export interface SessionView {
  readonly sessionId: string;
  readonly lessonId: string;
  readonly lessonTitle: string;
  readonly conceptId: string;
  readonly conceptName: string;
  readonly mode: Mode;
  readonly stage: Stage;
  /** The question currently in front of the learner, if the stage has one. */
  readonly question?: PublicQuestion;
  /**
   * ID of the check question currently selected for independent assessment.
   * Exposed so the client can detect item replacement (same stage, new item).
   */
  readonly activeCheckId?: string;
  /**
   * True when the active check has been explicitly converted to help/practice.
   * The server never issues a graded result for a converted item.
   */
  readonly checkConverted?: boolean;
  /**
   * True when all check bank items have been exposed, converted, or retired.
   * The server will honestly decline to provide a fresh check.
   */
  readonly checkBankExhausted?: boolean;
  /** Hints already unlocked, in order. Never includes unrequested hints. */
  readonly revealedHints: readonly string[];
  /** Total hints available for the current question. */
  readonly hintsAvailable: number;
  /** Set once the learner reveals the answer, or after a graded submission. */
  readonly revealedAnswer?: string;
  readonly explanation?: Explanation;
  readonly assistance: AssistanceLevel;
  readonly lastResult?: AttemptResult;
  readonly evidence: EvidenceSummary;
  /** True when the fixture tutor produced this content. Always true in R01. */
  readonly fixtureData: true;
}

/** Stages of the smallest complete experience (PRODUCT.md). */
export type Stage =
  | 'diagnose'
  | 'learn'
  | 'practice'
  | 'check'
  | 'summary';

export interface EvidenceSummary {
  readonly conceptId: string;
  readonly conceptName: string;
  readonly state: EvidenceState;
  /** Attempts recorded across the session, newest last. */
  readonly attempts: readonly RecordedAttempt[];
  /**
   * ISO date the next review is due, once independent evidence exists. Read
   * from the qualifying attempt; never recomputed from the current clock.
   */
  readonly nextReviewDue?: string;
}

export interface RecordedAttempt {
  readonly questionId: string;
  readonly stage: Stage;
  readonly correct: boolean;
  readonly assistance: AssistanceLevel;
  readonly countsAsIndependent: boolean;
  readonly at: string;
  /**
   * ISO date (YYYY-MM-DD) this attempt schedules the next review for, set only
   * when the attempt counted as independent. Anchored to the attempt rather
   * than recomputed at read time, so the date a learner is shown does not move
   * when they reload on a later day.
   */
  readonly reviewDue?: string;
}

/** Summary of one session returned by GET /api/sessions (resume UI). */
export interface SessionSummary {
  readonly sessionId: string;
  readonly lessonId: string;
  readonly version: number;
  readonly updatedAt: string;
  readonly evidenceState: EvidenceState;
  readonly nextReviewDue?: string;
}

/** Response from GET /api/me. */
export interface MeResponse {
  readonly userId: string;
  readonly email?: string;
  readonly enrolled: boolean;
  /** Supabase anon key for client-side OAuth — null when DB not configured. */
  readonly supabaseAnonKey: string | null;
  /** Supabase project URL — null when DB not configured. */
  readonly supabaseUrl: string | null;
}
