import { z } from 'zod';
import { uuid } from './workspace';
import { writeInput } from './learning';
import { citationInput, type Citation } from './document';
import type { AnswerReview, TutorTurn } from '../domain/types';
/**
 * `attachedSources` counts sources added after the cited ones because the reply cited none.
 * `check` names a question the tutor posed from the bank: the item in the session's check run.
 */
export type TutorMessageProvenance = Pick<TutorTurn, 'model' | 'stage' | 'grounding' | 'droppedCitations'> & {
  citations: Citation[];
  attachedSources?: number;
  outsideScope?: boolean;
  check?: { runId: string; itemId: string };
};
// Without a title, a session is named after its topic, section heading or material.
// A guided session opens with a plan for the day and offers each next step.
export const newTutorInput = z.strictObject({
  id: uuid,
  guided: z.literal(true).optional(),
  title: z.string().trim().max(200).default(''),
  topicId: uuid.optional(),
  scopeId: uuid.optional(),
  plannedSessionId: uuid.optional(),
  source: citationInput.optional(),
  review: z.strictObject({ attemptId: uuid, questionId: uuid }).optional(),
});
/** Ask the tutor: the message is saved and the reply streams back in one request. `discuss` talks through the last bank question. */
export const tutorMessageInput = writeInput.extend({
  text: z.string().trim().min(1).max(4000),
  action: z.enum(['message', 'explain', 'example', 'hint', 'check', 'simpler', 'discuss']).default('message'),
  focus: z.strictObject({ materialId: uuid, key: z.string().min(1).max(500) }).optional(),
});
/** The step Rawi suggests next in a session, chosen by code from the learner model. `end` wraps the session up. */
export type NextMove =
  | {
      label: string;
      text: string;
      action: 'check' | 'discuss' | 'explain';
      focus?: { materialId: string; key: string };
    }
  | { label: string; end: true };
export const tutorMetadataInput = writeInput.extend({
  title: z.string().trim().min(1).max(200),
  archived: z.boolean(),
});
export type TutorSession = {
  checkRunId?: string | null;
  plannedSessionId?: string | null;
  completedLearning?: boolean;
  endedAt?: string | null;
  scopeId: string | null;
  id: string;
  courseId: string;
  topicId: string | null;
  topicLabel: string | null;
  title: string;
  archived: boolean;
  revision: number;
  source: Citation | null;
  review: AnswerReview | null;
  stage: 'orient' | 'understand' | 'recall' | 'reason' | 'apply' | 'reflect';
  createdAt: string;
  updatedAt: string;
};
export type TutorMessage = {
  provenance?: TutorMessageProvenance | null;
  id: string;
  ordinal: number;
  text: string;
  role: 'student' | 'tutor';
  state: 'complete' | 'pending' | 'blocked' | 'cancelled' | 'interrupted' | 'failed';
  createdAt: string;
  operationId: string;
  failure: string | null;
};
export type TutorDetail = {
  next?: NextMove | null;
  nextReview?: string | null;
  summary?: ReturnType<typeof import('../domain/tutor-summary').summariseTutorTurns> | null;
  session: TutorSession;
  messages: TutorMessage[];
  nextCursor: number | null;
  pendingReply: string | null;
};
