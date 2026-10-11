import { Hono } from 'hono';
import { z } from 'zod';
import { uuid } from '../../shared/contracts/workspace';
import * as ai from '../services/ai/operations';
import * as keys from '../services/ai/keys';
import { jsonInput, type BackendContext } from '../http';

export const aiRoutes = new Hono<BackendContext>();
aiRoutes.get('/ai/status', async c => c.json(await ai.aiStatus(c.env, c.get('db'), c.get('workspaceId'))));
aiRoutes.get('/ai/funding', async c => c.json(await keys.fundingView(c.get('db'), c.get('workspaceId'))));
aiRoutes.put('/ai/funding/key', async c => c.json(await keys.saveOwnKey(c.env, c.get('socket'), c.get('workspaceId'), await jsonInput(c, keys.ownKeyInput))));
aiRoutes.delete('/ai/funding/key', async c => c.json(await keys.removeOwnKey(c.get('socket'), c.get('workspaceId'))));
aiRoutes.post('/ai/funding/use', async c => c.json(await keys.useSource(c.get('socket'), c.get('workspaceId'), await jsonInput(c, keys.useSourceInput))));
aiRoutes.post('/ai/operations/:id/cancel', async c => { const body = await jsonInput(c, z.strictObject({ operationId: uuid })); return c.json(await ai.cancelOperation(c.get('socket'), c.get('workspaceId'), uuid.parse(c.req.param('id')), body.operationId)); });
aiRoutes.get('/ai/operations/:id', async c => c.json(await ai.viewOperation(c.get('db'), c.get('workspaceId'), uuid.parse(c.req.param('id')))));
