import { Hono } from 'hono';
import { z } from 'zod';
import { uuid } from '../../shared/contracts/workspace';
import {
  createMaterialInput,
  materialPatch,
  uploadInput,
  materialListInput,
  pageInput,
} from '../../shared/contracts/materials';
import * as materialService from '../services/materials';
import * as uploadService from '../services/uploads';
import * as conversion from '../services/conversion';
import { limits } from '../services/storage';
import * as outline from '../services/outline/outline';
import * as jobs from '../services/outline/jobs';
import { coversInput } from '../../shared/contracts/outline';
import { jsonInput, type BackendContext } from '../http';

export const materialsRoutes = new Hono<BackendContext>();
materialsRoutes.get('/courses/:id/materials', async c =>
  c.json(
    await materialService.listMaterials(
      c.get('db'),
      c.get('workspaceId'),
      uuid.parse(c.req.param('id')),
      materialListInput.parse(c.req.query()),
    ),
  ),
);
materialsRoutes.post('/courses/:id/materials', async c => {
  const courseId = uuid.parse(c.req.param('id'));
  const material = await materialService.createMaterial(
    c.get('socket'),
    c.get('workspaceId'),
    courseId,
    await jsonInput(c, createMaterialInput),
    limits(c.env).text,
  );
  c.executionCtx.waitUntil(jobs.runCourseJobs(c.env, { workspaceId: c.get('workspaceId'), courseId }));
  return c.json(material);
});
materialsRoutes.get('/materials/:id/covers', async c =>
  c.json(await outline.getCovers(c.get('db'), c.get('workspaceId'), uuid.parse(c.req.param('id')))),
);
materialsRoutes.post('/materials/:id/covers', async c =>
  c.json(
    await outline.changeCovers(
      c.get('socket'),
      c.get('workspaceId'),
      uuid.parse(c.req.param('id')),
      await jsonInput(c, coversInput),
    ),
  ),
);
materialsRoutes.get('/materials/:id', async c =>
  c.json(await materialService.materialDetail(c.get('db'), c.get('workspaceId'), uuid.parse(c.req.param('id')))),
);
materialsRoutes.patch('/materials/:id', async c =>
  c.json(
    await materialService.patchMaterial(
      c.get('socket'),
      c.get('workspaceId'),
      uuid.parse(c.req.param('id')),
      await jsonInput(c, materialPatch),
    ),
  ),
);
materialsRoutes.get('/materials/:id/versions', async c => {
  const query = pageInput.parse(c.req.query());
  return c.json(
    await materialService.listVersions(
      c.get('db'),
      c.get('workspaceId'),
      uuid.parse(c.req.param('id')),
      query.limit,
      query.cursor,
    ),
  );
});
// Reading the status of a due conversion advances it in the background. The client polls this.
materialsRoutes.get('/materials/:id/versions/:versionId', async c => {
  const row = await materialService.ownVersion(
    c.get('db'),
    c.get('workspaceId'),
    uuid.parse(c.req.param('id')),
    uuid.parse(c.req.param('versionId')),
  );
  if (conversion.conversionDue(row)) c.executionCtx.waitUntil(conversion.advance(c.env, row.id));
  return c.json(materialService.publicVersion(row));
});
materialsRoutes.post('/materials/:id/versions/:versionId/convert', async c => {
  const version = await conversion.retryConversion(
    c.get('socket'),
    c.env,
    c.get('workspaceId'),
    uuid.parse(c.req.param('id')),
    uuid.parse(c.req.param('versionId')),
  );
  c.executionCtx.waitUntil(conversion.advance(c.env, version.id));
  return c.json(version);
});
// Images are served through the Worker with private caching, because signed URLs expire while someone reads.
materialsRoutes.get('/materials/:id/versions/:versionId/assets/:assetId', async c => {
  const asset = await conversion.readAsset(
    c.get('db'),
    c.env,
    c.get('workspaceId'),
    uuid.parse(c.req.param('id')),
    uuid.parse(c.req.param('versionId')),
    uuid.parse(c.req.param('assetId')),
  );
  c.header('Cache-Control', 'private, max-age=86400, immutable');
  c.header('Content-Type', asset.type);
  c.header('Content-Length', String(asset.size));
  c.header('Content-Security-Policy', "default-src 'none'; sandbox");
  return c.body(asset.body);
});
const blockQuery = z.strictObject({
  cursor: z.coerce.number().int().min(-1).max(10000000).default(-1),
  limit: z.coerce.number().int().min(1).max(500).default(200),
  ids: z
    .string()
    .max(8000)
    .transform(value => value.split(','))
    .pipe(z.array(uuid).min(1).max(200))
    .optional(),
});
materialsRoutes.get('/materials/:id/versions/:versionId/blocks', async c =>
  c.json(
    await materialService.readBlocks(
      c.get('db'),
      c.get('workspaceId'),
      uuid.parse(c.req.param('id')),
      uuid.parse(c.req.param('versionId')),
      blockQuery.parse(c.req.query()),
    ),
  ),
);
const originalsQuery = z.strictObject({
  checksums: z
    .string()
    .max(700)
    .transform(value => value.split(','))
    .pipe(
      z
        .array(z.string().regex(/^[a-f0-9]{64}$/))
        .min(1)
        .max(10),
    ),
});
materialsRoutes.get('/courses/:id/originals', async c =>
  c.json(
    await uploadService.findOriginals(
      c.get('db'),
      c.get('workspaceId'),
      uuid.parse(c.req.param('id')),
      originalsQuery.parse(c.req.query()).checksums,
    ),
  ),
);
materialsRoutes.post('/courses/:id/uploads', async c =>
  c.json(
    await uploadService.initiate(
      c.get('socket'),
      c.env,
      c.get('workspaceId'),
      uuid.parse(c.req.param('id')),
      await jsonInput(c, uploadInput),
    ),
  ),
);
materialsRoutes.get('/uploads/:id', async c =>
  c.json(await uploadService.getUpload(c.get('socket'), c.get('workspaceId'), uuid.parse(c.req.param('id')))),
);
materialsRoutes.post('/uploads/:id/finalize', async c => {
  const upload = await uploadService.finalize(
    c.get('socket'),
    c.env,
    c.get('workspaceId'),
    uuid.parse(c.req.param('id')),
  );
  // Conversion starts outside the publish transaction. The cron sweep catches anything this misses.
  if (upload.state === 'ready' && upload.resultVersionId) {
    c.executionCtx.waitUntil(conversion.advance(c.env, upload.resultVersionId));
    c.executionCtx.waitUntil(
      jobs.runCourseJobs(c.env, { workspaceId: c.get('workspaceId'), courseId: upload.courseId }),
    );
  }
  return c.json(upload);
});
materialsRoutes.post('/materials/:id/versions/:versionId/download', async c =>
  c.json(
    await uploadService.download(
      c.get('db'),
      c.env,
      c.get('workspaceId'),
      uuid.parse(c.req.param('id')),
      uuid.parse(c.req.param('versionId')),
    ),
  ),
);
