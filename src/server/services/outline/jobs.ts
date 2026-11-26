import { and, asc, eq, inArray, isNotNull, isNull, lte, ne, or, sql } from 'drizzle-orm';
import {
  courses,
  knowledgeChunks,
  materials,
  outlineJobs,
  sections as sectionRows,
  topics,
  topicSections,
} from '../../db/schema';
import { socketDb, transaction, type SocketDb } from '../../db/client';
import type { BackendBindings } from '../../config';
import { ApiError } from '../../errors';
import type { Citation } from '../../../shared/contracts/document';
import { blockMarkdown } from '../../../shared/domain/document-text';
import { OUTLINE_MAX, type OutlineJobKind, type OutlineJobResult } from '../../../shared/contracts/outline';
import { run, type Task } from '../../ai/engine';
import { fundingFor } from '../../ai/funding';
import { outlineTasks } from './tasks';
import { ingestPending, runIngest } from '../knowledge/ingest';
import { assignTopicsRules, rulesProvider } from './rules';
import {
  citedOnly,
  housePunctuation,
  normalTitle,
  overloadedTopic,
  respread,
  SUBSTANTIAL_WORDS,
  withoutTopic,
  type AssignInput,
  type Assignment,
  type OutlineProvider,
  type SyllabusInput,
} from './provider';
import { liveLinks, writeSuggestions } from './links';
import { versionBlocks, type SectionBlock } from './sections';
import { addTopics, applyAssessments, applyTopics, protectedTopics } from './outline';
import { enqueueJob, reassignAll } from './queue';
import { courseSections } from '../knowledge/course';
import { outlineView } from './outline';
import { usableStatus } from '../../../shared/contracts/document';
import { materialVersions } from '../../db/schema';

/**
 * Outline jobs advance like conversions: from `waitUntil` after the event
 * that queued them, from the outline status read, and from the cron sweep.
 * A job runs under a lease, one at a time per course. Reading the syllabus
 * sets the topics, and assigning topics labels sections that no assignment
 * has looked at, adding topics for subjects nothing names yet.
 */
const LEASE_MS = 180_000;
const MAX_ATTEMPTS = 3;
/** Sections one assignment call looks at. Each carries a summary and terms, so this stays small. */
const ASSIGN_BATCH = 60;
/** Topics a course outline can hold once materials have added theirs. */
const TOPIC_CAP = 40;
/** Cosine distance within which a section reads like a linked one, for this embedding model. */
const NEAR = 0.2;
/** Substantial sections per topic a course without a syllabus may grow to, so its size follows its materials. */
const SECTIONS_PER_TOPIC = 2;
type Job = typeof outlineJobs.$inferSelect;
type Scope = { workspaceId: string; courseId: string };
const OUTLINE_KINDS: OutlineJobKind[] = ['read_syllabus', 'assign_topics'];

const due = (now: Date) =>
  and(
    or(eq(outlineJobs.state, 'queued'), and(eq(outlineJobs.state, 'running'), lte(outlineJobs.leaseExpiresAt, now))),
    or(isNull(outlineJobs.nextRunAt), lte(outlineJobs.nextRunAt, now)),
  );

/** Whether a course has work a status read should start. */
export async function courseJobsDue(db: SocketDb, scope: Scope) {
  const [row] = await db
    .select({ id: outlineJobs.id })
    .from(outlineJobs)
    .where(
      and(eq(outlineJobs.workspaceId, scope.workspaceId), eq(outlineJobs.courseId, scope.courseId), due(new Date())),
    )
    .limit(1);
  return !!row || (await ingestPending(db, scope));
}

/** Run a course's due jobs on their own connection. Safe to call from `waitUntil`. */
export async function runCourseJobs(env: BackendBindings, scope: Scope) {
  if (!env.DATABASE_URL) return;
  await runOutline(env, scope);
  // The knowledge layer follows the same events, on its own connection.
  await runIngest(env, scope);
  // A material read in that pass queues its topic links, which run now rather than at the next status read.
  await runOutline(env, scope);
}

async function runOutline(env: BackendBindings, scope: Scope) {
  const connection = socketDb(env.DATABASE_URL!);
  try {
    for (let i = 0; i < 25; i++) {
      const next = await connection.db
        .select({ id: outlineJobs.id })
        .from(outlineJobs)
        .where(
          and(
            eq(outlineJobs.workspaceId, scope.workspaceId),
            eq(outlineJobs.courseId, scope.courseId),
            due(new Date()),
          ),
        )
        .orderBy(asc(outlineJobs.createdAt))
        .limit(5);
      let ran = false;
      for (const job of next)
        if (await step(connection.db, env, job.id)) {
          ran = true;
          break;
        }
      if (!ran) break;
    }
  } catch (error) {
    console.log(
      JSON.stringify({ operation: 'outline-job', error: error instanceof ApiError ? error.code : 'unexpected' }),
    );
  } finally {
    await connection.close();
  }
}

/** The cron safety net. */
export async function sweepOutlineJobs(db: SocketDb, env: BackendBindings, limit = 10) {
  const rows = await db
    .select({ id: outlineJobs.id })
    .from(outlineJobs)
    .where(due(new Date()))
    .orderBy(asc(outlineJobs.createdAt))
    .limit(limit);
  let ran = 0;
  for (const row of rows) {
    try {
      if (await step(db, env, row.id)) ran++;
    } catch {
      /* The next sweep retries. */
    }
  }
  return { outlineJobs: ran };
}

async function claim(db: SocketDb, jobId: string) {
  return transaction(db, async tx => {
    const [job] = await tx.select().from(outlineJobs).where(eq(outlineJobs.id, jobId));
    if (!job) return null;
    // Locking the course serialises claims, so two workers cannot both start an outline job.
    await tx
      .select({ id: courses.id })
      .from(courses)
      .where(and(eq(courses.workspaceId, job.workspaceId), eq(courses.id, job.courseId)))
      .for('update');
    const [row] = await tx
      .select()
      .from(outlineJobs)
      .where(and(eq(outlineJobs.id, jobId), due(new Date())))
      .for('update');
    if (!row) return null;
    if (row.attempts >= MAX_ATTEMPTS) {
      await tx
        .update(outlineJobs)
        .set({
          state: 'failed',
          failure: 'This job stopped after several attempts.',
          leaseToken: null,
          leaseExpiresAt: null,
          updatedAt: new Date(),
        })
        .where(eq(outlineJobs.id, jobId));
      return null;
    }
    const others = await tx
      .select({
        kind: outlineJobs.kind,
        state: outlineJobs.state,
        lease: outlineJobs.leaseExpiresAt,
        created: outlineJobs.createdAt,
      })
      .from(outlineJobs)
      .where(
        and(
          eq(outlineJobs.workspaceId, row.workspaceId),
          eq(outlineJobs.courseId, row.courseId),
          ne(outlineJobs.id, row.id),
          inArray(outlineJobs.state, ['queued', 'running']),
        ),
      );
    const running = (o: (typeof others)[number]) => o.state === 'running' && !!o.lease && o.lease > new Date();
    // One outline job runs at a time for a course, in the order they were queued.
    if (
      OUTLINE_KINDS.includes(row.kind) &&
      others.some(o => OUTLINE_KINDS.includes(o.kind) && (running(o) || o.created < row.createdAt))
    )
      return null;
    const token = crypto.randomUUID();
    const [leased] = await tx
      .update(outlineJobs)
      .set({
        state: 'running',
        leaseToken: token,
        leaseExpiresAt: new Date(Date.now() + LEASE_MS),
        attempts: row.attempts + 1,
        updatedAt: new Date(),
      })
      .where(eq(outlineJobs.id, jobId))
      .returning();
    return { job: leased!, token };
  });
}

async function finish(db: SocketDb, job: Job, token: string, fields: Partial<Job>) {
  await db
    .update(outlineJobs)
    .set({ ...fields, leaseToken: null, leaseExpiresAt: null, updatedAt: new Date() })
    .where(and(eq(outlineJobs.id, job.id), eq(outlineJobs.leaseToken, token)));
}

/** Claim and run one job. Returns false when it was not claimable now. */
async function step(db: SocketDb, env: BackendBindings, jobId: string) {
  const claimed = await claim(db, jobId);
  if (!claimed) return false;
  const { job, token } = claimed;
  try {
    const prepared = await prepare(db, job);
    // Nothing to do: the job ends without a result, so it never stands in for the latest reading.
    if (!prepared) {
      await finish(db, job, token, { state: 'done', result: null });
      return true;
    }
    const outcome = await execute(db, env, job, prepared);
    if (outcome === 'busy') {
      await finish(db, job, token, {
        state: 'queued',
        attempts: job.attempts - 1,
        nextRunAt: new Date(Date.now() + 30_000),
      });
      return true;
    }
    const result = await transaction(db, async tx => {
      const [current] = await tx.select().from(outlineJobs).where(eq(outlineJobs.id, job.id)).for('update');
      if (current?.leaseToken !== token) throw new ApiError(409, 'lease_lost', 'The outline job lease expired.');
      const summary = await prepared.apply(tx, outcome.value);
      const result: OutlineJobResult = {
        provider: outcome.provider,
        ...(outcome.model ? { model: outcome.model } : {}),
        ...(outcome.fallback ? { fallback: outcome.fallback } : {}),
        ...summary,
      };
      await tx
        .update(outlineJobs)
        .set({ state: 'done', result, failure: null, leaseToken: null, leaseExpiresAt: null, updatedAt: new Date() })
        .where(eq(outlineJobs.id, job.id));
      return result;
    });
    console.log(JSON.stringify({ operation: 'outline-job', kind: job.kind, jobId: job.id, ...result }));
  } catch (error) {
    if (error instanceof ApiError && error.code === 'lease_lost') return true;
    console.log(
      JSON.stringify({
        operation: 'outline-job-failed',
        kind: job.kind,
        jobId: job.id,
        error: error instanceof ApiError ? error.code : 'unexpected',
      }),
    );
    await finish(
      db,
      job,
      token,
      job.attempts >= MAX_ATTEMPTS
        ? { state: 'failed', failure: 'The outline could not be updated. Try reading again.' }
        : { state: 'queued', nextRunAt: new Date(Date.now() + 60_000) },
    );
  }
  return true;
}

type Prepared = {
  input: SyllabusInput | AssignInput;
  run: (provider: OutlineProvider) => Promise<{ value: unknown }>;
  /** A second look at a model's reading, given a way to ask the model again. Its failure keeps the first reading. */
  refine?: (value: unknown, ask: (input: unknown) => Promise<unknown>) => Promise<unknown>;
  apply: (
    tx: Parameters<Parameters<typeof transaction>[1]>[0],
    value: unknown,
  ) => Promise<Omit<OutlineJobResult, 'provider' | 'fallback'>>;
};

/**
 * A model through the engine when a vendor is configured and the budget allows, otherwise the
 * rules. A model failure also falls back to the rules, and the outline says so.
 */
async function execute(
  db: SocketDb,
  env: BackendBindings,
  job: Job,
  prepared: Prepared,
): Promise<
  'busy' | { value: unknown; provider: 'model' | 'rules'; model?: string; fallback?: OutlineJobResult['fallback'] }
> {
  const rules = async (fallback: OutlineJobResult['fallback']) => ({
    value: (await prepared.run(rulesProvider)).value,
    provider: 'rules' as const,
    fallback,
  });
  if (!Object.keys((await fundingFor(env, db, job.workspaceId)).adapters).length) return rules('unconfigured');
  try {
    const ctx = { db, workspaceId: job.workspaceId, jobId: job.id },
      task = outlineTasks[job.kind] as Task<unknown, unknown>;
    const served = await run(env, ctx, task, prepared.input);
    const value = prepared.refine
      ? await prepared
          .refine(served.value, async input => (await run(env, ctx, task, input)).value)
          .catch(() => served.value)
      : served.value;
    return { value, provider: 'model', model: served.route.model };
  } catch (error) {
    const code = error instanceof ApiError ? error.code : 'unexpected';
    if (code === 'ai_busy') return 'busy';
    if (code === 'ai_budget') return rules('budget');
    console.log(JSON.stringify({ operation: 'outline-model-failed', kind: job.kind, jobId: job.id, reason: code }));
    if (code.startsWith('ai_')) return rules('failed');
    throw error;
  }
}

const keyMap = <T>(prefix: string, items: T[]) => new Map(items.map((item, i) => [`${prefix}${i}`, item]));

async function prepare(db: SocketDb, job: Job): Promise<Prepared | null> {
  const scope = { workspaceId: job.workspaceId, courseId: job.courseId };
  const [course] = await db
    .select()
    .from(courses)
    .where(and(eq(courses.workspaceId, scope.workspaceId), eq(courses.id, scope.courseId)));
  if (!course) return null;
  const outline = await db
    .select()
    .from(topics)
    .where(and(eq(topics.workspaceId, scope.workspaceId), eq(topics.courseId, scope.courseId)))
    .orderBy(asc(topics.order));

  if (job.kind === 'read_syllabus') {
    const [material] = await db.select().from(materials).where(eq(materials.id, job.materialId!));
    // A newer version of the syllabus has its own job.
    if (!material || material.currentVersionId !== job.versionId || course.syllabusMaterialId !== material.id)
      return null;
    const list = await versionBlocks(db, scope.workspaceId, job.versionId!);
    const blocks = keyMap('b', boundedBlocks(list, 150_000));
    const current = keyMap('t', outline);
    const input: SyllabusInput = {
      courseName: course.name,
      language: await versionLanguage(db, job.versionId!),
      blocks: [...blocks].map(([key, b]) => ({ key, text: blockMarkdown(b) })),
      current: [...current].map(([key, t]) => ({ key, title: t.title, module: t.module })),
    };
    const cite = (keys: string[]): Citation => ({
      materialId: material.id,
      versionId: job.versionId!,
      blockIds: [...new Set(keys.flatMap(k => blocks.get(k)?.id ?? []))].slice(0, 50),
    });
    return {
      input,
      run: p => p.readSyllabus(input),
      apply: async (tx, raw) => {
        const reading = raw as Awaited<ReturnType<OutlineProvider['readSyllabus']>>['value'];
        const known = new Set(blocks.keys());
        const kept = citedOnly(
          reading.topics.map((t, index) => ({ ...t, index })),
          t => t.blocks,
          known,
        );
        let ids: string[] = [],
          added = 0;
        if (kept.length) {
          const applied = await applyTopics(
            tx,
            scope,
            kept.map(t => ({
              existingId: t.existing ? (current.get(t.existing)?.id ?? null) : null,
              title: t.title.trim(),
              module: t.module.trim(),
              summary: housePunctuation(t.summary),
              source: cite(t.blocks),
            })),
            'syllabus',
          );
          ids = applied.ids;
          added = applied.added;
          await reassignAll(tx, scope);
        }
        const position = new Map(kept.map((t, i) => [t.index, ids[i]!]));
        const assessments = citedOnly(reading.assessments, a => a.blocks, known).map(a => ({
          title: a.title.trim(),
          type: a.type,
          date: a.date && /^\d{4}-\d{2}-\d{2}$/.test(a.date) && !Number.isNaN(Date.parse(a.date)) ? a.date : null,
          weight: a.weight !== null && a.weight >= 0 && a.weight <= 100 ? a.weight : null,
          topicIds: [...new Set(a.topics.flatMap(i => position.get(i) ?? []))],
          source: cite(a.blocks),
        }));
        const written = await applyAssessments(tx, scope, material.id, assessments);
        return { topics: kept.length, assessments: written, ...(added ? { links: 0 } : {}) };
      },
    };
  }

  // assign_topics: sections no assignment has looked at yet, in reading order, a batch at a time.
  const list = await courseSections(db, scope);
  const linked = new Set(
    (
      await db
        .selectDistinct({ materialId: topicSections.materialId, key: topicSections.sectionKey })
        .from(topicSections)
        .where(and(eq(topicSections.workspaceId, scope.workspaceId), eq(topicSections.courseId, scope.courseId)))
    ).map(r => `${r.materialId}:${r.key}`),
  );
  const looked = new Set(
    (
      await db
        .select({ id: sectionRows.id })
        .from(sectionRows)
        .where(
          and(
            eq(sectionRows.workspaceId, scope.workspaceId),
            eq(sectionRows.courseId, scope.courseId),
            isNotNull(sectionRows.topicsAt),
          ),
        )
    ).map(r => r.id),
  );
  const waiting = list.filter(s => !looked.has(s.id) && !linked.has(`${s.materialId}:${s.key}`));
  const todo = waiting.slice(0, ASSIGN_BATCH);
  if (!todo.length) return null;
  const bare = todo.filter(s => !s.summary).map(s => s.id);
  const excerpts = new Map(
    bare.length
      ? (
          await db
            .select({ sectionId: knowledgeChunks.sectionId, text: knowledgeChunks.text })
            .from(knowledgeChunks)
            .where(and(inArray(knowledgeChunks.sectionId, bare), eq(knowledgeChunks.kind, 'text')))
            .orderBy(asc(knowledgeChunks.ordinal))
        )
          .reverse()
          .map(r => [r.sectionId, r.text.slice(0, 300)] as const)
      : [],
  );
  const topicKeys = keyMap('t', outline),
    sectionKeys = keyMap('s', todo);
  // A course without a syllabus grows its outline from its materials, to a size its substantial
  // sections set, so working it out again gives the same number of topics whatever the model
  // would propose. With a syllabus, a material that brings subjects the syllabus never named may
  // still add a few.
  const substantial = list.filter(s => s.tokens * 0.75 >= SUBSTANTIAL_WORDS).length;
  const size = Math.min(OUTLINE_MAX, Math.max(1, Math.ceil(substantial / SECTIONS_PER_TOPIC)));
  const room = Math.max(0, Math.min(course.syllabusMaterialId ? 3 : size - outline.length, TOPIC_CAP - outline.length));
  const input: AssignInput = {
    courseName: course.name,
    language: todo[0]!.language,
    room,
    topics: [...topicKeys].map(([key, t]) => ({ key, title: t.title, summary: t.summary })),
    sections: [...sectionKeys].map(([key, s]) => ({
      key,
      material: s.title,
      path: s.path.join(' / ') || s.title,
      summary: s.summary ?? excerpts.get(s.id) ?? '',
      terms: s.keyTerms,
      words: Math.round(s.tokens * 0.75),
    })),
  };
  return {
    input,
    run: p => p.assignTopics(input),
    // Without a syllabus, a topic the model files most of the batch under, often a broad one the
    // student protected, leaves the room for new topics unused. The model reads those sections once
    // more without that topic on offer, so the subjects inside it can become topics of their own.
    refine: course.syllabusMaterialId
      ? undefined
      : async (raw, ask) => {
          const first = raw as Assignment,
            broad = overloadedTopic(input, first, SECTIONS_PER_TOPIC);
          return broad
            ? respread(input, first, (await ask(withoutTopic(input, first, broad))) as Assignment, broad)
            : first;
        },
    apply: async (tx, raw) => {
      const assignment = raw as Awaited<ReturnType<OutlineProvider['assignTopics']>>['value'];
      // A link names a current topic by key, or a new one by its title, so the two cannot drift apart.
      const used = new Set(assignment.links.flatMap(l => l.topics.map(t => normalTitle(t.topic))));
      const fresh = assignment.newTopics.filter(t => t.title.trim() && used.has(normalTitle(t.title))).slice(0, room);
      const created = await addTopics(
        tx,
        scope,
        fresh.map(t => ({
          title: t.title.trim(),
          module: t.module.trim(),
          summary: housePunctuation(t.summary),
          source: null,
        })),
      );
      const ids = new Map<string, string>([...topicKeys].map(([k, t]) => [k, t.id]));
      created.forEach((t, i) => ids.set(normalTitle(fresh[i]!.title), t.id));
      const suggestions = assignment.links.flatMap(l => {
        const s = sectionKeys.get(l.section);
        return s
          ? l.topics.slice(0, 3).flatMap(t => {
              const id = ids.get(t.topic) ?? ids.get(normalTitle(t.topic));
              return id ? [{ materialId: s.materialId, sectionKey: s.key, topicId: id, depth: t.depth }] : [];
            })
          : [];
      });
      // A substantial section the model left out is linked by code: first by its heading and terms
      // against the topic titles, then to the topic of the linked section it reads most like.
      const all = [...topicKeys]
        .map(([key, t]) => ({ key, title: t.title, summary: t.summary }))
        .concat(created.map((t, i) => ({ key: normalTitle(fresh[i]!.title), title: t.title, summary: t.summary })));
      const left = () =>
        input.sections.filter(
          x =>
            x.words >= SUBSTANTIAL_WORDS &&
            !suggestions.some(y => {
              const s = sectionKeys.get(x.key)!;
              return y.materialId === s.materialId && y.sectionKey === s.key;
            }),
        );
      for (const l of assignTopicsRules({ ...input, room: 0, topics: all, sections: left() }).links) {
        const s = sectionKeys.get(l.section)!;
        for (const t of l.topics) {
          const id = ids.get(t.topic);
          if (id) suggestions.push({ materialId: s.materialId, sectionKey: s.key, topicId: id, depth: t.depth });
        }
      }
      let links = await writeSuggestions(tx, scope, [
        ...new Map(suggestions.map(x => [`${x.topicId}:${x.materialId}:${x.sectionKey}`, x])).values(),
      ]);
      const unlinked = left().map(x => sectionKeys.get(x.key)!);
      if (unlinked.length) {
        const live = (await liveLinks(tx, scope)).filter(l => l.depth !== 'mentions');
        const near = live.length
          ? ((
              await tx.execute(sql`select u.section_id, n.section_id as near, n.distance from ${knowledgeChunks} u cross join lateral (
            select k.section_id, k.embedding <=> u.embedding as distance from ${knowledgeChunks} k
            where k.workspace_id = ${scope.workspaceId} and k.section_id in ${[...new Set(live.map(l => l.section.id))]} and k.embedding_model = u.embedding_model order by k.embedding <=> u.embedding limit 1) n
          where u.section_id in ${unlinked.map(x => x.id)} and u.embedding is not null`)
            ).rows as { section_id: string; near: string; distance: number }[])
          : [];
        const extra = unlinked.flatMap(x => {
          const best = near.filter(r => r.section_id === x.id).sort((a, b) => a.distance - b.distance)[0];
          const topic = best && best.distance < NEAR ? live.find(l => l.section.id === best.near) : undefined;
          return topic
            ? [{ materialId: x.materialId, sectionKey: x.key, topicId: topic.topicId, depth: 'mentions' as const }]
            : [];
        });
        links += await writeSuggestions(tx, scope, extra);
      }
      await tx
        .update(sectionRows)
        .set({ topicsAt: new Date() })
        .where(
          inArray(
            sectionRows.id,
            todo.map(s => s.id),
          ),
        );
      // Sections still waiting go in the next batch.
      if (waiting.length > todo.length) await enqueueJob(tx, scope, 'assign_topics');
      return { links, topics: created.length };
    },
  };
}

const versionLanguage = async (db: SocketDb, versionId: string) =>
  (
    await db
      .select({ language: materialVersions.language })
      .from(materialVersions)
      .where(eq(materialVersions.id, versionId))
  )[0]?.language ?? 'en';

/** Blocks in order up to a character budget. Large documents are out of scope, so the rest is left out. */
function boundedBlocks(list: SectionBlock[], chars: number) {
  const out: SectionBlock[] = [];
  let used = 0;
  for (const block of list) {
    const size = blockMarkdown(block).length;
    if (!size) continue;
    if (used + size > chars) break;
    out.push(block);
    used += size;
  }
  return out;
}

/**
 * Work the outline out again. A course with a syllabus reads it again. One without rebuilds its
 * topics from its materials: topics the materials suggested, which the student never changed and
 * nothing depends on, are removed, and every section is assigned again. Student work stays.
 */
export async function readAgain(db: SocketDb, scope: Scope) {
  await transaction(db, async tx => {
    const [course] = await tx
      .select()
      .from(courses)
      .where(and(eq(courses.workspaceId, scope.workspaceId), eq(courses.id, scope.courseId)))
      .for('update');
    if (!course) throw new ApiError(404, 'not_found', 'This record is unavailable.');
    if (!course.syllabusMaterialId) {
      const locked = await protectedTopics(tx, scope);
      const loose = (
        await tx
          .select({ id: topics.id })
          .from(topics)
          .where(
            and(
              eq(topics.workspaceId, scope.workspaceId),
              eq(topics.courseId, scope.courseId),
              eq(topics.origin, 'materials'),
            ),
          )
      ).filter(t => !locked.has(t.id));
      if (loose.length)
        await tx.delete(topics).where(
          inArray(
            topics.id,
            loose.map(t => t.id),
          ),
        );
      await reassignAll(tx, scope);
      return;
    }
    const [material] = course.syllabusMaterialId
      ? await tx.select().from(materials).where(eq(materials.id, course.syllabusMaterialId))
      : [];
    const [version] = material?.currentVersionId
      ? await tx.select().from(materialVersions).where(eq(materialVersions.id, material.currentVersionId))
      : [];
    if (!material || !version || !usableStatus(version.status))
      throw new ApiError(409, 'no_syllabus', 'Add a readable syllabus first.');
    await enqueueJob(tx, scope, 'read_syllabus', { materialId: material.id, versionId: version.id });
  });
  return outlineView(db, scope.workspaceId, scope.courseId);
}
