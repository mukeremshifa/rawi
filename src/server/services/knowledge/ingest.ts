import { and, asc, eq, inArray, isNull, lte, ne, or, sql } from 'drizzle-orm';
import { figureDescriptions, ingestJobs, knowledgeChunks, knowledgeFacts, knowledgeSections, materials, materialVersions, fileObjects } from '../../db/schema';
import { socketDb, transaction, type ReadDb, type SocketDb, type Transaction } from '../../db/client';
import type { BackendBindings } from '../../config';
import { ApiError } from '../../errors';
import { adaptersFor, embed, run, type CallContext } from '../../ai/engine';
import type { Language } from '../../ai/types';
import { blockMarkdown, spansText } from '../../../shared/domain/document-text';
import { versionBlocks, type SectionBlock } from '../outline/sections';
import { detectLanguage, searchConfig } from './language';
import { digestTask, figureTask, type DigestInput } from './tasks';

/**
 * Each ready version is read once into a knowledge layer: chunks for search with embeddings,
 * section summaries and key terms, atomic facts and figure descriptions, all citing blocks of
 * that version. The job runs in stages under a lease, keeps a cursor so a large version spans
 * several steps, and is superseded when a newer version of the material arrives.
 */
type Job = typeof ingestJobs.$inferSelect;
type Scope = { workspaceId: string; courseId: string };
const LEASE_MS = 120_000;
const MAX_FAILURES = 4;
const CHUNK_CHARS = 1200;

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
  if (!Object.keys(adaptersFor(env)).length) return { ingestJobs: 0 };
  const rows = await db.select({ id: ingestJobs.id }).from(ingestJobs).where(due(new Date())).orderBy(asc(ingestJobs.createdAt)).limit(limit);
  let ran = 0;
  for (const row of rows) { try { if (await step(db, env, row.id, Date.now() + 60_000)) ran++; } catch { /* The next sweep retries. */ } }
  return { ingestJobs: ran };
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
    }
    await save(db, job, token, job.stage === 'done' ? { state: 'done', leaseToken: null, leaseExpiresAt: null, failure: null } : { state: 'queued', leaseToken: null, leaseExpiresAt: null, nextRunAt: null });
    if (job.stage === 'done') console.log(JSON.stringify({ operation: 'ingest-done', jobId: job.id, versionId: job.versionId }));
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

/* ── Stages ──────────────────────────────────────────────────────────────── */

type Stage = (db: SocketDb, env: BackendBindings, ctx: CallContext, job: Job) => Promise<Partial<Job>>;

/** Chunks follow sections: a heading starts a new chunk, and long sections split near CHUNK_CHARS. */
export function chunkBlocks(list: SectionBlock[]) {
  const out: { sectionBlockId: string | null; heading: string; blockIds: string[]; text: string }[] = [];
  let heading = '', sectionBlockId: string | null = null, current: { ids: string[]; parts: string[]; size: number } = { ids: [], parts: [], size: 0 };
  const flush = () => { if (current.ids.length) out.push({ sectionBlockId, heading, blockIds: current.ids, text: current.parts.join('\n\n') }); current = { ids: [], parts: [], size: 0 }; };
  for (const block of list) {
    if (block.type === 'heading') { flush(); heading = spansText(block.content.spans).trim().slice(0, 300); sectionBlockId = block.id; continue; }
    const text = blockMarkdown(block).trim().slice(0, 4000);
    if (!text) continue;
    if (current.size && current.size + text.length > CHUNK_CHARS) flush();
    current.ids.push(block.id); current.parts.push(text); current.size += text.length;
  }
  flush();
  return out;
}

const chunk: Stage = async (db, _env, _ctx, job) => {
  const list = await versionBlocks(db, job.workspaceId, job.versionId);
  const chunks = chunkBlocks(list);
  const language = detectLanguage(chunks.map(c => c.text).join(' ').slice(0, 20000));
  const config = searchConfig(language);
  await transaction(db, async tx => {
    await tx.delete(knowledgeChunks).where(eq(knowledgeChunks.versionId, job.versionId));
    await tx.update(materialVersions).set({ language }).where(eq(materialVersions.id, job.versionId));
    for (let i = 0; i < chunks.length; i += 100) {
      await tx.insert(knowledgeChunks).values(chunks.slice(i, i + 100).map((c, n) => ({
        id: crypto.randomUUID(), workspaceId: job.workspaceId, courseId: job.courseId, materialId: job.materialId, versionId: job.versionId,
        ordinal: i + n, sectionBlockId: c.sectionBlockId, heading: c.heading, blockIds: c.blockIds, text: c.text, language, tokens: Math.ceil(c.text.length / 4),
        search: sql`to_tsvector(${config}::regconfig, ${`${c.heading}\n${c.text}`})` as unknown as string,
      })));
    }
  });
  return { stage: 'embed', progress: { cursor: 0 } };
};

const embedStage: Stage = async (db, env, ctx, job) => {
  const rows = await db.select({ id: knowledgeChunks.id, heading: knowledgeChunks.heading, text: knowledgeChunks.text, language: knowledgeChunks.language }).from(knowledgeChunks)
    .where(and(eq(knowledgeChunks.versionId, job.versionId), isNull(knowledgeChunks.embedding))).orderBy(asc(knowledgeChunks.ordinal)).offset(job.progress.cursor).limit(100);
  if (!rows.length) return { stage: 'digest', progress: { cursor: 0 } };
  const result = await embed(env, ctx, rows.map(r => `${r.heading}\n${r.text}`), 'document', rows[0]!.language);
  // Without an embedding route, search falls back to text alone. Skip these rows and go on.
  if (!result) return { progress: { cursor: job.progress.cursor + rows.length } };
  await db.execute(sql`update ${knowledgeChunks} set embedding = v.e::vector, embedding_model = ${result.model}
    from (values ${sql.join(rows.map((r, i) => sql`(${r.id}::uuid, ${`[${result.vectors[i]!.join(',')}]`})`), sql`, `)}) as v(id, e) where ${knowledgeChunks.id} = v.id`);
  return { progress: job.progress };
};

/** Sections in reading order, merged from chunks, for the digest. */
async function chunkSections(db: SocketDb, versionId: string) {
  const rows = await db.select({ sectionBlockId: knowledgeChunks.sectionBlockId, heading: knowledgeChunks.heading, blockIds: knowledgeChunks.blockIds, language: knowledgeChunks.language }).from(knowledgeChunks).where(eq(knowledgeChunks.versionId, versionId)).orderBy(asc(knowledgeChunks.ordinal));
  const out: { sectionBlockId: string | null; heading: string; blockIds: string[]; language: Language }[] = [];
  for (const r of rows) {
    const last = out.at(-1);
    if (last && last.sectionBlockId === r.sectionBlockId) last.blockIds.push(...r.blockIds);
    else out.push({ ...r, blockIds: [...r.blockIds] });
  }
  return out;
}

const digest: Stage = async (db, env, ctx, job) => {
  const all = await chunkSections(db, job.versionId);
  const start = job.progress.cursor;
  if (start >= all.length) return { stage: 'figures', progress: { cursor: 0 } };
  const list = await versionBlocks(db, job.workspaceId, job.versionId);
  const byId = new Map(list.map(b => [b.id, b]));
  const [material] = await db.select({ title: materials.title }).from(materials).where(eq(materials.id, job.materialId));
  // Several sections per call, up to about 8000 characters of material.
  const group: typeof all = [];
  let size = 0;
  for (const s of all.slice(start)) {
    const chars = s.blockIds.reduce((n, id) => n + (byId.get(id) ? blockMarkdown(byId.get(id)!).length : 0), 0);
    if (group.length && (size + chars > 8000 || group.length >= 6)) break;
    group.push(s); size += chars;
  }
  const keys = new Map<string, string>();
  let n = 0;
  const input: DigestInput = {
    language: group[0]!.language, materialTitle: material?.title ?? '',
    sections: group.map((s, i) => ({ key: `s${i}`, heading: s.heading || material?.title || '', blocks: s.blockIds.flatMap(id => { const b = byId.get(id); const text = b ? blockMarkdown(b).trim().slice(0, 3000) : ''; if (!text) return []; const key = `b${n++}`; keys.set(key, id); return [{ key, text }]; }) })),
  };
  const served = await run(env, ctx, digestTask, input);
  const scope = { workspaceId: job.workspaceId, courseId: job.courseId, materialId: job.materialId, versionId: job.versionId };
  await transaction(db, async tx => {
    for (const [i, s] of group.entries()) {
      const d = served.value.sections.find(o => o.key === `s${i}`)!;
      await tx.insert(knowledgeSections).values({ id: crypto.randomUUID(), ...scope, sectionBlockId: s.sectionBlockId, heading: s.heading, summary: d.summary.trim().slice(0, 600), keyTerms: d.keyTerms.slice(0, 6).map(t => t.trim().slice(0, 80)).filter(Boolean), blockIds: s.blockIds, language: s.language, model: served.route.model })
        .onConflictDoUpdate({ target: [knowledgeSections.versionId, knowledgeSections.sectionBlockId], set: { summary: d.summary.trim().slice(0, 600), model: served.route.model } });
      await tx.delete(knowledgeFacts).where(and(eq(knowledgeFacts.versionId, job.versionId), s.sectionBlockId ? eq(knowledgeFacts.sectionBlockId, s.sectionBlockId) : isNull(knowledgeFacts.sectionBlockId)));
      // A fact keeps only the block keys that belong to its own section.
      const facts = d.facts.slice(0, 8).flatMap(f => { const ids = [...new Set(f.blocks.map(k => keys.get(k)).filter((id): id is string => !!id && s.blockIds.includes(id)))]; return ids.length && f.text.trim() ? [{ id: crypto.randomUUID(), ...scope, sectionBlockId: s.sectionBlockId, text: f.text.trim().slice(0, 500), blockIds: ids, language: s.language }] : []; });
      if (facts.length) await tx.insert(knowledgeFacts).values(facts);
    }
  });
  return { progress: { cursor: start + group.length } };
};

const figures: Stage = async (db, env, ctx, job) => {
  const list = await versionBlocks(db, job.workspaceId, job.versionId);
  const done = new Set((await db.select({ id: figureDescriptions.blockId }).from(figureDescriptions).where(eq(figureDescriptions.versionId, job.versionId))).map(r => r.id));
  const pending = list.filter(b => b.type === 'figure' && b.content.assetId && !done.has(b.id));
  const block = pending[0];
  if (!block || block.type !== 'figure' || !env.MATERIALS_BUCKET) return { stage: 'done' };
  const [object] = await db.select({ key: fileObjects.key, type: fileObjects.detectedType }).from(fileObjects).where(and(eq(fileObjects.workspaceId, job.workspaceId), eq(fileObjects.id, block.content.assetId!)));
  const body = object && /^image\/(png|jpe?g|webp|gif)$/.test(object.type) ? await env.MATERIALS_BUCKET.get(object.key) : null;
  const [version] = await db.select({ language: materialVersions.language }).from(materialVersions).where(eq(materialVersions.id, job.versionId));
  const scope = { workspaceId: job.workspaceId, courseId: job.courseId, materialId: job.materialId, versionId: job.versionId };
  if (!body) {
    // An image that cannot be read keeps its caption only, and is not tried again.
    await db.insert(figureDescriptions).values({ blockId: block.id, ...scope, description: '', language: version?.language ?? 'en', model: 'none' }).onConflictDoNothing();
    return {};
  }
  const at = list.indexOf(block);
  const context = list.slice(Math.max(0, at - 2), at + 3).filter(b => b !== block).map(blockMarkdown).join('\n');
  const served = await run(env, ctx, figureTask, { language: version?.language ?? 'en', caption: spansText(block.content.caption), context, image: { mime: object!.type, data: new Uint8Array(await body.arrayBuffer()) } });
  await db.insert(figureDescriptions).values({ blockId: block.id, ...scope, description: served.value.slice(0, 1500), language: version?.language ?? 'en', model: served.route.model }).onConflictDoNothing();
  return {};
};

const stages: Record<Exclude<Job['stage'], 'done'>, Stage> = { chunk, embed: embedStage, digest, figures };
