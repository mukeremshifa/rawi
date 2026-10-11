import { and, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { BackendBindings } from '../../config';
import { transaction, type SocketDb } from '../../db/client';
import { aiOperations, knowledgeFacts, knowledgeSections, learningSets, materials, questionPool, questionSources, questionVersions, sectionLinks, setItems, topics } from '../../db/schema';
import { ApiError } from '../../errors';
import { run, type CallContext, type Task } from '../../ai/engine';
import { DATA_RULE, escapeTags, house, parsed, schemaOf } from '../../ai/style';
import type { Language } from '../../ai/types';
import { uuid } from '../../../shared/contracts/workspace';
import { citationInput } from '../../../shared/contracts/document';
import { questionInput, type VersionedQuestion } from '../../../shared/contracts/learning';
import type { Difficulty } from '../../../shared/domain/types';
import { promptKey } from '../../../shared/domain/prompt-key';
import { hash } from '../materials';
import { bumpPlanner } from '../planning';
import { blockTopics, sectionTopic } from '../outline/links';
import { sections as versionSections, versionBlocks } from '../outline/sections';
import { blockMarkdown } from '../../../shared/domain/document-text';
import type { PoolFormat, PoolQuestion, PoolVerification } from '../knowledge/types';

export const QUESTIONS_PROMPT_VERSION = 'questions-v1';

export const generateInput = z.strictObject({
  operationId: uuid, name: z.string().trim().min(1).max(200), format: z.enum(['flashcard', 'multiple-choice', 'written-recall']), count: z.number().int().min(1).max(10),
  topicIds: z.array(uuid).max(20).default([]), materialIds: z.array(uuid).max(20).default([]), sections: z.array(citationInput).max(10).default([]),
  difficulties: z.array(z.enum(['recall', 'reasoning', 'stretch'])).min(1).max(3),
}).refine(v => v.topicIds.length + v.materialIds.length + v.sections.length > 0, 'Choose topics, materials or sections to generate from.');

/* ── Tasks ───────────────────────────────────────────────────────────────── */

interface Target { key: string; heading: string; facts: string[]; blocks: { key: string; text: string }[]; difficulty: Difficulty; count: number }
interface WriteInput { language: Language; materialTitle: string; format: PoolFormat; targets: Target[] }

const FORMAT_NOTE: Record<PoolFormat, string> = {
  flashcard: 'Flashcards: "prompt" is the front, a short question or term. "answer" is the back, one to three sentences. Leave options, correctIndex and rubric out.',
  'multiple-choice': 'Multiple choice: exactly 4 options, one correct, with "correctIndex" its zero-based position. Distractors are plausible and clearly wrong by the material. Vary the correct position. "answer" repeats the correct option. Leave rubric out.',
  'written-recall': 'Written recall: answered in a few sentences from memory. "answer" is a model answer. "rubric" has 2 to 4 points, each a "label" naming one thing a strong answer shows, whole "marks" from 1 to 3, and "missedAdvice" for a student who missed it. Leave options and correctIndex out.',
};
const writeSchema = z.object({
  questions: z.array(z.object({
    target: z.string(), prompt: z.string(), answer: z.string(), explanation: z.string(),
    options: z.array(z.string()).optional(), correctIndex: z.number().int().optional(),
    rubric: z.array(z.object({ label: z.string(), marks: z.number().int(), missedAdvice: z.string() })).optional(),
    blocks: z.array(z.string()).describe('Keys of the blocks the answer comes from'),
  })),
});

/** Writes candidate questions for several sections at once, from their facts and blocks. */
export const writeTask: Task<WriteInput, z.infer<typeof writeSchema>> = {
  name: 'questions.write', promptVersion: QUESTIONS_PROMPT_VERSION, tiers: ['writer'], serviceTier: 'standard', cache: 'none', temperature: 0.5,
  maxOutput: 5000, language: i => i.language,
  build: i => ({
    system: [
      'You write practice questions for a university student from their course material.',
      'Each question tests understanding of the section it belongs to and is answerable from that section alone. Do not test trivia about wording.',
      'Do not mention "the passage", "the text" or "the section" in a prompt: the student will not see it while answering.',
      'Cite the keys of the blocks each answer comes from. Use only keys from the question\'s own section.',
      'recall checks a fact or definition, reasoning asks why or how, stretch applies the idea to a new case.',
      FORMAT_NOTE[i.format], DATA_RULE, house(i.language),
    ].join('\n'),
    prompt: `<document title="${escapeTags(i.materialTitle)}">\n${i.targets.map(t => `<section key="${t.key}" heading="${escapeTags(t.heading)}" difficulty="${t.difficulty}" questions="${t.count}">\nFacts:\n${t.facts.map(f => `- ${escapeTags(f)}`).join('\n')}\n${t.blocks.map(b => `<block key="${b.key}">${escapeTags(b.text)}</block>`).join('\n')}\n</section>`).join('\n')}\n</document>\nWrite the number of questions each section asks for, at its difficulty, with "target" set to the section key.`,
    schema: schemaOf(writeSchema),
  }),
  check: r => parsed(writeSchema, r.json),
};

const checkSchema = z.object({ verdicts: z.array(z.object({ id: z.string(), supported: z.boolean(), answerCorrect: z.boolean(), correctOptions: z.array(z.number().int()).describe('For multiple choice, the numbers of every option the source makes correct. Empty otherwise.'), reason: z.string() })) });
/** A second, cheap reader confirms each answer against the blocks it cites. */
export const checkTask: Task<{ language: Language; items: { id: string; question: string; answer: string; options?: string[]; source: string }[] }, z.infer<typeof checkSchema>> = {
  name: 'questions.check', promptVersion: QUESTIONS_PROMPT_VERSION, tiers: ['small'], serviceTier: 'standard', cache: 'none', temperature: 0,
  maxOutput: 1500, language: i => i.language,
  build: i => ({
    system: ['You check practice questions against the source text they cite.', 'supported: the question can be answered from the source alone. answerCorrect: the given answer is correct by the source.', 'For multiple choice, judge every option on its own and list the number of each option the source makes correct, ignoring which answer was given.', 'Give a short reason. Be strict.', DATA_RULE, house(i.language)].join('\n'),
    prompt: i.items.map(q => `<item id="${q.id}">\nQuestion: ${escapeTags(q.question)}\n${q.options ? `Options: ${q.options.map((o, n) => `${n + 1}. ${escapeTags(o)}`).join(' | ')}\n` : ''}Answer: ${escapeTags(q.answer)}\n<document>${escapeTags(q.source)}</document>\n</item>`).join('\n'),
    schema: schemaOf(checkSchema),
  }),
  check: (r, i) => { const v = parsed(checkSchema, r.json); return v && i.items.every(q => v.verdicts.some(o => o.id === q.id)) ? v : null; },
};

/** Rules that need no model. Each returns the reasons a question fails. */
export function ruleCheck(q: z.infer<typeof writeSchema>['questions'][number], format: PoolFormat): string[] {
  const out: string[] = [];
  if (q.prompt.trim().length < 8 || q.prompt.length > 600) out.push('prompt_length');
  if (/\b(the|this) (passage|text|section|excerpt)\b/i.test(q.prompt)) out.push('mentions_source');
  if (!q.answer.trim() || !q.explanation.trim()) out.push('missing_answer');
  if (format === 'multiple-choice') {
    const options = q.options ?? [];
    if (options.length !== 4 || new Set(options.map(promptKey)).size !== 4) out.push('options');
    if (q.correctIndex === undefined || q.correctIndex < 0 || q.correctIndex > 3) out.push('correct_index');
    else if (promptKey(options[q.correctIndex] ?? '') !== promptKey(q.answer)) out.push('answer_mismatch');
  }
  if (format === 'written-recall' && (!q.rubric || q.rubric.length < 2 || q.rubric.length > 4 || q.rubric.some(r => r.marks < 1 || r.marks > 3 || !r.label.trim()))) out.push('rubric');
  if (format !== 'multiple-choice' && q.options?.length) out.push('unexpected_options');
  return out;
}

/* ── Sections to generate from ───────────────────────────────────────────── */

type Section = { materialId: string; versionId: string; sectionBlockId: string | null; heading: string; blockIds: string[]; language: Language };

async function targetSections(db: SocketDb, workspaceId: string, courseId: string, input: z.infer<typeof generateInput>): Promise<Section[]> {
  const scope = { workspaceId, courseId };
  const current = sql`${knowledgeSections.versionId} in (select m.current_version_id from ${materials} m where m.workspace_id = ${workspaceId} and m.course_id = ${courseId} and not m.archived)`;
  const all = await db.select({ materialId: knowledgeSections.materialId, versionId: knowledgeSections.versionId, sectionBlockId: knowledgeSections.sectionBlockId, heading: knowledgeSections.heading, blockIds: knowledgeSections.blockIds, language: knowledgeSections.language })
    .from(knowledgeSections).where(and(eq(knowledgeSections.workspaceId, workspaceId), eq(knowledgeSections.courseId, courseId), current));
  const chosen = new Map<string, Section>();
  const keep = (s: Section) => chosen.set(`${s.versionId}:${s.sectionBlockId}`, s);
  for (const c of input.sections) for (const s of all) if (s.versionId === c.versionId && s.blockIds.some(id => c.blockIds.includes(id))) keep(s);
  for (const s of all) if (input.materialIds.includes(s.materialId)) keep(s);
  if (input.topicIds.length) {
    const linked = await db.selectDistinct({ versionId: sectionLinks.versionId }).from(sectionLinks).where(and(eq(sectionLinks.workspaceId, workspaceId), eq(sectionLinks.courseId, courseId), inArray(sectionLinks.topicId, input.topicIds), eq(sectionLinks.removed, false)));
    for (const { versionId } of linked) {
      const byBlock = await blockTopics(db, scope, versionId, versionSections(await versionBlocks(db, workspaceId, versionId)));
      for (const s of all) if (s.versionId === versionId && s.blockIds.some(id => byBlock[id]?.some(t => input.topicIds.includes(t)))) keep(s);
    }
  }
  return [...chosen.values()];
}

/* ── Generating a set ────────────────────────────────────────────────────── */

const poolKey = (s: Section, format: string, difficulty: string) => hash(JSON.stringify([s.versionId, s.sectionBlockId, format, difficulty, QUESTIONS_PROMPT_VERSION]));

/**
 * Build a practice set. Checked pool questions for each section, format and difficulty are reused
 * first. Only the shortfall is written, then checked by rules and a cheap reader before saving.
 */
export async function generateSet(env: BackendBindings, db: SocketDb, workspaceId: string, courseId: string, input: z.infer<typeof generateInput>) {
  const fingerprint = await hash(JSON.stringify(input));
  const [prior] = await db.select().from(aiOperations).where(and(eq(aiOperations.workspaceId, workspaceId), eq(aiOperations.id, input.operationId)));
  // A completed request returns its result. A failed one saved nothing, so the same request may run again.
  if (prior) { if (prior.fingerprint !== fingerprint) throw new ApiError(409, 'operation_conflict', 'This request ID belongs to different input.'); if (prior.state !== 'failed') return prior.result; }
  const sections = (await targetSections(db, workspaceId, courseId, input)).slice(0, 8);
  if (!sections.length) throw new ApiError(409, 'no_knowledge', 'Rawi has not finished reading these materials. Try again in a minute.');
  if (prior) await db.update(aiOperations).set({ state: 'running', reason: null, updatedAt: new Date() }).where(eq(aiOperations.id, input.operationId));
  else await db.insert(aiOperations).values({ id: input.operationId, workspaceId, courseId, targetId: input.operationId, task: 'generate', fingerprint, input, state: 'running', promptVersion: QUESTIONS_PROMPT_VERSION });
  const ctx: CallContext = { db, workspaceId, operationId: input.operationId };
  try {
    // Spread the count over sections and difficulties.
    const plan: { section: Section; difficulty: Difficulty; count: number; key: string }[] = [];
    for (let i = 0; i < input.count; i++) {
      const section = sections[i % sections.length]!, difficulty = input.difficulties[i % input.difficulties.length]!;
      const found = plan.find(p => p.section === section && p.difficulty === difficulty);
      if (found) found.count++; else plan.push({ section, difficulty, count: 1, key: await poolKey(section, input.format, difficulty) });
    }
    const used = new Set((await db.select({ poolId: sql<string>`${questionVersions.content}->'provenance'->>'poolId'` }).from(questionVersions).where(and(eq(questionVersions.workspaceId, workspaceId), eq(questionVersions.courseId, courseId), sql`${questionVersions.content}->'provenance'->>'poolId' is not null`))).map(r => r.poolId));
    const pool = await db.select().from(questionPool).where(and(inArray(questionPool.cacheKey, plan.map(p => p.key)), eq(questionPool.state, 'verified')));
    const picked: { id: string; materialId: string; versionId: string; content: PoolQuestion; blockIds: string[]; model?: string }[] = [];
    const short: typeof plan = [];
    for (const p of plan) {
      const fresh = pool.filter(q => q.cacheKey === p.key && !used.has(q.id) && !picked.some(x => x.id === q.id)).slice(0, p.count);
      picked.push(...fresh);
      if (fresh.length < p.count) short.push({ ...p, count: p.count - fresh.length });
    }
    if (short.length) picked.push(...await fillPool(env, ctx, courseId, input.format, short));
    if (!picked.length) throw new ApiError(502, 'ai_invalid', 'None of the written questions passed their checks. No set was saved.');
    return await saveSet(db, workspaceId, courseId, input, fingerprint, picked);
  } catch (error) {
    const reason = error instanceof ApiError ? error.message : 'The set could not be generated.';
    await db.update(aiOperations).set({ state: 'failed', reason, updatedAt: new Date() }).where(eq(aiOperations.id, input.operationId));
    throw error;
  }
}

/** Write questions for the shortfall, check them, and store both outcomes in the pool. */
async function fillPool(env: BackendBindings, ctx: CallContext, courseId: string, format: PoolFormat, short: { section: Section; difficulty: Difficulty; count: number; key: string }[]) {
  const { db } = ctx;
  const versionIds = [...new Set(short.map(s => s.section.versionId))];
  const [facts, versions, titles] = await Promise.all([
    db.select().from(knowledgeFacts).where(inArray(knowledgeFacts.versionId, versionIds)),
    Promise.all(versionIds.map(id => versionBlocks(db, ctx.workspaceId, id))),
    db.select({ id: materials.id, title: materials.title }).from(materials).where(inArray(materials.id, [...new Set(short.map(s => s.section.materialId))])),
  ]);
  // Each block's own text, whole. Text conversion was unsure of is not used to write questions.
  const blockText = new Map<string, string>();
  for (const b of versions.flat()) if (b.type !== 'heading' && !b.flags?.uncertain) blockText.set(b.id, blockMarkdown(b));
  const keys = new Map<string, { blockId: string; target: number }>();
  let n = 0;
  const targets: Target[] = short.map((p, t) => ({
    key: `t${t}`, heading: p.section.heading, difficulty: p.difficulty, count: Math.min(5, p.count + 1),
    facts: facts.filter(f => f.versionId === p.section.versionId && f.sectionBlockId === p.section.sectionBlockId).map(f => f.text).slice(0, 10),
    blocks: p.section.blockIds.flatMap(id => { const text = blockText.get(id)?.trim(); if (!text) return []; const key = `b${n++}`; keys.set(key, { blockId: id, target: t }); return [{ key, text: text.slice(0, 2000) }]; }).slice(0, 30),
  }));
  const language = short[0]!.section.language;
  const written = await run(env, ctx, writeTask, { language, materialTitle: titles[0]?.title ?? '', format, targets });
  const candidates = written.value.questions.flatMap((q, i) => {
    const t = targets.findIndex(x => x.key === q.target);
    if (t < 0) return [];
    const blockIds = [...new Set(q.blocks.map(k => keys.get(k)).filter(k => k?.target === t).map(k => k!.blockId))];
    const rules = ruleCheck(q, format);
    if (!blockIds.length) rules.push('no_citation');
    return [{ id: `q${i}`, q, plan: short[t]!, blockIds, rules }];
  });
  const seen = new Set<string>();
  for (const c of candidates) { const key = promptKey(c.q.prompt); if (seen.has(key)) c.rules.push('duplicate'); seen.add(key); }
  const checkable = candidates.filter(c => !c.rules.length);
  const verdicts = checkable.length ? (await run(env, ctx, checkTask, { language, items: checkable.map(c => ({ id: c.id, question: c.q.prompt, answer: c.q.answer, options: c.q.options, source: c.blockIds.map(id => blockText.get(id) ?? '').join('\n') })) })) : null;
  const rows = candidates.map(c => {
    const v = verdicts?.value.verdicts.find(o => o.id === c.id);
    const verification: PoolVerification = { rules: c.rules, checker: v ? { model: verdicts!.route.model, supported: v.supported, answerCorrect: v.answerCorrect, reason: v.reason.slice(0, 300) } : null };
    const content: PoolQuestion = { format, difficulty: c.plan.difficulty, prompt: c.q.prompt.trim(), answer: c.q.answer.trim(), explanation: c.q.explanation.trim(), ...(format === 'multiple-choice' ? { options: c.q.options, correctIndex: c.q.correctIndex } : {}), ...(format === 'written-recall' ? { rubric: c.q.rubric } : {}) };
    // For multiple choice the checker's own list of correct options must be exactly the keyed one.
    if (v && format === 'multiple-choice' && (v.correctOptions.length !== 1 || v.correctOptions[0] !== (c.q.correctIndex ?? -1) + 1)) c.rules.push('options_ambiguous');
    const state = !c.rules.length && v?.supported && v.answerCorrect ? 'verified' as const : 'rejected' as const;
    return { id: crypto.randomUUID(), workspaceId: ctx.workspaceId, courseId, materialId: c.plan.section.materialId, versionId: c.plan.section.versionId, sectionBlockId: c.plan.section.sectionBlockId, cacheKey: c.plan.key, format, difficulty: c.plan.difficulty, language, content, blockIds: c.blockIds.length ? c.blockIds : c.plan.section.blockIds.slice(0, 1), verification, state };
  });
  // Rejected questions are kept too, so their reasons can be measured.
  if (rows.length) await db.insert(questionPool).values(rows);
  console.log(JSON.stringify({ operation: 'question-pool', written: rows.length, verified: rows.filter(r => r.state === 'verified').length, rules: rows.flatMap(r => r.verification.rules), unsupported: rows.filter(r => r.verification.checker && !(r.verification.checker.supported && r.verification.checker.answerCorrect)).length }));
  // Fill each shortfall from its own section's verified questions.
  return short.flatMap(p => rows.filter(r => r.cacheKey === p.key && r.state === 'verified').slice(0, p.count).map(r => ({ ...r, model: written.route.model })));
}

async function saveSet(db: SocketDb, workspaceId: string, courseId: string, input: z.infer<typeof generateInput>, fingerprint: string, picked: { id: string; materialId: string; versionId: string; content: PoolQuestion; blockIds: string[]; model?: string }[]) {
  return transaction(db, async tx => {
    const questions: VersionedQuestion[] = [];
    for (const p of picked) {
      const source = { materialId: p.materialId, versionId: p.versionId, blockIds: p.blockIds };
      const topicId = (await sectionTopic(tx, { workspaceId, courseId }, source)).topicId ?? undefined;
      const topicLabel = topicId ? (await tx.select({ title: topics.title }).from(topics).where(eq(topics.id, topicId)))[0]?.title : undefined;
      const id = crypto.randomUUID(), q = p.content;
      const rubric = q.rubric?.map((r, i) => ({ ...r, id: `${id}:${i}`, keywords: [] }));
      const content = questionInput.parse({ format: q.format, topicId, difficulty: q.difficulty, marks: rubric?.reduce((n, r) => n + r.marks, 0) ?? 1, prompt: q.prompt, explanation: q.explanation, answer: q.answer, options: q.options, correctIndices: q.correctIndex === undefined ? undefined : [q.correctIndex], rubric, source });
      questions.push({ ...content, id, courseId, ...(topicLabel ? { topicLabel } : {}), origin: 'generated', provenance: { kind: 'generated', model: p.model ?? 'pool', generatedAt: new Date().toISOString(), materialIds: [source.materialId], poolId: p.id } });
    }
    await tx.insert(questionVersions).values(questions.map(content => ({ id: content.id, workspaceId, courseId, content })));
    await tx.insert(questionSources).values(questions.map(q => ({ workspaceId, courseId, questionId: q.id, ...q.source! })));
    const setId = crypto.randomUUID();
    await tx.insert(learningSets).values({ id: setId, workspaceId, courseId, name: input.name, fingerprint, hintsAllowed: true, feedback: 'immediate' });
    await tx.insert(setItems).values(questions.map((q, position) => ({ id: crypto.randomUUID(), workspaceId, courseId, setId, questionId: q.id, position })));
    const result = { setId, count: questions.length };
    await tx.update(aiOperations).set({ state: 'complete', result, model: picked.find(p => p.model)?.model ?? 'pool', reason: null, updatedAt: new Date() }).where(eq(aiOperations.id, input.operationId));
    await bumpPlanner(tx, workspaceId);
    return result;
  });
}
