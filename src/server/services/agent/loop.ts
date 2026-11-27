import { and, asc, desc, eq, gte, inArray, lt, lte, sql } from 'drizzle-orm';
import type { BackendBindings } from '../../config';
import { databaseUrl, socketDb, type ReadDb, type SocketDb, type Transaction } from '../../db/client';
import {
  agentActions,
  agentRuns,
  aiCalls,
  assessments,
  courses,
  itemResults,
  plannedSessions,
  plannerState,
  preferences,
  studyGoals,
  topics,
} from '../../db/schema';
import { ApiError } from '../../errors';
import { budget, run } from '../../ai/engine';
import { addDays, daysBetweenDates, localISO, weekStart } from '../../../shared/domain/planner';
import { codeSummary, decide, inDays, type Decision, type PolicyCourse } from '../../../shared/domain/agent';
import type { AgentAction, AgentObservation, AgentRun, AgentTrigger, AgentView } from '../../../shared/contracts/agent';
import { topicMastery } from '../questions/results';
import { listGoals } from './goals';
import { summaryTask } from './tasks';
import { act, type Outcome } from './tools';
import { languageSignals } from './signals';

/**
 * The study agent's loop: observe the workspace, decide in code, act through tools, and record
 * every action with its reason, outcome and cost. One run per workspace at a time, under a lease.
 * A model writes only the run's note to the student, and only after code has acted.
 */

/** How long a run may hold the workspace before another may start. */
const LEASE_SECONDS = 300;
/** The least time between runs, by what started them. */
const GAP_SECONDS: Record<AgentTrigger, number> = { schedule: 6 * 3600, session: 600, student: 60 };
/** Workspaces one sweep looks at. */
const SWEEP = 10;
/** Days of marked answers the support split reads. */
const CHECK_DAYS = 30;
/** How long a decision's key keeps it from being acted on again. */
const MEMORY_DAYS = 45;

export interface Observed {
  observation: AgentObservation;
  decisions: Decision[];
  courseNames: Map<string, string>;
}

export async function observe(db: SocketDb | ReadDb, workspaceId: string, now = new Date()): Promise<Observed> {
  const [prefs] = await db
    .select({ timezone: preferences.timezone })
    .from(preferences)
    .where(eq(preferences.workspaceId, workspaceId));
  const timezone = prefs?.timezone ?? 'UTC',
    today = localISO(now, timezone),
    week = weekStart(today);
  const [courseRows, goals, dated, topicRows, sessionRows, [planner], doneRows, mastery, language] = await Promise.all([
    db
      .select({ id: courses.id, name: courses.name })
      .from(courses)
      .where(and(eq(courses.workspaceId, workspaceId), eq(courses.archived, false)))
      .orderBy(asc(courses.createdAt)),
    listGoals(db, workspaceId),
    db
      .select({
        id: assessments.id,
        courseId: assessments.courseId,
        date: assessments.date,
        content: assessments.content,
      })
      .from(assessments)
      .where(and(eq(assessments.workspaceId, workspaceId), gte(assessments.date, today))),
    db
      .select({ id: topics.id, courseId: topics.courseId, title: topics.title })
      .from(topics)
      .where(eq(topics.workspaceId, workspaceId)),
    db
      .select({
        id: plannedSessions.id,
        courseId: plannedSessions.courseId,
        date: plannedSessions.date,
        status: plannedSessions.status,
        title: sql<string>`${plannedSessions.content}->>'title'`,
      })
      .from(plannedSessions)
      .where(
        and(
          eq(plannedSessions.workspaceId, workspaceId),
          gte(plannedSessions.date, addDays(today, -7)),
          lte(plannedSessions.date, addDays(week, 6)),
        ),
      ),
    db
      .select({ availability: plannerState.availability })
      .from(plannerState)
      .where(eq(plannerState.workspaceId, workspaceId)),
    db
      .select({ key: agentActions.key })
      .from(agentActions)
      .where(
        and(
          eq(agentActions.workspaceId, workspaceId),
          inArray(agentActions.status, ['done', 'skipped']),
          gte(agentActions.at, new Date(now.getTime() - MEMORY_DAYS * 86_400_000)),
        ),
      ),
    topicMastery(db, workspaceId, timezone),
    languageSignals(db, workspaceId, timezone),
  ]);
  const goaled = new Set(goals.flatMap(g => (g.assessmentId ? [g.assessmentId] : [])));
  const policyCourses: PolicyCourse[] = courseRows.map(c => {
    const own = sessionRows.filter(s => s.courseId === c.id);
    const lang = language.get(c.id);
    return {
      courseId: c.id,
      name: c.name,
      goals: goals
        .filter(g => g.courseId === c.id && g.status === 'active')
        .map(g => ({ id: g.id, title: g.title, date: g.date, scopeId: g.scopeId })),
      ungoaled: dated
        .filter(a => a.courseId === c.id && a.date && !goaled.has(a.id))
        .map(a => ({ id: a.id, title: a.content.title, date: a.date! })),
      topics: mastery
        .filter(m => m.courseId === c.id)
        .map(m => ({
          topicId: m.topicId,
          title: topicRows.find(t => t.id === m.topicId)?.title ?? 'Topic',
          level: m.level,
          due: m.due,
        })),
      plannedThisWeek: own.filter(s => s.date >= week && s.date <= addDays(week, 6) && s.status !== 'skipped').length,
      missed: own
        .filter(s => s.status === 'planned' && s.date < today)
        .map(s => ({ id: s.id, title: s.title, date: s.date })),
      languageSupported: lang?.sections ?? [],
      languageSupportCount: lang?.count ?? 0,
      glossaryReady: lang?.glossaryReady ?? false,
    };
  });
  const hasAvailability = !!planner?.availability.windows.length;
  const decisions = decide({
    today,
    weekStart: week,
    hasAvailability,
    courses: policyCourses,
    done: new Set(doneRows.map(r => r.key)),
  });
  const observation: AgentObservation = {
    hasAvailability,
    courses: policyCourses.map(c => {
      const goal = c.goals.find(g => g.date) ?? c.goals[0] ?? null;
      return {
        courseId: c.courseId,
        name: c.name,
        goal: goal?.title ?? null,
        daysToGoal: goal?.date ? Math.round((Date.parse(goal.date) - Date.parse(today)) / 86_400_000) : null,
        shaky: c.topics.filter(t => t.level === 'shaky').length,
        due: c.topics.reduce((n, t) => n + t.due, 0),
        unchecked: c.topics.filter(t => t.level === 'not-checked').length,
        secure: c.topics.filter(t => t.level === 'secure').length,
        plannedThisWeek: c.plannedThisWeek,
        missed: c.missed.length,
        languageSupported: c.languageSupportCount,
      };
    }),
  };
  return { observation, decisions, courseNames: new Map(courseRows.map(c => [c.id, c.name])) };
}

/** Take the workspace's lease for a new run, or null when one is running or the last was too recent. */
async function begin(db: SocketDb, workspaceId: string, trigger: AgentTrigger) {
  const now = new Date();
  await db
    .update(agentRuns)
    .set({ state: 'failed', error: 'lease_expired', finishedAt: now })
    .where(and(eq(agentRuns.workspaceId, workspaceId), eq(agentRuns.state, 'running'), lt(agentRuns.leaseUntil, now)));
  const [last] = await db
    .select({ startedAt: agentRuns.startedAt })
    .from(agentRuns)
    .where(eq(agentRuns.workspaceId, workspaceId))
    .orderBy(desc(agentRuns.startedAt))
    .limit(1);
  if (last && now.getTime() - last.startedAt.getTime() < GAP_SECONDS[trigger] * 1000) return null;
  const [row] = await db
    .insert(agentRuns)
    .values({
      id: crypto.randomUUID(),
      workspaceId,
      trigger,
      leaseUntil: new Date(now.getTime() + LEASE_SECONDS * 1000),
    })
    .onConflictDoNothing()
    .returning({ id: agentRuns.id });
  return row?.id ?? null;
}

const costOf = async (db: SocketDb, ids: string[]) => {
  if (!ids.length) return 0;
  const [row] = await db
    .select({
      micros: sql<number>`coalesce(sum(coalesce(${aiCalls.chargedMicros}, ${aiCalls.reservedMicros})), 0)::bigint`,
    })
    .from(aiCalls)
    .where(inArray(aiCalls.operationId, ids));
  return Number(row?.micros ?? 0);
};

/** One run of the agent over a workspace. Returns the run's id, or null when it did not start. */
export async function runAgentWith(env: BackendBindings, db: SocketDb, workspaceId: string, trigger: AgentTrigger) {
  const runId = await begin(db, workspaceId, trigger);
  if (!runId) return null;
  try {
    const { observation, decisions, courseNames } = await observe(db, workspaceId);
    await db.update(agentRuns).set({ observation }).where(eq(agentRuns.id, runId));
    const taken: { tool: Decision['tool']; status: Outcome['status']; reason: string; outcome: string }[] = [];
    let ordinal = 0;
    for (const d of decisions) {
      const id = crypto.randomUUID();
      let result: Outcome;
      try {
        result = await act(env, db, workspaceId, runId, id, d);
      } catch (error) {
        result = {
          status: 'failed',
          outcome:
            error instanceof ApiError ? error.message : 'Rawi could not finish this step. It will try again later.',
        };
      }
      await db.insert(agentActions).values({
        id,
        workspaceId,
        runId,
        courseId: d.courseId,
        ordinal: ordinal++,
        tool: d.tool,
        key: d.key,
        decidedBy: 'code',
        reason: d.reason,
        input: d.input,
        outcome: result.outcome,
        status: result.status,
        notify: !!d.notify && result.status === 'done',
        remindOn: d.remindOn ?? null,
        costMicros: await costOf(db, [id]),
      });
      taken.push({ tool: d.tool, status: result.status, reason: d.reason, outcome: result.outcome });
    }
    // The note to the student. A model writes it when there is something to say, and code otherwise.
    let summary = codeSummary(taken),
      summaryBy: 'code' | 'model' = 'code';
    const done = taken.filter(t => t.status === 'done');
    if (done.length)
      try {
        const served = await run(
          env,
          { db, workspaceId, jobId: runId, operationId: runId, budget: budget(1, 3000, 30) },
          summaryTask,
          {
            courses: [...courseNames.values()],
            actions: done.map(t => ({ tool: t.tool, reason: t.reason, outcome: t.outcome })),
          },
        );
        summary = served.value;
        summaryBy = 'model';
      } catch {
        /* The code note stands. */
      }
    await db
      .update(agentRuns)
      .set({ state: 'done', summary, summaryBy, finishedAt: new Date() })
      .where(eq(agentRuns.id, runId));
    return runId;
  } catch (error) {
    await db
      .update(agentRuns)
      .set({ state: 'failed', error: error instanceof ApiError ? error.code : 'unavailable', finishedAt: new Date() })
      .where(eq(agentRuns.id, runId));
    throw error;
  }
}

/** A run on its own connection, for work started after a response. Failures are logged, never thrown. */
export async function runAgent(env: BackendBindings, workspaceId: string, trigger: AgentTrigger) {
  if (!env.DATABASE_URL) return null;
  const connection = socketDb(databaseUrl(env));
  try {
    return await runAgentWith(env, connection.db, workspaceId, trigger);
  } catch (error) {
    console.error(
      JSON.stringify({ operation: 'agent', error: error instanceof ApiError ? error.code : 'unavailable' }),
    );
    return null;
  } finally {
    await connection.close();
  }
}

/**
 * The cron sweep: workspaces with something to work toward, a goal, a dated assessment or recent
 * answers, whose last run is oldest first.
 */
export async function sweepAgent(db: SocketDb, env: BackendBindings) {
  const rows = await db.execute(sql`
    select w.id from workspaces w
    where exists (select 1 from ${studyGoals} g where g.workspace_id = w.id and g.status = 'active')
       or exists (select 1 from ${assessments} a where a.workspace_id = w.id and a.date >= current_date)
       or exists (select 1 from ${itemResults} r where r.workspace_id = w.id and r.at > now() - interval '14 days')
    order by (select max(started_at) from ${agentRuns} r where r.workspace_id = w.id) asc nulls first
    limit ${SWEEP}`);
  let ran = 0;
  for (const { id } of rows.rows as { id: string }[]) if (await runAgentWith(env, db, id, 'schedule')) ran++;
  return { ran };
}

/** What the agent did and why, newest first. */
export async function agentView(db: ReadDb | SocketDb, workspaceId: string, limit = 20): Promise<AgentView> {
  const [goals, runs] = await Promise.all([
    listGoals(db, workspaceId),
    db
      .select()
      .from(agentRuns)
      .where(eq(agentRuns.workspaceId, workspaceId))
      .orderBy(desc(agentRuns.startedAt))
      .limit(limit),
  ]);
  const actions = runs.length
    ? await db
        .select()
        .from(agentActions)
        .where(
          and(
            eq(agentActions.workspaceId, workspaceId),
            inArray(
              agentActions.runId,
              runs.map(r => r.id),
            ),
          ),
        )
        .orderBy(asc(agentActions.ordinal))
    : [];
  const shown: AgentRun[] = runs.map(r => ({
    id: r.id,
    trigger: r.trigger,
    state: r.state,
    startedAt: r.startedAt.toISOString(),
    finishedAt: r.finishedAt?.toISOString() ?? null,
    observation: r.observation,
    summary: r.summary,
    summaryBy: r.summaryBy,
    actions: actions
      .filter(a => a.runId === r.id)
      .map((a): AgentAction => ({
        id: a.id,
        runId: a.runId,
        courseId: a.courseId,
        tool: a.tool,
        decidedBy: a.decidedBy,
        reason: a.reason,
        outcome: a.outcome,
        status: a.status,
        notify: a.notify,
        costMicros: a.costMicros,
        at: a.at.toISOString(),
      })),
  }));
  const runCost = await (async () => {
    if (!runs.length) return 0;
    const [row] = await db
      .select({
        micros: sql<number>`coalesce(sum(coalesce(${aiCalls.chargedMicros}, ${aiCalls.reservedMicros})), 0)::bigint`,
      })
      .from(aiCalls)
      .where(
        and(
          eq(aiCalls.workspaceId, workspaceId),
          inArray(
            aiCalls.jobId,
            runs.map(r => r.id),
          ),
        ),
      );
    return Number(row?.micros ?? 0);
  })();
  const [checks] = await db
    .select({
      unaided: sql<number>`count(*) filter (where ${itemResults.score} >= 0.8 and not ${itemResults.usedHint} and not ${itemResults.languageSupport})::int`,
      concept: sql<number>`count(*) filter (where ${itemResults.score} >= 0.8 and ${itemResults.usedHint} and not ${itemResults.languageSupport})::int`,
      language: sql<number>`count(*) filter (where ${itemResults.score} >= 0.8 and ${itemResults.languageSupport})::int`,
      notRight: sql<number>`count(*) filter (where ${itemResults.score} < 0.8)::int`,
    })
    .from(itemResults)
    .where(
      and(
        eq(itemResults.workspaceId, workspaceId),
        sql`${itemResults.mode} <> 'self-rated'`,
        gte(itemResults.at, new Date(Date.now() - CHECK_DAYS * 86_400_000)),
      ),
    );
  const all = shown.flatMap(r => r.actions);
  return {
    goals,
    runs: shown,
    totals: {
      runs: shown.length,
      actions: all.length,
      byCode: all.filter(a => a.decidedBy === 'code').length,
      costMicros: runCost + all.reduce((n, a) => n + a.costMicros, 0),
    },
    checks: { days: CHECK_DAYS, ...(checks ?? { unaided: 0, concept: 0, language: 0, notRight: 0 }) },
  };
}

/** Reminders the agent sent, for the reminders list: from their day, for three days. */
/**
 * What the agent asked to be reminded of, from two days ago to today. The read takes a day either
 * side of that in UTC, so it needs no timezone and can share a round trip, and `agentRemindersFrom`
 * keeps the student's own days.
 */
export function agentRemindersRead(db: ReadDb | SocketDb | Transaction, workspaceId: string) {
  return db
    .select({
      id: agentActions.id,
      courseId: agentActions.courseId,
      reason: agentActions.reason,
      input: agentActions.input,
      remindOn: agentActions.remindOn,
      // A countdown names its goal in its key, so it can be counted from today and dropped once the goal is gone.
      countdown: sql<boolean>`${agentActions.key} like 'countdown:%'`,
      goal: { title: studyGoals.title, date: studyGoals.date, status: studyGoals.status },
    })
    .from(agentActions)
    .leftJoin(
      studyGoals,
      and(
        eq(studyGoals.workspaceId, agentActions.workspaceId),
        sql`${agentActions.key} like 'countdown:%' and ${studyGoals.id}::text = split_part(${agentActions.key}, ':', 2)`,
      ),
    )
    .where(
      and(
        eq(agentActions.workspaceId, workspaceId),
        eq(agentActions.notify, true),
        sql`${agentActions.remindOn} between current_date - 3 and current_date + 1`,
      ),
    )
    .orderBy(desc(agentActions.at));
}
export function agentRemindersFrom(rows: Awaited<ReturnType<typeof agentRemindersRead>>, today: string) {
  const from = addDays(today, -2);
  return rows
    .filter(r => r.remindOn && r.remindOn >= from && r.remindOn <= today)
    .filter(r => !r.countdown || (r.goal?.status === 'active' && !!r.goal.date && r.goal.date >= today))
    .slice(0, 20)
    .map(r => {
      const input = (r.input ?? {}) as { title?: string; to?: string };
      const goal = r.countdown && r.goal?.date ? r.goal : null;
      return {
        key: `agent:${r.id}`,
        title: goal ? `${goal.title} ${inDays(daysBetweenDates(today, goal.date!))}` : (input.title ?? r.reason),
        date: r.remindOn!,
        category: 'From Rawi',
        to: input.to ?? '/agent',
      };
    });
}
