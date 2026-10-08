import type { EvidenceLevel } from '@shared/domain/types';
import { EVIDENCE_LABEL } from '@shared/domain/progress';
import { cn } from '@/lib/utils';

/**
 * Meter: a proportion of discrete, countable facts ("4 of 11 topics"), drawn
 * in greys. Never a mastery score. Always render the count in text beside it.
 */
export function Meter({ value, className, label }: {
  /** 0 to 1, clamped. */
  value: number;
  className?: string;
  /** Accessible name. A bare bar announces nothing. */
  label: string;
}) {
  const percent = Math.round(Math.min(1, Math.max(0, value)) * 100);
  return (
    <div role="meter" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100} aria-label={label}
      className={cn('bg-meter-track h-1.5 w-full overflow-hidden rounded-full', className)}>
      <div className="bg-meter-fill h-full rounded-full transition-[width] duration-300" style={{ width: `${percent}%` }} />
    </div>
  );
}

const STEPS: Record<EvidenceLevel, number> = { 'not-checked': 0, practising: 1, 'independent-once': 2, retained: 3 };

/**
 * EvidenceMeter: three filled steps for an evidence level, with its label.
 * Use wherever topic evidence appears. Not checked draws empty steps with a
 * dashed outline, because "not asked yet" is not the same as "got none".
 */
export function EvidenceMeter({ level, showLabel = true, className }: { level: EvidenceLevel; showLabel?: boolean; className?: string }) {
  const filled = STEPS[level];
  return (
    <span className={cn('inline-flex items-center gap-tight', className)}>
      <span role="img" aria-label={`Evidence: ${EVIDENCE_LABEL[level]}`} className="flex gap-0.5">
        {[1, 2, 3].map(step => (
          <span key={step} className={cn('h-2 w-3.5 rounded-[2px]',
            step <= filled ? 'bg-meter-fill' : filled === 0 ? 'border-border-strong border border-dashed' : 'bg-meter-track')} />
        ))}
      </span>
      {showLabel && <span className="text-muted-foreground text-sm whitespace-nowrap">{EVIDENCE_LABEL[level]}</span>}
    </span>
  );
}
