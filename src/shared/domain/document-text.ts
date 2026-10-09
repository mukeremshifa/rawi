import type { BlockBody, ListContent, Span } from '../contracts/document';

/**
 * Plain Markdown from document blocks, for model context and search-free
 * relevance scoring. Figures contribute their caption only, because Rawi has
 * not interpreted the image itself.
 */
export function spansText(spans: Span[]): string {
  return spans.map(s => {
    if (s.type === 'math') return `$${s.latex}$`;
    let value = s.text;
    if (s.marks?.includes('code')) value = `\`${value}\``;
    if (s.marks?.includes('bold')) value = `**${value}**`;
    if (s.marks?.includes('italic')) value = `*${value}*`;
    return s.type === 'link' ? `[${value}](${s.href})` : value;
  }).join('');
}

function listText(list: ListContent, depth = 0): string {
  return list.items.map((item, i) => `${'  '.repeat(depth)}${list.ordered ? `${i + 1}.` : '-'} ${spansText(item.spans)}${item.children ? `\n${listText(item.children, depth + 1)}` : ''}`).join('\n');
}

export function blockMarkdown(block: BlockBody): string {
  switch (block.type) {
    case 'heading': return `${'#'.repeat(block.content.level)} ${spansText(block.content.spans)}`;
    case 'paragraph': return spansText(block.content.spans);
    case 'quote': return spansText(block.content.spans).split('\n').map(line => `> ${line}`).join('\n');
    case 'list': return listText(block.content);
    case 'equation': return `$$\n${block.content.latex}\n$$`;
    case 'code': return `\`\`\`${block.content.language ?? ''}\n${block.content.text}\n\`\`\``;
    case 'figure': { const caption = spansText(block.content.caption).trim(); return caption ? `[Figure: ${caption}]` : ''; }
    case 'table': return block.content.rows.map((row, i) => {
      const line = `| ${row.cells.map(c => spansText(c.spans).replace(/\|/g, '\\|').replace(/\n/g, ' ')).join(' | ')} |`;
      return i === 0 ? `${line}\n|${row.cells.map(() => ' --- |').join('')}` : line;
    }).join('\n');
  }
}

export interface BlockPassage { id: string; heading: string; text: string; blockIds: string[] }

/**
 * Consecutive blocks grouped under their heading up to a character budget.
 * Computed on the fly for each request. Each passage keeps the exact block
 * ids it was built from, so a cited passage resolves to blocks.
 */
export function groupPassages(versionId: string, blocks: (BlockBody & { id: string })[], maxChars: number): BlockPassage[] {
  const out: BlockPassage[] = [];
  let heading = '';
  let current: BlockPassage | null = null;
  const close = () => { if (current && current.text.trim()) out.push(current); current = null; };
  for (const block of blocks) {
    let text = blockMarkdown(block);
    if (block.type === 'heading') { close(); heading = spansText(block.content.spans).slice(0, 200); }
    if (!text.trim()) continue;
    if (text.length > maxChars) text = text.slice(0, maxChars);
    if (current && (current.text.length + text.length + 2 > maxChars || current.blockIds.length >= 200)) close();
    current ??= { id: `${versionId}:${out.length}`, heading, text: '', blockIds: [] };
    current.text = current.text ? `${current.text}\n\n${text}` : text;
    current.blockIds.push(block.id);
  }
  close();
  return out.map((p, i) => ({ ...p, id: `${versionId}:${i}` }));
}
