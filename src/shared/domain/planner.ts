import type {
  Attempt,
  Availability,
  Course,
  Material,
  PlanProposal,
  PlannedAssessment,
  PlannedSession,
  Question,
  SessionActivity,
  Topic,
  UnscheduledWork,
  Weekday,
} from './types';
import { deriveEvidence, dueReviews } from './progress';
import {
  NO_CONTENT_REASON,
  bestActivity,
  substitutionNote,
  topicCapabilities,
} from './capabilities';

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
 *      minus everything already on the calendar that the student wants kept,
 *      minus the assessments themselves, minus the part of today that has
 *      already gone.
 *   2. Work out what needs doing, and how urgently. Assessment proximity is
 *      the dominant term: a quiz in five days outranks a final in six weeks,
 *      weighted by topic priority and by how thin the evidence is.
 *   3. Place the highest-priority work into the earliest slot that fits it and
 *      that falls *before its deadline*, respecting the student's preferred
 *      session length.
 *   4. Anything that does not fit is *reported*, with the reason it did not
 *      fit, rather than dropped or quietly moved past its deadline.
 *
 * ── Preparation and deadlines ─────────────────────────────────────────────
 *
 * Work tied to an assessment is useless after that assessment starts, so the
 * placement loop carries a *cutoff* for every candidate and will not schedule
 * past it. An assessment with a known time cuts off at that minute on that day;
 * one with only a date cuts off at the end of the day before, because the
 * prototype does not know whether a date-only quiz is at nine or at four and
 * inventing a time would be a fact it made up. Work that cannot be placed
 * before its cutoff is listed as unscheduled saying exactly that, which is the
 * one outcome that is honest when a deadline has already passed.
 *
 * ── Why nothing is random ─────────────────────────────────────────────────
 *
 * Planning the same week twice produces the same plan. That is what makes
 * "regenerate" safe to press: a student who regenerates after locking two
 * sessions gets their two sessions plus the same proposal around them, rather
 * than a different week each time. It is also why duplicates do not
 * accumulate: a regenerated plan replaces its own previous output, which it
 * can identify because it marked it `generated`.
 */

const DAY_MS = 1000 * 60 * 60 * 24;

/** ISO date `n` days after an ISO date. */
export function addDays(date: string, n: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Today, as a local ISO date, not `toISOString()`, which is UTC. */
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
export function localISO(date: Date | string, timezone?: string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  if (timezone) {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d);
    return ['year', 'month', 'day'].map(k => parts.find(p => p.type === k)!.value).join('-');
  }
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** The Monday of the week containing an ISO date. */
export function weekStart(date: string): string {
  const d = new Date(`${date}T12:00:00Z`);
  const day = d.getUTCDay();
  d.setUTCDate(d.getUTCDate() + (day === 0 ? -6 : 1 - day));
  return d.toISOString().slice(0, 10);
}

/** The seven ISO dates of the week beginning `monday`. */
export function weekDates(monday: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

export function daysBetweenDates(from: string, to: string): number {
  return Math.round(
    (new Date(`${to}T12:00:00Z`).getTime() - new Date(`${from}T12:00:00Z`).getTime()) /
      DAY_MS,
  );
}

export function weekdayOf(date: string): Weekday {
  return new Date(`${date}T12:00:00Z`).getUTCDay() as Weekday;
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
 * when its window list is empty. That is how "I am away on Thursday" is
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
  /**
   * Extra ranges that are not sessions but are still not free: the assessments
   * themselves, and the part of today that has already elapsed.
   */
  blocked: TimeRange[] = [],
): FreeSlot[] {
  const occupied = [
    ...busy
      .filter((s) => s.date === date)
      .map((s) => ({
        start: s.startMinutes,
        end: s.startMinutes + s.durationMinutes,
      })),
    ...blocked.filter((b) => b.date === date).map((b) => ({ start: b.start, end: b.end })),
  ].sort((a, b) => a.start - b.start);

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

/** A span of one day that is not available, in minutes from midnight. */
export interface TimeRange {
  date: string;
  start: number;
  end: number;
}

/**
 * When preparation for an assessment has to be finished.
 *
 * Returns the last minute that is still useful, as a date plus minutes from
 * midnight. An assessment with a time cuts off at that time. One with only a
 * date cuts off at the end of the previous day: the prototype does not know
 * whether it is at nine in the morning or four in the afternoon, and finishing
 * the day before is the conservative reading that cannot be wrong in the
 * direction that matters.
 */
export function preparationCutoff(assessment: PlannedAssessment): {
  date: string;
  minutes: number;
} {
  if (assessment.time) {
    return { date: assessment.date, minutes: minutesFromClock(assessment.time) };
  }
  return { date: addDays(assessment.date, -1), minutes: 24 * 60 };
}

/** `"09:30"` → `570`. */
export function minutesFromClock(time: string): number {
  const [h = '0', m = '0'] = time.split(':');
  return Number(h) * 60 + Number(m);
}

/**
 * The time the assessments themselves occupy.
 *
 * Only assessments with both a time and a duration produce a block: without
 * them there is nothing to place on the clock, and guessing would put a
 * phantom two-hour hole in a day the student may well be free.
 */
export function assessmentBlocks(assessments: PlannedAssessment[]): TimeRange[] {
  const out: TimeRange[] = [];
  for (const a of assessments) {
    if (!a.time || !a.durationMinutes) continue;
    const start = minutesFromClock(a.time);
    out.push({ date: a.date, start, end: start + a.durationMinutes });
  }
  return out;
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
  /**
   * The last moment this work is still worth doing, when it is preparation for
   * a particular assessment. Placement will not schedule past it.
   */
  cutoff?: { date: string; minutes: number };
  /** The assessment this prepares for, for the unscheduled explanation. */
  cutoffTitle?: string;
  /** The material a reading session opens. */
  materialId?: string;
  /** Stable across regenerations, so a re-plan replaces rather than duplicates. */
  key: string;
}

export interface PlanInputs {
  timezone?: string;
  courses: Course[];
  topics: Topic[];
  attempts: Attempt[];
  assessments: PlannedAssessment[];
  availability: Availability;
  /** Every session already on the calendar, in any week. */
  sessions: PlannedSession[];
  /**
   * The authored question pool and the materials, so the planner can check
   * what a topic actually supports before proposing an activity for it.
   */
  questions: Question[];
  materials: Material[];
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
    today,
  } = input;
  const out: Candidate[] = [];
  const active = courses.filter((c) => !c.archived);
  const sessionMinutes = input.availability.sessionMinutes || 45;

  /*
   * An assessment is only worth preparing for if there is still schedulable
   * time before it. The planner may be looking at a future week, in which case
   * "has it happened yet" has to be asked of *that* week's first plannable day
   * rather than of today: planning three weeks ahead must not propose revision
   * for a quiz that will be long over by then.
   */
  const firstPlannable = weekDates(input.weekStart).find((d) => d >= today);

  const stillAhead = (a: PlannedAssessment) => {
    if (!firstPlannable) return false;
    const cutoff = preparationCutoff(a);
    return cutoff.date >= firstPlannable;
  };

  for (const course of active) {
    const courseTopics = topics.filter((t) => t.courseId === course.id);
    /* Scoped per course, so one subject's content can never make another
       subject's topic look practisable. */
    const courseQuestions = input.questions.filter((q) => q.courseId === course.id);
    const courseMaterials = input.materials.filter((m) => m.courseId === course.id);
    const upcoming = assessments
      .filter((a) => a.courseId === course.id && stillAhead(a))
      .sort((a, b) => a.date.localeCompare(b.date));

    for (const topic of courseTopics) {
      const evidence = deriveEvidence(topic.id, attempts, input.timezone);

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

      /*
       * What this topic can actually support.
       *
       * Not-yet-studied topics are best taught and studied ones best tested,
       * but "best" has to give way to "possible": the tutor needs readable
       * material to teach from, and practice needs questions of the right
       * format. `bestActivity` returns the nearest possible thing, and `null`
       * when there is nothing, which becomes an honest setup prompt below
       * rather than a session that opens onto an apology.
       */
      const capabilities = topicCapabilities(topic, courseQuestions, courseMaterials);
      const preferred: SessionActivity =
        evidence.level === 'not-checked' ? 'tutor' : 'practice';
      const activity = bestActivity(preferred, capabilities);

      if (!activity) {
        out.push({
          courseId: course.id,
          topicIds: [topic.id],
          title: `Set up ${topic.title}`,
          activity: 'other',
          minutes: Math.min(sessionMinutes, 20),
          reason: NO_CONTENT_REASON,
          weight: Math.max(1, weight - 40),
          key: `gen-${course.id}-setup-${topic.id}`,
        });
        continue;
      }

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
            : 'One unaided answer so far, and a second would confirm it.';

      /* A reading session names the material it opens, so it is actionable
         rather than a note to go and find something. The first material
         covering the topic is the obvious choice and the student can change
         it by editing the session. */
      const readingMaterial =
        activity === 'read'
          ? courseMaterials.find(
              (m) =>
                m.topicIds.includes(topic.id) ||
                m.passages.some((pass) => pass.topicIds.includes(topic.id)),
            )
          : undefined;

      out.push({
        courseId: course.id,
        topicIds: [topic.id],
        ...(readingMaterial ? { materialId: readingMaterial.id } : {}),
        title: `${
          activity === 'tutor'
            ? 'Learn'
            : activity === 'read'
              ? 'Read'
              : activity === 'flashcards'
                ? 'Review'
                : 'Practise'
        } ${topic.title}`,
        activity,
        minutes: sessionMinutes,
        reason: `${evidenceClause}${assessmentClause}${substitutionNote(
          preferred,
          activity,
        )}`,
        weight,
        ...(covering
          ? {
              assessmentId: covering.id,
              cutoff: preparationCutoff(covering),
              cutoffTitle: covering.title,
            }
          : {}),
        key: `gen-${course.id}-${topic.id}-${activity}`,
      });
    }

    /* Reviews that have come due are their own, shorter, kind of work. */
    for (const review of dueReviews(courseTopics, attempts, new Date(), input.timezone).slice(0, 2)) {
      const topic = courseTopics.find((t) => t.id === review.topicId);
      if (!topic) continue;
      /* A review is a flashcard round when flashcards exist, and whatever
         practice the topic does support when they do not. "Any question for
         this topic" was the old test and it proposed flashcard sessions for
         topics whose only questions were essays. */
      const capabilities = topicCapabilities(topic, courseQuestions, courseMaterials);
      const activity = bestActivity('flashcards', capabilities);
      if (!activity || activity === 'read' || activity === 'tutor') continue;
      out.push({
        courseId: course.id,
        topicIds: [topic.id],
        title: `Review ${topic.title}`,
        activity,
        minutes: Math.min(sessionMinutes, 30),
        reason: `Last worked ${review.daysSince} days ago. A topic is flagged for review after three days untouched.${substitutionNote(
          'flashcards',
          activity,
        )}`,
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
          cutoff: preparationCutoff(soon),
          cutoffTitle: soon.title,
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
  /**
   * Minutes past midnight to treat as "now" on `today`. Defaults to the real
   * clock; passed explicitly only so the behaviour can be exercised.
   */
  nowMinutes?: number;
}

/** Minutes from midnight right now, rounded up to the next five. */
function currentMinutes(now: Date = new Date()): number {
  return Math.ceil((now.getHours() * 60 + now.getMinutes()) / 5) * 5;
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
   * The part of today that has already gone.
   *
   * A plan generated at four in the afternoon cannot allocate this morning's
   * availability, so today's slots start at the current minute (rounded up to
   * the next five, because a session starting at 16:07 is an odd thing to
   * propose). Other days are unaffected.
   */
  const nowMinutes = options.nowMinutes ?? currentMinutes();
  const elapsed: TimeRange[] = [{ date: today, start: 0, end: nowMinutes }];

  /*
   * The assessments themselves are not free time. Scheduling revision on top
   * of the quiz it is revision for is the most obviously wrong thing the
   * planner could do, and it costs one list to avoid.
   */
  const blocked: TimeRange[] = [...elapsed, ...assessmentBlocks(input.assessments)];

  /*
   * Which existing sessions stand.
   *
   * A generated session that is still untouched is *replaceable*, and that is
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
    minutesAvailable += freeSlots(availability, date, standing, blocked).reduce(
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
    if (candidate.topicIds.some((t) => alreadyCovered.has(`${candidate.activity}:${t}`))) {
      continue;
    }

    /*
     * The reasons below are deliberately distinct.
     *
     * "No time left in the week", "the deadline has passed", "this course
     * already has a session every day it could use" and "the reserve was
     * reached" are four different problems with four different fixes, and
     * collapsing them into one sentence tells the student to do the wrong
     * thing. So placement records *why* it stopped rather than reporting the
     * last thing it tried.
     */
    const decline = (reason: string) => {
      unscheduled.push({
        courseId: candidate.courseId,
        title: candidate.title,
        minutes: candidate.minutes,
        reason,
      });
    };

    /* Days this candidate could use at all: in the week, not in the past, and
       not after its deadline. */
    const cutoff = candidate.cutoff;
    const eligibleDates = plannableDates.filter(
      (d) => !cutoff || d <= cutoff.date,
    );

    if (cutoff && eligibleDates.length === 0) {
      decline(
        `${candidate.cutoffTitle ?? 'The assessment this prepares for'} ${
          cutoff.date < today ? 'has already passed' : 'starts before this week has any free day'
        }, so this could not be placed before it.`,
      );
      continue;
    }

    if (minutesPlanned >= budget) {
      decline(
        `The plan had already filled ${minutesPlanned} of the ${minutesAvailable} free minutes this week. It stops at ${Math.round(
          (options.fillRatio ?? 0.8) * 100,
        )}% of your availability rather than booking every slot, so the week keeps some slack.`,
      );
      continue;
    }

    let slotted = false;
    /* Which obstacle was hit most often, for an honest reason. */
    let hitDayCap = false;
    let hitCutoffTime = false;

    for (const date of eligibleDates) {
      const dayKey = `${candidate.courseId}:${date}`;
      if ((perCoursePerDay.get(dayKey) ?? 0) >= 1) {
        hitDayCap = true;
        continue;
      }

      /* On the cutoff's own day, the work must also *end* before the deadline
         minute, not merely start on the right date. */
      const latestEnd =
        cutoff && date === cutoff.date ? cutoff.minutes : Number.POSITIVE_INFINITY;

      const slot = freeSlots(availability, date, busy(), blocked).find(
        (s) =>
          s.endMinutes - s.startMinutes >= candidate.minutes &&
          s.startMinutes + candidate.minutes <= latestEnd,
      );
      if (!slot) {
        if (
          latestEnd !== Number.POSITIVE_INFINITY &&
          freeSlots(availability, date, busy(), blocked).some(
            (s) => s.endMinutes - s.startMinutes >= candidate.minutes,
          )
        ) {
          hitCutoffTime = true;
        }
        continue;
      }

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

    if (slotted) continue;

    if (minutesAvailable === 0) {
      decline('No study availability is set for the remaining days of this week.');
    } else if (hitCutoffTime) {
      decline(
        `Every free block before ${candidate.cutoffTitle ?? 'the assessment'} starts is too late in the day to finish ${candidate.minutes} minutes beforehand.`,
      );
    } else if (cutoff) {
      decline(
        `No free block of ${candidate.minutes} minutes remains before ${
          candidate.cutoffTitle ?? 'the assessment'
        }${hitDayCap ? ', and this course already has a session on every day that would still count' : ''}.`,
      );
    } else if (hitDayCap) {
      decline(
        `This course already has a session on every day of the week that has room. The plan keeps to one session per course per day so that study is spread out.`,
      );
    } else {
      decline(`No free block of ${candidate.minutes} minutes remains in this week.`);
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
    unscheduled,
    minutesPlanned,
    minutesAvailable,
    notes,
  };
}

/**
 * What a generated session opens.
 *
 * Every generated session that claims to be actionable gets a link. A
 * rehearsal used to get none, which left the most urgent entry in a plan as
 * the only one with nothing to click. It now opens the course's exam area with
 * the assessment named, so the student lands where the rehearsal is chosen
 * rather than having to find their way there.
 *
 * Reading and setup sessions deliberately have no link: a reading session
 * names a topic rather than one specific material, and setup is a prompt to go
 * and add content. Both are completed by hand, which is what the planner's
 * manual completion is for.
 */
function linkFor(candidate: Candidate): PlannedSession['link'] {
  const topicId = candidate.topicIds[0];
  switch (candidate.activity) {
    case 'tutor':
      return topicId ? { kind: 'tutor', topicId } : undefined;
    case 'flashcards':
      return { kind: 'practice-new', topicIds: candidate.topicIds, activity: 'flashcards' };
    case 'practice':
      return { kind: 'practice-new', topicIds: candidate.topicIds, activity: 'quiz' };
    case 'read':
      return candidate.materialId
        ? { kind: 'material', materialId: candidate.materialId }
        : undefined;
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

/* ── Conflicts, shared by automatic and manual scheduling ─────────────── */

/**
 * What is wrong with putting a session at a particular time.
 *
 * ── Why one function serves both paths ────────────────────────────────────
 *
 * Automatic planning and manual rescheduling used to compute "is this slot
 * free" in two different places, which is how a plan can be correct while the
 * dialog beside it disagrees. They now ask the same question here. The
 * difference between them is what they *do* with the answer: automatic
 * planning refuses the slot, whereas a student who wants to double-book their
 * Tuesday is allowed to, having been told.
 */
export interface SessionConflict {
  kind: 'session' | 'assessment' | 'outside-availability' | 'past';
  message: string;
}

export function sessionConflicts(
  candidate: {
    id?: string;
    date: string;
    startMinutes: number;
    durationMinutes: number;
  },
  context: {
    sessions: PlannedSession[];
    assessments: PlannedAssessment[];
    availability: Availability;
    today: string;
    nowMinutes?: number;
  },
): SessionConflict[] {
  const out: SessionConflict[] = [];
  const start = candidate.startMinutes;
  const end = start + candidate.durationMinutes;
  const overlaps = (aStart: number, aEnd: number) => aStart < end && aEnd > start;

  for (const other of context.sessions) {
    if (other.id === candidate.id) continue;
    if (other.date !== candidate.date) continue;
    if (other.status === 'skipped') continue;
    if (!overlaps(other.startMinutes, other.startMinutes + other.durationMinutes)) {
      continue;
    }
    out.push({
      kind: 'session',
      message: `Overlaps “${other.title}” at ${formatMinutes(other.startMinutes)}.`,
    });
  }

  for (const block of assessmentBlocks(context.assessments)) {
    if (block.date !== candidate.date) continue;
    if (!overlaps(block.start, block.end)) continue;
    const assessment = context.assessments.find(
      (a) => a.date === block.date && a.time && minutesFromClock(a.time) === block.start,
    );
    out.push({
      kind: 'assessment',
      message: `Runs over ${assessment ? `“${assessment.title}”` : 'an assessment'}, which is on at that time.`,
    });
  }

  const windows = windowsForDate(context.availability, candidate.date);
  const inside = windows.some((w) => start >= w.startMinutes && end <= w.endMinutes);
  if (!inside) {
    out.push({
      kind: 'outside-availability',
      message:
        windows.length === 0
          ? 'You have no study availability set for that day.'
          : 'Falls outside the study time you set for that day.',
    });
  }

  const nowMinutes = context.nowMinutes ?? currentMinutes();
  if (
    candidate.date < context.today ||
    (candidate.date === context.today && end <= nowMinutes)
  ) {
    out.push({ kind: 'past', message: 'That time has already passed.' });
  }

  return out;
}

/**
 * Whether a proposal still describes the world it was generated against.
 *
 * A proposal is a plan for a week as it stood a moment ago. If the student
 * added a commitment, moved an assessment or changed their availability in
 * another tab before pressing Apply, applying it would write sessions over the
 * thing they just added. So Apply re-checks, and says what changed rather than
 * silently winning.
 */
export function proposalIsStale(
  proposal: PlanProposal,
  context: {
    sessions: PlannedSession[];
    assessments: PlannedAssessment[];
    availability: Availability;
    today: string;
    nowMinutes?: number;
  },
): SessionConflict[] {
  const out: SessionConflict[] = [];
  const seen = new Set<string>();
  for (const session of proposal.sessions) {
    for (const conflict of sessionConflicts(session, context)) {
      const key = `${conflict.kind}:${conflict.message}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(conflict);
    }
  }
  return out;
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
