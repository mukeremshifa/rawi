import { and, asc, eq } from 'drizzle-orm';
import type { BackendBindings } from '../../config';
import type { ReadDb, SocketDb, Transaction } from '../../db/client';
import { aiCalls, aiOperations, tutorMessages } from '../../db/schema';
import { notFound } from '../../errors';
import { routesFor } from '../../ai/engine';
import { fundingFor } from '../../ai/funding';
import { usageSnapshot } from '../../ai/meter';
import { operation } from '../learning';

/** A repeated request whose first run may have been charged without a result. */

/**
 * What the client may offer right now. Unavailable means a request would be refused before any
 * provider call: no vendor for the funding source, its allowance used up, or every route failing.
 */
export async function aiStatus(env: BackendBindings, db: ReadDb, workspaceId: string) {
  const funding = await fundingFor(env, db, workspaceId);
  const own = funding.source.perWorkspace ?? funding.source.limits;
  const source = { kind: funding.source.kind, label: funding.source.label };
  if (!Object.keys(funding.adapters).length)
    return { available: false, reason: 'AI is not set up on this server yet.', allowance: null, source };
  const used = await usageSnapshot(db, workspaceId, funding.source.id);
  const usd = (micros: number | null) => (micros === null ? null : micros / 1e6);
  const allowance = {
    todayUsd: used.today / 1e6,
    dailyUsd: usd(own.dailyMicros),
    monthUsd: used.month / 1e6,
    monthlyUsd: usd(own.monthlyMicros),
  };
  if (own.dailyMicros !== null && used.today >= own.dailyMicros)
    return {
      available: false,
      reason: 'The AI allowance for today is used up. It resets at midnight UTC.',
      allowance,
      source,
    };
  if (own.monthlyMicros !== null && used.month >= own.monthlyMicros)
    return { available: false, reason: 'The AI allowance for this month is used up.', allowance, source };
  if (!(await routesFor(db, funding, 'chat', 'student')).length && !(await routesFor(db, funding, 'extract')).length)
    return {
      available: false,
      reason: 'The AI services are not responding right now. Try again in a few minutes.',
      allowance,
      source,
    };
  return { available: true, reason: null, allowance, source };
}

export async function viewOperation(db: ReadDb | Transaction, workspaceId: string, id: string) {
  const [row] = await db
    .select()
    .from(aiOperations)
    .where(and(eq(aiOperations.workspaceId, workspaceId), eq(aiOperations.id, id)));
  if (!row) throw notFound();
  const calls = await db
    .select({
      id: aiCalls.id,
      state: aiCalls.state,
      model: aiCalls.model,
      partial: aiCalls.partial,
      validation: aiCalls.validation,
      createdAt: aiCalls.createdAt,
      settledAt: aiCalls.settledAt,
    })
    .from(aiCalls)
    .where(and(eq(aiCalls.workspaceId, workspaceId), eq(aiCalls.operationId, id)))
    .orderBy(asc(aiCalls.createdAt));
  return {
    id: row.id,
    task: row.task,
    targetId: row.targetId,
    state: row.state,
    model: row.model,
    promptVersion: row.promptVersion,
    reason: row.reason,
    result: row.result,
    calls,
  };
}

/**
 * A queued request can be withdrawn. A running tutor reply is stopped: the stream sees the
 * cancelled state within a second, aborts the provider call and saves what arrived. Other
 * running work finishes and is saved, since its cost is already committed.
 */
export async function cancelOperation(db: SocketDb, workspaceId: string, id: string, operationId: string) {
  return operation(db, workspaceId, operationId, { action: 'cancel-ai', id }, async tx => {
    const [op] = await tx
      .select()
      .from(aiOperations)
      .where(and(eq(aiOperations.workspaceId, workspaceId), eq(aiOperations.id, id)))
      .for('update');
    if (!op) throw notFound();
    if (op.state === 'queued' || op.state === 'failed') {
      await tx
        .update(aiOperations)
        .set({ state: 'cancelled', reason: 'Withdrawn before any reply was written.', updatedAt: new Date() })
        .where(eq(aiOperations.id, id));
      if (op.task === 'tutor')
        await tx
          .update(tutorMessages)
          .set({ state: 'cancelled', failure: null })
          .where(
            and(
              eq(tutorMessages.workspaceId, workspaceId),
              eq(tutorMessages.operationId, id),
              eq(tutorMessages.role, 'student'),
            ),
          );
    } else if (op.state === 'running' && op.task === 'tutor') {
      await tx
        .update(aiOperations)
        .set({ state: 'cancelled', reason: 'Stopped by you. What arrived is kept.', updatedAt: new Date() })
        .where(eq(aiOperations.id, id));
    }
    return viewOperation(tx, workspaceId, id);
  });
}
