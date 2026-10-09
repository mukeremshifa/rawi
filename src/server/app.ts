import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { configurationProblems } from './config';
import { createAuth } from './auth';
import { readDb, socketDb } from './db/client';
import { ApiError, notFound } from './errors';
import * as service from './services/workspace';
import { workspaces } from './db/schema';
import type { BackendContext } from './http';
import { accountRoutes } from './routes/account';
import { coursesRoutes } from './routes/courses';
import { materialsRoutes } from './routes/materials';
import { practiceRoutes } from './routes/practice';
import { examsRoutes } from './routes/exams';
import { plannerRoutes } from './routes/planner';
import { tutorRoutes } from './routes/tutor';
import { supportRoutes } from './routes/support';
import { aiRoutes } from './routes/ai';

export const api = new Hono<BackendContext>();
api.use('*', async (c, next) => {
  c.set('requestId', crypto.randomUUID());
  c.header('x-request-id', c.get('requestId'));
  c.header('Cache-Control', 'no-store');
  c.header('X-Content-Type-Options', 'nosniff');
  const start = Date.now();
  await next();
  console.log(JSON.stringify({ requestId: c.get('requestId'), method: c.req.method, status: c.res.status, durationMs: Date.now() - start }));
});
api.use('*', bodyLimit({ maxSize: 21 * 1024 * 1024, onError: () => { throw new ApiError(400, 'invalid_input', 'The request is too large.'); } }));
api.get('/status', c => {
  const missing = configurationProblems(c.env);
  return c.json({ configured: missing.length === 0, missing });
});

const configured = new Hono<BackendContext>();
configured.use('*', async (c, next) => {
  // Unknown paths return 404 even when configuration is absent.
  const known = c.req.path.startsWith('/api/auth/') || /^\/api\/v1\/(ai\/status|ai\/operations\/[^/]+(?:\/cancel)?|me|profile|preferences|search|notifications|planner|progress|planner\/(availability|sessions|proposals|check-ins)|planner\/proposals\/[^/]+\/apply|courses(?:\/[^/]+(?:\/(topics|materials|uploads|generate|questions|sets|runs|attempts|exams|assessments|tutor))?)?|materials\/[^/]+(?:\/versions(?:\/[^/]+(?:\/(download|blocks|convert|assets\/[^/]+))?)?)?|uploads\/[^/]+(?:\/finalize)?|sets\/[^/]+(?:\/runs)?|runs\/[^/]+(?:\/(answers|submit|transition|exam-transition|revisit))?|attempts\/[^/]+(?:\/feedback)?|exams\/[^/]+(?:\/runs)?|tutor\/[^/]+(?:\/(messages|end))?)$/.test(c.req.path);
  if (!known) throw notFound();
  const missing = configurationProblems(c.env);
  if (missing.length) throw new ApiError(503, 'not_configured', 'Your workspace is temporarily unavailable. Please try again.');
  const connection = socketDb(c.env.DATABASE_URL!);
  try {
    c.set('socket', connection.db);
    c.set('auth', createAuth(c.env, connection.db));
    c.set('db', readDb(c.env.DATABASE_URL!));
    await next();
  }
  finally { await connection.close(); }
});
configured.on(['GET', 'POST'], '/auth/*', async c => {
  const response = await c.get('auth').handler(c.req.raw);
  // Preserve the auth client contract, cookies and redirects. Sanitize internal failures.
  if (response.status >= 500) throw new ApiError(503, 'auth_unavailable', 'Sign-in is temporarily unavailable. Try again.');
  if (response.status === 404) throw notFound();
  return response;
});

const app = new Hono<BackendContext>();
app.use('*', async (c, next) => {
  if (!['GET', 'HEAD'].includes(c.req.method) && c.req.header('origin') !== c.env.BETTER_AUTH_URL) {
    throw new ApiError(400, 'invalid_origin', 'Use the configured Rawi application to save changes.');
  }
  // Reading the session over HTTP avoids opening a socket for requests that never use one.
  const { response: session, headers } = await createAuth(c.env, c.get('db'), false).api.getSession({ headers: c.req.raw.headers, returnHeaders: true });
  for (const cookie of headers.getSetCookie()) c.header('Set-Cookie', cookie, { append: true });
  if (!session) throw new ApiError(401, 'unauthenticated', 'Sign in to open your workspace.');
  c.set('user', session.user);
  // This mismatch guard never substitutes for session authentication.
  const expectedUser = c.req.header('x-rawi-user');
  if (expectedUser && expectedUser !== session.user.id) throw new ApiError(401, 'account_changed', 'Your account changed. Reload your workspace.');
  if (c.req.path !== '/api/v1/me') {
    const [workspace] = await c.get('db').select().from(workspaces).where(eq(workspaces.ownerUserId, session.user.id));
    const own = workspace ?? (await service.bootstrap(c.get('socket'), session.user.id)).workspace;
    c.set('workspaceId', own.id);
  }
  await next();
});
app.route('/', accountRoutes);
app.route('/', coursesRoutes);
app.route('/', materialsRoutes);
app.route('/', practiceRoutes);
app.route('/', examsRoutes);
app.route('/', plannerRoutes);
app.route('/', tutorRoutes);
app.route('/', supportRoutes);
app.route('/', aiRoutes);
configured.route('/v1', app);
api.route('/', configured);
api.notFound(() => { throw notFound(); });
api.onError((error, c) => {
  const safe = error instanceof ApiError ? error : error instanceof z.ZodError
    ? new ApiError(400, 'invalid_input', 'Some fields are invalid. Check required text, IDs, links, timezone and revision.')
    : new ApiError(503, 'unavailable', 'The workspace is temporarily unavailable. Keep this page open and retry to save your changes.');
  return c.json({ error: { code: safe.code, message: safe.message, requestId: c.get('requestId') } }, safe.status);
});
