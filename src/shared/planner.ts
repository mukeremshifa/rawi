import type {
  Attempt,
  Availability,
  Course,
  PlanProposal,
  PlannedAssessment,
  PlannedSession,
  SessionActivity,
  Topic,
  UnscheduledWork,
  Weekday,
} from './types.ts';
import { deriveEvidence, dueReviews } from './progress.ts';

/**
 * The local study planner.
 *
 * ── What this is, and what it is careful not to claim ─────────────────────
 *
 * A few explainable rules over the student's own data. Not an optimiser, not a
 * model, and the UI says so wherever a plan is shown. The brief asks for
 * simulated planning that a student can inspect, disagree with and edit, which
 * makes explicability the design constraint: every session the planner emits
 * carries the sentence that justifies it, and that sentence is generated from
 * the same rule that produced the session rather than written to sound good.
 *
 * ── The rules, in the order they are applied ──────────────────────────────
 *
 *   1. Work out the free time. Recurring availability, minus day exceptions,
 *      minus everything already on the calendar that the student wants kept.
 *   2. Work out what needs doing, and how urgently. Assessment proximity is
 *      the dominant term — a quiz in five days outranks a final in six weeks —
 *      weighted by topic priority and by how thin the evidence is.
 *   3. Place the highest-priority work into the earliest slot that fits it,
 *      respecting the student's preferred session length.
 *   4. Anything that does not fit is *reported*, not dropped.
 *
 * ── Why nothing is random ─────────────────────────────────────────────────
 *
 * Planning the same week twice produces the same plan. That is what makes
 * "regenerate" safe to press: a student who regenerates after locking two
 * sessions gets their two sessions plus the same proposal around them, rather
 * than a different week each time. It is also why duplicates do not
 * accumulate — a regenerated plan replaces its own previous output, which it
 * can identify because it marked it `generated`.
 */

const DAY_MS = 1000 * 60 * 60 * 24;

/** ISO date `n` days after an ISO date. */
export function addDays(date: string, n: number): string {
  const d = new Date(`${date}T12:00:00`);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Today, as a local ISO date — not `toISOString()`, which is UTC. */
export function todayISO(now: Date = new Date()): string {
  return localISO(now);
}

/**
 * An ISO date in the *local* calendar.
 *
 * `Date.toISOString()` converts to UTC first, which shifts the date either side
 * of midnight for most of the world. Streaks, "is this session today" and the
 * planner's day boundaries all have to agree with the calendar the student is
 * looking at, so every date in this app that represents a *day* goes through
 * here rather than through `toISOString().slice(0, 10)`.
 */
export function localISO(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** The Monday of the week containing an ISO date. */
export function weekStart(date: string): string {
  const d = new Date(`${date}T12:00:00`);
  const day = d.getDay();
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
  return localISO(d);
}

/** The seven ISO dates of the week beginning `monday`. */
export function weekDates(monday: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

export function daysBetweenDates(from: string, to: string): number {
  return Math.round(
    (new Date(`${to}T12:00:00`).getTime() - new Date(`${from}T12:00:00`).getTime()) /
      DAY_MS,
  );
}

export function weekdayOf(date: string): Weekday {
  return new Date(`${date}T12:00:00`).getDay() as Weekday;
}

/** `540` → `"09:00"`. */
export function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/* ── Availability ─────────────────────────────────────────────────────── */

export interface FreeSlot {
  date: string;
  startMinutes: number;
  endMinutes: number;
}

/**
 * The windows a student said they are free on a given date.
 *
 * An exception for that date replaces the weekday pattern outright, including
 * when its window list is empty — that is how "I am away on Thursday" is
 * expressed, and it has to beat the recurring Thursday window rather than
 * merge with it.
 */
export function windowsForDate(
  availability: Availability,
  date: string,
): { startMinutes: number; endMinutes: number }[] {
  const exception = availability.exceptions.find((e) => e.date === date);
  if (exception) return [...exception.windows].sort((a, b) => a.startMinutes - b.startMinutes);
  return availability.windows
    .filter((w) => w.day === weekdayOf(date))
    .map((w) => ({ startMinutes: w.startMinutes, endMinutes: w.endMinutes }))
    .sort((a, b) => a.startMinutes - b.startMinutes);
}

/** Total minutes of availability on a date, before commitments. */
export function availableMinutes(availability: Availability, date: string): number {
  return windowsForDate(availability, date).reduce(
    (sum, w) => sum + Math.max(0, w.endMinutes - w.startMinutes),
    0,
  );
}

/**
 * Free time on a date, with the given sessions subtracted.
 *
 * Returns the gaps rather than a total, because a planner that knows it has
 * 90 free minutes but not *where* will happily schedule a 60-minute session
 * across a gap that is two 45-minute halves.
 */
export function freeSlots(
  availability: Availability,
  date: string,
  busy: PlannedSession[],
): FreeSlot[] {
  const occupied = busy
    .filter((s) => s.date === date)
    .map((s) => ({
      start: s.startMinutes,
      end: s.startMinutes + s.durationMinutes,
    }))
    .sort((a, b) => a.start - b.start);

  const slots: FreeSlot[] = [];

  for (const window of windowsForDate(availability, date)) {
    let cursor = window.startMinutes;
    for (const block of occupied) {
      if (block.end <= cursor || block.start >= window.endMinutes) continue;
      if (block.start > cursor) {
        slots.push({ date, startMinutes: cursor, endMinutes: Math.min(block.start, window.endMinutes) });
      }
      cursor = Math.max(cursor, block.end);
    }
    if (cursor < window.endMinutes) {
      slots.push({ date, startMinutes: cursor, endMinutes: window.endMinutes });
    }
  }

  return slots.filter((s) => s.endMinutes > s.startMinutes);
}

/* ── What needs doing ─────────────────────────────────────────────────── */

/** One piece of work the planner would like to schedule. */
interface Candidate {
  courseId: string;
  topicIds: string[];
  title: string;
  activity: SessionActivity;
  minutes: number;
  reason: string;
  weight: number;
  assessmentId?: string;
  /** Stable across regenerations, so a re-plan replaces rather than duplicates. */
  key: string;
}

export interface PlanInputs {
  courses: Course[];
  topics: Topic[];
  attempts: Attempt[];
  assessments: PlannedAssessment[];
  availability: Availability;
  /** Every session already on the calendar, in any week. */
  sessions: PlannedSession[];
  /** Topic ids with at least one authored question, so no dead ends are planned. */
  topicsWithQuestions: Set<string>;
  weekStart: string;
  today: string;
}

/**
 * How urgent an assessment makes its topics.
 *
 * A steep curve rather than a linear one, because the difference between
 * "in three days" and "in ten days" matters far more to what a student should
 * do tonight than the difference between "in forty days" and "in fifty".
 */
function urgency(daysAway: number): number {
  if (daysAway < 0) return 0;
  if (daysAway <= 3) return 60;
  if (daysAway <= 7) return 45;
  if (daysAway <= 14) return 28;
  if (daysAway <= 28) return 14;
  return 6;
}

const PRIORITY_WEIGHT = { high: 12, normal: 5, low: 0 } as const;

function candidates(input: PlanInputs): Candidate[] {
  const {
    courses,
    topics,
    attempts,
    assessments,
    topicsWithQuestions,
    today,
  } = input;
  const out: Candidate[] = [];
  const active = courses.filter((c) => !c.archived);
  const sessionMinutes = input.availability.sessionMinutes || 45;

  for (const course of active) {
    const courseTopics = topics.filter((t) => t.courseId === course.id);
    const upcoming = assessments
      .filter((a) => a.courseId === course.id && a.date >= today)
      .sort((a, b) => a.date.localeCompare(b.date));

    for (const topic of courseTopics) {
      const evidence = deriveEvidence(topic.id, attempts);

      /* The nearest assessment that actually covers this topic. An assessment
         with no recorded coverage is treated as covering the whole course,
         because that is the safer reading of "not recorded yet". */
      const covering = upcoming.find(
        (a) => a.topicIds.length === 0 || a.topicIds.includes(topic.id),
      );
      const daysAway = covering ? daysBetweenDates(today, covering.date) : 999;

      const evidenceWeight =
        evidence.level === 'not-checked'
          ? 26
          : evidence.level === 'practising'
            ? 18
            : evidence.level === 'independent-once'
              ? 7
              : 0;

      if (evidenceWeight === 0 && daysAway > 14) continue;

      const weight =
        evidenceWeight + PRIORITY_WEIGHT[topic.priority] + urgency(daysAway);

      const hasQuestions = topicsWithQuestions.has(topic.id);

      /* Not-yet-studied topics get taught; studied ones get tested. A topic
         with no authored questions can only be taught or read, and saying so
         is better than planning practice that would open an empty set. */
      const activity: SessionActivity =
        evidence.level === 'not-checked' ? 'tutor' : hasQuestions ? 'practice' : 'read';

      const assessmentClause = covering
        ? ` ${covering.title} is ${
            daysAway === 0
              ? 'today'
              : daysAway === 1
                ? 'tomorrow'
                : `in ${daysAway} days`
          } and covers it.`
        : '';

      const evidenceClause =
        evidence.level === 'not-checked'
          ? 'Nothing recorded on this topic yet.'
          : evidence.level === 'practising'
            ? 'You have worked on this but not yet answered unaided.'
            : 'One unaided answer so far; a second would confirm it.';

      out.push({
        courseId: course.id,
        topicIds: [topic.id],
        title: `${activity === 'tutor' ? 'Learn' : activity === 'read' ? 'Read' : 'Practise'} ${topic.title}`,
        activity,
        minutes: sessionMinutes,
        reason: `${evidenceClause}${assessmentClause}`,
        weight,
        ...(covering ? { assessmentId: covering.id } : {}),
        key: `gen-${course.id}-${topic.id}-${activity}`,
      });
    }

    /* Reviews that have come due are their own, shorter, kind of work. */
    for (const review of dueReviews(courseTopics, attempts).slice(0, 2)) {
      const topic = courseTopics.find((t) => t.id === review.topicId);
      if (!topic || !topicsWithQuestions.has(topic.id)) continue;
      out.push({
        courseId: course.id,
        topicIds: [topic.id],
        title: `Review ${topic.title}`,
        activity: 'flashcards',
        minutes: Math.min(sessionMinutes, 30),
        reason: `Last worked ${review.daysSince} days ago. A topic is flagged for review after three days untouched.`,
        weight: 30 + Math.min(review.daysSince, 10),
        key: `gen-${course.id}-review-${topic.id}`,
      });
    }

    /* A timed rehearsal, when an assessment is close enough for pace to
       matter more than coverage. */
    const soon = upcoming[0];
    if (soon) {
      const daysAway = daysBetweenDates(today, soon.date);
      if (daysAway <= 14) {
        out.push({
          courseId: course.id,
          topicIds: soon.topicIds,
          title: `Timed rehearsal for ${soon.title}`,
          activity: 'exam',
          minutes: Math.min(soon.durationMinutes ?? sessionMinutes, 60),
          reason: `${soon.title} is ${daysAway <= 1 ? 'imminent' : `in ${daysAway} days`}. Working under time is a separate skill from knowing the material.`,
          weight: 40 + urgency(daysAway) / 2,
          assessmentId: soon.id,
          key: `gen-${course.id}-rehearse-${soon.id}`,
        });
      }
    }
  }

  return out.sort((a, b) => b.weight - a.weight);
}

/* ── Building the proposal ────────────────────────────────────────────── */

export interface PlanOptions {
  /**
   * Sessions the student has asked to keep. Completed and skipped sessions are
   * always kept regardless; this is for planned ones they have arranged
   * themselves.
   */
  keepSessionIds?: string[];
  /** Cap on how much the plan will schedule, as a share of free time. */
  fillRatio?: number;
}

/**
 * Proposes a week.
 *
 * ── What is never touched ─────────────────────────────────────────────────
 *
 * Completed sessions, skipped sessions, sessions in the past, and anything the
 * student has locked or edited. The planner only ever proposes *new* sessions
 * in free slots, and only ever removes sessions it generated itself and that
 * remain untouched. A student who arranged their Thursday by hand keeps their
 * Thursday.
 */
export function planWeek(input: PlanInputs, options: PlanOptions = {}): PlanProposal {
  const { availability, sessions, weekStart: monday, today } = input;
  const keep = new Set(options.keepSessionIds ?? []);
  const dates = weekDates(monday);

  /*
   * Which existing sessions stand.
   *
   * A generated session that is still untouched is *replaceable* — that is
   * what stops regeneration from piling duplicates on top of last time's
   * proposal. Everything else survives: anything completed or skipped, anything
   * the student locked or was explicitly asked to keep, anything they made
   * themselves, and anything in the past.
   */
  const isReplaceable = (s: PlannedSession) =>
    s.generated === true &&
    !s.locked &&
    s.status === 'planned' &&
    !keep.has(s.id) &&
    s.date >= today &&
    dates.includes(s.date);

  const standing = sessions.filter(
    (s) => dates.includes(s.date) && !isReplaceable(s),
  );

  const pool = candidates(input);

  /* Work already standing this week does not need proposing again. */
  const alreadyCovered = new Set(
    standing.flatMap((s) => s.topicIds.map((t) => `${s.activity}:${t}`)),
  );

  const placed: PlannedSession[] = [];
  const unscheduled: UnscheduledWork[] = [];
  const notes: string[] = [];

  /* Only days from today onward: the planner cannot schedule work into a day
     that has already happened. */
  const plannableDates = dates.filter((d) => d >= today);

  let minutesAvailable = 0;
  for (const date of plannableDates) {
    minutesAvailable += freeSlots(availability, date, standing).reduce(
      (sum, s) => sum + (s.endMinutes - s.startMinutes),
      0,
    );
  }

  const budget = Math.floor(minutesAvailable * (options.fillRatio ?? 0.8));
  let minutesPlanned = 0;

  /** Sessions placed so far, so the next placement sees them as busy. */
  const busy = () => [...standing, ...placed];

  /*
   * One session per course per day, at most.
   *
   * Without this the highest-weighted course takes every slot on the first
   * available evening, which is technically the ranking working correctly and
   * is not how anyone studies. Spreading contact across days is worth more than
   * strictly honouring the ordering.
   */
  const perCoursePerDay = new Map<string, number>();

  for (const candidate of pool) {
    if (minutesPlanned >= budget) {
      unscheduled.push({
        courseId: candidate.courseId,
        title: candidate.title,
        minutes: candidate.minutes,
        reason: 'No free time left in this week’s availability.',
      });
      continue;
    }

    if (candidate.topicIds.some((t) => alreadyCovered.has(`${candidate.activity}:${t}`))) {
      continue;
    }

    let slotted = false;

    for (const date of plannableDates) {
      const dayKey = `${candidate.courseId}:${date}`;
      if ((perCoursePerDay.get(dayKey) ?? 0) >= 1) continue;

      const slot = freeSlots(availability, date, busy()).find(
        (s) => s.endMinutes - s.startMinutes >= candidate.minutes,
      );
      if (!slot) continue;

      placed.push({
        id: `${candidate.key}-${date}`,
        courseId: candidate.courseId,
        date,
        startMinutes: slot.startMinutes,
        durationMinutes: candidate.minutes,
        title: candidate.title,
        activity: candidate.activity,
        topicIds: candidate.topicIds,
        ...(candidate.assessmentId ? { assessmentId: candidate.assessmentId } : {}),
        link: linkFor(candidate),
        status: 'planned',
        generated: true,
        reason: candidate.reason,
        createdAt: new Date().toISOString(),
      });

      perCoursePerDay.set(dayKey, (perCoursePerDay.get(dayKey) ?? 0) + 1);
      minutesPlanned += candidate.minutes;
      for (const t of candidate.topicIds) {
        alreadyCovered.add(`${candidate.activity}:${t}`);
      }
      slotted = true;
      break;
    }

    if (!slotted) {
      unscheduled.push({
        courseId: candidate.courseId,
        title: candidate.title,
        minutes: candidate.minutes,
        reason:
          minutesAvailable === 0
            ? 'No study availability is set for the remaining days of this week.'
            : `No free block of ${candidate.minutes} minutes remains in this week.`,
      });
    }
  }

  if (minutesAvailable === 0) {
    notes.push(
      'There is no availability left in this week, so nothing could be scheduled. Set your weekly availability in the planner and try again.',
    );
  } else if (unscheduled.length > 0) {
    notes.push(
      `${unscheduled.length} ${unscheduled.length === 1 ? 'piece' : 'pieces'} of work did not fit. They are listed below rather than squeezed in.`,
    );
  }

  if (standing.some((s) => s.status === 'planned')) {
    notes.push(
      `${standing.filter((s) => s.status === 'planned').length} session${
        standing.filter((s) => s.status === 'planned').length === 1 ? '' : 's'
      } already on your calendar ${
        standing.filter((s) => s.status === 'planned').length === 1 ? 'was' : 'were'
      } kept, and the plan works around ${
        standing.filter((s) => s.status === 'planned').length === 1 ? 'it' : 'them'
      }.`,
    );
  }

  return {
    weekStart: monday,
    sessions: placed,
    keptSessionIds: standing.map((s) => s.id),
    unscheduled: unscheduled.slice(0, 8),
    minutesPlanned,
    minutesAvailable,
    notes,
  };
}

/** What a generated session opens. */
function linkFor(candidate: Candidate): PlannedSession['link'] {
  const topicId = candidate.topicIds[0];
  switch (candidate.activity) {
    case 'tutor':
      return topicId ? { kind: 'tutor', topicId } : undefined;
    case 'flashcards':
      return { kind: 'practice-new', topicIds: candidate.topicIds, activity: 'flashcards' };
    case 'practice':
      return { kind: 'practice-new', topicIds: candidate.topicIds, activity: 'quiz' };
    default:
      return undefined;
  }
}

/**
 * The sessions a regeneration would remove.
 *
 * Exposed separately so the proposal screen can say "this replaces 3 sessions
 * suggested earlier" before anything is applied, rather than the student
 * discovering it afterwards.
 */
export function replacedByPlan(
  sessions: PlannedSession[],
  proposal: PlanProposal,
  today: string,
): PlannedSession[] {
  const dates = weekDates(proposal.weekStart);
  const kept = new Set(proposal.keptSessionIds);
  return sessions.filter(
    (s) =>
      dates.includes(s.date) &&
      s.date >= today &&
      s.generated === true &&
      !s.locked &&
      s.status === 'planned' &&
      !kept.has(s.id),
  );
}

/**
 * A short plan for a day when the student has said they have less time.
 *
 * The brief asks that a short-time check-in connect to the planner rather than
 * spawning a second, independent schedule. So this does not create sessions: it
 * *selects* from what is already planned for today, keeping as much as fits the
 * reduced budget in priority order, and names what it is setting aside.
 */
export function trimDay(
  sessions: PlannedSession[],
  date: string,
  minutes: number,
): { keep: PlannedSession[]; defer: PlannedSession[] } {
  const todays = sessions
    .filter((s) => s.date === date && s.status === 'planned')
    .sort((a, b) => a.startMinutes - b.startMinutes);

  const keep: PlannedSession[] = [];
  const defer: PlannedSession[] = [];
  let used = 0;

  for (const session of todays) {
    if (used + session.durationMinutes <= minutes) {
      keep.push(session);
      used += session.durationMinutes;
    } else {
      defer.push(session);
    }
  }

  return { keep, defer };
}
