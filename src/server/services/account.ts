import { eq, sql } from 'drizzle-orm';
import type { BackendBindings } from '../config';
import { transaction, type SocketDb } from '../db/client';
import { preferences, user, workspaces } from '../db/schema';
import { storageDeadline } from './storage';
import { CONSENT_VERSION } from '../../shared/contracts/workspace';
import { notFound } from '../errors';

/** Prefixes under which a workspace's files live in the bucket, each followed by the workspace id. */
const FILE_PREFIXES = ['staging', 'originals', 'assets', 'raw'];

/** Record that the student agreed to the current pilot terms. The time is the server's. */
export async function recordConsent(db: SocketDb, workspaceId: string) {
  const [row] = await db
    .update(preferences)
    .set({ consentVersion: CONSENT_VERSION, consentedAt: new Date() })
    .where(eq(preferences.workspaceId, workspaceId))
    .returning({ consentVersion: preferences.consentVersion, consentedAt: preferences.consentedAt });
  if (!row) throw notFound();
  return { consentVersion: row.consentVersion, consentedAt: row.consentedAt?.toISOString() ?? null };
}

/**
 * Delete an account and everything in it: the user, their sign-in records, the workspace and every
 * course, material, answer, tutor turn, agent action and AI call record, then their files in storage.
 *
 * Most rows go by cascade from the user. A few links between rows of the same workspace (a set's
 * questions, a material's current version, a course's syllabus, sessions on the plan) guard single
 * deletes elsewhere, so they are cleared first, in one transaction. Files are removed after the
 * database commits, so a storage failure never leaves rows pointing at missing files. Any file left
 * behind lives under the deleted workspace's id and is reported in the logs.
 */
export async function deleteAccount(env: BackendBindings, db: SocketDb, userId: string) {
  const workspaceId = await transaction(db, async tx => {
    const [own] = await tx
      .select({ id: workspaces.id })
      .from(workspaces)
      .where(eq(workspaces.ownerUserId, userId))
      .for('update');
    if (own) {
      const w = own.id;
      await tx.execute(sql`update courses set syllabus_material_id = null where workspace_id = ${w}`);
      await tx.execute(sql`update materials set current_version_id = null where workspace_id = ${w}`);
      await tx.execute(sql`delete from learning_sets where workspace_id = ${w}`);
      await tx.execute(sql`delete from tutor_sessions where workspace_id = ${w}`);
      await tx.execute(sql`delete from uploads where workspace_id = ${w}`);
      await tx.execute(sql`delete from planned_sessions where workspace_id = ${w}`);
      await tx.execute(sql`delete from materials where workspace_id = ${w}`);
    }
    await tx.delete(user).where(eq(user.id, userId));
    return own?.id ?? null;
  });
  let filesLeft = 0;
  if (workspaceId && env.MATERIALS_BUCKET) {
    const bucket = env.MATERIALS_BUCKET;
    for (const prefix of FILE_PREFIXES) {
      try {
        let cursor: string | undefined;
        do {
          const page = await storageDeadline(bucket.list({ prefix: `${prefix}/${workspaceId}/`, cursor }), 20000);
          if (page.objects.length) await storageDeadline(bucket.delete(page.objects.map(o => o.key)), 20000);
          cursor = page.truncated ? page.cursor : undefined;
        } while (cursor);
      } catch {
        filesLeft++;
      }
    }
    if (filesLeft)
      console.error(JSON.stringify({ operation: 'account-deletion', workspaceId, failedPrefixes: filesLeft }));
  }
  return { deleted: true, filesComplete: filesLeft === 0 };
}
