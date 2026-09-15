import {
  ApiClientError,
  ApiErrorBody,
  type AddSourceInput,
  type AdvanceStageInput,
  type ApiClient,
  type AskInput,
  type CreateWorkspaceInput,
  type PageRequest,
  type SessionCommandInput,
  type SubmitResponseInput,
  type UpdateWorkspaceInput,
  type UploadRequest,
} from '@shared/contract.ts';

/**
 * The real implementation of the same interface the fake implements.
 *
 * ── One transport function, and every method is three lines ───────────────
 *
 * Everything below is a URL and a body. That is the payoff of the contract
 * being an interface of named methods: the mapping from method to route is
 * mechanical and visible in one file, and if this file and the Worker's route
 * table ever disagree, `scripts/check-routes.mjs` says so on the commit that
 * caused it rather than at runtime.
 *
 * ── The token ─────────────────────────────────────────────────────────────
 *
 * Supplied by a getter rather than captured, because a Supabase session
 * refreshes and a captured token expires mid-session. The getter is passed in
 * so this module does not import the auth provider and become impossible to
 * test without one.
 */

export interface ClientOptions {
  /** Returns the current access token, or null when signed out. */
  getToken: () => Promise<string | null>;
  /** Overridable for tests. In production the Worker is the same origin. */
  baseUrl?: string;
}

async function request<T>(
  options: ClientOptions,
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const token = await options.getToken();

  let response: Response;
  try {
    response = await fetch(`${options.baseUrl ?? ''}${path}`, {
      method,
      headers: {
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  } catch {
    // A fetch that throws did not reach the server, which is a different fact
    // from a server that answered with an error — and the retry advice differs.
    throw new ApiClientError('network', 'The request did not reach the server. Try again.');
  }

  if (response.status === 204) return undefined as T;

  if (!response.ok) {
    const parsed = ApiErrorBody.safeParse(await response.json().catch(() => null));
    if (parsed.success) {
      throw new ApiClientError(
        parsed.data.code,
        parsed.data.message,
        parsed.data.issues,
        response.status,
      );
    }
    throw new ApiClientError(
      'internal',
      `The server returned ${response.status}.`,
      undefined,
      response.status,
    );
  }

  return (await response.json()) as T;
}

function query(page?: PageRequest): string {
  if (!page) return '';
  const params = new URLSearchParams();
  if (page.cursor) params.set('cursor', page.cursor);
  if (page.limit) params.set('limit', String(page.limit));
  const serialised = params.toString();
  return serialised ? `?${serialised}` : '';
}

export function createClient(options: ClientOptions): ApiClient {
  const get = <T>(path: string) => request<T>(options, 'GET', path);
  const post = <T>(path: string, body?: unknown) =>
    request<T>(options, 'POST', path, body ?? {});
  const patch = <T>(path: string, body: unknown) => request<T>(options, 'PATCH', path, body);
  const remove = (path: string) => request<void>(options, 'DELETE', path);

  const ws = (workspaceId: string) => `/api/workspaces/${encodeURIComponent(workspaceId)}`;

  return {
    getProfile: (timezone) =>
      get(`/api/profile?tz=${encodeURIComponent(timezone)}`),
    getQuota: () => get('/api/quota'),

    listWorkspaces: (page) => get(`/api/workspaces${query(page)}`),
    getWorkspace: (workspaceId) => get(ws(workspaceId)),
    createWorkspace: (input: CreateWorkspaceInput) => post('/api/workspaces', input),
    updateWorkspace: (workspaceId, input: UpdateWorkspaceInput) =>
      patch(ws(workspaceId), input),
    deleteWorkspace: (workspaceId) => remove(ws(workspaceId)),

    listSources: (workspaceId, page) => get(`${ws(workspaceId)}/sources${query(page)}`),
    getSource: (workspaceId, sourceId) =>
      get(`${ws(workspaceId)}/sources/${encodeURIComponent(sourceId)}`),
    getSourceChunks: (workspaceId, sourceId, page) =>
      get(`${ws(workspaceId)}/sources/${encodeURIComponent(sourceId)}/chunks${query(page)}`),
    requestUpload: (workspaceId, input: UploadRequest) =>
      post(`${ws(workspaceId)}/uploads`, input),
    addSource: (workspaceId, input: AddSourceInput) =>
      post(`${ws(workspaceId)}/sources`, input),
    deleteSource: (workspaceId, sourceId) =>
      remove(`${ws(workspaceId)}/sources/${encodeURIComponent(sourceId)}`),

    listConcepts: (workspaceId) => get(`${ws(workspaceId)}/concepts`),
    getConcept: (workspaceId, conceptId) =>
      get(`${ws(workspaceId)}/concepts/${encodeURIComponent(conceptId)}`),
    extractConcepts: (workspaceId) => post(`${ws(workspaceId)}/concepts/extract`),
    getConceptReadiness: (workspaceId, conceptId) =>
      get(`${ws(workspaceId)}/concepts/${encodeURIComponent(conceptId)}/readiness`),

    startSession: (workspaceId, conceptId) =>
      post(`${ws(workspaceId)}/concepts/${encodeURIComponent(conceptId)}/session`),
    getSession: (workspaceId, sessionId) =>
      get(`${ws(workspaceId)}/sessions/${encodeURIComponent(sessionId)}`),
    advanceStage: (workspaceId, sessionId, input: AdvanceStageInput) =>
      post(`${ws(workspaceId)}/sessions/${encodeURIComponent(sessionId)}/stage`, input),
    requestHint: (workspaceId, sessionId, input: SessionCommandInput) =>
      post(`${ws(workspaceId)}/sessions/${encodeURIComponent(sessionId)}/hint`, input),
    revealAnswer: (workspaceId, sessionId, input: SessionCommandInput) =>
      post(`${ws(workspaceId)}/sessions/${encodeURIComponent(sessionId)}/reveal`, input),
    submitResponse: (workspaceId, sessionId, input: SubmitResponseInput) =>
      post(`${ws(workspaceId)}/sessions/${encodeURIComponent(sessionId)}/response`, input),
    endSession: (workspaceId, sessionId) =>
      post(`${ws(workspaceId)}/sessions/${encodeURIComponent(sessionId)}/end`),

    ask: (workspaceId, input: AskInput) => post(`${ws(workspaceId)}/ask`, input),

    listDueReviews: (workspaceId) => get(`${ws(workspaceId)}/reviews`),
    startReview: (workspaceId, conceptId) =>
      post(`${ws(workspaceId)}/concepts/${encodeURIComponent(conceptId)}/review`),

    getConceptEvidence: (workspaceId, conceptId) =>
      get(`${ws(workspaceId)}/concepts/${encodeURIComponent(conceptId)}/evidence`),
    getEvidenceSummary: (workspaceId) => get(`${ws(workspaceId)}/evidence`),

    getStudyPlan: (workspaceId) => get(`${ws(workspaceId)}/plan`),

    getJob: (workspaceId, jobId) =>
      get(`${ws(workspaceId)}/jobs/${encodeURIComponent(jobId)}`),
    listJobs: (workspaceId) => get(`${ws(workspaceId)}/jobs`),
  };
}
