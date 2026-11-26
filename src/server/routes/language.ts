import { Hono } from 'hono';
import { z } from 'zod';
import { uuid } from '../../shared/contracts/workspace';
import { firstLanguage, glossaryBuild } from '../../shared/contracts/language';
import { buildGlossary, glossary } from '../services/language/glossary';
import { operation } from '../services/learning';
import { jsonInput, type BackendContext } from '../http';

export const languageRoutes = new Hono<BackendContext>();
languageRoutes.get('/courses/:id/glossary', async c => {
  const q = z.strictObject({ language: firstLanguage }).parse(c.req.query());
  return c.json(await glossary(c.get('db'), c.get('workspaceId'), uuid.parse(c.req.param('id')), q.language));
});
/** Write the glosses still missing, a bounded number per request. */
languageRoutes.post('/courses/:id/glossary', async c => {
  const input = await jsonInput(c, glossaryBuild);
  const courseId = uuid.parse(c.req.param('id'));
  const socket = c.get('socket'),
    workspaceId = c.get('workspaceId');
  const built = await buildGlossary(c.env, socket, workspaceId, courseId, input.language, {
    operationId: input.operationId,
  });
  // Recorded once, so a repeated request returns the same result without writing again.
  await operation(socket, workspaceId, input.operationId, { action: 'glossary', courseId, input }, async () => built);
  return c.json({ ...built, view: await glossary(socket, workspaceId, courseId, input.language) });
});
