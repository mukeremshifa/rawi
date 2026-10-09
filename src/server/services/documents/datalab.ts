import { parseDocument } from 'htmlparser2';
import type { ChildNode, Element } from 'domhandler';
import type { BlockInput, ConversionWarning, ListContent, Span, marks } from '../../../shared/contracts/document';

/**
 * The Datalab mapping: a provider JSON block tree in, Rawi blocks out. Every
 * provider-specific rule lives in this file, so a second adapter can follow
 * the same contract: map to `BlockInput[]`, report failed pages and
 * warnings, and never pass provider HTML on. Provider HTML is read here
 * against an allowlist and turned into spans. Anything not on the list is
 * reduced to its text or dropped.
 *
 * Verified against live responses with output_format=json: a Document whose
 * children are Page blocks, each with typed child blocks carrying `html`,
 * `page` (from 0), `bbox` in page pixels, `inference_failed`, and `images`
 * keyed by the filename used in an img src. `metadata.failed_pages` lists
 * pages that could not be processed.
 */
export const DATALAB_ADAPTER_VERSION = 'datalab-json-1';

type Mark = typeof marks[number];
export interface DatalabBlock {
  id?: string; block_type?: string; html?: string; page?: number; bbox?: number[];
  children?: DatalabBlock[] | null; images?: Record<string, string> | null; inference_failed?: boolean;
}
export interface DatalabResult {
  status?: string; success?: boolean; error?: string | null; page_count?: number | null;
  json?: { children?: DatalabBlock[] | null; metadata?: { failed_pages?: number[] | null } | null } | null;
  images?: Record<string, string> | null; metadata?: { failed_pages?: number[] | null } | null;
}

const DROPPED = new Set(['PageHeader', 'PageFooter']);
const FIGURES = new Set(['Picture', 'Figure']);
const SKIP_TAGS = new Set(['script', 'style', 'img', 'content-ref', 'svg', 'head', 'title']);

/* ── HTML to spans ──────────────────────────────────────────────────────── */

const element = (node: ChildNode): node is Element => node.type === 'tag' || node.type === 'script' || node.type === 'style';
function textOf(nodes: ChildNode[]): string {
  return nodes.map(n => n.type === 'text' ? n.data : element(n) && !SKIP_TAGS.has(n.name) ? textOf(n.children) : '').join('');
}
const decode = (html: string) => textOf(parseDocument(html, { decodeEntities: true }).children);
const isWeb = (href: string) => { try { return ['http:', 'https:'].includes(new URL(href).protocol); } catch { return false; } };
/** Generated image descriptions are not used yet. */
const generated = (node: Element) => /\bimg-description\b/.test(node.attribs.class ?? '');

function inline(nodes: ChildNode[], active: Mark[] = [], out: Span[] = []): Span[] {
  const push = (text: string, extra: Mark[] = []) => {
    const all = [...new Set([...active, ...extra])];
    const last = out.at(-1);
    if (last?.type === 'text' && (last.marks ?? []).join() === all.join()) last.text += text;
    else if (text) out.push({ type: 'text', text, ...(all.length ? { marks: all } : {}) });
  };
  for (const node of nodes) {
    if (node.type === 'text') { push(node.data.replace(/\s+/g, ' ')); continue; }
    if (!element(node) || SKIP_TAGS.has(node.name) || generated(node)) continue;
    const tag = node.name;
    if (tag === 'br') push('\n');
    else if (tag === 'math') { const latex = textOf(node.children).trim(); if (latex) out.push({ type: 'math', latex }); }
    else if (tag === 'a') {
      const href = node.attribs.href ?? '';
      const text = textOf(node.children).replace(/\s+/g, ' ');
      if (isWeb(href) && text.trim()) out.push({ type: 'link', href, text, ...(active.length ? { marks: [...active] } : {}) });
      else push(text);
    }
    else if (tag === 'b' || tag === 'strong') inline(node.children, [...active, 'bold'], out);
    else if (tag === 'i' || tag === 'em') inline(node.children, [...active, 'italic'], out);
    else if (tag === 'code' || tag === 'kbd' || tag === 'tt') inline(node.children, [...active, 'code'], out);
    else if (tag === 'sub') inline(node.children, [...active, 'sub'], out);
    else if (tag === 'sup') inline(node.children, [...active, 'sup'], out);
    else if (tag === 'p' || tag === 'div' || tag === 'li') { if (out.length) push('\n'); inline(node.children, active, out); }
    else inline(node.children, active, out);
  }
  return out;
}
function tidy(spans: Span[]): Span[] {
  for (const s of spans) if (s.type === 'text') s.text = s.text.replace(/ *\n */g, '\n');
  const first = spans[0], last = spans.at(-1);
  if (first?.type === 'text') first.text = first.text.trimStart();
  if (last?.type === 'text') last.text = last.text.trimEnd();
  return spans.filter(s => s.type !== 'text' || s.text);
}
const spansOf = (nodes: ChildNode[]) => tidy(inline(nodes));
const BULLET = /^\s*(?:[•·▪◦‣●○■□\-–—*]|\(?\d{1,3}[.)])\s+/;

function find(nodes: ChildNode[], test: (e: Element) => boolean): Element | null {
  for (const n of nodes) {
    if (!element(n)) continue;
    if (test(n)) return n;
    const inner = find(n.children, test);
    if (inner) return inner;
  }
  return null;
}
const children = (node: Element, names: string[]) => node.children.filter((c): c is Element => element(c) && names.includes(c.name));

function listFrom(node: Element): ListContent | null {
  const items = children(node, ['li']).map(li => {
    const nested = li.children.find((c): c is Element => element(c) && (c.name === 'ul' || c.name === 'ol'));
    const spans = spansOf(li.children.filter(c => c !== nested));
    const first = spans[0];
    if (first?.type === 'text') first.text = first.text.replace(BULLET, '');
    const sub = nested ? listFrom(nested) : null;
    return { spans: spans.filter(s => s.type !== 'text' || s.text), ...(sub ? { children: sub } : {}) };
  }).filter(item => item.spans.length || item.children);
  return items.length ? { ordered: node.name === 'ol', items } : null;
}

function tableFrom(node: Element) {
  const rows: Element[] = [];
  const collect = (el: Element) => { for (const c of el.children) if (element(c)) { if (c.name === 'tr') rows.push(c); else if (['thead', 'tbody', 'tfoot'].includes(c.name)) collect(c); } };
  collect(node);
  const span = (value: string | undefined, max: number) => { const n = Number(value); return Number.isInteger(n) && n > 1 ? Math.min(n, max) : undefined; };
  const out = rows.map(tr => ({ cells: children(tr, ['td', 'th']).map(cell => ({
    spans: spansOf(cell.children),
    ...(span(cell.attribs.colspan, 100) ? { colspan: span(cell.attribs.colspan, 100) } : {}),
    ...(span(cell.attribs.rowspan, 1000) ? { rowspan: span(cell.attribs.rowspan, 1000) } : {}),
    ...(cell.name === 'th' ? { header: true } : {}),
  })) })).filter(r => r.cells.length);
  return out.length ? { rows: out.slice(0, 2000) } : null;
}

/** Braces that do not balance, or nothing left after decoding, mean the LaTeX is unreliable. */
function unbalanced(latex: string) {
  let depth = 0;
  for (const c of latex.replace(/\\[{}]/g, '')) { if (c === '{') depth++; else if (c === '}' && --depth < 0) return true; }
  return depth !== 0;
}

/* ── Blocks ─────────────────────────────────────────────────────────────── */

type PageBox = { page: number; width: number; height: number };
function sourceOf(block: DatalabBlock, box: PageBox) {
  const page = (typeof block.page === 'number' ? block.page : box.page) + 1;
  const b = block.bbox;
  if (!b || b.length !== 4 || !box.width || !box.height) return [{ page }];
  const r = (n: number) => Math.round(Math.min(1, Math.max(0, n)) * 10000) / 10000;
  return [{ page, bbox: [r(b[0]! / box.width), r(b[1]! / box.height), r(b[2]! / box.width), r(b[3]! / box.height)] as [number, number, number, number] }];
}

/** Image keys referenced by figure blocks, with their base64 payloads. */
export function collectImages(result: DatalabResult): Map<string, string> {
  const found = new Map<string, string>();
  const walk = (blocks: DatalabBlock[] | null | undefined) => {
    for (const b of blocks ?? []) {
      if (FIGURES.has(b.block_type ?? '')) {
        const key = imageKey(b);
        const data = key ? b.images?.[key] ?? result.images?.[key] : undefined;
        if (key && data) found.set(key, data);
      }
      walk(b.children);
    }
  };
  walk(result.json?.children);
  return found;
}
function imageKey(block: DatalabBlock): string | null {
  const img = block.html ? find(parseDocument(block.html).children, e => e.name === 'img') : null;
  return img?.attribs.src ?? Object.keys(block.images ?? {})[0] ?? null;
}

/**
 * Map the provider tree to blocks. `assets` maps an image key to the Rawi
 * asset id it was stored under. Figures whose image was not stored keep a
 * null asset and still show their caption.
 */
export function mapDocument(result: DatalabResult, assets: Map<string, string>) {
  const out: BlockInput[] = [];
  const warnings: ConversionWarning[] = [];
  const uncertainPages = new Set<number>();
  const pages = result.json?.children ?? [];

  const emit = (block: DatalabBlock, box: PageBox, next: DatalabBlock | undefined, previous: BlockInput | undefined): boolean => {
    const type = block.block_type ?? '';
    const html = block.html ?? '';
    const dom = parseDocument(html, { decodeEntities: true }).children;
    const sources = sourceOf(block, box);
    if (block.inference_failed && type !== 'Equation') uncertainPages.add(sources[0]!.page);
    if (DROPPED.has(type)) return false;
    if (FIGURES.has(type)) {
      const key = imageKey(block);
      const caption = next?.block_type === 'Caption' ? spansOf(parseDocument(next.html ?? '', { decodeEntities: true }).children) : [];
      out.push({ type: 'figure', content: { assetId: key ? assets.get(key) ?? null : null, caption }, sources: next?.block_type === 'Caption' ? [...sources, ...sourceOf(next, box)].slice(0, 2) : sources, flags: { interpreted: false } });
      return next?.block_type === 'Caption';
    }
    if (type === 'Caption' && previous?.type === 'figure' && !previous.content.caption.length) {
      previous.content.caption = spansOf(dom);
      return false;
    }
    if (type === 'SectionHeader') {
      const h = find(dom, e => /^h[1-6]$/.test(e.name));
      const spans = spansOf(dom);
      if (spans.length) out.push({ type: 'heading', content: { level: Math.min(4, h ? Number(h.name[1]) : 2), spans }, sources });
      return false;
    }
    if (type === 'Equation') {
      const math = find(dom, e => e.name === 'math');
      const latex = (math ? textOf(math.children) : decode(html)).trim();
      if (latex) out.push({ type: 'equation', content: { latex }, sources, flags: block.inference_failed || unbalanced(latex) ? { uncertain: true } : {} });
      return false;
    }
    if (type === 'Code') {
      const text = decode(html).replace(/^\n+|\s+$/g, '');
      if (text) out.push({ type: 'code', content: { text }, sources });
      return false;
    }
    const table = find(dom, e => e.name === 'table');
    if (table && (type === 'Table' || type === 'Form' || type === 'TableOfContents' || !block.children?.length)) {
      const content = tableFrom(table);
      if (content) { out.push({ type: 'table', content, sources }); return false; }
    }
    const list = find(dom, e => e.name === 'ul' || e.name === 'ol');
    if (list && (type === 'ListGroup' || !block.children?.length)) {
      const content = listFrom(list);
      if (content) { out.push({ type: 'list', content, sources }); return false; }
    }
    if (type === 'ListItem') {
      const spans = spansOf(dom);
      const first = spans[0];
      if (first?.type === 'text') first.text = first.text.replace(BULLET, '');
      const item = { spans: spans.filter(s => s.type !== 'text' || s.text) };
      if (!item.spans.length) return false;
      if (previous?.type === 'list') { previous.content.items.push(item); previous.sources = [...previous.sources ?? [], ...sources].slice(0, 50); }
      else out.push({ type: 'list', content: { ordered: false, items: [item] }, sources });
      return false;
    }
    // Groups carry their parts as children. Read those rather than the combined HTML.
    if (block.children?.length) { walk(block.children, box); return false; }
    const spans = spansOf(dom);
    if (spans.length) out.push({ type: 'paragraph', content: { spans }, sources });
    return false;
  };
  function walk(blocks: DatalabBlock[], box: PageBox) {
    for (let i = 0; i < blocks.length; i++) {
      const block = blocks[i]!, next = blocks[i + 1];
      // A caption printed above its figure belongs to it as much as one below.
      if (block.block_type === 'Caption' && next && FIGURES.has(next.block_type ?? '')) { emit(next, box, block, out.at(-1)); i++; continue; }
      if (emit(block, box, next, out.at(-1))) i++;
    }
  }

  pages.forEach((page, index) => {
    const pageIndex = typeof page.page === 'number' ? page.page : Number(/\/page\/(\d+)\//.exec(page.id ?? '')?.[1] ?? index);
    const b = page.bbox ?? [];
    walk(page.children ?? [], { page: pageIndex, width: (b[2] ?? 0) - (b[0] ?? 0), height: (b[3] ?? 0) - (b[1] ?? 0) });
  });

  const failed = result.json?.metadata?.failed_pages ?? result.metadata?.failed_pages ?? [];
  const failedPages = [...new Set(failed.filter(n => Number.isInteger(n) && n >= 0).map(n => n + 1))].sort((a, b) => a - b);
  for (const page of [...uncertainPages].sort((a, b) => a - b)) warnings.push({ code: 'uncertain_text', message: 'Some text on this page may not have been read correctly.', page });
  const figures = out.filter(b => b.type === 'figure');
  if (figures.some(b => b.type === 'figure' && !b.content.assetId)) warnings.push({ code: 'missing_image', message: 'An image could not be extracted from the original.' });
  return { blocks: out, failedPages, warnings, pageCount: typeof result.page_count === 'number' ? result.page_count : pages.length };
}
