import { Hono } from 'hono';
import { z } from 'zod';
import { uuid } from '../../shared/contracts/workspace';
import * as support from '../services/support';
import { jsonInput, type BackendContext } from '../http';

export const supportRoutes = new Hono<BackendContext>();
supportRoutes.get('/search', async c => { const q = z.strictObject({ q: z.string().trim().max(100).default('') }).parse(c.req.query()); return c.json(q.q ? await support.search(c.get('db'), c.get('workspaceId'), q.q) : { results: [], limitPerCategory: 10 }); });
supportRoutes.get('/notifications', async c => c.json(await support.notifications(c.get('socket'), c.get('workspaceId'))));
supportRoutes.patch('/notifications', async c => { const input = await jsonInput(c, z.strictObject({ operationId: uuid, key: z.string().min(1).max(300), status: z.enum(['read', 'dismissed']) })); return c.json(await support.markReminder(c.get('socket'), c.get('workspaceId'), input.operationId, input.key, input.status)); });
