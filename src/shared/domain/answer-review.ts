import type { AnswerValue, Attempt, Question, AnswerReview } from './types';

/** The correct answer a student is shown, in whatever shape the format has. */
export const answerKey = (question: Question) => question.correctIndices?.map(i => question.options?.[i]).join('\n') ?? (question.numeric ? `${question.numeric.value}${question.numeric.unit ? ` ${question.numeric.unit}` : ''}` : undefined) ?? question.answer ?? question.sequence?.join('\n') ?? question.blanks?.map(b => b.join(' or ')).join('\n') ?? question.pairs?.map(p => `${p.left}: ${p.right}`).join('\n') ?? '';

export function responseText(value: AnswerValue, question: Question): string {
  switch (value.kind) {
    case 'text': return value.text;
    case 'choice': return value.indices.map(i => question.options?.[i] ?? `Option ${i + 1}`).join('\n');
    case 'blanks': return value.values.join('\n');
    case 'ordering': return value.sequence.join('\n');
    case 'matching': return Object.entries(value.assignments).map(([a, b]) => `${a}: ${b}`).join('\n');
    case 'number': return value.value;
    case 'self-check': return value.text;
    case 'self-rating': return `Self-rated recall: ${value.rating}`;
    case 'none': return 'No answer submitted.';
  }
}

export function answerReview(attempt: Attempt, question: Question): AnswerReview | undefined {
  if (attempt.courseId !== question.courseId || !attempt.completedAt) return;
  const qa = attempt.questions.find(q => q.questionId === question.id); if (!qa) return;
  const key = answerKey(question);
  return {
    attemptId: attempt.id, questionId: question.id, courseId: attempt.courseId, topicId: qa.topicId,
    prompt: question.prompt.slice(0, 6000), response: responseText(qa.response, question).slice(0, 6000),
    answerKey: key.slice(0, 6000),
    feedback: question.explanation.slice(0, 6000),
    marksAwarded: qa.marksAwarded, marksAvailable: qa.marksAvailable, usedHint: qa.usedHint,
  };
}
