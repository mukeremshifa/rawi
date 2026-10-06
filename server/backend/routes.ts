import { Hono, type Context } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { createCourseInput, coursePatch, preferencesPatch, replaceOutlineInput, uuid } from '../../src/shared/online';
import type { BackendBindings } from './config';
import { configurationProblems } from './config';
import { createAuth } from './auth';
import { readDb, socketDb, type ReadDb, type SocketDb } from './db';
import { ApiError, notFound } from './errors';
import * as service from './service';
import { workspaces } from './schema';
import { createMaterialInput, materialPatch, textVersionInput, uploadInput, materialListInput, pageInput } from '../../src/shared/materials';
import * as materialService from './materials';
import * as uploadService from './uploads';
import { limits } from './storage';
import * as learning from './learning';
import * as exams from './exams';
import * as planning from './planning';
import * as tutoring from './tutoring';
import * as transfer from './transfer';
import { newTutorInput, tutorMessageInput, tutorMetadataInput } from '../../src/shared/online-tutor';
import { plannerWrite, scheduleWrite, assessmentWrite, proposalInput, checkInInput } from '../../src/shared/online-planner';
import { createExamInput, examTransitionInput } from '../../src/shared/online-exams';
import { createSetInput, metadataInput, runWriteInput, transitionInput, pageQuery } from '../../src/shared/learning';

export type BackendContext = {
  Bindings: BackendBindings;
  Variables: {
    requestId: string; db: ReadDb; socket: SocketDb; workspaceId: string;
    user: { id: string; name: string; email: string; image?: string | null };
    auth: ReturnType<typeof createAuth>;
  };
};
export async function jsonInput<T>(c: Context<BackendContext>, schema: z.ZodType<T>): Promise<T> {
  if (!c.req.header('content-type')?.startsWith('application/json')) throw new ApiError(400, 'invalid_input', 'Send a JSON request body.');
  let body: unknown;
  try { body = await c.req.json(); } catch { throw new ApiError(400, 'invalid_input', 'The JSON request body could not be read.'); }
  return schema.parse(body);
}

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
api.use('*', bodyLimit({ maxSize: 7 * 1024 * 1024, onError: () => { throw new ApiError(400, 'invalid_input', 'The request is too large.'); } }));
api.get('/status', c => {
  const missing = configurationProblems(c.env);
  return c.json({ mode: 'online', configured: missing.length === 0, missing });
});

const configured = new Hono<BackendContext>();
configured.use('*', async (c, next) => {
  // Unknown paths return 404 even when configuration is absent.
  const known = c.req.path.startsWith('/api/auth/') || /^\/api\/v1\/(me|preferences|export|imports\/review|imports\/[^/]+\/(commit|original)|planner|progress|planner\/(availability|sessions|proposals|check-ins)|planner\/proposals\/[^/]+\/apply|courses(?:\/[^/]+(?:\/(topics|materials|uploads|questions|sets|runs|attempts|exams|assessments|tutor))?)?|materials\/[^/]+(?:\/versions(?:\/[^/]+(?:\/(download|passages\/[^/]+))?)?)?|uploads\/[^/]+(?:\/finalize)?|sets\/[^/]+(?:\/runs)?|runs\/[^/]+(?:\/(answers|submit|transition|exam-transition))?|attempts\/[^/]+|exams\/[^/]+(?:\/runs)?|tutor\/[^/]+(?:\/messages)?)$/.test(c.req.path);
  if (!known) throw notFound();
  const missing = configurationProblems(c.env);
  if (missing.length) throw new ApiError(503, 'not_configured', `Online mode is not configured: ${missing.join(', ')}.`);
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
  const { response: session, headers } = await c.get('auth').api.getSession({ headers: c.req.raw.headers, returnHeaders: true });
  for (const cookie of headers.getSetCookie()) c.header('Set-Cookie', cookie, { append: true });
  if (!session) throw new ApiError(401, 'unauthenticated', 'Sign in to open your online workspace.');
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
app.get('/me', async c => {
  const user = c.get('user');
  return c.json({ user: { id: user.id, name: user.name, email: user.email, image: user.image ?? null }, ...await service.bootstrap(c.get('socket'), user.id) });
});
app.get('/courses', async c => {
  const query = z.strictObject({ archived: z.enum(['true', 'false', 'all']).default('false'), limit: z.coerce.number().int().min(1).max(100).default(30), cursor: uuid.optional() }).parse(c.req.query());
  return c.json(await service.listCourses(c.get('db'), c.get('workspaceId'), query.archived, query.limit, query.cursor));
});
app.post('/courses', async c => c.json(await service.createCourse(c.get('socket'), c.get('workspaceId'), await jsonInput(c, createCourseInput))));
app.get('/courses/:id', async c => c.json(await service.getCourse(c.get('db'), c.get('workspaceId'), uuid.parse(c.req.param('id')))));
app.patch('/courses/:id', async c => c.json(await service.updateCourse(c.get('db'), c.get('workspaceId'), uuid.parse(c.req.param('id')), await jsonInput(c, coursePatch))));
app.get('/courses/:id/topics', async c => c.json(await service.getOutline(c.get('db'), c.get('workspaceId'), uuid.parse(c.req.param('id')))));
app.put('/courses/:id/topics', async c => {
  const input = await jsonInput(c, replaceOutlineInput);
  return c.json(await service.replaceTopics(c.get('socket'), c.get('workspaceId'), uuid.parse(c.req.param('id')), input.expectedRevision, input.topics));
});
app.get('/preferences', async c => c.json(await service.getPreferences(c.get('db'), c.get('workspaceId'))));
app.patch('/preferences', async c => c.json(await service.updatePreferences(c.get('db'), c.get('workspaceId'), await jsonInput(c, preferencesPatch))));
app.get('/courses/:id/materials', async c => c.json(await materialService.listMaterials(c.get('db'), c.get('workspaceId'), uuid.parse(c.req.param('id')), materialListInput.parse(c.req.query()))));
app.post('/courses/:id/materials', async c => c.json(await materialService.createMaterial(c.get('socket'), c.get('workspaceId'), uuid.parse(c.req.param('id')), await jsonInput(c, createMaterialInput), limits(c.env).text)));
app.get('/materials/:id', async c => c.json(await materialService.materialDetail(c.get('db'), c.get('workspaceId'), uuid.parse(c.req.param('id')))));
app.patch('/materials/:id', async c => c.json(await materialService.patchMaterial(c.get('socket'), c.get('workspaceId'), uuid.parse(c.req.param('id')), await jsonInput(c, materialPatch))));
app.get('/materials/:id/versions', async c => {
  const query = pageInput.parse(c.req.query());
  return c.json(await materialService.listVersions(c.get('db'), c.get('workspaceId'), uuid.parse(c.req.param('id')), query.limit, query.cursor));
});
app.post('/materials/:id/versions', async c => c.json(await materialService.addTextVersion(c.get('socket'), c.get('workspaceId'), uuid.parse(c.req.param('id')), await jsonInput(c, textVersionInput), limits(c.env).text)));
app.get('/materials/:id/versions/:versionId', async c => {
  const query = z.strictObject({ cursor: z.coerce.number().int().min(-1).max(1048576).default(-1) }).parse(c.req.query());
  return c.json(await materialService.versionDetail(c.get('db'), c.get('workspaceId'), uuid.parse(c.req.param('id')), uuid.parse(c.req.param('versionId')), query.cursor));
});
app.get('/materials/:id/versions/:versionId/passages/:passageId', async c => c.json(await materialService.exactPassage(c.get('db'), c.get('workspaceId'), uuid.parse(c.req.param('id')), uuid.parse(c.req.param('versionId')), uuid.parse(c.req.param('passageId')))));
app.get('/courses/:id/uploads', async c => {
  const query = pageInput.parse(c.req.query());
  return c.json(await uploadService.listUploads(c.get('db'), c.get('workspaceId'), uuid.parse(c.req.param('id')), query.cursor));
});
app.post('/courses/:id/uploads', async c => c.json(await uploadService.initiate(c.get('socket'), c.env, c.get('workspaceId'), uuid.parse(c.req.param('id')), await jsonInput(c, uploadInput))));
app.get('/uploads/:id', async c => c.json(await uploadService.getUpload(c.get('socket'), c.get('workspaceId'), uuid.parse(c.req.param('id')))));
app.post('/uploads/:id/finalize', async c => c.json(await uploadService.finalize(c.get('socket'), c.env, c.get('workspaceId'), uuid.parse(c.req.param('id')))));
app.post('/materials/:id/versions/:versionId/download', async c => c.json(await uploadService.download(c.get('db'), c.env, c.get('workspaceId'), uuid.parse(c.req.param('id')), uuid.parse(c.req.param('versionId')))));

app.get('/courses/:id/questions', async c => { const q = pageQuery.parse(c.req.query()); return c.json(await learning.bank(c.get('db'), c.get('workspaceId'), uuid.parse(c.req.param('id')), q.limit, q.cursor)); });
app.post('/courses/:id/questions', async c => c.json(await learning.importBank(c.get('socket'), c.get('workspaceId'), uuid.parse(c.req.param('id')), await jsonInput(c, learning.importBankInput))));
app.get('/courses/:id/sets', async c => { const q = pageQuery.parse(c.req.query()); return c.json(await learning.listSets(c.get('db'), c.get('workspaceId'), uuid.parse(c.req.param('id')), q.archived, q.limit, q.cursor)); });
app.post('/courses/:id/sets', async c => c.json(await learning.createSet(c.get('socket'), c.get('workspaceId'), uuid.parse(c.req.param('id')), await jsonInput(c, createSetInput))));
app.get('/sets/:id', async c => { const id = uuid.parse(c.req.param('id')); const workspace = c.get('workspaceId'); return c.json({ set: await learning.ownSet(c.get('db'), workspace, id), items: await learning.setQuestions(c.get('db'), workspace, id) }); });
app.patch('/sets/:id', async c => c.json(await learning.patchSet(c.get('socket'), c.get('workspaceId'), uuid.parse(c.req.param('id')), await jsonInput(c, metadataInput))));
app.post('/sets/:id/runs', async c => { const input = await jsonInput(c, z.strictObject({ id: uuid, plannedSessionId: uuid.optional() })); return c.json(await learning.startRun(c.get('socket'), c.get('workspaceId'), uuid.parse(c.req.param('id')), input.id, input.plannedSessionId)); });
app.get('/runs/:id', async c => c.json(await learning.getRun(c.get('socket'), c.get('workspaceId'), uuid.parse(c.req.param('id')))));
app.put('/runs/:id/answers', async c => c.json(await learning.writeRun(c.get('socket'), c.get('workspaceId'), uuid.parse(c.req.param('id')), await jsonInput(c, runWriteInput), false)));
app.post('/runs/:id/submit', async c => c.json(await learning.writeRun(c.get('socket'), c.get('workspaceId'), uuid.parse(c.req.param('id')), await jsonInput(c, runWriteInput), true)));
app.post('/runs/:id/transition', async c => c.json(await learning.transition(c.get('socket'), c.get('workspaceId'), uuid.parse(c.req.param('id')), await jsonInput(c, transitionInput))));
app.get('/courses/:id/runs', async c => { const q = pageQuery.parse(c.req.query()); return c.json(await learning.activeRuns(c.get('db'), c.get('workspaceId'), uuid.parse(c.req.param('id')), q.limit, q.cursor)); });
app.get('/courses/:id/attempts', async c => { const q = pageQuery.parse(c.req.query()); return c.json(await learning.history(c.get('db'), c.get('workspaceId'), uuid.parse(c.req.param('id')), q.limit, q.cursor)); });
app.get('/attempts/:id', async c => c.json(await learning.attempt(c.get('db'), c.get('workspaceId'), uuid.parse(c.req.param('id')))));
app.get('/courses/:id/exams', async c => { const q = pageQuery.parse(c.req.query()); return c.json(await exams.listExams(c.get('db'), c.get('workspaceId'), uuid.parse(c.req.param('id')), q.limit, q.cursor)); });
app.post('/courses/:id/exams', async c => c.json(await exams.createExam(c.get('socket'), c.get('workspaceId'), uuid.parse(c.req.param('id')), await jsonInput(c, createExamInput))));
app.patch('/exams/:id', async c => c.json(await exams.patchExam(c.get('socket'), c.get('workspaceId'), uuid.parse(c.req.param('id')), await jsonInput(c, metadataInput))));
app.post('/exams/:id/runs', async c => { const input = await jsonInput(c, z.strictObject({ id: uuid, plannedSessionId: uuid.optional() })); return c.json(await exams.startExam(c.get('socket'), c.get('workspaceId'), uuid.parse(c.req.param('id')), input.id, input.plannedSessionId)); });
app.post('/runs/:id/exam-transition', async c => c.json(await exams.examTransition(c.get('socket'), c.get('workspaceId'), uuid.parse(c.req.param('id')), await jsonInput(c, examTransitionInput))));
app.get('/planner', async c => c.json(await planning.plannerView(c.get('socket'), c.get('workspaceId'))));
app.get('/progress', async c => c.json(await planning.progress(c.get('socket'), c.get('workspaceId'))));
app.put('/planner/availability', async c => c.json(await planning.saveAvailability(c.get('socket'), c.get('workspaceId'), await jsonInput(c, plannerWrite))));
app.put('/planner/sessions', async c => c.json(await planning.saveSession(c.get('socket'), c.get('workspaceId'), await jsonInput(c, scheduleWrite))));
app.put('/courses/:id/assessments', async c => c.json(await planning.saveAssessment(c.get('socket'), c.get('workspaceId'), uuid.parse(c.req.param('id')), await jsonInput(c, assessmentWrite))));
app.post('/planner/check-ins', async c => { const body = await jsonInput(c, z.strictObject({ operationId: uuid, checkIn: checkInInput })); return c.json(await planning.addCheckIn(c.get('socket'), c.get('workspaceId'), body.operationId, body.checkIn)); });
app.post('/planner/proposals', async c => c.json(await planning.propose(c.get('socket'), c.get('workspaceId'), await jsonInput(c, proposalInput))));
app.post('/planner/proposals/:id/apply', async c => { const body = await jsonInput(c, z.strictObject({ operationId: uuid })); return c.json(await planning.applyProposal(c.get('socket'), c.get('workspaceId'), uuid.parse(c.req.param('id')), body.operationId)); });
app.get('/courses/:id/tutor', async c => { const q = pageQuery.parse(c.req.query()); return c.json(await tutoring.listSessions(c.get('db'), c.get('workspaceId'), uuid.parse(c.req.param('id')), q.limit, q.cursor)); });
app.post('/courses/:id/tutor', async c => c.json(await tutoring.createSession(c.get('socket'), c.get('workspaceId'), uuid.parse(c.req.param('id')), await jsonInput(c, newTutorInput))));
app.get('/tutor/:id', async c => { const q = z.strictObject({ cursor: z.coerce.number().int().min(-1).max(1000000).default(-1) }).parse(c.req.query()); return c.json(await tutoring.detail(c.get('db'), c.get('workspaceId'), uuid.parse(c.req.param('id')), q.cursor)); });
app.post('/tutor/:id/messages', async c => c.json(await tutoring.saveMessage(c.get('socket'), c.get('workspaceId'), uuid.parse(c.req.param('id')), await jsonInput(c, tutorMessageInput))));
app.patch('/tutor/:id', async c => c.json(await tutoring.patchSession(c.get('socket'), c.get('workspaceId'), uuid.parse(c.req.param('id')), await jsonInput(c, tutorMetadataInput))));
app.get('/export', async c => c.json(await transfer.exportWorkspace(c.get('socket'), c.get('workspaceId'))));
app.post('/imports/review', async c => { const input = await jsonInput(c, z.strictObject({ export: z.unknown() })); return c.json(await transfer.prepareImport(c.get('socket'), c.get('workspaceId'), input.export)); });
app.get('/imports/:id/original', async c => c.json(await transfer.importOriginal(c.get('socket'), c.get('workspaceId'), uuid.parse(c.req.param('id')))));
app.post('/imports/:id/commit', async c => { const input = await jsonInput(c, z.strictObject({ operationId: uuid })); return c.json(await transfer.commitImport(c.get('socket'), c.get('workspaceId'), uuid.parse(c.req.param('id')), input.operationId)); });
configured.route('/v1', app);
api.route('/', configured);
api.notFound(() => { throw notFound(); });
api.onError((error, c) => {
  const safe = error instanceof ApiError ? error : error instanceof z.ZodError
    ? new ApiError(400, 'invalid_input', 'Some fields are invalid. Check required text, IDs, links, timezone and revision.')
    : new ApiError(503, 'unavailable', 'The online workspace is temporarily unavailable. Your unsent changes are still in this page.');
  return c.json({ error: { code: safe.code, message: safe.message, requestId: c.get('requestId') } }, safe.status);
});
