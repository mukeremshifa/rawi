import { and, asc, eq } from 'drizzle-orm';
import type { BackendBindings } from '../../config';
import type { ReadDb, SocketDb, Transaction } from '../../db/client';
import { aiCalls, aiOperations, tutorMessages } from '../../db/schema';
import { notFound } from '../../errors';
import { adaptersFor, routesFor } from '../../ai/engine';
import { policyFor, usageSnapshot } from '../../ai/meter';
import { operation } from '../learning';

/**
 * What the client may offer right now. Unavailable means a request would be refused before any
 * provider call: no vendor configured, the allowance used up, or every small model failing.
 */
export async function aiStatus(env: BackendBindings, db: ReadDb, workspaceId: string) {
  const adapters = adaptersFor(env);
  if (!Object.keys(adapters).length) return { available: false, reason: 'AI is not set up on this server yet.', allowance: null };
  const { plan } = await policyFor(db, workspaceId);
  const used = await usageSnapshot(db, workspaceId);
  const allowance = { todayUsd: used.today / 1e6, dailyUsd: plan.dailyMicros / 1e6, monthUsd: used.month / 1e6, monthlyUsd: plan.monthlyMicros / 1e6 };
  if (used.today >= plan.dailyMicros) return { available: false, reason: 'The AI allowance for today is used up. It resets at midnight UTC.', allowance };
  if (used.month >= plan.monthlyMicros) return { available: false, reason: 'The AI allowance for this month is used up.', allowance };
  if (!(await routesFor(db, adapters, plan, 'small')).length) return { available: false, reason: 'The AI services are not responding right now. Try again in a few minutes.', allowance };
  return { available: true, reason: null, allowance };
}

export async function viewOperation(db: ReadDb | Transaction, workspaceId: string, id: string) {
  const [row] = await db.select().from(aiOperations).where(and(eq(aiOperations.workspaceId, workspaceId), eq(aiOperations.id, id)));
  if (!row) throw notFound();
  const calls = await db.select({ id: aiCalls.id, state: aiCalls.state, model: aiCalls.model, partial: aiCalls.partial, validation: aiCalls.validation, createdAt: aiCalls.createdAt, settledAt: aiCalls.settledAt })
    .from(aiCalls).where(and(eq(aiCalls.workspaceId, workspaceId), eq(aiCalls.operationId, id))).orderBy(asc(aiCalls.createdAt));
  return { id: row.id, task: row.task, targetId: row.targetId, state: row.state, model: row.model, promptVersion: row.promptVersion, reason: row.reason, result: row.result, calls };
}

/** A queued request can be withdrawn. One already running finishes and is saved, since its cost is already committed. */
export async function cancelOperation(db: SocketDb, workspaceId: string, id: string, operationId: string) {
  return operation(db, workspaceId, operationId, { action: 'cancel-ai', id }, async tx => {
    const [op] = await tx.select().from(aiOperations).where(and(eq(aiOperations.workspaceId, workspaceId), eq(aiOperations.id, id))).for('update');
    if (!op) throw notFound();
    if (op.state === 'queued' || op.state === 'failed') {
      await tx.update(aiOperations).set({ state: 'cancelled', reason: 'Withdrawn before any reply was written.', updatedAt: new Date() }).where(eq(aiOperations.id, id));
      if (op.task === 'tutor') await tx.update(tutorMessages).set({ state: 'cancelled', failure: null }).where(and(eq(tutorMessages.workspaceId, workspaceId), eq(tutorMessages.operationId, id), eq(tutorMessages.role, 'student')));
    }
    return viewOperation(tx, workspaceId, id);
  });
}
