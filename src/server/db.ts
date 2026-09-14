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
    return { ok: true, value: confirmed.state };
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
    return { ok: true, value: rows[0]?.state };
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
        const evidence = projectLearningEvidence(row.state, lesson);
        return {
          sessionId: row.id,
          lessonId: row.lesson_id,
          version: row.version,
          updatedAt: row.updated_at,
          evidenceState: evidence.state,
          nextReviewDue: evidence.nextReviewDue,
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
