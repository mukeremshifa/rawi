import { Hono } from 'hono';
import { z } from 'zod';
import { uuid } from '../../shared/contracts/workspace';
import * as ai from '../services/ai/operations';
import { jsonInput, type BackendContext } from '../http';

export const aiRoutes = new Hono<BackendContext>();
aiRoutes.get('/ai/status', c => c.json({ available: false, reason: ai.unavailable }));
aiRoutes.post('/ai/operations/:id/cancel', async c => { const body = await jsonInput(c, z.strictObject({ operationId: uuid })); return c.json(await ai.cancelOperation(c.get('socket'), c.get('workspaceId'), uuid.parse(c.req.param('id')), body.operationId)); });
aiRoutes.get('/ai/operations/:id', async c => c.json(await ai.viewOperation(c.get('db'), c.get('workspaceId'), uuid.parse(c.req.param('id')))));
aiRoutes.post('/courses/:id/generate', async c => c.json(await ai.prepareGeneration(c.get('socket'), c.get('workspaceId'), uuid.parse(c.req.param('id')), await jsonInput(c, ai.generateInput))));
aiRoutes.post('/attempts/:id/feedback', async c => c.json(await ai.prepareGrade(c.get('socket'), c.get('workspaceId'), uuid.parse(c.req.param('id')), await jsonInput(c, ai.gradeInput))));
