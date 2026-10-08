import { createContext, useContext } from 'react';
import type { Me } from '@shared/contracts/workspace';

export const AccountContext = createContext<Me | null>(null);
export function useAccount() {
  const value = useContext(AccountContext);
  if (!value) throw new Error('An account is required');
  return value;
}
