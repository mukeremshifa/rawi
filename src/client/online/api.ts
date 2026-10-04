import { createAuthClient } from 'better-auth/react';
import type { ApiErrorBody } from '@shared/online';

export const authClient = createAuthClient({ baseURL: window.location.origin });
let activeUser: string | null = null;
let accountGeneration = 0;
export function setActiveAccount(userId: string | null) {
  if (activeUser !== userId || userId === null) accountGeneration++;
  activeUser = userId;
}
export class OnlineError extends Error {
  constructor(public code: string, message: string, public requestId = '') { super(message); }
}
export async function request<T>(path: string, userId?: string, body?: unknown, method = 'GET', signal?: AbortSignal): Promise<T> {
  const generation = accountGeneration;
  if (userId && userId !== activeUser) throw new OnlineError('account_changed', 'Your account changed. Reload your workspace.');
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      method, credentials: 'same-origin', cache: 'no-store', signal,
      headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(userId ? { 'X-Rawi-User': userId } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new OnlineError('network', 'Cannot reach the online API. Check your connection and that npm run dev:backend is running. Your unsent text remains in this page.');
  }
  if (userId && (generation !== accountGeneration || userId !== activeUser)) throw new OnlineError('account_changed', 'Your account changed. Reload your workspace.');
  if (!response.ok) {
    const result = await response.json().catch(() => null) as ApiErrorBody | null;
    if (response.status === 401 && userId) window.dispatchEvent(new Event('rawi-account-invalid'));
    throw new OnlineError(result?.error?.code ?? 'unavailable', result?.error?.message ?? 'The online request failed. Your unsent text remains in this page.', result?.error?.requestId);
  }
  const result = await response.json() as T;
  if (userId && (generation !== accountGeneration || userId !== activeUser)) throw new OnlineError('account_changed', 'Your account changed. Reload your workspace.');
  return result;
}
export function errorMessage(error: unknown) { return error instanceof Error ? error.message : 'The request could not be completed.'; }
