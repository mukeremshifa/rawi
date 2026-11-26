import { createAuthClient } from 'better-auth/react';
import type { ApiErrorBody } from '@shared/contracts/workspace';

export const authClient = createAuthClient({ baseURL: window.location.origin });
let activeUser: string | null = null;
let accountGeneration = 0;
let accountController = new AbortController();
export function setActiveAccount(userId: string | null) {
  if (activeUser !== userId || userId === null) {
    accountGeneration++;
    accountController.abort();
    accountController = new AbortController();
  }
  activeUser = userId;
}
export class RequestError extends Error {
  constructor(
    public code: string,
    message: string,
    public requestId = '',
  ) {
    super(message);
  }
}
export async function request<T>(
  path: string,
  userId?: string,
  body?: unknown,
  method = 'GET',
  signal?: AbortSignal,
): Promise<T> {
  const generation = accountGeneration;
  if (userId && userId !== activeUser)
    throw new RequestError('account_changed', 'Your account changed. Reload your workspace.');
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      method,
      credentials: 'same-origin',
      cache: 'no-store',
      signal: userId ? AbortSignal.any([accountController.signal, ...(signal ? [signal] : [])]) : signal,
      headers: {
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(userId ? { 'X-Rawi-User': userId } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  } catch (error) {
    if (signal?.aborted || generation !== accountGeneration) throw error;
    throw new RequestError(
      'network',
      'Could not connect. Keep this page open and retry. Unsent changes have not been saved.',
    );
  }
  if (signal?.aborted) throw new DOMException('Request cancelled', 'AbortError');
  if ((userId || path === '/v1/me') && (generation !== accountGeneration || (userId && userId !== activeUser)))
    throw new RequestError('account_changed', 'Your account changed. Reload your workspace.');
  if (!response.ok) {
    const result = (await response.json().catch(() => null)) as ApiErrorBody | null;
    if ((response.status === 401 || result?.error?.code === 'account_changed') && (userId || path === '/v1/me')) {
      setActiveAccount(null);
      window.dispatchEvent(new Event('rawi-account-invalid'));
    }
    throw new RequestError(
      result?.error?.code ?? 'unavailable',
      result?.error?.message ?? 'The request failed. Your unsent text remains on this page.',
      result?.error?.requestId,
    );
  }
  const result = (await response.json()) as T;
  if (signal?.aborted) throw new DOMException('Request cancelled', 'AbortError');
  if ((userId || path === '/v1/me') && (generation !== accountGeneration || (userId && userId !== activeUser)))
    throw new RequestError('account_changed', 'Your account changed. Reload your workspace.');
  return result;
}
export function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'The request could not be completed.';
}
/**
 * POST and read a newline-delimited JSON stream, one event at a time. Used for tutor replies,
 * which arrive as they are written. Errors before the stream opens throw like `request`.
 */
export async function streamEvents<E>(
  path: string,
  userId: string,
  body: unknown,
  onEvent: (event: E) => void,
  signal?: AbortSignal,
): Promise<void> {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      signal: AbortSignal.any([accountController.signal, ...(signal ? [signal] : [])]),
      headers: { 'Content-Type': 'application/json', 'X-Rawi-User': userId },
      body: JSON.stringify(body),
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new RequestError(
      'network',
      'Could not connect. The reply is still being written and will appear when you reload.',
    );
  }
  if (!response.ok || !response.body) {
    const result = (await response.json().catch(() => null)) as ApiErrorBody | null;
    throw new RequestError(
      result?.error?.code ?? 'unavailable',
      result?.error?.message ?? 'The reply could not start.',
      result?.error?.requestId,
    );
  }
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = '';
  for (;;) {
    const { done, value } = await reader.read();
    buffer += value ?? '';
    let at: number;
    while ((at = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, at).trim();
      buffer = buffer.slice(at + 1);
      if (line) onEvent(JSON.parse(line) as E);
    }
    if (done) return;
  }
}
