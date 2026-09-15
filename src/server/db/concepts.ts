import {
  ApiClientError,
  type Concept,
  type ConceptEvidence,
} from '../../shared/contract.ts';
import { conceptContentSchema, type ConceptContent } from '../../shared/content.ts';
import {
  earningAttempt,
  evidenceState,
  nextReviewDue,
  type RecordedAttempt,
} from '../learning/rules.ts';
import type { ConceptScheduling } from '../scheduling/fsrs.ts';
import { many, single, type Db } from './client.ts';
import { listAttempts } from './attempts.ts';

interface ConceptRow {
  id: string;
  workspace_id: string;
  name: string;
  summary: string;
  content: unknown;
  prerequisite_ids: string[];
  source_ids: string[];
  fsrs_stability: number;
  fsrs_difficulty: number;
  fsrs_elapsed_days: number;
  fsrs_scheduled_days: number;
  fsrs_reps: number;
  fsrs_lapses: number;
  fsrs_state: ConceptScheduling['state'];
  last_review_at: string | null;
  due_date: string | null;
  version: number;
}

const COLUMNS =
  'id, workspace_id, name, summary, content, prerequisite_ids, source_ids, ' +
  'fsrs_stability, fsrs_difficulty, fsrs_elapsed_days, fsrs_scheduled_days, ' +
  'fsrs_reps, fsrs_lapses, fsrs_state, last_review_at, due_date, version';

export function schedulingOf(row: {
  fsrs_stability: number;
  fsrs_difficulty: number;
  fsrs_elapsed_days: number;
  fsrs_scheduled_days: number;
  fsrs_reps: number;
  fsrs_lapses: number;
  fsrs_state: ConceptScheduling['state'];
  last_review_at: string | null;
  due_date: string | null;
}): ConceptScheduling | null {
  if (row.fsrs_reps === 0) return null;
  return {
    stability: row.fsrs_stability,
    difficulty: row.fsrs_difficulty,
    elapsedDays: row.fsrs_elapsed_days,
    scheduledDays: row.fsrs_scheduled_days,
    reps: row.fsrs_reps,
    lapses: row.fsrs_lapses,
    state: row.fsrs_state,
    lastReview: row.last_review_at,
    due: row.due_date ? `${row.due_date}T00:00:00.000Z` : new Date().toISOString(),
  };
}

/**
 * The authored content, or `null` for a concept that was extracted but whose
 * items have not been written yet.
 *
 * Parsed on read, every time. The row was validated on write, but a JSONB
 * column is a column anyone with the service key can put anything into, and
 * this is the boundary where "trusted" would otherwise start being assumed.
 */
export function contentOf(row: { content: unknown }): ConceptContent | null {
  if (!row.content) return null;
  const parsed = conceptContentSchema.safeParse(row.content);
  return parsed.success ? parsed.data : null;
}

/**
 * Project a concept for the browser.
 *
 * `evidence`, `dueAt` and `itemsRemaining` are all **derived** — from the
 * attempt log, from the attempt that earned the schedule, and from the authored
 * items minus what has been seen. None of them is a stored summary that could
 * drift from what actually happened (invariants 4 and 6).
 */
export function toConcept(
  row: ConceptRow,
  attempts: readonly RecordedAttempt[],
  exposedItemIds: readonly string[],
): Concept {
  const content = contentOf(row);
  const remaining = content
    ? content.tasks.filter((task) => !exposedItemIds.includes(task.id)).length
    : 0;

  return {
    id: row.id,
    workspaceId: row.workspace_id,
    name: row.name,
    summary: row.summary,
    evidence: evidenceState(attempts),
    prerequisiteIds: row.prerequisite_ids,
    sourceIds: row.source_ids,
    lastAttemptAt: attempts.at(-1)?.at ?? null,
    dueAt: nextReviewDue(attempts) ?? row.due_date,
    itemsRemaining: remaining,
  };
}

/** Item ids this learner has already been shown for a concept, ever. */
export async function exposedItemIds(
  db: Db,
  userId: string,
  conceptId: string,
): Promise<string[]> {
  const rows = many<{ state: { exposedItemIds?: string[] } }>(
    await db
      .from('learning_sessions')
      .select('state')
      .eq('user_id', userId)
      .eq('concept_id', conceptId),
  );
  return [...new Set(rows.flatMap((row) => row.state.exposedItemIds ?? []))];
}

export async function listConcepts(
  db: Db,
  userId: string,
  workspaceId: string,
): Promise<Concept[]> {
  const rows = many<ConceptRow>(
    await db
      .from('concepts')
      .select(COLUMNS)
      .eq('user_id', userId)
      .eq('workspace_id', workspaceId)
      .order('name', { ascending: true }),
  );

  return Promise.all(
    rows.map(async (row) =>
      toConcept(
        row,
        await listAttempts(db, userId, row.id),
        await exposedItemIds(db, userId, row.id),
      ),
    ),
  );
}

export async function getConceptRow(
  db: Db,
  userId: string,
  workspaceId: string,
  conceptId: string,
): Promise<ConceptRow> {
  return single<ConceptRow>(
    await db
      .from('concepts')
      .select(COLUMNS)
      .eq('user_id', userId)
      .eq('workspace_id', workspaceId)
      .eq('id', conceptId)
      .maybeSingle(),
  );
}

export async function getConcept(
  db: Db,
  userId: string,
  workspaceId: string,
  conceptId: string,
): Promise<Concept> {
  const row = await getConceptRow(db, userId, workspaceId, conceptId);
  return toConcept(
    row,
    await listAttempts(db, userId, conceptId),
    await exposedItemIds(db, userId, conceptId),
  );
}

export async function getConceptEvidence(
  db: Db,
  userId: string,
  workspaceId: string,
  conceptId: string,
): Promise<ConceptEvidence> {
  const row = await getConceptRow(db, userId, workspaceId, conceptId);
  const attempts = await listAttempts(db, userId, conceptId);
  const concept = toConcept(row, attempts, await exposedItemIds(db, userId, conceptId));
  const earned = earningAttempt(attempts);

  return {
    concept,
    attempts: attempts.map((attempt) => ({
      id: attempt.id,
      conceptId: attempt.conceptId,
      itemId: attempt.itemId,
      familyId: attempt.familyId,
      purpose: attempt.purpose,
      stage: attempt.stage,
      correct: attempt.correct,
      assistance: attempt.assistance,
      countsAsIndependent: attempt.countsAsIndependent,
      usedAsk: attempt.usedAsk,
      at: attempt.at,
      reviewDue: attempt.reviewDue,
    })),
    earnedBy: earned
      ? {
          id: earned.id,
          conceptId: earned.conceptId,
          itemId: earned.itemId,
          familyId: earned.familyId,
          purpose: earned.purpose,
          stage: earned.stage,
          correct: earned.correct,
          assistance: earned.assistance,
          countsAsIndependent: earned.countsAsIndependent,
          usedAsk: earned.usedAsk,
          at: earned.at,
          reviewDue: earned.reviewDue,
        }
      : null,
  };
}

export async function upsertConcepts(
  db: Db,
  input: {
    userId: string;
    workspaceId: string;
    concepts: readonly {
      name: string;
      summary: string;
      sourceIds: string[];
      content: ConceptContent | null;
    }[];
  },
): Promise<void> {
  if (input.concepts.length === 0) return;
  const result = await db.from('concepts').upsert(
    input.concepts.map((concept) => ({
      user_id: input.userId,
      workspace_id: input.workspaceId,
      name: concept.name,
      summary: concept.summary,
      source_ids: concept.sourceIds,
      content: concept.content,
    })),
    { onConflict: 'workspace_id,name' },
  );
  if (result.error) throw new ApiClientError('internal', result.error.message);
}

/**
 * Write the new schedule.
 *
 * Guarded on `version`, the pattern 001 established. Two tabs submitting the
 * last item of a session at once must not both advance the schedule — one wins
 * and the other is told its view was stale.
 */
export async function updateScheduling(
  db: Db,
  input: {
    userId: string;
    conceptId: string;
    expectedVersion: number;
    scheduling: ConceptScheduling;
    dueDate: string;
    now: Date;
  },
): Promise<void> {
  const result = await db
    .from('concepts')
    .update({
      fsrs_stability: input.scheduling.stability,
      fsrs_difficulty: input.scheduling.difficulty,
      fsrs_elapsed_days: input.scheduling.elapsedDays,
      fsrs_scheduled_days: input.scheduling.scheduledDays,
      fsrs_reps: input.scheduling.reps,
      fsrs_lapses: input.scheduling.lapses,
      fsrs_state: input.scheduling.state,
      last_review_at: input.now.toISOString(),
      due_date: input.dueDate,
      version: input.expectedVersion + 1,
    })
    .eq('user_id', input.userId)
    .eq('id', input.conceptId)
    .eq('version', input.expectedVersion)
    .select('id');

  if (result.error) throw new ApiClientError('internal', result.error.message);
  if ((result.data ?? []).length === 0) {
    throw new ApiClientError(
      'stale_request',
      'This concept was updated somewhere else. Reload to see where you actually are.',
    );
  }
}

export async function listDueConcepts(
  db: Db,
  userId: string,
  workspaceId: string,
  now: Date,
): Promise<Concept[]> {
  const rows = many<ConceptRow>(
    await db
      .from('concepts')
      .select(COLUMNS)
      .eq('user_id', userId)
      .eq('workspace_id', workspaceId)
      .not('due_date', 'is', null)
      .lte('due_date', now.toISOString().slice(0, 10))
      .order('due_date', { ascending: true }),
  );

  return Promise.all(
    rows.map(async (row) =>
      toConcept(
        row,
        await listAttempts(db, userId, row.id),
        await exposedItemIds(db, userId, row.id),
      ),
    ),
  );
}
