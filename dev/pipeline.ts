/**
 * Development only. Measures the real pipeline on reviewed fixtures: ingestion into the
 * knowledge layer, retrieval, tutor replies, question generation and written grading. It runs
 * in one evaluation workspace on the designated development database, owned by a user with no
 * sign-in, and rebuilds that workspace's knowledge layer on every run. Provider calls are
 * metered like any other, so cost is read back from `ai_calls`. No bundle imports this file.
 *
 *   npx tsx dev/compare.ts --pipeline --label baseline
 *   npx tsx dev/compare.ts --pipeline --suites tutor --repeat 6 --tutor-routes qwen3-32b,mistral-large-3
 *
 * Results print as a table and are written to `dev/results/<label>.json`.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { createHash } from 'node:crypto';
import { Client } from '@neondatabase/serverless';
import { and, eq, gte, inArray, sql } from 'drizzle-orm';
import { socketDb, transaction } from '../src/server/db/client';
import * as s from '../src/server/db/schema';
import type { BackendBindings } from '../src/server/config';
import { bootstrap } from '../src/server/services/workspace';
import { createMaterial, publishVersion } from '../src/server/services/materials';
import { sections as versionSections, versionBlocks } from '../src/server/services/outline/sections';
import { backfillIngest, runIngest } from '../src/server/services/knowledge/ingest';
import { createSession, saveMessage } from '../src/server/services/tutoring';
import { prepare, streamReply } from '../src/server/services/ai/tutor';
import { generateSet } from '../src/server/services/ai/questions';
import { gradeTask } from '../src/server/services/ai/grading';
import { adaptersFor } from '../src/server/ai/engine';
import { cost, route as routeById, TIERS } from '../src/server/ai/catalog';
import type { ModelRequest } from '../src/server/ai/adapters/types';
import { promptKey } from '../src/shared/domain/prompt-key';
import type { Citation } from '../src/shared/contracts/document';
import { SEED_MATERIALS } from './fixtures/materials';
import { SEED_QUESTIONS } from './fixtures/questions';
import { EVAL_MATERIALS, FIGURE, GRADED_ANSWERS, LIMITATION, TUTOR_CASES, type AnswerType, type TutorCase } from './fixtures/eval';

export interface PipelineArgs { label: string; suites: string[]; repeat: number; tutorRoutes?: string[]; gradeRoutes?: string[]; debug: boolean }

const config = parseEnv(readFileSync('.dev.vars', 'utf8'));
if (!config.DATABASE_URL || config.R2_ENVIRONMENT !== 'development') throw new Error('The designated .dev.vars development backend is required.');
const env = { ...config } as unknown as BackendBindings;
const EVAL_USER = 'rawi-eval';
const uuidFor = (key: string) => { const h = createHash('sha256').update(`rawi-eval:${key}`).digest('hex'); return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`; };

/* ── Database round trips, counted at the driver ─────────────────────────── */

let roundTrips = 0;
const query = Client.prototype.query;
Client.prototype.query = function (this: Client, ...args: unknown[]) { roundTrips++; return (query as (...a: unknown[]) => unknown).apply(this, args); } as typeof Client.prototype.query;

/* ── The evaluation workspace ────────────────────────────────────────────── */

type Db = ReturnType<typeof socketDb>['db'];
interface Corpus { workspaceId: string; courseId: string; topicId: string; materials: Map<string, { id: string; versions: string[] }> }

async function corpus(db: Db): Promise<Corpus> {
  await db.insert(s.user).values({ id: EVAL_USER, name: 'Rawi evaluation', email: 'eval@rawi.invalid' }).onConflictDoNothing();
  const { workspace } = await bootstrap(db, EVAL_USER);
  const workspaceId = workspace.id, courseId = uuidFor('course'), topicId = uuidFor('topic');
  await db.insert(s.courses).values({ id: courseId, workspaceId, name: 'Evaluation: The Atlantic World, 1500 to 1800', description: 'Fictional evaluation course.', createFingerprint: 'eval' }).onConflictDoNothing();
  await db.insert(s.topics).values({ id: topicId, workspaceId, courseId, title: 'Atlantic World review', summary: '', module: '', order: 0 }).onConflictDoNothing();
  const out = new Map<string, { id: string; versions: string[] }>();
  const all = [
    ...SEED_MATERIALS.map(m => ({ key: m.id, title: m.title, versions: [m.sections.map(p => `# ${p.heading}\n\n${p.text}`).join('\n\n')] })),
    ...EVAL_MATERIALS.map(m => ({ key: m.key, title: m.title, versions: m.versions ?? [m.markdown] })),
  ];
  for (const m of all) {
    const id = uuidFor(`material:${m.key}`);
    const [existing] = await db.select().from(s.materials).where(eq(s.materials.id, id));
    if (!existing) {
      await createMaterial(db, workspaceId, courseId, { id, title: m.title, kind: 'reading', attribution: 'Fictional evaluation material.', format: 'md', text: m.versions[0]! }, 1048576);
      for (const [n, text] of m.versions.slice(1).entries()) await transaction(db, async tx => {
        const [row] = await tx.select().from(s.materials).where(eq(s.materials.id, id));
        await publishVersion(tx, row!, { requestId: uuidFor(`material:${m.key}:v${n + 2}`), fingerprint: 'eval', origin: 'paste', sourceObjectId: null, format: 'md', conversion: { adapter: 'markdown', text, format: 'md' } });
      });
    }
    const versions = await db.select({ id: s.materialVersions.id }).from(s.materialVersions).where(eq(s.materialVersions.materialId, id)).orderBy(s.materialVersions.number);
    out.set(m.key, { id, versions: versions.map(v => v.id) });
  }
  // The figure: a placeholder paragraph becomes a figure block with its generated description.
  const winds = out.get(FIGURE.material)!;
  const version = winds.versions.at(-1)!;
  const [placeholder] = await db.select({ id: s.blocks.id }).from(s.blocks).where(and(eq(s.blocks.versionId, version), sql`${s.blocks.content}::text like '%FIGURE_PLACEHOLDER%'`));
  if (placeholder) await db.update(s.blocks).set({ type: 'figure', content: { assetId: null, caption: [{ type: 'text', text: FIGURE.caption, marks: [] }] } as never }).where(eq(s.blocks.id, placeholder.id));
  return { workspaceId, courseId, topicId, materials: out };
}

/** Rebuild the knowledge layer from scratch, so each run measures the current ingest code. */
async function rebuildKnowledge(db: Db, c: Corpus) {
  const scope = sql`workspace_id = ${c.workspaceId}`;
  for (const table of ['question_pool', 'figure_descriptions', 'knowledge_facts', 'knowledge_sections', 'knowledge_chunks', 'ingest_jobs']) await db.execute(sql`delete from ${sql.identifier(table)} where ${scope}`);
  const winds = c.materials.get(FIGURE.material)!, version = winds.versions.at(-1)!;
  const [figure] = await db.select({ id: s.blocks.id }).from(s.blocks).where(and(eq(s.blocks.versionId, version), eq(s.blocks.type, 'figure')));
  await db.insert(s.figureDescriptions).values({ blockId: figure!.id, workspaceId: c.workspaceId, courseId: c.courseId, materialId: winds.id, versionId: version, description: FIGURE.description, language: 'en', model: 'fixture' });
  const started = Date.now(), from = new Date();
  const drain = async () => {
    await backfillIngest(db, { workspaceId: c.workspaceId, courseId: c.courseId });
    for (let i = 0; i < 40; i++) {
      await runIngest(env, { workspaceId: c.workspaceId, courseId: c.courseId });
      const open = await db.select({ id: s.ingestJobs.id }).from(s.ingestJobs).where(and(eq(s.ingestJobs.workspaceId, c.workspaceId), inArray(s.ingestJobs.state, ['queued', 'running'])));
      if (!open.length) break;
    }
  };
  // A replaced material was read while its first version was current, as it would be in use.
  const replaced = [...c.materials.values()].filter(m => m.versions.length > 1);
  for (const m of replaced) await db.update(s.materials).set({ currentVersionId: m.versions[0]! }).where(eq(s.materials.id, m.id));
  await drain();
  for (const m of replaced) await db.update(s.materials).set({ currentVersionId: m.versions.at(-1)! }).where(eq(s.materials.id, m.id));
  await drain();
  const jobs = await db.select({ state: s.ingestJobs.state, stage: s.ingestJobs.stage, failure: s.ingestJobs.failure }).from(s.ingestJobs).where(eq(s.ingestJobs.workspaceId, c.workspaceId));
  const spend = await spent(db, c.workspaceId, from);
  const [chunks] = await db.select({ n: sql<number>`count(*)::int`, embedded: sql<number>`count(embedding)::int` }).from(s.knowledgeChunks).where(eq(s.knowledgeChunks.workspaceId, c.workspaceId));
  // Coverage: how much of each current version's block text is present in some chunk.
  const coverage = await blockCoverage(db, c);
  return { ms: Date.now() - started, micros: spend.micros, calls: spend.calls, jobs: jobs.map(j => `${j.state}/${j.stage}${j.failure ? `:${j.failure}` : ''}`), chunks: chunks!.n, embedded: chunks!.embedded, coverage };
}

/**
 * Sentences and table rows of current blocks that no chunk of the same block contains, which is
 * content search can never find. Split parts and repeated table headers do not count as loss.
 */
async function blockCoverage(db: Db, c: Corpus) {
  const { blockMarkdown } = await import('../src/shared/domain/document-text');
  const norm = (t: string) => t.replace(/\s+/g, ' ').trim();
  let total = 0, missing = 0;
  for (const m of c.materials.values()) {
    const version = m.versions.at(-1)!;
    const list = await versionBlocks(db, c.workspaceId, version);
    const chunks = await db.select({ text: s.knowledgeChunks.text, blockIds: s.knowledgeChunks.blockIds }).from(s.knowledgeChunks).where(eq(s.knowledgeChunks.versionId, version));
    for (const b of list) {
      if (b.type === 'heading') continue;
      const own = norm(chunks.filter(ch => ch.blockIds.includes(b.id)).map(ch => ch.text).join('\n'));
      const segments = blockMarkdown(b).split(/\n|(?<=[.!?])\s+/).map(norm).filter(x => x.length > 3 && !/^\|( --- \|)+$/.test(x));
      total += segments.length;
      missing += segments.filter(x => !own.includes(x)).length;
    }
  }
  return { segments: total, missing };
}

async function spent(db: Db, workspaceId: string, from: Date, operationId?: string) {
  const [row] = await db.select({ micros: sql<number>`coalesce(sum(coalesce(${s.aiCalls.chargedMicros}, ${s.aiCalls.reservedMicros})) filter (where ${s.aiCalls.state} <> 'released'), 0)::float8`, calls: sql<number>`count(*)::int` })
    .from(s.aiCalls).where(and(eq(s.aiCalls.workspaceId, workspaceId), gte(s.aiCalls.createdAt, from), operationId ? eq(s.aiCalls.operationId, operationId) : undefined));
  return row!;
}

/** A session's start: the blocks of one section, in the chosen version, or the review topic. */
async function startOf(db: Db, c: Corpus, start: TutorCase['start']) {
  if ('topic' in start) return { topicId: c.topicId };
  const m = c.materials.get(start.material)!;
  const versionId = m.versions[(start.version ?? m.versions.length) - 1]!;
  const list = await versionBlocks(db, c.workspaceId, versionId);
  const section = versionSections(list).find(x => x.heading === start.heading)!;
  return { source: { materialId: m.id, versionId, blockIds: section.blockIds } satisfies Citation };
}

async function openSession(db: Db, c: Corpus, t: TutorCase) {
  const id = crypto.randomUUID();
  const detail = await createSession(db, c.workspaceId, c.courseId, { id, title: '', ...await startOf(db, c, t.start) });
  let revision = detail.session.revision;
  if (t.history?.length) {
    await db.insert(s.tutorMessages).values(t.history.flatMap(([student, tutor], i) => [
      { id: crypto.randomUUID(), workspaceId: c.workspaceId, courseId: c.courseId, sessionId: id, ordinal: i * 2, role: 'student' as const, state: 'complete' as const, text: student, operationId: crypto.randomUUID() },
      { id: crypto.randomUUID(), workspaceId: c.workspaceId, courseId: c.courseId, sessionId: id, ordinal: i * 2 + 1, role: 'tutor' as const, state: 'complete' as const, text: tutor, operationId: crypto.randomUUID(), provenance: { model: 'fixture', stage: 'understand' as const, grounding: 'materials' as const, citations: [], droppedCitations: 0, imported: false } },
    ]));
  }
  const operationId = crypto.randomUUID();
  const saved = await saveMessage(db, c.workspaceId, id, { operationId, expectedRevision: revision, text: t.message, action: 'message' });
  revision = saved.session.revision;
  return { sessionId: id, operationId };
}

const has = (texts: string[], marker: string) => texts.some(x => x.toLowerCase().includes(marker.toLowerCase()));

/* ── Suites ──────────────────────────────────────────────────────────────── */

/** Evidence selection only: what the tutor would be given, with no model call. */
async function retrievalSuite(db: Db, c: Corpus, repeat: number) {
  const rows = [];
  for (const t of TUTOR_CASES) {
    let hit = 0, stale = 0, verdictOk = 0, ms = 0;
    const runs = Math.min(repeat, 2); // Selection is deterministic today. Two runs catch drift.
    for (let i = 0; i < runs; i++) {
      const { sessionId, operationId } = await openSession(db, c, t);
      const started = Date.now();
      const { input } = await prepare(env, { db, workspaceId: c.workspaceId, operationId }, sessionId, { text: t.message, action: 'message', sessionRevision: 0 });
      ms += Date.now() - started;
      const given = [...input.anchor, ...input.passages].map(p => `${p.heading}\n${p.text}`);
      if (t.evidence.every(m => has(given, m))) hit++;
      if (t.staleEvidence?.some(m => has(given, m))) stale++;
      const offered = given.length > 0;
      if ((t.verdict === 'absent') === !offered) verdictOk++;
      await db.update(s.aiOperations).set({ state: 'cancelled' }).where(eq(s.aiOperations.id, operationId));
    }
    rows.push({ case: t.id, kind: t.kind, runs, evidence: hit, stale, verdict: verdictOk, ms: Math.round(ms / runs) });
  }
  return rows;
}

/** The whole tutor turn through `streamReply`, judged on the saved reply. */
async function tutorSuite(db: Db, c: Corpus, repeat: number, routes: string[], debug: boolean) {
  const rows = [];
  const original = [...TIERS.chat];
  for (const routeId of routes) {
    TIERS.chat = [routeId];
    for (const t of TUTOR_CASES) {
      const row = { route: routeId, case: t.id, kind: t.kind, runs: 0, pass: 0, answer: 0, limitation: 0, cited: 0, forbidden: 0, noCall: 0, firstMs: [] as number[], totalMs: [] as number[], trips: [] as number[], micros: [] as number[], notes: [] as string[] };
      for (let i = 0; i < repeat; i++) {
        row.runs++;
        const { sessionId, operationId } = await openSession(db, c, t);
        const from = new Date(), started = Date.now(), trips0 = roundTrips;
        let first = 0, tripsBefore = 0, error = '';
        await streamReply(env, c.workspaceId, sessionId, operationId, async e => {
          if (e.type === 'delta' && !first) { first = Date.now() - started; tripsBefore = roundTrips - trips0; }
          if (e.type === 'error') error = e.code;
        });
        row.totalMs.push(Date.now() - started);
        if (first) { row.firstMs.push(first); row.trips.push(tripsBefore); }
        row.micros.push((await spent(db, c.workspaceId, from, operationId)).micros);
        const [reply] = await db.select().from(s.tutorMessages).where(and(eq(s.tutorMessages.sessionId, sessionId), eq(s.tutorMessages.role, 'tutor'), gte(s.tutorMessages.createdAt, from)));
        if (!reply) { row.notes.push(error || 'no reply'); continue; }
        const text = reply.text, p = reply.provenance!;
        const answerOk = t.answer.every(r => r.test(text));
        const forbidOk = !(t.forbid ?? []).some(r => r.test(text));
        const limitOk = !t.limitation || LIMITATION.test(text);
        const citeOk = t.verdict === 'absent' || p.citations.length > 0;
        if (answerOk) row.answer++; if (t.limitation && LIMITATION.test(text)) row.limitation++; if (p.citations.length) row.cited++; if (!forbidOk) row.forbidden++; if (p.model === 'none') row.noCall++;
        const ok = answerOk && forbidOk && limitOk && citeOk;
        if (ok) row.pass++;
        else {
          row.notes.push(!answerOk ? 'answer' : !forbidOk ? 'forbidden' : !limitOk ? 'no limitation' : 'no citation');
          if (debug) console.log(`--- ${routeId} ${t.id}: ${row.notes.at(-1)}\n${text.slice(0, 700)}\n`);
        }
      }
      process.stdout.write(`tutor ${routeId} ${t.id}: ${row.pass}/${row.runs}${row.notes.length ? ` (${[...new Set(row.notes)].join(', ')})` : ''}\n`);
      rows.push(row);
    }
  }
  TIERS.chat = original;
  return rows;
}

/** Practice sets through `generateSet`, with the pool emptied first so every run writes. */
const QUESTION_CONFIGS = [
  { name: 'mc', format: 'multiple-choice' as const, count: 6, difficulties: ['recall', 'reasoning'] as const, sections: [['mat-exchange-reading', 'The demographic argument'], ['mat-plantation-reading', 'Why sugar and not something else'], ['register', 'Voyage register']] },
  { name: 'written', format: 'written-recall' as const, count: 3, difficulties: ['reasoning'] as const, sections: [['mat-encomienda-reading', 'What an encomienda actually granted'], ['ledger', 'The ledgers as a source']] },
];

async function questionSuite(db: Db, c: Corpus, repeat: number) {
  const rows = [];
  for (const q of QUESTION_CONFIGS) {
    const row = { config: q.name, runs: 0, requested: 0, saved: 0, written: 0, verified: 0, failures: 0, ms: [] as number[], micros: 0, rules: {} as Record<string, number>, audit: {} as Record<string, number>, notes: [] as string[] };
    const sections = await Promise.all(q.sections.map(([material, heading]) => startOf(db, c, { material: material!, heading: heading! }).then(x => (x as { source: Citation }).source)));
    for (let i = 0; i < repeat; i++) {
      row.runs++; row.requested += q.count;
      await db.execute(sql`delete from question_pool where workspace_id = ${c.workspaceId}`);
      const operationId = crypto.randomUUID(), from = new Date(), started = Date.now();
      try {
        const result = await generateSet(env, db, c.workspaceId, c.courseId, { operationId, name: `Eval ${q.name} ${i}`, format: q.format, count: q.count, topicIds: [], materialIds: [], sections, difficulties: [...q.difficulties] }) as { setId: string; count: number };
        row.saved += result.count;
        const saved = await db.select({ content: s.questionVersions.content }).from(s.setItems).innerJoin(s.questionVersions, eq(s.questionVersions.id, s.setItems.questionId)).where(eq(s.setItems.setId, result.setId));
        for (const problem of audit(saved.map(r => r.content))) row.audit[problem] = (row.audit[problem] ?? 0) + 1;
      } catch (error) { row.failures++; row.notes.push(String((error as Error).message).slice(0, 80)); }
      row.ms.push(Date.now() - started);
      row.micros += (await spent(db, c.workspaceId, from, operationId)).micros;
      const pool = await db.select({ state: s.questionPool.state, verification: s.questionPool.verification }).from(s.questionPool).where(and(eq(s.questionPool.workspaceId, c.workspaceId), gte(s.questionPool.createdAt, from)));
      row.written += pool.length; row.verified += pool.filter(p => p.state === 'verified').length;
      for (const p of pool) {
        for (const r of p.verification.rules) row.rules[r] = (row.rules[r] ?? 0) + 1;
        if (p.verification.checker && !(p.verification.checker.supported && p.verification.checker.answerCorrect)) row.rules.checker = (row.rules.checker ?? 0) + 1;
      }
    }
    process.stdout.write(`questions ${q.name}: saved ${row.saved}/${row.requested}, verified ${row.verified}/${row.written}\n`);
    rows.push(row);
  }
  return rows;
}

/** Problems a schema and the current checks let through, found by rules on saved questions. */
function audit(questions: { format: string; prompt: string; answer?: string; options?: string[]; correctIndices?: number[]; rubric?: { label: string; marks: number }[] }[]) {
  const out: string[] = [];
  const prompts = questions.map(q => promptKey(q.prompt));
  prompts.forEach((p, i) => { if (prompts.indexOf(p) !== i) out.push('duplicate_prompt'); });
  for (const q of questions) {
    if (q.format === 'multiple-choice' && q.options && q.correctIndices?.length === 1) {
      const lengths = q.options.map(o => o.length), correct = lengths[q.correctIndices[0]!]!;
      // The keyed option is much the longest: a test-wise student picks it without knowing.
      if (lengths.every((l, i) => i === q.correctIndices![0] || correct > l * 1.6)) out.push('longest_option_is_key');
      if (q.options.some(o => /^(all|none) of the above$/i.test(o.trim()))) out.push('all_or_none_option');
    }
    if (q.answer && q.answer.length > 12 && promptKey(q.prompt).includes(promptKey(q.answer))) out.push('answer_in_prompt');
    if (q.format === 'written-recall' && q.rubric && new Set(q.rubric.map(r => promptKey(r.label))).size !== q.rubric.length) out.push('duplicate_rubric_point');
  }
  return out;
}

/** Written marking against reviewed marks, per route, over six mixed attempts. */
async function gradingSuite(repeat: number, routes: string[]) {
  const adapters = adaptersFor(env);
  const questions = ['q-col-wr-1', 'q-enc-wr-1', 'q-pl-wr-1'].map(id => SEED_QUESTIONS.find(q => q.id === id)!);
  const sourceOf = (id: string) => { const q = SEED_QUESTIONS.find(x => x.id === id)!; const m = SEED_MATERIALS.find(x => x.id === q.source!.materialId)!; return m.sections.find(x => x.id === q.source!.sectionId)!.text; };
  const types: AnswerType[] = ['strong', 'partial', 'fluent-wrong', 'keyword-stuffed', 'off-topic', 'alternative'];
  // Attempt k answers question j with answer type (k + 2j) mod 6, so every attempt mixes types.
  const attempts = types.map((_, k) => questions.map((q, j) => GRADED_ANSWERS.find(a => a.question === q.id && a.type === types[(k + 2 * j) % 6])!));
  const rows = [];
  for (const routeId of routes) {
    const r = routeById(routeId)!;
    const row = { route: routeId, runs: 0, failed: 0, points: 0, exact: 0, within1: 0, totalAbsError: 0, items: 0, falseCredit: 0, wrongItems: 0, alternativeShare: [] as number[], byType: {} as Record<string, { exact: number; points: number }>, ms: [] as number[], micros: 0 };
    for (let i = 0; i < repeat; i++) for (const attempt of attempts) {
      row.runs++;
      const items = attempt.map((a, n) => { const q = SEED_QUESTIONS.find(x => x.id === a.question)!; return { key: `a${n}`, prompt: q.prompt, modelAnswer: q.answer ?? q.explanation ?? '', rubric: q.rubric!.map((p, m) => ({ key: `r${m}`, label: p.label, marks: p.marks })), source: sourceOf(a.question), response: a.text }; });
      const input = { language: 'en', items };
      const req: ModelRequest = { ...gradeTask.build(input, r), maxOutput: gradeTask.maxOutput, cache: gradeTask.cache, serviceTier: 'standard', temperature: gradeTask.temperature };
      try {
        const result = await adapters[r.vendor]!.generate(r, req);
        row.ms.push(result.latencyMs); row.micros += cost(r, result.usage, 'standard');
        const value = result.stop === 'end' ? gradeTask.check(result, input) : null;
        if (!value) { row.failed++; continue; }
        for (const [n, a] of attempt.entries()) {
          const out = value.items.find(o => o.key === `a${n}`)!;
          const awarded = a.marks.map((_, m) => out.points.find(p => p.rubricKey === `r${m}`)?.awarded ?? 0);
          const t = row.byType[a.type] ??= { exact: 0, points: 0 };
          for (const [m, mark] of a.marks.entries()) { row.points++; t.points++; if (awarded[m] === mark) { row.exact++; t.exact++; } if (Math.abs(awarded[m]! - mark) <= 1) row.within1++; }
          const total = awarded.reduce((x, y) => x + y, 0), expected = a.marks.reduce((x, y) => x + y, 0);
          row.items++; row.totalAbsError += Math.abs(total - expected);
          if (expected === 0) { row.wrongItems++; if (total > 0) row.falseCredit++; }
          if (a.type === 'alternative') row.alternativeShare.push(total / expected);
        }
      } catch (error) { row.failed++; }
    }
    process.stdout.write(`grading ${routeId}: exact ${row.exact}/${row.points}, false credit ${row.falseCredit}/${row.wrongItems}\n`);
    rows.push(row);
  }
  return rows;
}

/* ── Report ──────────────────────────────────────────────────────────────── */

const mean = (xs: number[]) => xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : NaN;
const pct = (a: number, b: number) => b ? `${Math.round(100 * a / b)}%` : '-';
const p90 = (xs: number[]) => { const v = [...xs].sort((a, b) => a - b); return v.length ? v[Math.min(v.length - 1, Math.floor(v.length * 0.9))]! : NaN; };

export async function runPipeline(args: PipelineArgs) {
  const connection = socketDb(config.DATABASE_URL!);
  const db = connection.db;
  const report: Record<string, unknown> = { label: args.label, at: new Date().toISOString(), repeat: args.repeat };
  try {
    // Grading alone calls vendors directly and leaves the evaluation workspace untouched.
    let c = undefined as unknown as Corpus;
    if (args.suites.some(x => x !== 'grading')) {
      c = await corpus(db);
      // Earlier runs' sessions and sets are not needed. Their calls stay in `ai_calls` as spend.
      for (const table of ['set_items', 'learning_sets', 'question_sources', 'question_versions', 'tutor_messages', 'tutor_sessions', 'learning_operations']) await db.execute(sql`delete from ${sql.identifier(table)} where workspace_id = ${c.workspaceId}`);
      await db.execute(sql`delete from ai_operations where workspace_id = ${c.workspaceId}`);
      const ingest = await rebuildKnowledge(db, c);
      report.ingest = ingest;
      console.log(`ingest: ${ingest.chunks} chunks, ${ingest.embedded} embedded, ${ingest.coverage.missing}/${ingest.coverage.segments} sentences or rows missing, ${ingest.ms} ms, ${ingest.micros} µ$, jobs ${[...new Set(ingest.jobs)].join(' ')}`);
    }

    if (args.suites.includes('retrieval')) {
      const rows = await retrievalSuite(db, c, args.repeat);
      report.retrieval = rows;
      console.log('\nretrieval      case                  evidence  stale  verdict   ms');
      for (const r of rows) console.log(`${r.kind.padEnd(14)} ${r.case.padEnd(21)} ${`${r.evidence}/${r.runs}`.padEnd(9)} ${String(r.stale).padEnd(6)} ${`${r.verdict}/${r.runs}`.padEnd(8)} ${r.ms}`);
      console.log(`evidence found ${rows.filter(r => r.evidence === r.runs).length}/${rows.length} cases, verdict right ${rows.filter(r => r.verdict === r.runs).length}/${rows.length}`);
    }
    if (args.suites.includes('tutor')) {
      const routes = args.tutorRoutes ?? [TIERS.chat[0]!];
      const rows = await tutorSuite(db, c, args.repeat, routes, args.debug);
      report.tutor = rows;
      console.log('\ntutor route          case                  pass   first ms  p90   total ms  trips  µ$   notes');
      for (const r of rows) console.log(`${r.route.padEnd(20)} ${r.case.padEnd(21)} ${`${r.pass}/${r.runs}`.padEnd(6)} ${String(mean(r.firstMs)).padStart(8)} ${String(p90(r.firstMs)).padStart(5)} ${String(mean(r.totalMs)).padStart(9)} ${String(mean(r.trips)).padStart(6)} ${String(mean(r.micros)).padStart(5)}  ${[...new Set(r.notes)].join(', ')}`);
      for (const routeId of routes) {
        const mine = rows.filter(r => r.route === routeId), runs = mine.reduce((n, r) => n + r.runs, 0), pass = mine.reduce((n, r) => n + r.pass, 0), micros = mine.flatMap(r => r.micros);
        const supported = mine.filter(r => !['unsupported'].includes(r.kind)), unsupported = mine.filter(r => r.kind === 'unsupported');
        console.log(`${routeId}: pass ${pass}/${runs} (${pct(pass, runs)}). supported ${supported.reduce((n, r) => n + r.pass, 0)}/${supported.reduce((n, r) => n + r.runs, 0)}, unsupported ${unsupported.reduce((n, r) => n + r.pass, 0)}/${unsupported.reduce((n, r) => n + r.runs, 0)}. first token ${mean(mine.flatMap(r => r.firstMs))} ms (p90 ${p90(mine.flatMap(r => r.firstMs))}), ${mean(mine.flatMap(r => r.trips))} queries before it. ${Math.round(micros.reduce((a, b) => a + b, 0) / Math.max(1, pass))} µ$ per passing reply.`);
      }
    }
    if (args.suites.includes('questions')) {
      const rows = await questionSuite(db, c, args.repeat);
      report.questions = rows;
      for (const r of rows) console.log(`questions ${r.config}: saved ${r.saved}/${r.requested} (${pct(r.saved, r.requested)}), accepted ${r.verified}/${r.written} written (${pct(r.verified, r.written)}), failed runs ${r.failures}/${r.runs}, ${mean(r.ms)} ms mean, ${Math.round(r.micros / Math.max(1, r.saved))} µ$ per saved question. rejections ${JSON.stringify(r.rules)}. audit of saved ${JSON.stringify(r.audit)}${r.notes.length ? `. ${[...new Set(r.notes)].join('; ')}` : ''}`);
    }
    if (args.suites.includes('grading')) {
      const routes = args.gradeRoutes ?? [TIERS.small[0]!, TIERS.strong[0]!];
      const rows = await gradingSuite(args.repeat, routes);
      report.grading = rows;
      for (const r of rows) console.log(`grading ${r.route}: exact ${pct(r.exact, r.points)}, within one ${pct(r.within1, r.points)}, total error ${(r.totalAbsError / Math.max(1, r.items)).toFixed(2)} marks per answer, false credit on wrong answers ${r.falseCredit}/${r.wrongItems}, alternative answers ${Math.round(100 * r.alternativeShare.reduce((a, b) => a + b, 0) / Math.max(1, r.alternativeShare.length))}% of marks, failed calls ${r.failed}/${r.runs}, ${mean(r.ms)} ms, ${Math.round(r.micros / Math.max(1, r.runs - r.failed))} µ$ per attempt. exact by type ${Object.entries(r.byType).map(([k, v]) => `${k} ${pct(v.exact, v.points)}`).join(', ')}`);
    }
  } finally {
    mkdirSync('dev/results', { recursive: true });
    writeFileSync(`dev/results/${args.label}.json`, JSON.stringify(report, (_k, v) => v instanceof RegExp ? String(v) : v, 2));
    await connection.close();
  }
}
