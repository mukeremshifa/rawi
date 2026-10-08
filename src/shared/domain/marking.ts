import type {
  AnswerValue,
  Outcome,
  Question,
  QuestionAttempt,
  RubricPoint,
  WrittenGrading,
} from './types';

/**
 * Marking, for every format.
 *
 * Objective formats are marked here, exactly and deterministically: a
 * multiple-choice answer either matches the key or it does not.
 *
 * Written formats are not marked here any more. A new written answer is
 * recorded as `pending` and sent for AI feedback against its rubric, and
 * `applyGrading` folds the validated result back in. Earlier builds marked
 * written answers by looking for rubric keywords. Those grades are kept as
 * they were, never silently regraded, and carry `LEGACY_MARKING_NOTICE`
 * wherever they are shown.
 */

export const LEGACY_MARKING_NOTICE =
  'Simulated marking from an earlier version of Rawi. This written answer was checked for the words a strong answer usually contains, not read for its meaning. The grade is kept as it was recorded.';

export const AI_MARKING_NOTICE =
  'AI feedback. A language model compared your answer with the rubric and the course material. It judges meaning rather than keywords, but it can be wrong, so treat the marks as guidance rather than an official grade.';

export const WRITTEN_FORMATS = ['written-recall', 'source-analysis', 'essay'] as const;

export function isWritten(format: Question['format']): boolean {
  return (WRITTEN_FORMATS as readonly string[]).includes(format);
}

/** Submitted but not yet marked: counts as neither right nor wrong. */
export function isAwaitingGrade(qa: QuestionAttempt): boolean {
  return qa.outcome === 'pending';
}

/**
 * An attempt's totals over the answers that have actually been marked.
 * A pending answer is left out of both sides, so it cannot drag a score down
 * while it waits.
 */
export function attemptTotals(questions: QuestionAttempt[]) {
  const marked = questions.filter((qa) => !isAwaitingGrade(qa));
  return {
    marksAwarded: marked.reduce((sum, qa) => sum + qa.marksAwarded, 0),
    marksAvailable: marked.reduce((sum, qa) => sum + qa.marksAvailable, 0),
    pending: questions.length - marked.length,
  };
}

/** The rubric a written question is marked against, synthesised if absent. */
export function rubricFor(question: Question): RubricPoint[] {
  if (question.rubric && question.rubric.length > 0) return question.rubric;
  return [
    {
      id: 'overall',
      label: 'Answers the question accurately and completely',
      marks: question.marks,
      keywords: [],
      missedAdvice: 'Compare your answer with the explanation.',
    },
  ];
}

/* ── Per-format marking ───────────────────────────────────────────────── */

function markChoice(question: Question, answer: AnswerValue) {
  if (answer.kind !== 'choice') return { outcome: 'skipped' as Outcome, fraction: 0 };
  const correct = new Set(question.correctIndices ?? []);
  const given = new Set(answer.indices);
  if (given.size === 0) return { outcome: 'skipped' as Outcome, fraction: 0 };

  if (question.format === 'multiple-choice') {
    const ok = given.size === 1 && correct.has([...given][0]!);
    return { outcome: (ok ? 'correct' : 'incorrect') as Outcome, fraction: ok ? 1 : 0 };
  }

  // Multiple select: credit for correct picks, penalty for wrong ones, floored
  // at zero. All-or-nothing would make a 4-of-5 answer score the same as a
  // blank one, which is not a fair reading of what the student knew.
  let hits = 0;
  let misses = 0;
  for (const i of given) (correct.has(i) ? (hits += 1) : (misses += 1));
  const raw = (hits - misses) / correct.size;
  const fraction = Math.max(0, Math.min(1, raw));
  const outcome: Outcome =
    fraction === 1 ? 'correct' : fraction === 0 ? 'incorrect' : 'partial';
  return { outcome, fraction };
}

function markBlanks(question: Question, answer: AnswerValue) {
  if (answer.kind !== 'blanks') return { outcome: 'skipped' as Outcome, fraction: 0 };
  const keys = question.blanks ?? [];
  if (keys.length === 0) return { outcome: 'skipped' as Outcome, fraction: 0 };
  if (answer.values.every((v) => !v.trim())) {
    return { outcome: 'skipped' as Outcome, fraction: 0 };
  }

  let hits = 0;
  keys.forEach((accepted, i) => {
    const given = (answer.values[i] ?? '').trim().toLowerCase();
    if (given && accepted.some((a) => a.trim().toLowerCase() === given)) hits += 1;
  });
  const fraction = hits / keys.length;
  const outcome: Outcome =
    fraction === 1 ? 'correct' : fraction === 0 ? 'incorrect' : 'partial';
  return { outcome, fraction };
}

function markOrdering(question: Question, answer: AnswerValue) {
  if (answer.kind !== 'ordering') return { outcome: 'skipped' as Outcome, fraction: 0 };
  const correct = question.sequence ?? [];
  if (correct.length === 0) return { outcome: 'skipped' as Outcome, fraction: 0 };

  // Credit per item in its correct position. Partial credit matters here more
  // than anywhere: a sequence with one adjacent pair swapped demonstrates most
  // of the understanding, and scoring it zero teaches nothing.
  let hits = 0;
  correct.forEach((item, i) => {
    if (answer.sequence[i] === item) hits += 1;
  });
  const fraction = hits / correct.length;
  const outcome: Outcome =
    fraction === 1 ? 'correct' : fraction === 0 ? 'incorrect' : 'partial';
  return { outcome, fraction };
}

function markMatching(question: Question, answer: AnswerValue) {
  if (answer.kind !== 'matching') return { outcome: 'skipped' as Outcome, fraction: 0 };
  const pairs = question.pairs ?? [];
  if (pairs.length === 0) return { outcome: 'skipped' as Outcome, fraction: 0 };
  const assigned = Object.values(answer.assignments).filter(Boolean);
  if (assigned.length === 0) return { outcome: 'skipped' as Outcome, fraction: 0 };

  let hits = 0;
  for (const pair of pairs) {
    if (answer.assignments[pair.left] === pair.right) hits += 1;
  }
  const fraction = hits / pairs.length;
  const outcome: Outcome =
    fraction === 1 ? 'correct' : fraction === 0 ? 'incorrect' : 'partial';
  return { outcome, fraction };
}

/* ── The entry point ──────────────────────────────────────────────────── */

export interface MarkResult {
  outcome: Outcome;
  marksAwarded: number;
}

/**
 * Marks one answer against one question.
 *
 * `usedHint` does not reduce marks. That is a deliberate pedagogical choice the
 * brief asks for: hints should feel welcome during tutoring, so the cost of one
 * is recorded in `AttemptMode` and in the evidence derivation — where it stops
 * the work counting as *independent* — rather than docked from a score. Being
 * penalised in marks for asking is what teaches students not to ask.
 */
export function mark(question: Question, answer: AnswerValue): MarkResult {
  switch (question.format) {
    case 'multiple-choice':
    case 'multiple-select': {
      const { outcome, fraction } = markChoice(question, answer);
      return { outcome, marksAwarded: Math.round(question.marks * fraction) };
    }
    case 'fill-blank': {
      const { outcome, fraction } = markBlanks(question, answer);
      return { outcome, marksAwarded: Math.round(question.marks * fraction) };
    }
    case 'ordering': {
      const { outcome, fraction } = markOrdering(question, answer);
      return { outcome, marksAwarded: Math.round(question.marks * fraction) };
    }
    case 'matching': {
      const { outcome, fraction } = markMatching(question, answer);
      return { outcome, marksAwarded: Math.round(question.marks * fraction) };
    }
    case 'written-recall':
    case 'source-analysis':
    case 'essay': {
      const text = answer.kind === 'text' ? answer.text.trim() : '';
      /* Nothing written is nothing to send: it scores zero without a request. */
      if (!text) return { outcome: 'skipped', marksAwarded: 0 };
      return { outcome: 'pending', marksAwarded: 0 };
    }
    case 'flashcard': {
      // A flashcard is self-rated; there is no key to mark against. "good" and
      // "easy" count as recalled, and the attempt records that this was the
      // student's own judgement rather than an assessment.
      if (answer.kind !== 'self-rating') return { outcome: 'skipped', marksAwarded: 0 };
      const recalled = answer.rating === 'good' || answer.rating === 'easy';
      return {
        outcome: recalled ? 'correct' : answer.rating === 'hard' ? 'partial' : 'incorrect',
        marksAwarded: recalled ? question.marks : answer.rating === 'hard' ? question.marks : 0,
      };
    }
  }
}

/**
 * Builds the stored record for one answer.
 *
 * A written answer with text comes back `pending` unless `grading` already
 * holds a finished result for it, as it does when feedback was requested
 * during a practice run.
 */
export function toQuestionAttempt(
  question: Question,
  answer: AnswerValue,
  usedHint: boolean,
  grading?: WrittenGrading,
): QuestionAttempt {
  const result = mark(question, answer);
  const qa: QuestionAttempt = {
    questionId: question.id,
    topicId: question.topicId,
    format: question.format,
    response: answer,
    outcome: result.outcome,
    marksAwarded: result.marksAwarded,
    marksAvailable: question.marks,
    usedHint,
  };
  if (result.outcome !== 'pending') return qa;
  if (grading?.status === 'graded') return applyGrading(question, qa, grading);
  return { ...qa, grading: grading ?? { method: 'ai', status: 'pending' } };
}

/**
 * Folds a finished grading into an answer record.
 *
 * Rubric marks are the authority when they sum to the question's total, and
 * are scaled to it when a hand-edited rubric does not add up. The outcome
 * bands are the ones the rest of the app already uses.
 */
export function applyGrading(
  question: Question,
  qa: QuestionAttempt,
  grading: WrittenGrading,
): QuestionAttempt {
  if (grading.status !== 'graded' || !grading.points) {
    return { ...qa, outcome: 'pending', marksAwarded: 0, grading };
  }
  const earned = grading.points.reduce((sum, p) => sum + p.awarded, 0);
  const total = grading.points.reduce((sum, p) => sum + p.max, 0);
  const fraction = total === 0 ? 0 : earned / total;
  const outcome: Outcome =
    fraction >= 0.85 ? 'correct' : fraction === 0 ? 'incorrect' : 'partial';
  return {
    ...qa,
    outcome,
    marksAwarded: total === question.marks ? earned : Math.round(question.marks * fraction),
    creditedRubricIds: grading.points.filter((p) => p.awarded > 0).map((p) => p.rubricId),
    grading,
  };
}

/** True when an answer has enough in it to be worth marking. */
export function hasContent(answer: AnswerValue | undefined): boolean {
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
}
