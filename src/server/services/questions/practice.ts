import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import type { z } from 'zod';
import type { BackendBindings } from '../../config';
import { socketDb, transaction, type SocketDb, type Transaction } from '../../db/client';
import { aiOperations, bankItems, learningRuns, learningSets, setItems } from '../../db/schema';
import { ApiError, notFound } from '../../errors';
import { budget, type CallContext } from '../../ai/engine';
import type { practiceInput, VersionedQuestion } from '../../../shared/contracts/learning';
import type { ExamConfig, QuestionFormat } from '../../../shared/domain/types';
import { variant } from './numeric';
import { draw, generate, MODEL_FORMATS, drawBudget, type Shortfall, type Weighted } from './bank';
import { QUESTIONS_PROMPT_VERSION } from './tasks';
import { resolveScope } from '../scopes';
import { courseSections } from '../knowledge/course';
import { liveLinks } from '../outline/links';
import { operation, runView, validatePlannedLink } from '../learning';

type Scope = { workspaceId: string; courseId: string };

/**
 * Practise a scope. Items come from the student's bank, code builds what it can, and the run starts
 * at once with them. When the bank is short of what only a model can write, the shortfall is
 * written in the background, verified, and added to the run as it passes, while the student works
 * through what is there.
 */
export async function practise(
  db: SocketDb,
  workspaceId: string,
  courseId: string,
  input: z.infer<typeof practiceInput>,
) {
  const scope = await resolveScope(db, workspaceId, input.scopeId);
  if (scope.row.courseId !== courseId) throw notFound();
  if (!scope.sections.length)
    throw new ApiError(
      409,
      'scope_empty',
      'Rawi has not finished reading the material in this scope. Try again in a minute.',
    );
  return operation(db, workspaceId, input.operationId, { action: 'practise', courseId, input }, async tx => {
    if (input.plannedSessionId) await validatePlannedLink(tx, workspaceId, courseId, input.plannedSessionId, false);
    const owned = { workspaceId, courseId };
    const { items, shortfall } = await draw(tx, owned, scope.sections, input.formats, input.count, input.difficulty);
    const pending = shortfall.reduce((n, s) => n + s.count, 0);
    if (!items.length && !pending)
      throw new ApiError(
        409,
        'no_questions',
        'No questions of these kinds can be made from this scope yet. Try another kind of question.',
      );
    const setId = crypto.randomUUID();
    await tx.insert(learningSets).values({
      id: setId,
      workspaceId,
      courseId,
      name: scope.name.slice(0, 200),
      fingerprint: input.operationId,
      hintsAllowed: true,
      feedback: 'immediate',
    });
    if (items.length)
      await tx.insert(setItems).values(
        items.map((q, position) => ({
          id: crypto.randomUUID(),
          workspaceId,
          courseId,
          setId,
          questionId: q.id,
          position,
        })),
      );
    await tx.insert(learningRuns).values({
      id: input.runId,
      workspaceId,
      courseId,
      setId,
      title: scope.name.slice(0, 200),
      plannedSessionId: input.plannedSessionId,
      scopeId: scope.row.id,
      pendingItems: pending,
    });
    if (pending)
      await tx.insert(aiOperations).values({
        id: crypto.randomUUID(),
        workspaceId,
        courseId,
        targetId: input.runId,
        task: 'generate',
        fingerprint: input.operationId,
        input: { shortfall },
        state: 'queued',
        promptVersion: QUESTIONS_PROMPT_VERSION,
      });
    return runView(tx, workspaceId, input.runId);
  });
}

/**
 * Write a run's shortfall. Claims the queued operation, so a repeated request never writes twice.
 * Each verified batch is appended to the run as it is saved. When writing ends, the run says how
 * many could not be written, and the scope's bank is topped up on the background lane.
 */
export async function fillRun(env: BackendBindings, workspaceId: string, runId: string) {
  if (!env.DATABASE_URL) return;
  const connection = socketDb(env.DATABASE_URL);
  const db = connection.db;
  try {
    const [op] = await db
      .update(aiOperations)
      .set({ state: 'running', updatedAt: new Date() })
      .where(
        and(
          eq(aiOperations.workspaceId, workspaceId),
          eq(aiOperations.targetId, runId),
          eq(aiOperations.task, 'generate'),
          eq(aiOperations.state, 'queued'),
        ),
      )
      .returning();
    if (!op) return;
    const [run] = await db.select().from(learningRuns).where(eq(learningRuns.id, runId));
    if (!run) return;
    const shortfall = (op.input as { shortfall: Shortfall[] }).shortfall;
    const ctx: CallContext = { db, workspaceId, operationId: op.id, budget: drawBudget() };
    let added = 0;
    const append = async (rows: (typeof bankItems.$inferInsert)[]) =>
      transaction(db, async tx => {
        const [locked] = await tx.select().from(learningRuns).where(eq(learningRuns.id, runId)).for('update');
        if (!locked || locked.state !== 'active') return;
        const [last] = await tx
          .select({ position: sql<number>`coalesce(max(${setItems.position}), -1)::int` })
          .from(setItems)
          .where(eq(setItems.setId, locked.setId));
        // Numeric templates join as a fresh variant each.
        const playable = rows.filter(r => r.state !== 'template');
        const templates = rows.filter(r => r.state === 'template');
        const variants = templates.length ? await variantsOf(tx, templates) : [];
        const ids = [...playable.map(r => r.id!), ...variants];
        if (!ids.length) return;
        await tx.insert(setItems).values(
          ids.map((questionId, i) => ({
            id: crypto.randomUUID(),
            workspaceId,
            courseId: run.courseId,
            setId: locked.setId,
            questionId,
            position: last!.position + 1 + i,
          })),
        );
        added += ids.length;
        await tx
          .update(learningRuns)
          .set({
            pendingItems: sql`greatest(0, ${learningRuns.pendingItems} - ${ids.length})`,
            revision: locked.revision + 1,
          })
          .where(eq(learningRuns.id, runId));
      });
    let failure: string | null = null;
    try {
      await generate(env, ctx, { workspaceId, courseId: run.courseId }, shortfall, 'interactive', append);
    } catch (error) {
      failure = error instanceof ApiError ? error.message : 'Writing questions stopped.';
    }
    const wanted = shortfall.reduce((n, s) => n + s.count, 0);
    const missing = Math.max(0, wanted - added);
    await db
      .update(learningRuns)
      .set({
        pendingItems: 0,
        pendingNote: missing
          ? `${missing === 1 ? 'One question' : `${missing} questions`} could not be written and checked in time, so this set is shorter.`
          : null,
      })
      .where(eq(learningRuns.id, runId));
    await db
      .update(aiOperations)
      .set({
        state: failure && !added ? 'failed' : 'complete',
        reason: failure,
        result: { added, missing },
        updatedAt: new Date(),
      })
      .where(eq(aiOperations.id, op.id));
    if (run.scopeId)
      await topUp(env, db, workspaceId, run.courseId, run.scopeId, [...new Set(shortfall.map(s => s.format))]).catch(
        () => undefined,
      );
  } finally {
    await connection.close();
  }
}

async function variantsOf(tx: Transaction, templates: (typeof bankItems.$inferInsert)[]) {
  const ids: string[] = [];
  const rows = await tx
    .select()
    .from(bankItems)
    .where(
      inArray(
        bankItems.id,
        templates.map(t => t.id!),
      ),
    );
  for (const t of rows) {
    const v = t.template ? variant(t.template) : null;
    if (!v) continue;
    const id = crypto.randomUUID();
    await tx.insert(bankItems).values({
      ...t,
      id,
      state: 'active',
      templateId: t.id,
      template: null,
      createdAt: new Date(),
      content: {
        ...t.content,
        id,
        prompt: v.stem,
        numeric: { value: v.answer, tolerance: v.tolerance, ...(t.template!.unit ? { unit: t.template!.unit } : {}) },
      },
    });
    ids.push(id);
  }
  return ids;
}

/** Unseen model-written items per section and format a scope should hold for its next draw. */
const TOP_UP = 2;

/**
 * Keep the bank stocked for a scope the student is using, never one nobody asked for. Background
 * lane, a few sections at a time, and only formats only a model can write.
 */
export async function topUp(
  env: BackendBindings,
  db: SocketDb,
  workspaceId: string,
  courseId: string,
  scopeId: string,
  formats: QuestionFormat[],
  ids: { operationId?: string; jobId?: string } = {},
) {
  const wanted = formats.filter(f => MODEL_FORMATS.includes(f) || f === 'multiple-choice');
  if (!wanted.length) return 0;
  const scope = await resolveScope(db, workspaceId, scopeId);
  const counts = await db
    .select({
      materialId: bankItems.materialId,
      key: bankItems.sectionKey,
      format: bankItems.format,
      n: sql<number>`count(*) filter (where not exists (select 1 from item_results r where r.item_id = bank_items.id))::int`,
    })
    .from(bankItems)
    .where(
      and(
        eq(bankItems.workspaceId, workspaceId),
        eq(bankItems.courseId, courseId),
        inArray(bankItems.format, wanted),
        inArray(bankItems.state, ['active', 'template']),
        sql`${bankItems.templateId} is null`,
      ),
    )
    .groupBy(bankItems.materialId, bankItems.sectionKey, bankItems.format);
  const shortfall: Shortfall[] = [];
  for (const { section } of [...scope.sections].sort((a, b) => b.weight - a.weight)) {
    for (const format of wanted) {
      const have =
        counts.find(c => c.materialId === section.materialId && c.key === section.key && c.format === format)?.n ?? 0;
      if (have < TOP_UP) shortfall.push({ sectionId: section.id, format, count: TOP_UP - have });
    }
    if (new Set(shortfall.map(s => s.sectionId)).size >= 3) break;
  }
  if (!shortfall.length) return 0;
  const ctx: CallContext = { db, workspaceId, ...ids, budget: budget(6, 30_000, 240) };
  const result = await generate(env, ctx, { workspaceId, courseId }, shortfall, 'background');
  return result.items.length;
}

/**
 * The questions an exam paper needs, made ready before it starts: each section's topics resolved
 * to their current sections, items drawn and built, and any shortfall written now, since a timed
 * paper cannot wait. Self-marked formats are not used in exams.
 */
export async function examPool(
  env: BackendBindings,
  db: SocketDb,
  workspaceId: string,
  courseId: string,
  config: ExamConfig,
) {
  const owned: Scope = { workspaceId, courseId };
  const [links, list] = await Promise.all([liveLinks(db, owned), courseSections(db, owned)]);
  const chosen = new Set<string>();
  const pool: VersionedQuestion[] = [];
  for (const section of config.sections) {
    const formats = section.formats.filter(f => f !== 'flashcard' && f !== 'self-check');
    if (!formats.length) continue;
    const sectionIds = section.topicIds.length
      ? new Set(
          links.filter(l => section.topicIds.includes(l.topicId) && l.depth !== 'mentions').map(l => l.section.id),
        )
      : null;
    const weighted: Weighted[] = list
      .filter(s => !sectionIds || sectionIds.has(s.id))
      .map(s => ({ section: s, weight: Math.min(2, Math.max(0.5, Math.sqrt(s.tokens / 300))) }));
    if (!weighted.length) continue;
    const { items, shortfall } = await transaction(db, tx =>
      draw(tx, owned, weighted, formats, section.count, 'mixed', [...chosen]),
    );
    for (const q of items) {
      chosen.add(q.id);
      pool.push(q);
    }
    if (shortfall.length) {
      const ctx: CallContext = { db, workspaceId, budget: drawBudget() };
      const made = await generate(env, ctx, owned, shortfall).catch(() => ({
        items: [] as (typeof bankItems.$inferInsert)[],
      }));
      const templates = made.items.filter(r => r.state === 'template');
      const ready = made.items.filter(r => r.state !== 'template').map(r => r.content!);
      const variants = templates.length ? await transaction(db, tx => variantsOf(tx, templates)) : [];
      const rows = variants.length
        ? await db
            .select({ content: bankItems.content })
            .from(bankItems)
            .where(inArray(bankItems.id, variants))
            .orderBy(asc(bankItems.createdAt))
        : [];
      for (const q of [...ready, ...rows.map(r => r.content)]) {
        chosen.add(q.id);
        pool.push(q);
      }
    }
  }
  return pool;
}

/**
 * Question writing a Worker left behind. Work that never started is started now. Work that was
 * running is left uncertain, never repeated, and its run stops waiting for it.
 */
export async function sweepGenerations(db: SocketDb, env: BackendBindings) {
  const stale = await db
    .select()
    .from(aiOperations)
    .where(
      and(
        eq(aiOperations.task, 'generate'),
        sql`((${aiOperations.state} = 'queued' and ${aiOperations.updatedAt} < now() - interval '2 minutes') or (${aiOperations.state} = 'running' and ${aiOperations.updatedAt} < now() - interval '5 minutes'))`,
      ),
    )
    .limit(10);
  for (const op of stale) {
    if (op.state === 'queued') {
      await fillRun(env, op.workspaceId, op.targetId).catch(() => undefined);
      continue;
    }
    const [claimed] = await db
      .update(aiOperations)
      .set({
        state: 'uncertain',
        reason: 'Writing questions stopped partway and was not repeated.',
        updatedAt: new Date(),
      })
      .where(and(eq(aiOperations.id, op.id), eq(aiOperations.state, 'running')))
      .returning({ id: aiOperations.id });
    if (claimed)
      await db
        .update(learningRuns)
        .set({ pendingItems: 0, pendingNote: 'Some questions could not be written, so this set is shorter.' })
        .where(and(eq(learningRuns.id, op.targetId), sql`${learningRuns.pendingItems} > 0`));
  }
  return { generations: stale.length };
}
