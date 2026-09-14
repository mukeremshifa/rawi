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
 *  - Falls back gracefully when SUPABASE_URL / SUPABASE_SERVICE_KEY are not
 *    configured. Routes detect the unconfigured state and use the in-memory
 *    store instead.
 *
 * Invariant: every public function that writes data scopes the write to the
 * provided userId. A request that does not supply a userId cannot call these
 * functions (the type signature requires it).
 */
import type { SessionState } from './learning.js';

export interface DbConfig {
  readonly supabaseUrl: string;
  readonly serviceKey: string;
}

/** Result of a transactional session upsert. */
export type UpsertOutcome =
  | { readonly ok: true }
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
 * Create a new session row. Called once when a session is first created.
 * Returns false if the write fails (e.g. enrollment check failed upstream).
 */
export async function createSession(
  config: DbConfig,
  userId: string,
  state: SessionState,
): Promise<boolean> {
  const row = {
    id: state.sessionId,
    user_id: userId,
    lesson_id: state.lessonId,
    state,
    version: state.version,
  };

  const res = await fetch(restUrl(config.supabaseUrl, 'sessions'), {
    method: 'POST',
    headers: authHeaders(config.serviceKey),
    body: JSON.stringify(row),
  });

  return res.ok || res.status === 409; // 409 = already exists; idempotent
}

/**
 * Read a session owned by userId. Returns undefined when not found or when
 * the session does not belong to this user (ownership check via query param).
 */
export async function getSession(
  config: DbConfig,
  userId: string,
  sessionId: string,
): Promise<SessionState | undefined> {
  const query = `id=eq.${encodeURIComponent(sessionId)}&user_id=eq.${encodeURIComponent(userId)}&select=state`;
  const res = await fetch(restUrl(config.supabaseUrl, 'sessions', query), {
    headers: {
      ...authHeaders(config.serviceKey),
      'Prefer': 'return=representation',
      'Accept': 'application/json',
    },
  });

  if (!res.ok) return undefined;

  const rows = (await res.json()) as Array<{ state: SessionState }>;
  return rows[0]?.state;
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
): Promise<UpsertOutcome> {
  const query =
    `id=eq.${encodeURIComponent(state.sessionId)}` +
    `&user_id=eq.${encodeURIComponent(userId)}` +
    `&version=eq.${expectedVersion}`;

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

  // PostgREST returns Content-Range: */0 when no rows matched (version conflict).
  const contentRange = res.headers.get('Content-Range') ?? '';
  if (contentRange.endsWith('/0') || contentRange === '*/0') {
    return { ok: false, reason: 'conflict' };
  }

  return { ok: true };
}

/**
 * List sessions for a user, ordered by most recently updated.
 * Returns a lightweight summary (not the full state) for the resume UI.
 * Capped at 20 to avoid large responses.
 */
export async function listSessions(
  config: DbConfig,
  userId: string,
): Promise<SessionSummary[]> {
  const query =
    `user_id=eq.${encodeURIComponent(userId)}` +
    `&select=id,lesson_id,version,updated_at,state` +
    `&order=updated_at.desc` +
    `&limit=20`;

  const res = await fetch(restUrl(config.supabaseUrl, 'sessions', query), {
    headers: {
      ...authHeaders(config.serviceKey),
      'Prefer': 'return=representation',
      'Accept': 'application/json',
    },
  });

  if (!res.ok) return [];

  const rows = (await res.json()) as SessionRow[];
  return rows.map((row) => {
    const state = row.state as SessionState;
    // Derive summary data from recorded attempts without importing all of
    // learning.ts — use the minimum necessary here.
    const checkAttempts = state.attempts.filter(
      (a) => a.countsAsIndependent,
    );
    const nextReviewDue = checkAttempts[checkAttempts.length - 1]?.reviewDue;
    const evidenceState =
      checkAttempts.length > 0
        ? 'independent-once'
        : state.attempts.length > 0
          ? 'practicing'
          : 'not-checked';

    return {
      sessionId: row.id,
      lessonId: row.lesson_id,
      version: row.version,
      updatedAt: row.updated_at,
      evidenceState,
      nextReviewDue,
    };
  });
}

/**
 * Check whether a user has an active enrollment.
 * Returns true if an 'enrolled' row exists for this userId.
 */
export async function isEnrolled(
  config: DbConfig,
  userId: string,
): Promise<boolean> {
  const query =
    `user_id=eq.${encodeURIComponent(userId)}` +
    `&enrollment_status=eq.enrolled` +
    `&select=id` +
    `&limit=1`;

  const res = await fetch(restUrl(config.supabaseUrl, 'invite_enrollments', query), {
    headers: {
      ...authHeaders(config.serviceKey),
      'Prefer': 'return=representation',
      'Accept': 'application/json',
    },
  });

  if (!res.ok) return false;
  const rows = (await res.json()) as unknown[];
  return rows.length > 0;
}
