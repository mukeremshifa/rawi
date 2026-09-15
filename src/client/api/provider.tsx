import { createContext, useContext, useMemo, type ReactNode } from 'react';

import type { ApiClient } from '@shared/contract.ts';

import { createClient } from './client.ts';
import { fakeApi } from './fake.ts';

/**
 * Which implementation the app is talking to, decided once.
 *
 * `VITE_API_MODE` defaults to `fake`, and that default is what lets the whole
 * gate — including Playwright — run on a machine with no credentials and no
 * spend. Live mode is the owner's step after the secrets in
 * docs/OPERATIONS.md §5 are in place.
 *
 * The mode is read from the environment rather than from a toggle in the UI,
 * because a runtime switch would mean both implementations ship and a bug could
 * put a real learner on the fake — which would silently discard their work.
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
  const value = useMemo(
    () => client ?? (API_MODE === 'live' ? createClient({ getToken }) : fakeApi),
    [client, getToken],
  );
  return <ApiContext.Provider value={value}>{children}</ApiContext.Provider>;
}

export function useApi(): ApiClient {
  const api = useContext(ApiContext);
  if (!api) throw new Error('useApi must be used inside ApiProvider');
  return api;
}
