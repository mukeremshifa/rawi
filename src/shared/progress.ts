import type {
  Attempt,
  CheckIn,
  Course,
  EvidenceLevel,
  RecurringMistake,
  ReviewDue,
  Suggestion,
  Topic,
  TopicEvidence,
} from './types.ts';

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
          if (qa.outcome === 'correct' && !qa.usedHint) {
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
    { topicId: string; times: number; lastAttemptId: string; lastAt: string }
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
      questionId,
      topicId: v.topicId,
      prompt: promptFor(questionId) ?? 'This question',
      times: v.times,
      lastAttemptId: v.lastAttemptId,
      lastAt: v.lastAt,
    }))
    .sort((a, b) => b.times - a.times || (a.lastAt < b.lastAt ? 1 : -1));
}

/* ── The plan ─────────────────────────────────────────────────────────── */

export function daysUntilExam(course: Course, now: Date = new Date()): number {
  return Math.max(0, daysBetween(now.toISOString(), `${course.examDate}T23:59:59`));
}

/** Minutes available today, after any check-in adjustment. */
export function minutesToday(course: Course, checkIns: CheckIn[]): number {
  const today = new Date().toISOString().slice(0, 10);
  const todays = checkIns.filter((c) => c.at.slice(0, 10) === today);
  const latest = todays[todays.length - 1];
  if (latest?.minutesToday !== undefined) return latest.minutesToday;
  return course.dailyMinutes;
}

/** The most recent check-in from today, if any. */
export function todaysCheckIn(checkIns: CheckIn[]): CheckIn | undefined {
  const today = new Date().toISOString().slice(0, 10);
  return [...checkIns].reverse().find((c) => c.at.slice(0, 10) === today);
}

export interface PlanInput {
  course: Course;
  topics: Topic[];
  attempts: Attempt[];
  checkIns: CheckIn[];
  /** Topic ids with at least one authored question, so we never suggest a dead end. */
  topicsWithQuestions: Set<string>;
  hasMaterials: boolean;
  /** Set when a tutor session or exam is part-finished and can be resumed. */
  resumable?: { title: string; to: string; kind: Suggestion['kind'] };
}

/**
 * Today's suggested work, in priority order, with a stated reason for each.
 *
 * ── How the ordering is decided ───────────────────────────────────────────
 *
 * Weights, summed from a few local rules, then sorted. The rules in descending
 * force:
 *
 *   1. Resume something unfinished. Nothing outranks work already started.
 *   2. A recurring mistake. Twice wrong is the clearest signal in the log.
 *   3. The check-in. "Struggling with X" moves X to the top and switches the
 *      activity from testing to tutoring, because more testing is the wrong
 *      answer to "I don't understand this".
 *   4. Reviews that have come due.
 *   5. Topics with weak evidence, weighted by the student's own priority.
 *   6. A rehearsal exam when the real one is close.
 *
 * The reasons are written out rather than templated from the weights, because
 * "Because weight 4.5" is not a reason a student can act on.
 */
export function buildPlan(input: PlanInput): Suggestion[] {
  const { course, topics, attempts, checkIns, topicsWithQuestions, hasMaterials } = input;
  const suggestions: Suggestion[] = [];
  const available = minutesToday(course, checkIns);
  const checkIn = todaysCheckIn(checkIns);
  const untilExam = daysUntilExam(course);

  /* 1 — Resume. */
  if (input.resumable) {
    suggestions.push({
      id: 'sug-resume',
      title: input.resumable.title,
      reason: 'You left this part-finished. Picking it up is cheaper than starting again.',
      minutes: Math.min(20, available),
      to: input.resumable.to,
      kind: input.resumable.kind,
      weight: 100,
    });
  }

  /* 2 — First-run guidance, when there is genuinely nothing to go on. */
  if (attempts.length === 0) {
    if (!hasMaterials) {
      suggestions.push({
        id: 'sug-add-material',
        title: 'Add a reading, or start from a topic',
        reason:
          'There is nothing in your library yet. You can paste a reading in, or skip it — topic practice works without any sources.',
        minutes: 5,
        to: '/materials',
        kind: 'materials',
        weight: 90,
      });
    }
    const first = topics.find((t) => topicsWithQuestions.has(t.id));
    if (first) {
      suggestions.push({
        id: 'sug-first-session',
        title: `Start with ${first.title}`,
        reason:
          'Nothing recorded yet, so this is a starting point rather than a recommendation. After a session or two the plan will have something to work from.',
        minutes: Math.min(20, available),
        to: `/tutor/new?topic=${first.id}`,
        kind: 'tutor',
        weight: 80,
      });
    }
  }

  /* 3 — The check-in, which overrides the ordinary ranking. */
  if (checkIn?.mood === 'struggling' && checkIn.topicId) {
    const topic = topics.find((t) => t.id === checkIn.topicId);
    if (topic) {
      suggestions.push({
        id: `sug-struggle-${topic.id}`,
        title: `Work through ${topic.title} with the tutor`,
        reason:
          'You said this one is not landing. More testing would not help — an explanation and a worked example will.',
        minutes: Math.min(25, available),
        to: `/tutor/new?topic=${topic.id}`,
        topicId: topic.id,
        kind: 'tutor',
        weight: 95,
      });
    }
  }

  /* 4 — Recurring mistakes. */
  const mistakes = recurringMistakes(attempts, () => undefined);
  for (const mistake of mistakes.slice(0, 2)) {
    const topic = topics.find((t) => t.id === mistake.topicId);
    if (!topic) continue;
    suggestions.push({
      id: `sug-mistake-${mistake.questionId}`,
      title: `Fix a repeated mistake in ${topic.title}`,
      reason: `You have got this wrong ${mistake.times} times. That is the clearest signal in your history, so it goes first.`,
      minutes: Math.min(15, available),
      to: `/tutor/new?topic=${topic.id}&question=${mistake.questionId}&attempt=${mistake.lastAttemptId}`,
      topicId: topic.id,
      kind: 'tutor',
      weight: 85,
    });
  }

  /* 5 — Reviews that have come due. */
  for (const review of dueReviews(topics, attempts).slice(0, 2)) {
    const topic = topics.find((t) => t.id === review.topicId);
    if (!topic || !topicsWithQuestions.has(topic.id)) continue;
    suggestions.push({
      id: `sug-review-${topic.id}`,
      title: `Review ${topic.title}`,
      reason: `Last worked ${review.daysSince} days ago. This prototype flags a topic for review after three days untouched.`,
      minutes: Math.min(10, available),
      to: `/practice/new?topic=${topic.id}&activity=flashcards`,
      topicId: topic.id,
      kind: 'review',
      weight: 60 + Math.min(review.daysSince, 10),
    });
  }

  /* 6 — Weak topics, weighted by the student's own priority. */
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

  for (const topic of topics) {
    if (!topicsWithQuestions.has(topic.id)) continue;
    const evidence = deriveEvidence(topic.id, attempts);
    if (evidence.level === 'retained') continue;
    if (suggestions.some((s) => s.topicId === topic.id)) continue;

    const weight = levelWeight[evidence.level] + priorityWeight[topic.priority];
    const reason =
      evidence.level === 'not-checked'
        ? `Nothing recorded on this topic yet${topic.priority === 'high' ? ', and you have marked it high priority' : ''}.`
        : `Evidence here is "${EVIDENCE_LABEL[evidence.level].toLowerCase()}"${
            topic.priority === 'high' ? ', and you marked it high priority' : ''
          }. ${
            evidence.level === 'practising'
              ? 'You have worked on it but not yet answered unaided.'
              : 'One unaided answer so far; a second on a different question would confirm it.'
          }`;

    suggestions.push({
      id: `sug-topic-${topic.id}`,
      title:
        evidence.level === 'not-checked'
          ? `Learn ${topic.title}`
          : `Practise ${topic.title}`,
      reason,
      minutes: Math.min(evidence.level === 'not-checked' ? 25 : 15, available),
      to:
        evidence.level === 'not-checked'
          ? `/tutor/new?topic=${topic.id}`
          : `/practice/new?topic=${topic.id}`,
      topicId: topic.id,
      kind: evidence.level === 'not-checked' ? 'tutor' : 'practice',
      weight,
    });
  }

  /* 7 — A rehearsal, when the exam is close enough to matter. */
  if (untilExam <= 21 && attempts.length > 0) {
    const lastExam = [...attempts].reverse().find((a) => a.kind === 'exam');
    const daysSinceExam = lastExam?.completedAt
      ? daysBetween(lastExam.completedAt, new Date().toISOString())
      : 99;
    if (daysSinceExam >= 2) {
      suggestions.push({
        id: 'sug-exam',
        title: 'Sit a timed rehearsal',
        reason:
          untilExam <= 7
            ? `The exam is ${untilExam} day${untilExam === 1 ? '' : 's'} away. Timed practice is now worth more than more reading.`
            : `${untilExam} days to the exam, and your last timed attempt was ${daysSinceExam} days ago. Writing under time is a separate skill from knowing the material.`,
        minutes: Math.min(available, 25),
        to: '/exams',
        kind: 'exam',
        weight: untilExam <= 7 ? 70 : 40,
      });
    }
  }

  /* 8 — Reduced time changes what is offered, not just the estimate. */
  if (checkIn?.mood === 'less-time') {
    suggestions.unshift({
      id: 'sug-short',
      title: 'A short flashcard round',
      reason: `You said you have about ${available} minutes today. This fits, and keeps the streak of contact with the material.`,
      minutes: Math.min(10, available),
      to: '/practice/new?activity=flashcards',
      kind: 'review',
      weight: 96,
    });
  }

  return suggestions
    .sort((a, b) => b.weight - a.weight)
    .filter(
      (s, i, all) => all.findIndex((o) => o.id === s.id) === i,
    )
    .slice(0, 5);
}

/** A one-line description of how the plan was put together, for the UI. */
export const PLAN_EXPLANATION =
  'Suggestions are ordered by simple local rules: unfinished work first, then repeated mistakes, then what you said at check-in, then reviews that have come due, then topics with the weakest evidence weighted by the priority you set.';
