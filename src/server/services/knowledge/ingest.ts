import { and, asc, eq, gte, inArray, isNull, lte, ne, or, sql } from 'drizzle-orm';
import { blocks, facts, figureDescriptions, fileObjects, ingestJobs, knowledgeChunks, materials, materialVersions, sections } from '../../db/schema';
import { socketDb, transaction, type ReadDb, type SocketDb, type Transaction } from '../../db/client';
import type { BackendBindings } from '../../config';
import { ApiError } from '../../errors';
import { AiFailed, embed, funding, run, type CallContext } from '../../ai/engine';
import { PREFERENCE } from '../../ai/catalog';
import type { Language } from '../../ai/types';
import { blockMarkdown, spansText } from '../../../shared/domain/document-text';
import { versionBlocks, type SectionBlock } from '../outline/sections';
import { detectLanguage, searchConfig } from './language';
import { checkFact, leafSections, mergeFacts, ruleFacts, type FactDraft, type LeafSection } from './structure';
import { digestTask, figureTask, KNOWLEDGE_PROMPT_VERSION, type DigestInput } from './tasks';
import type { KnowledgeCoverage } from './types';
import { afterIngest } from './course';

/**
 * Each ready version is read once into a knowledge layer: sections with stable keys, chunks for
 * search with embeddings, section summaries and key terms, typed facts and figure descriptions,
 * all citing blocks of that version. The job runs in stages under a lease, keeps a cursor so a
 * large version spans several steps, and is superseded when a newer version arrives.
 *
 * Tokens are spent once per section text. A section whose text matches one already read, in this
 * workspace and under the same digest prompt, takes its summary and facts from it, so replacing a
 * material pays only for what changed.
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
/** Bump when sections or chunking change. With the embedding model and digest prompt it names the index. */
const STRUCTURE = 'structure-v1';
export const indexVersion = () => `${STRUCTURE}:${CHUNK_CHARS}:${PART_CHARS}:${PREFERENCE.embed[0] ?? 'none'}:${KNOWLEDGE_PROMPT_VERSION}`;

const due = (now: Date) => and(or(eq(ingestJobs.state, 'queued'), and(eq(ingestJobs.state, 'running'), lte(ingestJobs.leaseExpiresAt, now))), or(isNull(ingestJobs.nextRunAt), lte(ingestJobs.nextRunAt, now)));

/** Called in the transaction that makes a version ready or partial. */
export async function enqueueIngest(tx: Transaction, version: Scope & { materialId: string; id: string }) {
  await tx.update(ingestJobs).set({ state: 'superseded', leaseToken: null, leaseExpiresAt: null, updatedAt: new Date() })
    .where(and(eq(ingestJobs.materialId, version.materialId), ne(ingestJobs.versionId, version.id), inArray(ingestJobs.state, ['queued', 'running'])));
  await tx.insert(ingestJobs).values({ id: crypto.randomUUID(), workspaceId: version.workspaceId, courseId: version.courseId, materialId: version.materialId, versionId: version.id }).onConflictDoNothing();
}

/**
 * Current versions built with an older index configuration go back through the stages, a few at
 * a time. Search keeps serving the old chunks until the new ones replace them in one transaction,
 * and unchanged sections keep their digests and facts.
 */
export async function rebuildStale(db: SocketDb, limit = 5) {
  const rows = await db.execute(sql`update ${ingestJobs} set state = 'queued', stage = 'structure', progress = '{"cursor":0}'::jsonb, attempts = 0, next_run_at = null, updated_at = now()
    where id in (select j.id from ${ingestJobs} j join ${materials} m on m.current_version_id = j.version_id
      where j.state = 'done' and j.index_version <> ${indexVersion()} and not m.archived order by j.updated_at limit ${limit}) returning id`);
  return rows.rows.length;
}

/** Whether a course has knowledge work to start, so a page read can hand it to `waitUntil`. */
export async function ingestPending(db: ReadDb | SocketDb, scope: Scope) {
  const [row] = await db.select({ id: ingestJobs.id }).from(ingestJobs).where(and(eq(ingestJobs.workspaceId, scope.workspaceId), eq(ingestJobs.courseId, scope.courseId), due(new Date()))).limit(1);
  return !!row;
}

/** Advance a course's ingest jobs for up to about twenty seconds. Safe to call from `waitUntil`. */
export async function runIngest(env: BackendBindings, scope: Scope) {
  if (!env.DATABASE_URL) return;
  const connection = socketDb(env.DATABASE_URL);
  const deadline = Date.now() + 20_000;
  try {
    while (Date.now() < deadline) {
      const [next] = await connection.db.select({ id: ingestJobs.id }).from(ingestJobs).where(and(eq(ingestJobs.workspaceId, scope.workspaceId), eq(ingestJobs.courseId, scope.courseId), due(new Date()))).orderBy(asc(ingestJobs.createdAt)).limit(1);
      if (!next || !await step(connection.db, env, next.id, deadline)) break;
    }
  } catch (error) { console.log(JSON.stringify({ operation: 'ingest', error: error instanceof ApiError ? error.code : 'unexpected' })); }
  finally { await connection.close(); }
}

/** The cron safety net. */
export async function sweepIngest(db: SocketDb, env: BackendBindings, limit = 5) {
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
      await tx.update(ingestJobs).set({ state: 'failed', failure: 'Reading this material stopped after several attempts.', updatedAt: new Date() }).where(eq(ingestJobs.id, jobId));
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
      job = { ...job, ...next, attempts: 0 };
      // A stage that asks to come back later releases the job until then.
      if (next.nextRunAt) break;
    }
    await save(db, job, token, job.stage === 'done' ? { state: 'done', leaseToken: null, leaseExpiresAt: null, failure: null } : { state: 'queued', leaseToken: null, leaseExpiresAt: null, nextRunAt: job.nextRunAt });
    if (job.stage === 'done') {
      console.log(JSON.stringify({ operation: 'ingest-done', jobId: job.id, versionId: job.versionId, readiness: job.readiness, coverage: job.coverage }));
      await afterIngest(db, { workspaceId: job.workspaceId, courseId: job.courseId });
    }
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
 * Chunks within one section: consecutive blocks share one up to CHUNK_CHARS. An equation stays
 * with the text before and after it, which says what it means.
 */
export function chunkSection(section: LeafSection, byId: Map<string, SectionBlock>) {
  const out: { blockIds: string[]; text: string; uncertain: boolean }[] = [];
  let current = { ids: [] as string[], parts: [] as string[], size: 0, uncertain: false }, afterEquation = false;
  const flush = () => { if (current.ids.length) out.push({ blockIds: current.ids, text: current.parts.join('\n\n'), uncertain: current.uncertain }); current = { ids: [], parts: [], size: 0, uncertain: false }; };
  for (const id of section.blockIds) {
    const block = byId.get(id);
    if (!block) continue;
    const parts = blockParts(block), uncertain = !!block.flags?.uncertain;
    if (!parts.length) continue;
    if (parts.length > 1) {
      flush();
      for (const part of parts) out.push({ blockIds: [id], text: part, uncertain });
      afterEquation = false;
      continue;
    }
    const text = parts[0]!;
    if (current.size && current.size + text.length > CHUNK_CHARS && block.type !== 'equation' && !afterEquation) flush();
    current.ids.push(id); current.parts.push(text); current.size += text.length; current.uncertain ||= uncertain;
    afterEquation = block.type === 'equation';
  }
  flush();
  return out;
}

/* ── Stages ──────────────────────────────────────────────────────────────── */

type Stage = (db: SocketDb, env: BackendBindings, ctx: CallContext, job: Job) => Promise<Partial<Job>>;
const vectorText = (v: number[]) => `[${v.join(',')}]`;
async function sha(text: string) {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))].map(b => b.toString(16).padStart(2, '0')).join('');
}
type SectionRow = typeof sections.$inferSelect;
type FactRow = typeof facts.$inferInsert;

/**
 * Structure, by code: sections, chunks and rule facts. A section whose text is unchanged keeps
 * its row, digest and facts. A new section whose text matches one already read elsewhere in the
 * workspace copies its digest and facts, with block ids mapped across in order.
 */
const structure: Stage = async (db, _env, _ctx, job) => {
  const [list, [version]] = await Promise.all([
    versionBlocks(db, job.workspaceId, job.versionId),
    db.select({ warnings: materialVersions.warnings }).from(materialVersions).where(eq(materialVersions.id, job.versionId)),
  ]);
  const byId = new Map(list.map(b => [b.id, b]));
  const leaves = leafSections(list);
  const language = detectLanguage(leaves.map(s => s.text).join(' ').slice(0, 20000));
  const config = searchConfig(language);
  const hashes = await Promise.all(leaves.map(s => sha(`${KNOWLEDGE_PROMPT_VERSION}\n${s.blockIds.map(id => blockMarkdown(byId.get(id)!).trim()).join('\n\n')}`)));
  const scope = { workspaceId: job.workspaceId, courseId: job.courseId, materialId: job.materialId, versionId: job.versionId };
  let reused = 0;
  await transaction(db, async tx => {
    const prior = await tx.select().from(sections).where(eq(sections.versionId, job.versionId));
    const priorChunks = await tx.select({ text: knowledgeChunks.text, model: knowledgeChunks.embeddingModel, embedding: sql<string | null>`${knowledgeChunks.embedding}::text` }).from(knowledgeChunks).where(eq(knowledgeChunks.versionId, job.versionId));
    const reuseEmbedding = new Map(priorChunks.filter(p => p.embedding && p.model).map(p => [p.text, p]));
    // Digested sections elsewhere in the workspace with the same text, to copy from.
    const donors = hashes.length ? await tx.select().from(sections).where(and(eq(sections.workspaceId, job.workspaceId), inArray(sections.contentHash, hashes), ne(sections.versionId, job.versionId), sql`${sections.digestedBy} is not null and ${sections.digestedBy} not like 'failed%'`)) : [];
    const donorFacts = donors.length ? await tx.select().from(facts).where(inArray(facts.sectionId, donors.map(d => d.id))) : [];
    await tx.delete(knowledgeChunks).where(eq(knowledgeChunks.versionId, job.versionId));
    // Sections that changed are removed. Their facts go with them.
    const kept = new Map(prior.filter(p => leaves.some((s, i) => s.key === p.key && hashes[i] === p.contentHash)).map(p => [p.key, p]));
    const drop = prior.filter(p => !kept.has(p.key)).map(p => p.id);
    if (drop.length) await tx.delete(sections).where(inArray(sections.id, drop));
    // Free ordinals before rewriting them, since the unique constraint is checked per statement.
    if (kept.size) await tx.update(sections).set({ ordinal: sql`-1 - ${sections.ordinal}` }).where(inArray(sections.id, [...kept.values()].map(k => k.id)));
    let chunkOrdinal = 0;
    for (const [i, s] of leaves.entries()) {
      const hash = hashes[i]!;
      const existing = kept.get(s.key);
      let id = existing?.id;
      if (existing) {
        await tx.update(sections).set({ ordinal: s.ordinal, headingBlockId: s.headingBlockId, heading: s.heading, path: s.path, level: s.level, blockIds: s.blockIds, tokens: s.tokens, language }).where(eq(sections.id, existing.id));
      } else {
        id = crypto.randomUUID();
        const donor = donors.find(d => d.contentHash === hash && d.blockIds.length === s.blockIds.length);
        await tx.insert(sections).values({ id, ...scope, ordinal: s.ordinal, key: s.key, headingBlockId: s.headingBlockId, heading: s.heading, path: s.path, level: s.level, blockIds: s.blockIds, tokens: s.tokens, contentHash: hash, language,
          ...(donor ? { summary: donor.summary, keyTerms: donor.keyTerms, digestedBy: donor.digestedBy } : {}) });
        const mapped: FactRow[] = [];
        if (donor) {
          reused++;
          const across = new Map(donor.blockIds.map((b, n) => [b, s.blockIds[n]!]));
          for (const f of donorFacts.filter(f => f.sectionId === donor.id)) mapped.push({ ...f, id: crypto.randomUUID(), ...scope, sectionId: id, blockIds: f.blockIds.map(b => across.get(b)!).filter(Boolean), position: byId.get(across.get(f.blockIds[0]!) ?? '')?.ordinal ?? f.position });
        } else {
          for (const f of ruleFacts(s, byId)) mapped.push(factRow(f, scope, id, byId, language));
        }
        if (mapped.length) await tx.insert(facts).values(mapped);
      }
      const chunks = chunkSection(s, byId);
      if (chunks.length) await tx.insert(knowledgeChunks).values(chunks.map(c => {
        const keep = reuseEmbedding.get(c.text);
        return {
          id: crypto.randomUUID(), ...scope, ordinal: chunkOrdinal++, sectionId: id!, heading: s.heading, blockIds: c.blockIds, text: c.text, language, tokens: Math.ceil(c.text.length / 4), uncertain: c.uncertain,
          search: sql`to_tsvector(${config}::regconfig, ${`${s.path.join(' ')}\n${c.text}`})` as unknown as string,
          ...(keep ? { embedding: sql`${keep.embedding}::vector` as unknown as number[], embeddingModel: keep.model } : {}),
        };
      }));
    }
    await tx.update(materialVersions).set({ language }).where(eq(materialVersions.id, job.versionId));
  });
  const textBlocks = list.filter(b => b.type !== 'heading' && blockMarkdown(b).trim());
  const inSection = new Set(leaves.flatMap(s => s.blockIds));
  const coverage: KnowledgeCoverage = {
    blocks: textBlocks.length, chunked: textBlocks.filter(b => inSection.has(b.id)).length, sections: leaves.length, reused,
    uncertainBlocks: textBlocks.filter(b => b.flags?.uncertain).length, warnings: [...new Set((version?.warnings ?? []).map(w => w.code))],
  };
  return { stage: 'embed', progress: { cursor: 0 }, readiness: 'searchable', coverage, indexVersion: indexVersion() };
};

function factRow(f: FactDraft, scope: { workspaceId: string; courseId: string; materialId: string; versionId: string }, sectionId: string, byId: Map<string, SectionBlock>, language: Language): FactRow {
  return { id: crypto.randomUUID(), ...scope, sectionId, kind: f.kind, subject: f.subject, text: f.text, value: f.value, unit: f.unit, items: f.items, blockIds: f.blockIds, position: byId.get(f.blockIds[0]!)?.ordinal ?? 0, confidence: f.confidence, extractor: f.extractor, language };
}

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

/** Whether any AI service can serve this workspace's background work. Without one, code builds the layer alone. */
async function canUseAi(env: BackendBindings, ctx: CallContext) {
  return Object.keys((await funding(env, ctx)).adapters).length > 0;
}

const embedStage: Stage = async (db, env, ctx, job) => {
  if (!await canUseAi(env, ctx)) return { stage: 'repair', progress: { cursor: MAX_REPAIRS }, coverage: { ...job.coverage, rulesOnly: true } };
  // Failures are left for the repair stage, which counts them, rather than skipped for good.
  const done = job.progress.cursor;
  const { tried, failed } = await embedMissing(db, env, ctx, job, 100);
  if (!tried || failed || done + tried > 2000) return { stage: 'digest', progress: { cursor: 0 } };
  return { progress: { cursor: done + tried } };
};

/** Characters of one block given to the digest. Search sees every character, this bounds one call. */
const DIGEST_BLOCK_CHARS = 8000;

/**
 * Digests sections still unread, several per call up to about 8,000 characters. Facts the model
 * returns are kept only when their cited text bears them out, then merged with the rule facts.
 */
const digest: Stage = async (db, env, ctx, job) => {
  const todo = await db.select().from(sections).where(and(eq(sections.versionId, job.versionId), isNull(sections.digestedBy), gte(sections.ordinal, job.progress.cursor))).orderBy(asc(sections.ordinal)).limit(12);
  if (!todo.length) return { stage: 'figures', progress: { cursor: 0 } };
  const list = await versionBlocks(db, job.workspaceId, job.versionId);
  const byId = new Map(list.map(b => [b.id, b]));
  const [material] = await db.select({ title: materials.title }).from(materials).where(eq(materials.id, job.materialId));
  const text = (id: string) => { const b = byId.get(id); return b && b.type !== 'heading' ? blockMarkdown(b).trim().slice(0, DIGEST_BLOCK_CHARS) : ''; };
  const group: SectionRow[] = [];
  let size = 0;
  for (const s of todo) {
    const chars = s.blockIds.reduce((n, id) => n + text(id).length, 0);
    if (group.length && (size + chars > 8000 || group.length >= 6)) break;
    group.push(s); size += chars;
  }
  const keys = new Map<string, string>();
  let n = 0;
  const input: DigestInput = {
    language: group[0]!.language, materialTitle: material?.title ?? '',
    sections: group.map((s, i) => ({ key: `s${i}`, heading: s.path.join(' / ') || material?.title || '', blocks: s.blockIds.flatMap(id => { const t = text(id); if (!t) return []; const key = `b${n++}`; keys.set(key, id); return [{ key, text: t }]; }) })),
  };
  const nextCursor = group.at(-1)!.ordinal + 1;
  let served;
  try { served = await run(env, ctx, digestTask, input); }
  catch (error) {
    // A digest that fails its checks or stops partway is not repeated here. The sections stay
    // searchable with their rule facts, and coverage records that they have no summary.
    if (error instanceof AiFailed && (error.code === 'ai_invalid' || error.code === 'ai_uncertain')) {
      await db.update(sections).set({ digestedBy: `failed:${error.code}` }).where(inArray(sections.id, group.map(s => s.id)));
      return { progress: { cursor: nextCursor } };
    }
    throw error;
  }
  const scope = { workspaceId: job.workspaceId, courseId: job.courseId, materialId: job.materialId, versionId: job.versionId };
  const extractor = `model:${served.route.id}`;
  await transaction(db, async tx => {
    const existing = await tx.select().from(facts).where(inArray(facts.sectionId, group.map(s => s.id)));
    for (const [i, s] of group.entries()) {
      const d = served.value.sections.find(o => o.key === `s${i}`)!;
      const model = d.facts.slice(0, 10).flatMap(f => {
        const ids = [...new Set(f.blocks.map(k => keys.get(k)).filter((id): id is string => !!id && s.blockIds.includes(id)))];
        if (!ids.length) return [];
        const checked = checkFact({ kind: f.kind, subject: f.subject, text: f.text, value: f.value ?? null, unit: f.unit?.trim() || null, items: f.items ?? null, blockIds: ids }, ids.map(text).join('\n\n'), extractor);
        return checked ? [checked] : [];
      });
      const rules = existing.filter(f => f.sectionId === s.id && f.extractor === 'rule').map(f => ({ ...f, value: f.value, unit: f.unit, items: f.items }));
      const merged = mergeFacts(rules, model);
      await tx.delete(facts).where(eq(facts.sectionId, s.id));
      if (merged.length) await tx.insert(facts).values(merged.map(f => factRow(f, scope, s.id, byId, s.language)));
      await tx.update(sections).set({ summary: d.summary.trim().slice(0, 600), keyTerms: d.keyTerms.slice(0, 6).map(t => t.trim().slice(0, 80)).filter(Boolean), digestedBy: served.route.id }).where(eq(sections.id, s.id));
    }
  });
  return { progress: { cursor: nextCursor } };
};

/** A description shorter than this says too little to be worth searching. */
const USEFUL_DESCRIPTION = 40;

/**
 * Describes one figure per step from its image. Once every figure has been tried, each useful
 * description becomes a search chunk of its own in the figure's section, labelled as generated.
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
  const [chunked, rows, [last]] = await Promise.all([
    db.select({ blockIds: knowledgeChunks.blockIds }).from(knowledgeChunks).where(and(eq(knowledgeChunks.versionId, job.versionId), eq(knowledgeChunks.kind, 'figure'))),
    db.select({ id: sections.id, heading: sections.heading, path: sections.path, blockIds: sections.blockIds }).from(sections).where(eq(sections.versionId, job.versionId)),
    db.select({ ordinal: sql<number>`coalesce(max(${knowledgeChunks.ordinal}), -1)::int` }).from(knowledgeChunks).where(eq(knowledgeChunks.versionId, job.versionId)),
  ]);
  const has = new Set(chunked.flatMap(r => r.blockIds));
  const config = searchConfig(language);
  const fresh = described.filter(d => d.description.trim().length >= USEFUL_DESCRIPTION && !has.has(d.id) && rows.some(s => s.blockIds.includes(d.id)));
  if (fresh.length) await db.insert(knowledgeChunks).values(fresh.map((d, i) => {
    const b = list.find(x => x.id === d.id)!, caption = b.type === 'figure' ? spansText(b.content.caption).trim() : '';
    const section = rows.find(s => s.blockIds.includes(d.id))!;
    const text = `Figure description, generated by Rawi from the image: ${caption ? `${caption}. ` : ''}${d.description.trim()}`;
    return { id: crypto.randomUUID(), ...scope, ordinal: last!.ordinal + 1 + i, sectionId: section.id, heading: section.heading, blockIds: [d.id], text, language, tokens: Math.ceil(text.length / 4), kind: 'figure' as const, search: sql`to_tsvector(${config}::regconfig, ${`${section.path.join(' ')}\n${text}`})` as unknown as string };
  }));
  return { stage: 'repair', progress: { cursor: 0 } };
};

/** What the layer holds now, against what the version needs. */
async function measure(db: SocketDb, job: Job): Promise<KnowledgeCoverage> {
  const [[chunks], [sectionCounts], [factCount], list, [figureRows]] = await Promise.all([
    db.select({ n: sql<number>`count(*)::int`, embedded: sql<number>`count(${knowledgeChunks.embedding})::int` }).from(knowledgeChunks).where(eq(knowledgeChunks.versionId, job.versionId)),
    db.select({ n: sql<number>`count(*)::int`, digested: sql<number>`count(*) filter (where ${sections.digestedBy} is not null and ${sections.digestedBy} not like 'failed%')::int` }).from(sections).where(eq(sections.versionId, job.versionId)),
    db.select({ n: sql<number>`count(*)::int` }).from(facts).where(eq(facts.versionId, job.versionId)),
    db.select({ id: blocks.id, untried: sql<boolean>`${blocks.content}->>'assetId' is not null and not exists (select 1 from ${figureDescriptions} f where f.block_id = ${blocks.id})` }).from(blocks).where(and(eq(blocks.versionId, job.versionId), eq(blocks.type, 'figure'))),
    db.select({ described: sql<number>`count(*) filter (where length(${figureDescriptions.description}) >= ${USEFUL_DESCRIPTION})::int` }).from(figureDescriptions).where(eq(figureDescriptions.versionId, job.versionId)),
  ]);
  return { ...job.coverage, chunks: chunks!.n, embedded: chunks!.embedded, sections: sectionCounts!.n, digested: sectionCounts!.digested, facts: factCount!.n, figures: list.length, described: figureRows!.described, undescribed: list.filter(f => f.untried).length };
}

/** Comes back for embeddings that failed, a few times, then settles on what was built. */
const repair: Stage = async (db, env, ctx, job) => {
  let coverage = await measure(db, job);
  const repairs = job.progress.cursor;
  if (coverage.embedded! < coverage.chunks! && repairs < MAX_REPAIRS) {
    await embedMissing(db, env, ctx, job, 500);
    coverage = await measure(db, job);
  }
  const embedded = coverage.embedded === coverage.chunks;
  const enriched = embedded && coverage.digested! >= coverage.sections! && coverage.blocks === coverage.chunked && !coverage.undescribed;
  if (!embedded && repairs < MAX_REPAIRS) return { coverage, progress: { cursor: repairs + 1 }, nextRunAt: new Date(Date.now() + 10 * 60_000 * (repairs + 1)) };
  return { stage: 'done', coverage, readiness: enriched ? 'enriched' : 'searchable' };
};

const stages: Record<Exclude<Job['stage'], 'done'>, Stage> = { structure, embed: embedStage, digest, figures, repair };
