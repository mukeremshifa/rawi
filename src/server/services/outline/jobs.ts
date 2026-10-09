import { and, asc, eq, inArray, isNull, lte, ne, or } from 'drizzle-orm';
import { aiOperations, courses, materials, outlineJobs, topics } from '../../db/schema';
import { socketDb, transaction, type SocketDb } from '../../db/client';
import type { BackendBindings } from '../../config';
import { ApiError } from '../../errors';
import type { Citation } from '../../../shared/contracts/document';
import { blockMarkdown } from '../../../shared/domain/document-text';
import { OUTLINE_MAX, type OutlineJobKind, type OutlineJobResult } from '../../../shared/contracts/outline';
import { reserveExecution, settleExecution } from '../ai/operations';
import { anthropicProvider, costMicros, OUTLINE_MODELS, OUTLINE_PROMPT_VERSION, ProviderFailed, reservationMicros, syllabusPrompt, mappingPrompt, draftPrompt } from './anthropic';
import { rulesProvider } from './rules';
import { citedOnly, housePunctuation, sequenceNumber, type DraftInput, type MappingInput, type OutlineProvider, type SyllabusInput, type Usage } from './provider';
import { readyMaterials, writeSuggestions } from './links';
import { sections, sectionExcerpt, versionBlocks, type SectionBlock } from './sections';
import { addTopics, applyAssessments, applyTopics } from './outline';
import { enqueueJob, remapAll } from './queue';
import { outlineView } from './outline';
import { usableStatus } from '../../../shared/contracts/document';
import { materialVersions } from '../../db/schema';

/**
 * Outline jobs advance like conversions: from `waitUntil` after the event
 * that queued them, from the outline status read, and from the cron sweep.
 * A job runs under a lease. Reading the syllabus and drafting an outline
 * never run at the same time for one course, and mappings wait for both.
 */
const LEASE_MS = 180_000;
const MAX_ATTEMPTS = 3;
type Job = typeof outlineJobs.$inferSelect;
type Scope = { workspaceId: string; courseId: string };
const OUTLINE_KINDS: OutlineJobKind[] = ['read_syllabus', 'draft_outline'];

const due = (now: Date) => and(or(eq(outlineJobs.state, 'queued'), and(eq(outlineJobs.state, 'running'), lte(outlineJobs.leaseExpiresAt, now))), or(isNull(outlineJobs.nextRunAt), lte(outlineJobs.nextRunAt, now)));

/** Whether a course has work a status read should start. */
export async function courseJobsDue(db: SocketDb, scope: Scope) {
  const [row] = await db.select({ id: outlineJobs.id }).from(outlineJobs).where(and(eq(outlineJobs.workspaceId, scope.workspaceId), eq(outlineJobs.courseId, scope.courseId), due(new Date()))).limit(1);
  return !!row;
}

/** Run a course's due jobs on their own connection. Safe to call from `waitUntil`. */
export async function runCourseJobs(env: BackendBindings, scope: Scope) {
  if (!env.DATABASE_URL) return;
  const connection = socketDb(env.DATABASE_URL);
  try {
    for (let i = 0; i < 25; i++) {
      const next = await connection.db.select({ id: outlineJobs.id }).from(outlineJobs).where(and(eq(outlineJobs.workspaceId, scope.workspaceId), eq(outlineJobs.courseId, scope.courseId), due(new Date()))).orderBy(asc(outlineJobs.createdAt)).limit(5);
      let ran = false;
      for (const job of next) if (await step(connection.db, env, job.id)) { ran = true; break; }
      if (!ran) break;
    }
  } catch (error) { console.log(JSON.stringify({ operation: 'outline-job', error: error instanceof ApiError ? error.code : 'unexpected' })); }
  finally { await connection.close(); }
}

/** The cron safety net. */
export async function sweepOutlineJobs(db: SocketDb, env: BackendBindings, limit = 10) {
  const rows = await db.select({ id: outlineJobs.id }).from(outlineJobs).where(due(new Date())).orderBy(asc(outlineJobs.createdAt)).limit(limit);
  let ran = 0;
  for (const row of rows) { try { if (await step(db, env, row.id)) ran++; } catch { /* The next sweep retries. */ } }
  return { outlineJobs: ran };
}

async function claim(db: SocketDb, jobId: string) {
  return transaction(db, async tx => {
    const [job] = await tx.select().from(outlineJobs).where(eq(outlineJobs.id, jobId));
    if (!job) return null;
    // Locking the course serialises claims, so two workers cannot both start an outline job.
    await tx.select({ id: courses.id }).from(courses).where(and(eq(courses.workspaceId, job.workspaceId), eq(courses.id, job.courseId))).for('update');
    const [row] = await tx.select().from(outlineJobs).where(and(eq(outlineJobs.id, jobId), due(new Date()))).for('update');
    if (!row) return null;
    if (row.attempts >= MAX_ATTEMPTS) {
      await tx.update(outlineJobs).set({ state: 'failed', failure: 'This job stopped after several attempts.', leaseToken: null, leaseExpiresAt: null, updatedAt: new Date() }).where(eq(outlineJobs.id, jobId));
      return null;
    }
    const others = await tx.select({ kind: outlineJobs.kind, state: outlineJobs.state, lease: outlineJobs.leaseExpiresAt, created: outlineJobs.createdAt }).from(outlineJobs)
      .where(and(eq(outlineJobs.workspaceId, row.workspaceId), eq(outlineJobs.courseId, row.courseId), ne(outlineJobs.id, row.id), inArray(outlineJobs.state, ['queued', 'running'])));
    const running = (o: typeof others[number]) => o.state === 'running' && !!o.lease && o.lease > new Date();
    if (OUTLINE_KINDS.includes(row.kind) && others.some(o => OUTLINE_KINDS.includes(o.kind) && (running(o) || o.created < row.createdAt))) return null;
    if (row.kind === 'map_material' && others.some(o => OUTLINE_KINDS.includes(o.kind))) return null;
    const token = crypto.randomUUID();
    const [leased] = await tx.update(outlineJobs).set({ state: 'running', leaseToken: token, leaseExpiresAt: new Date(Date.now() + LEASE_MS), attempts: row.attempts + 1, updatedAt: new Date() }).where(eq(outlineJobs.id, jobId)).returning();
    return { job: leased!, token };
  });
}

async function finish(db: SocketDb, job: Job, token: string, fields: Partial<Job>) {
  await db.update(outlineJobs).set({ ...fields, leaseToken: null, leaseExpiresAt: null, updatedAt: new Date() }).where(and(eq(outlineJobs.id, job.id), eq(outlineJobs.leaseToken, token)));
}

/** Claim and run one job. Returns false when it was not claimable now. */
async function step(db: SocketDb, env: BackendBindings, jobId: string) {
  const claimed = await claim(db, jobId);
  if (!claimed) return false;
  const { job, token } = claimed;
  try {
    const prepared = await prepare(db, job);
    if (!prepared) { await finish(db, job, token, { state: 'done', result: { provider: 'rules' } }); return true; }
    const outcome = await execute(db, env, job, prepared);
    if (outcome === 'busy') { await finish(db, job, token, { state: 'queued', attempts: job.attempts - 1, nextRunAt: new Date(Date.now() + 30_000) }); return true; }
    const result = await transaction(db, async tx => {
      const [current] = await tx.select().from(outlineJobs).where(eq(outlineJobs.id, job.id)).for('update');
      if (current?.leaseToken !== token) throw new ApiError(409, 'lease_lost', 'The outline job lease expired.');
      const summary = await prepared.apply(tx, outcome.value);
      const result: OutlineJobResult = { provider: outcome.provider, ...(outcome.fallback ? { fallback: outcome.fallback } : {}), ...summary };
      await tx.update(outlineJobs).set({ state: 'done', result, failure: null, leaseToken: null, leaseExpiresAt: null, updatedAt: new Date() }).where(eq(outlineJobs.id, job.id));
      return result;
    });
    console.log(JSON.stringify({ operation: 'outline-job', kind: job.kind, jobId: job.id, ...result }));
  } catch (error) {
    if (error instanceof ApiError && error.code === 'lease_lost') return true;
    console.log(JSON.stringify({ operation: 'outline-job-failed', kind: job.kind, jobId: job.id, error: error instanceof ApiError ? error.code : 'unexpected' }));
    await finish(db, job, token, job.attempts >= MAX_ATTEMPTS ? { state: 'failed', failure: 'The outline could not be updated. Try reading again.' } : { state: 'queued', nextRunAt: new Date(Date.now() + 60_000) });
  }
  return true;
}

type Prepared = {
  input: SyllabusInput | MappingInput | DraftInput;
  run: (provider: OutlineProvider) => Promise<{ value: unknown; usage?: Usage }>;
  prompt: () => { system: string; prompt: string };
  apply: (tx: Parameters<Parameters<typeof transaction>[1]>[0], value: unknown) => Promise<Omit<OutlineJobResult, 'provider' | 'fallback'>>;
};

/**
 * The model when a key is configured and the budget allows, otherwise the
 * rules. A model failure also falls back to the rules, and says so.
 */
async function execute(db: SocketDb, env: BackendBindings, job: Job, prepared: Prepared): Promise<'busy' | { value: unknown; provider: 'anthropic' | 'rules'; fallback?: OutlineJobResult['fallback'] }> {
  const rules = async (fallback: OutlineJobResult['fallback']) => ({ value: (await prepared.run(rulesProvider)).value, provider: 'rules' as const, fallback });
  if (!env.ANTHROPIC_API_KEY) return rules('unconfigured');
  const model = OUTLINE_MODELS[job.kind];
  const prompts = prepared.prompt();
  const operationId = crypto.randomUUID(), executionId = crypto.randomUUID();
  await db.insert(aiOperations).values({ id: operationId, workspaceId: job.workspaceId, courseId: job.courseId, task: job.kind, targetId: job.id, fingerprint: job.id, input: { jobId: job.id, versionId: job.versionId }, state: 'blocked', model, promptVersion: OUTLINE_PROMPT_VERSION });
  try { await reserveExecution(db, job.workspaceId, operationId, executionId, reservationMicros(model, prompts.system.length + prompts.prompt.length)); }
  catch (error) {
    await db.update(aiOperations).set({ state: 'failed', reason: error instanceof ApiError ? error.message : 'Not reserved.', updatedAt: new Date() }).where(eq(aiOperations.id, operationId));
    if (error instanceof ApiError && error.code === 'ai_busy') return 'busy';
    if (error instanceof ApiError && (error.code === 'ai_budget' || error.code === 'invalid_reservation')) return rules('budget');
    throw error;
  }
  try {
    const { value, usage } = await prepared.run(anthropicProvider(env.ANTHROPIC_API_KEY));
    await settleExecution(db, job.workspaceId, executionId, { state: 'settled', chargedMicros: costMicros(model, usage!), usage });
    await db.update(aiOperations).set({ state: 'complete', reason: null, result: { jobId: job.id }, updatedAt: new Date() }).where(eq(aiOperations.id, operationId));
    return { value, provider: 'anthropic' };
  } catch (error) {
    const usage = (error as { usage?: Usage }).usage;
    const status = (error as { status?: number }).status;
    // A completed response is charged. An error status means nothing was generated. Anything else may have been.
    await settleExecution(db, job.workspaceId, executionId, usage ? { state: 'settled', chargedMicros: costMicros(model, usage), usage } : status && status < 500 ? { state: 'released' } : { state: 'ambiguous' }).catch(() => undefined);
    console.log(JSON.stringify({ operation: 'outline-model-failed', kind: job.kind, jobId: job.id, reason: error instanceof ProviderFailed ? error.message : status ?? 'unreachable' }));
    return rules('failed');
  }
}

const keyMap = <T,>(prefix: string, items: T[]) => new Map(items.map((item, i) => [`${prefix}${i}`, item]));

async function prepare(db: SocketDb, job: Job): Promise<Prepared | null> {
  const scope = { workspaceId: job.workspaceId, courseId: job.courseId };
  const [course] = await db.select().from(courses).where(and(eq(courses.workspaceId, scope.workspaceId), eq(courses.id, scope.courseId)));
  if (!course) return null;
  const outline = await db.select().from(topics).where(and(eq(topics.workspaceId, scope.workspaceId), eq(topics.courseId, scope.courseId))).orderBy(asc(topics.order));

  if (job.kind === 'read_syllabus') {
    const [material] = await db.select().from(materials).where(eq(materials.id, job.materialId!));
    // A newer version of the syllabus has its own job.
    if (!material || material.currentVersionId !== job.versionId || course.syllabusMaterialId !== material.id) return null;
    const list = await versionBlocks(db, scope.workspaceId, job.versionId!);
    const blocks = keyMap('b', boundedBlocks(list, 150_000));
    const current = keyMap('t', outline);
    const input: SyllabusInput = { courseName: course.name, blocks: [...blocks].map(([key, b]) => ({ key, text: blockMarkdown(b) })), current: [...current].map(([key, t]) => ({ key, title: t.title, module: t.module })) };
    const cite = (keys: string[]): Citation => ({ materialId: material.id, versionId: job.versionId!, blockIds: [...new Set(keys.flatMap(k => blocks.get(k)?.id ?? []))].slice(0, 50) });
    return {
      input, prompt: () => syllabusPrompt(input), run: p => p.readSyllabus(input),
      apply: async (tx, raw) => {
        const reading = raw as Awaited<ReturnType<OutlineProvider['readSyllabus']>>['value'];
        const known = new Set(blocks.keys());
        const kept = citedOnly(reading.topics.map((t, index) => ({ ...t, index })), t => t.blocks, known);
        let ids: string[] = [], added = 0;
        if (kept.length) {
          const applied = await applyTopics(tx, scope, kept.map(t => ({ existingId: t.existing ? current.get(t.existing)?.id ?? null : null, title: t.title.trim(), module: t.module.trim(), summary: housePunctuation(t.summary), source: cite(t.blocks) })), 'syllabus');
          ids = applied.ids; added = applied.added;
          await remapAll(tx, scope, material.id);
        }
        const position = new Map(kept.map((t, i) => [t.index, ids[i]!]));
        const assessments = citedOnly(reading.assessments, a => a.blocks, known).map(a => ({
          title: a.title.trim(), type: a.type, date: a.date && /^\d{4}-\d{2}-\d{2}$/.test(a.date) && !Number.isNaN(Date.parse(a.date)) ? a.date : null,
          weight: a.weight !== null && a.weight >= 0 && a.weight <= 100 ? a.weight : null, topicIds: [...new Set(a.topics.flatMap(i => position.get(i) ?? []))], source: cite(a.blocks),
        }));
        const written = await applyAssessments(tx, scope, material.id, assessments);
        return { topics: kept.length, assessments: written, ...(added ? { links: 0 } : {}) };
      },
    };
  }

  if (job.kind === 'map_material') {
    const [material] = await db.select().from(materials).where(eq(materials.id, job.materialId!));
    if (!material || material.currentVersionId !== job.versionId || material.kind === 'syllabus' || material.archived) return null;
    const room = course.syllabusMaterialId ? 0 : Math.min(2, Math.max(0, OUTLINE_MAX - outline.length));
    if (!outline.length && !room) return null;
    const list = await versionBlocks(db, scope.workspaceId, job.versionId!);
    const all = sections(list);
    const top = Math.min(...all.filter(s => s.headingBlockId).map(s => s.level), 9);
    const chosen = all.filter(s => !s.headingBlockId || s.level <= top + 1).slice(0, 120);
    const keyed = keyMap('s', chosen), topicKeys = keyMap('t', outline);
    const input: MappingInput = { materialTitle: material.title, newTopics: room, sections: [...keyed].map(([key, s]) => ({ key, heading: s.heading || material.title, excerpt: sectionExcerpt(list, s, 400), parent: chosen.some(o => o !== s && !!o.headingBlockId && s.blockIds.includes(o.headingBlockId)) })), topics: [...topicKeys].map(([key, t]) => ({ key, title: t.title, summary: t.summary })) };
    return {
      input, prompt: () => mappingPrompt(input), run: p => p.mapMaterial(input),
      apply: async (tx, raw) => {
        const mapping = raw as Awaited<ReturnType<OutlineProvider['mapMaterial']>>['value'];
        const suggestions: { headingBlockId: string | null; topicId: string }[] = [];
        for (const link of mapping.links) {
          const section = keyed.get(link.section);
          if (section) for (const key of link.topics.slice(0, 2)) { const topic = topicKeys.get(key); if (topic) suggestions.push({ headingBlockId: section.headingBlockId, topicId: topic.id }); }
        }
        const fresh = room ? citedOnly(mapping.newTopics, t => t.sections, new Set(keyed.keys()), room) : [];
        const created = await addTopics(tx, scope, fresh.map(t => {
          const first = keyed.get(t.sections.find(k => keyed.has(k))!)!;
          return { title: t.title.trim(), module: '', summary: housePunctuation(t.summary), source: { materialId: material.id, versionId: job.versionId!, blockIds: [first.firstBlockId!] } };
        }));
        for (const [i, topic] of created.entries()) for (const key of fresh[i]!.sections) { const s = keyed.get(key); if (s) suggestions.push({ headingBlockId: s.headingBlockId, topicId: topic.id }); }
        const links = await writeSuggestions(tx, { ...scope, materialId: material.id, versionId: job.versionId! }, all, suggestions);
        return { links, topics: created.length };
      },
    };
  }

  // draft_outline
  if (outline.length || course.syllabusMaterialId) return null;
  const ready = await readyMaterials(db, scope, null);
  if (ready.length < 2) return null;
  const docs = await Promise.all(ready.map(async m => ({ m, list: await versionBlocks(db, scope.workspaceId, m.versionId) })));
  const headingKeys = new Map<string, { materialId: string; versionId: string; blockId: string }>();
  let n = 0;
  const input: DraftInput = {
    courseName: course.name,
    materials: docs.map(({ m, list }, i) => {
      const heads = sections(list).filter(s => s.headingBlockId && s.level <= 3).slice(0, 60);
      const lead = list[0] ? `h${n++}` : null;
      if (lead) headingKeys.set(lead, { materialId: m.id, versionId: m.versionId, blockId: list[0]!.id });
      return { key: `m${i}`, title: m.title, order: sequenceNumber(m.title), lead, headings: heads.map(h => { const key = `h${n++}`; headingKeys.set(key, { materialId: m.id, versionId: m.versionId, blockId: h.headingBlockId! }); return { key, text: h.heading, level: h.level }; }) };
    }),
  };
  return {
    input, prompt: () => draftPrompt(input), run: p => p.draftOutline(input),
    apply: async (tx, raw) => {
      const draft = raw as Awaited<ReturnType<OutlineProvider['draftOutline']>>['value'];
      const materialOf = new Map(input.materials.map((m, i) => [m.key, docs[i]!.m]));
      const kept = citedOnly(draft.topics, t => [t.material], new Set(materialOf.keys()));
      // A course outlined meanwhile keeps its outline.
      const [existing] = await tx.select({ id: topics.id }).from(topics).where(and(eq(topics.workspaceId, scope.workspaceId), eq(topics.courseId, scope.courseId))).limit(1);
      if (existing || !kept.length) return { topics: 0 };
      await applyTopics(tx, scope, kept.map(t => {
        const m = materialOf.get(t.material)!;
        const heading = t.heading ? headingKeys.get(t.heading) : undefined;
        const block = heading && heading.materialId === m.id ? heading.blockId : docs.find(d => d.m.id === m.id)!.list[0]!.id;
        return { existingId: null, title: t.title.trim(), module: t.module.trim(), summary: housePunctuation(t.summary), source: { materialId: m.id, versionId: m.versionId, blockIds: [block] } };
      }), 'materials');
      await remapAll(tx, scope, null);
      return { topics: kept.length };
    },
  };
}

/** Blocks in order up to a character budget. Large documents are out of scope, so the rest is left out. */
function boundedBlocks(list: SectionBlock[], chars: number) {
  const out: SectionBlock[] = [];
  let used = 0;
  for (const block of list) {
    const size = blockMarkdown(block).length;
    if (!size) continue;
    if (used + size > chars) break;
    out.push(block); used += size;
  }
  return out;
}

/** Read the syllabus again, for when the rules pass ran because the model was unavailable. */
export async function readAgain(db: SocketDb, scope: Scope) {
  await transaction(db, async tx => {
    const [course] = await tx.select().from(courses).where(and(eq(courses.workspaceId, scope.workspaceId), eq(courses.id, scope.courseId))).for('update');
    if (!course) throw new ApiError(404, 'not_found', 'This record is unavailable.');
    const [material] = course.syllabusMaterialId ? await tx.select().from(materials).where(eq(materials.id, course.syllabusMaterialId)) : [];
    const [version] = material?.currentVersionId ? await tx.select().from(materialVersions).where(eq(materialVersions.id, material.currentVersionId)) : [];
    if (!material || !version || !usableStatus(version.status)) throw new ApiError(409, 'no_syllabus', 'Add a readable syllabus first.');
    await enqueueJob(tx, scope, 'read_syllabus', { materialId: material.id, versionId: version.id });
  });
  return outlineView(db, scope.workspaceId, scope.courseId);
}
