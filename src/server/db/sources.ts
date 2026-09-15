import {
  ApiClientError,
  type Page,
  type PageRequest,
  type Source,
  type SourceChunk,
} from '../../shared/contract.ts';
import type { RetrievalScope, RetrievedChunk, Retriever } from '../retrieval/search.ts';
import { DEFAULT_RETRIEVAL_LIMIT } from '../retrieval/search.ts';
import { many, single, type Db } from './client.ts';

interface SourceRow {
  id: string;
  workspace_id: string;
  title: string;
  kind: 'pasted' | 'upload';
  status: 'ingesting' | 'ready' | 'failed';
  chunk_count: number | null;
  character_count: number;
  created_at: string;
}

const COLUMNS =
  'id, workspace_id, title, kind, status, chunk_count, character_count, created_at';

function toSource(row: SourceRow): Source {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    title: row.title,
    kind: row.kind,
    status: row.status,
    chunkCount: row.chunk_count,
    characterCount: row.character_count,
    createdAt: row.created_at,
  };
}

/** SHA-256 of the extracted text, so the same material twice is caught. */
export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export async function listSources(
  db: Db,
  userId: string,
  workspaceId: string,
  page: PageRequest | undefined,
): Promise<Page<Source>> {
  const limit = page?.limit ?? 50;
  let query = db
    .from('sources')
    .select(COLUMNS)
    .eq('user_id', userId)
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false })
    .limit(limit + 1);
  if (page?.cursor) query = query.lt('created_at', page.cursor);

  const rows = many<SourceRow>(await query);
  const items = rows.slice(0, limit);
  return {
    items: items.map(toSource),
    nextCursor: rows.length > limit ? (items.at(-1)?.created_at ?? null) : null,
  };
}

export async function getSource(
  db: Db,
  userId: string,
  workspaceId: string,
  sourceId: string,
): Promise<Source> {
  return toSource(
    single<SourceRow>(
      await db
        .from('sources')
        .select(COLUMNS)
        .eq('user_id', userId)
        .eq('workspace_id', workspaceId)
        .eq('id', sourceId)
        .maybeSingle(),
    ),
  );
}

/** The full extracted text. Server-side only — the client reads it as chunks. */
export async function getSourceText(
  db: Db,
  userId: string,
  sourceId: string,
): Promise<string> {
  const row = single<{ extracted_text: string }>(
    await db
      .from('sources')
      .select('extracted_text')
      .eq('user_id', userId)
      .eq('id', sourceId)
      .maybeSingle(),
  );
  return row.extracted_text;
}

export async function createSource(
  db: Db,
  input: {
    userId: string;
    workspaceId: string;
    title: string;
    kind: 'pasted' | 'upload';
    text: string;
    storagePath: string | null;
  },
): Promise<Source> {
  const row = single<SourceRow>(
    await db
      .from('sources')
      .insert({
        user_id: input.userId,
        workspace_id: input.workspaceId,
        title: input.title,
        kind: input.kind,
        status: 'ingesting',
        extracted_text: input.text,
        character_count: input.text.length,
        // NULL, not 0. The count is unknown until chunking finishes.
        chunk_count: null,
        storage_path: input.storagePath,
        sha256: await sha256Hex(input.text),
      })
      .select(COLUMNS)
      .single(),
  );
  return toSource(row);
}

export async function markSourceReady(
  db: Db,
  userId: string,
  sourceId: string,
  chunkCount: number,
): Promise<void> {
  const result = await db
    .from('sources')
    .update({ status: 'ready', chunk_count: chunkCount })
    .eq('user_id', userId)
    .eq('id', sourceId);
  if (result.error) throw new ApiClientError('internal', result.error.message);
}

export async function markSourceFailed(
  db: Db,
  userId: string,
  sourceId: string,
): Promise<void> {
  await db
    .from('sources')
    .update({ status: 'failed' })
    .eq('user_id', userId)
    .eq('id', sourceId);
}

export async function deleteSource(
  db: Db,
  userId: string,
  workspaceId: string,
  sourceId: string,
): Promise<void> {
  const result = await db
    .from('sources')
    .delete()
    .eq('user_id', userId)
    .eq('workspace_id', workspaceId)
    .eq('id', sourceId);
  if (result.error) throw new ApiClientError('internal', result.error.message);
}

export async function insertChunks(
  db: Db,
  input: {
    userId: string;
    workspaceId: string;
    sourceId: string;
    chunks: readonly { ordinal: number; text: string }[];
  },
): Promise<void> {
  if (input.chunks.length === 0) return;
  const result = await db.from('source_chunks').insert(
    input.chunks.map((chunk) => ({
      user_id: input.userId,
      workspace_id: input.workspaceId,
      source_id: input.sourceId,
      ordinal: chunk.ordinal,
      text: chunk.text,
    })),
  );
  if (result.error) throw new ApiClientError('internal', result.error.message);
}

export async function listChunks(
  db: Db,
  userId: string,
  workspaceId: string,
  sourceId: string,
  page: PageRequest | undefined,
): Promise<Page<SourceChunk>> {
  const limit = page?.limit ?? 50;
  const offset = page?.cursor ? Number(page.cursor) : 0;

  const rows = many<{ id: string; source_id: string; ordinal: number; text: string }>(
    await db
      .from('source_chunks')
      .select('id, source_id, ordinal, text')
      .eq('user_id', userId)
      .eq('workspace_id', workspaceId)
      .eq('source_id', sourceId)
      .order('ordinal', { ascending: true })
      .range(offset, offset + limit),
  );

  const items = rows.slice(0, limit);
  return {
    items: items.map((row) => ({
      id: row.id,
      sourceId: row.source_id,
      ordinal: row.ordinal,
      text: row.text,
    })),
    nextCursor: rows.length > limit ? String(offset + limit) : null,
  };
}

/** Every chunk in a workspace, for concept extraction. */
export async function allChunks(
  db: Db,
  userId: string,
  workspaceId: string,
): Promise<{ id: string; sourceId: string; ordinal: number; text: string }[]> {
  const rows = many<{ id: string; source_id: string; ordinal: number; text: string }>(
    await db
      .from('source_chunks')
      .select('id, source_id, ordinal, text')
      .eq('user_id', userId)
      .eq('workspace_id', workspaceId)
      .order('ordinal', { ascending: true }),
  );
  return rows.map((row) => ({
    id: row.id,
    sourceId: row.source_id,
    ordinal: row.ordinal,
    text: row.text,
  }));
}

/**
 * The Postgres implementation of `Retriever`.
 *
 * The scoping predicate lives inside `search_chunks` (migration 005), not here:
 * a retrieval helper that trusts its caller to add the ownership clause is one
 * refactor away from leaking one learner's notes into another's answer.
 */
export class PostgresRetriever implements Retriever {
  constructor(private readonly db: Db) {}

  async retrieve(
    scope: RetrievalScope,
    query: string,
    limit = DEFAULT_RETRIEVAL_LIMIT,
  ): Promise<RetrievedChunk[]> {
    const { data, error } = await this.db.rpc('search_chunks', {
      p_user_id: scope.userId,
      p_workspace_id: scope.workspaceId,
      p_query: query,
      p_limit: limit,
    });
    if (error) throw new ApiClientError('internal', error.message);

    return ((data ?? []) as {
      id: string;
      source_id: string;
      source_title: string;
      ordinal: number;
      text: string;
      score: number;
    }[]).map((row) => ({
      id: row.id,
      sourceId: row.source_id,
      sourceTitle: row.source_title,
      ordinal: row.ordinal,
      text: row.text,
      score: row.score,
    }));
  }
}
