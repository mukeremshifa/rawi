import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { BookOpenIcon } from 'lucide-react';

import type {
  AssessmentType,
  AttemptMode,
  BookMode,
  CheckInMood,
  NavigationMode,
  SessionStatus,
  TimingMode,
  Difficulty,
  Outcome,
  QuestionFormat,
  SelfMark,
  SessionActivity,
  SourceRef,
} from '@shared/domain/types';
import { localISO } from '@shared/domain/planner';

import { cn } from '@/lib/utils';

/**
 * The vocabulary shared across features.
 *
 * Anything that appears in more than one product area and carries a meaning
 * lives here — an evidence level, a format name, a link back to a source. The
 * alternative is six features each deciding independently what "practising"
 * looks like, which is how an app stops reading as one product.
 */

/* ── Labels ───────────────────────────────────────────────────────────── */

export const FORMAT_LABEL: Record<QuestionFormat, string> = {
  flashcard: 'Flashcard',
  'multiple-choice': 'Multiple choice',
  numeric: 'Numeric',
  cloze: 'Fill in the blank',
  ordering: 'Ordering',
  matching: 'Matching',
  'self-check': 'Self-check',
};

export const SELF_MARK_LABEL: Record<SelfMark, string> = { got: 'right', partly: 'partly right', missed: 'missed' };

export const DIFFICULTY_LABEL: Record<Difficulty, string> = {
  recall: 'Recall',
  reasoning: 'Reasoning',
  stretch: 'Stretch',
};

export const OUTCOME_LABEL: Record<Outcome, string> = {
  correct: 'Correct',
  partial: 'Partly right',
  incorrect: 'Incorrect',
  skipped: 'Not answered',
};

export function OutcomeBadge({ outcome }: { outcome: Outcome }) {
  const style: Record<Outcome, string> = {
    correct: 'bg-success-subtle text-success-text border-transparent',
    partial: 'bg-warning-subtle text-warning-text border-transparent',
    incorrect: 'bg-danger-subtle text-danger-text border-transparent',
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

/* ── Source links ─────────────────────────────────────────────────────── */

/**
 * A link back to the exact blocks a question or explanation came from.
 *
 * ── Why the course comes from the material, not from context ──────────────
 *
 * Materials are course-owned and live at `/course/:courseId/materials/:id`, so
 * a source link has to name the course. It takes that from the *resolved
 * material* rather than from whichever course the student happens to be
 * looking at. Those are almost always the same, and when they are not the
 * material's own course is the correct answer: a global history list can cite
 * a source from a course you are not currently inside, and sending you to the
 * active course's copy of that id would be wrong twice over.
 *
 * ── Why an unresolvable source still renders ──────────────────────────────
 *
 * A student who deletes a reading leaves questions citing it. The link used to
 * disappear, which silently turned "this came from somewhere" into "this came
 * from nowhere". It now says the source is unavailable, as plain text rather
 * than an enabled link into a 404.
 */
export function SourceLink({ source, className }: { source: SourceRef | undefined; className?: string }) {
  if (!source) return null;
  if (!source.versionId || !source.blockIds.length) {
    return (
      <span className={cn('text-muted-foreground inline-flex items-center gap-hairline text-xs', className)}>
        <BookOpenIcon className="size-3 shrink-0" aria-hidden />
        <span className="truncate">Source no longer available</span>
      </span>
    );
  }

  return (
    <Link
      to={`/materials/${source.materialId}/versions/${source.versionId}#block-${source.blockIds[0]}`}
      className={cn(
        'text-muted-foreground hover:text-foreground inline-flex items-center gap-hairline text-xs underline-offset-4 hover:underline',
        className,
      )}
    >
      <BookOpenIcon className="size-3 shrink-0" aria-hidden />
      <span className="truncate">Read the exact source</span>
    </Link>
  );
}

/* ── Small shared bits ────────────────────────────────────────────────── */

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
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24));
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  if (days < 14) return 'Last week';
  return formatDate(iso);
}

/** `formatRelative` for the middle of a sentence: "started today", but "started Nov 2, 2026". */
export function formatRelativeInline(iso: string): string {
  const text = formatRelative(iso);
  return /^(Today|Yesterday|Last week|\d+ days ago)$/.test(text) ? text.charAt(0).toLowerCase() + text.slice(1) : text;
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

/** A date label that leads with today/tomorrow, for deadlines. */
export function formatDueDate(iso: string, now: Date = new Date()): string {
  const days = Math.round(
    (new Date(`${iso}T12:00:00`).getTime() - new Date(`${localISO(now)}T12:00:00`).getTime()) / 86_400_000,
  );
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  if (days === -1) return 'Yesterday';
  if (days > 1 && days <= 13) return `In ${days} days`;
  if (days < -1 && days >= -13) return `${Math.abs(days)} days ago`;
  return formatDate(`${iso}T12:00:00`);
}

/* ── Labels for values the learner sees ───────────────────────────────── */

export const MODE_LABEL: Record<AttemptMode, string> = {
  practice: 'Practice',
  exam: 'Exam',
  tutored: 'With the tutor',
  'self-rated': 'Self-rated',
};

export const MOOD_LABEL: Record<CheckInMood, string> = {
  'on-track': 'On track',
  confident: 'Confident',
  struggling: 'Struggling',
  'less-time': 'Short on time',
};

export const SESSION_STATUS_LABEL: Record<SessionStatus, string> = {
  planned: 'Planned',
  completed: 'Done',
  skipped: 'Skipped',
};

export const MATERIAL_KIND_LABEL: Record<'reading' | 'slides' | 'other' | 'syllabus', string> = {
  reading: 'Reading',
  slides: 'Slides',
  other: 'Other',
  syllabus: 'Syllabus',
};

export const VERSION_ORIGIN_LABEL: Record<'paste' | 'upload', string> = {
  paste: 'Pasted',
  upload: 'Uploaded',
};

export const VERSION_STATUS_LABEL: Record<import('@shared/contracts/document').ConversionStatus, string> = {
  pending: 'Waiting to convert',
  processing: 'Converting',
  ready: 'Ready',
  partial: 'Partly converted',
  failed: 'Conversion failed',
};

export const TIMING_LABEL: Record<TimingMode, string> = {
  overall: 'Timed paper',
  'per-section': 'Timed sections',
  untimed: 'Untimed',
};

export const NAVIGATION_LABEL: Record<NavigationMode, string> = {
  free: 'Move freely',
  sequential: 'In order, no going back',
};

export const BOOK_LABEL: Record<BookMode, string> = { closed: 'Closed book', open: 'Open book' };

export const RATING_LABEL: Record<'again' | 'hard' | 'good' | 'easy', string> = {
  again: 'Again',
  hard: 'Hard',
  good: 'Good',
  easy: 'Easy',
};

export const THEME_LABEL = { system: 'Match system', light: 'Light', dark: 'Dark' } as const;
export const READING_SIZE_LABEL = { normal: 'Standard', large: 'Large', larger: 'Larger' } as const;
export const MOTION_LABEL = { system: 'Match system', reduced: 'Reduced', full: 'Full' } as const;

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
  return Math.round(
    (new Date(`${date}T12:00:00`).getTime() - new Date(`${localISO(now)}T12:00:00`).getTime()) / 86_400_000,
  );
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
    <span
      className={cn(
        'tabular text-sm whitespace-nowrap',
        urgent ? 'text-danger-text font-medium' : 'text-muted-foreground',
        className,
      )}
      title={formatDate(`${date}T12:00:00`)}
    >
      {formatDueDate(date)}
    </span>
  );
}
