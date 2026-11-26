import { Hono, type Context } from 'hono';
import { z } from 'zod';
import { uuid } from '../../shared/contracts/workspace';
import * as tutoring from '../services/tutoring';
import { rememberSession, replyConnection, streamReply, type ReplyEvent } from '../services/ai/tutor';
import { newTutorInput, tutorMessageInput, tutorMetadataInput } from '../../shared/contracts/tutor';
import { writeInput, pageQuery } from '../../shared/contracts/learning';
import { jsonInput, type BackendContext } from '../http';

export const tutorRoutes = new Hono<BackendContext>();
tutorRoutes.get('/courses/:id/tutor', async c => {
  const q = pageQuery.parse(c.req.query());
  return c.json(
    await tutoring.listSessions(c.get('db'), c.get('workspaceId'), uuid.parse(c.req.param('id')), q.limit, q.cursor),
  );
});
tutorRoutes.post('/courses/:id/tutor', async c =>
  c.json(
    await tutoring.createSession(
      c.get('socket'),
      c.get('workspaceId'),
      uuid.parse(c.req.param('id')),
      await jsonInput(c, newTutorInput),
    ),
  ),
);
tutorRoutes.get('/tutor/:id', async c => {
  const q = z.strictObject({ cursor: z.coerce.number().int().min(-1).max(1000000).default(-1) }).parse(c.req.query());
  return c.json(await tutoring.detail(c.get('db'), c.get('workspaceId'), uuid.parse(c.req.param('id')), q.cursor));
});
/** Ending a session rewrites the course's tutor notes from it, after the response. */
tutorRoutes.post('/tutor/:id/end', async c => {
  const id = uuid.parse(c.req.param('id'));
  const detail = await tutoring.endSession(c.get('socket'), c.get('workspaceId'), id, await jsonInput(c, writeInput));
  c.executionCtx.waitUntil(
    rememberSession(c.env, c.get('workspaceId'), id).catch(error =>
      console.error(JSON.stringify({ operation: 'tutor-notes', error: String(error) })),
    ),
  );
  return c.json(detail);
});
tutorRoutes.get('/courses/:id/tutor/notes', async c =>
  c.json(await tutoring.tutorNotes(c.get('db'), c.get('workspaceId'), uuid.parse(c.req.param('id')))),
);
tutorRoutes.post('/courses/:id/tutor/notes/clear', async c =>
  c.json(
    await tutoring.clearNotes(
      c.get('socket'),
      c.get('workspaceId'),
      uuid.parse(c.req.param('id')),
      (await jsonInput(c, z.strictObject({ operationId: uuid }))).operationId,
    ),
  ),
);
tutorRoutes.patch('/tutor/:id', async c =>
  c.json(
    await tutoring.patchSession(
      c.get('socket'),
      c.get('workspaceId'),
      uuid.parse(c.req.param('id')),
      await jsonInput(c, tutorMetadataInput),
    ),
  ),
);
/** A reply streamed as newline-delimited JSON. It runs to completion and is saved even if the browser goes away. */
function replyStream(
  c: Context<BackendContext>,
  operationId: string,
  first?: ReplyEvent,
  connection?: ReturnType<typeof replyConnection>,
  saved?: Parameters<typeof streamReply>[7],
) {
  const { readable, writable } = new TransformStream<Uint8Array>();
  const writer = writable.getWriter(),
    encoder = new TextEncoder();
  let open = true;
  const emit = async (event: ReplyEvent) => {
    if (!open) return;
    try {
      await writer.write(
        encoder.encode(`${JSON.stringify(event)}
`),
      );
    } catch {
      open = false;
    }
  };
  const done = (first ? emit(first) : Promise.resolve())
    .then(() =>
      streamReply(
        c.env,
        c.get('workspaceId'),
        uuid.parse(c.req.param('id')),
        operationId,
        emit,
        work => c.executionCtx.waitUntil(work),
        connection,
        saved,
      ),
    )
    .catch(() => emit({ type: 'error', code: 'unavailable', message: 'The tutor could not reply just now.' }))
    .finally(() => writer.close().catch(() => undefined));
  c.executionCtx.waitUntil(done);
  return new Response(readable, { headers: { 'Content-Type': 'application/x-ndjson', 'Cache-Control': 'no-store' } });
}
/**
 * Ask: save the question, then stream the reply in the same request on the same connection, so
 * the first token waits for one request rather than two. The saved session comes first.
 */
tutorRoutes.post('/tutor/:id/ask', async c => {
  const input = await jsonInput(c, tutorMessageInput);
  const connection = replyConnection(c.env);
  let detail;
  try {
    detail = await tutoring.saveMessage(connection.db, c.get('workspaceId'), uuid.parse(c.req.param('id')), input);
  } catch (error) {
    await connection.close();
    throw error;
  }
  return replyStream(c, input.operationId, { type: 'saved', detail }, connection, {
    text: input.text,
    action: input.action,
    sessionRevision: input.expectedRevision,
    focus: input.focus,
  });
});
/** Resume the reply to a saved question, such as after a reload while it was queued. */
tutorRoutes.post('/tutor/:id/reply', async c =>
  replyStream(c, (await jsonInput(c, z.strictObject({ operationId: uuid }))).operationId),
);
