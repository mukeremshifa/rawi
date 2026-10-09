import { useRef, useState } from 'react';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query';
import { errorMessage, request, RequestError } from '@/lib/api';
import { useAccount } from '@/lib/account';
import { pathKey } from '@/lib/query';

/** Read one record. `path: null` waits until the caller has what it needs. */
export function useApi<T>(path: string | null, options: { refetchInterval?: number; refetchIntervalInBackground?: boolean } = {}) {
  const { user } = useAccount();
  const qc = useQueryClient();
  const key = pathKey(path ?? '');
  const query = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => request<T>(path!, user.id, undefined, 'GET', signal),
    enabled: path !== null,
    ...options,
  });
  return { ...query, key, setData: (value: T) => qc.setQueryData(key, value) };
}

/** A cursor-paged list, shown as "Load more" or an infinite list. */
export function useApiPages<T, K extends string>(path: string | null, field: K, options: { refetchInterval?: number | false } = {}) {
  const { user } = useAccount();
  const query = useInfiniteQuery({
    queryKey: pathKey(path ?? ''),
    enabled: path !== null,
    ...options,
    initialPageParam: '' as string | number,
    queryFn: ({ pageParam, signal }) => request<Record<K, T[]> & { nextCursor: string | number | null }>(
      `${path}${pageParam !== '' ? `${path!.includes('?') ? '&' : '?'}cursor=${pageParam}` : ''}`, user.id, undefined, 'GET', signal),
    // Cursors are ids or, for blocks, an ordinal that can be 0.
    getNextPageParam: page => page.nextCursor ?? undefined,
  });
  const items = query.data?.pages.flatMap(page => page[field]);
  return { ...query, items };
}

/**
 * A complete, bounded selection pool, read page by page. Never exposes an
 * incomplete pool as complete: a failed page fails the whole read.
 */
export function useApiAll<T>(path: string | null, field: string) {
  const { user } = useAccount();
  return useQuery({
    queryKey: [...pathKey(path ?? ''), 'all'],
    enabled: path !== null,
    queryFn: async ({ signal }) => {
      const rows: T[] = [];
      let cursor: string | null = null;
      do {
        const page: Record<string, unknown> & { nextCursor: string | null } = await request(`${path}${cursor ? `${path!.includes('?') ? '&' : '?'}cursor=${cursor}` : ''}`, user.id, undefined, 'GET', signal);
        rows.push(...page[field] as T[]); cursor = page.nextCursor;
        if (rows.length > 5000) throw new Error('This selection has more than 5,000 records. Narrow it down first.');
      } while (cursor);
      return rows;
    },
  });
}

export type Write = { path: string; method?: string; body?: unknown };
export type SaveStatus = 'idle' | 'saving' | 'saved' | 'failed';

/**
 * A server write. Saved means acknowledged by the server.
 *
 * A failed write keeps its exact body, including the idempotent operationId,
 * so `retry()` resends the same request rather than a new one. Running the
 * same action again while it is pending also resends the kept body. Drafts
 * stay in the caller's state and never enter the cache.
 */
export function useSave() {
  const { user } = useAccount();
  const qc = useQueryClient();
  const kept = useRef<{ id: string; write: Write; done?: (value: unknown) => void; invalidate?: QueryKey[] } | null>(null);
  const [saved, setSaved] = useState(false);
  // Guards double activation within one render, before isPending updates.
  const inFlight = useRef(false);
  const mutation = useMutation({
    mutationFn: (write: Write) => request<unknown>(write.path, user.id, write.body, write.method ?? 'POST'),
  });
  const error = mutation.error;
  function send() {
    const task = kept.current;
    if (!task || inFlight.current) return;
    inFlight.current = true; setSaved(false);
    mutation.mutate(task.write, {
      onSettled: () => { inFlight.current = false; },
      onSuccess: value => {
        if (kept.current === task) kept.current = null;
        setSaved(true);
        for (const key of task.invalidate ?? []) void qc.invalidateQueries({ queryKey: key });
        task.done?.(value);
      },
    });
  }
  function run<T>(write: Write, options: { id?: string; onSuccess?: (value: T) => void; invalidate?: QueryKey[] } = {}) {
    if (inFlight.current) return;
    const id = options.id ?? `${write.method ?? 'POST'} ${write.path}`;
    if (kept.current?.id !== id) kept.current = { id, write, done: options.onSuccess as (value: unknown) => void, invalidate: options.invalidate };
    else kept.current.done = options.onSuccess as (value: unknown) => void;
    send();
  }
  const status: SaveStatus = mutation.isPending ? 'saving' : error ? 'failed' : saved ? 'saved' : 'idle';
  return {
    run,
    retry: send,
    /** Drop a kept request, for example after reviewing the latest version. */
    discard: () => { if (inFlight.current) return; kept.current = null; mutation.reset(); setSaved(false); },
    busy: mutation.isPending,
    pending: !!kept.current,
    status,
    error: error ? errorMessage(error) : '',
    code: error instanceof RequestError ? error.code : '',
    requestId: error instanceof RequestError ? error.requestId : '',
    conflict: error instanceof RequestError && error.code === 'revision_conflict',
  };
}
