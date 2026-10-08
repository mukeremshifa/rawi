import { Hono } from 'hono';
import { z } from 'zod';
import { uuid } from '../../shared/contracts/workspace';
import * as tutoring from '../services/tutoring';
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
