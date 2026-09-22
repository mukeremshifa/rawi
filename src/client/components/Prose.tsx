import { Fragment } from 'react';

import { InlineText } from '@/components/InlineText';
import { cn } from '@/lib/utils';

/**
 * Block-level rendering for the authored prose in this prototype.
 *
 * ── Why this exists next to `InlineText` ──────────────────────────────────
 *
 * `InlineText` handles emphasis *within* a line and deliberately refuses to
 * grow into a markdown engine — its own note says so. But every long-form
 * string in this app (a reading passage, a tutor turn, an explanation) has
 * block structure too: paragraphs, the occasional numbered list, the occasional
 * blockquote for an extract.
 *
 * So the split is: this file decides where the paragraphs are, `InlineText`
 * decides what is bold inside them. It inherits the same safety property for
 * the same reason — it produces elements from a split, and never a string that
 * anything parses as markup. There is no HTML path to get wrong.
 *
 * ── What it understands ───────────────────────────────────────────────────
 *
 *   blank line      paragraph break
 *   `- ` / `* `     unordered list item
 *   `1. `           ordered list item
 *   `> `            blockquote
 *
 * Anything else is a paragraph. That is the whole grammar, and it covers every
 * authored string in `src/shared/course/` — which is the only content this ever
 * renders, since the prototype has no model output to worry about.
 */

type Block =
  | { kind: 'p'; lines: string[] }
  | { kind: 'ul'; items: string[] }
  | { kind: 'ol'; items: string[] }
  | { kind: 'quote'; lines: string[] };

function parse(text: string): Block[] {
  const blocks: Block[] = [];
  const lines = text.replace(/\r\n/g, '\n').split('\n');

  for (const raw of lines) {
    const line = raw.trimEnd();
    const last = blocks[blocks.length - 1];

    if (!line.trim()) {
      // A blank line closes whatever was open; the next line starts fresh.
      if (last) blocks.push({ kind: 'p', lines: [] });
      continue;
    }

    const ulMatch = /^\s*[-*]\s+(.*)$/.exec(line);
    if (ulMatch) {
      if (last?.kind === 'ul') last.items.push(ulMatch[1]!);
      else blocks.push({ kind: 'ul', items: [ulMatch[1]!] });
      continue;
    }

    const olMatch = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    if (olMatch) {
      if (last?.kind === 'ol') last.items.push(olMatch[1]!);
      else blocks.push({ kind: 'ol', items: [olMatch[1]!] });
      continue;
    }

    const quoteMatch = /^\s*>\s?(.*)$/.exec(line);
    if (quoteMatch) {
      if (last?.kind === 'quote') last.lines.push(quoteMatch[1]!);
      else blocks.push({ kind: 'quote', lines: [quoteMatch[1]!] });
      continue;
    }

    if (last?.kind === 'p' && last.lines.length > 0) last.lines.push(line);
    else if (last?.kind === 'p') last.lines.push(line);
    else blocks.push({ kind: 'p', lines: [line] });
  }

  return blocks.filter(
    (b) =>
      (b.kind === 'p' && b.lines.length > 0) ||
      (b.kind === 'quote' && b.lines.length > 0) ||
      ((b.kind === 'ul' || b.kind === 'ol') && b.items.length > 0),
  );
}

export function Prose({
  text,
  className,
  /** `reading` is the long-form measure; `compact` is for cards and panels. */
  size = 'reading',
}: {
  text: string;
  className?: string;
  size?: 'reading' | 'compact';
}) {
  const blocks = parse(text);
  const body =
    size === 'reading'
      ? 'text-[0.975rem] leading-[1.75]'
      : 'text-sm leading-relaxed';

  return (
    <div className={cn('flex flex-col gap-base', body, className)}>
      {blocks.map((block, i) => {
        switch (block.kind) {
          case 'p':
            return (
              <p key={i}>
                {block.lines.map((line, j) => (
                  <Fragment key={j}>
                    {j > 0 && ' '}
                    <InlineText text={line} />
                  </Fragment>
                ))}
              </p>
            );
          case 'ul':
            return (
              <ul key={i} className="flex list-disc flex-col gap-tight pl-5">
                {block.items.map((item, j) => (
                  <li key={j}>
                    <InlineText text={item} />
                  </li>
                ))}
              </ul>
            );
          case 'ol':
            return (
              <ol key={i} className="flex list-decimal flex-col gap-tight pl-5">
                {block.items.map((item, j) => (
                  <li key={j}>
                    <InlineText text={item} />
                  </li>
                ))}
              </ol>
            );
          case 'quote':
            return (
              <blockquote
                key={i}
                className="border-primary/40 text-muted-foreground border-l-2 pl-gutter italic"
              >
                {block.lines.map((line, j) => (
                  <Fragment key={j}>
                    {j > 0 && ' '}
                    <InlineText text={line} />
                  </Fragment>
                ))}
              </blockquote>
            );
        }
      })}
    </div>
  );
}
