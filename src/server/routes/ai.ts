import { Hono } from 'hono';
import { z } from 'zod';
import { uuid } from '../../shared/contracts/workspace';
import * as ai from '../services/ai/operations';
import { generateInput, generateSet } from '../services/ai/questions';
import { gradeAttempt, gradeInput } from '../services/ai/grading';
import { jsonInput, type BackendContext } from '../http';

export const aiRoutes = new Hono<BackendContext>();
aiRoutes.get('/ai/status', async c => c.json(await ai.aiStatus(c.env, c.get('db'), c.get('workspaceId'))));
aiRoutes.post('/ai/operations/:id/cancel', async c => { const body = await jsonInput(c, z.strictObject({ operationId: uuid })); return c.json(await ai.cancelOperation(c.get('socket'), c.get('workspaceId'), uuid.parse(c.req.param('id')), body.operationId)); });
aiRoutes.get('/ai/operations/:id', async c => c.json(await ai.viewOperation(c.get('db'), c.get('workspaceId'), uuid.parse(c.req.param('id')))));
aiRoutes.post('/courses/:id/generate', async c => c.json(await generateSet(c.env, c.get('socket'), c.get('workspaceId'), uuid.parse(c.req.param('id')), await jsonInput(c, generateInput))));
aiRoutes.post('/attempts/:id/feedback', async c => c.json(await gradeAttempt(c.env, c.get('socket'), c.get('workspaceId'), uuid.parse(c.req.param('id')), await jsonInput(c, gradeInput))));
