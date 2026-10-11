import { z } from 'zod';
import { uuid } from './workspace';
import { formats, writeInput } from './learning';
import type { ExamConfig, ExamRun } from '../domain/types';

export const examFields = z.strictObject({
  assessmentIds: z.array(uuid).max(100).refine(v => new Set(v).size === v.length).optional(),
  name: z.string().trim().min(1).max(200),
  sections: z.array(z.strictObject({ id: uuid, title: z.string().trim().min(1).max(200), instructions: z.string().max(4000), formats: z.array(z.enum(formats)).min(1).max(9), topicIds: z.array(uuid).max(200), count: z.number().int().min(1).max(50), minutes: z.number().min(0).max(600) })).min(1).max(10),
  timing: z.enum(['overall', 'per-section', 'untimed']), totalMinutes: z.number().min(0).max(600), extraTimePercent: z.number().min(0).max(100), book: z.enum(['open', 'closed']), allowedMaterialIds: z.array(uuid).max(50), navigation: z.enum(['free', 'sequential']), flaggingEnabled: z.boolean(), lockSectionsOnFinish: z.boolean(),
}).superRefine((v, ctx) => {
  if (new Set(v.sections.map(s => s.id)).size !== v.sections.length || v.sections.reduce((n, s) => n + s.count, 0) > 50 || v.sections.some(s => s.formats.includes('flashcard') || s.formats.includes('self-check')) || v.timing === 'overall' && v.totalMinutes <= 0 || v.timing === 'per-section' && v.sections.some(s => s.minutes <= 0)) ctx.addIssue({ code: 'custom', message: 'Use unique sections, up to 50 questions and positive timed durations. Flashcards and self-checks are practice only.' });
});
export const createExamInput = z.strictObject({ operationId: uuid, id: uuid, config: examFields });
export const examTransitionInput = writeInput.extend({ action: z.enum(['navigate', 'finish-section', 'flag']), position: z.number().int().min(0).max(49) });
export type ExamRuntime = Omit<ExamRun, 'answers'> & { activatedSectionIds?: string[]; materialVersions: { materialId: string; versionId: string; title: string }[] };
export type SavedExam = { id: string; courseId: string; config: ExamConfig; revision: number; archived: boolean };
