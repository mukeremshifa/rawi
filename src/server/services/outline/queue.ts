import { and, eq } from 'drizzle-orm';
import { materials, outlineJobs, sections, topicSections } from '../../db/schema';
import type { Transaction } from '../../db/client';
import type { OutlineJobKind } from '../../../shared/contracts/outline';
import { enqueueIngest } from '../knowledge/ingest';

type Scope = { workspaceId: string; courseId: string };

/** Queue a job unless the same work is already waiting. */
export async function enqueueJob(tx: Transaction, scope: Scope, kind: OutlineJobKind, target: { materialId: string; versionId: string } | null = null) {
  const waiting = await tx.select({ id: outlineJobs.id, versionId: outlineJobs.versionId }).from(outlineJobs).where(and(eq(outlineJobs.workspaceId, scope.workspaceId), eq(outlineJobs.courseId, scope.courseId), eq(outlineJobs.kind, kind), eq(outlineJobs.state, 'queued')));
  if (waiting.some(j => kind === 'assign_topics' || j.versionId === (target?.versionId ?? null))) return;
  await tx.insert(outlineJobs).values({ id: crypto.randomUUID(), ...scope, kind, materialId: target?.materialId ?? null, versionId: target?.versionId ?? null });
}

/**
 * Called in the transaction that makes a version ready or partial. Every version is read into
 * the knowledge layer, and topics are assigned once that finishes. The syllabus is also read
 * for its topics and assessments.
 */
export async function afterVersionReady(tx: Transaction, version: Scope & { materialId: string; id: string }) {
  const scope = { workspaceId: version.workspaceId, courseId: version.courseId };
  const [material] = await tx.select({ kind: materials.kind }).from(materials).where(eq(materials.id, version.materialId));
  if (!material) return;
  await enqueueIngest(tx, { ...scope, materialId: version.materialId, id: version.id });
  if (material.kind === 'syllabus') await enqueueJob(tx, scope, 'read_syllabus', { materialId: version.materialId, versionId: version.id });
}

/**
 * After a syllabus reading changes the topics, suggested links are cleared and every section is
 * assigned again. A student's own links and removals stay.
 */
export async function reassignAll(tx: Transaction, scope: Scope) {
  await tx.delete(topicSections).where(and(eq(topicSections.workspaceId, scope.workspaceId), eq(topicSections.courseId, scope.courseId), eq(topicSections.origin, 'suggested'), eq(topicSections.removed, false)));
  await tx.update(sections).set({ topicsAt: null }).where(and(eq(sections.workspaceId, scope.workspaceId), eq(sections.courseId, scope.courseId)));
  await enqueueJob(tx, scope, 'assign_topics');
}
