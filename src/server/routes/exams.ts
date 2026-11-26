import { Hono } from 'hono';
import { z } from 'zod';
import { uuid } from '../../shared/contracts/workspace';
import * as exams from '../services/exams';
import { createExamInput, examTransitionInput } from '../../shared/contracts/exams';
import { metadataInput, pageQuery } from '../../shared/contracts/learning';
import { jsonInput, type BackendContext } from '../http';

export const examsRoutes = new Hono<BackendContext>();
examsRoutes.get('/courses/:id/exams', async c => {
  const q = pageQuery.parse(c.req.query());
  return c.json(
    await exams.listExams(c.get('db'), c.get('workspaceId'), uuid.parse(c.req.param('id')), q.limit, q.cursor),
  );
});
examsRoutes.post('/courses/:id/exams', async c =>
  c.json(
    await exams.createExam(
      c.get('socket'),
      c.get('workspaceId'),
      uuid.parse(c.req.param('id')),
      await jsonInput(c, createExamInput),
    ),
  ),
);
examsRoutes.patch('/exams/:id', async c =>
  c.json(
    await exams.patchExam(
      c.get('socket'),
      c.get('workspaceId'),
      uuid.parse(c.req.param('id')),
      await jsonInput(c, metadataInput),
    ),
  ),
);
examsRoutes.post('/exams/:id/runs', async c => {
  const input = await jsonInput(c, z.strictObject({ id: uuid, plannedSessionId: uuid.optional() }));
  return c.json(
    await exams.startExam(
      c.env,
      c.get('socket'),
      c.get('workspaceId'),
      uuid.parse(c.req.param('id')),
      input.id,
      input.plannedSessionId,
    ),
  );
});
examsRoutes.post('/runs/:id/exam-transition', async c =>
  c.json(
    await exams.examTransition(
      c.get('socket'),
      c.get('workspaceId'),
      uuid.parse(c.req.param('id')),
      await jsonInput(c, examTransitionInput),
    ),
  ),
);
