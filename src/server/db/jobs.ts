import {
  ApiClientError,
  ApiErrorCode,
  type Job,
  type JobKind,
} from '../../shared/contract.ts';
import { many, single, type Db } from './client.ts';

interface JobRow {
  id: string;
  workspace_id: string;
  kind: JobKind;
  status: Job['status'];
  stage: string;
  units_done: number;
  units_total: number | null;
  cursor: Record<string, unknown>;
  subject_id: string | null;
  error_code: string | null;
  error_message: string | null;
  version: number;
  created_at: string;
  updated_at: string;
}

const COLUMNS =
  'id, workspace_id, kind, status, stage, units_done, units_total, cursor, ' +
  'subject_id, error_code, error_message, version, created_at, updated_at';

export function toJob(row: JobRow): Job {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    kind: row.kind,
    status: row.status,
    stage: row.stage,
    unitsDone: row.units_done,
    unitsTotal: row.units_total,
    // Parsed rather than cast: `error_code` is a free-text column, and a value
    // outside the closed union would make a `switch` in the UI fall through
    // silently. An unrecognised code becomes `internal`, which is honest.
    error: row.error_code
      ? {
          code: ApiErrorCode.safeParse(row.error_code).data ?? 'internal',
          message: row.error_message ?? 'The job failed.',
        }
      : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface JobState {
  row: JobRow;
  job: Job;
}

export async function createJob(
  db: Db,
  input: {
    userId: string;
    workspaceId: string;
    kind: JobKind;
    stage: string;
    unitsTotal: number | null;
    subjectId: string | null;
    cursor?: Record<string, unknown>;
  },
): Promise<Job> {
  return toJob(
    single<JobRow>(
      await db
        .from('jobs')
        .insert({
          user_id: input.userId,
          workspace_id: input.workspaceId,
          kind: input.kind,
          status: 'queued',
          stage: input.stage,
          units_total: input.unitsTotal,
          subject_id: input.subjectId,
          cursor: input.cursor ?? {},
        })
        .select(COLUMNS)
        .single(),
    ),
  );
}

export async function loadJobRow(
  db: Db,
  userId: string,
  workspaceId: string,
  jobId: string,
): Promise<JobRow> {
  return single<JobRow>(
    await db
      .from('jobs')
      .select(COLUMNS)
      .eq('user_id', userId)
      .eq('workspace_id', workspaceId)
      .eq('id', jobId)
      .maybeSingle(),
  );
}

export async function getJob(
  db: Db,
  userId: string,
  workspaceId: string,
  jobId: string,
): Promise<Job> {
  return toJob(await loadJobRow(db, userId, workspaceId, jobId));
}

export async function listJobs(
  db: Db,
  userId: string,
  workspaceId: string,
): Promise<Job[]> {
  return many<JobRow>(
    await db
      .from('jobs')
      .select(COLUMNS)
      .eq('user_id', userId)
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false })
      .limit(20),
  ).map(toJob);
}

/**
 * Advance a job by one step, guarded on `version`.
 *
 * The guard matters more here than it looks. `getJob` is what advances a job —
 * a client polling twice in quick succession runs two steps concurrently, and
 * without the guard both would write from the same cursor and one step's worth
 * of chunks would be inserted twice.
 */
export async function commitJobStep(
  db: Db,
  input: {
    userId: string;
    jobId: string;
    expectedVersion: number;
    patch: {
      status?: Job['status'];
      stage?: string;
      unitsDone?: number;
      unitsTotal?: number | null;
      cursor?: Record<string, unknown>;
      errorCode?: string | null;
      errorMessage?: string | null;
    };
  },
): Promise<JobRow | null> {
  const patch: Record<string, unknown> = { version: input.expectedVersion + 1 };
  if (input.patch.status !== undefined) patch['status'] = input.patch.status;
  if (input.patch.stage !== undefined) patch['stage'] = input.patch.stage;
  if (input.patch.unitsDone !== undefined) patch['units_done'] = input.patch.unitsDone;
  if (input.patch.unitsTotal !== undefined) patch['units_total'] = input.patch.unitsTotal;
  if (input.patch.cursor !== undefined) patch['cursor'] = input.patch.cursor;
  if (input.patch.errorCode !== undefined) patch['error_code'] = input.patch.errorCode;
  if (input.patch.errorMessage !== undefined) {
    patch['error_message'] = input.patch.errorMessage;
  }

  const result = await db
    .from('jobs')
    .update(patch)
    .eq('user_id', input.userId)
    .eq('id', input.jobId)
    .eq('version', input.expectedVersion)
    .select(COLUMNS)
    .maybeSingle();

  if (result.error) throw new ApiClientError('internal', result.error.message);
  // No row means another poll won the race and already advanced it. That is a
  // normal outcome, not a failure: the caller just returns the job as it is.
  return (result.data as JobRow | null) ?? null;
}
