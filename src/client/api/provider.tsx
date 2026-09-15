import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import type { ApiClient } from '@shared/contract.ts';

import { createClient } from './client.ts';

/**
 * Which implementation the app is talking to, decided once, at build time.
 *
 * `VITE_API_MODE` defaults to `fake`, and that default is what lets the whole
 * gate — including Playwright — run on a machine with no credentials and no
 * spend. Live mode is the owner's step after docs/OPERATIONS.md §5.
 *
 * The mode comes from the environment rather than a toggle in the UI, because a
 * runtime switch would mean both implementations ship and a bug could put a
 * real learner on the fake — which would silently discard their work.
 *
 * ── Why the fake is a dynamic import ──────────────────────────────────────
 *
 * **In fake mode the browser IS the server**, so it necessarily holds the
 * authored content it grades against — including `correct_option_id` and
 * `answer_explanation`. That is unavoidable and harmless there: there is no
 * learner and no evidence that matters.
 *
 * It is neither unavoidable nor harmless in the build that ships. A static
 * import would pull the fake and its demo content into the live bundle too,
 * breaking invariant 9 for real — and `scripts/check-bundle-secrets.mjs`
 * caught exactly that. Importing it dynamically means a live build genuinely
 * does not contain it: the answer keys are absent rather than merely unused,
 * and the check runs against the live build to prove it.
 *
 * The cost is that the client resolves asynchronously and this provider has a
 * loading frame. That frame is real in fake mode and never happens in live
 * mode, where the branch is synchronous.
 */

export type ApiMode = 'fake' | 'live';

export const API_MODE: ApiMode =
  (import.meta.env['VITE_API_MODE'] as ApiMode | undefined) === 'live' ? 'live' : 'fake';

const ApiContext = createContext<ApiClient | null>(null);

export function ApiProvider({
  children,
  getToken,
  client,
}: {
  children: ReactNode;
  /** Supplies the current Supabase access token in live mode. */
  getToken: () => Promise<string | null>;
  /** Injected in tests. Otherwise chosen by `API_MODE`. */
  client?: ApiClient;
}) {
  const live = useMemo(
    () => (API_MODE === 'live' ? createClient({ getToken }) : null),
    [getToken],
  );
  const [resolved, setResolved] = useState<ApiClient | null>(client ?? live);

  useEffect(() => {
    if (resolved) return;
    let cancelled = false;
    void import('@/api/fake.ts').then((module) => {
      if (!cancelled) setResolved(module.fakeApi);
    });
    return () => {
      cancelled = true;
    };
  }, [resolved]);

  // Nothing rendered until the client exists. Rendering the tree with a null
  // client would make every `useApi()` throw on the first frame.
  if (!resolved) return null;

  return <ApiContext.Provider value={resolved}>{children}</ApiContext.Provider>;
}

export function useApi(): ApiClient {
  const api = useContext(ApiContext);
  if (!api) throw new Error('useApi must be used inside ApiProvider');
  return api;
}
