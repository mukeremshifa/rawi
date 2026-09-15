import { ApiClientError } from '../../shared/contract.ts';
import type { SessionState } from '../learning/rules.ts';
import { single, type Db } from './client.ts';

/**
 * Session persistence, and the one thing it exists to get right:
 * **read-apply-write is serialised by the `version` column.**
 *
 * Every command is `read state at version N -> apply a pure function from
 * rules.ts -> UPDATE … WHERE version = N`. If the update matches no row,
 * something else moved the session and the command is rejected as
 * `stale_request` rather than applied on top of a state it was not written
 * against.
 *
 * That is what makes invariant 1 hold across two tabs. Without it, "reveal the
 * answer" in one tab and "submit" in another interleave into a submission
 * recorded as unaided on an item that has already been revealed — which is the
 * exact lie the product exists not to tell.
 */

interface SessionRow {
  id: string;
  workspace_id: string;
  concept_id: string;
  state: SessionState;
  version: number;
  ended_at: string | null;
}

const COLUMNS = 'id, workspace_id, concept_id, state, version, ended_at';

export async function createSessionRow(
  db: Db,
  input: {
    userId: string;
    workspaceId: string;
    conceptId: string;
    state: SessionState;
  },
): Promise<{ state: SessionState; version: number }> {
  const row = single<SessionRow>(
    await db
      .from('learning_sessions')
      .insert({
        id: input.state.sessionId,
        user_id: input.userId,
        workspace_id: input.workspaceId,
        concept_id: input.conceptId,
        state: input.state,
        version: 1,
      })
      .select(COLUMNS)
      .single(),
  );
  return { state: row.state, version: row.version };
}

export async function loadSession(
  db: Db,
  userId: string,
  workspaceId: string,
  sessionId: string,
): Promise<{ state: SessionState; version: number; endedAt: string | null }> {
  const row = single<SessionRow>(
    await db
      .from('learning_sessions')
      .select(COLUMNS)
      .eq('user_id', userId)
      .eq('workspace_id', workspaceId)
      .eq('id', sessionId)
      .maybeSingle(),
  );
  // The stored state is the authority on its own version; the column exists so
  // the database can enforce the guard, and they are written together.
  return { state: { ...row.state, version: row.version }, version: row.version, endedAt: row.ended_at };
}

/**
 * Commit a new state, or reject.
 *
 * Returns the committed state with its new version. Throws `stale_request` when
 * the guard does not match — deliberately the same error the client sees for a
 * stale item or a stale stage, because from the learner's side they are one
 * situation: the tab is out of date.
 */
export async function commitSession(
  db: Db,
  input: {
    userId: string;
    sessionId: string;
    expectedVersion: number;
    state: SessionState;
    ended?: boolean;
  },
): Promise<SessionState> {
  const nextVersion = input.expectedVersion + 1;
  const result = await db
    .from('learning_sessions')
    .update({
      state: { ...input.state, version: nextVersion },
      version: nextVersion,
      ...(input.ended ? { ended_at: new Date().toISOString() } : {}),
    })
    .eq('user_id', input.userId)
    .eq('id', input.sessionId)
    .eq('version', input.expectedVersion)
    .select('id');

  if (result.error) throw new ApiClientError('internal', result.error.message);
  if ((result.data ?? []).length === 0) {
    throw new ApiClientError(
      'stale_request',
      'This session moved on — probably in another tab. Reload to see where you actually are.',
    );
  }

  return { ...input.state, version: nextVersion };
}

/** The most recent session for a concept, so "continue" has something to open. */
export async function latestSessionForConcept(
  db: Db,
  userId: string,
  conceptId: string,
): Promise<{ state: SessionState; version: number } | null> {
  const { data, error } = await db
    .from('learning_sessions')
    .select(COLUMNS)
    .eq('user_id', userId)
    .eq('concept_id', conceptId)
    .is('ended_at', null)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new ApiClientError('internal', error.message);
  if (!data) return null;
  const row = data as SessionRow;
  return { state: { ...row.state, version: row.version }, version: row.version };
}
