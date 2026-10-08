import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { BookOpenIcon, FlaskConicalIcon, InfoIcon } from 'lucide-react';

import type {
  AssessmentType,
  Difficulty,
  MaterialKind,
  MaterialOrigin,
  Outcome,
  QuestionFormat,
  SessionActivity,
  SourceRef,
} from '@shared/domain/types';
import { localISO } from '@shared/domain/planner';

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

/**
 * The vocabulary shared across features.
 *
 * Anything that appears in more than one product area and carries a meaning
 * lives here — an evidence level, a format name, a link back to a passage. The
 * alternative is six features each deciding independently what "practising"
 * looks like, which is how an app stops reading as one product.
 */

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
    correct: 'bg-success-subtle text-success-text border-transparent',
    partial: 'bg-warning-subtle text-warning-text border-transparent',
    incorrect: 'bg-danger-subtle text-danger-text border-transparent',
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
    <Badge variant="neutral" className="font-normal">
      {title}
    </Badge>
  );
}

/**
 * Stat: one number and what it counts, such as "12 day streak". Tabular
 * figures. Use "—" for a value that does not exist yet.
 */
export function Stat({ value, label, className }: { value: ReactNode; label: string; className?: string }) {
  return (
    <div className={cn('flex flex-col gap-0.5', className)}>
      <span className="tabular text-xl font-semibold tracking-tight">{value}</span>
      <span className="text-muted-foreground text-sm">{label}</span>
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

/** Whole days from today to an ISO date, in the learner's local calendar. */
export function daysUntil(date: string, now: Date = new Date()): number {
  return Math.round((new Date(`${date}T12:00:00`).getTime() - new Date(`${localISO(now)}T12:00:00`).getTime()) / 86_400_000);
}

/**
 * DueLabel: a relative date for a deadline ("Tomorrow", "In 5 days"). Plain
 * text, coloured only when urgent (three days or fewer), because colour that
 * changes every day reads as decoration.
 */
export function DueLabel({ date, className }: { date: string; className?: string }) {
  const days = daysUntil(date);
  const urgent = days >= 0 && days <= 3;
  return (
    <span className={cn('tabular text-sm whitespace-nowrap', urgent ? 'text-danger-text font-medium' : 'text-muted-foreground', className)} title={formatDate(`${date}T12:00:00`)}>
      {formatDueDate(date)}
    </span>
  );
}
