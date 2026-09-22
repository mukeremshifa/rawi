import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { BookOpenIcon, FlaskConicalIcon, InfoIcon } from 'lucide-react';

import type {
  Difficulty,
  EvidenceLevel,
  MaterialKind,
  MaterialOrigin,
  Outcome,
  QuestionFormat,
  SourceRef,
} from '@shared/types.ts';
import { EVIDENCE_DETAIL, EVIDENCE_LABEL, EVIDENCE_TONE } from '@shared/progress.ts';

import { Badge } from '@/components/ui/badge';
import { Meter, EmptyMeter } from '@/components/Meter';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useSource } from '@/store/selectors';
import { cn } from '@/lib/utils';

/**
 * The vocabulary shared across features.
 *
 * Anything that appears in more than one product area and carries a meaning
 * lives here — an evidence level, a format name, a link back to a passage. The
 * alternative is six features each deciding independently what "practising"
 * looks like, which is how an app stops reading as one product.
 */

/* ── Evidence ─────────────────────────────────────────────────────────── */

/**
 * An evidence level, as a chip.
 *
 * The colour comes from the field ramp — these carry a label, so they are the
 * field case, not the mark case. Levels are words, never percentages, per the
 * rule in `progress.ts`.
 */
export function EvidenceChip({
  level,
  className,
}: {
  level: EvidenceLevel;
  className?: string;
}) {
  const fill: Record<EvidenceLevel, string> = {
    'not-checked': 'bg-evidence-none text-(--evidence-ink)',
    practising: 'bg-evidence-practicing text-(--evidence-ink)',
    'independent-once': 'bg-evidence-independent text-(--evidence-ink)',
    retained: 'bg-evidence-retained text-(--evidence-ink)',
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={cn(
            'inline-flex w-fit shrink-0 items-center rounded-md border border-transparent px-1.5 py-0.5 text-xs font-medium whitespace-nowrap',
            fill[level],
            className,
          )}
        >
          {EVIDENCE_LABEL[level]}
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">{EVIDENCE_DETAIL[level]}</TooltipContent>
    </Tooltip>
  );
}

/**
 * The bar beside an evidence level.
 *
 * `not-checked` draws the dashed empty track rather than a 0% bar, because
 * "we have not asked you" and "you got none right" are different claims and
 * the prototype must not make the second while meaning the first.
 */
export function EvidenceMeter({
  level,
  label,
  className,
}: {
  level: EvidenceLevel;
  label: string;
  className?: string;
}) {
  if (level === 'not-checked') {
    return <EmptyMeter label={`${label}: not checked yet`} className={className} />;
  }
  const value: Record<Exclude<EvidenceLevel, 'not-checked'>, number> = {
    practising: 0.34,
    'independent-once': 0.67,
    retained: 1,
  };
  return (
    <Meter
      value={value[level]}
      tone={EVIDENCE_TONE[level]}
      label={`${label}: ${EVIDENCE_LABEL[level]}`}
      className={className}
    />
  );
}

/* ── Labels ───────────────────────────────────────────────────────────── */

export const FORMAT_LABEL: Record<QuestionFormat, string> = {
  flashcard: 'Flashcard',
  'multiple-choice': 'Multiple choice',
  'multiple-select': 'Multiple select',
  matching: 'Matching',
  ordering: 'Ordering',
  'fill-blank': 'Fill in the blank',
  'written-recall': 'Written recall',
  'source-analysis': 'Source analysis',
  essay: 'Essay',
};

export const DIFFICULTY_LABEL: Record<Difficulty, string> = {
  recall: 'Recall',
  reasoning: 'Reasoning',
  stretch: 'Stretch',
};

export const DIFFICULTY_BLURB: Record<Difficulty, string> = {
  recall: 'Definitions, dates and content you should be able to state.',
  reasoning: 'Why and how — causal chains, comparisons, the use of evidence.',
  stretch: 'The harder end: historiography, limitations, extended argument.',
};

export const KIND_LABEL: Record<MaterialKind, string> = {
  reading: 'Reading',
  'lecture-notes': 'Lecture notes',
  'student-note': 'My note',
};

export const ORIGIN_LABEL: Record<MaterialOrigin, string> = {
  authored: 'Sample course material',
  pasted: 'Pasted by you',
  'text-file': 'Text file you added',
  preview: 'Sample preview — file not read',
};

export const OUTCOME_LABEL: Record<Outcome, string> = {
  correct: 'Correct',
  partial: 'Partly right',
  incorrect: 'Incorrect',
  skipped: 'Not answered',
};

export function OutcomeBadge({ outcome }: { outcome: Outcome }) {
  const style: Record<Outcome, string> = {
    correct: 'bg-success/15 text-success border-success/30',
    partial: 'bg-warning/20 text-warning-foreground border-warning/40',
    incorrect: 'bg-destructive/12 text-destructive border-destructive/30',
    skipped: 'bg-muted text-muted-foreground border-transparent',
  };
  return (
    <span
      className={cn(
        'inline-flex w-fit shrink-0 items-center rounded-md border px-1.5 py-0.5 text-xs font-medium whitespace-nowrap',
        style[outcome],
      )}
    >
      {OUTCOME_LABEL[outcome]}
    </span>
  );
}

/* ── Honesty notices ──────────────────────────────────────────────────── */

/**
 * The label on anything simulated.
 *
 * ── Why this is a component and not a sentence in the README ──────────────
 *
 * The brief requires simulated tutoring and marking to be clearly identified
 * wherever it appears, and a note in a document is not "wherever it appears".
 * Making it a component means the disclosure travels with the thing being
 * disclosed, and a new surface that renders scripted output has an obvious
 * thing to reach for.
 *
 * `tone="inline"` is the quiet version for a panel that already sits inside a
 * labelled context; `tone="block"` is the first-time, unmissable version.
 */
export function SimulatedNotice({
  children,
  tone = 'inline',
  className,
}: {
  children: ReactNode;
  tone?: 'inline' | 'block';
  className?: string;
}) {
  if (tone === 'inline') {
    return (
      <p
        className={cn(
          'text-muted-foreground flex items-start gap-tight text-xs leading-relaxed',
          className,
        )}
      >
        <FlaskConicalIcon className="mt-0.5 size-3 shrink-0" aria-hidden />
        <span>{children}</span>
      </p>
    );
  }
  return (
    <div
      className={cn(
        'bg-muted/60 text-muted-foreground flex items-start gap-snug rounded-lg border border-dashed p-snug text-xs leading-relaxed',
        className,
      )}
    >
      <FlaskConicalIcon className="mt-0.5 size-3.5 shrink-0" aria-hidden />
      <span>{children}</span>
    </div>
  );
}

/** The standing label on the fictional course content. */
export function FictionalNotice({ className }: { className?: string }) {
  return (
    <p
      className={cn(
        'text-muted-foreground flex items-start gap-tight text-xs leading-relaxed',
        className,
      )}
    >
      <InfoIcon className="mt-0.5 size-3 shrink-0" aria-hidden />
      <span>
        Fictional course material written for this prototype. The historians,
        books and documents quoted here do not exist.
      </span>
    </p>
  );
}

/* ── Source links ─────────────────────────────────────────────────────── */

/**
 * A link back to the passage a question or explanation came from.
 *
 * Renders nothing when the reference cannot be resolved — which happens when a
 * student deletes a material that a question cites. A dead link into a deleted
 * reading is worse than no link, and the question's explanation stands on its
 * own without it.
 */
export function SourceLink({
  source,
  className,
}: {
  source: SourceRef | undefined;
  className?: string;
}) {
  const resolved = useSource(source);
  if (!resolved || !source) return null;

  return (
    <Link
      to={`/materials/${source.materialId}#${source.passageId}`}
      className={cn(
        'text-muted-foreground hover:text-foreground inline-flex items-center gap-hairline text-xs underline-offset-4 hover:underline',
        className,
      )}
    >
      <BookOpenIcon className="size-3 shrink-0" aria-hidden />
      <span className="truncate">
        {resolved.material.title} — {resolved.passage.heading}
      </span>
    </Link>
  );
}

/* ── Small shared bits ────────────────────────────────────────────────── */

export function TopicPill({ title }: { title: string }) {
  return (
    <Badge variant="secondary" className="font-normal">
      {title}
    </Badge>
  );
}

/** A count with its unit, set in the mono face. */
export function Stat({
  value,
  label,
  className,
}: {
  value: ReactNode;
  label: string;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col gap-hairline', className)}>
      <span className="font-mono text-2xl tabular-nums">{value}</span>
      <span className="text-muted-foreground text-xs">{label}</span>
    </div>
  );
}

/* ── Formatting ───────────────────────────────────────────────────────── */

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function formatRelative(iso: string): string {
  const days = Math.floor(
    (Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24),
  );
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  if (days < 14) return 'Last week';
  return formatDate(iso);
}

/** mm:ss, for exam timers. */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}
