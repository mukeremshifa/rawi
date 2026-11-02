import type {
  AnswerValue,
  Outcome,
  Question,
  QuestionAttempt,
} from './types';

/**
 * Marking, for every format, by code. A multiple-choice answer matches its key or it does not, a
 * number is within its tolerance or it is not, and blanks, orders and matches earn credit part by
 * part. Two formats are marked by the student: a flashcard is rated for recall, and a self-check
 * answer is compared with the model answer. Those carry the self-rated mode downstream, so they
 * never count as independent evidence.
 */

/** An attempt's totals. */
export function attemptTotals(questions: QuestionAttempt[]) {
  return {
    marksAwarded: questions.reduce((sum, qa) => sum + qa.marksAwarded, 0),
    marksAvailable: questions.reduce((sum, qa) => sum + qa.marksAvailable, 0),
  };
}

/** Formats the student marks. */
export const SELF_MARKED: Question['format'][] = ['flashcard', 'self-check'];

/* ── Per-format marking ───────────────────────────────────────────────── */

function markChoice(question: Question, answer: AnswerValue) {
  if (answer.kind !== 'choice') return { outcome: 'skipped' as Outcome, fraction: 0 };
  const correct = new Set(question.correctIndices ?? []);
  const given = new Set(answer.indices);
  if (given.size === 0) return { outcome: 'skipped' as Outcome, fraction: 0 };

  const ok = given.size === 1 && correct.has([...given][0]!);
  return { outcome: (ok ? 'correct' : 'incorrect') as Outcome, fraction: ok ? 1 : 0 };
}

/** A number typed with commas, spaces or a unit after it still reads as that number. */
export function readNumber(text: string): number | null {
  const m = /-?\d[\d,\s]*(?:\.\d+)?|-?\.\d+/.exec(text.replace(/\u2212/g, '-'));
  if (!m) return null;
  const n = Number(m[0].replace(/[,\s]/g, ''));
  return Number.isFinite(n) ? n : null;
}

function markNumber(question: Question, answer: AnswerValue) {
  if (answer.kind !== 'number' || !answer.value.trim() || !question.numeric) return { outcome: 'skipped' as Outcome, fraction: 0 };
  const n = readNumber(answer.value);
  const ok = n !== null && Math.abs(n - question.numeric.value) <= question.numeric.tolerance;
  return { outcome: (ok ? 'correct' : 'incorrect') as Outcome, fraction: ok ? 1 : 0 };
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
    case 'multiple-choice': {
      const { outcome, fraction } = markChoice(question, answer);
      return { outcome, marksAwarded: Math.round(question.marks * fraction) };
    }
    case 'numeric': {
      const { outcome, fraction } = markNumber(question, answer);
      return { outcome, marksAwarded: Math.round(question.marks * fraction) };
    }
    case 'cloze': {
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
    case 'self-check': {
      // The student compares their answer with the model answer and marks it. An answer they
      // never marked counts as skipped, not as wrong.
      if (answer.kind !== 'self-check' || !answer.mark || !answer.text.trim()) return { outcome: 'skipped', marksAwarded: 0 };
      return answer.mark === 'got' ? { outcome: 'correct', marksAwarded: question.marks }
        : answer.mark === 'partly' ? { outcome: 'partial', marksAwarded: Math.round(question.marks / 2) }
        : { outcome: 'incorrect', marksAwarded: 0 };
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

/** Builds the stored record for one answer. */
export function toQuestionAttempt(question: Question, answer: AnswerValue, usedHint: boolean): QuestionAttempt {
  const result = mark(question, answer);
  return { questionId: question.id, topicId: question.topicId, format: question.format, response: answer, outcome: result.outcome, marksAwarded: result.marksAwarded, marksAvailable: question.marks, usedHint };
}

