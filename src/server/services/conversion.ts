import { and, asc, eq, inArray, isNull, lt, lte, notExists, or, sql } from 'drizzle-orm';
import { socketDb, transaction, type ReadDb, type SocketDb } from '../db/client';
import { materialVersions, fileObjects, blocks } from '../db/schema';
import type { BackendBindings } from '../config';
import { ApiError, conflict, notFound } from '../errors';
import { hash, insertBlocks, MAX_CONVERSION_ATTEMPTS, ownVersion, prepareBlocks, publicVersion } from './materials';
import { mimeTypes, storageDeadline } from './storage';
import { collectImages, mapDocument, DATALAB_ADAPTER_VERSION, type DatalabResult } from './documents/datalab';
import { afterVersionReady } from './outline/queue';
import { courseJobsDue, runCourseJobs } from './outline/jobs';

/**
 * Asynchronous conversion jobs for PDF, DOCX and PPTX versions.
 *
 * A version is published `pending`. Submission runs outside the publish
 * transaction, from `waitUntil` after finalize or retry, and from the cron
 * sweep as a safety net. Each step first takes a short lease on the version
 * row, so two workers never submit or complete the same version. Polling
 * advances when the status endpoint or the sweep finds a `processing`
 * version whose next poll time has passed. Webhooks are not used, because
 * they cannot reach a development machine.
 */
const API = 'https://www.datalab.to/api/v1/convert';
const LEASE_MS = 120_000;
const TIMEOUT_MS = 30 * 60_000;
type Version = typeof materialVersions.$inferSelect;

const MESSAGES = {
  notConfigured:
    'Document conversion is not configured. The original is stored, and you can try again once conversion is set up.',
  rejectedKey:
    'The conversion service did not accept the configured key. The original is stored, and you can try again once the key is fixed.',
  unreadable: 'The conversion service could not read this file. The original is stored and can still be downloaded.',
  unavailable: 'The conversion service did not respond. The original is stored, and you can try again later.',
  failed: 'The conversion service could not convert this file. The original is stored, and you can try again.',
  timedOut: 'Conversion took too long and was stopped. The original is stored, and you can try again.',
  expired: 'The conversion result expired before it was saved. Try again to convert the original.',
  nothing: 'No page of this document could be converted. The original is stored and can still be downloaded.',
  exhausted: 'Conversion failed after several attempts. The original is stored and can still be downloaded.',
} as const;

/** Whether a version is due for a step that a status read or the sweep should start. */
export function conversionDue(
  row: Pick<Version, 'adapter' | 'status' | 'leaseExpiresAt' | 'nextPollAt'>,
  now = Date.now(),
) {
  return (
    row.adapter === 'datalab' &&
    (row.status === 'pending' || row.status === 'processing') &&
    (!row.leaseExpiresAt || row.leaseExpiresAt.getTime() <= now) &&
    (!row.nextPollAt || row.nextPollAt.getTime() <= now)
  );
}

/** Advance one version by one step on its own connection. Safe to call from `waitUntil`. */
export async function advance(env: BackendBindings, versionId: string) {
  if (!env.DATABASE_URL) return;
  const connection = socketDb(env.DATABASE_URL);
  let scope: { workspaceId: string; courseId: string } | null = null;
  try {
    await step(connection.db, env, versionId);
    // A version that just became readable may have queued an outline job.
    const [row] = await connection.db
      .select({
        workspaceId: materialVersions.workspaceId,
        courseId: materialVersions.courseId,
        status: materialVersions.status,
      })
      .from(materialVersions)
      .where(eq(materialVersions.id, versionId));
    if (row && (row.status === 'ready' || row.status === 'partial') && (await courseJobsDue(connection.db, row)))
      scope = row;
  } catch (error) {
    console.log(
      JSON.stringify({
        operation: 'conversion',
        versionId,
        error: error instanceof ApiError ? error.code : 'unexpected',
      }),
    );
  } finally {
    await connection.close();
  }
  if (scope) await runCourseJobs(env, scope);
}

/** The cron safety net: pending submissions and processing polls that are due. */
export async function sweepConversions(db: SocketDb, env: BackendBindings, limit = 10) {
  const now = new Date();
  const due = await db
    .select({ id: materialVersions.id })
    .from(materialVersions)
    .where(
      and(
        eq(materialVersions.adapter, 'datalab'),
        inArray(materialVersions.status, ['pending', 'processing']),
        or(isNull(materialVersions.nextPollAt), lte(materialVersions.nextPollAt, now)),
        or(isNull(materialVersions.leaseExpiresAt), lte(materialVersions.leaseExpiresAt, now)),
      ),
    )
    .orderBy(asc(materialVersions.createdAt))
    .limit(limit);
  let advanced = 0;
  for (const row of due) {
    try {
      await step(db, env, row.id);
      advanced++;
    } catch {
      /* The next sweep retries. */
    }
  }
  return { conversions: advanced };
}

/** Start a failed conversion again from the same original. */
export async function retryConversion(
  db: SocketDb,
  env: BackendBindings,
  workspaceId: string,
  materialId: string,
  versionId: string,
) {
  return transaction(db, async tx => {
    await ownVersion(tx, workspaceId, materialId, versionId);
    const [row] = await tx.select().from(materialVersions).where(eq(materialVersions.id, versionId)).for('update');
    if (!row || row.adapter !== 'datalab') throw notFound();
    if (row.status === 'pending' || row.status === 'processing') return publicVersion(row);
    if (row.status !== 'failed') throw conflict();
    if (row.attempts >= MAX_CONVERSION_ATTEMPTS) throw new ApiError(409, 'conversion_exhausted', MESSAGES.exhausted);
    if (!env.DATALAB_API_KEY) throw new ApiError(503, 'conversion_not_configured', MESSAGES.notConfigured);
    const [saved] = await tx
      .update(materialVersions)
      .set({
        status: 'pending',
        failure: null,
        warnings: [],
        failedPages: [],
        completionFailures: 0,
        providerRequestId: null,
        submittedAt: null,
        nextPollAt: null,
        leaseToken: null,
        leaseExpiresAt: null,
      })
      .where(eq(materialVersions.id, versionId))
      .returning();
    return publicVersion(saved!);
  });
}

async function fail(db: SocketDb, id: string, token: string | null, failure: string) {
  await db
    .update(materialVersions)
    .set({ status: 'failed', failure, leaseToken: null, leaseExpiresAt: null, nextPollAt: null })
    .where(
      and(
        eq(materialVersions.id, id),
        token ? eq(materialVersions.leaseToken, token) : isNull(materialVersions.leaseToken),
      ),
    );
}
async function release(db: SocketDb, id: string, token: string, fields: Partial<Version>) {
  await db
    .update(materialVersions)
    .set({ ...fields, leaseToken: null, leaseExpiresAt: null })
    .where(and(eq(materialVersions.id, id), eq(materialVersions.leaseToken, token)));
}

async function step(db: SocketDb, env: BackendBindings, versionId: string) {
  const claim = await transaction(db, async tx => {
    const [row] = await tx.select().from(materialVersions).where(eq(materialVersions.id, versionId)).for('update');
    if (!row || !conversionDue(row)) return null;
    if (!env.DATALAB_API_KEY) {
      await tx
        .update(materialVersions)
        .set({ status: 'failed', failure: MESSAGES.notConfigured, nextPollAt: null })
        .where(eq(materialVersions.id, versionId));
      return null;
    }
    if (row.status === 'pending' && row.attempts >= MAX_CONVERSION_ATTEMPTS) {
      await tx
        .update(materialVersions)
        .set({ status: 'failed', failure: MESSAGES.exhausted, nextPollAt: null })
        .where(eq(materialVersions.id, versionId));
      return null;
    }
    const token = crypto.randomUUID();
    const [leased] = await tx
      .update(materialVersions)
      .set({
        leaseToken: token,
        leaseExpiresAt: new Date(Date.now() + LEASE_MS),
        ...(row.status === 'pending' ? { attempts: row.attempts + 1 } : {}),
      })
      .where(eq(materialVersions.id, versionId))
      .returning();
    return { row: leased!, token };
  });
  if (!claim) return;
  if (claim.row.status === 'pending') await submit(db, env, claim.row, claim.token);
  else await poll(db, env, claim.row, claim.token);
}

async function submit(db: SocketDb, env: BackendBindings, row: Version, token: string) {
  const [original] = row.sourceObjectId
    ? await db
        .select()
        .from(fileObjects)
        .where(and(eq(fileObjects.workspaceId, row.workspaceId), eq(fileObjects.id, row.sourceObjectId)))
    : [];
  if (!original || !env.MATERIALS_BUCKET) return fail(db, row.id, token, MESSAGES.unavailable);
  const object = await storageDeadline(env.MATERIALS_BUCKET.get(original.key), 30000);
  if (!object) return fail(db, row.id, token, MESSAGES.unreadable);
  const form = new FormData();
  form.set(
    'file',
    new Blob([await object.arrayBuffer()], { type: mimeTypes[row.format] ?? 'application/octet-stream' }),
    original.fileName,
  );
  form.set('output_format', 'json');
  form.set('mode', 'balanced');
  let response: Response;
  try {
    response = await fetch(API, {
      method: 'POST',
      headers: { 'X-API-Key': env.DATALAB_API_KEY! },
      body: form,
      signal: AbortSignal.timeout(60000),
    });
  } catch {
    return fail(db, row.id, token, MESSAGES.unavailable);
  }
  const body = (await response.json().catch(() => null)) as { success?: boolean; request_id?: string } | null;
  console.log(JSON.stringify({ operation: 'conversion-submit', versionId: row.id, status: response.status }));
  if (response.status === 429)
    return release(db, row.id, token, { attempts: row.attempts - 1, nextPollAt: new Date(Date.now() + 60000) });
  if (response.status === 401 || response.status === 403) return fail(db, row.id, token, MESSAGES.rejectedKey);
  if (response.status === 400 || response.status === 413 || response.status === 422)
    return fail(db, row.id, token, MESSAGES.unreadable);
  if (!response.ok || !body?.success || !body.request_id || !/^[\w-]{1,200}$/.test(body.request_id))
    return fail(db, row.id, token, MESSAGES.unavailable);
  const now = Date.now();
  await release(db, row.id, token, {
    status: 'processing',
    providerRequestId: body.request_id,
    submittedAt: new Date(now),
    nextPollAt: new Date(now + 4000),
  });
}

async function poll(db: SocketDb, env: BackendBindings, row: Version, token: string) {
  const started = row.submittedAt?.getTime() ?? Date.now();
  if (!row.providerRequestId) return fail(db, row.id, token, MESSAGES.failed);
  let response: Response;
  try {
    response = await fetch(`${API}/${encodeURIComponent(row.providerRequestId)}`, {
      headers: { 'X-API-Key': env.DATALAB_API_KEY! },
      signal: AbortSignal.timeout(60000),
    });
  } catch {
    response = new Response(null, { status: 599 });
  }
  const late = Date.now() - started > TIMEOUT_MS;
  // Back off gently: every few seconds at first, then every fifteen.
  const later = () => new Date(Date.now() + (Date.now() - started < 120000 ? 4000 : 15000));
  if (response.status === 404) return fail(db, row.id, token, MESSAGES.expired);
  if (response.status === 401 || response.status === 403) return fail(db, row.id, token, MESSAGES.rejectedKey);
  if (!response.ok) {
    await response.body?.cancel();
    return late
      ? fail(db, row.id, token, MESSAGES.timedOut)
      : release(db, row.id, token, { nextPollAt: new Date(Date.now() + 30000) });
  }
  const result = (await response.json().catch(() => null)) as DatalabResult | null;
  if (!result) return release(db, row.id, token, { nextPollAt: later() });
  if (result.status === 'processing')
    return late ? fail(db, row.id, token, MESSAGES.timedOut) : release(db, row.id, token, { nextPollAt: later() });
  if (result.status !== 'complete' || !result.success || !result.json) {
    console.log(
      JSON.stringify({ operation: 'conversion-failed', versionId: row.id, providerStatus: result.status ?? null }),
    );
    return fail(db, row.id, token, MESSAGES.failed);
  }
  try {
    await complete(db, env, row, token, result);
  } catch (error) {
    // A lost lease or slow storage is picked up by the next poll. Any other failure to save a finished
    // result is counted, and the second one fails the version so it does not poll until the result expires.
    if (error instanceof ApiError && (error.code === 'lease_lost' || error.code === 'storage_timeout')) throw error;
    const failures = row.completionFailures + 1;
    console.log(
      JSON.stringify({
        operation: 'conversion-complete-failed',
        versionId: row.id,
        failures,
        error: error instanceof ApiError ? error.code : 'unexpected',
      }),
    );
    await release(
      db,
      row.id,
      token,
      failures >= 2
        ? { status: 'failed', failure: MESSAGES.failed, completionFailures: failures, nextPollAt: null }
        : { completionFailures: failures, nextPollAt: new Date(Date.now() + 10000) },
    );
  }
}

/** Store the raw response and images, map to blocks, and publish them in one transaction. */
async function complete(db: SocketDb, env: BackendBindings, row: Version, token: string, result: DatalabResult) {
  const bucket = env.MATERIALS_BUCKET;
  if (!bucket) return release(db, row.id, token, { nextPollAt: new Date(Date.now() + 60000) });
  const stored: {
    id: string;
    key: string;
    size: number;
    type: string;
    checksum: string;
    etag: string;
    fileName: string;
    role: 'asset' | 'raw';
  }[] = [];
  const written: string[] = [];
  const put = async (
    role: 'asset' | 'raw',
    bytes: Uint8Array,
    type: string,
    fileName: string,
    id: string = crypto.randomUUID(),
  ) => {
    const key = `${role === 'raw' ? 'raw' : 'assets'}/${row.workspaceId}/${id}`;
    // Recorded before the write, so a write that times out but lands later is still removed.
    written.push(key);
    const object = await storageDeadline(bucket.put(key, bytes, { httpMetadata: { contentType: type } }), 30000);
    stored.push({ id, key, size: bytes.length, type, checksum: await hash(bytes), etag: object.etag, fileName, role });
  };
  try {
    // Ids are assigned first, so only images that a kept figure block shows are stored.
    const images = new Map<string, { id: string; bytes: Uint8Array; type: string }>();
    for (const [name, data] of collectImages(result)) {
      const image = decodeImage(data);
      if (image) images.set(name, { id: crypto.randomUUID(), ...image });
    }
    const mapped = mapDocument(result, new Map([...images].map(([name, image]) => [name, image.id])));
    const prepared = prepareBlocks(mapped.blocks);
    const shown = new Set(
      prepared.blocks.flatMap(b => (b.type === 'figure' && b.content.assetId ? [b.content.assetId] : [])),
    );
    await put('raw', new TextEncoder().encode(JSON.stringify(result)), 'application/json', `${row.id}.json`);
    for (const [name, image] of images)
      if (shown.has(image.id)) await put('asset', image.bytes, image.type, name.slice(0, 200), image.id);
    const status =
      mapped.failedPages.length || prepared.dropped ? (prepared.blocks.length ? 'partial' : 'failed') : 'ready';
    const warnings = [
      ...mapped.warnings,
      ...prepared.warnings,
      ...(prepared.blocks.length || status === 'failed'
        ? []
        : [{ code: 'empty', message: 'No readable text was found in this document.' }]),
    ];
    await transaction(db, async tx => {
      const [current] = await tx.select().from(materialVersions).where(eq(materialVersions.id, row.id)).for('update');
      if (current?.leaseToken !== token || current.status !== 'processing')
        throw new ApiError(409, 'lease_lost', 'The conversion lease expired.');
      await tx.insert(fileObjects).values(
        stored.map(o => ({
          id: o.id,
          workspaceId: row.workspaceId,
          courseId: row.courseId,
          key: o.key,
          size: o.size,
          detectedType: o.type,
          checksum: o.checksum,
          etag: o.etag,
          fileName: o.fileName,
          role: o.role,
        })),
      );
      const [existing] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(blocks)
        .where(eq(blocks.versionId, row.id));
      if (existing?.n) throw new ApiError(409, 'already_converted', 'This version already has blocks.');
      if (status !== 'failed')
        await insertBlocks(
          tx,
          { workspaceId: row.workspaceId, courseId: row.courseId, materialId: row.materialId, versionId: row.id },
          prepared.blocks,
        );
      if (status !== 'failed' && prepared.blocks.length) await afterVersionReady(tx, row);
      await tx
        .update(materialVersions)
        .set({
          status,
          failure: status === 'failed' ? MESSAGES.nothing : null,
          failedPages: mapped.failedPages,
          warnings,
          pageCount: mapped.pageCount,
          rawObjectId: stored.find(o => o.role === 'raw')!.id,
          adapterVersion: DATALAB_ADAPTER_VERSION,
          leaseToken: null,
          leaseExpiresAt: null,
          nextPollAt: null,
        })
        .where(eq(materialVersions.id, row.id));
    });
    console.log(
      JSON.stringify({
        operation: 'conversion-complete',
        versionId: row.id,
        status,
        blocks: prepared.blocks.length,
        assets: shown.size,
        failedPages: mapped.failedPages.length,
      }),
    );
  } catch (error) {
    // Nothing references these objects when publication fails, including after a lost lease. The next poll tries again.
    for (const key of written) {
      try {
        await storageDeadline(bucket.delete(key), 10000);
      } catch {
        /* The asset sweep cannot see these. */
      }
    }
    throw error;
  }
}

/**
 * Extracted images older than an hour that no figure block shows. Earlier
 * completions stored every image the provider returned, including ones a
 * dropped or skipped block would have shown. The object goes first, so a
 * failed delete keeps its row for the next sweep.
 */
export async function sweepOrphanAssets(db: SocketDb, env: BackendBindings, limit = 25) {
  if (!env.MATERIALS_BUCKET) return { orphanAssets: 0 };
  const rows = await db
    .select({ id: fileObjects.id, key: fileObjects.key })
    .from(fileObjects)
    .where(
      and(
        eq(fileObjects.role, 'asset'),
        lt(fileObjects.createdAt, new Date(Date.now() - 3600000)),
        notExists(
          db
            .select({ id: blocks.id })
            .from(blocks)
            .where(
              and(
                eq(blocks.workspaceId, fileObjects.workspaceId),
                eq(blocks.courseId, fileObjects.courseId),
                eq(blocks.type, 'figure'),
                sql`${blocks.content}->>'assetId' = ${fileObjects.id}::text`,
              ),
            ),
        ),
      ),
    )
    .limit(limit);
  for (const row of rows) {
    await storageDeadline(env.MATERIALS_BUCKET.delete(row.key), 10000);
    await db.delete(fileObjects).where(and(eq(fileObjects.id, row.id), eq(fileObjects.role, 'asset')));
  }
  return { orphanAssets: rows.length };
}

const IMAGE_TYPES: [RegExp, string][] = [
  [/^\x89PNG/, 'image/png'],
  [/^\xff\xd8\xff/, 'image/jpeg'],
  [/^GIF8/, 'image/gif'],
  [/^RIFF....WEBP/s, 'image/webp'],
];
/** Base64 image bytes, accepted only when they are a known raster format within 10 MB. */
function decodeImage(data: string): { bytes: Uint8Array; type: string } | null {
  try {
    const binary = atob(data.replace(/^data:[^,]*,/, ''));
    if (!binary.length || binary.length > 10 * 1048576) return null;
    const type = IMAGE_TYPES.find(([pattern]) => pattern.test(binary.slice(0, 12)))?.[1];
    if (!type) return null;
    return { bytes: Uint8Array.from(binary, c => c.charCodeAt(0)), type };
  } catch {
    return null;
  }
}

/** An extracted image, served only to the owner of a version that shows it. */
export async function readAsset(
  db: ReadDb,
  env: BackendBindings,
  workspaceId: string,
  materialId: string,
  versionId: string,
  assetId: string,
) {
  const version = await ownVersion(db, workspaceId, materialId, versionId);
  const [object] = await db
    .select()
    .from(fileObjects)
    .where(
      and(
        eq(fileObjects.workspaceId, workspaceId),
        eq(fileObjects.courseId, version.courseId),
        eq(fileObjects.id, assetId),
        eq(fileObjects.role, 'asset'),
      ),
    );
  if (!object) throw notFound();
  const [shown] = await db
    .select({ id: blocks.id })
    .from(blocks)
    .where(
      and(
        eq(blocks.workspaceId, workspaceId),
        eq(blocks.versionId, versionId),
        eq(blocks.type, 'figure'),
        sql`${blocks.content}->>'assetId' = ${assetId}`,
      ),
    )
    .limit(1);
  if (!shown || !env.MATERIALS_BUCKET) throw notFound();
  const body = await storageDeadline(env.MATERIALS_BUCKET.get(object.key), 30000);
  if (!body) throw notFound();
  return { body: body.body, type: object.detectedType, size: object.size };
}
