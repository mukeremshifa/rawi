import { Hono } from 'hono';
import { z } from 'zod';
import { createCourseInput, coursePatch, uuid } from '../../shared/contracts/workspace';
import * as service from '../services/workspace';
import * as outline from '../services/outline/outline';
import * as jobs from '../services/outline/jobs';
import { outlineCorrection, outlineUndo, scopeInput, scopePatch } from '../../shared/contracts/outline';
import * as scopes from '../services/scopes';
import { jsonInput, type BackendContext } from '../http';
import { ingestPending } from '../services/knowledge/ingest';

export const coursesRoutes = new Hono<BackendContext>();
coursesRoutes.get('/courses', async c => {
  const query = z.strictObject({ archived: z.enum(['true', 'false', 'all']).default('false'), limit: z.coerce.number().int().min(1).max(100).default(30), cursor: uuid.optional() }).parse(c.req.query());
  return c.json(await service.listCourses(c.get('db'), c.get('workspaceId'), query.archived, query.limit, query.cursor));
});
coursesRoutes.post('/courses', async c => c.json(await service.createCourse(c.get('socket'), c.get('workspaceId'), await jsonInput(c, createCourseInput))));
coursesRoutes.get('/courses/:id', async c => c.json(await service.getCourse(c.get('db'), c.get('workspaceId'), uuid.parse(c.req.param('id')))));
coursesRoutes.patch('/courses/:id', async c => c.json(await service.updateCourse(c.get('socket'), c.get('workspaceId'), uuid.parse(c.req.param('id')), await jsonInput(c, coursePatch))));
coursesRoutes.get('/courses/:id/topics', async c => c.json(await service.getOutline(c.get('db'), c.get('workspaceId'), uuid.parse(c.req.param('id')))));
// Reading the outline advances any due outline job in the background. The course page polls this while one runs.
coursesRoutes.get('/courses/:id/outline', async c => {
  const scope = { workspaceId: c.get('workspaceId'), courseId: uuid.parse(c.req.param('id')) };
  const view = await outline.outlineView(c.get('db'), scope.workspaceId, scope.courseId);
  if (view.pending) c.executionCtx.waitUntil(jobs.runCourseJobs(c.env, scope));
  else if (await ingestPending(c.get('db'), scope)) c.executionCtx.waitUntil(jobs.runCourseJobs(c.env, scope));
  return c.json(view);
});
coursesRoutes.post('/courses/:id/outline/corrections', async c => c.json(await outline.correctOutline(c.get('socket'), c.get('workspaceId'), uuid.parse(c.req.param('id')), await jsonInput(c, outlineCorrection))));
coursesRoutes.post('/courses/:id/outline/undo', async c => {
  const input = await jsonInput(c, outlineUndo);
  return c.json(await outline.undoCorrection(c.get('socket'), c.get('workspaceId'), uuid.parse(c.req.param('id')), input.operationId, input.changeId));
});
coursesRoutes.post('/courses/:id/outline/read', async c => {
  const scope = { workspaceId: c.get('workspaceId'), courseId: uuid.parse(c.req.param('id')) };
  const view = await jobs.readAgain(c.get('socket'), scope);
  c.executionCtx.waitUntil(jobs.runCourseJobs(c.env, scope));
  return c.json(view);
});
coursesRoutes.get('/courses/:id/scopes', async c => c.json(await scopes.listScopes(c.get('db'), c.get('workspaceId'), uuid.parse(c.req.param('id')))));
coursesRoutes.post('/courses/:id/scopes', async c => c.json(await scopes.ensureScope(c.get('socket'), c.get('workspaceId'), uuid.parse(c.req.param('id')), await jsonInput(c, scopeInput))));
coursesRoutes.get('/scopes/:id', async c => c.json(await scopes.scopeView(c.get('db'), c.get('workspaceId'), uuid.parse(c.req.param('id')))));
coursesRoutes.patch('/scopes/:id', async c => c.json(await scopes.patchScope(c.get('socket'), c.get('workspaceId'), uuid.parse(c.req.param('id')), await jsonInput(c, scopePatch))));
