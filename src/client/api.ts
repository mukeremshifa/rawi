/**
 * Browser client for the Worker API.
 *
 * Every learning action is a server round-trip. The browser holds no copy of
 * the rules and never decides correctness, assistance or evidence - it renders
 * whatever SessionView the server returns.
 */
import type { SessionView, Stage } from '../shared/types.js';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request(path: string, init?: RequestInit): Promise<SessionView> {
  let response: Response;
  try {
    response = await fetch(path, {
      ...init,
      headers: { 'content-type': 'application/json', ...init?.headers },
    });
  } catch {
    throw new ApiError('network', 0, 'network');
  }

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    throw new ApiError(body.error ?? 'request_failed', response.status, body.error);
  }

  return (await response.json()) as SessionView;
}

export function startSession(): Promise<SessionView> {
  return request('/api/sessions', { method: 'POST' });
}

export function loadSession(sessionId: string): Promise<SessionView> {
  return request(`/api/sessions/${encodeURIComponent(sessionId)}`);
}

export function setStage(sessionId: string, stage: Stage): Promise<SessionView> {
  return request(`/api/sessions/${encodeURIComponent(sessionId)}/stage`, {
    method: 'POST',
    body: JSON.stringify({ stage }),
  });
}

export function requestHint(
  sessionId: string,
  stage: Stage,
): Promise<SessionView> {
  return request(`/api/sessions/${encodeURIComponent(sessionId)}/hint`, {
    method: 'POST',
    body: JSON.stringify({ stage }),
  });
}

export function revealAnswer(
  sessionId: string,
  stage: Stage,
): Promise<SessionView> {
  return request(`/api/sessions/${encodeURIComponent(sessionId)}/reveal`, {
    method: 'POST',
    body: JSON.stringify({ stage }),
  });
}

export function submitAttempt(
  sessionId: string,
  stage: Stage,
  optionId: string,
  explanation?: string,
): Promise<SessionView> {
  return request(`/api/sessions/${encodeURIComponent(sessionId)}/attempt`, {
    method: 'POST',
    body: JSON.stringify({ stage, optionId, explanation }),
  });
}
