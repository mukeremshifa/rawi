import { QueryClient, type QueryKey } from '@tanstack/react-query';
import { onWrite, RequestError } from '@/lib/api';

/** Codes where retrying a read cannot help. */
const FINAL = new Set(['unauthenticated', 'account_changed', 'not_found', 'forbidden', 'invalid_input']);

/**
 * One cache for the signed-in account. App clears it on sign-out and on
 * account switch. Nothing is persisted, because offline storage is excluded.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Going back to a page within 30 seconds shows what it had, without asking again. Writes mark
      // everything stale (below), so data a write could have changed is fetched again on the next visit.
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      retry: (count, error) => count < 2 && !(error instanceof RequestError && FINAL.has(error.code)),
    },
    mutations: { retry: false },
  },
});

// Any accepted write may change what other pages show, so everything cached becomes stale. Pages
// on screen are not refetched here: each write still refetches what it changes by its own keys.
onWrite(() => void queryClient.invalidateQueries({ refetchType: 'none' }));

/**
 * Keys mirror API paths, so a key and the path it reads never disagree and a
 * prefix invalidates everything beneath it: `keys.course(id).all` covers the
 * course's topics, materials, sets, runs and the rest.
 */
export function pathKey(path: string): QueryKey {
  const [pathname = '', search = ''] = path.split('?');
  const parts: unknown[] = pathname.split('/').filter(Boolean);
  const params = Object.fromEntries(new URLSearchParams(search));
  return Object.keys(params).length ? [...parts, params] : parts;
}

export const keys = {
  me: () => pathKey('/v1/me'),
  courses: {
    all: pathKey('/v1/courses'),
    list: (archived: string) => pathKey(`/v1/courses?archived=${archived}`),
  },
  course: (id: string) => ({
    all: pathKey(`/v1/courses/${id}`),
    topics: pathKey(`/v1/courses/${id}/topics`),
    materials: pathKey(`/v1/courses/${id}/materials`),
    sets: pathKey(`/v1/courses/${id}/sets`),
    runs: pathKey(`/v1/courses/${id}/runs`),
    attempts: pathKey(`/v1/courses/${id}/attempts`),
    exams: pathKey(`/v1/courses/${id}/exams`),
    tutor: pathKey(`/v1/courses/${id}/tutor`),
  }),
  material: (id: string) => pathKey(`/v1/materials/${id}`),
  set: (id: string) => pathKey(`/v1/sets/${id}`),
  run: (id: string) => pathKey(`/v1/runs/${id}`),
  attempt: (id: string) => pathKey(`/v1/attempts/${id}`),
  exam: (id: string) => pathKey(`/v1/exams/${id}`),
  tutorSession: (id: string) => pathKey(`/v1/tutor/${id}`),
  aiOperation: (id: string) => pathKey(`/v1/ai/operations/${id}`),
  planner: pathKey('/v1/planner'),
  progress: pathKey('/v1/progress'),
  notifications: pathKey('/v1/notifications'),
  preferences: pathKey('/v1/preferences'),
  search: (q: string) => pathKey(`/v1/search?q=${encodeURIComponent(q)}`),
};

/** Learning activity touches the planner, progress and reminders at once. */
export const activityKeys: QueryKey[] = [keys.planner, keys.progress, keys.notifications];
