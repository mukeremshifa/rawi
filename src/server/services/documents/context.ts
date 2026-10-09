import { and, asc, eq, inArray } from 'drizzle-orm';
import { blocks, materials, materialVersions } from '../../db/schema';
import type { ReadDb, Transaction } from '../../db/client';
import { usableStatus, type Citation } from '../../../shared/contracts/document';
import { AI_LIMITS, type AiPassage } from '../../../shared/domain/ai';
import type { ContextMaterial } from '../../../shared/domain/ai-context';
import { blockMarkdown, groupPassages, spansText } from '../../../shared/domain/document-text';
import type { StudyMaterial } from '../../../shared/domain/types';
import { citationBlocks } from '../materials';

/**
 * Block text for model context. Only this module reads block content for AI,
 * and only for the materials a request actually uses. Only ready and partial
 * versions contribute.
 */
export async function contextMaterials(tx: ReadDb | Transaction, workspaceId: string, courseId: string, chosen: StudyMaterial[]): Promise<ContextMaterial[]> {
  const usable = chosen.filter(m => m.courseId === courseId && m.readable && !m.archived);
  if (!usable.length) return [];
  const versions = await tx.select({ materialId: materials.id, versionId: materialVersions.id, status: materialVersions.status }).from(materials)
    .innerJoin(materialVersions, eq(materialVersions.id, materials.currentVersionId))
    .where(and(eq(materials.workspaceId, workspaceId), eq(materials.courseId, courseId), inArray(materials.id, usable.map(m => m.id))));
  const current = versions.filter(v => usableStatus(v.status));
  if (!current.length) return [];
  const rows = await tx.select({ id: blocks.id, versionId: blocks.versionId, type: blocks.type, content: blocks.content }).from(blocks)
    .where(and(eq(blocks.workspaceId, workspaceId), eq(blocks.courseId, courseId), inArray(blocks.versionId, current.map(v => v.versionId)))).orderBy(asc(blocks.versionId), asc(blocks.ordinal));
  return current.map(v => {
    const material = usable.find(m => m.id === v.materialId)!;
    const own = rows.filter(r => r.versionId === v.versionId) as Parameters<typeof groupPassages>[1];
    return { ...material, versionId: v.versionId, passages: groupPassages(v.versionId, own, AI_LIMITS.maxPassageChars) };
  });
}

/** One passage built from exactly the cited blocks, for a session focus or a grading source. */
export async function citedPassage(tx: ReadDb | Transaction, workspaceId: string, courseId: string, citation: Citation, topicIds: string[]): Promise<AiPassage | null> {
  const { title, blocks: cited } = await citationBlocks(tx, workspaceId, courseId, citation);
  if (!cited.length) return null;
  const heading = cited.find(b => b.type === 'heading');
  return {
    id: `${citation.versionId}:cited`, materialId: citation.materialId, versionId: citation.versionId, blockIds: cited.map(b => b.id), courseId, materialTitle: title,
    heading: heading?.type === 'heading' ? spansText(heading.content.spans).slice(0, 200) : '',
    text: cited.map(blockMarkdown).filter(Boolean).join('\n\n').slice(0, AI_LIMITS.maxPassageChars), topicIds,
  };
}
