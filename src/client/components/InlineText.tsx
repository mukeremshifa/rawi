import { Fragment, type ReactNode } from 'react';

import { MathView } from '@/components/MathView';
import { cn } from '@/lib/utils';

/**
 * Inline formatting inside one string of untrusted text, such as model output. It is a split on
 * one pattern that builds elements, so nothing here is ever parsed as markup.
 *
 *   `**bold**`   `*italic*`   `` `code` ``   `$maths$`   `$$displayed maths$$`   `[1]` citations
 *
 * Italic and maths delimiters must hug non-space, so `3 * 4 * 5` and "$5 and $10" stay as
 * written. Links are not supported: a URL in model output shown as an anchor invites phishing.
 * Maths goes to KaTeX with trust off.
 */
const INLINE =
  /(\*\*[^*]+\*\*|\*[^\s*][^*\n]*[^\s*]\*|\*[^\s*]\*|`[^`]+`|\$\$[^$\n]+\$\$|\$[^\s$](?:[^$\n]*[^\s$])?\$(?!\d)|\[\d{1,3}\])/g;

export function InlineText({
  text,
  /** Called with the marker number when a `[n]` in the text is activated. */
  onCitationClick,
}: {
  text: string;
  onCitationClick?: (marker: number) => void;
}): ReactNode {
  return text.split(INLINE).map((chunk, index) => {
    if (chunk.length === 0) return null;

    if (chunk.startsWith('**') && chunk.endsWith('**')) {
      return <strong key={index}>{chunk.slice(2, -2)}</strong>;
    }

    /*
     * Single asterisks, after bold. The length guard is what keeps a lone `*`
     * used as a bullet or a footnote mark from swallowing the rest of a line —
     * the pattern already refuses newlines, and this refuses the empty case.
     */
    if (chunk.startsWith('*') && chunk.endsWith('*') && chunk.length > 2) {
      return <em key={index}>{chunk.slice(1, -1)}</em>;
    }

    if (chunk.startsWith('`') && chunk.endsWith('`')) {
      return (
        <code key={index} className="bg-muted rounded px-1 py-0.5 font-mono text-xs">
          {chunk.slice(1, -1)}
        </code>
      );
    }

    if (chunk.startsWith('$$') && chunk.endsWith('$$') && chunk.length > 4) {
      return <MathView key={index} latex={chunk.slice(2, -2)} display />;
    }

    if (chunk.startsWith('$') && chunk.endsWith('$') && chunk.length > 2) {
      return <MathView key={index} latex={chunk.slice(1, -1)} />;
    }

    const citation = /^\[(\d{1,3})\]$/.exec(chunk);
    if (citation?.[1] !== undefined) {
      const marker = Number(citation[1]);
      /*
       * A citation with nowhere to go stays text. An inert button that looks
       * clickable is worse than a plain marker — it promises the answer is
       * traceable and then does nothing.
       */
      if (!onCitationClick) {
        return (
          <sup key={index} className="text-muted-foreground mx-0.5 tabular-nums">
            [{marker}]
          </sup>
        );
      }
      return (
        <button
          key={index}
          type="button"
          onClick={() => {
            onCitationClick(marker);
          }}
          aria-label={`Show source ${String(marker)}`}
          className={cn(
            'text-muted-foreground hover:text-foreground mx-0.5 rounded align-super text-[0.7em] tabular-nums',
            'underline decoration-dotted underline-offset-2',
            'focus-visible:ring-ring outline-none focus-visible:ring-2',
          )}
        >
          [{marker}]
        </button>
      );
    }

    return <Fragment key={index}>{chunk}</Fragment>;
  });
}
