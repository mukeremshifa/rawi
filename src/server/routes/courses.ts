import { Hono } from 'hono';
import { z } from 'zod';
import { createCourseInput, coursePatch, replaceOutlineInput, uuid } from '../../shared/contracts/workspace';
import * as service from '../services/workspace';
import { jsonInput, type BackendContext } from '../http';

export const coursesRoutes = new Hono<BackendContext>();
coursesRoutes.get('/courses', async c => {
  const query = z.strictObject({ archived: z.enum(['true', 'false', 'all']).default('false'), limit: z.coerce.number().int().min(1).max(100).default(30), cursor: uuid.optional() }).parse(c.req.query());
  return c.json(await service.listCourses(c.get('db'), c.get('workspaceId'), query.archived, query.limit, query.cursor));
});
coursesRoutes.post('/courses', async c => c.json(await service.createCourse(c.get('socket'), c.get('workspaceId'), await jsonInput(c, createCourseInput))));
coursesRoutes.get('/courses/:id', async c => c.json(await service.getCourse(c.get('db'), c.get('workspaceId'), uuid.parse(c.req.param('id')))));
coursesRoutes.patch('/courses/:id', async c => c.json(await service.updateCourse(c.get('socket'), c.get('workspaceId'), uuid.parse(c.req.param('id')), await jsonInput(c, coursePatch))));
coursesRoutes.get('/courses/:id/topics', async c => c.json(await service.getOutline(c.get('db'), c.get('workspaceId'), uuid.parse(c.req.param('id')))));
coursesRoutes.put('/courses/:id/topics', async c => {
  const input = await jsonInput(c, replaceOutlineInput);
  return c.json(await service.replaceTopics(c.get('socket'), c.get('workspaceId'), uuid.parse(c.req.param('id')), input.expectedRevision, input.topics, input.operationId));
});
