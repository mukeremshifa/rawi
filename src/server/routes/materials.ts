import { Hono } from 'hono';
import { z } from 'zod';
import { uuid } from '../../shared/contracts/workspace';
import { createMaterialInput, materialPatch, uploadInput, materialListInput, pageInput } from '../../shared/contracts/materials';
import * as materialService from '../services/materials';
import * as uploadService from '../services/uploads';
import { limits } from '../services/storage';
import { jsonInput, type BackendContext } from '../http';

export const materialsRoutes = new Hono<BackendContext>();
materialsRoutes.get('/courses/:id/materials', async c => c.json(await materialService.listMaterials(c.get('db'), c.get('workspaceId'), uuid.parse(c.req.param('id')), materialListInput.parse(c.req.query()))));
materialsRoutes.post('/courses/:id/materials', async c => c.json(await materialService.createMaterial(c.get('socket'), c.get('workspaceId'), uuid.parse(c.req.param('id')), await jsonInput(c, createMaterialInput), limits(c.env).text)));
materialsRoutes.get('/materials/:id', async c => c.json(await materialService.materialDetail(c.get('db'), c.get('workspaceId'), uuid.parse(c.req.param('id')))));
materialsRoutes.patch('/materials/:id', async c => c.json(await materialService.patchMaterial(c.get('socket'), c.get('workspaceId'), uuid.parse(c.req.param('id')), await jsonInput(c, materialPatch))));
materialsRoutes.get('/materials/:id/versions', async c => {
  const query = pageInput.parse(c.req.query());
  return c.json(await materialService.listVersions(c.get('db'), c.get('workspaceId'), uuid.parse(c.req.param('id')), query.limit, query.cursor));
});
materialsRoutes.get('/materials/:id/versions/:versionId', async c => {
  const query = z.strictObject({ cursor: z.coerce.number().int().min(-1).max(1048576).default(-1) }).parse(c.req.query());
  return c.json(await materialService.versionDetail(c.get('db'), c.get('workspaceId'), uuid.parse(c.req.param('id')), uuid.parse(c.req.param('versionId')), query.cursor));
});
materialsRoutes.get('/materials/:id/versions/:versionId/passages/:passageId', async c => c.json(await materialService.exactPassage(c.get('db'), c.get('workspaceId'), uuid.parse(c.req.param('id')), uuid.parse(c.req.param('versionId')), uuid.parse(c.req.param('passageId')))));
materialsRoutes.get('/courses/:id/uploads', async c => {
  const query = pageInput.parse(c.req.query());
  return c.json(await uploadService.listUploads(c.get('db'), c.get('workspaceId'), uuid.parse(c.req.param('id')), query.cursor));
});
materialsRoutes.post('/courses/:id/uploads', async c => c.json(await uploadService.initiate(c.get('socket'), c.env, c.get('workspaceId'), uuid.parse(c.req.param('id')), await jsonInput(c, uploadInput))));
materialsRoutes.get('/uploads/:id', async c => c.json(await uploadService.getUpload(c.get('socket'), c.get('workspaceId'), uuid.parse(c.req.param('id')))));
materialsRoutes.post('/uploads/:id/finalize', async c => c.json(await uploadService.finalize(c.get('socket'), c.env, c.get('workspaceId'), uuid.parse(c.req.param('id')))));
materialsRoutes.post('/materials/:id/versions/:versionId/download', async c => c.json(await uploadService.download(c.get('db'), c.env, c.get('workspaceId'), uuid.parse(c.req.param('id')), uuid.parse(c.req.param('versionId')))));
