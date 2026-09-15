import { Hono } from 'hono';

import { ApiClientError, type ApiErrorBody } from '../shared/contract.ts';
import { extractBearerToken, verifyJwt } from './auth.ts';
import { getDb } from './db/client.ts';
import type { Env } from './env.ts';
import { ROUTES } from './routes/index.ts';
import type { RequestContext } from './routes/types.ts';

/**
 * The Worker. Route wiring only — every decision lives in a module below it.
 *
 * ── One origin ────────────────────────────────────────────────────────────
 *
 * The same Worker serves the API and the built client from the ASSETS binding,
 * with SPA fallback configured in `wrangler.jsonc`. That is why there is no
 * CORS handling here and no separate static host to deploy: the browser never
 * makes a cross-origin request in production.
 *
 * ── Auth, once, at the edge of everything ─────────────────────────────────
 *
 * Every `/api` route verifies the Supabase JWT and derives `userId` from it.
 * There is no route that trusts a client-supplied user id, because
 * `RequestContext` has no field one could arrive in (invariant 7).
 */

const app = new Hono<{ Bindings: Env }>();

/** `never` is the honest return type: this function always throws. */
function errorResponse(error: unknown): Response {
  if (error instanceof ApiClientError) {
    const status =
      error.code === 'unauthorized'
        ? 401
        : error.code === 'forbidden'
          ? 403
          : error.code === 'not_found'
            ? 404
            : error.code === 'invalid_input'
              ? 400
              : error.code === 'stale_request'
                ? 409
                : error.code === 'quota_exceeded'
                  ? 402
                  : error.code === 'rate_limited'
                    ? 429
                    : error.code === 'item_bank_exhausted'
                      ? 409
                      : error.code === 'assessment_rejected'
                        ? 422
                        : 500;

    const body: ApiErrorBody = {
      code: error.code,
      message: error.message,
      ...(error.issues ? { issues: error.issues } : {}),
    };
    return Response.json(body, { status });
  }

  // An unexpected throw is not a place to be creative. The learner gets one
  // sentence and the detail goes to the log, because an internal message can
  // carry a database error string and those sometimes carry data.
  console.error('unhandled', error);
  return Response.json(
    { code: 'internal', message: 'Something failed on our side. Your work is saved.' },
    { status: 500 },
  );
}

app.get('/api/health', (c) =>
  c.json({ ok: true, mode: c.env.RAWI_AI_MODE ?? 'fixture' }),
);

for (const route of ROUTES) {
  const method = route.method.toLowerCase() as 'get' | 'post' | 'patch' | 'delete';

  app[method](route.path, async (c) => {
    try {
      const token = extractBearerToken(c.req.header('Authorization') ?? null);
      const user = token ? await verifyJwt(token, c.env.SUPABASE_URL) : null;
      if (!user) {
        throw new ApiClientError('unauthorized', 'Sign in again to continue.');
      }

      const body =
        route.method === 'POST' || route.method === 'PATCH'
          ? await c.req.json().catch(() => undefined)
          : undefined;

      const context: RequestContext = {
        db: getDb(c.env),
        env: c.env,
        userId: user.userId,
        email: user.email ?? null,
        // Read once per request. A handler that calls `new Date()` twice can
        // straddle midnight and write an attempt whose due date disagrees with
        // the summary rendered beside it.
        now: new Date(),
        params: c.req.param() as Record<string, string>,
        query: new URL(c.req.url).searchParams,
        body,
      };

      const result = await route.handler(context);
      return result === null || result === undefined
        ? new Response(null, { status: 204 })
        : Response.json(result);
    } catch (error) {
      return errorResponse(error);
    }
  });
}

// Anything that is not an API route is the client. The ASSETS binding handles
// the SPA fallback, so a deep link into a route the router owns still serves
// index.html rather than 404ing.
app.all('*', async (c) => {
  if (new URL(c.req.url).pathname.startsWith('/api/')) {
    return Response.json({ code: 'not_found', message: 'No such route.' }, { status: 404 });
  }
  return c.env.ASSETS.fetch(c.req.raw);
});

export default app;
