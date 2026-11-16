import type {
  Suggestion,
  Attempt,
  CheckIn,
  EvidenceLevel,
  StudyMaterial,
  DatedAssessment,
  PlannedAssessment,
  Question,
  RecurringMistake,
  ReviewDue,
  StudyTopic,
  TopicEvidence,
  TopicMastery,
} from './types';
import type { MasteryLevel } from './mastery';
import { gradeWeight, levelOf, localISO, MASTERY_REASON } from './planner';
import { isDated } from './types';
import {
  NO_CONTENT_REASON,
  bestActivity,
  substitutionNote,
  topicCapabilities,
} from './capabilities';

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
export function deriveEvidence(topicId: string, attempts: Attempt[], timezone?: string): TopicEvidence {
  const relevant = attempts
    /* An answer awaiting feedback is neither evidence for nor against a topic
       until it is marked, so it is left out entirely. */
    .filter(
      (a) =>
        a.completedAt &&
        a.questions.some((q) => q.topicId === topicId),
    )
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
      if (qa.format === 'flashcard' || qa.format === 'self-check') { selfRated += 1; continue; }
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
              day: localISO(attempt.completedAt ?? attempt.startedAt, timezone),
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
  topics: StudyTopic[],
  attempts: Attempt[],
  timezone?: string,
): Map<string, TopicEvidence> {
  return new Map(topics.map((t) => [t.id, deriveEvidence(t.id, attempts, timezone)]));
}

/* ── Reviews ──────────────────────────────────────────────────────────── */

/** Why a review was suggested. Topics come due under the mastery ladder in `mastery.ts`. */
export function reviewReason(daysSince: number): string {
  const when = daysSince === 0 ? 'today' : daysSince === 1 ? '1 day ago' : `${daysSince} days ago`;
  return `Last worked ${when}. Reviews come further apart each day you answer a topic right without a hint, and sooner after a miss.`;
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
      topicId?: string;
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
export function daysUntil(date: string, now: Date = new Date(), timezone?: string): number {
  const today = localISO(now, timezone);
  return Math.round(
    (new Date(`${date}T12:00:00Z`).getTime() - new Date(`${today}T12:00:00Z`).getTime()) /
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
  now: Date = new Date(), timezone?: string,
): DatedAssessment | undefined {
  const today = localISO(now, timezone);
  return assessments.filter(isDated)
    .filter((a) => a.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date))[0];
}

export function upcomingAssessments(
  assessments: PlannedAssessment[],
  now: Date = new Date(), timezone?: string,
): DatedAssessment[] {
  const today = localISO(now, timezone);
  return assessments.filter(isDated)
    .filter((a) => a.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date));
}

/* ── The plan ─────────────────────────────────────────────────────────── */

/** Minutes available today, after any check-in adjustment. */
export function minutesToday(
  plannedMinutes: number,
  checkIns: CheckIn[],
  now: Date = new Date(), timezone?: string,
): number {
  const today = localISO(now, timezone);
  const todays = checkIns.filter((c) => localISO(c.at, timezone) === today);
  const latest = todays[todays.length - 1];
  if (latest?.minutesToday !== undefined) return latest.minutesToday;
  return plannedMinutes;
}

/** The most recent check-in from today, if any. */
export function todaysCheckIn(
  checkIns: CheckIn[],
  now: Date = new Date(), timezone?: string,
): CheckIn | undefined {
  const today = localISO(now, timezone);
  return [...checkIns].reverse().find((c) => localISO(c.at, timezone) === today);
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
  timezone?: string;
  courses: { id: string; name: string; archived?: boolean }[];
  topics: StudyTopic[];
  attempts: Attempt[];
  assessments: PlannedAssessment[];
  checkIns: CheckIn[];
  /** Today's planner sessions, which are the first thing suggested. */
  todaysSessions: PlannedSessionLike[];
  /**
   * The question pool and materials, so a suggestion can check that the
   * activity it names is actually possible for that topic before offering it.
   * Without them every topic reads as having no content, which is the safe
   * direction: the plan offers setup rather than a broken link.
   */
  questions?: Question[];
  materials?: StudyMaterial[];
  /** Topics due for review under the mastery ladder, worked out from marked answers on the server. */
  due: ReviewDue[];
  /** Each topic's mastery, from marked answers. It decides which topics read as weak. */
  mastery?: TopicMastery[];
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
 * mastery weighted by assessment proximity and the assessment's share of the
 * grade.
 */
export function buildPlan(input: PlanInput): Suggestion[] {
  const {
    courses,
    topics,
    attempts,
    assessments,
    checkIns,
    todaysSessions,
  } = input;
  const now = input.now ?? new Date();
  const suggestions: Suggestion[] = [];
  const checkIn = todaysCheckIn(checkIns, now, input.timezone);
  const active = courses.filter((c) => !c.archived);
  const courseName = new Map(active.map((c) => [c.id, c.name]));

  const allMaterials = input.materials ?? [];

  /** What a topic supports, scoped to its own course. */
  const capabilitiesOf = (topic: StudyTopic) =>
    topicCapabilities(topic, allMaterials.filter((m) => m.courseId === topic.courseId));

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
    /* The first thing a student is sent to has to work. A topic with questions
       but no material would open a tutor session with nothing to teach from, which
       is a poor first impression and an avoidable one. */
    const first = topics
      .filter((t) => t.courseId === course.id)
      .map((topic) => ({ topic, chosen: bestActivity('tutor', capabilitiesOf(topic)) }))
      .find((row) => row.chosen !== null);

    if (first?.chosen) {
      const { topic, chosen } = first;
      suggestions.push({
        id: 'sug-first-session',
        courseId: course.id,
        title: `Start with ${topic.title}`,
        reason:
          'Nothing recorded yet, so this is a starting point rather than a recommendation. After a session or two the plan will have something to work from.',
        minutes: 20,
        to:
          chosen === 'tutor'
            ? `/course/${course.id}/tutor/new?topic=${topic.id}`
            : chosen === 'read'
              ? `/course/${course.id}/materials`
              : `/course/${course.id}/practice/new?topic=${topic.id}`,
        kind: chosen === 'tutor' ? 'tutor' : chosen === 'read' ? 'materials' : 'practice',
        weight: 80,
      });
    }
  }

  /* 4 — The check-in, which overrides the ordinary ranking. */
  if (checkIn?.mood === 'struggling' && checkIn.topicId) {
    const topic = topics.find((t) => t.id === checkIn.topicId);
    if (topic) {
      const capabilities = capabilitiesOf(topic);
      /* An explanation is what a struggling student needs, so the tutor is the
         preference. Where there is no material to teach from the next best thing is the
         reading, which at least explains. More testing is the last resort and
         the reason says so. */
      const chosen = bestActivity('tutor', capabilities);
      if (chosen === 'tutor') {
        suggestions.push({
          id: `sug-struggle-${topic.id}`,
          courseId: topic.courseId,
          title: `Work through ${topic.title} with the tutor`,
          reason:
            'You said this one is not landing. More testing would not help: an explanation and a worked example will.',
          minutes: 25,
          to: `/course/${topic.courseId}/tutor/new?topic=${topic.id}`,
          topicId: topic.id,
          kind: 'tutor',
          weight: 95,
        });
      } else if (chosen === 'read' || capabilities.read) {
        suggestions.push({
          id: `sug-struggle-${topic.id}`,
          courseId: topic.courseId,
          title: `Re-read the material on ${topic.title}`,
          reason:
            'You said this one is not landing. The reading is the explanation available here.',
          minutes: 20,
          to: `/course/${topic.courseId}/materials`,
          topicId: topic.id,
          kind: 'materials',
          weight: 95,
        });
      } else if (chosen) {
        suggestions.push({
          id: `sug-struggle-${topic.id}`,
          courseId: topic.courseId,
          title: `Work slowly through ${topic.title}`,
          reason:
            'You said this one is not landing. There is no readable material for this topic, so this is practice with feedback rather than an explanation.',
          minutes: 20,
          to: `/course/${topic.courseId}/practice/new?topic=${topic.id}`,
          topicId: topic.id,
          kind: 'practice',
          weight: 95,
        });
      }
    }
  }

  /* 5 — Recurring mistakes. */
  for (const mistake of recurringMistakes(attempts, () => undefined).slice(0, 2)) {
    const topic = topics.find((t) => t.id === mistake.topicId);
    if (!topic) continue;
    /* Discussing the mistake is best, but only where the tutor has something
       to say. Otherwise the useful action is another go at the question. */
    const canTutor = capabilitiesOf(topic).tutor;
    suggestions.push({
      id: `sug-mistake-${mistake.questionId}`,
      courseId: topic.courseId,
      title: `Fix a repeated mistake in ${topic.title}`,
      reason: `You have got this wrong ${mistake.times} times. That is the clearest signal in your history, so it goes first.${
        canTutor
          ? ''
          : ' There is no readable material for the tutor to use on this topic, so this retries the question itself.'
      }`,
      minutes: 15,
      to: canTutor
        ? `/course/${topic.courseId}/tutor/new?topic=${topic.id}&question=${mistake.questionId}&attempt=${mistake.lastAttemptId}`
        : `/course/${topic.courseId}/practice/new?questions=${mistake.questionId}&retry=${mistake.lastAttemptId}`,
      topicId: topic.id,
      kind: canTutor ? 'tutor' : 'practice',
      weight: 85,
    });
  }

  /* 6 — Reviews that have come due. */
  const activeTopics = topics.filter((t) => active.some((c) => c.id === t.courseId));
  for (const review of input.due.filter(d => activeTopics.some(t => t.id === d.topicId)).slice(0, 2)) {
    const topic = activeTopics.find((t) => t.id === review.topicId);
    if (!topic) continue;
    if (suggestions.some((s) => s.topicId === topic.id)) continue;
    /* A flashcard round needs flashcards, not merely some question for this
       topic: the old test sent students to an empty flashcard set whenever the
       topic's only questions were essays. */
    const chosen = bestActivity('flashcards', capabilitiesOf(topic));
    if (chosen !== 'flashcards' && chosen !== 'practice') continue;
    suggestions.push({
      id: `sug-review-${topic.id}`,
      courseId: topic.courseId,
      title: `Review ${topic.title}`,
      reason: `${reviewReason(review.daysSince)}${substitutionNote(
        'flashcards',
        chosen,
      )}`,
      minutes: 10,
      to: `/course/${topic.courseId}/practice/new?topic=${topic.id}${
        chosen === 'flashcards' ? '&activity=flashcards' : ''
      }`,
      topicId: topic.id,
      kind: 'review',
      weight: 60 + Math.min(review.daysSince, 10),
    });
  }

  /* 7 — Weak topics, weighted by assessment proximity and the share of the grade. */
  /* Mastery decides what is weak: unaided practice and tutor checks count, as
     they do for reviews. Exam evidence stays a separate measure on the progress
     pages. A secure topic comes back through its review date, not from here. */
  const levelWeight: Record<MasteryLevel, number> = { shaky: 32, 'not-checked': 30, learning: 18, secure: 0 };

  for (const topic of activeTopics) {
    const level = levelOf(input.mastery ?? [], topic.id);
    if (level === 'secure') continue;
    if (suggestions.some((s) => s.topicId === topic.id)) continue;

    /* Scoped to this topic's own course, so one subject's content cannot make
       another subject's topic look workable. */
    const capabilities = capabilitiesOf(topic);
    const preferredActivity = level === 'not-checked' ? 'tutor' : 'practice';
    const chosen = bestActivity(preferredActivity, capabilities);

    const covering = upcomingAssessments(
      assessments.filter((a) => a.courseId === topic.courseId),
      now, input.timezone,
    ).find((a) => a.topicIds.length === 0 || a.topicIds.includes(topic.id));
    const daysAway = covering ? daysUntil(covering.date, now, input.timezone) : 999;
    const proximity = daysAway <= 7 ? 20 : daysAway <= 14 ? 12 : daysAway <= 28 ? 6 : 0;

    const weight =
      levelWeight[level] + gradeWeight(covering) + proximity;

    const assessmentClause = covering
      ? ` ${covering.title} is in ${daysAway} day${daysAway === 1 ? '' : 's'} and covers it.`
      : '';

    const reason = `${MASTERY_REASON[level]}${assessmentClause}${
      level === 'not-checked' && covering?.weightPercent !== undefined && covering.weightPercent >= 25 ? ` It is worth ${covering.weightPercent}% of the grade.` : ''
    }`;

    /* Nothing behind this topic at all: say so and offer the setup that would
       fix it, rather than a link into an empty activity. */
    if (!chosen) {
      suggestions.push({
        id: `sug-setup-${topic.id}`,
        courseId: topic.courseId,
        title: `Add material for ${topic.title}`,
        reason: NO_CONTENT_REASON,
        minutes: 10,
        to: `/course/${topic.courseId}/materials`,
        topicId: topic.id,
        kind: 'setup',
        weight: Math.max(1, weight - 40),
      });
      continue;
    }

    const to =
      chosen === 'tutor'
        ? `/course/${topic.courseId}/tutor/new?topic=${topic.id}`
        : chosen === 'read'
          ? `/course/${topic.courseId}/materials`
          : chosen === 'flashcards'
            ? `/course/${topic.courseId}/practice/new?topic=${topic.id}&activity=flashcards`
            : `/course/${topic.courseId}/practice/new?topic=${topic.id}`;

    suggestions.push({
      id: `sug-topic-${topic.id}`,
      courseId: topic.courseId,
      title: `${
        chosen === 'tutor'
          ? 'Learn'
          : chosen === 'read'
            ? 'Read about'
            : chosen === 'flashcards'
              ? 'Review'
              : 'Practise'
      } ${topic.title}`,
      reason: `${reason}${substitutionNote(preferredActivity, chosen)}`,
      minutes: chosen === 'tutor' ? 25 : 15,
      to,
      topicId: topic.id,
      kind:
        chosen === 'tutor'
          ? 'tutor'
          : chosen === 'read'
            ? 'materials'
            : chosen === 'flashcards'
              ? 'review'
              : 'practice',
      weight,
    });
  }

  /* 8 — A rehearsal, when an assessment is close enough for pace to matter. */
  const soon = nextAssessment(
    assessments.filter((a) => active.some((c) => c.id === a.courseId)),
    now, input.timezone,
  );
  if (soon && attempts.length > 0) {
    const daysAway = daysUntil(soon.date, now, input.timezone);
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
    const available = minutesToday(30, checkIns, now, input.timezone);
    const course = checkIn.courseId ?? active[0]?.id;
    /* Only offer the short round if that course actually has flashcards. */
    const hasFlashcards =
      course !== undefined &&
      topics
        .filter((t) => t.courseId === course)
        .some((t) => capabilitiesOf(t).activities.includes('flashcards'));

    if (course && hasFlashcards) {
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

