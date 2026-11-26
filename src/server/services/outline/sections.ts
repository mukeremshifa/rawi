import { and, asc, eq } from 'drizzle-orm';
import { blocks } from '../../db/schema';
import type { ReadDb, SocketDb, Transaction } from '../../db/client';
import type { BlockBody } from '../../../shared/contracts/document';
import { blockMarkdown, spansText } from '../../../shared/domain/document-text';

/**
 * Sections of one version. A section is a heading and every block under it,
 * up to the next heading at its level or above. Content before the first
 * heading is the lead section, with no heading block.
 */
export type SectionBlock = BlockBody & {
  id: string;
  ordinal: number;
  parentId: string | null;
  flags?: { uncertain?: boolean; interpreted?: boolean };
};
export interface Section {
  headingBlockId: string | null;
  heading: string;
  level: number;
  blockIds: string[];
  firstBlockId: string | null;
}

export async function versionBlocks(
  db: ReadDb | SocketDb | Transaction,
  workspaceId: string,
  versionId: string,
): Promise<SectionBlock[]> {
  return (await db
    .select({
      id: blocks.id,
      ordinal: blocks.ordinal,
      parentId: blocks.parentId,
      type: blocks.type,
      content: blocks.content,
      flags: blocks.flags,
    })
    .from(blocks)
    .where(and(eq(blocks.workspaceId, workspaceId), eq(blocks.versionId, versionId)))
    .orderBy(asc(blocks.ordinal))) as SectionBlock[];
}

export function sections(list: SectionBlock[]): Section[] {
  const out: Section[] = [];
  const lead = list.findIndex(b => b.type === 'heading');
  const leadBlocks = (lead < 0 ? list : list.slice(0, lead)).filter(b => blockMarkdown(b).trim());
  if (leadBlocks.length)
    out.push({
      headingBlockId: null,
      heading: '',
      level: 0,
      blockIds: leadBlocks.map(b => b.id),
      firstBlockId: leadBlocks[0]!.id,
    });
  list.forEach((block, i) => {
    if (block.type !== 'heading') return;
    const level = block.content.level,
      ids = [block.id];
    for (const next of list.slice(i + 1)) {
      if (next.type === 'heading' && next.content.level <= level) break;
      ids.push(next.id);
    }
    out.push({
      headingBlockId: block.id,
      heading: spansText(block.content.spans).trim().slice(0, 300),
      level,
      blockIds: ids,
      firstBlockId: block.id,
    });
  });
  return out;
}
