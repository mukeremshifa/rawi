import { and, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { BackendBindings } from '../../config';
import { transaction, type SocketDb } from '../../db/client';
import { aiOperations, facts as factRows, sections as sectionRows, learningSets, materials, questionPool, questionSources, questionVersions, setItems, topics } from '../../db/schema';
import { ApiError } from '../../errors';
import { uncertainBefore } from './operations';
import { budget, run, type CallContext, type Task } from '../../ai/engine';
import { DATA_RULE, escapeTags, house, parsed, schemaOf } from '../../ai/style';
import type { Language } from '../../ai/types';
import { uuid } from '../../../shared/contracts/workspace';
import { citationInput } from '../../../shared/contracts/document';
import { questionInput, type VersionedQuestion } from '../../../shared/contracts/learning';
import type { Difficulty } from '../../../shared/domain/types';
import { promptKey } from '../../../shared/domain/prompt-key';
import { hash } from '../materials';
import { bumpPlanner } from '../planning';
import { liveLinks, sectionTopic } from '../outline/links';
import { versionBlocks } from '../outline/sections';
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
interface WriteInput { language: Language; materialTitle: string; format: PoolFormat; targets: Target[]; failed?: { target: string; prompt: string; reasons: string[] }[] }

const FORMAT_NOTE: Record<PoolFormat, string> = {
  flashcard: 'Flashcards: "prompt" is the front, a short question or term. "answer" is the back, one to three sentences. Leave options, correctIndex and rubric out.',
  'multiple-choice': 'Multiple choice: exactly 4 options, one correct, with "correctIndex" its zero-based position. Each wrong option is a mistake a student who half-read the material would make: a reversed cause, a confused term, a claim from another section. Write all four in the same form and about the same length, so the right one does not stand out. Never use "all of the above" or "none of the above". Vary the correct position. "answer" repeats the correct option. Leave rubric out.',
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
  name: 'questions.write', promptVersion: QUESTIONS_PROMPT_VERSION, temperature: 0.5,
  needs: { skill: 'write', data: 'institution', lane: 'interactive', maxOutput: 5000, cache: 'none' }, language: i => i.language,
  build: i => ({
    system: [
      'You write practice questions for a university student from their course material.',
      'Each question tests understanding of the section it belongs to and is answerable from that section alone. Do not test trivia about wording.',
      'Do not mention "the passage", "the text" or "the section" in a prompt: the student will not see it while answering.',
      'Cite the keys of the blocks each answer comes from. Use only keys from the question\'s own section.',
      'recall checks a fact or definition, reasoning asks why or how, stretch applies the idea to a new case.',
      FORMAT_NOTE[i.format], DATA_RULE, house(i.language),
    ].join('\n'),
    prompt: `<document title="${escapeTags(i.materialTitle)}">\n${i.targets.map(t => `<section key="${t.key}" heading="${escapeTags(t.heading)}" difficulty="${t.difficulty}" questions="${t.count}">\nFacts:\n${t.facts.map(f => `- ${escapeTags(f)}`).join('\n')}\n${t.blocks.map(b => `<block key="${b.key}">${escapeTags(b.text)}</block>`).join('\n')}\n</section>`).join('\n')}\n</document>\nWrite the number of questions each section asks for, at its difficulty, with "target" set to the section key.${i.failed?.length ? `\nThese earlier questions failed review. Write different questions that avoid their problems:\n${i.failed.map(f => `- [${f.target}] ${escapeTags(f.prompt)}: ${f.reasons.join(', ')}`).join('\n')}` : ''}`,
    schema: schemaOf(writeSchema),
  }),
  check: r => parsed(writeSchema, r.json),
};

const levels = ['recall', 'reasoning', 'stretch'] as const;
const solveSchema = z.object({ verdicts: z.array(z.object({
  id: z.string(),
  answerable: z.boolean().describe('The source alone settles the answer'),
  solution: z.string().describe('Your own answer, from the source, in one or two sentences'),
  correctOptions: z.array(z.number().int()).describe('For multiple choice, the number of every option the source makes correct. Empty otherwise.'),
  weakDistractors: z.array(z.number().int()).describe('For multiple choice, the number of every wrong option a student could rule out without knowing the material. Empty otherwise.'),
  level: z.enum(levels).describe('recall if the source states the answer directly, reasoning if it must be explained from the source, stretch if it applies the idea to a new case'),
  ambiguity: z.string().describe('Why the question could fairly be read two ways, or empty'),
})) });
type SolveItem = { id: string; question: string; options?: string[]; source: string };
/**
 * A second reader solves each question from its source before seeing any proposed answer, so
 * agreement means something. For multiple choice the comparison is done in code.
 */
export const solveTask: Task<{ language: Language; items: SolveItem[] }, z.infer<typeof solveSchema>> = {
  name: 'questions.solve', promptVersion: QUESTIONS_PROMPT_VERSION, temperature: 0,
  needs: { skill: 'check', data: 'institution', lane: 'interactive', maxOutput: 2500, cache: 'none' }, language: i => i.language,
  build: i => ({
    system: ['You answer practice questions using only the source text given with each one.', 'Solve each question yourself. For multiple choice, judge every option on its own against the source.', 'Say if the source does not settle the answer, or if the question could fairly be read two ways.', DATA_RULE, house(i.language)].join('\n'),
    prompt: i.items.map(q => `<item id="${q.id}">\nQuestion: ${escapeTags(q.question)}\n${q.options ? `Options: ${q.options.map((o, n) => `${n + 1}. ${escapeTags(o)}`).join(' | ')}\n` : ''}<document>${escapeTags(q.source)}</document>\n</item>`).join('\n'),
    schema: schemaOf(solveSchema),
  }),
  // A verdict missing for some items leaves those unchecked rather than failing the batch.
  check: (r, i) => { const v = parsed(solveSchema, r.json); return v && i.items.some(q => v.verdicts.some(o => o.id === q.id)) ? v : null; },
};

const compareSchema = z.object({ verdicts: z.array(z.object({
  id: z.string(),
  matches: z.boolean().describe('The proposed answer says what the independent solution says, and the source supports it'),
  rubricSound: z.boolean().describe('For written answers: every rubric point is supported by the source, the points do not overlap, and together they describe a strong answer. True for other formats.'),
  reason: z.string(),
})) });
type CompareItem = { id: string; question: string; proposed: string; solution: string; rubric?: string[]; source: string };
/** Compares a proposed answer with the independent solution, for formats code cannot compare. */
export const compareTask: Task<{ language: Language; items: CompareItem[] }, z.infer<typeof compareSchema>> = {
  name: 'questions.compare', promptVersion: QUESTIONS_PROMPT_VERSION, temperature: 0,
  needs: { skill: 'check', data: 'institution', lane: 'interactive', maxOutput: 1500, cache: 'none' }, language: i => i.language,
  build: i => ({
    system: ['You review practice questions. Each comes with a proposed answer, an independent solution written from the source without seeing it, and the source.', 'Judge whether the proposed answer agrees with the solution and the source in substance, not wording. For written answers, judge the rubric too.', 'Give a short reason. Be strict.', DATA_RULE, house(i.language)].join('\n'),
    prompt: i.items.map(q => `<item id="${q.id}">\nQuestion: ${escapeTags(q.question)}\nProposed answer: ${escapeTags(q.proposed)}\nIndependent solution: ${escapeTags(q.solution)}\n${q.rubric ? `Rubric:\n${q.rubric.map(r => `- ${escapeTags(r)}`).join('\n')}\n` : ''}<document>${escapeTags(q.source)}</document>\n</item>`).join('\n'),
    schema: schemaOf(compareSchema),
  }),
  check: (r, i) => { const v = parsed(compareSchema, r.json); return v && i.items.every(q => v.verdicts.some(o => o.id === q.id)) ? v : null; },
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
    // A key far longer than every distractor gives itself away.
    else if (options.every((o, i) => i === q.correctIndex || options[q.correctIndex!]!.length > o.length * 1.6)) out.push('key_longest');
    if (options.some(o => /^(all|none|both) of the above$/i.test(o.trim()))) out.push('above_option');
  }
  if (format !== 'multiple-choice' && q.answer.trim().length > 12 && promptKey(q.prompt).includes(promptKey(q.answer))) out.push('answer_in_prompt');
  if (format === 'written-recall' && (!q.rubric || q.rubric.length < 2 || q.rubric.length > 4 || q.rubric.some(r => r.marks < 1 || r.marks > 3 || !r.label.trim()) || new Set(q.rubric.map(r => promptKey(r.label))).size !== q.rubric.length)) out.push('rubric');
  if (format !== 'multiple-choice' && q.options?.length) out.push('unexpected_options');
  return out;
}

/* ── Sections to generate from ───────────────────────────────────────────── */

type Section = { materialId: string; versionId: string; sectionBlockId: string | null; heading: string; blockIds: string[]; language: Language };

async function targetSections(db: SocketDb, workspaceId: string, courseId: string, input: z.infer<typeof generateInput>): Promise<Section[]> {
  const scope = { workspaceId, courseId };
  const current = sql`${sectionRows.versionId} in (select m.current_version_id from ${materials} m where m.workspace_id = ${workspaceId} and m.course_id = ${courseId} and not m.archived)`;
  const all: Section[] = await db.select({ materialId: sectionRows.materialId, versionId: sectionRows.versionId, sectionBlockId: sectionRows.headingBlockId, heading: sectionRows.heading, blockIds: sectionRows.blockIds, language: sectionRows.language })
    .from(sectionRows).where(and(eq(sectionRows.workspaceId, workspaceId), eq(sectionRows.courseId, courseId), current)).orderBy(sectionRows.versionId, sectionRows.ordinal);
  const chosen = new Map<string, Section>();
  const keep = (s: Section) => chosen.set(`${s.versionId}:${s.sectionBlockId}`, s);
  for (const c of input.sections) for (const s of all) if (s.versionId === c.versionId && s.blockIds.some(id => c.blockIds.includes(id))) keep(s);
  for (const s of all) if (input.materialIds.includes(s.materialId)) keep(s);
  if (input.topicIds.length) {
    const linked = new Set((await liveLinks(db, scope)).filter(l => input.topicIds.includes(l.topicId)).map(l => `${l.section.versionId}:${l.section.blockIds[0]}`));
    for (const s of all) if (linked.has(`${s.versionId}:${s.blockIds[0]}`)) keep(s);
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
  if (prior) { if (prior.fingerprint !== fingerprint) throw new ApiError(409, 'operation_conflict', 'This request ID belongs to different input.'); if (prior.state === 'uncertain') throw uncertainBefore(); if (prior.state !== 'failed') return prior.result; }
  const sections = (await targetSections(db, workspaceId, courseId, input)).slice(0, 8);
  if (!sections.length) throw new ApiError(409, 'no_knowledge', 'Rawi has not finished reading these materials. Try again in a minute.');
  if (prior) await db.update(aiOperations).set({ state: 'running', reason: null, updatedAt: new Date() }).where(eq(aiOperations.id, input.operationId));
  else await db.insert(aiOperations).values({ id: input.operationId, workspaceId, courseId, targetId: input.operationId, task: 'generate', fingerprint, input, state: 'running', promptVersion: QUESTIONS_PROMPT_VERSION });
  // Writing, checking and one repair round for a set of up to ten questions, about 6 cents at most.
  const ctx: CallContext = { db, workspaceId, operationId: input.operationId, budget: budget(8, 60_000, 180) };
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
    // A call that may have been charged leaves the request uncertain, so it is never run again under this id.
    const state = error instanceof ApiError && error.code === 'ai_uncertain' ? 'uncertain' as const : 'failed' as const;
    await db.update(aiOperations).set({ state, reason, updatedAt: new Date() }).where(eq(aiOperations.id, input.operationId));
    throw error;
  }
}

/** Runs of three words, to spot a question that repeats another in different order or small edits. */
const shingles = (text: string) => { const w = promptKey(text).split(' '); return new Set(w.slice(2).map((x, i) => `${w[i]} ${w[i + 1]} ${x}`)); };
const similar = (a: string, b: string) => { const x = shingles(a), y = shingles(b); let n = 0; for (const s of x) if (y.has(s)) n++; return n / Math.max(1, Math.min(x.size, y.size)); };

type Written = z.infer<typeof writeSchema>['questions'][number];
type Candidate = { id: string; q: Written; plan: { section: Section; difficulty: Difficulty; count: number; key: string }; blockIds: string[]; rules: string[]; checker: PoolVerification['checker'] };

/**
 * Checks candidates by rules, then by a second reader that solves each one from its source
 * before any answer is compared. Rules and verdicts are recorded on each candidate.
 */
async function verify(env: BackendBindings, ctx: CallContext, language: Language, format: PoolFormat, candidates: Candidate[], blockText: Map<string, string>, existing: string[]) {
  const seen = [...existing];
  for (const c of candidates) {
    c.rules.push(...ruleCheck(c.q, format));
    if (!c.blockIds.length) c.rules.push('no_citation');
    if (seen.some(p => similar(p, c.q.prompt) > 0.6)) c.rules.push('duplicate');
    seen.push(c.q.prompt);
  }
  const checkable = candidates.filter(c => !c.rules.length);
  if (!checkable.length) return;
  const source = (c: Candidate) => c.blockIds.map(id => blockText.get(id) ?? '').join('\n\n');
  const solved = await run(env, ctx, solveTask, { language, items: checkable.map(c => ({ id: c.id, question: c.q.prompt, options: c.q.options, source: source(c) })) });
  const compared = format === 'multiple-choice' ? null : await run(env, ctx, compareTask, { language, items: checkable.map(c => ({ id: c.id, question: c.q.prompt, proposed: c.q.answer, solution: solved.value.verdicts.find(v => v.id === c.id)?.solution ?? '', rubric: c.q.rubric?.map(r => `${r.label} (${r.marks})`), source: source(c) })) });
  for (const c of checkable) {
    const s = solved.value.verdicts.find(v => v.id === c.id);
    if (!s) { c.rules.push('unchecked'); continue; }
    const m = compared?.value.verdicts.find(v => v.id === c.id);
    const keyed = (c.q.correctIndex ?? -1) + 1;
    const answerCorrect = format === 'multiple-choice' ? s.correctOptions.length === 1 && s.correctOptions[0] === keyed : !!m?.matches;
    if (!s.answerable) c.rules.push('unanswerable');
    if (s.ambiguity.trim() || (format === 'multiple-choice' && s.correctOptions.length > 1)) c.rules.push('ambiguous');
    // Every distractor easy to rule out makes the question a giveaway. One or two weak ones are recorded only.
    if (format === 'multiple-choice' && new Set(s.weakDistractors.filter(n => n !== keyed && n >= 1 && n <= 4)).size >= 3) c.rules.push('weak_distractors');
    if (Math.abs(levels.indexOf(s.level) - levels.indexOf(c.plan.difficulty)) >= 2) c.rules.push('difficulty');
    if (m && !m.rubricSound) c.rules.push('rubric_unsound');
    c.checker = { model: [solved.route.model, compared?.route.model].filter(Boolean).join(', '), supported: s.answerable, answerCorrect, reason: (m?.reason || s.ambiguity || s.solution).slice(0, 300) };
  }
}

/** Repair rounds for failed questions. One keeps the cost of a set bounded. */
const MAX_REPAIRS = 1;

/**
 * Write questions for the shortfall, check them, and store every outcome in the pool. Only the
 * sections still short after checking are written again, once, told why the others failed.
 */
async function fillPool(env: BackendBindings, ctx: CallContext, courseId: string, format: PoolFormat, short: { section: Section; difficulty: Difficulty; count: number; key: string }[]) {
  const { db } = ctx;
  const versionIds = [...new Set(short.map(s => s.section.versionId))];
  const [facts, versions, titles, existing] = await Promise.all([
    db.select({ versionId: factRows.versionId, text: factRows.text, sectionBlockId: sectionRows.headingBlockId }).from(factRows).innerJoin(sectionRows, eq(sectionRows.id, factRows.sectionId)).where(inArray(factRows.versionId, versionIds)),
    Promise.all(versionIds.map(id => versionBlocks(db, ctx.workspaceId, id))),
    db.select({ id: materials.id, title: materials.title }).from(materials).where(inArray(materials.id, [...new Set(short.map(s => s.section.materialId))])),
    db.select({ prompt: sql<string>`${questionPool.content}->>'prompt'` }).from(questionPool).where(and(inArray(questionPool.cacheKey, short.map(s => s.key)), eq(questionPool.state, 'verified'))),
  ]);
  // Each block's own text, whole. Text conversion was unsure of is not used to write questions.
  const blockText = new Map<string, string>();
  for (const b of versions.flat()) if (b.type !== 'heading' && !b.flags?.uncertain) blockText.set(b.id, blockMarkdown(b));
  const language = short[0]!.section.language;
  const keys = new Map<string, { blockId: string; target: number }>();
  let n = 0, written: Awaited<ReturnType<typeof run<WriteInput, z.infer<typeof writeSchema>>>> | null = null;
  const all: Candidate[] = [];
  let pending = short.map(p => ({ ...p })), failed: WriteInput['failed'] = [];
  for (let round = 0; round <= MAX_REPAIRS && pending.length; round++) {
    const targets: Target[] = pending.map((p, t) => ({
      key: `t${t}`, heading: p.section.heading, difficulty: p.difficulty, count: Math.min(5, p.count),
      facts: facts.filter(f => f.versionId === p.section.versionId && f.sectionBlockId === p.section.sectionBlockId).map(f => f.text).slice(0, 10),
      blocks: p.section.blockIds.flatMap(id => { const text = blockText.get(id)?.trim(); if (!text) return []; const key = `b${n++}`; keys.set(key, { blockId: id, target: t }); return [{ key, text: text.slice(0, 4000) }]; }).slice(0, 30),
    }));
    // A repair round that fails keeps what the first round accepted.
    try { written = await run(env, ctx, writeTask, { language, materialTitle: titles[0]?.title ?? '', format, targets, failed }); }
    catch (error) { if (round === 0) throw error; break; }
    const fresh: Candidate[] = written.value.questions.flatMap((q, i) => {
      const t = targets.findIndex(x => x.key === q.target);
      if (t < 0) return [];
      const blockIds = [...new Set(q.blocks.map(k => keys.get(k)).filter(k => k?.target === t).map(k => k!.blockId))];
      // A missing key whose answer is exactly one of the options is that option. Nothing else is guessed.
      if (format === 'multiple-choice' && q.correctIndex === undefined && q.options) {
        const at = q.options.map(promptKey).indexOf(promptKey(q.answer));
        if (at >= 0 && q.options.map(promptKey).lastIndexOf(promptKey(q.answer)) === at) q.correctIndex = at;
      }
      return [{ id: `r${round}q${i}`, q, plan: pending[t]!, blockIds, rules: [], checker: null }];
    });
    // A check that fails its own validation leaves its questions unchecked, which keeps them out.
    try { await verify(env, ctx, language, format, fresh, blockText, [...existing.map(e => e.prompt), ...all.map(c => c.q.prompt)]); }
    catch (error) { if (!(error instanceof ApiError && error.code === 'ai_invalid')) throw error; for (const c of fresh) if (!c.checker) c.rules.push('unchecked'); }
    all.push(...fresh);
    // Sections still short go round again, with the reasons their questions failed.
    const ok = (c: Candidate) => !c.rules.length && !!c.checker?.supported && c.checker.answerCorrect;
    const next = pending.flatMap(p => { const got = fresh.filter(c => c.plan === p && ok(c)).length; return got < p.count ? [{ ...p, count: p.count - got }] : []; });
    failed = fresh.filter(c => !ok(c)).flatMap(c => { const t = next.findIndex(p => p.key === c.plan.key); return t < 0 ? [] : [{ target: `t${t}`, prompt: c.q.prompt.slice(0, 200), reasons: c.rules.length ? c.rules : ['answer_incorrect'] }]; });
    pending = next;
  }
  const rows = all.map(c => {
    const verification: PoolVerification = { rules: c.rules, checker: c.checker };
    const content: PoolQuestion = { format, difficulty: c.plan.difficulty, prompt: c.q.prompt.trim(), answer: c.q.answer.trim(), explanation: c.q.explanation.trim(), ...(format === 'multiple-choice' ? { options: c.q.options, correctIndex: c.q.correctIndex } : {}), ...(format === 'written-recall' ? { rubric: c.q.rubric } : {}) };
    const state = !c.rules.length && c.checker?.supported && c.checker.answerCorrect ? 'verified' as const : 'rejected' as const;
    return { id: crypto.randomUUID(), workspaceId: ctx.workspaceId, courseId, materialId: c.plan.section.materialId, versionId: c.plan.section.versionId, sectionBlockId: c.plan.section.sectionBlockId, cacheKey: c.plan.key, format, difficulty: c.plan.difficulty, language, content, blockIds: c.blockIds.length ? c.blockIds : c.plan.section.blockIds.slice(0, 1), verification, state };
  });
  // Rejected questions are kept too, so their reasons can be measured.
  if (rows.length) await db.insert(questionPool).values(rows);
  console.log(JSON.stringify({ operation: 'question-pool', written: rows.length, verified: rows.filter(r => r.state === 'verified').length, rules: rows.flatMap(r => r.verification.rules), incorrect: rows.filter(r => r.verification.checker && !(r.verification.checker.supported && r.verification.checker.answerCorrect)).length }));
  // Fill each shortfall from its own section's verified questions.
  return short.flatMap(p => rows.filter(r => r.cacheKey === p.key && r.state === 'verified').slice(0, p.count).map(r => ({ ...r, model: written!.route.model })));
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
