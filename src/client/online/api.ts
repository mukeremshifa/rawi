import { createAuthClient } from 'better-auth/react';
import type { ApiErrorBody } from '@shared/online';
import { cachedRead, cacheRead, isDisconnected, setDisconnected, lockDevice } from '@/offline/storage';

export const authClient = createAuthClient({ baseURL: window.location.origin });
let activeUser: string | null = null;
let accountGeneration = 0;
let accountController = new AbortController();
export function setActiveAccount(userId: string | null) {
  if (activeUser !== userId || userId === null) { accountGeneration++; accountController.abort(); accountController = new AbortController(); }
  activeUser = userId;
}
export class OnlineError extends Error {
  constructor(public code: string, message: string, public requestId = '') { super(message); }
}
export async function request<T>(path: string, userId?: string, body?: unknown, method = 'GET', signal?: AbortSignal): Promise<T> {
  const generation = accountGeneration;
  if (userId && userId !== activeUser) throw new OnlineError('account_changed', 'Your account changed. Reload your workspace.');
  if (userId && method !== 'GET' && (isDisconnected() || !navigator.onLine)) throw new OnlineError('offline', 'This action needs a connection. Your draft has not been submitted. Reconnect and save explicitly.');
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      method, credentials: 'same-origin', cache: 'no-store', signal: userId ? AbortSignal.any([accountController.signal, ...(signal ? [signal] : [])]) : signal,
      headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(userId ? { 'X-Rawi-User': userId } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  } catch (error) {
    if (signal?.aborted || generation !== accountGeneration) throw error;
    setDisconnected(true);
    if (userId && method === 'GET') {
      const cached = await cachedRead<T>(path, userId).catch(() => undefined);
      if (cached !== undefined && generation === accountGeneration && userId === activeUser) return cached;
    }
    throw new OnlineError('network', 'This content needs a connection and is not available on this device. Open cached courses or reconnect. Unsent work has not been submitted.');
  }
  if (userId && (generation !== accountGeneration || userId !== activeUser)) throw new OnlineError('account_changed', 'Your account changed. Reload your workspace.');
  if (!response.ok) {
    const result = await response.json().catch(() => null) as ApiErrorBody | null;
    if (response.status === 401 && userId) { lockDevice(); window.dispatchEvent(new Event('rawi-account-invalid')); }
    throw new OnlineError(result?.error?.code ?? 'unavailable', result?.error?.message ?? 'The online request failed. Your unsent text remains in this page.', result?.error?.requestId);
  }
  const result = await response.json() as T;
  if (userId && (generation !== accountGeneration || userId !== activeUser)) throw new OnlineError('account_changed', 'Your account changed. Reload your workspace.');
  if (userId && method === 'GET') await cacheRead(path, userId, result).catch(() => { window.dispatchEvent(new Event('rawi-cache-failed')); });
  return result;
}
export function errorMessage(error: unknown) { return error instanceof Error ? error.message : 'The request could not be completed.'; }
