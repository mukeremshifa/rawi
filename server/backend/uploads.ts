import { transaction } from './db';
import { and, asc, eq, isNull, lt, or, sql } from 'drizzle-orm';
import type { z } from 'zod';
import type { uploadInput } from '../../src/shared/materials';
import type { ReadDb, SocketDb, Transaction } from './db';
import type { BackendBindings } from './config';
import { uploads, uploadCandidates, workspaceStorage, materials, fileObjects } from './schema';
import { ApiError, conflict, notFound } from './errors';
import { hash, lockCourse, ownMaterial, ownVersion, publishVersion, setTopics, validateTopics } from './materials';
import { getCourse } from './service';
import { boundedBytes, limits, mimeTypes, signedUrl, storage, storageDeadline, validateFile, verifyStorageTarget } from './storage';

type Upload = typeof uploads.$inferSelect;
const scoped = (workspaceId: string, id: string) => and(eq(uploads.workspaceId, workspaceId), eq(uploads.id, id));
export function publicUpload(row: Upload) {
  return { id: row.id, courseId: row.courseId, materialId: row.materialId, fileName: row.fileName, state: row.state,
    expiresAt: row.expiresAt, resultVersionId: row.resultVersionId, failure: row.failure,
    inProgress: row.state === 'pending' && !!row.leaseExpiresAt && row.leaseExpiresAt.getTime() > Date.now() };
}
async function lockStorage(tx: Transaction, workspaceId: string) {
  await tx.insert(workspaceStorage).values({ workspaceId }).onConflictDoNothing();
  const [row] = await tx.select().from(workspaceStorage).where(eq(workspaceStorage.workspaceId, workspaceId)).for('update');
  return row!;
}
async function lockUpload(tx: Transaction, workspaceId: string, id: string) {
  const [row] = await tx.select().from(uploads).where(scoped(workspaceId, id)).for('update');
  if (!row) throw notFound();
  return row;
}
async function settle(tx: Transaction, row: Upload, actualBytes: number) {
  await tx.update(workspaceStorage).set({ usedBytes: sql`${workspaceStorage.usedBytes} + ${actualBytes}`, reservedBytes: sql`${workspaceStorage.reservedBytes} - ${row.expectedSize}`, pendingCount: sql`${workspaceStorage.pendingCount} - 1` }).where(eq(workspaceStorage.workspaceId, row.workspaceId));
}
async function fail(tx: Transaction, row: Upload, reason: string) {
  if (row.state !== 'pending') return row;
  await settle(tx, row, 0);
  const [failed] = await tx.update(uploads).set({ state: 'failed', failure: reason, leaseToken: null, leaseExpiresAt: null, updatedAt: new Date() }).where(eq(uploads.id, row.id)).returning();
  return failed!;
}
export async function getUpload(db: SocketDb, workspaceId: string, id: string) {
  return transaction(db, async tx => {
    await lockStorage(tx, workspaceId);
    const row = await lockUpload(tx, workspaceId, id);
    return publicUpload(row.state === 'pending' && row.expiresAt.getTime() <= Date.now() ? await fail(tx, row, 'Upload expired. Select the file to start a new upload.') : row);
  });
}
export async function listUploads(db: ReadDb, workspaceId: string, courseId: string, cursor?: string) {
  await getCourse(db, workspaceId, courseId);
  const rows = await db.select().from(uploads).where(and(eq(uploads.workspaceId, workspaceId), eq(uploads.courseId, courseId), eq(uploads.state, 'pending'), cursor ? sql`${uploads.id} > ${cursor}` : undefined)).orderBy(asc(uploads.id)).limit(21);
  return { uploads: rows.slice(0, 20).map(publicUpload), nextCursor: rows.length > 20 ? rows[19]!.id : null };
}
export async function initiate(db: SocketDb, env: BackendBindings, workspaceId: string, courseId: string, input: z.infer<typeof uploadInput>) {
  const max = limits(env);
  // Ownership is checked even if storage configuration is missing.
  await transaction(db, async tx => {
    await lockCourse(tx, workspaceId, courseId);
    if (input.materialId) { const material = await ownMaterial(tx, workspaceId, input.materialId); if (material.courseId !== courseId) throw notFound(); }
    await validateTopics(tx, workspaceId, courseId, input.topicIds);
  });
  if (input.size > max.file || (['txt', 'md'].includes(input.type) && input.size > max.text)) throw new ApiError(400, 'file_limit', 'The file exceeds the permitted size.');
  if (!input.fileName.toLowerCase().endsWith(`.${input.type}`)) throw new ApiError(400, 'invalid_file', 'The filename must match the selected file format.');
  await verifyStorageTarget(env);
  const fingerprint = await hash(JSON.stringify({ ...input, topicIds: [...input.topicIds].sort() }));
  const row = await transaction(db, async tx => {
    const usage = await lockStorage(tx, workspaceId);
    await lockCourse(tx, workspaceId, courseId);
    const [existing] = await tx.select().from(uploads).where(eq(uploads.id, input.requestId)).for('update');
    if (existing) {
      if (existing.workspaceId !== workspaceId || existing.courseId !== courseId) throw notFound();
      if (existing.fingerprint !== fingerprint) throw new ApiError(409, 'create_conflict', 'This upload request was already used for a different file or details.');
      return existing.state === 'pending' && existing.expiresAt.getTime() <= Date.now() ? fail(tx, existing, 'Upload expired. Start a new upload.') : existing;
    }
    if (input.materialId) {
      const material = await ownMaterial(tx, workspaceId, input.materialId);
      if (material.courseId !== courseId) throw notFound();
      if (material.revision !== input.expectedRevision) throw conflict();
    }
    await validateTopics(tx, workspaceId, courseId, input.topicIds);
    if (usage.pendingCount >= max.pending || usage.usedBytes + usage.reservedBytes + input.size > max.workspace) throw new ApiError(409, 'storage_limit', 'The workspace storage or pending upload limit has been reached. Finish pending uploads or wait for them to expire.');
    const [created] = await tx.insert(uploads).values({ id: input.requestId, workspaceId, courseId, materialId: input.materialId ?? crypto.randomUUID(), isNew: !input.materialId,
      fingerprint, fields: { title: input.title, kind: input.kind, attribution: input.attribution, topicIds: input.topicIds }, expectedRevision: input.expectedRevision,
      expectedSize: input.size, expectedType: input.type, checksum: input.checksum, fileName: input.fileName,
      stagingKey: `staging/${workspaceId}/${crypto.randomUUID()}`, expiresAt: new Date(Date.now() + 300000),
    }).onConflictDoNothing().returning();
    if (!created) throw notFound();
    await tx.update(workspaceStorage).set({ reservedBytes: usage.reservedBytes + input.size, pendingCount: usage.pendingCount + 1 }).where(eq(workspaceStorage.workspaceId, workspaceId));
    return created;
  });
  if (row.state !== 'pending') return { upload: publicUpload(row) };
  const type = mimeTypes[row.expectedType]!;
  return { upload: publicUpload(row), url: await signedUrl(env, row.stagingKey, 'PUT', Math.floor((row.expiresAt.getTime() - Date.now()) / 1000), type), headers: { 'Content-Type': type } };
}
export async function finalize(db: SocketDb, env: BackendBindings, workspaceId: string, id: string) {
  const claimed = await transaction(db, async tx => {
    await lockStorage(tx, workspaceId);
    const row = await lockUpload(tx, workspaceId, id);
    await lockCourse(tx, workspaceId, row.courseId);
    if (!row.isNew) { const material = await ownMaterial(tx, workspaceId, row.materialId); if (material.courseId !== row.courseId) throw notFound(); }
    if (row.state !== 'pending') return { row };
    if (row.expiresAt.getTime() <= Date.now()) return { row: await fail(tx, row, 'Upload expired. Start a new upload.') };
    if (row.leaseExpiresAt && row.leaseExpiresAt.getTime() > Date.now()) throw new ApiError(409, 'upload_in_progress', 'This upload is being finalized. Check its status and retry shortly.');
    storage(env);
    const token = crypto.randomUUID(), key = `originals/${workspaceId}/${token}`;
    await tx.insert(uploadCandidates).values({ token, uploadId: id, key });
    const [leased] = await tx.update(uploads).set({ leaseToken: token, leaseExpiresAt: new Date(Date.now() + 90000), updatedAt: new Date() }).where(eq(uploads.id, id)).returning();
    return { row: leased!, token, key };
  });
  if (!claimed.token || !claimed.key) return publicUpload(claimed.row);
  const { row, token, key } = claimed; const bucket = storage(env);
  try {
    // A timed-out transfer may finish its unique candidate, but cannot reach publication.
    const { bytes, content, stored } = await storageDeadline((async () => {
      const head = await bucket.head(row.stagingKey);
      if (!head) throw new ApiError(409, 'upload_missing', 'The file has not arrived. Reselect the same file and retry the upload before it expires.');
      if (head.size !== row.expectedSize || head.size > limits(env).file) throw new ApiError(400, 'invalid_file', 'The uploaded size does not match the reserved file.');
      const snapshot = await bucket.get(row.stagingKey, { onlyIf: { etagMatches: head.etag } });
      if (!snapshot || !('body' in snapshot)) throw new ApiError(409, 'upload_changed', 'The staging file changed. Retry finalization.');
      const bytes = await boundedBytes(snapshot.body, Math.min(row.expectedSize, limits(env).file));
      if (bytes.length !== row.expectedSize || await hash(bytes) !== row.checksum) throw new ApiError(400, 'invalid_file', 'The uploaded bytes do not match the selected file. Start a new upload.');
      const content = await validateFile(bytes, row.expectedType, limits(env).text);
      // Only verified bytes are written. Every attempt has a new key, inaccessible to browser PUTs.
      const stored = await bucket.put(key, bytes, { onlyIf: { etagDoesNotMatch: '*' }, httpMetadata: { contentType: 'application/octet-stream', contentDisposition: 'attachment' }, sha256: row.checksum });
      if (!stored) throw new ApiError(409, 'candidate_conflict', 'Retry finalization with a new storage attempt.');
      return { bytes, content, stored };
    })());
    const result = await transaction(db, async tx => {
      await lockStorage(tx, workspaceId);
      const current = await lockUpload(tx, workspaceId, id);
      if (current.state === 'ready') return publicUpload(current);
      if (current.state !== 'pending' || current.leaseToken !== token || !current.leaseExpiresAt || current.leaseExpiresAt.getTime() <= Date.now() || current.expiresAt.getTime() <= Date.now()) throw new ApiError(409, 'lease_lost', 'The upload lease expired. Check status and retry.');
      const [candidate] = await tx.select().from(uploadCandidates).where(eq(uploadCandidates.token, token));
      if (candidate?.state !== 'candidate') throw new ApiError(409, 'lease_lost', 'This upload attempt is being cleaned up. Retry finalization.');
      await lockCourse(tx, workspaceId, row.courseId);
      let material: typeof materials.$inferSelect;
      if (row.isNew) {
        const { topicIds: _topics, ...fields } = row.fields;
        [material] = await tx.insert(materials).values({ ...fields, id: row.materialId, workspaceId, courseId: row.courseId, createFingerprint: row.fingerprint }).returning() as [typeof materials.$inferSelect];
        await setTopics(tx, workspaceId, row.courseId, material.id, row.fields.topicIds);
      } else {
        material = await ownMaterial(tx, workspaceId, row.materialId);
        if (material.courseId !== row.courseId) throw notFound();
        if (material.revision !== row.expectedRevision) throw conflict();
      }
      const objectId = crypto.randomUUID();
      await tx.insert(fileObjects).values({ id: objectId, workspaceId, courseId: row.courseId, key, size: bytes.length, detectedType: mimeTypes[row.expectedType]!, checksum: row.checksum, etag: stored.etag, fileName: row.fileName });
      const version = await publishVersion(tx, material, { requestId: row.id, fingerprint: row.fingerprint, origin: 'upload', sourceObjectId: objectId, format: row.expectedType, ...content });
      await settle(tx, row, bytes.length);
      await tx.update(uploadCandidates).set({ state: 'published' }).where(eq(uploadCandidates.token, token));
      const [ready] = await tx.update(uploads).set({ state: 'ready', resultVersionId: version.id, leaseToken: null, leaseExpiresAt: null, failure: null, updatedAt: new Date() }).where(eq(uploads.id, id)).returning();
      return publicUpload(ready!);
    });
    // Failure here must not turn a committed publication into an error.
    try { await storageDeadline(bucket.delete(row.stagingKey), 5000); } catch { /* Expiry maintenance retries cleanup. */ }
    return result;
  } catch (error) {
    // Preserve candidate metadata after transfer or ambiguous DB commit. Never delete here.
    try {
      await transaction(db, async tx => {
        await lockStorage(tx, workspaceId); const current = await lockUpload(tx, workspaceId, id);
        if (current.state !== 'pending' || current.leaseToken !== token) return;
        if (error instanceof ApiError && (error.status === 400 || error.code === 'revision_conflict' || error.code === 'not_found')) await fail(tx, current, error.message);
        else await tx.update(uploads).set({ leaseToken: null, leaseExpiresAt: null, updatedAt: new Date() }).where(eq(uploads.id, id));
      });
    } catch { /* Lease expiry recovers after database availability returns. */ }
    throw error;
  }
}
export async function download(db: ReadDb, env: BackendBindings, workspaceId: string, materialId: string, versionId: string) {
  const version = await ownVersion(db, workspaceId, materialId, versionId);
  if (!version.sourceObjectId) return { available: false as const, message: 'This pasted material has no original file.' };
  const [object] = await db.select().from(fileObjects).where(and(eq(fileObjects.workspaceId, workspaceId), eq(fileObjects.courseId, version.courseId), eq(fileObjects.id, version.sourceObjectId)));
  if (!object) throw notFound();
  await verifyStorageTarget(env);
  return { available: true as const, url: await signedUrl(env, object.key, 'GET', 300, undefined, object.fileName), expiresAt: new Date(Date.now() + 300000), fileName: object.fileName };
}

export async function reconcile(db: SocketDb, env: BackendBindings, limit = 25) {
  const now = new Date(); let expired = 0, cleaned = 0;
  const staleLeases = await db.select().from(uploads).where(and(eq(uploads.state, 'pending'), lt(uploads.leaseExpiresAt, now))).limit(limit);
  for (const row of staleLeases) await transaction(db, async tx => {
    const current = await lockUpload(tx, row.workspaceId, row.id);
    if (current.state === 'pending' && current.leaseExpiresAt && current.leaseExpiresAt <= now) await tx.update(uploads).set({ leaseToken: null, leaseExpiresAt: null, updatedAt: new Date() }).where(eq(uploads.id, row.id));
  });
  const abandoned = await db.select().from(uploads).where(and(eq(uploads.state, 'pending'), lt(uploads.expiresAt, now))).orderBy(asc(uploads.expiresAt)).limit(limit);
  for (const row of abandoned) await transaction(db, async tx => {
    await lockStorage(tx, row.workspaceId); const current = await lockUpload(tx, row.workspaceId, row.id);
    if (current.state === 'pending' && current.expiresAt <= now) { await fail(tx, current, 'Upload expired. Start a new upload.'); expired++; }
  });
  // Reservation recovery works even when storage credentials are unavailable.
  if (!env.MATERIALS_BUCKET) return { expired, cleaned };
  const bucket = env.MATERIALS_BUCKET;
  const candidates = await db.select().from(uploadCandidates).where(and(lt(uploadCandidates.createdAt, new Date(Date.now() - 3600000)), or(isNull(uploadCandidates.cleanedAt), lt(uploadCandidates.cleanedAt, new Date(Date.now() - 3600000))), or(eq(uploadCandidates.state, 'candidate'), eq(uploadCandidates.state, 'deleting')))).orderBy(sql`${uploadCandidates.cleanedAt} asc nulls first`, asc(uploadCandidates.createdAt)).limit(limit);
  for (const candidate of candidates) {
    const canDelete = await transaction(db, async tx => {
      const [upload] = await tx.select().from(uploads).where(eq(uploads.id, candidate.uploadId)).for('update');
      if (!upload) return false;
      const [current] = await tx.select().from(uploadCandidates).where(eq(uploadCandidates.token, candidate.token)).for('update');
      if (!current || current.state === 'published') return false;
      if (upload.leaseToken === candidate.token && upload.leaseExpiresAt && upload.leaseExpiresAt > new Date()) return false;
      const [referenced] = await tx.select({ id: fileObjects.id }).from(fileObjects).where(eq(fileObjects.key, candidate.key));
      if (referenced) return false;
      await tx.update(uploadCandidates).set({ state: 'deleting' }).where(eq(uploadCandidates.token, candidate.token));
      if (upload.leaseToken === candidate.token) await tx.update(uploads).set({ leaseToken: null, leaseExpiresAt: null }).where(eq(uploads.id, upload.id));
      return true;
    });
    if (canDelete) {
      await storageDeadline(bucket.delete(candidate.key), 10000);
      // Retain tombstones and sweep again: a delayed, fenced writer may finish after deletion.
      await db.update(uploadCandidates).set({ cleanedAt: new Date() }).where(eq(uploadCandidates.token, candidate.token)); cleaned++;
    }
  }
  const staging = await db.select().from(uploads).where(and(lt(uploads.expiresAt, new Date(Date.now() - 3600000)), isNull(uploads.stagingCleanedAt))).orderBy(asc(uploads.expiresAt)).limit(limit);
  for (const row of staging) { await storageDeadline(bucket.delete(row.stagingKey), 10000); await db.update(uploads).set({ stagingCleanedAt: new Date() }).where(eq(uploads.id, row.id)); cleaned++; }
  return { expired, cleaned };
}
