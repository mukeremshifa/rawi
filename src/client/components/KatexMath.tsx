import { useMemo } from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';

/** KaTeX with trust off: escaped source, no links, classes or styles from the input. Loaded on demand by MathView. */
export default function KatexMath({ latex, display }: { latex: string; display: boolean }) {
  const html = useMemo(() => katex.renderToString(latex, { displayMode: display, throwOnError: false, trust: false, strict: 'ignore', maxSize: 50, maxExpand: 500 }), [latex, display]);
  return <span className={display ? 'block overflow-x-auto py-1' : undefined} dangerouslySetInnerHTML={{ __html: html }} />;
}
