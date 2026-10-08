import { Fragment } from 'react';

import { InlineText } from '@/components/InlineText';
import { cn } from '@/lib/utils';

/**
 * Prose: block structure (paragraphs, lists, quotes) for authored and model
 * text, with InlineText for emphasis inside a line. It builds elements from a
 * split and never parses HTML, so model output can only ever be text.
 *
 *   blank line   paragraph break      `- ` / `* `   list item
 *   `1. `        ordered item         `> `          quote
 *
 * `reading` follows the reading-size preference. `compact` is for panels.
 */
type Block = { kind: 'p' | 'quote'; lines: string[] } | { kind: 'ul' | 'ol'; items: string[] };

function parse(text: string): Block[] {
  const blocks: Block[] = [];
  for (const raw of text.replace(/\r\n/g, '\n').split('\n')) {
    const line = raw.trimEnd();
    const last = blocks[blocks.length - 1];
    if (!line.trim()) { if (last) blocks.push({ kind: 'p', lines: [] }); continue; }
    const ul = /^\s*[-*]\s+(.*)$/.exec(line), ol = /^\s*\d+[.)]\s+(.*)$/.exec(line), quote = /^\s*>\s?(.*)$/.exec(line);
    if (ul) { if (last?.kind === 'ul') last.items.push(ul[1]!); else blocks.push({ kind: 'ul', items: [ul[1]!] }); continue; }
    if (ol) { if (last?.kind === 'ol') last.items.push(ol[1]!); else blocks.push({ kind: 'ol', items: [ol[1]!] }); continue; }
    if (quote) { if (last?.kind === 'quote') last.lines.push(quote[1]!); else blocks.push({ kind: 'quote', lines: [quote[1]!] }); continue; }
    if (last?.kind === 'p') last.lines.push(line); else blocks.push({ kind: 'p', lines: [line] });
  }
  return blocks.filter(b => 'lines' in b ? b.lines.length > 0 : b.items.length > 0);
}

const Lines = ({ lines, onCitation }: { lines: string[]; onCitation?: (n: number) => void }) => <>{lines.map((line, j) => <Fragment key={j}>{j > 0 && ' '}<InlineText text={line} onCitationClick={onCitation} /></Fragment>)}</>;

/** `onCitation` makes `[n]` markers buttons, for text whose sources are known. */
export function Prose({ text, className, size = 'reading', onCitation }: { text: string; className?: string; size?: 'reading' | 'compact'; onCitation?: (n: number) => void }) {
  return (
    <div className={cn('rawi-prose', size === 'compact' && 'text-base! leading-relaxed!', className)}>
      {parse(text).map((block, i) => {
        switch (block.kind) {
          case 'p': return <p key={i}><Lines lines={block.lines} onCitation={onCitation} /></p>;
          case 'quote': return <blockquote key={i}><Lines lines={block.lines} onCitation={onCitation} /></blockquote>;
          case 'ul': return <ul key={i}>{block.items.map((item, j) => <li key={j}><InlineText text={item} onCitationClick={onCitation} /></li>)}</ul>;
          case 'ol': return <ol key={i}>{block.items.map((item, j) => <li key={j}><InlineText text={item} onCitationClick={onCitation} /></li>)}</ol>;
        }
      })}
    </div>
  );
}
