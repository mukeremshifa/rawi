import type { AssistanceLevel, EvidenceState } from '@shared/contract.ts';
import { ASSISTANCE_LABEL, EVIDENCE_DETAIL, EVIDENCE_LABEL } from '@shared/messages.ts';

import { cn } from '@/lib/utils.ts';

/**
 * How an evidence state looks, in one place.
 *
 * ── The dot is the mark ramp, the chip is the field ramp ──────────────────
 *
 * A dot sits *on* the page and needs ≥3:1 against it, so it uses
 * `--evidence-*-mark`. A chip carries ink, so it uses `--evidence-*` and needs
 * ≥4.5:1 against `--evidence-ink`. Both climb in lightness, so the four states
 * separate by value even when hue is flattened — which is the property that
 * survives colour-blindness, and the reason the ramp is one hue.
 *
 * ── And it is never a number ──────────────────────────────────────────────
 *
 * Invariant 6. There is no percentage here, no bar, and no ordering that reads
 * as a score out of four. The label is a sentence about what the learner did.
 */

const DOT: Record<EvidenceState, string> = {
  'not-checked': 'bg-evidence-none-mark',
  practicing: 'bg-evidence-practicing-mark',
  'independent-once': 'bg-evidence-independent-mark',
  'retained-on-review': 'bg-evidence-retained-mark',
};

const CHIP: Record<EvidenceState, string> = {
  'not-checked': 'bg-evidence-none',
  practicing: 'bg-evidence-practicing',
  'independent-once': 'bg-evidence-independent',
  'retained-on-review': 'bg-evidence-retained',
};

export function EvidenceDot({
  state,
  className,
}: {
  state: EvidenceState;
  className?: string;
}) {
  return (
    <span
      className={cn('inline-block size-2.5 shrink-0 rounded-full', DOT[state], className)}
      role="img"
      aria-label={EVIDENCE_LABEL[state]}
    />
  );
}

export function EvidenceBadge({
  state,
  className,
}: {
  state: EvidenceState;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-tight rounded-full px-snug py-hairline text-xs font-medium',
        CHIP[state],
        'text-(--evidence-ink)',
        className,
      )}
    >
      <EvidenceDot state={state} />
      {EVIDENCE_LABEL[state]}
    </span>
  );
}

/** The badge plus the sentence under it, for a concept's own page. */
export function EvidenceStatement({ state }: { state: EvidenceState }) {
  return (
    <div className="flex flex-col gap-tight">
      <EvidenceBadge state={state} className="self-start" />
      <p className="text-muted-foreground max-w-prose text-sm leading-relaxed">
        {EVIDENCE_DETAIL[state]}
      </p>
    </div>
  );
}

/**
 * What help was in force, said plainly.
 *
 * Shown on every attempt in the evidence view, including the ones that were
 * unaided — "No help used" is the claim the whole product is built to be able
 * to make, and hiding it when it is true would make it look like an accusation
 * when it is not.
 */
export function AssistanceNote({
  assistance,
  usedAsk,
}: {
  assistance: AssistanceLevel;
  usedAsk: boolean;
}) {
  return (
    <span className="text-muted-foreground text-xs">
      {ASSISTANCE_LABEL[assistance]}
      {usedAsk && assistance !== 'none' ? ' · asked during the check' : ''}
    </span>
  );
}
