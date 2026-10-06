import { z } from 'zod';
import { accents } from './online';
import { formats, responseInput } from './learning';
const id = z.string().min(1).max(200);
const text = z.string().max(20000);
const instant = z.string().refine(v => Number.isFinite(Date.parse(v)));
const ids = z.array(id).max(2000);
const source = z.object({ materialId: id, passageId: id });
const passage = z.object({ id, heading: text, text: z.string().max(1048576), topicIds: ids });
const topic = z.object({ id, courseId: id, title: text, summary: text, priority: z.enum(['low', 'normal', 'high']), relatedTopicIds: ids, module: text.optional(), order: z.number().int().min(0) });
const provenance = z.object({ kind: z.literal('generated'), model: text, generatedAt: instant, materialIds: ids });
export const legacyQuestion = z.object({ id, courseId: id, topicId: id, format: z.enum(formats), difficulty: z.enum(['recall', 'reasoning', 'stretch']), marks: z.number().int().min(1).max(100), prompt: text, explanation: text, answer: text.optional(), options: z.array(text).max(20).optional(), correctIndices: z.array(z.number().int()).max(20).optional(), pairs: z.array(z.object({ left: text, right: text })).max(20).optional(), sequence: z.array(text).max(20).optional(), template: text.optional(), blanks: z.array(z.array(text).max(10)).max(20).optional(), extract: text.optional(), rubric: z.array(z.object({ id, label: text, marks: z.number().min(0).max(100), keywords: z.array(text).max(100).default([]), missedAdvice: text })).max(30).optional(), source: source.optional(), provenance: provenance.optional() });
const grading = z.object({ method: z.literal('ai'), status: z.enum(['pending', 'graded', 'failed']), model: text.optional(), gradedAt: instant.optional(), summary: text.optional(), points: z.array(z.object({ rubricId: id, awarded: z.number().min(0).max(100), max: z.number().min(0).max(100), feedback: text })).max(30).optional(), error: text.optional() });
const questionAttempt = z.object({ questionId: id, topicId: id, format: z.enum(formats), response: responseInput, outcome: z.enum(['correct', 'partial', 'incorrect', 'skipped', 'pending']), marksAwarded: z.number().min(0).max(100), marksAvailable: z.number().min(0).max(100), usedHint: z.boolean(), creditedRubricIds: ids.optional(), grading: grading.optional() });
const legacyAttempt = z.object({ id, courseId: id, kind: z.enum(['practice', 'exam', 'tutor']), mode: z.enum(['tutored', 'practice', 'self-rated', 'exam']), title: text, topicIds: ids, startedAt: instant, completedAt: instant.optional(), questions: z.array(questionAttempt).max(200), marksAwarded: z.number().min(0), marksAvailable: z.number().min(0), practiceSetId: id.optional(), examConfigId: id.optional(), assessmentId: id.optional(), plannedSessionId: id.optional(), remediatesAttemptId: id.optional(), finish: z.enum(['manual', 'expired']).optional(), assistanceRecord: z.enum(['tracked', 'unknown']).optional() });
const practiceConfig = z.object({ activity: z.enum(['flashcards', 'quiz', 'written-recall', 'source-analysis', 'essay']), topicIds: ids, materialIds: ids, length: z.number().int().min(0).max(50), difficulties: z.array(z.enum(['recall', 'reasoning', 'stretch'])).max(3), hintsAllowed: z.boolean(), feedback: z.enum(['immediate', 'end']) });
export const localTransferInput = z.object({ format: z.literal('rawi-workspace'), version: z.literal(1), state: z.object({
  version: z.literal(2), courses: z.array(z.object({ id, name: text, description: text, goal: text, accent: z.enum(accents), createdAt: instant, archived: z.boolean().optional() })).max(50),
  topics: z.array(topic).max(2000), retiredTopics: z.array(topic).max(2000).default([]),
  materials: z.array(z.object({ id, courseId: id, title: text, kind: z.enum(['reading', 'lecture-notes', 'student-note']), origin: z.enum(['authored', 'imported', 'pasted', 'text-file', 'preview']), attribution: text.optional(), fileName: text.optional(), topicIds: ids, passages: z.array(passage).max(500), priorPassages: z.array(passage).max(500).default([]), noteSource: source.optional(), addedAt: instant, updatedAt: instant.optional(), archived: z.boolean().optional() })).max(500),
  questions: z.array(legacyQuestion).max(2000), attempts: z.array(legacyAttempt).max(2000),
  savedPractice: z.array(z.object({ id, courseId: id, name: text, archived: z.boolean().optional(), config: practiceConfig, questionIds: ids, savedAt: instant, fromTutorId: id.optional(), fromAttemptId: id.optional() })).max(1000),
  tutorSessions: z.array(z.unknown()).max(1000), examConfigs: z.array(z.unknown()).max(1000), assessments: z.array(z.unknown()).max(1000), sessions: z.array(z.unknown()).max(2000), checkIns: z.array(z.unknown()).max(2000),
  practiceRuns: z.array(z.unknown()).max(1000).default([]), activeExam: z.unknown().optional(), availability: z.unknown(), preferences: z.unknown().optional(), drafts: z.record(z.string(), z.unknown()).optional(), carriedForward: z.unknown().optional(),
}) });
export type LocalTransfer = z.infer<typeof localTransferInput>;
export type ImportReview = { id: string; state: 'review' | 'complete'; courses: number; materials: number; questions: number; sets: number; attempts: number; unsupported: string[]; courseIds?: string[] };
