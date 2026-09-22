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
 * Exam construction, validation and completion.
 *
 * ── Why validation lives here and not in the builder component ────────────
 *
 * Three callers need it: the builder (to explain problems as they appear), the
 * exams list (to disable "start" on a saved config that has since become
 * impossible — a student can delete a material or a topic after saving), and
 * `buildRun` itself (to refuse rather than produce a broken paper). Putting it
 * in a component would have meant the other two silently skipping it.
 *
 * ── The one that keeps biting ─────────────────────────────────────────────
 *
 * A section asking for more questions than the pool holds. It is easy to do —
 * pick "essay" and a single topic and the pool is one — and the failure is
 * invisible until the paper is running. So it is the first thing checked, per
 * section, with the shortfall named.
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

  if (config.feedback === 'per-section' && config.navigation === 'free') {
    warnings.push(
      'With per-section feedback, finishing a section locks its answers — so free navigation only applies within the section you are on.',
    );
  }

  if (config.feedback === 'per-section' && config.sections.length === 1) {
    warnings.push(
      'Per-section feedback on a single-section paper is the same as feedback at the end.',
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
export function buildRun(config: ExamConfig, pool: Question[]): ExamRun | null {
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
    configId: config.id,
    configSnapshot: config,
    sectionQuestions,
    answers: {},
    flagged: [],
    startedAt: new Date(now).toISOString(),
    currentSectionIndex: 0,
    currentQuestionIndex: 0,
    lockedSectionIds: [],
    sectionOutcomes: [],
    ...(config.timing === 'overall'
      ? {
          deadlineAt: new Date(
            now + withExtraTime(config.totalMinutes, config.extraTimePercent) * 60_000,
          ).toISOString(),
        }
      : {}),
    ...(config.timing === 'per-section' && first
      ? {
          sectionDeadlineAt: new Date(
            now + withExtraTime(first.minutes, config.extraTimePercent) * 60_000,
          ).toISOString(),
        }
      : {}),
  };
}

/** The deadline for a newly entered section, or undefined when untimed. */
export function sectionDeadline(
  config: ExamConfig,
  sectionIndex: number,
  from: number = Date.now(),
): string | undefined {
  if (config.timing !== 'per-section') return undefined;
  const section = config.sections[sectionIndex];
  if (!section) return undefined;
  return new Date(
    from + withExtraTime(section.minutes, config.extraTimePercent) * 60_000,
  ).toISOString();
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
 * `mode` is `exam` unless the tutor was available, in which case any hint taken
 * makes individual answers assisted. That distinction is what stops open-book,
 * tutor-assisted rehearsal from being counted as independent evidence.
 */
export function finishRun(
  run: ExamRun,
  pool: Map<string, Question>,
  finish: 'manual' | 'expired',
  hintedQuestionIds: Set<string>,
): Attempt {
  const config = run.configSnapshot;
  const questions: QuestionAttempt[] = [];

  for (const section of config.sections) {
    for (const questionId of run.sectionQuestions[section.id] ?? []) {
      const question = pool.get(questionId);
      if (!question) continue;
      const answer = run.answers[questionId] ?? { kind: 'none' as const };
      questions.push(
        toQuestionAttempt(question, answer, hintedQuestionIds.has(questionId)),
      );
    }
  }

  return {
    id: newId('att'),
    kind: 'exam',
    mode: 'exam',
    title: config.name,
    examConfigId: config.id,
    topicIds: [...new Set(questions.map((q) => q.topicId))],
    startedAt: run.startedAt,
    completedAt: new Date().toISOString(),
    questions,
    marksAwarded: questions.reduce((sum, q) => sum + q.marksAwarded, 0),
    marksAvailable: questions.reduce((sum, q) => sum + q.marksAvailable, 0),
    finish,
  };
}

/** A flat list of every question in the paper, in section order. */
export function flatQuestionIds(run: ExamRun): string[] {
  return run.configSnapshot.sections.flatMap(
    (section) => run.sectionQuestions[section.id] ?? [],
  );
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
