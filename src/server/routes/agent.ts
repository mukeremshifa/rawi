import { Hono } from 'hono';
import { uuid } from '../../shared/contracts/workspace';
import { goalInput, goalPatch } from '../../shared/contracts/agent';
import { agentView, runAgentWith } from '../services/agent/loop';
import { createGoal, patchGoal } from '../services/agent/goals';
import { jsonInput, type BackendContext } from '../http';

export const agentRoutes = new Hono<BackendContext>();
agentRoutes.get('/agent', async c => c.json(await agentView(c.get('db'), c.get('workspaceId'))));
/** The student asks Rawi to look now. A run started less than a minute ago stands instead. */
agentRoutes.post('/agent/run', async c => {
  const started = await runAgentWith(c.env, c.get('socket'), c.get('workspaceId'), 'student');
  return c.json({ started: !!started, view: await agentView(c.get('socket'), c.get('workspaceId')) });
});
agentRoutes.post('/courses/:id/goals', async c =>
  c.json(
    await createGoal(
      c.get('socket'),
      c.get('workspaceId'),
      uuid.parse(c.req.param('id')),
      await jsonInput(c, goalInput),
    ),
  ),
);
agentRoutes.patch('/goals/:id', async c =>
  c.json(
    await patchGoal(
      c.get('socket'),
      c.get('workspaceId'),
      uuid.parse(c.req.param('id')),
      await jsonInput(c, goalPatch),
    ),
  ),
);
