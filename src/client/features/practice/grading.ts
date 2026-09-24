import { useCallback, useEffect, useRef, useState } from 'react';

import type { GradeRequest } from '@shared/ai.ts';
import { selectPassages, toAiPassage } from '@shared/ai-context.ts';
import { applyGrading, rubricFor } from '@shared/marking.ts';
import type { Attempt, Material, Question, WrittenGrading } from '@shared/types.ts';

import { AiRequestError, gradeWritten } from '@/lib/ai';
import { useStore } from '@/store/store';
import { useAllMaterials, useQuestionMap } from '@/store/selectors';

/**
 * AI feedback on written answers.
 *
 * Grading is a separate step from submission. An answer is recorded first,
 * as `pending`, and feedback is requested afterwards, so a failed or
 * cancelled request can never lose the answer and can be retried without
 * submitting anything again. Answers are graded one at a time, which keeps a
 * paper with several written questions inside the server's concurrency limit.
 */

function gradeRequest(question: Question, response: string, materials: Material[]): GradeRequest {
  const own = materials.filter((m) => m.courseId === question.courseId);
  const sourceMaterial = question.source
    ? own.find((m) => m.id === question.source!.materialId)
    : undefined;
  const sourcePassage = sourceMaterial?.passages.find(
    (p) => p.id === question.source!.passageId,
  );
  const related = selectPassages({
    courseId: question.courseId,
    materials: own,
    topicIds: [question.topicId],
    query: `${question.prompt} ${question.answer ?? ''}`,
    maxPassages: 4,
    maxChars: 9000,
  });
  const passages = [
    ...(sourceMaterial && sourcePassage ? [toAiPassage(sourceMaterial, sourcePassage)] : []),
    ...related.filter((p) => p.id !== sourcePassage?.id),
  ].slice(0, 4);

  return {
    courseId: question.courseId,
    prompt: [question.prompt, question.extract ? `Extract:\n${question.extract}` : '']
      .filter(Boolean)
      .join('\n\n'),
    modelAnswer: question.answer ?? question.explanation,
    rubric: rubricFor(question).map((r) => ({ id: r.id, label: r.label, marks: r.marks })),
    passages,
    response,
  };
}

/** Requests feedback for one answer. Resolves with a graded record. */
export async function gradeAnswer(
  question: Question,
  response: string,
  materials: Material[],
  signal?: AbortSignal,
): Promise<WrittenGrading> {
  const result = await gradeWritten(gradeRequest(question, response, materials), signal);
  const rubric = rubricFor(question);
  return {
    method: 'ai',
    status: 'graded',
    model: result.usage.model,
    gradedAt: new Date().toISOString(),
    summary: result.summary,
    points: result.points.map((p) => ({
      rubricId: p.rubricId,
      awarded: p.awarded,
      max: rubric.find((r) => r.id === p.rubricId)?.marks ?? 0,
      feedback: p.feedback,
    })),
  };
}

export function failedGrading(error: unknown): WrittenGrading {
  return {
    method: 'ai',
    status: 'failed',
    error:
      error instanceof AiRequestError
        ? error.message
        : 'Feedback could not be fetched.',
  };
}

/**
 * Grades an attempt's waiting written answers, one by one, into the store.
 *
 * `autoStart` runs once, for the page a student lands on straight after
 * submitting. Anywhere else, and after any failure, grading waits for the
 * student to ask, so a broken configuration never turns into a loop of
 * billable requests.
 */
export function useAttemptGrading(attempt: Attempt | undefined, autoStart: boolean) {
  const { dispatch } = useStore();
  const questionMap = useQuestionMap();
  const materials = useAllMaterials();
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const started = useRef(false);

  const waiting = attempt
    ? attempt.questions
        .map((qa, index) => ({ qa, index }))
        .filter(({ qa }) => qa.outcome === 'pending')
    : [];

  const gradeAll = useCallback(async () => {
    if (!attempt || running) return;
    const controller = new AbortController();
    controllerRef.current = controller;
    setRunning(true);
    setError(null);
    try {
      for (const { qa, index } of attempt.questions
        .map((qa, index) => ({ qa, index }))
        .filter(({ qa }) => qa.outcome === 'pending')) {
        const question = questionMap.get(qa.questionId);
        const text = qa.response.kind === 'text' ? qa.response.text : '';
        if (!question || question.courseId !== attempt.courseId) continue;
        try {
          const grading = await gradeAnswer(question, text, materials, controller.signal);
          dispatch({
            type: 'update-attempt-question',
            attemptId: attempt.id,
            index,
            questionAttempt: applyGrading(question, qa, grading),
          });
        } catch (e) {
          dispatch({
            type: 'update-attempt-question',
            attemptId: attempt.id,
            index,
            questionAttempt: { ...qa, grading: failedGrading(e) },
          });
          setError(
            e instanceof AiRequestError && e.code === 'cancelled'
              ? 'Feedback was stopped. Your answers are kept.'
              : `${e instanceof AiRequestError ? e.message : 'Feedback could not be fetched.'} Your answers are kept, and you can try again.`,
          );
          break;
        }
      }
    } finally {
      controllerRef.current = null;
      setRunning(false);
    }
  }, [attempt, running, questionMap, materials, dispatch]);

  useEffect(() => {
    if (!autoStart || started.current || !attempt) return;
    started.current = true;
    if (attempt.questions.some((qa) => qa.outcome === 'pending' && qa.grading?.status === 'pending')) {
      void gradeAll();
    }
  }, [autoStart, attempt, gradeAll]);

  /* Leaving the page stops grading. The check is deferred because React's
     development remount runs this cleanup and then mounts again at once,
     and that must not cancel the request the auto start has just made. */
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      setTimeout(() => {
        if (!mounted.current) controllerRef.current?.abort();
      }, 0);
    };
  }, []);

  return {
    waiting: waiting.length,
    running,
    error,
    gradeAll,
    cancel: () => controllerRef.current?.abort(),
  };
}
