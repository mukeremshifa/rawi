import type {
  Attempt,
  ExamConfig,
  ExamRun,
  Question,
  QuestionAttempt,
} from '@shared/types.ts';
import { toQuestionAttempt } from '@shared/marking.ts';

import { selectQuestions } from '@/store/selectors';
import { newId } from '@/lib/id';

/**
 * Exam construction, validation, timing and completion.
 *
 * ── The rule this file now enforces ───────────────────────────────────────
 *
 * **Nothing is marked until the whole paper is submitted.** The previous
 * checkpoint could release feedback section by section and could offer tutor
 * hints inside a paper; both are gone. What finishing a section can still do is
 * *lock* it, and that is a separate, explicit setting whose consequence is
 * stated before the student confirms.
 *
 * That leaves the run holding no marking state at all, which is the point: a
 * run is answers, flags, position and deadlines, and the single `finishRun`
 * call at the end is the only place a mark is ever computed.
 *
 * ── Why validation lives here and not in the builder component ────────────
 *
 * Three callers need it: the builder (to explain problems as they appear), the
 * exams list (to disable "start" on a saved config that has since become
 * impossible — a student can delete a material or a topic after saving), and
 * `buildRun` itself (to refuse rather than produce a broken paper). Putting it
 * in a component would have meant the other two silently skipping it.
 */

export interface Validation {
  /** Blocking. The exam cannot start. */
  problems: string[];
  /** Non-blocking, but the student should know. */
  warnings: string[];
  /** Keyed by section id, so the builder can render it on the section. */
  sectionProblems: Record<string, string>;
}

export function validateConfig(config: ExamConfig, pool: Question[]): Validation {
  const problems: string[] = [];
  const warnings: string[] = [];
  const sectionProblems: Record<string, string> = {};

  if (config.sections.length === 0) {
    problems.push('An exam needs at least one section.');
  }

  /* Questions are not reused across sections in one paper, so availability has
     to be checked cumulatively — two sections each asking for all four essays
     is a problem even though each is individually satisfiable. */
  const claimed = new Set<string>();

  for (const section of config.sections) {
    if (section.formats.length === 0) {
      sectionProblems[section.id] =
        'No question formats selected, so this section cannot be filled.';
      problems.push(`“${section.title}” has no question formats selected.`);
      continue;
    }

    const available = selectQuestions(pool, {
      formats: section.formats,
      ...(section.topicIds.length ? { topicIds: section.topicIds } : {}),
      exclude: [...claimed],
    });

    if (available.length === 0) {
      sectionProblems[section.id] =
        section.topicIds.length > 0
          ? 'No questions exist in these formats for the selected topics. Widen the formats or the topics.'
          : 'No questions exist in these formats.';
      problems.push(`“${section.title}” has no questions available.`);
      continue;
    }

    if (available.length < section.count) {
      sectionProblems[section.id] =
        `Asking for ${section.count} but only ${available.length} ${
          available.length === 1 ? 'question matches' : 'questions match'
        } these formats and topics${claimed.size > 0 ? ' after the earlier sections take theirs' : ''}. Reduce the count, or widen the formats or topics.`;
      problems.push(
        `“${section.title}” asks for ${section.count} questions and only ${available.length} are available.`,
      );
      continue;
    }

    for (const question of available.slice(0, section.count)) {
      claimed.add(question.id);
    }

    if (
      config.timing === 'per-section' &&
      section.minutes > 0 &&
      section.count / section.minutes > 1.5
    ) {
      warnings.push(
        `“${section.title}” gives under 40 seconds a question. That may be the point, but it is worth checking.`,
      );
    }
  }

  if (config.timing === 'overall' && config.totalMinutes <= 0) {
    problems.push('A whole-paper timer needs a duration above zero.');
  }

  if (config.timing === 'per-section') {
    const zero = config.sections.filter((s) => s.minutes <= 0);
    if (zero.length > 0) {
      problems.push(
        `Per-section timing needs a duration for every section. ${zero
          .map((s) => `“${s.title}”`)
          .join(', ')} ${zero.length === 1 ? 'has' : 'have'} none.`,
      );
    }
  }

  /* Combinations that contradict each other. These are the "explain rather than
     prevent" cases: each is coherent enough to allow, and confusing enough to
     be worth naming. */
  if (config.book === 'open' && config.allowedMaterialIds.length === 0) {
    warnings.push(
      'Open book with no materials selected behaves exactly like closed book. Pick the materials you want available.',
    );
  }

  if (config.timing === 'untimed' && config.extraTimePercent > 0) {
    warnings.push(
      'Extra time has no effect on an untimed paper. It is kept in case you switch the timing back.',
    );
  }

  /*
   * The combinations involving locking. Each is allowed and each is worth
   * explaining, because the interaction between navigation, timing and locking
   * is where a student is most likely to lose work they thought was safe.
   */
  if (config.lockSectionsOnFinish && config.navigation === 'free') {
    warnings.push(
      'Free navigation with locking on: you can move between sections freely, but once you press “Finish section” that section’s answers are fixed. You will be asked to confirm before that happens.',
    );
  }

  if (config.lockSectionsOnFinish && config.sections.length === 1) {
    warnings.push(
      'On a single-section paper, finishing the section and submitting the paper are the same action, so locking has no separate effect.',
    );
  }

  if (config.timing === 'per-section') {
    warnings.push(
      'Each section’s clock starts when you first open it and keeps running whether or not you are on it. When it expires that section is locked, and returning to it later does not restart it.',
    );
  }

  if (config.navigation === 'sequential') {
    warnings.push(
      'Sequential navigation: you cannot return to an earlier question or an earlier section, and flagged questions can only be revisited while you are still on their section.',
    );
  }

  return { problems, warnings, sectionProblems };
}

/* ── Building a run ───────────────────────────────────────────────────── */

/** Minutes, with the extra-time allowance applied. */
export function withExtraTime(minutes: number, extraPercent: number): number {
  return minutes * (1 + extraPercent / 100);
}

/**
 * Resolves a config into a runnable paper.
 *
 * The question ids are fixed here and stored on the run, which is what makes
 * the paper stable across a reload: re-deriving them would produce a different
 * set if the pool changed, and answers keyed to the old ids would be orphaned.
 *
 * Returns null when the config cannot produce a paper, so callers have one
 * thing to check rather than discovering an empty section mid-exam.
 */
export function buildRun(
  config: ExamConfig,
  pool: Question[],
  /**
   * Where this run was launched from. Carried on the run so that submission,
   * which can happen after a reload or from a timer, still knows which planner
   * session it completes and which assessment it was rehearsing for.
   */
  context: { plannedSessionId?: string; assessmentId?: string } = {},
): ExamRun | null {
  const sectionQuestions: Record<string, string[]> = {};
  const claimed: string[] = [];

  for (const section of config.sections) {
    const chosen = selectQuestions(
      pool,
      {
        formats: section.formats,
        ...(section.topicIds.length ? { topicIds: section.topicIds } : {}),
        exclude: claimed,
      },
      section.count,
    );
    if (chosen.length === 0) return null;
    sectionQuestions[section.id] = chosen.map((q) => q.id);
    claimed.push(...chosen.map((q) => q.id));
  }

  const now = Date.now();
  const first = config.sections[0];

  return {
    id: newId('run'),
    courseId: config.courseId,
    configId: config.id,
    configSnapshot: config,
    ...(context.plannedSessionId
      ? { plannedSessionId: context.plannedSessionId }
      : {}),
    ...(context.assessmentId
      ? { assessmentId: context.assessmentId }
      : config.assessmentIds?.[0]
        ? { assessmentId: config.assessmentIds[0] }
        : {}),
    sectionQuestions,
    answers: {},
    flagged: [],
    startedAt: new Date(now).toISOString(),
    currentSectionIndex: 0,
    currentQuestionIndex: 0,
    lockedSectionIds: [],
    sectionOutcomes: [],
    /*
     * Only the first section's clock starts now. The others start when the
     * student first opens them, which is what `enterSection` is for — starting
     * them all at once would run down a later section's time while the student
     * is still working on an earlier one.
     */
    sectionDeadlines:
      config.timing === 'per-section' && first
        ? {
            [first.id]: new Date(
              now + withExtraTime(first.minutes, config.extraTimePercent) * 60_000,
            ).toISOString(),
          }
        : {},
    ...(config.timing === 'overall'
      ? {
          deadlineAt: new Date(
            now + withExtraTime(config.totalMinutes, config.extraTimePercent) * 60_000,
          ).toISOString(),
        }
      : {}),
  };
}

/**
 * Starts a section's clock the first time it is entered.
 *
 * ── Why this is idempotent ────────────────────────────────────────────────
 *
 * The brief requires that leaving a page and coming back does not grant new
 * time. With free navigation a student can leave a timed section and return to
 * it, and a naive implementation recomputes the deadline on entry — handing out
 * the full allowance again, every time. So a section that already has a
 * deadline keeps it, expired or not, and this returns the run unchanged.
 */
export function enterSection(run: ExamRun, sectionIndex: number): ExamRun {
  const config = run.configSnapshot;
  const section = config.sections[sectionIndex];
  if (!section) return run;
  if (config.timing !== 'per-section') return run;
  if (run.sectionDeadlines[section.id]) return run;

  return {
    ...run,
    sectionDeadlines: {
      ...run.sectionDeadlines,
      [section.id]: new Date(
        Date.now() + withExtraTime(section.minutes, config.extraTimePercent) * 60_000,
      ).toISOString(),
    },
  };
}

/** The deadline for a section, or undefined when it has not started or is untimed. */
export function deadlineFor(run: ExamRun, sectionId: string): string | undefined {
  return run.configSnapshot.timing === 'per-section'
    ? run.sectionDeadlines[sectionId]
    : run.deadlineAt;
}

/** Whether a section's own clock has run out. */
export function sectionExpired(
  run: ExamRun,
  sectionId: string,
  now: number = Date.now(),
): boolean {
  if (run.configSnapshot.timing !== 'per-section') return false;
  const deadline = run.sectionDeadlines[sectionId];
  return deadline !== undefined && now >= new Date(deadline).getTime();
}

/**
 * Whether a section can still be answered.
 *
 * Three ways to lose a section: it was explicitly finished under a config that
 * locks, its own timer expired, or the paper is sequential and the student has
 * moved past it. Collecting them here means the runner asks one question
 * instead of three, and the read-only view cannot disagree with the input.
 */
export function sectionLocked(
  run: ExamRun,
  sectionIndex: number,
  now: number = Date.now(),
): boolean {
  const section = run.configSnapshot.sections[sectionIndex];
  if (!section) return true;
  if (run.lockedSectionIds.includes(section.id)) return true;
  if (sectionExpired(run, section.id, now)) return true;
  if (
    run.configSnapshot.navigation === 'sequential' &&
    sectionIndex < run.currentSectionIndex
  ) {
    return true;
  }
  return false;
}

/** Why a section is locked, for the banner that explains it. */
export function lockReason(
  run: ExamRun,
  sectionIndex: number,
  now: number = Date.now(),
): string | null {
  const section = run.configSnapshot.sections[sectionIndex];
  if (!section) return null;
  if (sectionExpired(run, section.id, now)) {
    return 'The time for this section has run out, so its answers are fixed. You can still read them. Nothing is marked until you submit the whole paper.';
  }
  if (run.lockedSectionIds.includes(section.id)) {
    return 'You finished this section, and this paper locks a section when you finish it. You can still read your answers. Nothing is marked until you submit the whole paper.';
  }
  if (
    run.configSnapshot.navigation === 'sequential' &&
    sectionIndex < run.currentSectionIndex
  ) {
    return 'This paper is sequential, so earlier sections cannot be returned to.';
  }
  return null;
}

/**
 * Whether the whole paper is out of time.
 *
 * For an overall timer this is the paper deadline. For per-section timing it is
 * every section having expired — which is the case a reload after a long
 * absence produces, and which must submit rather than leave a paper that can
 * never be worked on again.
 */
export function paperExpired(run: ExamRun, now: number = Date.now()): boolean {
  if (run.deadlineAt && now >= new Date(run.deadlineAt).getTime()) return true;
  if (run.configSnapshot.timing !== 'per-section') return false;
  return run.configSnapshot.sections.every((s) => sectionExpired(run, s.id, now));
}

/* ── Marking a finished paper ─────────────────────────────────────────── */

/**
 * Turns a finished run into the attempt that everything downstream reads.
 *
 * ── Why the attempt is the only durable record ────────────────────────────
 *
 * The run is scaffolding: timers, the current index, which section is locked.
 * None of that means anything once the paper is over, and keeping it would
 * give progress two sources of truth for the same event. So the run is
 * discarded on finish and the attempt — questions, answers, marks, mode — is
 * what persists.
 *
 * ── Assistance ────────────────────────────────────────────────────────────
 *
 * There is no assistance to record any more: an exam offers no hints, so every
 * answer is independent by construction and the attempt is marked
 * `assistanceRecord: 'tracked'` with `usedHint: false` throughout. That claim
 * is now true of the mechanism rather than of a flag someone remembered to set,
 * which is why the field can be trusted for runs created by this build.
 */
export function finishRun(
  run: ExamRun,
  pool: Map<string, Question>,
  finish: 'manual' | 'expired',
): Attempt {
  const config = run.configSnapshot;
  const questions: QuestionAttempt[] = [];

  for (const section of config.sections) {
    for (const questionId of run.sectionQuestions[section.id] ?? []) {
      const question = pool.get(questionId);
      if (!question) continue;
      const answer = run.answers[questionId] ?? { kind: 'none' as const };
      questions.push(toQuestionAttempt(question, answer, false));
    }
  }

  return {
    id: newId('att'),
    courseId: run.courseId,
    kind: 'exam',
    mode: 'exam',
    title: config.name,
    examConfigId: config.id,
    assistanceRecord: 'tracked',
    topicIds: [...new Set(questions.map((q) => q.topicId))],
    startedAt: run.startedAt,
    completedAt: new Date().toISOString(),
    questions,
    marksAwarded: questions.reduce((sum, q) => sum + q.marksAwarded, 0),
    marksAvailable: questions.reduce((sum, q) => sum + q.marksAvailable, 0),
    finish,
    /* The run's own link wins over the configuration's default: a rehearsal
       launched from the planner for one assessment must not be filed under
       whichever assessment the saved configuration happens to name first. */
    ...(run.assessmentId
      ? { assessmentId: run.assessmentId }
      : config.assessmentIds?.[0]
        ? { assessmentId: config.assessmentIds[0] }
        : {}),
    ...(run.plannedSessionId ? { plannedSessionId: run.plannedSessionId } : {}),
  };
}

/** A flat list of every question in the paper, in section order. */
export function flatQuestionIds(run: ExamRun): string[] {
  return run.configSnapshot.sections.flatMap(
    (section) => run.sectionQuestions[section.id] ?? [],
  );
}

/** Where a question sits in the paper, so a flag can navigate to it. */
export function locate(
  run: ExamRun,
  questionId: string,
): { sectionIndex: number; questionIndex: number } | null {
  const sections = run.configSnapshot.sections;
  for (let s = 0; s < sections.length; s += 1) {
    const ids = run.sectionQuestions[sections[s]!.id] ?? [];
    const q = ids.indexOf(questionId);
    if (q !== -1) return { sectionIndex: s, questionIndex: q };
  }
  return null;
}

/** How many questions in a section have an answer with content in it. */
export function sectionAnsweredCount(run: ExamRun, sectionId: string): number {
  const ids = run.sectionQuestions[sectionId] ?? [];
  return ids.filter((id) => {
    const answer = run.answers[id];
    if (!answer) return false;
    switch (answer.kind) {
      case 'none':
        return false;
      case 'choice':
        return answer.indices.length > 0;
      case 'text':
        return answer.text.trim().length > 0;
      case 'blanks':
        return answer.values.some((v) => v.trim().length > 0);
      case 'ordering':
        return answer.sequence.length > 0;
      case 'matching':
        return Object.values(answer.assignments).some(Boolean);
      case 'self-rating':
        return true;
    }
  }).length;
}

/**
 * The whole paper's state at submission time, for the final review.
 *
 * The brief requires the pre-submission review to account for the *entire*
 * paper rather than the current section, which is what this produces: totals
 * across every section, plus the per-section breakdown a student needs to
 * decide whether to go back.
 */
export interface PaperSummary {
  total: number;
  answered: number;
  unanswered: number;
  flagged: number;
  sections: {
    id: string;
    title: string;
    total: number;
    answered: number;
    flagged: number;
    locked: boolean;
  }[];
}

export function summarisePaper(run: ExamRun, now: number = Date.now()): PaperSummary {
  const sections = run.configSnapshot.sections.map((section, index) => {
    const ids = run.sectionQuestions[section.id] ?? [];
    return {
      id: section.id,
      title: section.title,
      total: ids.length,
      answered: sectionAnsweredCount(run, section.id),
      flagged: ids.filter((id) => run.flagged.includes(id)).length,
      locked: sectionLocked(run, index, now),
    };
  });

  const total = sections.reduce((sum, s) => sum + s.total, 0);
  const answered = sections.reduce((sum, s) => sum + s.answered, 0);

  return {
    total,
    answered,
    unanswered: total - answered,
    flagged: run.flagged.length,
    sections,
  };
}
