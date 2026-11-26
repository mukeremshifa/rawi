import { lazy, Suspense } from 'react';

const KatexMath = lazy(() => import('@/components/KatexMath'));

/**
 * A formula, set by KaTeX. The engine and its fonts load the first time a formula is shown, so
 * pages without maths never fetch them. Until then the source is shown as written.
 */
export function MathView({ latex, display = false }: { latex: string; display?: boolean }) {
  return (
    <Suspense
      fallback={
        <span className={display ? 'block py-1 font-mono text-[0.9em]' : 'font-mono text-[0.9em]'}>{latex}</span>
      }
    >
      <KatexMath latex={latex} display={display} />
    </Suspense>
  );
}
