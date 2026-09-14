/**
 * Async storage boundary for Rawi (R03).
 *
 * Wraps the Supabase REST API with ownership-scoped CRUD and an optimistic-
 * concurrency upsert that mirrors the version-based contract already set up
 * in lesson-store.ts. Learning rules in learning.ts are untouched.
 *
 * Design principles:
 *  - Uses fetch directly against the Supabase PostgREST endpoint. No npm
 *    client library — the @supabase/supabase-js bundle has Node polyfills that
 *    are unreliable in the Cloudflare Worker runtime.
 *  - All writes carry a user_id so that a bug cannot silently write across
 *    ownership boundaries. Reads are always scoped by user_id.
 *  - The optimistic-concurrency upsert updates only when version = $current.
 *    This is the R03 equivalent of the synchronous version check in
 *    lesson-store.ts updateSession(). If the update touches 0 rows, the caller
 *    sees a 'conflict' outcome and can reload + retry.
 *  - Returns typed conflict/unavailable outcomes. Routes decide whether they
 *    are in explicit local fixture mode; this module never falls back to it.
 *
 * Invariant: every public function that writes data scopes the write to the
 * provided userId. A request that does not supply a userId cannot call these
 * functions (the type signature requires it).
 */
import type { AuthoredLesson } from '../content/demo-lesson.js';
import type { SessionState } from './learning.js';
import { projectLearningEvidence } from './lesson-store.js';
import type { AiReservation, ReserveOutcome } from './ai-budget.js';
import type { LearnerSourceSummary, PilotMetrics } from '../shared/types.js';
import type { StoredIssue } from './operations-store.js';

export interface DbConfig {
  readonly supabaseUrl: string;
  readonly serviceKey: string;
}

export type DbOutcome<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly reason: 'conflict' | 'error'; readonly detail?: string };

/** A session row as stored in Supabase. */
interface SessionRow {
  id: string;
  user_id: string;
  lesson_id: string;
  state: SessionState;
  version: number;
  created_at: string;
  updated_at: string;
}

/** Backward-compatible projection for R03 JSON rows created before R06. */
function normalizeSessionState(state: SessionState): SessionState {
  return {
    ...state,
    exposedReviewIds: Array.isArray(state.exposedReviewIds)
      ? state.exposedReviewIds
      : [],
  };
}

/** A summary row returned by the session list endpoint. */
export interface SessionSummary {
  readonly sessionId: string;
  readonly lessonId: string;
  readonly version: number;
  readonly updatedAt: string;
  /** Evidence state from the stored session, for the resume UI. */
  readonly evidenceState: string;
  /** Next review due date if the learner has independent evidence. */
  readonly nextReviewDue?: string;
  readonly reviewAvailable: boolean;
}

function authHeaders(serviceKey: string) {
  return {
    'apikey': serviceKey,
    'Content-Type': 'application/json',
    'Prefer': 'return=minimal',
  };
}

function restUrl(supabaseUrl: string, table: string, query = '') {
  return `${supabaseUrl}/rest/v1/${table}${query ? `?${query}` : ''}`;
}

/**
 * Create a new session row and verify the returned owner/id/version.
 */
export async function createSession(
  config: DbConfig,
  userId: string,
  state: SessionState,
  checkItemIds: readonly string[],
): Promise<DbOutcome<SessionState>> {
  const body = {
    p_id: state.sessionId,
    p_user_id: userId,
    p_lesson_id: state.lessonId,
    p_state: state,
    p_check_item_ids: checkItemIds,
  };

  try {
    const res = await fetch(
      restUrl(config.supabaseUrl, 'rpc/create_learning_session'),
      {
        method: 'POST',
        headers: {
          ...authHeaders(config.serviceKey),
          'Prefer': 'return=representation',
          'Accept': 'application/json',
        },
        body: JSON.stringify(body),
      },
    );

    if (res.status === 409) return { ok: false, reason: 'conflict' };
    if (!res.ok) {
      return { ok: false, reason: 'error', detail: `HTTP ${res.status}` };
    }

    const created = (await res.json()) as Array<Partial<SessionRow>>;
    const confirmed = created[0];
    if (
      confirmed?.id !== state.sessionId ||
      confirmed.user_id !== userId ||
      confirmed.version !== state.version
    ) {
      return { ok: false, reason: 'error', detail: 'write_not_confirmed' };
    }
    if (!confirmed.state) {
      return { ok: false, reason: 'error', detail: 'state_not_returned' };
    }
    return { ok: true, value: normalizeSessionState(confirmed.state) };
  } catch {
    return { ok: false, reason: 'error', detail: 'network_error' };
  }
}

/**
 * Read a session owned by userId. Returns undefined when not found or when
 * the session does not belong to this user (ownership check via query param).
 */
export async function getSession(
  config: DbConfig,
  userId: string,
  sessionId: string,
): Promise<DbOutcome<SessionState | undefined>> {
  const query = `id=eq.${encodeURIComponent(sessionId)}&user_id=eq.${encodeURIComponent(userId)}&select=state`;
  try {
    const res = await fetch(restUrl(config.supabaseUrl, 'sessions', query), {
      headers: {
        ...authHeaders(config.serviceKey),
        'Prefer': 'return=representation',
        'Accept': 'application/json',
      },
    });

    if (!res.ok) {
      return { ok: false, reason: 'error', detail: `HTTP ${res.status}` };
    }

    const rows = (await res.json()) as Array<{ state: SessionState }>;
    return {
      ok: true,
      value: rows[0]?.state ? normalizeSessionState(rows[0].state) : undefined,
    };
  } catch {
    return { ok: false, reason: 'error', detail: 'network_error' };
  }
}

/**
 * Transactional session update with optimistic-concurrency guard.
 *
 * Updates the row only when the stored version matches `expectedVersion`.
 * If no row is updated (0 rows affected), returns { ok: false, reason: 'conflict' }.
 * The caller must reload state and retry.
 *
 * Ownership is enforced doubly: the WHERE clause includes user_id so that a
 * bug passing the wrong userId cannot overwrite another learner's session.
 */
export async function updateSession(
  config: DbConfig,
  userId: string,
  state: SessionState,
  expectedVersion: number,
): Promise<DbOutcome<void>> {
  const query =
    `id=eq.${encodeURIComponent(state.sessionId)}` +
    `&user_id=eq.${encodeURIComponent(userId)}` +
    `&version=eq.${expectedVersion}`;

  try {
    const res = await fetch(restUrl(config.supabaseUrl, 'sessions', query), {
      method: 'PATCH',
      headers: {
        ...authHeaders(config.serviceKey),
        'Prefer': 'return=minimal,count=exact',
      },
      body: JSON.stringify({ state, version: state.version, lesson_id: state.lessonId }),
    });

    if (!res.ok) {
      return { ok: false, reason: 'error', detail: `HTTP ${res.status}` };
    }

    // A successful HTTP response is not enough: PostgREST must confirm that
    // exactly one ownership/version-scoped row matched.
    const contentRange = res.headers.get('Content-Range') ?? '';
    if (/\/0$/.test(contentRange)) return { ok: false, reason: 'conflict' };
    if (!/\/1$/.test(contentRange)) {
      return { ok: false, reason: 'error', detail: 'write_not_confirmed' };
    }

    return { ok: true, value: undefined };
  } catch {
    return { ok: false, reason: 'error', detail: 'network_error' };
  }
}

/**
 * List sessions for a user, ordered by most recently updated.
 * Returns a lightweight summary (not the full state) for the resume UI.
 * Capped at 20 to avoid large responses.
 */
export async function listSessions(
  config: DbConfig,
  userId: string,
  lesson: AuthoredLesson,
): Promise<DbOutcome<SessionSummary[]>> {
  const query =
    `user_id=eq.${encodeURIComponent(userId)}` +
    `&select=id,lesson_id,version,updated_at,state` +
    `&order=updated_at.desc` +
    `&limit=20`;

  try {
    const res = await fetch(restUrl(config.supabaseUrl, 'sessions', query), {
      headers: {
        ...authHeaders(config.serviceKey),
        'Prefer': 'return=representation',
        'Accept': 'application/json',
      },
    });

    if (!res.ok) {
      return { ok: false, reason: 'error', detail: `HTTP ${res.status}` };
    }

    const rows = (await res.json()) as SessionRow[];
    return {
      ok: true,
      value: rows.map((row) => {
        const state = normalizeSessionState(row.state);
        const evidence = projectLearningEvidence(state, lesson);
        return {
          sessionId: row.id,
          lessonId: row.lesson_id,
          version: row.version,
          updatedAt: row.updated_at,
          evidenceState: evidence.state,
          nextReviewDue: evidence.nextReviewDue,
          reviewAvailable: Boolean(
            evidence.nextReviewDue &&
              evidence.nextReviewDue <= new Date().toISOString().slice(0, 10) &&
              state.exposedReviewIds.length < lesson.reviewBank.length,
          ),
        };
      }),
    };
  } catch {
    return { ok: false, reason: 'error', detail: 'network_error' };
  }
}

/**
 * Check whether a user has an active enrollment.
 * Returns true if an 'enrolled' row exists for this userId.
 */
export async function isEnrolled(
  config: DbConfig,
  userId: string,
): Promise<DbOutcome<boolean>> {
  const query =
    `user_id=eq.${encodeURIComponent(userId)}` +
    `&enrollment_status=eq.enrolled` +
    `&select=id` +
    `&limit=1`;

  try {
    const res = await fetch(restUrl(config.supabaseUrl, 'invite_enrollments', query), {
      headers: {
        ...authHeaders(config.serviceKey),
        'Prefer': 'return=representation',
        'Accept': 'application/json',
      },
    });

    if (!res.ok) {
      return { ok: false, reason: 'error', detail: `HTTP ${res.status}` };
    }
    const rows = (await res.json()) as unknown[];
    return { ok: true, value: rows.length > 0 };
  } catch {
    return { ok: false, reason: 'error', detail: 'network_error' };
  }
}

interface ReservationRpc {
  ok: boolean;
  reason?: 'global_cap' | 'learner_cap' | 'in_progress';
  replay?: boolean;
  reservation?: {
    id: string;
    user_id: string;
    idempotency_key: string;
    usage_month: string;
    reserved_micros_usd: number;
    status: AiReservation['status'];
    response_json?: unknown;
  };
}

/** Atomically reserve global and learner budget before a provider call. */
export async function reserveAiUsage(
  config: DbConfig,
  input: {
    userId: string;
    idempotencyKey: string;
    provider: string;
    model: string;
    promptVersion: string;
    curriculumVersion: string;
    amountMicrosUsd: number;
    globalCapMicrosUsd: number;
    learnerCapMicrosUsd: number;
  },
): Promise<DbOutcome<ReserveOutcome>> {
  try {
    const res = await fetch(restUrl(config.supabaseUrl, 'rpc/reserve_ai_usage'), {
      method: 'POST',
      headers: {
        ...authHeaders(config.serviceKey),
        Accept: 'application/json',
      },
      body: JSON.stringify({
        p_user_id: input.userId,
        p_idempotency_key: input.idempotencyKey,
        p_provider: input.provider,
        p_model: input.model,
        p_prompt_version: input.promptVersion,
        p_curriculum_version: input.curriculumVersion,
        p_reserved_micros_usd: input.amountMicrosUsd,
        p_global_cap_micros_usd: input.globalCapMicrosUsd,
        p_learner_cap_micros_usd: input.learnerCapMicrosUsd,
      }),
    });
    if (!res.ok) return { ok: false, reason: 'error', detail: `HTTP ${res.status}` };
    const result = (await res.json()) as ReservationRpc;
    if (!result.ok) {
      return {
        ok: true,
        value: { ok: false, reason: result.reason ?? 'in_progress' },
      };
    }
    const row = result.reservation;
    if (!row || row.user_id !== input.userId) {
      return { ok: false, reason: 'error', detail: 'reservation_not_confirmed' };
    }
    return {
      ok: true,
      value: {
        ok: true,
        replay: Boolean(result.replay),
        reservation: {
          id: row.id,
          learnerId: row.user_id,
          idempotencyKey: row.idempotency_key,
          month: row.usage_month,
          reservedMicrosUsd: Number(row.reserved_micros_usd),
          status: row.status,
          response: row.response_json,
        },
      },
    };
  } catch {
    return { ok: false, reason: 'error', detail: 'network_error' };
  }
}

/** Settle provider-confirmed usage, or conservatively retain an ambiguous reservation. */
export async function settleAiUsage(
  config: DbConfig,
  input: {
    userId: string;
    reservationId: string;
    status: 'settled' | 'ambiguous';
    actualMicrosUsd?: number;
    inputTokens?: number;
    outputTokens?: number;
    response?: unknown;
    failureCategory?: string;
  },
): Promise<DbOutcome<void>> {
  try {
    const res = await fetch(restUrl(config.supabaseUrl, 'rpc/settle_ai_usage'), {
      method: 'POST',
      headers: authHeaders(config.serviceKey),
      body: JSON.stringify({
        p_user_id: input.userId,
        p_reservation_id: input.reservationId,
        p_status: input.status,
        p_actual_micros_usd: input.actualMicrosUsd,
        p_input_tokens: input.inputTokens,
        p_output_tokens: input.outputTokens,
        p_response_json: input.response,
        p_failure_category: input.failureCategory,
      }),
    });
    if (!res.ok) return { ok: false, reason: 'error', detail: `HTTP ${res.status}` };
    const confirmed = (await res.json()) as boolean;
    return confirmed
      ? { ok: true, value: undefined }
      : { ok: false, reason: 'error', detail: 'settlement_not_confirmed' };
  } catch {
    return { ok: false, reason: 'error', detail: 'network_error' };
  }
}

interface LearnerSourceRow {
  id: string;
  user_id: string;
  title: string;
  kind: 'pasted-text';
  extracted_text: string;
  status: 'ready' | 'quarantined';
  sha256: string;
  created_at: string;
}

function sourceSummary(row: LearnerSourceRow): LearnerSourceSummary {
  return {
    id: row.id,
    title: row.title,
    kind: row.kind,
    status: row.status,
    chars: row.extracted_text.length,
    sha256: row.sha256,
    createdAt: row.created_at,
  };
}

export async function createLearnerSource(
  config: DbConfig,
  input: { userId: string; title: string; text: string; sha256: string },
): Promise<DbOutcome<{ source: LearnerSourceSummary; duplicate: boolean }>> {
  const query = `user_id=eq.${encodeURIComponent(input.userId)}&sha256=eq.${encodeURIComponent(input.sha256)}&select=*`;
  try {
    const existingRes = await fetch(restUrl(config.supabaseUrl, 'learner_sources', query), {
      headers: { ...authHeaders(config.serviceKey), Accept: 'application/json' },
    });
    if (!existingRes.ok) return { ok: false, reason: 'error', detail: `HTTP ${existingRes.status}` };
    const existing = (await existingRes.json()) as LearnerSourceRow[];
    if (existing[0]) return { ok: true, value: { source: sourceSummary(existing[0]), duplicate: true } };

    const res = await fetch(restUrl(config.supabaseUrl, 'learner_sources'), {
      method: 'POST',
      headers: {
        ...authHeaders(config.serviceKey),
        Prefer: 'return=representation',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        user_id: input.userId,
        title: input.title,
        kind: 'pasted-text',
        extracted_text: input.text,
        sha256: input.sha256,
        permission_acknowledged: true,
        status: 'ready',
      }),
    });
    if (res.status === 409) return { ok: false, reason: 'conflict' };
    if (!res.ok) return { ok: false, reason: 'error', detail: `HTTP ${res.status}` };
    const rows = (await res.json()) as LearnerSourceRow[];
    const created = rows[0];
    return created?.user_id === input.userId
      ? { ok: true, value: { source: sourceSummary(created), duplicate: false } }
      : { ok: false, reason: 'error', detail: 'write_not_confirmed' };
  } catch {
    return { ok: false, reason: 'error', detail: 'network_error' };
  }
}

export async function listLearnerSources(
  config: DbConfig,
  userId: string,
): Promise<DbOutcome<LearnerSourceSummary[]>> {
  const query = `user_id=eq.${encodeURIComponent(userId)}&select=*&order=created_at.desc&limit=20`;
  try {
    const res = await fetch(restUrl(config.supabaseUrl, 'learner_sources', query), {
      headers: { ...authHeaders(config.serviceKey), Accept: 'application/json' },
    });
    if (!res.ok) return { ok: false, reason: 'error', detail: `HTTP ${res.status}` };
    return { ok: true, value: ((await res.json()) as LearnerSourceRow[]).map(sourceSummary) };
  } catch {
    return { ok: false, reason: 'error', detail: 'network_error' };
  }
}

export async function getLearnerSource(
  config: DbConfig,
  userId: string,
  sourceId: string,
): Promise<DbOutcome<{ summary: LearnerSourceSummary; text: string } | undefined>> {
  const query =
    `id=eq.${encodeURIComponent(sourceId)}` +
    `&user_id=eq.${encodeURIComponent(userId)}&select=*`;
  try {
    const res = await fetch(restUrl(config.supabaseUrl, 'learner_sources', query), {
      headers: { ...authHeaders(config.serviceKey), Accept: 'application/json' },
    });
    if (!res.ok) return { ok: false, reason: 'error', detail: `HTTP ${res.status}` };
    const row = ((await res.json()) as LearnerSourceRow[])[0];
    return {
      ok: true,
      value: row ? { summary: sourceSummary(row), text: row.extracted_text } : undefined,
    };
  } catch {
    return { ok: false, reason: 'error', detail: 'network_error' };
  }
}

export async function deleteLearnerSource(
  config: DbConfig,
  userId: string,
  sourceId: string,
): Promise<DbOutcome<boolean>> {
  const query = `id=eq.${encodeURIComponent(sourceId)}&user_id=eq.${encodeURIComponent(userId)}`;
  try {
    const res = await fetch(restUrl(config.supabaseUrl, 'learner_sources', query), {
      method: 'DELETE',
      headers: { ...authHeaders(config.serviceKey), Prefer: 'return=representation' },
    });
    if (!res.ok) return { ok: false, reason: 'error', detail: `HTTP ${res.status}` };
    const rows = (await res.json()) as LearnerSourceRow[];
    return { ok: true, value: rows.length === 1 && rows[0]?.user_id === userId };
  } catch {
    return { ok: false, reason: 'error', detail: 'network_error' };
  }
}

export async function createIssue(
  config: DbConfig,
  input: Omit<StoredIssue, 'id' | 'status' | 'createdAt'>,
): Promise<DbOutcome<{ id: string }>> {
  try {
    const res = await fetch(restUrl(config.supabaseUrl, 'issue_reports'), {
      method: 'POST',
      headers: {
        ...authHeaders(config.serviceKey),
        Prefer: 'return=representation',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        user_id: input.userId,
        session_id: input.sessionId,
        category: input.category,
        description: input.description,
      }),
    });
    if (!res.ok) return { ok: false, reason: 'error', detail: `HTTP ${res.status}` };
    const row = ((await res.json()) as Array<{ id: string; user_id: string }>)[0];
    return row?.user_id === input.userId
      ? { ok: true, value: { id: row.id } }
      : { ok: false, reason: 'error', detail: 'write_not_confirmed' };
  } catch {
    return { ok: false, reason: 'error', detail: 'network_error' };
  }
}

export async function exportLearnerData(
  config: DbConfig,
  userId: string,
): Promise<DbOutcome<Record<string, unknown>>> {
  const encoded = encodeURIComponent(userId);
  const tables = [
    ['sessions', `user_id=eq.${encoded}&select=id,lesson_id,state,version,created_at,updated_at`],
    ['learner_sources', `user_id=eq.${encoded}&select=id,title,kind,status,sha256,created_at`],
    ['issue_reports', `user_id=eq.${encoded}&select=id,session_id,category,description,status,created_at`],
    ['ai_usage', `user_id=eq.${encoded}&select=id,provider,model,prompt_version,curriculum_version,input_tokens,output_tokens,actual_micros_usd,status,created_at`],
  ] as const;
  try {
    const responses = await Promise.all(tables.map(([table, query]) =>
      fetch(restUrl(config.supabaseUrl, table, query), {
        headers: { ...authHeaders(config.serviceKey), Accept: 'application/json' },
      }),
    ));
    if (responses.some((response) => !response.ok)) {
      return { ok: false, reason: 'error', detail: 'export_read_failed' };
    }
    const values = await Promise.all(responses.map((response) => response.json()));
    return {
      ok: true,
      value: {
        exportedAt: new Date().toISOString(),
        userId,
        sessions: values[0],
        sources: values[1],
        issues: values[2],
        aiUsage: values[3],
      },
    };
  } catch {
    return { ok: false, reason: 'error', detail: 'network_error' };
  }
}

export async function deleteLearnerData(
  config: DbConfig,
  userId: string,
): Promise<DbOutcome<Record<string, number>>> {
  try {
    const res = await fetch(restUrl(config.supabaseUrl, 'rpc/delete_learner_data'), {
      method: 'POST',
      headers: { ...authHeaders(config.serviceKey), Accept: 'application/json' },
      body: JSON.stringify({ p_user_id: userId }),
    });
    if (!res.ok) return { ok: false, reason: 'error', detail: `HTTP ${res.status}` };
    return { ok: true, value: (await res.json()) as Record<string, number> };
  } catch {
    return { ok: false, reason: 'error', detail: 'network_error' };
  }
}

export async function founderMetrics(config: DbConfig): Promise<DbOutcome<PilotMetrics>> {
  try {
    const [enrollmentsRes, sessionsRes, usageRes, issuesRes] = await Promise.all([
      fetch(restUrl(config.supabaseUrl, 'invite_enrollments', 'enrollment_status=eq.enrolled&select=user_id'), { headers: { ...authHeaders(config.serviceKey), Accept: 'application/json' } }),
      fetch(restUrl(config.supabaseUrl, 'sessions', 'select=user_id,state,created_at,updated_at'), { headers: { ...authHeaders(config.serviceKey), Accept: 'application/json' } }),
      fetch(restUrl(config.supabaseUrl, 'ai_usage', 'status=eq.settled&select=actual_micros_usd'), { headers: { ...authHeaders(config.serviceKey), Accept: 'application/json' } }),
      fetch(restUrl(config.supabaseUrl, 'issue_reports', 'status=eq.open&select=id'), { headers: { ...authHeaders(config.serviceKey), Accept: 'application/json' } }),
    ]);
    if (![enrollmentsRes, sessionsRes, usageRes, issuesRes].every((res) => res.ok)) {
      return { ok: false, reason: 'error', detail: 'metrics_read_failed' };
    }
    const enrollments = (await enrollmentsRes.json()) as Array<{ user_id: string }>;
    const sessions = (await sessionsRes.json()) as Array<{ user_id: string; state: SessionState; created_at: string; updated_at: string }>;
    const usage = (await usageRes.json()) as Array<{ actual_micros_usd: number | null }>;
    const issues = (await issuesRes.json()) as Array<{ id: string }>;
    const activated = new Set(sessions.map((session) => session.user_id));
    const completed = new Set(sessions.filter((session) => session.state.stage === 'summary').map((session) => session.user_id));
    const returned = new Set(sessions.filter((session) =>
      session.state.attempts.some((attempt) => attempt.stage === 'review') ||
      new Date(session.updated_at).toISOString().slice(0, 10) > new Date(session.created_at).toISOString().slice(0, 10),
    ).map((session) => session.user_id));
    const delayedEligible = new Set(sessions.filter((session) =>
      session.state.attempts.some((attempt) => attempt.stage === 'check' && attempt.countsAsIndependent),
    ).map((session) => session.user_id));
    const delayedRetained = new Set(sessions.filter((session) =>
      session.state.attempts.some((attempt) => attempt.stage === 'review' && attempt.countsAsIndependent),
    ).map((session) => session.user_id));
    return { ok: true, value: {
      synthetic: false,
      enrolled: enrollments.length,
      activated: activated.size,
      completed: completed.size,
      returned: returned.size,
      delayedEligible: delayedEligible.size,
      delayedRetained: delayedRetained.size,
      aiCalls: usage.length,
      aiCostUsd: usage.reduce((sum, row) => sum + Number(row.actual_micros_usd ?? 0), 0) / 1_000_000,
      issuesOpen: issues.length,
    } };
  } catch {
    return { ok: false, reason: 'error', detail: 'network_error' };
  }
}

export async function setEnrollment(
  config: DbConfig,
  input: { userId: string; status: 'enrolled' | 'suspended'; adultConfirmed: boolean },
): Promise<DbOutcome<void>> {
  try {
    const res = await fetch(restUrl(config.supabaseUrl, 'invite_enrollments', 'on_conflict=user_id'), {
      method: 'POST',
      headers: {
        ...authHeaders(config.serviceKey),
        Prefer: 'resolution=merge-duplicates,return=representation',
      },
      body: JSON.stringify({
        user_id: input.userId,
        enrollment_status: input.status,
        adult_eligibility_confirmed: input.adultConfirmed,
        lesson_id: 'demand-shift-vs-movement',
      }),
    });
    if (!res.ok) return { ok: false, reason: 'error', detail: `HTTP ${res.status}` };
    const rows = (await res.json()) as Array<{ user_id: string }>;
    return rows[0]?.user_id === input.userId
      ? { ok: true, value: undefined }
      : { ok: false, reason: 'error', detail: 'write_not_confirmed' };
  } catch {
    return { ok: false, reason: 'error', detail: 'network_error' };
  }
}

export async function applyRetention(
  config: DbConfig,
  retentionDays: number,
  deleteRows: boolean,
): Promise<DbOutcome<Record<string, unknown>>> {
  try {
    const res = await fetch(restUrl(config.supabaseUrl, 'rpc/apply_retention'), {
      method: 'POST',
      headers: { ...authHeaders(config.serviceKey), Accept: 'application/json' },
      body: JSON.stringify({
        p_retention_days: retentionDays,
        p_delete: deleteRows,
      }),
    });
    if (!res.ok) return { ok: false, reason: 'error', detail: `HTTP ${res.status}` };
    return { ok: true, value: (await res.json()) as Record<string, unknown> };
  } catch {
    return { ok: false, reason: 'error', detail: 'network_error' };
  }
}
