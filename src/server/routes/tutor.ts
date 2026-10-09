import { Hono } from 'hono';
import { z } from 'zod';
import { uuid } from '../../shared/contracts/workspace';
import * as tutoring from '../services/tutoring';
import { streamReply, type ReplyEvent } from '../services/ai/tutor';
import { newTutorInput, tutorMessageInput, tutorMetadataInput } from '../../shared/contracts/tutor';
import { writeInput, pageQuery } from '../../shared/contracts/learning';
import { jsonInput, type BackendContext } from '../http';

export const tutorRoutes = new Hono<BackendContext>();
tutorRoutes.get('/courses/:id/tutor', async c => { const q = pageQuery.parse(c.req.query()); return c.json(await tutoring.listSessions(c.get('db'), c.get('workspaceId'), uuid.parse(c.req.param('id')), q.limit, q.cursor)); });
tutorRoutes.post('/courses/:id/tutor', async c => c.json(await tutoring.createSession(c.get('socket'), c.get('workspaceId'), uuid.parse(c.req.param('id')), await jsonInput(c, newTutorInput))));
tutorRoutes.get('/tutor/:id', async c => { const q = z.strictObject({ cursor: z.coerce.number().int().min(-1).max(1000000).default(-1) }).parse(c.req.query()); return c.json(await tutoring.detail(c.get('db'), c.get('workspaceId'), uuid.parse(c.req.param('id')), q.cursor)); });
tutorRoutes.post('/tutor/:id/end', async c => c.json(await tutoring.endSession(c.get('socket'), c.get('workspaceId'), uuid.parse(c.req.param('id')), await jsonInput(c, writeInput))));
tutorRoutes.post('/tutor/:id/messages', async c => c.json(await tutoring.saveMessage(c.get('socket'), c.get('workspaceId'), uuid.parse(c.req.param('id')), await jsonInput(c, tutorMessageInput))));
tutorRoutes.patch('/tutor/:id', async c => c.json(await tutoring.patchSession(c.get('socket'), c.get('workspaceId'), uuid.parse(c.req.param('id')), await jsonInput(c, tutorMetadataInput))));
/**
 * The reply to a saved question, streamed as newline-delimited JSON. The reply runs to completion
 * and is saved even if the browser goes away, so a reload shows it.
 */
tutorRoutes.post('/tutor/:id/reply', async c => {
  const body = await jsonInput(c, z.strictObject({ operationId: uuid }));
  const { readable, writable } = new TransformStream<Uint8Array>();
  const writer = writable.getWriter(), encoder = new TextEncoder();
  let open = true;
  const emit = async (event: ReplyEvent) => { if (!open) return; try { await writer.write(encoder.encode(`${JSON.stringify(event)}
`)); } catch { open = false; } };
  const done = streamReply(c.env, c.get('workspaceId'), uuid.parse(c.req.param('id')), body.operationId, emit)
    .catch(() => emit({ type: 'error', code: 'unavailable', message: 'The tutor could not reply just now.' }))
    .finally(() => writer.close().catch(() => undefined));
  c.executionCtx.waitUntil(done);
  return new Response(readable, { headers: { 'Content-Type': 'application/x-ndjson', 'Cache-Control': 'no-store' } });
});
