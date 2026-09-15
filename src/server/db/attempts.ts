import { ApiClientError } from '../../shared/contract.ts';
import type { RecordedAttempt } from '../learning/rules.ts';
import { many, type Db } from './client.ts';

/**
 * The append-only log.
 *
 * There is no `updateAttempt` and no `deleteAttempt` in this module, and the
 * database refuses both anyway (migration 006's `attempts_immutable` trigger).
 * Invariant 4 is enforced in two places because an invariant enforced only in
 * application code holds right up until someone writes a migration script —
 * which is exactly the moment it matters most.
 */

interface AttemptRow {
  id: string;
  concept_id: string;
  item_id: string;
  family_id: string;
  purpose: RecordedAttempt['purpose'];
  stage: RecordedAttempt['stage'];
  correct: boolean;
  assistance: RecordedAttempt['assistance'];
  counts_as_independent: boolean;
  used_ask: boolean;
  review_due: string | null;
  idempotency_key: string;
  created_at: string;
}

const COLUMNS =
  'id, concept_id, item_id, family_id, purpose, stage, correct, assistance, ' +
  'counts_as_independent, used_ask, review_due, idempotency_key, created_at';

function toAttempt(row: AttemptRow): RecordedAttempt {
  return {
    id: row.id,
    conceptId: row.concept_id,
    itemId: row.item_id,
    familyId: row.family_id,
    purpose: row.purpose,
    stage: row.stage,
    correct: row.correct,
    assistance: row.assistance,
    countsAsIndependent: row.counts_as_independent,
    usedAsk: row.used_ask,
    at: row.created_at,
    reviewDue: row.review_due,
    idempotencyKey: row.idempotency_key,
  };
}

/** Ordered oldest first, which is the order `evidenceState` reasons in. */
export async function listAttempts(
  db: Db,
  userId: string,
  conceptId: string,
): Promise<RecordedAttempt[]> {
  return many<AttemptRow>(
    await db
      .from('attempts')
      .select(COLUMNS)
      .eq('user_id', userId)
      .eq('concept_id', conceptId)
      .order('created_at', { ascending: true }),
  ).map(toAttempt);
}

export async function listWorkspaceAttempts(
  db: Db,
  userId: string,
  workspaceId: string,
): Promise<RecordedAttempt[]> {
  return many<AttemptRow>(
    await db
      .from('attempts')
      .select(COLUMNS)
      .eq('user_id', userId)
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: true }),
  ).map(toAttempt);
}

/** An earlier attempt with this key, if the submission is a retry. */
export async function findByIdempotencyKey(
  db: Db,
  userId: string,
  idempotencyKey: string,
): Promise<RecordedAttempt | null> {
  const { data, error } = await db
    .from('attempts')
    .select(COLUMNS)
    .eq('user_id', userId)
    .eq('idempotency_key', idempotencyKey)
    .maybeSingle();
  if (error) throw new ApiClientError('internal', error.message);
  return data ? toAttempt(data as unknown as AttemptRow) : null;
}

export async function insertAttempt(
  db: Db,
  input: {
    userId: string;
    workspaceId: string;
    sessionId: string;
    attempt: RecordedAttempt;
    responseText: string;
  },
): Promise<void> {
  const result = await db.from('attempts').insert({
    id: input.attempt.id,
    session_id: input.sessionId,
    concept_id: input.attempt.conceptId,
    workspace_id: input.workspaceId,
    user_id: input.userId,
    item_id: input.attempt.itemId,
    family_id: input.attempt.familyId,
    purpose: input.attempt.purpose,
    stage: input.attempt.stage,
    correct: input.attempt.correct,
    assistance: input.attempt.assistance,
    counts_as_independent: input.attempt.countsAsIndependent,
    used_ask: input.attempt.usedAsk,
    // Verbatim. Every evidence quote is checked against this string, so it
    // cannot be trimmed, normalised or truncated on the way in.
    response_text: input.responseText,
    review_due: input.attempt.reviewDue,
    idempotency_key: input.attempt.idempotencyKey,
  });

  if (result.error) {
    // 23505 on this table means the same key arrived twice — a retry racing
    // itself. The caller has already looked the original up; this is the
    // narrow window between that read and this write, and the right answer is
    // still "you already did this", not an error.
    if (result.error.code === '23505') return;
    throw new ApiClientError('internal', result.error.message);
  }
}
