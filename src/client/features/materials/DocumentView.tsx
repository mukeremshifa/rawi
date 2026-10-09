import { Fragment, useMemo, type ReactNode } from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import { ImageOffIcon } from 'lucide-react';
import type { DocumentBlock, ListContent, Pagination, Span, marks as markNames } from '@shared/contracts/document';
import { spansText } from '@shared/domain/document-text';

import { cn } from '@/lib/utils';

/**
 * The one renderer for every adapter. It renders an allowlist of block types
 * as React elements: spans become elements, equations go through KaTeX with
 * trust disabled, and figures load from the authorized asset route. No HTML
 * from a provider ever reaches this component.
 */

export function pageLabel(pagination: Pagination, page: number) {
  if (pagination === 'slides') return `Slide ${page}`;
  if (pagination === 'converted') return `Converted page ${page}`;
  if (pagination === 'source') return `Page ${page}`;
  return '';
}

function Text({ text }: { text: string }) {
  const lines = text.split('\n');
  return <>{lines.map((line, i) => <Fragment key={i}>{i > 0 && <br />}{line}</Fragment>)}</>;
}

function marked(node: ReactNode, marks: (typeof markNames)[number][] | undefined) {
  let out = node;
  for (const mark of marks ?? []) {
    if (mark === 'bold') out = <strong>{out}</strong>;
    else if (mark === 'italic') out = <em>{out}</em>;
    else if (mark === 'code') out = <code>{out}</code>;
    else if (mark === 'sub') out = <sub>{out}</sub>;
    else if (mark === 'sup') out = <sup>{out}</sup>;
  }
  return out;
}

export function MathView({ latex, display = false }: { latex: string; display?: boolean }) {
  const html = useMemo(() => katex.renderToString(latex, { displayMode: display, throwOnError: false, trust: false, strict: 'ignore', maxSize: 50, maxExpand: 500 }), [latex, display]);
  // KaTeX output with trust off: escaped source, no links, classes or styles from the input.
  return <span className={display ? 'block overflow-x-auto py-1' : undefined} dangerouslySetInnerHTML={{ __html: html }} />;
}

export function Spans({ spans }: { spans: Span[] }) {
  return <>{spans.map((s, i) => {
    if (s.type === 'math') return <MathView key={i} latex={s.latex} />;
    const body = marked(<Text text={s.text} />, s.marks);
    return s.type === 'link'
      ? <a key={i} href={s.href} target="_blank" rel="noreferrer noopener">{body}</a>
      : <Fragment key={i}>{body}</Fragment>;
  })}</>;
}

function ListView({ list }: { list: ListContent }) {
  const Tag = list.ordered ? 'ol' : 'ul';
  return <Tag>{list.items.map((item, i) => <li key={i}><Spans spans={item.spans} />{item.children && <ListView list={item.children} />}</li>)}</Tag>;
}

const HEADING = { 1: 'h2', 2: 'h3', 3: 'h4', 4: 'h5' } as const;

export function BlockView({ block, assetUrl }: { block: DocumentBlock; assetUrl: (assetId: string) => string }) {
  switch (block.type) {
    case 'heading': {
      const Tag = HEADING[block.content.level as 1 | 2 | 3 | 4];
      return <Tag data-level={block.content.level}><Spans spans={block.content.spans} /></Tag>;
    }
    case 'paragraph': return <p><Spans spans={block.content.spans} /></p>;
    case 'quote': return <blockquote><Spans spans={block.content.spans} /></blockquote>;
    case 'list': return <ListView list={block.content} />;
    case 'code': return <pre><code>{block.content.text}</code></pre>;
    case 'equation': return (
      <div className="rawi-equation">
        <MathView latex={block.content.latex} display />
        {block.flags.uncertain && <p className="text-muted-foreground font-sans text-xs">This equation may not have been read correctly. Check it against the original.</p>}
      </div>
    );
    case 'table': return (
      <div className="rawi-table">
        <table>
          <tbody>
            {block.content.rows.map((row, r) => (
              <tr key={r}>{row.cells.map((cell, c) => {
                const Cell = cell.header ? 'th' : 'td';
                return <Cell key={c} colSpan={cell.colspan} rowSpan={cell.rowspan}><Spans spans={cell.spans} /></Cell>;
              })}</tr>
            ))}
          </tbody>
        </table>
      </div>
    );
    case 'figure': {
      const caption = spansText(block.content.caption).trim();
      return (
        <figure>
          {block.content.assetId
            ? <img src={assetUrl(block.content.assetId)} alt={caption || 'Figure from the original document'} loading="lazy" />
            : <div className="text-muted-foreground flex items-center gap-2 rounded-md border border-dashed p-4 font-sans text-sm"><ImageOffIcon className="size-4" aria-hidden />The image could not be extracted.</div>}
          {(caption || block.flags.interpreted === false) && (
            <figcaption>
              {caption && <Spans spans={block.content.caption} />}
              {block.flags.interpreted === false && <span className="text-muted-foreground block font-sans text-xs">Image not interpreted. Study tools use its caption only.</span>}
            </figcaption>
          )}
        </figure>
      );
    }
  }
}

/**
 * Blocks in reading order, each with a stable anchor and quiet page labels
 * where the source page changes. `aside` renders beside each block, for
 * actions such as linking or discussing.
 */
export function DocumentBlocks({ blocks, pagination, assetUrl, highlight, aside, className }: {
  blocks: DocumentBlock[]; pagination: Pagination; assetUrl: (assetId: string) => string; highlight?: string | null;
  aside?: (block: DocumentBlock) => ReactNode; className?: string;
}) {
  let lastPage = 0;
  return (
    <div className={cn('rawi-prose rawi-document font-serif', className)}>
      {blocks.map(block => {
        const page = block.sources[0]?.page;
        const label = page && page !== lastPage ? pageLabel(pagination, page) : '';
        if (page) lastPage = Math.max(lastPage, ...block.sources.map(s => s.page));
        return (
          <Fragment key={block.id}>
            {label && <p className="rawi-page-label" aria-label={label}>{label}</p>}
            <div id={`block-${block.id}`} data-block={block.type} dir="auto" className={cn('rawi-block group relative scroll-mt-24', highlight === block.id && 'rawi-highlight')}>
              <BlockView block={block} assetUrl={assetUrl} />
              {aside?.(block)}
            </div>
          </Fragment>
        );
      })}
    </div>
  );
}
