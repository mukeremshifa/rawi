import { and, asc, eq, inArray, isNull, lte, ne, or, sql } from 'drizzle-orm';
import { blocks, figureDescriptions, ingestJobs, knowledgeChunks, knowledgeFacts, knowledgeSections, materials, materialVersions, fileObjects } from '../../db/schema';
import { socketDb, transaction, type ReadDb, type SocketDb, type Transaction } from '../../db/client';
import type { BackendBindings } from '../../config';
import { ApiError } from '../../errors';
import { adaptersFor, AiFailed, embed, run, type CallContext } from '../../ai/engine';
import { TIERS } from '../../ai/catalog';
import type { Language } from '../../ai/types';
import { blockMarkdown, spansText } from '../../../shared/domain/document-text';
import { versionBlocks, type SectionBlock } from '../outline/sections';
import { detectLanguage, searchConfig } from './language';
import { digestTask, figureTask, type DigestInput } from './tasks';
import type { KnowledgeCoverage } from './types';

/**
 * Each ready version is read once into a knowledge layer: chunks for search with embeddings,
 * section summaries and key terms, atomic facts and figure descriptions, all citing blocks of
 * that version. The job runs in stages under a lease, keeps a cursor so a large version spans
 * several steps, and is superseded when a newer version of the material arrives.
 *
 * Readiness is explicit. A version is searchable once every block is in a chunk, and enriched
 * once embeddings, the digest and figure descriptions are complete too. Whatever is missing is
 * counted in `coverage`, and a repair stage comes back for embeddings that failed.
 */
type Job = typeof ingestJobs.$inferSelect;
type Scope = { workspaceId: string; courseId: string };
const LEASE_MS = 120_000;
const MAX_FAILURES = 4;
/** Consecutive blocks share a chunk up to about this many characters. */
const CHUNK_CHARS = 1200;
/** A block longer than this is split into parts, each its own chunk. Nothing is cut off. */
const PART_CHARS = 1500;
/** Repair passes for missing embeddings before the version settles as searchable only. */
const MAX_REPAIRS = 3;
/** Bump when chunking changes. With the embedding model it names the index a version was built with. */
const CHUNKER = 'chunk-v2';
export const indexVersion = () => `${CHUNKER}:${CHUNK_CHARS}:${PART_CHARS}:${TIERS.embed[0] ?? 'none'}`;

const due = (now: Date) => and(or(eq(ingestJobs.state, 'queued'), and(eq(ingestJobs.state, 'running'), lte(ingestJobs.leaseExpiresAt, now))), or(isNull(ingestJobs.nextRunAt), lte(ingestJobs.nextRunAt, now)));

/** Called in the transaction that makes a version ready or partial. */
export async function enqueueIngest(tx: Transaction, version: Scope & { materialId: string; id: string }) {
  await tx.update(ingestJobs).set({ state: 'superseded', leaseToken: null, leaseExpiresAt: null, updatedAt: new Date() })
    .where(and(eq(ingestJobs.materialId, version.materialId), ne(ingestJobs.versionId, version.id), inArray(ingestJobs.state, ['queued', 'running'])));
  await tx.insert(ingestJobs).values({ id: crypto.randomUUID(), workspaceId: version.workspaceId, courseId: version.courseId, materialId: version.materialId, versionId: version.id }).onConflictDoNothing();
}

/** Current readable versions with no ingest job, such as those ready before the knowledge layer. */
const unread = (scope?: Scope) => sql`select v.workspace_id, v.course_id, v.material_id, v.id from ${materials} m join ${materialVersions} v on v.id = m.current_version_id
  where v.status in ('ready', 'partial') and not m.archived and not exists (select 1 from ${ingestJobs} j where j.version_id = v.id)
  ${scope ? sql`and m.workspace_id = ${scope.workspaceId} and m.course_id = ${scope.courseId}` : sql``}`;

export async function backfillIngest(db: SocketDb, scope?: Scope) {
  const rows = await db.execute(sql`insert into ${ingestJobs} (id, workspace_id, course_id, material_id, version_id) select gen_random_uuid(), * from (${unread(scope)} limit 50) u on conflict do nothing returning id`);
  return rows.rows.length;
}

/**
 * Current versions built with an older index configuration go back through chunking, a few at a
 * time, so a change to chunking or the embedding model rebuilds every version under control.
 * Search keeps serving the old chunks until the new ones replace them in one transaction.
 */
export async function rebuildStale(db: SocketDb, limit = 5) {
  const rows = await db.execute(sql`update ${ingestJobs} set state = 'queued', stage = 'chunk', progress = '{"cursor":0}'::jsonb, attempts = 0, next_run_at = null, updated_at = now()
    where id in (select j.id from ${ingestJobs} j join ${materials} m on m.current_version_id = j.version_id
      where j.state = 'done' and j.index_version <> ${indexVersion()} and not m.archived order by j.updated_at limit ${limit}) returning id`);
  return rows.rows.length;
}

/** Whether a course has knowledge work to start, so a page read can hand it to `waitUntil`. */
export async function ingestPending(db: ReadDb | SocketDb, scope: Scope) {
  const [row] = await db.select({ id: ingestJobs.id }).from(ingestJobs).where(and(eq(ingestJobs.workspaceId, scope.workspaceId), eq(ingestJobs.courseId, scope.courseId), due(new Date()))).limit(1);
  if (row) return true;
  return (await db.execute(sql`${unread(scope)} limit 1`)).rows.length > 0;
}

/** Advance a course's ingest jobs for up to about twenty seconds. Safe to call from `waitUntil`. */
export async function runIngest(env: BackendBindings, scope: Scope) {
  if (!env.DATABASE_URL || !Object.keys(adaptersFor(env)).length) return;
  const connection = socketDb(env.DATABASE_URL);
  const deadline = Date.now() + 20_000;
  try {
    await backfillIngest(connection.db, scope);
    while (Date.now() < deadline) {
      const [next] = await connection.db.select({ id: ingestJobs.id }).from(ingestJobs).where(and(eq(ingestJobs.workspaceId, scope.workspaceId), eq(ingestJobs.courseId, scope.courseId), due(new Date()))).orderBy(asc(ingestJobs.createdAt)).limit(1);
      if (!next || !await step(connection.db, env, next.id, deadline)) break;
    }
  } catch (error) { console.log(JSON.stringify({ operation: 'ingest', error: error instanceof ApiError ? error.code : 'unexpected' })); }
  finally { await connection.close(); }
}

/** The cron safety net. */
export async function sweepIngest(db: SocketDb, env: BackendBindings, limit = 5) {
  if (!Object.keys(adaptersFor(env)).length) return { ingestJobs: 0, rebuilt: 0 };
  const rebuilt = await rebuildStale(db);
  const rows = await db.select({ id: ingestJobs.id }).from(ingestJobs).where(due(new Date())).orderBy(asc(ingestJobs.createdAt)).limit(limit);
  let ran = 0;
  for (const row of rows) { try { if (await step(db, env, row.id, Date.now() + 60_000)) ran++; } catch { /* The next sweep retries. */ } }
  return { ingestJobs: ran, rebuilt };
}

async function claim(db: SocketDb, jobId: string) {
  return transaction(db, async tx => {
    const [row] = await tx.select().from(ingestJobs).where(and(eq(ingestJobs.id, jobId), due(new Date()))).for('update', { skipLocked: true });
    if (!row) return null;
    const [material] = await tx.select({ current: materials.currentVersionId }).from(materials).where(eq(materials.id, row.materialId));
    if (material?.current !== row.versionId) {
      await tx.update(ingestJobs).set({ state: 'superseded', updatedAt: new Date() }).where(eq(ingestJobs.id, jobId));
      return null;
    }
    if (row.attempts >= MAX_FAILURES) {
      // Whatever was built stays in use. Readiness and coverage say how far it got.
      await tx.update(ingestJobs).set({ state: 'failed', failure: 'Reading this material for the tutor stopped after several attempts.', updatedAt: new Date() }).where(eq(ingestJobs.id, jobId));
      return null;
    }
    const token = crypto.randomUUID();
    const [leased] = await tx.update(ingestJobs).set({ state: 'running', leaseToken: token, leaseExpiresAt: new Date(Date.now() + LEASE_MS), attempts: row.attempts + 1, updatedAt: new Date() }).where(eq(ingestJobs.id, jobId)).returning();
    return { job: leased!, token };
  });
}

/** Save progress only while the lease is still ours. */
async function save(db: SocketDb, job: Job, token: string, fields: Partial<Job>) {
  const [row] = await db.update(ingestJobs).set({ ...fields, updatedAt: new Date() }).where(and(eq(ingestJobs.id, job.id), eq(ingestJobs.leaseToken, token))).returning({ id: ingestJobs.id });
  if (!row) throw new ApiError(409, 'lease_lost', 'The ingest lease expired.');
}

async function step(db: SocketDb, env: BackendBindings, jobId: string, deadline: number) {
  const claimed = await claim(db, jobId);
  if (!claimed) return false;
  let { job } = claimed;
  const { token } = claimed;
  const ctx: CallContext = { db, workspaceId: job.workspaceId, jobId: job.id };
  try {
    while (job.stage !== 'done' && Date.now() < deadline) {
      const next = await stages[job.stage as Exclude<Job['stage'], 'done'>](db, env, ctx, job);
      // Progress clears the failure count. Only consecutive failures stop a job.
      await save(db, job, token, { ...next, attempts: 0 });
      job = { ...job, ...next };
      // A stage that asks to come back later releases the job until then.
      if (next.nextRunAt) break;
    }
    await save(db, job, token, job.stage === 'done' ? { state: 'done', leaseToken: null, leaseExpiresAt: null, failure: null } : { state: 'queued', leaseToken: null, leaseExpiresAt: null, nextRunAt: job.nextRunAt });
    if (job.stage === 'done') console.log(JSON.stringify({ operation: 'ingest-done', jobId: job.id, versionId: job.versionId, readiness: job.readiness, coverage: job.coverage }));
  } catch (error) {
    const code = error instanceof ApiError ? error.code : 'unexpected';
    if (code === 'lease_lost') return true;
    console.log(JSON.stringify({ operation: 'ingest-failed', jobId: job.id, stage: job.stage, error: code }));
    // A spent allowance waits without counting as a failure. Anything else retries with a pause.
    const wait = code === 'ai_budget' ? 30 * 60_000 : code === 'ai_busy' ? 30_000 : 60_000 * job.attempts;
    await db.update(ingestJobs).set({ state: 'queued', leaseToken: null, leaseExpiresAt: null, nextRunAt: new Date(Date.now() + wait), failure: code, ...(code === 'ai_budget' || code === 'ai_busy' ? { attempts: job.attempts - 1 } : {}), updatedAt: new Date() }).where(and(eq(ingestJobs.id, job.id), eq(ingestJobs.leaseToken, token)));
  }
  return true;
}

/* ── Chunking ────────────────────────────────────────────────────────────── */

/** Pieces packed in order into groups no longer than `limit`. A piece over the limit is split at spaces. */
function pack(pieces: string[], limit: number, joiner: string) {
  const out: string[] = [];
  let current: string[] = [], size = 0;
  const flush = () => { if (current.length) out.push(current.join(joiner)); current = []; size = 0; };
  for (let piece of pieces) {
    while (piece.length > limit) {
      const cut = piece.lastIndexOf(' ', limit) > limit / 2 ? piece.lastIndexOf(' ', limit) : limit;
      flush(); out.push(piece.slice(0, cut).trim()); piece = piece.slice(cut).trim();
    }
    if (size && size + joiner.length + piece.length > limit) flush();
    if (piece) { current.push(piece); size += piece.length + joiner.length; }
  }
  flush();
  return out;
}

/**
 * A block's text in parts no longer than PART_CHARS. A table repeats its header row in every
 * part so each row stays readable. Code keeps its fence. An equation is never split.
 */
export function blockParts(block: SectionBlock): string[] {
  const text = blockMarkdown(block).trim();
  if (!text) return [];
  if (text.length <= PART_CHARS || block.type === 'equation') return [text];
  if (block.type === 'table') {
    const lines = text.split('\n'), head = lines.slice(0, 2).join('\n');
    return pack(lines.slice(2), PART_CHARS - head.length, '\n').map(rows => `${head}\n${rows}`);
  }
  if (block.type === 'code') {
    const fence = '```' + (block.content.language ?? '');
    return pack(block.content.text.split('\n'), PART_CHARS - 10, '\n').map(part => `${fence}\n${part}\n\`\`\``);
  }
  if (block.type === 'list' || block.type === 'quote') return pack(text.split('\n'), PART_CHARS, '\n');
  return pack(text.split(/(?<=[.!?])\s+/), PART_CHARS, ' ');
}

/**
 * Chunks follow sections: a heading starts a new chunk, and consecutive blocks share one up to
 * CHUNK_CHARS. An equation stays with the text before and after it, which says what it means.
 */
export function chunkBlocks(list: SectionBlock[]) {
  type Chunk = { sectionBlockId: string | null; heading: string; blockIds: string[]; text: string; uncertain: boolean };
  const out: Chunk[] = [];
  let heading = '', sectionBlockId: string | null = null, afterEquation = false;
  let current: { ids: string[]; parts: string[]; size: number; uncertain: boolean } = { ids: [], parts: [], size: 0, uncertain: false };
  const flush = () => { if (current.ids.length) out.push({ sectionBlockId, heading, blockIds: current.ids, text: current.parts.join('\n\n'), uncertain: current.uncertain }); current = { ids: [], parts: [], size: 0, uncertain: false }; };
  for (const block of list) {
    if (block.type === 'heading') { flush(); heading = spansText(block.content.spans).trim().slice(0, 300); sectionBlockId = block.id; afterEquation = false; continue; }
    const parts = blockParts(block);
    if (!parts.length) continue;
    const uncertain = !!block.flags?.uncertain;
    if (parts.length > 1) {
      flush();
      for (const part of parts) out.push({ sectionBlockId, heading, blockIds: [block.id], text: part, uncertain });
      afterEquation = false;
      continue;
    }
    const text = parts[0]!;
    if (current.size && current.size + text.length > CHUNK_CHARS && block.type !== 'equation' && !afterEquation) flush();
    current.ids.push(block.id); current.parts.push(text); current.size += text.length; current.uncertain ||= uncertain;
    afterEquation = block.type === 'equation';
  }
  flush();
  return out;
}

/* ── Stages ──────────────────────────────────────────────────────────────── */

type Stage = (db: SocketDb, env: BackendBindings, ctx: CallContext, job: Job) => Promise<Partial<Job>>;
const vectorText = (v: number[]) => `[${v.join(',')}]`;

const chunk: Stage = async (db, _env, _ctx, job) => {
  const [list, [version]] = await Promise.all([
    versionBlocks(db, job.workspaceId, job.versionId),
    db.select({ warnings: materialVersions.warnings }).from(materialVersions).where(eq(materialVersions.id, job.versionId)),
  ]);
  const chunks = chunkBlocks(list);
  const language = detectLanguage(chunks.map(c => c.text).join(' ').slice(0, 20000));
  const config = searchConfig(language);
  await transaction(db, async tx => {
    // A rebuild keeps the embedding of any chunk whose text and model are unchanged.
    const prior = await tx.select({ text: knowledgeChunks.text, model: knowledgeChunks.embeddingModel, embedding: sql<string | null>`${knowledgeChunks.embedding}::text` }).from(knowledgeChunks).where(eq(knowledgeChunks.versionId, job.versionId));
    const reuse = new Map(prior.filter(p => p.embedding && p.model).map(p => [p.text, p]));
    await tx.delete(knowledgeChunks).where(eq(knowledgeChunks.versionId, job.versionId));
    await tx.update(materialVersions).set({ language }).where(eq(materialVersions.id, job.versionId));
    for (let i = 0; i < chunks.length; i += 100) {
      await tx.insert(knowledgeChunks).values(chunks.slice(i, i + 100).map((c, n) => {
        const kept = reuse.get(c.text);
        return {
          id: crypto.randomUUID(), workspaceId: job.workspaceId, courseId: job.courseId, materialId: job.materialId, versionId: job.versionId,
          ordinal: i + n, sectionBlockId: c.sectionBlockId, heading: c.heading, blockIds: c.blockIds, text: c.text, language, tokens: Math.ceil(c.text.length / 4), uncertain: c.uncertain,
          search: sql`to_tsvector(${config}::regconfig, ${`${c.heading}\n${c.text}`})` as unknown as string,
          ...(kept ? { embedding: sql`${kept.embedding}::vector` as unknown as number[], embeddingModel: kept.model } : {}),
        };
      }));
    }
  });
  const textBlocks = list.filter(b => b.type !== 'heading' && blockMarkdown(b).trim());
  const chunked = new Set(chunks.flatMap(c => c.blockIds));
  const coverage: KnowledgeCoverage = {
    blocks: textBlocks.length, chunked: textBlocks.filter(b => chunked.has(b.id)).length, chunks: chunks.length,
    uncertainBlocks: textBlocks.filter(b => b.flags?.uncertain).length, warnings: [...new Set((version?.warnings ?? []).map(w => w.code))],
  };
  return { stage: 'embed', progress: { cursor: 0 }, readiness: 'searchable', coverage, indexVersion: indexVersion() };
};

/** Embeds chunks that have none, fifty at a time. Returns how many still have none. */
async function embedMissing(db: SocketDb, env: BackendBindings, ctx: CallContext, job: Job, limit: number) {
  const rows = await db.select({ id: knowledgeChunks.id, heading: knowledgeChunks.heading, text: knowledgeChunks.text, language: knowledgeChunks.language }).from(knowledgeChunks)
    .where(and(eq(knowledgeChunks.versionId, job.versionId), isNull(knowledgeChunks.embedding))).orderBy(asc(knowledgeChunks.ordinal)).limit(limit);
  let failed = 0;
  for (let i = 0; i < rows.length; i += 50) {
    const batch = rows.slice(i, i + 50);
    const result = await embed(env, ctx, batch.map(r => `${r.heading}\n${r.text}`), 'document', batch[0]!.language, 'institution');
    if (!result) { failed += batch.length; continue; }
    await db.execute(sql`update ${knowledgeChunks} set embedding = v.e::vector, embedding_model = ${result.model}
      from (values ${sql.join(batch.map((r, n) => sql`(${r.id}::uuid, ${vectorText(result.vectors[n]!)})`), sql`, `)}) as v(id, e) where ${knowledgeChunks.id} = v.id`);
  }
  return { tried: rows.length, failed };
}

const embedStage: Stage = async (db, env, ctx, job) => {
  // Failures are left for the repair stage, which counts them, rather than skipped for good.
  const done = job.progress.cursor;
  const { tried, failed } = await embedMissing(db, env, ctx, { ...job }, 100);
  if (!tried || failed || done + tried > 2000) return { stage: 'digest', progress: { cursor: 0 } };
  return { progress: { cursor: done + tried } };
};

/** Sections in reading order, merged from text chunks, for the digest. */
async function chunkSections(db: SocketDb, versionId: string) {
  const rows = await db.select({ sectionBlockId: knowledgeChunks.sectionBlockId, heading: knowledgeChunks.heading, blockIds: knowledgeChunks.blockIds, language: knowledgeChunks.language }).from(knowledgeChunks)
    .where(and(eq(knowledgeChunks.versionId, versionId), eq(knowledgeChunks.kind, 'text'))).orderBy(asc(knowledgeChunks.ordinal));
  const out: { sectionBlockId: string | null; heading: string; blockIds: string[]; language: Language }[] = [];
  for (const r of rows) {
    const last = out.at(-1);
    if (last && last.sectionBlockId === r.sectionBlockId) { for (const id of r.blockIds) if (!last.blockIds.includes(id)) last.blockIds.push(id); }
    else out.push({ ...r, blockIds: [...r.blockIds] });
  }
  return out;
}

/** Characters of one block given to the digest. Search sees every character, this bounds one call. */
const DIGEST_BLOCK_CHARS = 8000;

const digest: Stage = async (db, env, ctx, job) => {
  const all = await chunkSections(db, job.versionId);
  const start = job.progress.cursor;
  if (start >= all.length) return { stage: 'figures', progress: { cursor: 0 } };
  // A rebuild keeps sections already digested, so only new or changed sections are paid for.
  const existing = new Set((await db.select({ id: knowledgeSections.sectionBlockId, blockIds: knowledgeSections.blockIds }).from(knowledgeSections).where(eq(knowledgeSections.versionId, job.versionId))).map(r => `${r.id}:${r.blockIds.join(',')}`));
  const todo = all.slice(start).findIndex(s => !existing.has(`${s.sectionBlockId}:${s.blockIds.join(',')}`));
  if (todo < 0) return { stage: 'figures', progress: { cursor: 0 } };
  const from = start + todo;
  const list = await versionBlocks(db, job.workspaceId, job.versionId);
  const byId = new Map(list.map(b => [b.id, b]));
  const [material] = await db.select({ title: materials.title }).from(materials).where(eq(materials.id, job.materialId));
  // Several sections per call, up to about 8000 characters of material.
  const group: typeof all = [];
  let size = 0;
  for (const s of all.slice(from)) {
    if (existing.has(`${s.sectionBlockId}:${s.blockIds.join(',')}`)) break;
    const chars = s.blockIds.reduce((n, id) => n + Math.min(DIGEST_BLOCK_CHARS, byId.get(id) ? blockMarkdown(byId.get(id)!).length : 0), 0);
    if (group.length && (size + chars > 8000 || group.length >= 6)) break;
    group.push(s); size += chars;
  }
  const keys = new Map<string, string>();
  let n = 0;
  const input: DigestInput = {
    language: group[0]!.language, materialTitle: material?.title ?? '',
    sections: group.map((s, i) => ({ key: `s${i}`, heading: s.heading || material?.title || '', blocks: s.blockIds.flatMap(id => { const b = byId.get(id); const text = b && b.type !== 'heading' ? blockMarkdown(b).trim().slice(0, DIGEST_BLOCK_CHARS) : ''; if (!text) return []; const key = `b${n++}`; keys.set(key, id); return [{ key, text }]; }) })),
  };
  let served;
  try { served = await run(env, ctx, digestTask, input); }
  catch (error) {
    // A digest that fails its checks or stops partway is not repeated here. The sections stay
    // searchable, and coverage records that they have no summary.
    if (error instanceof AiFailed && (error.code === 'ai_invalid' || error.code === 'ai_uncertain')) return { progress: { cursor: from + group.length } };
    throw error;
  }
  const scope = { workspaceId: job.workspaceId, courseId: job.courseId, materialId: job.materialId, versionId: job.versionId };
  await transaction(db, async tx => {
    for (const [i, s] of group.entries()) {
      const d = served.value.sections.find(o => o.key === `s${i}`)!;
      await tx.insert(knowledgeSections).values({ id: crypto.randomUUID(), ...scope, sectionBlockId: s.sectionBlockId, heading: s.heading, summary: d.summary.trim().slice(0, 600), keyTerms: d.keyTerms.slice(0, 6).map(t => t.trim().slice(0, 80)).filter(Boolean), blockIds: s.blockIds, language: s.language, model: served.route.model })
        .onConflictDoUpdate({ target: [knowledgeSections.versionId, knowledgeSections.sectionBlockId], set: { summary: d.summary.trim().slice(0, 600), blockIds: s.blockIds, model: served.route.model } });
      await tx.delete(knowledgeFacts).where(and(eq(knowledgeFacts.versionId, job.versionId), s.sectionBlockId ? eq(knowledgeFacts.sectionBlockId, s.sectionBlockId) : isNull(knowledgeFacts.sectionBlockId)));
      // A fact keeps only the block keys that belong to its own section.
      const facts = d.facts.slice(0, 8).flatMap(f => { const ids = [...new Set(f.blocks.map(k => keys.get(k)).filter((id): id is string => !!id && s.blockIds.includes(id)))]; return ids.length && f.text.trim() ? [{ id: crypto.randomUUID(), ...scope, sectionBlockId: s.sectionBlockId, text: f.text.trim().slice(0, 500), blockIds: ids, language: s.language }] : []; });
      if (facts.length) await tx.insert(knowledgeFacts).values(facts);
    }
  });
  return { progress: { cursor: from + group.length } };
};

/** A description shorter than this says too little to be worth searching. */
const USEFUL_DESCRIPTION = 40;

/**
 * Describes one figure per step from its image. Once every figure has been tried, each useful
 * description becomes a search chunk of its own, labelled as a generated interpretation.
 */
const figures: Stage = async (db, env, ctx, job) => {
  const list = await versionBlocks(db, job.workspaceId, job.versionId);
  const described = await db.select({ id: figureDescriptions.blockId, description: figureDescriptions.description }).from(figureDescriptions).where(eq(figureDescriptions.versionId, job.versionId));
  const done = new Set(described.map(r => r.id));
  const block = env.MATERIALS_BUCKET ? list.find(b => b.type === 'figure' && b.content.assetId && !done.has(b.id)) : undefined;
  const [version] = await db.select({ language: materialVersions.language }).from(materialVersions).where(eq(materialVersions.id, job.versionId));
  const language = version?.language ?? 'en';
  const scope = { workspaceId: job.workspaceId, courseId: job.courseId, materialId: job.materialId, versionId: job.versionId };
  if (block && block.type === 'figure') {
    const [object] = await db.select({ key: fileObjects.key, type: fileObjects.detectedType }).from(fileObjects).where(and(eq(fileObjects.workspaceId, job.workspaceId), eq(fileObjects.id, block.content.assetId!)));
    const body = object && /^image\/(png|jpe?g|webp|gif)$/.test(object.type) ? await env.MATERIALS_BUCKET!.get(object.key) : null;
    if (!body) {
      // An image that cannot be read keeps its caption only, and is not tried again.
      await db.insert(figureDescriptions).values({ blockId: block.id, ...scope, description: '', language, model: 'none' }).onConflictDoNothing();
      return {};
    }
    const at = list.indexOf(block);
    const context = list.slice(Math.max(0, at - 2), at + 3).filter(b => b !== block).map(blockMarkdown).join('\n');
    let served;
    try { served = await run(env, ctx, figureTask, { language, caption: spansText(block.content.caption), context, image: { mime: object!.type, data: new Uint8Array(await body.arrayBuffer()) } }); }
    catch (error) {
      // A description that failed its checks or may have been charged is not tried again. The
      // figure keeps its caption, and coverage counts it as undescribed.
      if (error instanceof AiFailed && (error.code === 'ai_invalid' || error.code === 'ai_uncertain')) {
        await db.insert(figureDescriptions).values({ blockId: block.id, ...scope, description: '', language, model: error.code }).onConflictDoNothing();
        return {};
      }
      throw error;
    }
    await db.insert(figureDescriptions).values({ blockId: block.id, ...scope, description: served.value.slice(0, 1500), language, model: served.route.model }).onConflictDoNothing();
    return {};
  }
  // Every figure tried. Useful descriptions without a chunk get one, in the figure's section.
  const chunked = new Set((await db.select({ blockIds: knowledgeChunks.blockIds }).from(knowledgeChunks).where(and(eq(knowledgeChunks.versionId, job.versionId), eq(knowledgeChunks.kind, 'figure')))).flatMap(r => r.blockIds));
  const config = searchConfig(language);
  const [last] = await db.select({ ordinal: sql<number>`coalesce(max(${knowledgeChunks.ordinal}), -1)::int` }).from(knowledgeChunks).where(eq(knowledgeChunks.versionId, job.versionId));
  const headingOf = (id: string) => { let heading = '', section: string | null = null; for (const b of list) { if (b.id === id) break; if (b.type === 'heading') { heading = spansText(b.content.spans).trim().slice(0, 300); section = b.id; } } return { heading, section }; };
  const fresh = described.filter(d => d.description.trim().length >= USEFUL_DESCRIPTION && !chunked.has(d.id) && list.some(b => b.id === d.id));
  if (fresh.length) await db.insert(knowledgeChunks).values(fresh.map((d, i) => {
    const b = list.find(x => x.id === d.id)!, caption = b.type === 'figure' ? spansText(b.content.caption).trim() : '';
    const text = `Figure description, generated by Rawi from the image: ${caption ? `${caption}. ` : ''}${d.description.trim()}`;
    const { heading, section } = headingOf(d.id);
    return { id: crypto.randomUUID(), ...scope, ordinal: last!.ordinal + 1 + i, sectionBlockId: section, heading, blockIds: [d.id], text, language, tokens: Math.ceil(text.length / 4), kind: 'figure' as const, search: sql`to_tsvector(${config}::regconfig, ${`${heading}\n${text}`})` as unknown as string };
  }));
  return { stage: 'repair', progress: { cursor: 0 } };
};

/** What the layer holds now, against what the version needs. */
async function measure(db: SocketDb, job: Job): Promise<KnowledgeCoverage> {
  const [[chunks], sections, [digested], list, [figureRows]] = await Promise.all([
    db.select({ n: sql<number>`count(*)::int`, embedded: sql<number>`count(${knowledgeChunks.embedding})::int` }).from(knowledgeChunks).where(eq(knowledgeChunks.versionId, job.versionId)),
    chunkSections(db, job.versionId),
    db.select({ n: sql<number>`count(*)::int` }).from(knowledgeSections).where(eq(knowledgeSections.versionId, job.versionId)),
    db.select({ id: blocks.id, untried: sql<boolean>`${blocks.content}->>'assetId' is not null and not exists (select 1 from ${figureDescriptions} f where f.block_id = ${blocks.id})` }).from(blocks).where(and(eq(blocks.versionId, job.versionId), eq(blocks.type, 'figure'))),
    db.select({ tried: sql<number>`count(*)::int`, described: sql<number>`count(*) filter (where length(${figureDescriptions.description}) >= ${USEFUL_DESCRIPTION})::int` }).from(figureDescriptions).where(eq(figureDescriptions.versionId, job.versionId)),
  ]);
  return { ...job.coverage, chunks: chunks!.n, embedded: chunks!.embedded, sections: sections.length, digested: digested!.n, figures: list.length, described: figureRows!.described, undescribed: list.filter(f => f.untried).length };
}

/** Comes back for embeddings that failed, a few times, then settles on what was built. */
const repair: Stage = async (db, env, ctx, job) => {
  let coverage = await measure(db, job);
  const repairs = job.progress.cursor;
  if (coverage.embedded! < coverage.chunks!) {
    await embedMissing(db, env, ctx, job, 500);
    coverage = await measure(db, job);
  }
  const embedded = coverage.embedded === coverage.chunks;
  const enriched = embedded && coverage.digested! >= coverage.sections! && coverage.blocks === coverage.chunked && !coverage.undescribed;
  if (!embedded && repairs < MAX_REPAIRS) return { coverage, progress: { cursor: repairs + 1 }, nextRunAt: new Date(Date.now() + 10 * 60_000 * (repairs + 1)) };
  return { stage: 'done', coverage, readiness: enriched ? 'enriched' : 'searchable' };
};

const stages: Record<Exclude<Job['stage'], 'done'>, Stage> = { chunk, embed: embedStage, digest, figures, repair };
