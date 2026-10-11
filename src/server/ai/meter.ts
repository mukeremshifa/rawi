import { and, eq, lt, sql } from 'drizzle-orm';
import { aiCalls } from '../db/schema';
import type { ReadDb, SocketDb } from '../db/client';
import { ApiError } from '../errors';
import type { Route } from './catalog';
import type { Funding } from './funding';
import type { Language, ServiceTier, Usage, Validation } from './types';

/** Spend that counts against limits: settled charges, and reservations still open or uncertain. */
const counted = sql`coalesce(${aiCalls.chargedMicros}, ${aiCalls.reservedMicros})`;
const monthStart = sql`date_trunc('month', now() at time zone 'UTC') at time zone 'UTC'`;
const dayStart = sql`date_trunc('day', now() at time zone 'UTC') at time zone 'UTC'`;

/** What a workspace has spent under its source today and this month. */
export async function usageSnapshot(db: ReadDb | SocketDb, workspaceId: string, sourceId: string) {
  const [row] = await db.select({
    today: sql<number>`coalesce(sum(${counted}) filter (where ${aiCalls.state} <> 'released' and ${aiCalls.createdAt} >= ${dayStart}), 0)::float8`,
    month: sql<number>`coalesce(sum(${counted}) filter (where ${aiCalls.state} <> 'released'), 0)::float8`,
  }).from(aiCalls).where(and(eq(aiCalls.workspaceId, workspaceId), eq(aiCalls.fundingSourceId, sourceId), sql`${aiCalls.createdAt} >= ${monthStart}`));
  return row ?? { today: 0, month: 0 };
}

export interface CallStart {
  workspaceId: string; operationId?: string; jobId?: string; task: string; step: number;
  route: Route; serviceTier: ServiceTier; language: Language; reservedMicros: number;
}

/**
 * Reserve before a provider call. Nothing is sent until this commits. Limits are the source's
 * own: its total, and for a shared source each workspace's share. Background work (a call with a
 * job) and interactive work hold separate concurrency slots, so a long ingest never makes a
 * student's reply wait. One lock per source keeps the limits exact.
 */
export async function reserve(db: SocketDb, funding: Funding, start: CallStart) {
  const { limits, perWorkspace, id: sourceId } = funding.source;
  const r = start.reservedMicros, id = crypto.randomUUID(), background = !!start.jobId;
  const own = perWorkspace ?? { dailyMicros: null, monthlyMicros: null, concurrent: limits.concurrent };
  const under = (spent: ReturnType<typeof sql>, cap: number | null) => cap === null ? sql`true` : sql`${spent} + ${r} <= ${cap}`;
  return db.transaction(async tx => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${sourceId}))`);
    const rows = await tx.execute(sql`with n as (select
        coalesce(sum(coalesce(charged_micros, reserved_micros)) filter (where state <> 'released' and created_at >= ${dayStart}), 0)::float8 as all_day,
        coalesce(sum(coalesce(charged_micros, reserved_micros)) filter (where state <> 'released'), 0)::float8 as all_month,
        count(*) filter (where state = 'reserved')::int as all_open,
        coalesce(sum(coalesce(charged_micros, reserved_micros)) filter (where state <> 'released' and workspace_id = ${start.workspaceId} and created_at >= ${dayStart}), 0)::float8 as own_day,
        coalesce(sum(coalesce(charged_micros, reserved_micros)) filter (where state <> 'released' and workspace_id = ${start.workspaceId}), 0)::float8 as own_month,
        count(*) filter (where state = 'reserved' and workspace_id = ${start.workspaceId} and (job_id is not null) = ${background})::int as own_open
        from ai_calls where funding_source_id = ${sourceId} and created_at >= ${monthStart}),
      ins as (insert into ai_calls (id, workspace_id, funding_source_id, operation_id, job_id, task, step, vendor, model, region, service_tier, language, state, reserved_micros)
        select ${id}, ${start.workspaceId}, ${sourceId}, ${start.operationId ?? null}, ${start.jobId ?? null}, ${start.task}, ${start.step}, ${start.route.vendor}, ${start.route.model}, ${start.route.region}, ${start.serviceTier}, ${start.language}, 'reserved', ${r} from n
        where n.own_open < ${own.concurrent} and n.all_open < ${limits.concurrent}
          and ${under(sql`n.own_day`, own.dailyMicros)} and ${under(sql`n.all_day`, limits.dailyMicros)}
          and ${under(sql`n.own_month`, own.monthlyMicros)} and ${under(sql`n.all_month`, limits.monthlyMicros)}
        returning id)
      select n.*, (select id from ins) as id from n`);
    const n = rows.rows[0] as { own_open: number; all_open: number; own_day: number; all_day: number; id: string | null };
    if (n.id) return n.id;
    if (n.own_open >= own.concurrent || n.all_open >= limits.concurrent) throw new ApiError(429, 'ai_busy', 'Another AI request is still running. Try again when it finishes.');
    const overDay = (spent: number, cap: number | null) => cap !== null && spent + r > cap;
    if (overDay(n.own_day, own.dailyMicros) || overDay(n.all_day, limits.dailyMicros)) throw new ApiError(429, 'ai_budget', 'The AI allowance for today is used up. It resets at midnight UTC.');
    throw new ApiError(429, 'ai_budget', 'The AI allowance for this month is used up.');
  });
}

export type Settlement =
  | { state: 'settled'; chargedMicros: number; usage: Usage; latencyMs: number; ttftMs: number | null; validation: Validation; error?: string }
  | { state: 'ambiguous'; error: string; latencyMs: number }
  | { state: 'released'; error: string; latencyMs: number };

/** Settle once. An uncertain outcome keeps its reservation as the charge. */
export async function settle(db: SocketDb, id: string, s: Settlement) {
  await db.update(aiCalls).set({
    state: s.state, settledAt: s.state === 'ambiguous' ? null : new Date(), latencyMs: s.latencyMs, error: s.error ?? null,
    chargedMicros: s.state === 'settled' ? s.chargedMicros : s.state === 'released' ? 0 : null,
    ...(s.state === 'settled' ? { usage: s.usage, ttftMs: s.ttftMs, validation: s.validation } : {}),
  }).where(and(eq(aiCalls.id, id), eq(aiCalls.state, 'reserved')));
}

/** Streamed text saved as it arrives, so an interrupted reply can be recovered. */
export async function checkpoint(db: SocketDb, id: string, partial: string) {
  await db.update(aiCalls).set({ partial }).where(and(eq(aiCalls.id, id), eq(aiCalls.state, 'reserved')));
}

/** A reservation left open by a Worker that died is uncertain. It stays charged and frees its slot. */
export async function expireOpenCalls(db: SocketDb) {
  const rows = await db.update(aiCalls).set({ state: 'ambiguous', error: 'abandoned' }).where(and(eq(aiCalls.state, 'reserved'), lt(aiCalls.createdAt, new Date(Date.now() - 15 * 60_000)))).returning({ id: aiCalls.id });
  return rows.length;
}
