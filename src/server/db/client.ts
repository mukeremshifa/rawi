import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { ApiClientError } from '../../shared/contract.ts';

/**
 * The Supabase client the Worker uses, and the ownership rule that goes with it.
 *
 * ── Service role, and why that is not a shortcut ──────────────────────────
 *
 * The Worker connects with the service-role key, which **bypasses RLS**. That
 * is deliberate: the Worker has already verified the JWT and derived `userId`
 * from it, and it needs to do things a learner's own token cannot — write to
 * the append-only log, advance a job, settle the AI ledger.
 *
 * The consequence is the thing to hold onto: **RLS is not what protects data in
 * production; the handler is.** Every query in `db/` takes `userId` and puts it
 * in the WHERE clause. RLS stays enabled on every table anyway, because it is
 * the second lock and because it is what protects the project from anything
 * that connects with an anon key — but the defence you can audit by reading one
 * file is the one in these modules, and that is the one that has to be right.
 *
 * `scripts/check-data-access` in the donor repo existed to enforce exactly this
 * by grep. Here the surface is small enough that the rule is stated once and
 * every function signature carries `userId` as a required argument, which is a
 * weaker guarantee than a lint and a much stronger one than a comment.
 */

export interface DbEnv {
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
}

export type Db = SupabaseClient;

let cached: { url: string; client: Db } | null = null;

export function getDb(env: DbEnv): Db {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new ApiClientError(
      'internal',
      'SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required. See docs/OPERATIONS.md §5.1.',
    );
  }
  // Cached per isolate and keyed on the URL, so a config change in `wrangler
  // dev` does not keep serving a client pointed at the previous project.
  if (cached && cached.url === env.SUPABASE_URL) return cached.client;

  const client = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { 'x-application-name': 'rawi-worker' } },
  });
  cached = { url: env.SUPABASE_URL, client };
  return client;
}

/**
 * Turn a PostgREST failure into a contract error.
 *
 * `23505` is a unique violation, which in this schema always means "you already
 * did this" rather than "something broke" — a duplicate idempotency key, the
 * same file added twice. It deserves a different code from a real failure.
 */
export function dbError(error: { code?: string; message: string }): ApiClientError {
  if (error.code === '23505') {
    return new ApiClientError('invalid_input', 'That already exists here.');
  }
  if (error.code === 'PGRST116') {
    return new ApiClientError('not_found', 'That is not here any more.');
  }
  return new ApiClientError('internal', `Database error: ${error.message}`);
}

/** Unwrap a single-row result, or fail with the right code. */
export function single<T>(result: {
  data: T | null;
  error: { code?: string; message: string } | null;
}): T {
  if (result.error) throw dbError(result.error);
  if (!result.data) throw new ApiClientError('not_found', 'That is not here any more.');
  return result.data;
}

/** Unwrap a list result. */
export function many<T>(result: {
  data: T[] | null;
  error: { code?: string; message: string } | null;
}): T[] {
  if (result.error) throw dbError(result.error);
  return result.data ?? [];
}
