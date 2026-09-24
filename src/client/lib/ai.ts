import { useCallback, useEffect, useState } from 'react';

import type {
  AiErrorBody,
  AiErrorCode,
  AiStatus,
  GenerateRequest,
  GenerateResponse,
  GradeRequest,
  GradeResponse,
  TutorRequest,
  TutorStreamEvent,
} from '@shared/ai.ts';

/**
 * The browser's side of the local AI server. Every call goes to the dev
 * origin and is proxied to loopback, so the page never holds a credential or
 * knows which Google project is behind it.
 */

export class AiRequestError extends Error {
  constructor(
    readonly code: AiErrorCode,
    message: string,
  ) {
    super(message);
  }
}

const UNREACHABLE =
  'The Rawi API is not running. Start the app with npm run dev, which runs the API alongside the page.';

async function failure(response: Response): Promise<AiRequestError> {
  try {
    const body = (await response.json()) as AiErrorBody;
    if (body?.error?.message) return new AiRequestError(body.error.code, body.error.message);
  } catch {
    /* fall through */
  }
  if (response.status === 502 || response.status === 504) {
    return new AiRequestError('unreachable', UNREACHABLE);
  }
  return new AiRequestError('upstream', `The Rawi API answered ${response.status}.`);
}

async function post<T>(url: string, body: unknown, signal?: AbortSignal): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      ...(signal ? { signal } : {}),
    });
  } catch (error) {
    if (signal?.aborted) throw new AiRequestError('cancelled', 'Cancelled.');
    throw new AiRequestError('unreachable', UNREACHABLE);
  }
  if (!response.ok) throw await failure(response);
  return (await response.json()) as T;
}

export async function fetchAiStatus(): Promise<AiStatus> {
  let response: Response;
  try {
    response = await fetch('/api/ai/status');
  } catch {
    throw new AiRequestError('unreachable', UNREACHABLE);
  }
  if (!response.ok) throw await failure(response);
  return (await response.json()) as AiStatus;
}

export function generateQuestions(body: GenerateRequest, signal?: AbortSignal) {
  return post<GenerateResponse>('/api/ai/generate', body, signal);
}

export function gradeWritten(body: GradeRequest, signal?: AbortSignal) {
  return post<GradeResponse>('/api/ai/grade', body, signal);
}

/**
 * Streams a tutor reply. `onDelta` receives text as it arrives, and the
 * promise resolves with the final, validated event. A cancel or a failure
 * rejects with `AiRequestError`, and whatever text had arrived is still in the
 * caller's hands through `onDelta`.
 */
export async function streamTutor(
  body: TutorRequest,
  onDelta: (text: string) => void,
  signal: AbortSignal,
): Promise<Extract<TutorStreamEvent, { type: 'done' }>> {
  let response: Response;
  try {
    response = await fetch('/api/ai/tutor', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    });
  } catch {
    if (signal.aborted) throw new AiRequestError('cancelled', 'Cancelled.');
    throw new AiRequestError('unreachable', UNREACHABLE);
  }
  if (!response.ok || !response.body) throw await failure(response);

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let newline = buffer.indexOf('\n');
      while (newline >= 0) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        newline = buffer.indexOf('\n');
        if (!line) continue;
        const event = JSON.parse(line) as TutorStreamEvent;
        if (event.type === 'delta') onDelta(event.text);
        else if (event.type === 'done') return event;
        else throw new AiRequestError(event.code, event.message);
      }
    }
  } catch (error) {
    if (error instanceof AiRequestError) throw error;
    if (signal.aborted) throw new AiRequestError('cancelled', 'Cancelled.');
    throw new AiRequestError('upstream', 'The connection to the Rawi API was lost.');
  }
  if (signal.aborted) throw new AiRequestError('cancelled', 'Cancelled.');
  throw new AiRequestError('upstream', 'The reply ended before it was complete.');
}

/** The AI server's configuration and budget, fetched on demand. */
export function useAiStatus() {
  const [status, setStatus] = useState<AiStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    fetchAiStatus()
      .then((s) => {
        setStatus(s);
        setError(null);
      })
      .catch((e: AiRequestError) => setError(e.message));
  }, []);

  useEffect(refresh, [refresh]);

  const unavailable = error ?? (status && !status.configured ? status.missing.join(' ') : null);
  return { status, unavailable, refresh };
}

/** Text shown while a tutor reply streams: the trailer is never displayed. */
export function visibleTutorText(raw: string): string {
  const at = raw.indexOf('@@');
  return at >= 0 ? raw.slice(0, at) : raw;
}
