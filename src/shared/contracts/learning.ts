import { z } from 'zod';
import { uuid } from './workspace';
import type { AnswerValue, Question, QuestionAttempt, Attempt } from '../domain/types';
import type { ExamRuntime } from './exams';

export const formats = ['flashcard', 'multiple-choice', 'multiple-select', 'matching', 'ordering', 'fill-blank', 'written-recall', 'source-analysis', 'essay'] as const;
const text = z.string().max(20000);
const short = z.string().min(1).max(2000);
const unique = <T,>(values: T[]) => new Set(values).size === values.length;
export const sourceInput = z.strictObject({ materialId: uuid, versionId: uuid, passageId: uuid });
export const questionInput = z.strictObject({
  format: z.enum(formats), topicId: uuid, difficulty: z.enum(['recall', 'reasoning', 'stretch']),
  marks: z.number().int().min(1).max(100), prompt: short, explanation: text,
  answer: text.optional(), options: z.array(short).min(2).max(20).optional(),
  correctIndices: z.array(z.number().int().min(0).max(19)).min(1).max(20).refine(unique).optional(),
  pairs: z.array(z.strictObject({ left: short, right: short })).min(2).max(20).optional(),
  sequence: z.array(short).min(2).max(20).refine(unique).optional(), template: text.optional(),
  blanks: z.array(z.array(short).min(1).max(10)).min(1).max(20).optional(), extract: text.optional(),
  rubric: z.array(z.strictObject({ id: short, label: short, marks: z.number().int().min(1).max(100), keywords: z.array(short).max(30).default([]), missedAdvice: text })).min(1).max(30).optional(),
  source: sourceInput.optional(),
}).superRefine((q, ctx) => {
  const fail = () => ctx.addIssue({ code: 'custom', message: 'Question content does not match its format.' });
  if (q.format === 'flashcard' && !q.answer?.trim()) fail();
  if (['multiple-choice', 'multiple-select'].includes(q.format) && (!q.options || !q.correctIndices || q.correctIndices.some(i => i >= q.options!.length) || (q.format === 'multiple-choice' && q.correctIndices.length !== 1))) fail();
  if (q.format === 'matching' && (!q.pairs || !unique(q.pairs.map(p => p.left)) || !unique(q.pairs.map(p => p.right)))) fail();
  if (q.format === 'ordering' && !q.sequence) fail();
  if (q.format === 'fill-blank' && (!q.template || !q.blanks || q.template.split('___').length - 1 !== q.blanks.length)) fail();
  if (['written-recall', 'source-analysis', 'essay'].includes(q.format) && (!q.rubric || !unique(q.rubric.map(p => p.id)) || q.rubric.reduce((n, p) => n + p.marks, 0) !== q.marks)) fail();
});
export const responseInput = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('none') }),
  z.strictObject({ kind: z.literal('choice'), indices: z.array(z.number().int().min(0).max(19)).max(20).refine(unique) }),
  z.strictObject({ kind: z.literal('text'), text }),
  z.strictObject({ kind: z.literal('blanks'), values: z.array(text).max(20) }),
  z.strictObject({ kind: z.literal('ordering'), sequence: z.array(short).max(20).refine(unique) }),
  z.strictObject({ kind: z.literal('matching'), assignments: z.record(short, z.string().max(2000)).refine(v => Object.keys(v).length <= 20) }),
  z.strictObject({ kind: z.literal('self-rating'), rating: z.enum(['again', 'hard', 'good', 'easy']) }),
]);
export function validResponse(q: Question, a: AnswerValue) {
  if (a.kind === 'none') return true;
  switch (q.format) {
    case 'flashcard': return a.kind === 'self-rating';
    case 'multiple-choice': case 'multiple-select': return a.kind === 'choice' && (q.format !== 'multiple-choice' || a.indices.length <= 1) && a.indices.every(i => i < (q.options?.length ?? 0));
    case 'fill-blank': return a.kind === 'blanks' && a.values.length === q.blanks?.length;
    case 'matching': return a.kind === 'matching' && Object.entries(a.assignments).every(([l, r]) => q.pairs?.some(p => p.left === l) && (!r || q.pairs.some(p => p.right === r)));
    case 'ordering': return a.kind === 'ordering' && a.sequence.length === q.sequence?.length && a.sequence.every(v => q.sequence!.includes(v));
    default: return a.kind === 'text';
  }
}
export const createSetInput = z.strictObject({ id: uuid, name: z.string().trim().min(1).max(200), questionIds: z.array(uuid).min(1).max(50).refine(unique), feedback: z.enum(['immediate', 'end']), hintsAllowed: z.boolean(), remediatesAttemptId: uuid.optional() });
export const writeInput = z.strictObject({ operationId: uuid, expectedRevision: z.number().int().positive() });
export const metadataInput = writeInput.extend({ name: z.string().trim().min(1).max(200), archived: z.boolean() });
export const answerBatch = z.array(z.strictObject({ itemId: uuid, response: responseInput })).max(50).refine(v => unique(v.map(i => i.itemId)));
export const runWriteInput = writeInput.extend({ answers: answerBatch, position: z.number().int().min(0).max(49) });
export const transitionInput = writeInput.extend({ itemId: uuid, action: z.enum(['check', 'reveal', 'hint']) });
export const pageQuery = z.strictObject({ cursor: uuid.optional(), limit: z.coerce.number().int().min(1).max(100).default(30), archived: z.enum(['true', 'false', 'all']).default('false') });
export type VersionedQuestion = Question & { source?: z.infer<typeof sourceInput>; topicLabel: string; origin: 'imported' | 'generated'; originalId?: string };
export type LearningSet = { id: string; courseId: string; name: string; archived: boolean; revision: number; feedback: 'immediate' | 'end'; hintsAllowed: boolean };
export type RunItem = { id: string; question: Question; response: AnswerValue; checked: boolean; revealed: boolean; hinted: boolean; feedback?: QuestionAttempt };
export type FlashcardReview = { itemIds: string[]; firstRatings: Record<string, Extract<AnswerValue, { kind: 'self-rating' }>> };
export type LearningRun = { flashcardReview?: FlashcardReview | null; id: string; courseId: string; setId: string; title: string; revision: number; state: 'active' | 'submitted'; position: number; feedback: 'immediate' | 'end'; hintsAllowed: boolean; items: RunItem[]; attemptId: string | null; startedAt: string; exam?: ExamRuntime | null; deadlineAt?: string; serverNow?: string };
export type LearningAttempt = { sampleTimingNotice?: string; sampleDataset?: string; flashcardReview?: FlashcardReview | null; id: string; runId: string; courseId: string; title: string; startedAt: string; completedAt: string; markingVersion: string; questions: { question: VersionedQuestion; result: QuestionAttempt }[]; marksAwarded: number; marksAvailable: number; pending: number; exam?: ExamRuntime | null; finish?: 'manual' | 'expired'; plannedSessionId?: string; remediatesAttemptId?: string; imported?: Attempt };

export function sameAnswer(a: unknown, b: unknown): boolean {
  const canonical = (value: unknown): unknown => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)])) : value;
  return JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
}
