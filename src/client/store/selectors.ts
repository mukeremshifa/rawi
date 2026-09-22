import { useMemo } from 'react';

import type {
  Attempt,
  Difficulty,
  Material,
  Passage,
  Question,
  QuestionFormat,
  SourceRef,
  Suggestion,
  Topic,
  TopicEvidence,
} from '@shared/types.ts';
import {
  buildPlan,
  deriveAllEvidence,
  dueReviews,
  recurringMistakes,
} from '@shared/progress.ts';

import { useAppState } from './store.tsx';

/**
 * Derived reads over the store.
 *
 * Everything here is a `useMemo` over state that changes rarely, which keeps
 * the "derive, never store" rule from becoming a performance problem. The
 * dependency arrays are on the specific slices rather than on the whole state
 * object, so recording a practice attempt does not recompute the material
 * index.
 */

export function useTopics(): Topic[] {
  return useAppState().topics;
}

export function useTopicMap(): Map<string, Topic> {
  const topics = useTopics();
  return useMemo(() => new Map(topics.map((t) => [t.id, t])), [topics]);
}

export function useTopic(topicId: string | undefined): Topic | undefined {
  const map = useTopicMap();
  return topicId ? map.get(topicId) : undefined;
}

export function useMaterials(): Material[] {
  return useAppState().materials;
}

export function useMaterial(materialId: string | undefined): Material | undefined {
  const materials = useMaterials();
  return useMemo(
    () => (materialId ? materials.find((m) => m.id === materialId) : undefined),
    [materials, materialId],
  );
}

/** Resolves a source reference to the material and passage it names. */
export function useSource(ref: SourceRef | undefined): {
  material: Material;
  passage: Passage;
} | null {
  const materials = useMaterials();
  return useMemo(() => {
    if (!ref) return null;
    const material = materials.find((m) => m.id === ref.materialId);
    if (!material) return null;
    const passage = material.passages.find((p) => p.id === ref.passageId);
    if (!passage) return null;
    return { material, passage };
  }, [materials, ref]);
}

export function useQuestions(): Question[] {
  return useAppState().questions;
}

export function useQuestionMap(): Map<string, Question> {
  const questions = useQuestions();
  return useMemo(() => new Map(questions.map((q) => [q.id, q])), [questions]);
}

export function useQuestion(questionId: string | undefined): Question | undefined {
  const map = useQuestionMap();
  return questionId ? map.get(questionId) : undefined;
}

export function useAttempts(): Attempt[] {
  return useAppState().attempts;
}

/** Newest first, which is the order every history list wants. */
export function useRecentAttempts(limit?: number): Attempt[] {
  const attempts = useAttempts();
  return useMemo(() => {
    const sorted = [...attempts]
      .filter((a) => a.completedAt)
      .sort((a, b) => (a.completedAt! < b.completedAt! ? 1 : -1));
    return limit ? sorted.slice(0, limit) : sorted;
  }, [attempts, limit]);
}

export function useAttempt(attemptId: string | undefined): Attempt | undefined {
  const attempts = useAttempts();
  return useMemo(
    () => (attemptId ? attempts.find((a) => a.id === attemptId) : undefined),
    [attempts, attemptId],
  );
}

export function useEvidence(): Map<string, TopicEvidence> {
  const { topics, attempts } = useAppState();
  return useMemo(() => deriveAllEvidence(topics, attempts), [topics, attempts]);
}

export function useReviews() {
  const { topics, attempts } = useAppState();
  return useMemo(() => dueReviews(topics, attempts), [topics, attempts]);
}

export function useRecurringMistakes() {
  const { attempts, questions } = useAppState();
  return useMemo(() => {
    const byId = new Map(questions.map((q) => [q.id, q]));
    return recurringMistakes(attempts, (id) => byId.get(id)?.prompt);
  }, [attempts, questions]);
}

/* ── Question selection ───────────────────────────────────────────────── */

export interface QuestionFilter {
  topicIds?: string[];
  formats?: QuestionFormat[];
  difficulties?: Difficulty[];
  /** Restricts to questions citing one of these materials. */
  materialIds?: string[];
  /** Excludes these ids — used to avoid repeating a question inside one paper. */
  exclude?: string[];
}

/**
 * The one place questions are chosen, so every surface honours the same rules.
 *
 * ── Why the ordering is deterministic ─────────────────────────────────────
 *
 * Questions come back in a stable order rather than shuffled. Two reasons: an
 * exam's question list is resolved once at start and stored on the run, so a
 * reload must produce the same paper; and a student retrying a set expects the
 * same set. Where variety genuinely matters — a second attempt at the same
 * topic — `exclude` is the mechanism, which is honest about what it is doing in
 * a way that a random shuffle is not.
 */
export function selectQuestions(
  pool: Question[],
  filter: QuestionFilter,
  limit?: number,
): Question[] {
  const excluded = new Set(filter.exclude ?? []);
  const topics = filter.topicIds?.length ? new Set(filter.topicIds) : null;
  const formats = filter.formats?.length ? new Set(filter.formats) : null;
  const difficulties = filter.difficulties?.length
    ? new Set(filter.difficulties)
    : null;
  const materials = filter.materialIds?.length ? new Set(filter.materialIds) : null;

  const matches = pool.filter((q) => {
    if (excluded.has(q.id)) return false;
    if (topics && !topics.has(q.topicId)) return false;
    if (formats && !formats.has(q.format)) return false;
    if (difficulties && !difficulties.has(q.difficulty)) return false;
    if (materials && !(q.source && materials.has(q.source.materialId))) return false;
    return true;
  });

  if (!limit) return matches;

  /*
   * Spread across topics *and* formats.
   *
   * ── Why both, and why format second ───────────────────────────────────────
   *
   * Round-robin by topic alone was the first version, and it produced a
   * six-question "quiz" that was six multiple-choice questions — because each
   * topic's first quiz-format question happens to be multiple-choice, and
   * taking index 0 from every topic takes six of them. The set was correctly
   * spread across the course and looked like one format, which is not what a
   * mixed quiz means.
   *
   * So each topic's questions are interleaved by format first, then the topics
   * are round-robined. Topic spread stays the outer guarantee — it is the one
   * a student notices, since a set that skips their weak topic is a worse
   * failure than one that repeats a format — and format variety rides along
   * inside it.
   */
  const byTopic = new Map<string, Question[]>();
  for (const q of matches) {
    const list = byTopic.get(q.topicId) ?? [];
    list.push(q);
    byTopic.set(q.topicId, list);
  }

  /** Reorders one topic's questions so consecutive picks differ in format. */
  const interleaveFormats = (questions: Question[]): Question[] => {
    const byFormat = new Map<QuestionFormat, Question[]>();
    for (const q of questions) {
      const list = byFormat.get(q.format) ?? [];
      list.push(q);
      byFormat.set(q.format, list);
    }
    const lists = [...byFormat.values()];
    const out: Question[] = [];
    for (let i = 0; out.length < questions.length; i += 1) {
      let added = false;
      for (const list of lists) {
        const item = list[i];
        if (item) {
          out.push(item);
          added = true;
        }
      }
      if (!added) break;
    }
    return out;
  };

  const lists = [...byTopic.values()].map(interleaveFormats);

  const out: Question[] = [];
  let index = 0;
  while (out.length < limit) {
    let added = false;
    for (const list of lists) {
      const item = list[index];
      if (item) {
        out.push(item);
        added = true;
        if (out.length === limit) break;
      }
    }
    if (!added) break;
    index += 1;
  }
  return out;
}

/** How many questions match a filter — the number the setup UI clamps to. */
export function countAvailable(pool: Question[], filter: QuestionFilter): number {
  return selectQuestions(pool, filter).length;
}

/* ── The plan ─────────────────────────────────────────────────────────── */

export function usePlan(): Suggestion[] {
  const state = useAppState();
  return useMemo(() => {
    if (!state.course) return [];

    const topicsWithQuestions = new Set(state.questions.map((q) => q.topicId));

    // An unfinished exam outranks everything; an unfinished tutor session is
    // the next best thing to resume.
    const openSession = [...state.tutorSessions]
      .filter((s) => !s.endedAt)
      .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))[0];

    const resumable = state.activeExam
      ? {
          title: `Resume ${state.activeExam.configSnapshot.name}`,
          to: '/exams/run',
          kind: 'exam' as const,
        }
      : openSession
        ? {
            title: 'Resume your tutor session',
            to: `/tutor/${openSession.id}`,
            kind: 'tutor' as const,
          }
        : undefined;

    return buildPlan({
      course: state.course,
      topics: state.topics,
      attempts: state.attempts,
      checkIns: state.checkIns,
      topicsWithQuestions,
      hasMaterials: state.materials.length > 0,
      ...(resumable ? { resumable } : {}),
    });
  }, [state]);
}

/** The tutor session a resume action should open, if any. */
export function useOpenTutorSession() {
  const { tutorSessions } = useAppState();
  return useMemo(
    () =>
      [...tutorSessions]
        .filter((s) => !s.endedAt)
        .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))[0],
    [tutorSessions],
  );
}

export function useTutorSession(sessionId: string | undefined) {
  const { tutorSessions } = useAppState();
  return useMemo(
    () => (sessionId ? tutorSessions.find((s) => s.id === sessionId) : undefined),
    [tutorSessions, sessionId],
  );
}
