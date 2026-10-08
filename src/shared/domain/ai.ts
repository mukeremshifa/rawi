import type { AnswerReview, Difficulty, TutorStage } from './types';

/**
 * The contract between the browser and the local AI server.
 *
 * Shared so that both sides agree on field names, and so that the server's
 * validators and the client's request builders are written against one list.
 * Nothing in here carries a credential: the browser never learns the project,
 * the location or anything about how the server authenticates.
 */

/** A passage as the server sees it. Always from the request's own course. */
export interface AiPassage {
  id: string;
  materialId: string;
  courseId: string;
  materialTitle: string;
  heading: string;
  text: string;
  topicIds: string[];
}

export interface AiTopic {
  id: string;
  title: string;
  summary: string;
}

/* ── Status ─────────────────────────────────────────────────────────────── */

export interface AiStatus {
  configured: boolean;
  /** Plain-language names of what is missing, when not configured. */
  missing: string[];
  models: { main: string; lite: string };
  location: string | null;
  budget: BudgetSnapshot;
}

export interface BudgetSnapshot {
  dailyLimitUsd: number;
  totalLimitUsd: number;
  todayUsd: number;
  totalUsd: number;
  /** Money held for requests currently in flight. */
  reservedUsd: number;
}

/* ── Errors ─────────────────────────────────────────────────────────────── */

export type AiErrorCode =
  | 'not-configured'
  | 'budget-daily'
  | 'budget-total'
  | 'busy'
  | 'bad-request'
  | 'too-large'
  | 'upstream'
  | 'auth'
  | 'invalid-output'
  | 'cancelled'
  | 'unreachable';

export interface AiErrorBody {
  error: { code: AiErrorCode; message: string };
}

/** Usage and cost of one completed request, for provenance. */
export interface AiUsage {
  model: string;
  inputTokens: number;
  outputTokens: number;
  thinkingTokens: number;
  estimatedUsd: number;
}

/* ── Tutor ──────────────────────────────────────────────────────────────── */

export type TutorAction =
  | 'message'
  | 'explain'
  | 'example'
  | 'hint'
  | 'check'
  | 'simpler';

export interface TutorTurn {
  role: 'tutor' | 'student';
  text: string;
  /** True for a tutor turn that was cut off before it finished. */
  interrupted?: boolean;
}

export interface TutorRequest {
  review?: AnswerReview;
  courseId: string;
  courseName: string;
  topic: AiTopic;
  stage: TutorStage;
  action: TutorAction;
  /** The student's newest message. */
  message: string;
  /** The passage the session was opened from, when there is one. */
  focusPassageId?: string;
  passages: AiPassage[];
  history: TutorTurn[];
  /** Short lines describing relevant earlier work, already summarised. */
  priorWork: string[];
}

export type Grounding = 'materials' | 'mixed' | 'general' | 'insufficient';

/** The trailer the model writes after its reply, parsed and validated. */
export interface TutorMeta {
  stage: TutorStage;
  grounding: Grounding;
}

/**
 * Streamed as newline-delimited JSON. `delta` events carry raw text as it
 * arrives, and exactly one `done` or `error` event ends the stream.
 */
export type TutorStreamEvent =
  | { type: 'delta'; text: string }
  | {
      type: 'done';
      text: string;
      citations: string[];
      droppedCitations: number;
      meta: TutorMeta;
      usage: AiUsage;
    }
  | { type: 'error'; code: AiErrorCode; message: string };

/* ── Question generation ────────────────────────────────────────────────── */

export type GeneratedFormat = 'flashcard' | 'multiple-choice' | 'written-recall';

export interface GenerateRequest {
  courseId: string;
  courseName: string;
  format: GeneratedFormat;
  count: number;
  difficulties: Difficulty[];
  topics: AiTopic[];
  passages: AiPassage[];
}

export interface GeneratedRubricPoint {
  label: string;
  marks: number;
  missedAdvice: string;
}

/** One question as the server returns it, after validation. */
export interface GeneratedQuestion {
  topicId: string;
  difficulty: Difficulty;
  prompt: string;
  answer: string;
  options?: string[];
  correctIndex?: number;
  rubric?: GeneratedRubricPoint[];
  explanation: string;
  sourcePassageId: string;
}

export interface GenerateResponse {
  questions: GeneratedQuestion[];
  /** How many the model proposed that failed validation and were dropped. */
  rejected: number;
  usage: AiUsage;
}

/* ── Written feedback ───────────────────────────────────────────────────── */

export interface GradeRequest {
  courseId: string;
  prompt: string;
  modelAnswer: string;
  rubric: { id: string; label: string; marks: number }[];
  passages: AiPassage[];
  response: string;
}

export interface GradePoint {
  rubricId: string;
  awarded: number;
  feedback: string;
}

export interface GradeResponse {
  points: GradePoint[];
  summary: string;
  usage: AiUsage;
}

/* ── Limits shared by both sides ────────────────────────────────────────── */

export const AI_LIMITS = {
  maxPassages: 24,
  maxPassageChars: 6000,
  maxContextChars: 36000,
  maxHistoryTurns: 12,
  maxMessageChars: 4000,
  maxQuestionsPerRequest: 10,
  maxResponseChars: 12000,
} as const;
