import { and, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import type { BackendBindings } from '../../config';
import { transaction, type SocketDb } from '../../db/client';
import { aiOperations, blocks, feedbackRevisions, materialVersions } from '../../db/schema';
import { ApiError } from '../../errors';
import { uncertainBefore } from './operations';
import { budget, run, type Task } from '../../ai/engine';
import { DATA_RULE, escapeTags, house, parsed, schemaOf } from '../../ai/style';
import type { Language } from '../../ai/types';
import { uuid } from '../../../shared/contracts/workspace';
import { blockMarkdown } from '../../../shared/domain/document-text';
import { hash } from '../materials';
import { attempt } from '../learning';
import { bumpPlanner } from '../planning';

export const GRADING_PROMPT_VERSION = 'grading-v2';
export const gradeInput = z.strictObject({ operationId: uuid });

export interface GradeItem { key: string; prompt: string; modelAnswer: string; rubric: { key: string; label: string; marks: number }[]; source: string; response: string }
/** Restrict rubric keys to the ones supplied, so structured output cannot name a label instead. */
function withKeys(schema: Record<string, any>, keys: string[]) {
  schema.properties.items.items.properties.points.items.properties.rubricKey.enum = keys;
  return schema;
}
const gradeSchema = z.object({
  items: z.array(z.object({
    key: z.string(),
    points: z.array(z.object({
      rubricKey: z.string().describe('The rubric point key exactly as given, such as r0'),
      evidence: z.string().describe('The words of the student answer that show this point, copied exactly. Empty when the answer does not show it.'),
      awarded: z.number().int(),
      feedback: z.string(),
    })),
    summary: z.string().describe('The single most useful next step for the student'),
  })),
});
type Graded = z.infer<typeof gradeSchema>;

const gradeBuild = (i: { language: Language; items: GradeItem[] }) => ({
  system: [
    'You mark a university student\'s written answers against their rubrics and give feedback they can act on.',
    'For each rubric point, first copy the exact words of the student answer that show it into "evidence", then award marks for what those words show.',
    'Judge meaning, not vocabulary. Credit a point when the answer shows the idea in any wording or by a different correct route: the model answer is one correct answer, not the only one.',
    'Give no credit for a keyword without the idea, for a list of terms with no explanation, or for statements that contradict the source. Then leave evidence empty and award 0.',
    'Award whole marks from 0 to each point\'s maximum. Feedback for each point says what the answer did or did not show, in one or two sentences addressed to the student.',
    'Mark every item and every rubric point you are given.',
    DATA_RULE, house(i.language),
  ].join('\n'),
  prompt: i.items.map(it => `<item key="${it.key}">\nQuestion: ${escapeTags(it.prompt)}\nModel answer, for the marker only: ${escapeTags(it.modelAnswer)}\nRubric:\n${it.rubric.map(r => `- ${r.key} (${r.marks} ${r.marks === 1 ? 'mark' : 'marks'}): ${escapeTags(r.label)}`).join('\n')}\n${it.source ? `<course_material>${escapeTags(it.source)}</course_material>\n` : ''}<student_answer>\n${escapeTags(it.response)}\n</student_answer>\n</item>`).join('\n\n'),
  schema: withKeys(schemaOf(gradeSchema), [...new Set(i.items.flatMap(it => it.rubric.map(p => p.key)))]),
});
const gradeCheck = (r: { json?: unknown }, i: { items: GradeItem[] }) => {
  const v = parsed(gradeSchema, r.json);
  if (!v) return null;
  // A key followed by its label still names the point.
  for (const item of v.items) for (const p of item.points) p.rubricKey = /^r\d+/.exec(p.rubricKey.trim())?.[0] ?? p.rubricKey;
  for (const it of i.items) {
    const out = v.items.find(o => o.key === it.key);
    if (!out || !it.rubric.every(p => out.points.some(o => o.rubricKey === p.key && o.awarded >= 0 && o.awarded <= p.marks))) return null;
  }
  return v;
};

/** Written answers in one call. A result that misses an item or a point escalates. */
export const gradeTask: Task<{ language: Language; items: GradeItem[] }, Graded> = {
  name: 'grade.written', data: 'student', promptVersion: GRADING_PROMPT_VERSION, tiers: ['strong'], serviceTier: 'standard', cache: 'none', temperature: 0,
  maxOutput: 3000, language: i => i.language, build: gradeBuild, check: gradeCheck,
};
/** A second marking of only the points whose evidence did not hold up, by a stronger model. */
export const reviewTask: Task<{ language: Language; items: GradeItem[] }, Graded> = { ...gradeTask, name: 'grade.review', tiers: ['strong'] };

/* ── Evidence ────────────────────────────────────────────────────────────── */

const normal = (text: string) => text.toLowerCase().replace(/[‘’]/g, "'").replace(/[^\p{L}\p{N}' ]+/gu, ' ').replace(/\s+/g, ' ').trim();

/**
 * Whether quoted evidence supports an award: every quoted fragment is in the answer, the
 * quote is long enough to state an idea, and it is not a bare list of terms.
 */
export function evidenceHolds(evidence: string, response: string) {
  const answer = normal(response);
  const fragments = evidence.split(/\.\.\.|…/).map(normal).filter(f => f.split(' ').length >= 2);
  if (!fragments.length || !fragments.every(f => answer.includes(f))) return false;
  const words = fragments.join(' ').split(' ').length;
  const separators = (evidence.match(/[,.;/]/g) ?? []).length;
  return words >= 4 && separators < words / 2.5;
}

export interface Marked { key: string; summary: string; points: { key: string; awarded: number; feedback: string; evidence: string }[] }
export type MarkCall = (task: Task<{ language: Language; items: GradeItem[] }, Graded>, input: { language: Language; items: GradeItem[] }) => Promise<{ value: Graded; model: string }>;

/** Items per marking call, and characters of answers and sources. Larger attempts are split. */
const GROUP_ITEMS = 5;
const GROUP_CHARS = 16000;

/**
 * Mark written answers in bounded groups. An award stands only on evidence quoted from the
 * answer. Points whose evidence does not hold up go once more to a stronger model, alone, and
 * an award that still has no evidence becomes zero. Totals are summed from points by the caller.
 */
export async function markItems(call: MarkCall, language: Language, items: GradeItem[]) {
  const groups: GradeItem[][] = [];
  for (const it of items) {
    const last = groups.at(-1), size = (g: GradeItem[]) => g.reduce((n, x) => n + x.response.length + x.source.length, 0);
    if (last && last.length < GROUP_ITEMS && size(last) + it.response.length + it.source.length <= GROUP_CHARS) last.push(it); else groups.push([it]);
  }
  const marked = new Map<string, Marked>();
  const models = new Set<string>();
  for (const group of groups) {
    const { value, model } = await call(gradeTask, { language, items: group });
    models.add(model);
    for (const out of value.items) marked.set(out.key, { key: out.key, summary: out.summary, points: out.points.map(p => ({ key: p.rubricKey, awarded: p.awarded, feedback: p.feedback, evidence: p.evidence })) });
  }
  const byKey = new Map(items.map(it => [it.key, it]));
  const disputed = items.flatMap(it => {
    const out = marked.get(it.key)!;
    const bad = out.points.filter(p => p.awarded > 0 && !evidenceHolds(p.evidence, it.response)).map(p => p.key);
    return bad.length ? [{ ...it, rubric: it.rubric.filter(r => bad.includes(r.key)) }] : [];
  });
  let reviewed = 0;
  if (disputed.length) {
    try {
      const { value, model } = await call(reviewTask, { language, items: disputed });
      models.add(model);
      for (const out of value.items) for (const p of out.points) {
        const point = marked.get(out.key)!.points.find(x => x.key === p.rubricKey)!;
        Object.assign(point, { awarded: p.awarded, feedback: p.feedback, evidence: p.evidence });
        reviewed++;
      }
    } catch { /* The first marking stands, under the evidence rule below. */ }
  }
  // Whatever is still unsupported earns nothing.
  for (const [key, out] of marked) for (const p of out.points) if (p.awarded > 0 && !evidenceHolds(p.evidence, byKey.get(key)!.response)) { p.awarded = 0; p.evidence = ''; }
  return { marked, models: [...models], disputed: disputed.reduce((n, d) => n + d.rubric.length, 0), reviewed };
}

/**
 * Feedback for every written answer in an attempt that has none yet. Other formats are already
 * marked by rules when the attempt is saved, so nothing else goes to a model.
 */
export async function gradeAttempt(env: BackendBindings, db: SocketDb, workspaceId: string, attemptId: string, input: z.infer<typeof gradeInput>) {
  const fingerprint = await hash(JSON.stringify({ attemptId, ...input }));
  const [prior] = await db.select().from(aiOperations).where(and(eq(aiOperations.workspaceId, workspaceId), eq(aiOperations.id, input.operationId)));
  // A completed request returns its result. A failed one saved nothing, so the same request may run again.
  if (prior) { if (prior.fingerprint !== fingerprint) throw new ApiError(409, 'operation_conflict', 'This request ID belongs to different input.'); if (prior.state === 'uncertain') throw uncertainBefore(); if (prior.state !== 'failed') return prior.result; }
  const saved = await transaction(db, tx => attempt(tx, workspaceId, attemptId));
  const graded = new Set((await db.select({ q: feedbackRevisions.questionId }).from(feedbackRevisions).where(and(eq(feedbackRevisions.workspaceId, workspaceId), eq(feedbackRevisions.attemptId, attemptId)))).map(r => r.q));
  const written = saved.questions.filter(({ question: q, result }) => q.rubric?.length && result.response.kind === 'text' && result.response.text.trim() && !graded.has(q.id));
  if (!written.length) throw new ApiError(400, 'no_written_response', 'There are no written answers waiting for feedback.');
  if (prior) await db.update(aiOperations).set({ state: 'running', reason: null, updatedAt: new Date() }).where(eq(aiOperations.id, input.operationId));
  else await db.insert(aiOperations).values({ id: input.operationId, workspaceId, courseId: saved.courseId, targetId: attemptId, task: 'grade', fingerprint, input, state: 'running', promptVersion: GRADING_PROMPT_VERSION });
  try {
    // The exact blocks each question cites, in the version it cites, so the marker reads what the student studied.
    const sources = written.flatMap(w => w.question.source ? [w.question.source] : []);
    const rows = sources.length ? await db.select({ id: blocks.id, type: blocks.type, content: blocks.content }).from(blocks).where(and(eq(blocks.workspaceId, workspaceId), inArray(blocks.id, [...new Set(sources.flatMap(s => s.blockIds))]))) : [];
    const blockText = new Map(rows.map(b => [b.id, blockMarkdown(b as never)]));
    const [version] = sources[0] ? await db.select({ language: materialVersions.language }).from(materialVersions).where(eq(materialVersions.id, sources[0].versionId)) : [];
    const items: GradeItem[] = written.map(({ question: q, result }, i) => ({
      key: `a${i}`, prompt: q.prompt, modelAnswer: q.answer ?? '', response: result.response.kind === 'text' ? result.response.text.slice(0, 6000) : '',
      rubric: q.rubric!.map((r, n) => ({ key: `r${n}`, label: r.label, marks: r.marks })),
      source: q.source ? q.source.blockIds.map(id => blockText.get(id) ?? '').filter(Boolean).join('\n\n').slice(0, 8000) : '',
    }));
    // Marking in groups, escalation and one review of disputed points, about 4 cents at most.
    const ctx = { db, workspaceId, operationId: input.operationId, budget: budget(6 + Math.ceil(items.length / 5) * 2, 40_000, 150) };
    const { marked, models } = await markItems(async (task, i) => { const served = await run(env, ctx, task, i); return { value: served.value, model: served.route.model }; }, version?.language ?? 'en', items);
    const model = models.join(', ');
    return await transaction(db, async tx => {
      for (const [i, { question: q }] of written.entries()) {
        const out = marked.get(`a${i}`)!;
        const prior = await tx.select({ revision: feedbackRevisions.revision }).from(feedbackRevisions).where(and(eq(feedbackRevisions.attemptId, attemptId), eq(feedbackRevisions.questionId, q.id)));
        const points = q.rubric!.map((r, n) => { const p = out.points.find(o => o.key === `r${n}`)!; return { rubricId: r.id, awarded: p.awarded, max: r.marks, feedback: p.feedback.trim(), ...(p.evidence ? { evidence: p.evidence.slice(0, 500) } : {}) }; });
        await tx.insert(feedbackRevisions).values({ id: crypto.randomUUID(), workspaceId, courseId: saved.courseId, attemptId, questionId: q.id, operationId: i === 0 ? input.operationId : null, revision: Math.max(0, ...prior.map(r => r.revision)) + 1, grading: { method: 'ai', status: 'graded', model, gradedAt: new Date().toISOString(), summary: out.summary.trim(), points } });
      }
      const result = { attemptId, graded: written.length };
      await tx.update(aiOperations).set({ state: 'complete', model, result, reason: null, updatedAt: new Date() }).where(eq(aiOperations.id, input.operationId));
      await bumpPlanner(tx, workspaceId);
      return result;
    });
  } catch (error) {
    const reason = error instanceof ApiError ? error.message : 'Feedback could not be written.';
    // A call that may have been charged leaves the request uncertain, so it is never run again under this id.
    const state = error instanceof ApiError && error.code === 'ai_uncertain' ? 'uncertain' as const : 'failed' as const;
    await db.update(aiOperations).set({ state, reason, updatedAt: new Date() }).where(eq(aiOperations.id, input.operationId));
    throw error;
  }
}
