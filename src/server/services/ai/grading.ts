import { and, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import type { BackendBindings } from '../../config';
import { transaction, type SocketDb } from '../../db/client';
import { aiOperations, feedbackRevisions, knowledgeChunks, materialVersions } from '../../db/schema';
import { ApiError } from '../../errors';
import { run, type Task } from '../../ai/engine';
import { DATA_RULE, escapeTags, house, parsed, schemaOf } from '../../ai/style';
import type { Language } from '../../ai/types';
import { uuid } from '../../../shared/contracts/workspace';
import { hash } from '../materials';
import { attempt } from '../learning';
import { bumpPlanner } from '../planning';

export const GRADING_PROMPT_VERSION = 'grading-v1';
export const gradeInput = z.strictObject({ operationId: uuid });

interface Item { key: string; prompt: string; modelAnswer: string; rubric: { key: string; label: string; marks: number }[]; source: string; response: string }
/** Restrict rubric keys to the ones supplied, so structured output cannot name a label instead. */
function withKeys(schema: Record<string, any>, keys: string[]) {
  schema.properties.items.items.properties.points.items.properties.rubricKey.enum = keys;
  return schema;
}
const gradeSchema = z.object({
  items: z.array(z.object({
    key: z.string(),
    points: z.array(z.object({ rubricKey: z.string().describe('The rubric point key exactly as given, such as r0'), awarded: z.number().int(), feedback: z.string() })),
    summary: z.string().describe('The single most useful next step for the student'),
  })),
});

/** Every written answer of an attempt in one call. A result that misses an item or a point escalates. */
export const gradeTask: Task<{ language: Language; items: Item[] }, z.infer<typeof gradeSchema>> = {
  name: 'grade.written', promptVersion: GRADING_PROMPT_VERSION, tiers: ['small', 'strong'], serviceTier: 'standard', cache: 'none', temperature: 0,
  maxOutput: 3000, language: i => i.language,
  build: i => ({
    system: [
      'You mark a university student\'s written answers against their rubrics and give feedback they can act on.',
      'Judge meaning, not vocabulary. Credit a point when the answer shows the idea in any wording. Give no credit for a keyword without the idea, for listing terms without explanation, or for statements that contradict the source.',
      'Award whole marks from 0 to each point\'s maximum. Feedback for each point says what the answer did or did not show, in one or two sentences addressed to the student.',
      'Mark every item and every rubric point you are given.',
      DATA_RULE, house(i.language),
    ].join('\n'),
    prompt: i.items.map(it => `<item key="${it.key}">\nQuestion: ${escapeTags(it.prompt)}\nModel answer, for the marker only: ${escapeTags(it.modelAnswer)}\nRubric:\n${it.rubric.map(r => `- ${r.key} (${r.marks} ${r.marks === 1 ? 'mark' : 'marks'}): ${escapeTags(r.label)}`).join('\n')}\n${it.source ? `<course_material>${escapeTags(it.source)}</course_material>\n` : ''}<student_answer>\n${escapeTags(it.response)}\n</student_answer>\n</item>`).join('\n\n'),
    schema: withKeys(schemaOf(gradeSchema), [...new Set(i.items.flatMap(it => it.rubric.map(p => p.key)))]),
  }),
  check: (r, i) => {
    const v = parsed(gradeSchema, r.json);
    if (!v) return null;
    // A key followed by its label still names the point.
    for (const item of v.items) for (const p of item.points) p.rubricKey = /^rd+/.exec(p.rubricKey.trim())?.[0] ?? p.rubricKey;
    for (const it of i.items) {
      const out = v.items.find(o => o.key === it.key);
      if (!out || !it.rubric.every(p => out.points.some(o => o.rubricKey === p.key && o.awarded >= 0 && o.awarded <= p.marks))) return null;
    }
    return v;
  },
};

/**
 * Feedback for every written answer in an attempt that has none yet. Other formats are already
 * marked by rules when the attempt is saved, so nothing else goes to a model.
 */
export async function gradeAttempt(env: BackendBindings, db: SocketDb, workspaceId: string, attemptId: string, input: z.infer<typeof gradeInput>) {
  const fingerprint = await hash(JSON.stringify({ attemptId, ...input }));
  const [prior] = await db.select().from(aiOperations).where(and(eq(aiOperations.workspaceId, workspaceId), eq(aiOperations.id, input.operationId)));
  // A completed request returns its result. A failed one saved nothing, so the same request may run again.
  if (prior) { if (prior.fingerprint !== fingerprint) throw new ApiError(409, 'operation_conflict', 'This request ID belongs to different input.'); if (prior.state !== 'failed') return prior.result; }
  const saved = await transaction(db, tx => attempt(tx, workspaceId, attemptId));
  const graded = new Set((await db.select({ q: feedbackRevisions.questionId }).from(feedbackRevisions).where(and(eq(feedbackRevisions.workspaceId, workspaceId), eq(feedbackRevisions.attemptId, attemptId)))).map(r => r.q));
  const written = saved.questions.filter(({ question: q, result }) => q.rubric?.length && result.response.kind === 'text' && result.response.text.trim() && !graded.has(q.id));
  if (!written.length) throw new ApiError(400, 'no_written_response', 'There are no written answers waiting for feedback.');
  if (prior) await db.update(aiOperations).set({ state: 'running', reason: null, updatedAt: new Date() }).where(eq(aiOperations.id, input.operationId));
  else await db.insert(aiOperations).values({ id: input.operationId, workspaceId, courseId: saved.courseId, targetId: attemptId, task: 'grade', fingerprint, input, state: 'running', promptVersion: GRADING_PROMPT_VERSION });
  try {
    // The cited source, from the knowledge layer, so the marker reads what the student studied.
    const sources = written.flatMap(w => w.question.source ? [w.question.source] : []);
    const chunks = sources.length ? await db.select({ versionId: knowledgeChunks.versionId, blockIds: knowledgeChunks.blockIds, text: knowledgeChunks.text }).from(knowledgeChunks).where(inArray(knowledgeChunks.versionId, [...new Set(sources.map(s => s.versionId))])) : [];
    const [version] = sources[0] ? await db.select({ language: materialVersions.language }).from(materialVersions).where(eq(materialVersions.id, sources[0].versionId)) : [];
    const items: Item[] = written.map(({ question: q, result }, i) => ({
      key: `a${i}`, prompt: q.prompt, modelAnswer: q.answer ?? '', response: result.response.kind === 'text' ? result.response.text.slice(0, 6000) : '',
      rubric: q.rubric!.map((r, n) => ({ key: `r${n}`, label: r.label, marks: r.marks })),
      source: q.source ? chunks.filter(c => c.versionId === q.source!.versionId && c.blockIds.some(id => q.source!.blockIds.includes(id))).map(c => c.text).join('\n\n').slice(0, 4000) : '',
    }));
    const served = await run(env, { db, workspaceId, operationId: input.operationId }, gradeTask, { language: version?.language ?? 'en', items });
    return await transaction(db, async tx => {
      for (const [i, { question: q }] of written.entries()) {
        const out = served.value.items.find(o => o.key === `a${i}`)!;
        const prior = await tx.select({ revision: feedbackRevisions.revision }).from(feedbackRevisions).where(and(eq(feedbackRevisions.attemptId, attemptId), eq(feedbackRevisions.questionId, q.id)));
        const points = q.rubric!.map((r, n) => { const p = out.points.find(o => o.rubricKey === `r${n}`)!; return { rubricId: r.id, awarded: p.awarded, max: r.marks, feedback: p.feedback.trim() }; });
        await tx.insert(feedbackRevisions).values({ id: crypto.randomUUID(), workspaceId, courseId: saved.courseId, attemptId, questionId: q.id, operationId: i === 0 ? input.operationId : null, revision: Math.max(0, ...prior.map(r => r.revision)) + 1, grading: { method: 'ai', status: 'graded', model: served.route.model, gradedAt: new Date().toISOString(), summary: out.summary.trim(), points } });
      }
      const result = { attemptId, graded: written.length };
      await tx.update(aiOperations).set({ state: 'complete', model: served.route.model, result, reason: null, updatedAt: new Date() }).where(eq(aiOperations.id, input.operationId));
      await bumpPlanner(tx, workspaceId);
      return result;
    });
  } catch (error) {
    const reason = error instanceof ApiError ? error.message : 'Feedback could not be written.';
    await db.update(aiOperations).set({ state: 'failed', reason, updatedAt: new Date() }).where(eq(aiOperations.id, input.operationId));
    throw error;
  }
}
