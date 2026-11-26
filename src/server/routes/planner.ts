import { Hono } from 'hono';
import { z } from 'zod';
import { uuid } from '../../shared/contracts/workspace';
import * as planning from '../services/planning';
import {
  plannerWrite,
  scheduleWrite,
  assessmentWrite,
  proposalInput,
  checkInInput,
} from '../../shared/contracts/planner';
import { jsonInput, type BackendContext } from '../http';

export const plannerRoutes = new Hono<BackendContext>();
plannerRoutes.get('/planner', async c => c.json(await planning.plannerView(c.get('socket'), c.get('workspaceId'))));
plannerRoutes.get('/progress', async c => c.json(await planning.progress(c.get('socket'), c.get('workspaceId'))));
plannerRoutes.put('/planner/availability', async c =>
  c.json(await planning.saveAvailability(c.get('socket'), c.get('workspaceId'), await jsonInput(c, plannerWrite))),
);
plannerRoutes.put('/planner/sessions', async c =>
  c.json(await planning.saveSession(c.get('socket'), c.get('workspaceId'), await jsonInput(c, scheduleWrite))),
);
plannerRoutes.put('/courses/:id/assessments', async c =>
  c.json(
    await planning.saveAssessment(
      c.get('socket'),
      c.get('workspaceId'),
      uuid.parse(c.req.param('id')),
      await jsonInput(c, assessmentWrite),
    ),
  ),
);
plannerRoutes.post('/planner/check-ins', async c => {
  const body = await jsonInput(c, z.strictObject({ operationId: uuid, checkIn: checkInInput }));
  return c.json(await planning.addCheckIn(c.get('socket'), c.get('workspaceId'), body.operationId, body.checkIn));
});
plannerRoutes.post('/planner/proposals', async c =>
  c.json(await planning.propose(c.get('socket'), c.get('workspaceId'), await jsonInput(c, proposalInput))),
);
plannerRoutes.post('/planner/proposals/:id/apply', async c => {
  const body = await jsonInput(c, z.strictObject({ operationId: uuid }));
  return c.json(
    await planning.applyProposal(
      c.get('socket'),
      c.get('workspaceId'),
      uuid.parse(c.req.param('id')),
      body.operationId,
    ),
  );
});
