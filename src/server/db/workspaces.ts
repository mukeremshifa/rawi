import {
  ApiClientError,
  type CreateWorkspaceInput,
  type Page,
  type PageRequest,
  type UpdateWorkspaceInput,
  type Workspace,
} from '../../shared/contract.ts';
import { many, single, type Db } from './client.ts';

interface WorkspaceRow {
  id: string;
  name: string;
  intent: string | null;
  version: number;
  created_at: string;
  updated_at: string;
}

const COLUMNS = 'id, name, intent, version, created_at, updated_at';

function toWorkspace(
  row: WorkspaceRow,
  counts: { sources: number; concepts: number; due: number },
): Workspace {
  return {
    id: row.id,
    name: row.name,
    intent: row.intent,
    sourceCount: counts.sources,
    conceptCount: counts.concepts,
    dueCount: counts.due,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * The counts on a workspace card.
 *
 * Three `count: 'exact', head: true` queries rather than a view or three
 * correlated subqueries. It is more round trips and it is the right trade for
 * a list this size: each one is a plain index scan the planner cannot get
 * wrong, and a view here would be a second place the ownership predicate has to
 * be correct. When a workspace list is slow enough to notice, a materialised
 * count is a small, local change — the shape of the callers does not depend on
 * how these numbers are produced.
 */
async function countsFor(
  db: Db,
  userId: string,
  workspaceId: string,
  today: string,
): Promise<{ sources: number; concepts: number; due: number }> {
  const [sources, concepts, due] = await Promise.all([
    db
      .from('sources')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('workspace_id', workspaceId),
    db
      .from('concepts')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('workspace_id', workspaceId),
    db
      .from('concepts')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('workspace_id', workspaceId)
      .lte('due_date', today),
  ]);

  return {
    sources: sources.count ?? 0,
    concepts: concepts.count ?? 0,
    due: due.count ?? 0,
  };
}

export async function listWorkspaces(
  db: Db,
  userId: string,
  page: PageRequest | undefined,
  now: Date,
): Promise<Page<Workspace>> {
  const limit = page?.limit ?? 25;
  const today = now.toISOString().slice(0, 10);

  let query = db
    .from('workspaces')
    .select(COLUMNS)
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    // One extra row, so "is there another page" is an observation rather than
    // a guess from whether the page came back full.
    .limit(limit + 1);

  if (page?.cursor) query = query.lt('updated_at', page.cursor);

  const rows = many<WorkspaceRow>(await query);
  const items = rows.slice(0, limit);

  const withCounts = await Promise.all(
    items.map(async (row) =>
      toWorkspace(row, await countsFor(db, userId, row.id, today)),
    ),
  );

  return {
    items: withCounts,
    nextCursor: rows.length > limit ? (items.at(-1)?.updated_at ?? null) : null,
  };
}

export async function getWorkspace(
  db: Db,
  userId: string,
  workspaceId: string,
  now: Date,
): Promise<Workspace> {
  const row = single<WorkspaceRow>(
    await db
      .from('workspaces')
      .select(COLUMNS)
      .eq('user_id', userId)
      .eq('id', workspaceId)
      .maybeSingle(),
  );
  return toWorkspace(
    row,
    await countsFor(db, userId, workspaceId, now.toISOString().slice(0, 10)),
  );
}

/**
 * Ownership, as one call every workspace-scoped handler makes first.
 *
 * Returning `forbidden` versus `not_found` is a real decision: telling someone
 * a workspace exists but is not theirs leaks its existence. This returns
 * `not_found` for both, which is the safer of the two and costs the honest user
 * nothing — they cannot reach an id they were never given.
 */
export async function assertOwnsWorkspace(
  db: Db,
  userId: string,
  workspaceId: string,
): Promise<void> {
  const result = await db
    .from('workspaces')
    .select('id')
    .eq('user_id', userId)
    .eq('id', workspaceId)
    .maybeSingle();
  if (result.error || !result.data) {
    throw new ApiClientError('not_found', 'That workspace is not here.');
  }
}

export async function createWorkspace(
  db: Db,
  userId: string,
  input: CreateWorkspaceInput,
): Promise<Workspace> {
  const row = single<WorkspaceRow>(
    await db
      .from('workspaces')
      .insert({ user_id: userId, name: input.name, intent: input.intent ?? null })
      .select(COLUMNS)
      .single(),
  );
  return toWorkspace(row, { sources: 0, concepts: 0, due: 0 });
}

export async function updateWorkspace(
  db: Db,
  userId: string,
  workspaceId: string,
  input: UpdateWorkspaceInput,
  now: Date,
): Promise<Workspace> {
  const patch: Record<string, unknown> = {};
  if (input.name !== undefined) patch['name'] = input.name;
  if (input.intent !== undefined) patch['intent'] = input.intent;
  if (Object.keys(patch).length === 0) {
    return getWorkspace(db, userId, workspaceId, now);
  }

  single<WorkspaceRow>(
    await db
      .from('workspaces')
      .update(patch)
      .eq('user_id', userId)
      .eq('id', workspaceId)
      .select(COLUMNS)
      .maybeSingle(),
  );
  return getWorkspace(db, userId, workspaceId, now);
}

export async function deleteWorkspace(
  db: Db,
  userId: string,
  workspaceId: string,
): Promise<void> {
  // Sources, concepts, sessions, attempts and jobs all cascade from here. That
  // is the deletion story docs/SAFETY.md promises: one row, and everything the
  // learner put in goes with it.
  const result = await db
    .from('workspaces')
    .delete()
    .eq('user_id', userId)
    .eq('id', workspaceId);
  if (result.error) throw new ApiClientError('internal', result.error.message);
}
