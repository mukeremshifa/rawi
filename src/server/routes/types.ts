import type { z } from 'zod';

import { ApiClientError } from '../../shared/contract.ts';
import type { Db } from '../db/client.ts';
import type { Env } from '../env.ts';

/**
 * What a handler is given, and what it may return.
 *
 * ── `userId` is derived, never received ───────────────────────────────────
 *
 * It comes from the verified JWT and nowhere else. There is no field on this
 * type a request body could populate, which is the structural version of
 * invariant 7's "never trust a client-supplied user id" — a handler cannot make
 * that mistake because there is nothing to make it with.
 */
export interface RequestContext {
  db: Db;
  env: Env;
  userId: string;
  email: string | null;
  /** Read once per request, so a handler cannot disagree with itself. */
  now: Date;
  params: Record<string, string>;
  query: URLSearchParams;
  /** Parsed JSON body, or `undefined` for GET/DELETE. */
  body: unknown;
}

export type Handler = (context: RequestContext) => Promise<unknown>;

/**
 * One row of the route table.
 *
 * `op` is the contract method this route serves. `scripts/check-routes.mjs`
 * compares the set of `op` values here against the method names on `ApiClient`
 * and fails the build on any difference in either direction — a method added to
 * the contract with no route, or a route serving nothing the contract declares.
 * That drift is otherwise a 404 discovered at runtime.
 */
export interface Route {
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  /** Hono path syntax: `/api/workspaces/:workspaceId/sources/:sourceId`. */
  path: string;
  op: string;
  handler: Handler;
}

/** Parse a body against a schema, or fail with field-level messages. */
export function parseBody<T extends z.ZodType>(schema: T, body: unknown): z.infer<T> {
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new ApiClientError(
      'invalid_input',
      'Some of that was not valid.',
      parsed.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    );
  }
  return parsed.data;
}

/** A required path parameter, or a 404 rather than a crash. */
export function param(context: RequestContext, name: string): string {
  const value = context.params[name];
  if (!value) throw new ApiClientError('not_found', 'That is not here.');
  return value;
}

/** Paging from the query string. */
export function pageFromQuery(query: URLSearchParams) {
  const limit = Number(query.get('limit'));
  return {
    cursor: query.get('cursor'),
    limit: Number.isFinite(limit) && limit > 0 ? Math.min(limit, 100) : undefined,
  };
}
