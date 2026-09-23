import type {
  ActivityEvent,
  Suggestion,
  Attempt,
  CheckIn,
  EvidenceLevel,
  PlannedAssessment,
  RecurringMistake,
  ReviewDue,
  StreakSummary,
  Topic,
  TopicEvidence,
  TutorSession,
} from './types.ts';
import { localISO } from './planner.ts';

/**
 * Everything derived from the attempt log.
 *
 * ── The rule this file exists to enforce ──────────────────────────────────
 *
 * Nothing here is stored. Evidence, reviews, recurring mistakes and the day's
 * plan are all *computed* from attempts every time they are read. That costs a
 * few milliseconds and buys the property the brief actually asks for: a result
 * recorded anywhere immediately changes the overview, the review queue and the
 * next suggestion, with no possibility of a cached summary drifting away from
 * the attempts it claims to summarise.
 *
 * ── On not claiming mastery ───────────────────────────────────────────────
 *
 * The brief is explicit that sparse activity must not be dressed up as precise
 * knowledge. So evidence is a **described level**, never a percentage, and the
 * counts it is derived from are exposed so a student can open them and see
 * exactly which attempts produced the claim. Two correct answers is "solved
 * once, unaided" — it is not 40% mastery, and the UI has no way to say that it
 * is.
 */

/* ── Evidence ─────────────────────────────────────────────────────────── */

export const EVIDENCE_LABEL: Record<EvidenceLevel, string> = {
  'not-checked': 'Not checked yet',
  practising: 'Practising',
  'independent-once': 'Answered unaided',
  retained: 'Held up on review',
};

export const EVIDENCE_DETAIL: Record<EvidenceLevel, string> = {
  'not-checked': 'Nothing has been asked about this topic yet.',
  practising:
    'You have worked on this, with the tutor or with hints available, but have not yet answered correctly under exam conditions.',
  'independent-once':
    'You answered correctly under exam conditions, with no hints. One occasion — a later question will show whether it held.',
  retained:
    'You answered a different question on this topic correctly, unaided, on a later day. That is the strongest evidence this prototype records.',
};

/** Which meter tone each level uses. Keyed to the ramp in globals.css. */
export const EVIDENCE_TONE: Record<
  EvidenceLevel,
  'neutral' | 'practicing' | 'independent' | 'retained'
> = {
  'not-checked': 'neutral',
  practising: 'practicing',
  'independent-once': 'independent',
  retained: 'retained',
};

const DAY_MS = 1000 * 60 * 60 * 24;

function daysBetween(a: string, b: string): number {
  return Math.floor((new Date(b).getTime() - new Date(a).getTime()) / DAY_MS);
}

/**
 * Derives evidence for one topic from the whole attempt log.
 *
 * The ladder, and the reason for each rung:
 *
 *   not-checked       no attempt has touched this topic
 *   practising        worked on, but every success was assisted or self-rated
 *   independent-once  at least one correct answer in exam mode with no hint
 *   retained          two such, on different days, on different questions
 *
 * The "different questions" requirement on `retained` is the one that does real
 * work. Answering the same question correctly twice demonstrates that you
 * remember that question. Answering two different ones demonstrates something
 * about the topic, which is the claim the level actually makes.
 */
export function deriveEvidence(topicId: string, attempts: Attempt[]): TopicEvidence {
  const relevant = attempts
    .filter((a) => a.completedAt && a.questions.some((q) => q.topicId === topicId))
    .sort((a, b) => (a.completedAt! < b.completedAt! ? 1 : -1));

  let tutored = 0;
  let practised = 0;
  let selfRated = 0;
  let independent = 0;
  let independentCorrect = 0;

  /** Correct, unaided, exam-mode answers: question id and the day it happened. */
  const unaidedWins: { questionId: string; day: string }[] = [];

  for (const attempt of relevant) {
    for (const qa of attempt.questions) {
      if (qa.topicId !== topicId) continue;
      switch (attempt.mode) {
        case 'tutored':
          tutored += 1;
          break;
        case 'self-rated':
          selfRated += 1;
          break;
        case 'practice':
          practised += 1;
          break;
        case 'exam':
          independent += 1;
          /*
           * An attempt whose assistance history is not known cannot promote a
           * topic to independent evidence. Runs from before assistance was
           * tracked reliably carry `assistanceRecord: 'unknown'`, and treating
           * their `usedHint: false` as trustworthy would quietly convert
           * assisted work into the strongest claim the app makes.
           */
          if (
            qa.outcome === 'correct' &&
            !qa.usedHint &&
            attempt.assistanceRecord !== 'unknown'
          ) {
            independentCorrect += 1;
            unaidedWins.push({
              questionId: qa.questionId,
              day: (attempt.completedAt ?? attempt.startedAt).slice(0, 10),
            });
          }
          break;
      }
    }
  }

  let level: EvidenceLevel = 'not-checked';
  if (relevant.length > 0) level = 'practising';
  if (unaidedWins.length >= 1) level = 'independent-once';

  const distinctQuestions = new Set(unaidedWins.map((w) => w.questionId));
  const distinctDays = new Set(unaidedWins.map((w) => w.day));
  if (distinctQuestions.size >= 2 && distinctDays.size >= 2) level = 'retained';

  const last = relevant[0];
  return {
    courseId: last?.courseId ?? '',
    topicId,
    level,
    tutored,
    practised,
    selfRated,
    independent,
    independentCorrect,
    attemptIds: relevant.map((a) => a.id),
    ...(last ? { lastWorkedAt: last.completedAt ?? last.startedAt } : {}),
  };
}

export function deriveAllEvidence(
  topics: Topic[],
  attempts: Attempt[],
): Map<string, TopicEvidence> {
  return new Map(topics.map((t) => [t.id, deriveEvidence(t.id, attempts)]));
}

/* ── Reviews ──────────────────────────────────────────────────────────── */

/**
 * Which topics have gone long enough without work to be worth revisiting.
 *
 * A very simple spacing rule — worked on, then untouched for three days — and
 * deliberately so. A real scheduler would model per-item intervals; this
 * prototype has no data to fit one to, and a fabricated SM-2 curve over six
 * seeded attempts would be a precision claim it cannot support. Three days is
 * a stated heuristic the UI can explain in one sentence, which is honest.
 */
export function dueReviews(
  topics: Topic[],
  attempts: Attempt[],
  now: Date = new Date(),
): ReviewDue[] {
  const today = now.toISOString();
  const due: ReviewDue[] = [];

  for (const topic of topics) {
    const evidence = deriveEvidence(topic.id, attempts);
    if (evidence.level === 'not-checked' || !evidence.lastWorkedAt) continue;
    const days = daysBetween(evidence.lastWorkedAt, today);
    if (days >= 3) {
      due.push({
        courseId: topic.courseId,
        topicId: topic.id,
        daysSince: days,
        ...(evidence.attemptIds[0] ? { lastAttemptId: evidence.attemptIds[0] } : {}),
      });
    }
  }

  return due.sort((a, b) => b.daysSince - a.daysSince);
}

/* ── Recurring mistakes ───────────────────────────────────────────────── */

/**
 * Questions answered wrong more than once.
 *
 * Threshold of two, not one. A single wrong answer is a wrong answer; it is the
 * second that makes it a pattern, and calling one mistake "recurring" would
 * overstate what the log shows.
 */
export function recurringMistakes(
  attempts: Attempt[],
  promptFor: (questionId: string) => string | undefined,
): RecurringMistake[] {
  const byQuestion = new Map<
    string,
    {
      courseId: string;
      topicId: string;
      times: number;
      lastAttemptId: string;
      lastAt: string;
    }
  >();

  const ordered = [...attempts]
    .filter((a) => a.completedAt)
    .sort((a, b) => (a.completedAt! < b.completedAt! ? -1 : 1));

  for (const attempt of ordered) {
    for (const qa of attempt.questions) {
      if (qa.outcome === 'correct') continue;
      if (qa.outcome === 'skipped') continue;
      const existing = byQuestion.get(qa.questionId);
      byQuestion.set(qa.questionId, {
        courseId: attempt.courseId,
        topicId: qa.topicId,
        times: (existing?.times ?? 0) + 1,
        lastAttemptId: attempt.id,
        lastAt: attempt.completedAt!,
      });
    }
  }

  return [...byQuestion.entries()]
    .filter(([, v]) => v.times >= 2)
    .map(([questionId, v]) => ({
      courseId: v.courseId,
      questionId,
      topicId: v.topicId,
      prompt: promptFor(questionId) ?? 'This question',
      times: v.times,
      lastAttemptId: v.lastAttemptId,
      lastAt: v.lastAt,
    }))
    .sort((a, b) => b.times - a.times || (a.lastAt < b.lastAt ? 1 : -1));
}

/* ── Assessments ──────────────────────────────────────────────────────── */

/** Whole days from today until an assessment. Negative once it has passed. */
export function daysUntil(date: string, now: Date = new Date()): number {
  const today = localISO(now);
  return Math.round(
    (new Date(`${date}T12:00:00`).getTime() - new Date(`${today}T12:00:00`).getTime()) /
      DAY_MS,
  );
}

/**
 * The next assessment that has not happened yet.
 *
 * Past assessments stay in the list and stay inspectable — the brief asks for
 * that — but they must not become the default deadline, so anything before
 * today is filtered here rather than merely sorted below.
 */
export function nextAssessment(
  assessments: PlannedAssessment[],
  now: Date = new Date(),
): PlannedAssessment | undefined {
  const today = localISO(now);
  return [...assessments]
    .filter((a) => a.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date))[0];
}

export function upcomingAssessments(
  assessments: PlannedAssessment[],
  now: Date = new Date(),
): PlannedAssessment[] {
  const today = localISO(now);
  return [...assessments]
    .filter((a) => a.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function pastAssessments(
  assessments: PlannedAssessment[],
  now: Date = new Date(),
): PlannedAssessment[] {
  const today = localISO(now);
  return [...assessments]
    .filter((a) => a.date < today)
    .sort((a, b) => b.date.localeCompare(a.date));
}

/* ── Activity and streaks ─────────────────────────────────────────────── */

/**
 * What counts as study, for the streak and for history.
 *
 * ── Why this is a function and not a filter written at each call site ─────
 *
 * The brief requires that page visits, generated sets and repeated submissions
 * of the same completion do not inflate a streak. All three are avoided by
 * counting *completed attempts* and *tutor sessions with real exchanges*, and
 * nothing else — but only if every caller agrees on that. Putting the rule here
 * means the streak, the history list and the "did I study today" check cannot
 * drift apart.
 *
 * A tutor session needs at least two student turns to count. One is the
 * greeting; a session that was opened and abandoned is not study, and the
 * scripted tutor opens with a message either way.
 */
export function activityEvents(
  attempts: Attempt[],
  tutorSessions: TutorSession[],
): ActivityEvent[] {
  const events: ActivityEvent[] = [];

  for (const attempt of attempts) {
    if (!attempt.completedAt) continue;
    events.push({
      id: attempt.id,
      courseId: attempt.courseId,
      at: attempt.completedAt,
      kind:
        attempt.kind === 'exam' ? 'exam' : attempt.kind === 'tutor' ? 'tutor' : 'practice',
      title: attempt.title,
      topicIds: attempt.topicIds,
      marksAwarded: attempt.marksAwarded,
      marksAvailable: attempt.marksAvailable,
      mode: attempt.mode,
      to:
        attempt.kind === 'exam'
          ? `/course/${attempt.courseId}/exams/results/${attempt.id}`
          : `/course/${attempt.courseId}/practice/results/${attempt.id}`,
      minutes: durationMinutes(attempt.startedAt, attempt.completedAt),
    });
  }

  for (const session of tutorSessions) {
    const studentTurns = session.messages.filter((m) => m.role === 'student').length;
    if (studentTurns < 2) continue;
    events.push({
      id: session.id,
      courseId: session.courseId,
      at: session.endedAt ?? session.updatedAt,
      kind: 'tutor',
      title: 'Tutor session',
      topicIds: [session.topicId],
      to: `/course/${session.courseId}/tutor/${session.id}`,
      minutes: durationMinutes(session.startedAt, session.endedAt ?? session.updatedAt),
    });
  }

  return events.sort((a, b) => (a.at < b.at ? 1 : -1));
}

/**
 * Minutes between two timestamps, clamped to something a person could do.
 *
 * A session left open overnight would otherwise report fourteen hours of
 * study. Anything over three hours is treated as an abandoned tab rather than
 * a marathon, and the cap is stated wherever totals are shown.
 */
function durationMinutes(from: string, to: string): number {
  const ms = new Date(to).getTime() - new Date(from).getTime();
  if (!Number.isFinite(ms) || ms <= 0) return 0;
  return Math.min(180, Math.round(ms / 60000));
}

/**
 * The streak, over local calendar days.
 *
 * ── Two decisions worth stating ───────────────────────────────────────────
 *
 * Days are *local* days, via `localISO`, because a student studying at 11pm
 * expects that to count for the day they think it is rather than for tomorrow
 * in UTC.
 *
 * A streak survives today being empty. It breaks only once a whole day has
 * passed with nothing in it, so opening the app in the morning does not show a
 * streak of zero to someone who studied last night and has not started yet.
 */
export function streak(events: ActivityEvent[], now: Date = new Date()): StreakSummary {
  const days = [...new Set(events.map((e) => localISO(e.at)))].sort((a, b) =>
    a < b ? 1 : -1,
  );

  const today = localISO(now);
  const yesterday = localISO(new Date(now.getTime() - DAY_MS));

  const gapBetween = (later: string, earlier: string) =>
    Math.round(
      (new Date(`${later}T12:00:00`).getTime() -
        new Date(`${earlier}T12:00:00`).getTime()) /
        DAY_MS,
    );

  let current = 0;
  const first = days[0];
  if (first === today || first === yesterday) {
    current = 1;
    for (let i = 1; i < days.length; i += 1) {
      if (gapBetween(days[i - 1]!, days[i]!) === 1) current += 1;
      else break;
    }
  }

  let longest = 0;
  let run = 0;
  for (let i = 0; i < days.length; i += 1) {
    run = i === 0 || gapBetween(days[i - 1]!, days[i]!) !== 1 ? 1 : run + 1;
    longest = Math.max(longest, run);
  }

  return { current, longest, activeDays: days, todayCounted: days[0] === today };
}

/* ── The plan ─────────────────────────────────────────────────────────── */

/** Minutes available today, after any check-in adjustment. */
export function minutesToday(
  plannedMinutes: number,
  checkIns: CheckIn[],
  now: Date = new Date(),
): number {
  const today = localISO(now);
  const todays = checkIns.filter((c) => localISO(c.at) === today);
  const latest = todays[todays.length - 1];
  if (latest?.minutesToday !== undefined) return latest.minutesToday;
  return plannedMinutes;
}

/** The most recent check-in from today, if any. */
export function todaysCheckIn(
  checkIns: CheckIn[],
  now: Date = new Date(),
): CheckIn | undefined {
  const today = localISO(now);
  return [...checkIns].reverse().find((c) => localISO(c.at) === today);
}

/** The subset of a planner session this module needs. */
export interface PlannedSessionLike {
  id: string;
  courseId: string;
  title: string;
  activity: string;
  durationMinutes: number;
  topicIds: string[];
  status: string;
  reason?: string;
}

export interface PlanInput {
  courses: { id: string; name: string; archived?: boolean }[];
  topics: Topic[];
  attempts: Attempt[];
  assessments: PlannedAssessment[];
  checkIns: CheckIn[];
  /** Today's planner sessions, which are the first thing suggested. */
  todaysSessions: PlannedSessionLike[];
  /** Topic ids with at least one authored question, so we never suggest a dead end. */
  topicsWithQuestions: Set<string>;
  /** Set when a tutor session or exam is part-finished and can be resumed. */
  resumable?: { courseId: string; title: string; to: string; kind: Suggestion['kind'] };
  now?: Date;
}

/**
 * Today's suggested work, across every course, with a stated reason for each.
 *
 * ── How this relates to the planner ───────────────────────────────────────
 *
 * The planner owns the schedule; this owns "what should I do right now". They
 * are not two schedulers: **anything already planned for today is what this
 * suggests first**, and the derived suggestions only fill in behind it. That is
 * the brief's requirement that a check-in connect to the planner rather than
 * spawning a competing plan, and it is why a student who has planned their week
 * sees their own plan on the overview rather than a second opinion about it.
 *
 * ── How the ordering is decided ───────────────────────────────────────────
 *
 * Weights, summed from a few local rules, then sorted. In descending force:
 * unfinished work, then today's planned sessions, then the check-in, then
 * repeated mistakes, then reviews that have come due, then topics with weak
 * evidence weighted by assessment proximity and the student's own priority.
 */
export function buildPlan(input: PlanInput): Suggestion[] {
  const {
    courses,
    topics,
    attempts,
    assessments,
    checkIns,
    topicsWithQuestions,
    todaysSessions,
  } = input;
  const now = input.now ?? new Date();
  const suggestions: Suggestion[] = [];
  const checkIn = todaysCheckIn(checkIns, now);
  const active = courses.filter((c) => !c.archived);
  const courseName = new Map(active.map((c) => [c.id, c.name]));

  /* 1 — Resume. Nothing outranks work already started. */
  if (input.resumable) {
    suggestions.push({
      id: 'sug-resume',
      courseId: input.resumable.courseId,
      title: input.resumable.title,
      reason:
        'You left this part-finished. Picking it up is cheaper than starting again.',
      minutes: 20,
      to: input.resumable.to,
      kind: input.resumable.kind,
      weight: 100,
    });
  }

  /* 2 — What the student planned for today. Their decision beats ours. */
  for (const session of todaysSessions) {
    if (session.status !== 'planned') continue;
    suggestions.push({
      id: `sug-session-${session.id}`,
      courseId: session.courseId,
      title: session.title,
      reason:
        session.reason ??
        `You planned this for today${
          courseName.has(session.courseId)
            ? ` in ${courseName.get(session.courseId)}`
            : ''
        }.`,
      minutes: session.durationMinutes,
      to: `/planner?session=${session.id}`,
      kind:
        session.activity === 'tutor'
          ? 'tutor'
          : session.activity === 'exam'
            ? 'exam'
            : session.activity === 'read'
              ? 'materials'
              : session.activity === 'flashcards'
                ? 'review'
                : 'practice',
      weight: 90,
      sessionId: session.id,
      ...(session.topicIds[0] ? { topicId: session.topicIds[0] } : {}),
    });
  }

  /* 3 — First-run guidance, when there is genuinely nothing to go on. */
  if (attempts.length === 0 && active.length > 0) {
    const course = active[0]!;
    const first = topics.find(
      (t) => t.courseId === course.id && topicsWithQuestions.has(t.id),
    );
    if (first) {
      suggestions.push({
        id: 'sug-first-session',
        courseId: course.id,
        title: `Start with ${first.title}`,
        reason:
          'Nothing recorded yet, so this is a starting point rather than a recommendation. After a session or two the plan will have something to work from.',
        minutes: 20,
        to: `/course/${course.id}/tutor/new?topic=${first.id}`,
        kind: 'tutor',
        weight: 80,
      });
    }
  }

  /* 4 — The check-in, which overrides the ordinary ranking. */
  if (checkIn?.mood === 'struggling' && checkIn.topicId) {
    const topic = topics.find((t) => t.id === checkIn.topicId);
    if (topic) {
      suggestions.push({
        id: `sug-struggle-${topic.id}`,
        courseId: topic.courseId,
        title: `Work through ${topic.title} with the tutor`,
        reason:
          'You said this one is not landing. More testing would not help — an explanation and a worked example will.',
        minutes: 25,
        to: `/course/${topic.courseId}/tutor/new?topic=${topic.id}`,
        topicId: topic.id,
        kind: 'tutor',
        weight: 95,
      });
    }
  }

  /* 5 — Recurring mistakes. */
  for (const mistake of recurringMistakes(attempts, () => undefined).slice(0, 2)) {
    const topic = topics.find((t) => t.id === mistake.topicId);
    if (!topic) continue;
    suggestions.push({
      id: `sug-mistake-${mistake.questionId}`,
      courseId: topic.courseId,
      title: `Fix a repeated mistake in ${topic.title}`,
      reason: `You have got this wrong ${mistake.times} times. That is the clearest signal in your history, so it goes first.`,
      minutes: 15,
      to: `/course/${topic.courseId}/tutor/new?topic=${topic.id}&question=${mistake.questionId}&attempt=${mistake.lastAttemptId}`,
      topicId: topic.id,
      kind: 'tutor',
      weight: 85,
    });
  }

  /* 6 — Reviews that have come due. */
  const activeTopics = topics.filter((t) => active.some((c) => c.id === t.courseId));
  for (const review of dueReviews(activeTopics, attempts, now).slice(0, 2)) {
    const topic = activeTopics.find((t) => t.id === review.topicId);
    if (!topic || !topicsWithQuestions.has(topic.id)) continue;
    if (suggestions.some((s) => s.topicId === topic.id)) continue;
    suggestions.push({
      id: `sug-review-${topic.id}`,
      courseId: topic.courseId,
      title: `Review ${topic.title}`,
      reason: `Last worked ${review.daysSince} days ago. This prototype flags a topic for review after three days untouched.`,
      minutes: 10,
      to: `/course/${topic.courseId}/practice/new?topic=${topic.id}&activity=flashcards`,
      topicId: topic.id,
      kind: 'review',
      weight: 60 + Math.min(review.daysSince, 10),
    });
  }

  /* 7 — Weak topics, weighted by assessment proximity and stated priority. */
  const priorityWeight: Record<Topic['priority'], number> = {
    high: 14,
    normal: 6,
    low: 0,
  };
  const levelWeight: Record<EvidenceLevel, number> = {
    'not-checked': 30,
    practising: 22,
    'independent-once': 8,
    retained: 0,
  };

  for (const topic of activeTopics) {
    if (!topicsWithQuestions.has(topic.id)) continue;
    const evidence = deriveEvidence(topic.id, attempts);
    if (evidence.level === 'retained') continue;
    if (suggestions.some((s) => s.topicId === topic.id)) continue;

    const covering = upcomingAssessments(
      assessments.filter((a) => a.courseId === topic.courseId),
      now,
    ).find((a) => a.topicIds.length === 0 || a.topicIds.includes(topic.id));
    const daysAway = covering ? daysUntil(covering.date, now) : 999;
    const proximity = daysAway <= 7 ? 20 : daysAway <= 14 ? 12 : daysAway <= 28 ? 6 : 0;

    const weight =
      levelWeight[evidence.level] + priorityWeight[topic.priority] + proximity;

    const assessmentClause = covering
      ? ` ${covering.title} is in ${daysAway} day${daysAway === 1 ? '' : 's'} and covers it.`
      : '';

    const reason =
      evidence.level === 'not-checked'
        ? `Nothing recorded on this topic yet${
            topic.priority === 'high' ? ', and you have marked it high priority' : ''
          }.${assessmentClause}`
        : `Evidence here is “${EVIDENCE_LABEL[evidence.level].toLowerCase()}”. ${
            evidence.level === 'practising'
              ? 'You have worked on it but not yet answered unaided.'
              : 'One unaided answer so far; a second on a different question would confirm it.'
          }${assessmentClause}`;

    suggestions.push({
      id: `sug-topic-${topic.id}`,
      courseId: topic.courseId,
      title:
        evidence.level === 'not-checked'
          ? `Learn ${topic.title}`
          : `Practise ${topic.title}`,
      reason,
      minutes: evidence.level === 'not-checked' ? 25 : 15,
      to:
        evidence.level === 'not-checked'
          ? `/course/${topic.courseId}/tutor/new?topic=${topic.id}`
          : `/course/${topic.courseId}/practice/new?topic=${topic.id}`,
      topicId: topic.id,
      kind: evidence.level === 'not-checked' ? 'tutor' : 'practice',
      weight,
    });
  }

  /* 8 — A rehearsal, when an assessment is close enough for pace to matter. */
  const soon = nextAssessment(
    assessments.filter((a) => active.some((c) => c.id === a.courseId)),
    now,
  );
  if (soon && attempts.length > 0) {
    const daysAway = daysUntil(soon.date, now);
    const lastExam = [...attempts]
      .filter((a) => a.kind === 'exam' && a.courseId === soon.courseId)
      .sort((a, b) => ((a.completedAt ?? '') < (b.completedAt ?? '') ? 1 : -1))[0];
    const daysSinceExam = lastExam?.completedAt
      ? daysBetween(lastExam.completedAt, now.toISOString())
      : 99;
    if (daysAway <= 21 && daysSinceExam >= 2) {
      suggestions.push({
        id: 'sug-exam',
        courseId: soon.courseId,
        title: `Sit a timed rehearsal for ${soon.title}`,
        reason:
          daysAway <= 7
            ? `${soon.title} is ${
                daysAway === 0 ? 'today' : `${daysAway} day${daysAway === 1 ? '' : 's'} away`
              }. Timed practice is now worth more than more reading.`
            : `${daysAway} days to ${soon.title}, and your last timed attempt was ${daysSinceExam} days ago. Writing under time is a separate skill from knowing the material.`,
        minutes: 25,
        to: `/course/${soon.courseId}/exams`,
        kind: 'exam',
        weight: daysAway <= 7 ? 70 : 40,
      });
    }
  }

  /* 9 — Reduced time changes what is offered, not just the estimate. */
  if (checkIn?.mood === 'less-time') {
    const available = minutesToday(30, checkIns, now);
    const course = checkIn.courseId ?? active[0]?.id;
    if (course) {
      suggestions.unshift({
        id: 'sug-short',
        courseId: course,
        title: 'A short flashcard round',
        reason: `You said you have about ${available} minutes today. This fits, and keeps the streak of contact with the material.`,
        minutes: Math.min(10, available),
        to: `/course/${course}/practice/new?activity=flashcards`,
        kind: 'review',
        weight: 96,
      });
    }
  }

  /*
   * Near-identical suggestions are collapsed.
   *
   * Two rules can independently reach the same topic — a due review and a weak
   * evidence level, say — and showing both makes the plan look padded. The
   * higher-weighted one survives, since it carries the more urgent reason.
   */
  const seen = new Set<string>();
  return suggestions
    .sort((a, b) => b.weight - a.weight)
    .filter((s) => {
      const key = s.sessionId
        ? `session:${s.sessionId}`
        : `${s.kind}:${s.topicId ?? s.to}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 6);
}

/** A one-line description of how the plan was put together, for the UI. */
export const PLAN_EXPLANATION =
  'Suggestions are ordered by simple local rules: unfinished work first, then whatever you planned for today, then repeated mistakes, then what you said at check-in, then reviews that have come due, then topics with the weakest evidence weighted by how close the assessment covering them is.';
