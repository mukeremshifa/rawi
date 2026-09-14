/**
 * Browser client for the Worker API.
 *
 * Every learning action is a server round-trip. The browser holds no copy of
 * the rules and never decides correctness, assistance or evidence - it renders
 * whatever SessionView the server returns.
 *
 * R03: adds loadMe(), listSessions(), and passes the Authorization header
 * when a Supabase access token is stored in sessionStorage.
 */
import type {
  CourseOverview,
  LearnerSourceSummary,
  MeResponse,
  PrivacyInfo,
  SessionSummary,
  SessionView,
  Stage,
  TutorReply,
} from '../shared/types.js';
import { getAccessToken } from './auth.js';

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

async function authHeaders(): Promise<Record<string, string>> {
  const token = await getAccessToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request(path: string, init?: RequestInit): Promise<SessionView> {
  let response: Response;
  try {
    response = await fetch(path, {
      ...init,
      headers: {
        'content-type': 'application/json',
        ...(await authHeaders()),
        ...init?.headers,
      },
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

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      ...init,
      headers: {
        'content-type': 'application/json',
        ...(await authHeaders()),
        ...init?.headers,
      },
    });
  } catch {
    throw new ApiError('network', 0, 'network');
  }

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    throw new ApiError(body.error ?? 'request_failed', response.status, body.error);
  }

  return (await response.json()) as T;
}

/** Fetch the authenticated user's info. Throws ApiError(401) when not signed in. */
export function loadMe(): Promise<MeResponse> {
  return requestJson<MeResponse>('/api/me');
}

/** Fetch session summaries for the resume UI. */
export function listSessions(): Promise<{ sessions: SessionSummary[] }> {
  return requestJson<{ sessions: SessionSummary[] }>('/api/sessions');
}

export function loadCourse(): Promise<CourseOverview> {
  return requestJson<CourseOverview>('/api/course');
}

export function loadPrivacy(): Promise<PrivacyInfo> {
  return requestJson<PrivacyInfo>('/api/privacy');
}

export function startSession(): Promise<SessionView> {
  return request('/api/sessions', { method: 'POST' });
}

export function loadSession(sessionId: string): Promise<SessionView> {
  return request(`/api/sessions/${encodeURIComponent(sessionId)}`);
}

export function setStage(
  sessionId: string,
  stage: Stage,
  /** R03: current stage on the client. If provided, the server rejects stale navigation. */
  expectedStage?: Stage,
): Promise<SessionView> {
  return request(`/api/sessions/${encodeURIComponent(sessionId)}/stage`, {
    method: 'POST',
    body: JSON.stringify({ stage, expectedStage }),
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
  itemId?: string,
): Promise<SessionView> {
  return request(`/api/sessions/${encodeURIComponent(sessionId)}/attempt`, {
    method: 'POST',
    body: JSON.stringify({ stage, optionId, explanation, itemId }),
  });
}

export function requestHintWithItem(
  sessionId: string,
  stage: Stage,
  itemId?: string,
): Promise<SessionView> {
  return request(`/api/sessions/${encodeURIComponent(sessionId)}/hint`, {
    method: 'POST',
    body: JSON.stringify({ stage, itemId }),
  });
}

export function revealAnswerWithItem(
  sessionId: string,
  stage: Stage,
  itemId?: string,
): Promise<SessionView> {
  return request(`/api/sessions/${encodeURIComponent(sessionId)}/reveal`, {
    method: 'POST',
    body: JSON.stringify({ stage, itemId }),
  });
}

/**
 * Convert the active check item to help/practice.
 * itemId must match the server's active check item; stale requests get 409.
 */
export function convertCheck(
  sessionId: string,
  itemId: string,
): Promise<SessionView> {
  return request(`/api/sessions/${encodeURIComponent(sessionId)}/convert`, {
    method: 'POST',
    body: JSON.stringify({ itemId }),
  });
}

export function startReview(sessionId: string, testNow?: string): Promise<SessionView> {
  return request(`/api/sessions/${encodeURIComponent(sessionId)}/review`, {
    method: 'POST',
    headers: testNow ? { 'X-Rawi-Test-Now': testNow } : undefined,
  });
}

export function askTutor(
  sessionId: string,
  message: string,
  idempotencyKey: string,
): Promise<TutorReply> {
  return requestJson<TutorReply>('/api/tutor', {
    method: 'POST',
    body: JSON.stringify({ sessionId, message, idempotencyKey }),
  });
}

export function listSources(): Promise<{ sources: LearnerSourceSummary[] }> {
  return requestJson<{ sources: LearnerSourceSummary[] }>('/api/sources');
}

export function addPastedSource(
  title: string,
  text: string,
): Promise<{ source: LearnerSourceSummary; duplicate: boolean }> {
  return requestJson('/api/sources/pasted-text', {
    method: 'POST',
    body: JSON.stringify({ title, text, permissionAcknowledged: true }),
  });
}

export function deleteSource(id: string): Promise<{ deleted: true }> {
  return requestJson(`/api/sources/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export function reportIssue(
  category: 'content' | 'technical' | 'privacy' | 'other',
  description: string,
  sessionId?: string,
): Promise<{ id: string }> {
  return requestJson('/api/issues', {
    method: 'POST',
    body: JSON.stringify({ category, description, sessionId }),
  });
}

export function exportAccount(): Promise<Record<string, unknown>> {
  return requestJson('/api/account/export');
}

export function deleteAccount(): Promise<{ deleted: true }> {
  return requestJson('/api/account', {
    method: 'DELETE',
    body: JSON.stringify({ confirmation: 'DELETE' }),
  });
}
