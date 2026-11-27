import { and, eq, inArray, sql } from 'drizzle-orm';
import type { BackendBindings } from '../config';
import { databaseUrl, socketDb } from '../db/client';
import { ingestJobs, materialVersions, outlineJobs } from '../db/schema';
import type { AgentTrigger } from '../../shared/contracts/agent';
import { runCourseJobs } from './outline/jobs';
import { advance } from './conversion';
import { fillRun } from './questions/practice';
import { runAgent } from './agent/loop';

/**
 * Background work as queue messages. A request queues the work it starts, and the consumer runs it.
 * Work that is not finished, such as a long reading or a conversion still processing, queues itself
 * again after a short delay, so it continues within seconds instead of waiting for the hourly cron.
 * The cron still sweeps up anything a message left behind.
 *
 * Without a queue binding the work runs after the response, as before.
 */
export type JobMessage =
  | { kind: 'course'; workspaceId: string; courseId: string; round?: number }
  | { kind: 'conversion'; versionId: string; round?: number }
  | { kind: 'fill'; workspaceId: string; runId: string }
  | { kind: 'agent'; workspaceId: string; trigger: AgentTrigger };

/** How long unfinished work waits before it continues, and how many times a message may continue. */
const CONTINUE_SECONDS: Record<'course' | 'conversion', number> = { course: 5, conversion: 15 };
const MAX_ROUNDS = 120;

/** Queue work from a request. The response does not wait for it. */
export function later(
  c: { env: BackendBindings; executionCtx: { waitUntil(p: Promise<unknown>): void } },
  message: JobMessage,
) {
  c.executionCtx.waitUntil(
    c.env.JOBS ? c.env.JOBS.send(message).catch(() => run(c.env, message)) : run(c.env, message).then(() => undefined),
  );
}

/** Run one message. Returns whether its work still has more to do. */
async function run(env: BackendBindings, m: JobMessage): Promise<boolean> {
  switch (m.kind) {
    case 'course':
      await runCourseJobs(env, m);
      return coursePending(env, m);
    case 'conversion':
      await advance(env, m.versionId);
      return conversionPending(env, m.versionId);
    case 'fill':
      await fillRun(env, m.workspaceId, m.runId);
      return false;
    case 'agent':
      await runAgent(env, m.workspaceId, m.trigger);
      return false;
  }
}

async function coursePending(env: BackendBindings, scope: { workspaceId: string; courseId: string }) {
  const connection = socketDb(databaseUrl(env), 1);
  try {
    const [row] = await connection.db
      .execute<{ n: number }>(
        sql`
      select (select count(*) from ${outlineJobs} where workspace_id = ${scope.workspaceId} and course_id = ${scope.courseId} and state in ('queued', 'running'))
           + (select count(*) from ${ingestJobs} where workspace_id = ${scope.workspaceId} and course_id = ${scope.courseId} and state in ('queued', 'running')) as n`,
      )
      .then(r => r.rows);
    return Number(row?.n ?? 0) > 0;
  } finally {
    await connection.close();
  }
}

async function conversionPending(env: BackendBindings, versionId: string) {
  const connection = socketDb(databaseUrl(env), 1);
  try {
    const [row] = await connection.db
      .select({ id: materialVersions.id })
      .from(materialVersions)
      .where(and(eq(materialVersions.id, versionId), inArray(materialVersions.status, ['pending', 'processing'])));
    return !!row;
  } finally {
    await connection.close();
  }
}

/** The queue consumer. A message whose work continues is queued again, a failed one is retried. */
export async function consume(batch: MessageBatch<JobMessage>, env: BackendBindings) {
  for (const message of batch.messages) {
    const m = message.body;
    try {
      const more = await run(env, m);
      if (more && (m.kind === 'course' || m.kind === 'conversion') && (m.round ?? 0) < MAX_ROUNDS && env.JOBS)
        await env.JOBS.send({ ...m, round: (m.round ?? 0) + 1 }, { delaySeconds: CONTINUE_SECONDS[m.kind] });
      message.ack();
    } catch (error) {
      console.error(JSON.stringify({ operation: 'job', kind: m.kind, error: String(error).slice(0, 200) }));
      message.retry({ delaySeconds: 30 });
    }
  }
}
