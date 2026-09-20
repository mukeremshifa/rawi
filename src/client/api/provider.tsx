import { createContext, useContext, type ReactNode } from 'react';

import type { ApiClient } from '@shared/contract.ts';
import { localApi } from './local.ts';

const ApiContext = createContext<ApiClient | null>(null);

export function ApiProvider({ children }: { children: ReactNode }) {
  return <ApiContext.Provider value={localApi}>{children}</ApiContext.Provider>;
}

export function useApi(): ApiClient {
  const api = useContext(ApiContext);
  if (!api) throw new Error('useApi must be used inside ApiProvider');
  return api;
}
