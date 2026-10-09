import { and, eq } from 'drizzle-orm';
import { courses, materials, outlineJobs, topics } from '../../db/schema';
import type { Transaction } from '../../db/client';
import type { OutlineJobKind } from '../../../shared/contracts/outline';
import { readyMaterials } from './links';

type Scope = { workspaceId: string; courseId: string };

/** Queue a job unless the same work is already waiting. */
export async function enqueueJob(tx: Transaction, scope: Scope, kind: OutlineJobKind, target: { materialId: string; versionId: string } | null = null) {
  const waiting = await tx.select({ id: outlineJobs.id, versionId: outlineJobs.versionId }).from(outlineJobs).where(and(eq(outlineJobs.workspaceId, scope.workspaceId), eq(outlineJobs.courseId, scope.courseId), eq(outlineJobs.kind, kind), eq(outlineJobs.state, 'queued')));
  if (waiting.some(j => kind === 'draft_outline' || j.versionId === (target?.versionId ?? null))) return;
  await tx.insert(outlineJobs).values({ id: crypto.randomUUID(), ...scope, kind, materialId: target?.materialId ?? null, versionId: target?.versionId ?? null });
}

/**
 * Called in the transaction that makes a version ready or partial. The
 * syllabus is read. Another material is mapped once the course has topics.
 * Without a syllabus or topics, the second ready material drafts an outline.
 */
export async function afterVersionReady(tx: Transaction, version: Scope & { materialId: string; id: string }) {
  const scope = { workspaceId: version.workspaceId, courseId: version.courseId };
  const [course] = await tx.select({ syllabus: courses.syllabusMaterialId }).from(courses).where(and(eq(courses.workspaceId, scope.workspaceId), eq(courses.id, scope.courseId)));
  const [material] = await tx.select({ kind: materials.kind }).from(materials).where(eq(materials.id, version.materialId));
  if (!course || !material) return;
  if (material.kind === 'syllabus') { await enqueueJob(tx, scope, 'read_syllabus', { materialId: version.materialId, versionId: version.id }); return; }
  const [topic] = await tx.select({ id: topics.id }).from(topics).where(and(eq(topics.workspaceId, scope.workspaceId), eq(topics.courseId, scope.courseId))).limit(1);
  if (topic) { await enqueueJob(tx, scope, 'map_material', { materialId: version.materialId, versionId: version.id }); return; }
  if (!course.syllabus && (await readyMaterials(tx, scope, null)).length >= 2) await enqueueJob(tx, scope, 'draft_outline');
}

/** After an outline is created or replaced by a job, map every ready material once. */
export async function remapAll(tx: Transaction, scope: Scope, syllabusId: string | null) {
  const ready = await readyMaterials(tx, scope, syllabusId);
  // Older queued mappings are superseded by these.
  await tx.update(outlineJobs).set({ state: 'done', result: { provider: 'rules', links: 0 }, updatedAt: new Date() })
    .where(and(eq(outlineJobs.workspaceId, scope.workspaceId), eq(outlineJobs.courseId, scope.courseId), eq(outlineJobs.kind, 'map_material'), eq(outlineJobs.state, 'queued')));
  for (const m of ready) await tx.insert(outlineJobs).values({ id: crypto.randomUUID(), ...scope, kind: 'map_material', materialId: m.id, versionId: m.versionId });
  return ready.length;
}
