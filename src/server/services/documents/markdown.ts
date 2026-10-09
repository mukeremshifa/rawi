import { fromMarkdown } from 'mdast-util-from-markdown';
import { gfmFromMarkdown } from 'mdast-util-gfm';
import { mathFromMarkdown } from 'mdast-util-math';
import { gfm } from 'micromark-extension-gfm';
import { math } from 'micromark-extension-math';
import type { List, Nodes, PhrasingContent, RootContent } from 'mdast';
import type { BlockInput, ListContent, Span, marks } from '../../../shared/contracts/document';

/**
 * The local, synchronous adapter for pasted text and .md or .txt files.
 * Markdown is parsed with mdast. Raw HTML and images are dropped, and links
 * survive only for http and https. Plain text keeps its paragraphs as typed.
 */
export const MARKDOWN_ADAPTER_VERSION = 'mdast-1';
type Mark = typeof marks[number];

function phrasing(nodes: PhrasingContent[], active: Mark[] = []): Span[] {
  const out: Span[] = [];
  const push = (span: Span) => {
    const last = out.at(-1);
    if (span.type === 'text' && last?.type === 'text' && (last.marks ?? []).join() === (span.marks ?? []).join()) last.text += span.text;
    else out.push(span);
  };
  const text = (value: string, extra: Mark[] = []) => {
    const all = [...new Set([...active, ...extra])];
    if (value) push({ type: 'text', text: value, ...(all.length ? { marks: all } : {}) });
  };
  for (const node of nodes) {
    switch (node.type) {
      case 'text': text(node.value); break;
      case 'inlineCode': text(node.value, ['code']); break;
      case 'break': text('\n'); break;
      case 'emphasis': phrasing(node.children, [...active, 'italic']).forEach(push); break;
      case 'strong': phrasing(node.children, [...active, 'bold']).forEach(push); break;
      case 'delete': phrasing(node.children, active).forEach(push); break;
      case 'inlineMath': if (node.value.trim()) push({ type: 'math', latex: node.value.trim() }); break;
      case 'link': {
        const inner = phrasing(node.children, active).map(s => s.type === 'math' ? `$${s.latex}$` : s.text).join('');
        if (/^https?:\/\//i.test(node.url) && inner) push({ type: 'link', href: node.url, text: inner, ...(active.length ? { marks: [...active] } : {}) });
        else text(inner);
        break;
      }
      case 'linkReference': phrasing(node.children, active).forEach(push); break;
      default: break; // html, image, imageReference and footnote references are dropped.
    }
  }
  return out;
}

const trimSpans = (spans: Span[]) => {
  const first = spans[0], last = spans.at(-1);
  if (first?.type === 'text') first.text = first.text.replace(/^\s+/, '');
  if (last?.type === 'text') last.text = last.text.replace(/\s+$/, '');
  return spans.filter(s => s.type !== 'text' || s.text);
};

/** The inline text of any node, flattened. Used where a block cannot nest. */
function flat(node: Nodes): Span[] {
  if (node.type === 'paragraph' || node.type === 'heading' || node.type === 'tableCell') return phrasing(node.children);
  if (node.type === 'code' || node.type === 'math') return [{ type: 'text', text: node.value }];
  if ('children' in node) {
    const parts = (node.children as Nodes[]).map(flat).filter(p => p.length);
    return parts.flatMap((p, i) => i ? [{ type: 'text', text: '\n' } as Span, ...p] : p);
  }
  return [];
}

function list(node: List): ListContent | null {
  const items = node.children.map(item => {
    const nested = item.children.find((c): c is List => c.type === 'list');
    const children = nested ? list(nested) : null;
    const spans = trimSpans(item.children.filter(c => c.type !== 'list').map(flat).flatMap((p, i) => i ? [{ type: 'text', text: '\n' } as Span, ...p] : p));
    return { spans, ...(children ? { children } : {}) };
  }).filter(item => item.spans.length || item.children);
  return items.length ? { ordered: !!node.ordered, items } : null;
}

function block(node: RootContent, out: BlockInput[]) {
  switch (node.type) {
    case 'heading': { const spans = trimSpans(phrasing(node.children)); if (spans.length) out.push({ type: 'heading', content: { level: Math.min(node.depth, 4), spans } }); break; }
    case 'paragraph': { const spans = trimSpans(phrasing(node.children)); if (spans.length) out.push({ type: 'paragraph', content: { spans } }); break; }
    case 'blockquote': { const spans = trimSpans(flat(node)); if (spans.length) out.push({ type: 'quote', content: { spans } }); break; }
    case 'list': { const content = list(node); if (content) out.push({ type: 'list', content }); break; }
    case 'code': if (node.value.trim()) out.push({ type: 'code', content: { text: node.value, ...(node.lang ? { language: node.lang.slice(0, 40) } : {}) } }); break;
    case 'math': if (node.value.trim()) out.push({ type: 'equation', content: { latex: node.value.trim() } }); break;
    case 'table': out.push({ type: 'table', content: { rows: node.children.map((row, r) => ({ cells: row.children.map(c => ({ spans: trimSpans(phrasing(c.children)), ...(r === 0 ? { header: true } : {}) })) })) } }); break;
    default: break; // html, thematic breaks, definitions and footnote definitions are dropped.
  }
}

export function markdownBlocks(source: string, format: 'md' | 'txt'): BlockInput[] {
  const out: BlockInput[] = [];
  if (format === 'txt') {
    for (const part of source.replace(/\r\n?/g, '\n').split(/\n\s*\n/)) {
      const text = part.replace(/^\n+|\s+$/g, '');
      if (text.trim()) out.push({ type: 'paragraph', content: { spans: [{ type: 'text', text }] } });
    }
    return out;
  }
  const tree = fromMarkdown(source, { extensions: [gfm(), math()], mdastExtensions: [gfmFromMarkdown(), mathFromMarkdown()] });
  for (const node of tree.children) block(node, out);
  return out;
}
