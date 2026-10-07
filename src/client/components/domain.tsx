import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { BookOpenIcon, FlaskConicalIcon, InfoIcon } from 'lucide-react';

import type {
  AssessmentType,
  CourseAccent,
  Difficulty,
  EvidenceLevel,
  MaterialKind,
  MaterialOrigin,
  Outcome,
  QuestionFormat,
  SessionActivity,
  SourceRef,
} from '@shared/types.ts';
import { EVIDENCE_DETAIL, EVIDENCE_LABEL, EVIDENCE_TONE } from '@shared/progress.ts';
import { localISO } from '@shared/planner.ts';

import { Badge } from '@/components/ui/badge';
import { Meter, EmptyMeter } from '@/components/Meter';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
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
  reasoning: 'Why and how: causal chains, comparisons, the use of evidence.',
  stretch: 'The harder end: historiography, limitations, extended argument.',
};

export const KIND_LABEL: Record<MaterialKind, string> = {
  reading: 'Reading',
  'lecture-notes': 'Lecture notes',
  'student-note': 'My note',
};

export const ORIGIN_LABEL: Record<MaterialOrigin, string> = {
  authored: 'Sample course material',
  imported: 'Converted from your own file',
  pasted: 'Pasted by you',
  'text-file': 'Text file you added',
  preview: 'Sample preview, file not read',
};

export const OUTCOME_LABEL: Record<Outcome, string> = {
  correct: 'Correct',
  partial: 'Partly right',
  incorrect: 'Incorrect',
  skipped: 'Not answered',
  pending: 'Awaiting feedback',
};

export function OutcomeBadge({ outcome }: { outcome: Outcome }) {
  const style: Record<Outcome, string> = {
    correct: 'bg-success/15 text-success border-success/30',
    partial: 'bg-warning/20 text-warning-text border-warning/40',
    incorrect: 'bg-destructive/12 text-destructive border-destructive/30',
    skipped: 'bg-muted text-muted-foreground border-transparent',
    pending: 'bg-muted text-muted-foreground border-dashed border-border',
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
    <OriginNotice className={className}>
      Fictional course material written for this prototype. The historians,
      books and documents quoted here do not exist.
    </OriginNotice>
  );
}

/**
 * The standing label on material converted from a real file.
 *
 * The opposite warning to `FictionalNotice`, and needed for the same reason.
 * This text is genuinely the lecturer's, so calling it fictional would be a
 * lie. What a reader does need to know is that Rawi still has no PDF parser:
 * the conversion happened outside the app, and a conversion can drop a
 * subscript or interleave a column, so the original is where a disagreement
 * gets settled.
 */
export function ImportedNotice({
  source,
  className,
}: {
  /** What was converted, named exactly. */
  source?: string;
  className?: string;
}) {
  return (
    <OriginNotice className={className}>
      {source ? `${source} was ` : 'This was '}
      converted to text outside Rawi and seeded in, so these are the original
      words rather than anything written for the prototype. Rawi still has no
      PDF reader of its own. Conversion can flatten a subscript or interleave a
      column, so check the original slide if something looks wrong.
    </OriginNotice>
  );
}

/** Shared frame for the two standing notices above a material's text. */
function OriginNotice({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <p
      className={cn(
        'text-muted-foreground flex items-start gap-tight text-xs leading-relaxed',
        className,
      )}
    >
      <InfoIcon className="mt-0.5 size-3 shrink-0" aria-hidden />
      <span>{children}</span>
    </p>
  );
}

/* ── Source links ─────────────────────────────────────────────────────── */

/**
 * A link back to the passage a question or explanation came from.
 *
 * ── Why the course comes from the material, not from context ──────────────
 *
 * Materials are course-owned and live at `/course/:courseId/materials/:id`, so
 * a source link has to name the course. It takes that from the *resolved
 * material* rather than from whichever course the student happens to be
 * looking at. Those are almost always the same, and when they are not the
 * material's own course is the correct answer: a global history list can cite
 * a passage from a course you are not currently inside, and sending you to the
 * active course's copy of that id would be wrong twice over.
 *
 * ── Why an unresolvable source still renders ──────────────────────────────
 *
 * A student who deletes a reading leaves questions citing it. The link used to
 * disappear, which silently turned "this came from somewhere" into "this came
 * from nowhere". It now says the source is unavailable, as plain text rather
 * than an enabled link into a 404.
 */
export function SourceLink({
  source,
  className,
}: {
  source: SourceRef | undefined;
  className?: string;
}) {
  if (!source) return null;
  const versionId = 'versionId' in source && typeof source.versionId === 'string' ? source.versionId === '' ? null : source.versionId : null;
  if (!versionId) {
    return (
      <span
        className={cn(
          'text-muted-foreground inline-flex items-center gap-hairline text-xs',
          className,
        )}
      >
        <BookOpenIcon className="size-3 shrink-0" aria-hidden />
        <span className="truncate">Source no longer available</span>
      </span>
    );
  }

  return (
    <Link
      to={`/materials/${source.materialId}/versions/${versionId}/passages/${source.passageId}`}
      className={cn(
        'text-muted-foreground hover:text-foreground inline-flex items-center gap-hairline text-xs underline-offset-4 hover:underline',
        className,
      )}
    >
      <BookOpenIcon className="size-3 shrink-0" aria-hidden />
      <span className="truncate">
        Read the exact source
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

/** Alias kept because several screens read better with the shorter name. */
export const relativeDay = formatRelative;

/** A day label for a calendar column: "Mon 14". */
export function formatDayShort(iso: string): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
  });
}

/** A date label that leads with today/tomorrow, for deadlines. */
export function formatDueDate(iso: string, now: Date = new Date()): string {
  const days = Math.round(
    (new Date(`${iso}T12:00:00`).getTime() -
      new Date(`${localISO(now)}T12:00:00`).getTime()) /
      86_400_000,
  );
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  if (days === -1) return 'Yesterday';
  if (days > 1 && days <= 13) return `In ${days} days`;
  if (days < -1 && days >= -13) return `${Math.abs(days)} days ago`;
  return formatDate(`${iso}T12:00:00`);
}

/** `570` → `"09:30"`, in the student's own clock convention. */
export function formatTimeOfDay(minutes: number): string {
  const d = new Date();
  d.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

/* ── Courses ──────────────────────────────────────────────────────────── */

/**
 * The accent classes for a course.
 *
 * Courses are told apart by colour in every aggregated view — the planner, the
 * home page, the history list — so the mapping lives here rather than being
 * re-decided per screen. The tokens are defined in `globals.css`; this is the
 * lookup that turns a course's stored accent name into the classes a component
 * applies.
 */
export const COURSE_ACCENT: Record<
  CourseAccent,
  { dot: string; border: string; soft: string; text: string }
> = {
  indigo: {
    dot: 'bg-[var(--accent-indigo)]',
    border: 'border-l-[var(--accent-indigo)]',
    soft: 'bg-[var(--accent-indigo-soft)]',
    text: 'text-[var(--accent-indigo)]',
  },
  amber: {
    dot: 'bg-[var(--accent-amber)]',
    border: 'border-l-[var(--accent-amber)]',
    soft: 'bg-[var(--accent-amber-soft)]',
    text: 'text-[var(--accent-amber)]',
  },
  teal: {
    dot: 'bg-[var(--accent-teal)]',
    border: 'border-l-[var(--accent-teal)]',
    soft: 'bg-[var(--accent-teal-soft)]',
    text: 'text-[var(--accent-teal)]',
  },
  rose: {
    dot: 'bg-[var(--accent-rose)]',
    border: 'border-l-[var(--accent-rose)]',
    soft: 'bg-[var(--accent-rose-soft)]',
    text: 'text-[var(--accent-rose)]',
  },
  violet: {
    dot: 'bg-[var(--accent-violet)]',
    border: 'border-l-[var(--accent-violet)]',
    soft: 'bg-[var(--accent-violet-soft)]',
    text: 'text-[var(--accent-violet)]',
  },
};

/** The small coloured dot that labels a course in an aggregated list. */
export function CourseDot({
  accent,
  className,
}: {
  accent: CourseAccent;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn('size-2 shrink-0 rounded-full', COURSE_ACCENT[accent].dot, className)}
    />
  );
}

/** A course's name with its dot, for cross-course lists. */
export function CourseTag({
  name,
  accent,
  className,
}: {
  name: string;
  accent: CourseAccent;
  className?: string;
}) {
  return (
    <span className={cn('flex min-w-0 items-center gap-1.5 text-xs', className)}>
      <CourseDot accent={accent} />
      <span className="truncate">{name}</span>
    </span>
  );
}

/* ── Assessments and sessions ─────────────────────────────────────────── */

export const ASSESSMENT_LABEL: Record<AssessmentType, string> = {
  quiz: 'Quiz',
  midterm: 'Midterm',
  final: 'Final',
  essay: 'Essay',
  presentation: 'Presentation',
  other: 'Assessment',
};

export const ACTIVITY_LABEL: Record<SessionActivity, string> = {
  tutor: 'Tutor',
  read: 'Reading',
  practice: 'Practice',
  flashcards: 'Flashcards',
  exam: 'Rehearsal',
  review: 'Review',
  other: 'Study',
};

/**
 * How close an assessment is, as a tone.
 *
 * Used for the countdown chip. Deliberately three bands rather than a gradient:
 * a colour that changes every day reads as decoration, and the only distinction
 * a student acts on is "this week / this fortnight / later".
 */
export function assessmentTone(days: number): 'urgent' | 'soon' | 'later' {
  if (days <= 3) return 'urgent';
  if (days <= 10) return 'soon';
  return 'later';
}

/** A countdown chip for a planned assessment. */
export function DueChip({ date, className }: { date: string; className?: string }) {
  const days = Math.round(
    (new Date(`${date}T12:00:00`).getTime() -
      new Date(`${localISO(new Date())}T12:00:00`).getTime()) /
      86_400_000,
  );
  const tone = assessmentTone(days);
  const past = days < 0;

  return (
    <span
      className={cn(
        'rounded-md border px-1.5 py-0.5 font-mono text-xs tabular-nums',
        past && 'text-muted-foreground',
        !past && tone === 'urgent' && 'border-destructive/40 text-destructive',
        !past && tone === 'soon' && 'border-warning/40 text-warning-text',
        !past && tone === 'later' && 'text-muted-foreground',
        className,
      )}
    >
      {past
        ? `${Math.abs(days)}d ago`
        : days === 0
          ? 'Today'
          : days === 1
            ? 'Tomorrow'
            : `${days} days`}
    </span>
  );
}
