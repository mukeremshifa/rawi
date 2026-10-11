import { and, eq, lt, sql } from 'drizzle-orm';
import { aiCalls, aiPlans, workspaces } from '../db/schema';
import type { ReadDb, SocketDb } from '../db/client';
import { ApiError } from '../errors';
import type { Route } from './catalog';
import type { AiPolicy, Language, ServiceTier, Usage, Validation } from './types';

/** Plans change rarely. Each isolate keeps them for a minute. */
let plans: { at: number; rows: Map<string, AiPolicy> } | null = null;
async function planRows(db: ReadDb | SocketDb) {
  if (plans && Date.now() - plans.at < 60_000) return plans.rows;
  const rows = await db.select().from(aiPlans);
  plans = { at: Date.now(), rows: new Map(rows.map(r => [r.id, r.policy])) };
  return plans.rows;
}

/** The workspace's plan and the platform ceiling. Organisation policy will narrow the plan here. */
const assigned = new Map<string, { at: number; plan: string }>();
export async function policyFor(db: ReadDb | SocketDb, workspaceId: string) {
  const rows = await planRows(db);
  let planId = assigned.get(workspaceId);
  if (!planId || Date.now() - planId.at > 60_000) {
    const [ws] = await db.select({ plan: workspaces.aiPlanId }).from(workspaces).where(eq(workspaces.id, workspaceId));
    planId = { at: Date.now(), plan: ws?.plan ?? 'default' };
    assigned.set(workspaceId, planId);
  }
  const plan = rows.get(planId.plan) ?? rows.get('default');
  const platform = rows.get('platform');
  if (!plan || !platform) throw new ApiError(503, 'ai_unconfigured', 'AI is not set up for this workspace yet.');
  return { plan, platform };
}

/** Spend that counts against limits: settled charges, and reservations still open or uncertain. */
const spent = sql<number>`coalesce(sum(coalesce(${aiCalls.chargedMicros}, ${aiCalls.reservedMicros})) filter (where ${aiCalls.state} <> 'released'), 0)::float8`;

export async function usageSnapshot(db: ReadDb | SocketDb, workspaceId: string) {
  const [row] = await db.select({
    today: sql<number>`coalesce(sum(coalesce(${aiCalls.chargedMicros}, ${aiCalls.reservedMicros})) filter (where ${aiCalls.state} <> 'released' and ${aiCalls.createdAt} >= date_trunc('day', now() at time zone 'UTC') at time zone 'UTC'), 0)::float8`,
    month: spent,
    open: sql<number>`count(*) filter (where ${aiCalls.state} = 'reserved')::int`,
  }).from(aiCalls).where(and(eq(aiCalls.workspaceId, workspaceId), sql`${aiCalls.createdAt} >= date_trunc('month', now() at time zone 'UTC') at time zone 'UTC'`));
  return row ?? { today: 0, month: 0, open: 0 };
}

export interface CallStart {
  workspaceId: string; operationId?: string; jobId?: string; task: string; step: number;
  route: Route; serviceTier: ServiceTier; language: Language; reservedMicros: number;
}

/**
 * Reserve before a provider call. Nothing is sent until this commits. Background work (a call
 * with a job) and interactive work count against separate concurrency slots, so a long ingest
 * never makes a student's tutor reply wait. Four round trips: begin, the lock, one statement
 * that checks every limit and inserts, and commit.
 */
export async function reserve(db: SocketDb, start: CallStart) {
  const { plan, platform } = await policyFor(db, start.workspaceId);
  const r = start.reservedMicros, id = crypto.randomUUID(), background = !!start.jobId;
  return db.transaction(async tx => {
    // One lock keeps limits exact. The next statement takes its snapshot after the lock.
    await tx.execute(sql`select pg_advisory_xact_lock(714290032)`);
    const today = sql`created_at >= date_trunc('day', now() at time zone 'UTC') at time zone 'UTC'`;
    const rows = await tx.execute(sql`with n as (select
        coalesce(sum(coalesce(charged_micros, reserved_micros)) filter (where state <> 'released' and ${today}), 0)::float8 as platform_day,
        coalesce(sum(coalesce(charged_micros, reserved_micros)) filter (where state <> 'released'), 0)::float8 as platform_month,
        count(*) filter (where state = 'reserved')::int as platform_open,
        coalesce(sum(coalesce(charged_micros, reserved_micros)) filter (where state <> 'released' and workspace_id = ${start.workspaceId} and ${today}), 0)::float8 as own_day,
        coalesce(sum(coalesce(charged_micros, reserved_micros)) filter (where state <> 'released' and workspace_id = ${start.workspaceId}), 0)::float8 as own_month,
        count(*) filter (where state = 'reserved' and workspace_id = ${start.workspaceId} and (job_id is not null) = ${background})::int as own_open
        from ai_calls where created_at >= date_trunc('month', now() at time zone 'UTC') at time zone 'UTC'),
      ins as (insert into ai_calls (id, workspace_id, operation_id, job_id, task, step, vendor, model, region, service_tier, language, state, reserved_micros)
        select ${id}, ${start.workspaceId}, ${start.operationId ?? null}, ${start.jobId ?? null}, ${start.task}, ${start.step}, ${start.route.vendor}, ${start.route.model}, ${start.route.region}, ${start.serviceTier}, ${start.language}, 'reserved', ${r} from n
        where n.own_open < ${plan.concurrent} and n.platform_open < ${platform.concurrent}
          and n.own_day + ${r} <= ${plan.dailyMicros} and n.platform_day + ${r} <= ${platform.dailyMicros}
          and n.own_month + ${r} <= ${plan.monthlyMicros} and n.platform_month + ${r} <= ${platform.monthlyMicros}
        returning id)
      select n.*, (select id from ins) as id from n`);
    const n = rows.rows[0] as { own_open: number; platform_open: number; own_day: number; platform_day: number; id: string | null };
    if (n.id) return n.id;
    if (n.own_open >= plan.concurrent || n.platform_open >= platform.concurrent) throw new ApiError(429, 'ai_busy', 'Another AI request is still running. Try again when it finishes.');
    if (n.own_day + r > plan.dailyMicros || n.platform_day + r > platform.dailyMicros) throw new ApiError(429, 'ai_budget', 'The AI allowance for today is used up. It resets at midnight UTC.');
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
