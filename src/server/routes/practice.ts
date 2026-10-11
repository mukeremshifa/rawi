import { Hono } from 'hono';
import { z } from 'zod';
import { uuid } from '../../shared/contracts/workspace';
import * as learning from '../services/learning';
import { createSetInput, metadataInput, practiceInput, runWriteInput, transitionInput, writeInput, pageQuery } from '../../shared/contracts/learning';
import { fillRun, practise } from '../services/questions/practice';
import { jsonInput, type BackendContext } from '../http';

export const practiceRoutes = new Hono<BackendContext>();
practiceRoutes.post('/courses/:id/practice', async c => {
  const run = await practise(c.get('socket'), c.get('workspaceId'), uuid.parse(c.req.param('id')), await jsonInput(c, practiceInput));
  // Questions still to write are written after the response, and join the run as they pass.
  if (run.pendingItems > 0) c.executionCtx.waitUntil(fillRun(c.env, c.get('workspaceId'), run.id));
  return c.json(run);
});
practiceRoutes.get('/courses/:id/sets', async c => { const q = pageQuery.parse(c.req.query()); return c.json(await learning.listSets(c.get('db'), c.get('workspaceId'), uuid.parse(c.req.param('id')), q.archived, q.limit, q.cursor)); });
practiceRoutes.post('/courses/:id/sets', async c => c.json(await learning.createSet(c.get('socket'), c.get('workspaceId'), uuid.parse(c.req.param('id')), await jsonInput(c, createSetInput))));
practiceRoutes.get('/sets/:id', async c => { const id = uuid.parse(c.req.param('id')); const workspace = c.get('workspaceId'); return c.json({ set: await learning.ownPracticeSet(c.get('db'), workspace, id), items: await learning.setQuestions(c.get('db'), workspace, id) }); });
practiceRoutes.patch('/sets/:id', async c => c.json(await learning.patchSet(c.get('socket'), c.get('workspaceId'), uuid.parse(c.req.param('id')), await jsonInput(c, metadataInput))));
practiceRoutes.post('/sets/:id/runs', async c => { const input = await jsonInput(c, z.strictObject({ id: uuid, plannedSessionId: uuid.optional() })); return c.json(await learning.startRun(c.get('socket'), c.get('workspaceId'), uuid.parse(c.req.param('id')), input.id, input.plannedSessionId)); });
practiceRoutes.get('/runs/:id', async c => c.json(await learning.getRun(c.get('socket'), c.get('workspaceId'), uuid.parse(c.req.param('id')))));
practiceRoutes.put('/runs/:id/answers', async c => c.json(await learning.writeRun(c.get('socket'), c.get('workspaceId'), uuid.parse(c.req.param('id')), await jsonInput(c, runWriteInput), false)));
practiceRoutes.post('/runs/:id/submit', async c => c.json(await learning.writeRun(c.get('socket'), c.get('workspaceId'), uuid.parse(c.req.param('id')), await jsonInput(c, runWriteInput), true)));
practiceRoutes.post('/runs/:id/transition', async c => c.json(await learning.transition(c.get('socket'), c.get('workspaceId'), uuid.parse(c.req.param('id')), await jsonInput(c, transitionInput))));
practiceRoutes.get('/courses/:id/runs', async c => { const q = pageQuery.parse(c.req.query()); return c.json(await learning.activeRuns(c.get('db'), c.get('workspaceId'), uuid.parse(c.req.param('id')), q.limit, q.cursor)); });
practiceRoutes.get('/courses/:id/attempts', async c => { const q = pageQuery.parse(c.req.query()); return c.json(await learning.history(c.get('db'), c.get('workspaceId'), uuid.parse(c.req.param('id')), q.limit, q.cursor)); });
practiceRoutes.get('/attempts/:id', async c => c.json(await learning.attempt(c.get('db'), c.get('workspaceId'), uuid.parse(c.req.param('id')))));
practiceRoutes.post('/runs/:id/revisit', async c => c.json(await learning.revisitFlashcards(c.get('socket'), c.get('workspaceId'), uuid.parse(c.req.param('id')), await jsonInput(c, writeInput))));
