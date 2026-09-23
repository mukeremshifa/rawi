import { useMemo } from 'react';

import type {
  ActivityEvent,
  ActivityType,
  Attempt,
  Difficulty,
  ExamConfig,
  Material,
  Passage,
  PlannedAssessment,
  PlannedSession,
  PracticeAttemptState,
  Question,
  QuestionFormat,
  SavedPracticeSet,
  SourceRef,
  StreakSummary,
  Suggestion,
  Topic,
  TopicEvidence,
  TutorSession,
} from '@shared/types.ts';
import {
  activityEvents,
  buildPlan,
  deriveAllEvidence,
  dueReviews,
  recurringMistakes,
  streak,
  upcomingAssessments,
} from '@shared/progress.ts';
import { localISO } from '@shared/planner.ts';

import { useAppState } from './store.tsx';
import { useCourseOrNull } from './course-context.tsx';

/**
 * Derived reads over the store.
 *
 * ── Scoped and global reads, and why both are explicit ───────────────────
 *
 * Every read here comes in two flavours. `useTopics()` returns the *current
 * course's* topics; `useAllTopics()` returns every course's. The scoped one is
 * the default because the course screens vastly outnumber the global ones, and
 * a screen that forgets to filter is the bug the brief specifically warns
 * against — one course's history showing up under another.
 *
 * Making the global read the one with the longer name is the whole safety
 * mechanism: you cannot leak another course's data by *forgetting* something,
 * only by explicitly asking for `useAll…`, which is what the global views do
 * on purpose.
 *
 * Everything is a `useMemo` over state that changes rarely, which keeps the
 * "derive, never store" rule from becoming a performance problem.
 */

/** The id of the course the current screen is inside, if any. */
function useScopeId(): string | null {
  return useCourseOrNull()?.id ?? null;
}

/**
 * Filters a list of course-owned records to the current course.
 *
 * Outside a course scope this returns nothing rather than everything. A global
 * screen that accidentally called a scoped hook would otherwise silently show
 * an aggregate that looks plausible and is wrong; an empty list is a visible
 * mistake, which is the better failure.
 */
function useScoped<T extends { courseId: string }>(rows: T[]): T[] {
  const courseId = useScopeId();
  return useMemo(
    () => (courseId ? rows.filter((r) => r.courseId === courseId) : []),
    [rows, courseId],
  );
}

/* ── Courses ──────────────────────────────────────────────────────────── */

export function useCourses() {
  return useAppState().courses;
}

export function useActiveCourses() {
  const courses = useCourses();
  return useMemo(() => courses.filter((c) => !c.archived), [courses]);
}

export function useCourseById(courseId: string | undefined) {
  const courses = useCourses();
  return useMemo(
    () => (courseId ? courses.find((c) => c.id === courseId) : undefined),
    [courses, courseId],
  );
}

export function useCourseMap() {
  const courses = useCourses();
  return useMemo(() => new Map(courses.map((c) => [c.id, c])), [courses]);
}

/* ── Topics ───────────────────────────────────────────────────────────── */

export function useAllTopics(): Topic[] {
  return useAppState().topics;
}

/** The current course's topics, in outline order. */
export function useTopics(): Topic[] {
  const scoped = useScoped(useAllTopics());
  return useMemo(() => [...scoped].sort((a, b) => a.order - b.order), [scoped]);
}

export function useTopicsOf(courseId: string | undefined): Topic[] {
  const topics = useAllTopics();
  return useMemo(
    () =>
      courseId
        ? topics.filter((t) => t.courseId === courseId).sort((a, b) => a.order - b.order)
        : [],
    [topics, courseId],
  );
}

/** Every topic in every course, for the global views. */
export function useTopicMap(): Map<string, Topic> {
  const topics = useAllTopics();
  return useMemo(() => new Map(topics.map((t) => [t.id, t])), [topics]);
}

export function useTopic(topicId: string | undefined): Topic | undefined {
  const map = useTopicMap();
  return topicId ? map.get(topicId) : undefined;
}

/**
 * The current course's topics grouped by module, in outline order.
 *
 * Topics with no module fall into a final unnamed group rather than being
 * hidden — a half-organised outline is the normal state of one being edited,
 * and dropping the ungrouped topics would make them look deleted.
 */
export function useOutline(): { module: string | null; topics: Topic[] }[] {
  const topics = useTopics();
  return useMemo(() => {
    const groups = new Map<string | null, Topic[]>();
    for (const topic of topics) {
      const key = topic.module?.trim() || null;
      groups.set(key, [...(groups.get(key) ?? []), topic]);
    }
    const named = [...groups.entries()].filter(([k]) => k !== null);
    const unnamed = groups.get(null);
    return [
      ...named.map(([module, rows]) => ({ module, topics: rows })),
      ...(unnamed ? [{ module: null, topics: unnamed }] : []),
    ];
  }, [topics]);
}

/* ── Materials ────────────────────────────────────────────────────────── */

export function useAllMaterials(): Material[] {
  return useAppState().materials;
}

export function useMaterials(): Material[] {
  return useScoped(useAllMaterials());
}

export function useMaterial(materialId: string | undefined): Material | undefined {
  const materials = useAllMaterials();
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
  const materials = useAllMaterials();
  return useMemo(() => {
    if (!ref) return null;
    const material = materials.find((m) => m.id === ref.materialId);
    if (!material) return null;
    const passage = material.passages.find((p) => p.id === ref.passageId);
    if (!passage) return null;
    return { material, passage };
  }, [materials, ref]);
}

/* ── Questions ────────────────────────────────────────────────────────── */

export function useAllQuestions(): Question[] {
  return useAppState().questions;
}

/** The current course's question pool. */
export function useQuestions(): Question[] {
  return useScoped(useAllQuestions());
}

export function useQuestionMap(): Map<string, Question> {
  const questions = useAllQuestions();
  return useMemo(() => new Map(questions.map((q) => [q.id, q])), [questions]);
}

export function useQuestion(questionId: string | undefined): Question | undefined {
  const map = useQuestionMap();
  return questionId ? map.get(questionId) : undefined;
}

/** Topic ids that have at least one authored question, in this course. */
export function useTopicsWithQuestions(): Set<string> {
  const questions = useQuestions();
  return useMemo(() => new Set(questions.map((q) => q.topicId)), [questions]);
}

/* ── Attempts ─────────────────────────────────────────────────────────── */

export function useAllAttempts(): Attempt[] {
  return useAppState().attempts;
}

export function useAttempts(): Attempt[] {
  return useScoped(useAllAttempts());
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
  const attempts = useAllAttempts();
  return useMemo(
    () => (attemptId ? attempts.find((a) => a.id === attemptId) : undefined),
    [attempts, attemptId],
  );
}

/* ── Evidence, reviews, mistakes ──────────────────────────────────────── */

export function useEvidence(): Map<string, TopicEvidence> {
  const topics = useTopics();
  const attempts = useAttempts();
  return useMemo(() => deriveAllEvidence(topics, attempts), [topics, attempts]);
}

export function useEvidenceFor(courseId: string): Map<string, TopicEvidence> {
  const topics = useTopicsOf(courseId);
  const all = useAllAttempts();
  return useMemo(() => {
    const attempts = all.filter((a) => a.courseId === courseId);
    return deriveAllEvidence(topics, attempts);
  }, [topics, all, courseId]);
}

export function useReviews() {
  const topics = useTopics();
  const attempts = useAttempts();
  return useMemo(() => dueReviews(topics, attempts), [topics, attempts]);
}

/** Reviews due across every active course, for the global views. */
export function useAllReviews() {
  const topics = useAllTopics();
  const attempts = useAllAttempts();
  const courses = useActiveCourses();
  return useMemo(() => {
    const active = new Set(courses.map((c) => c.id));
    return dueReviews(
      topics.filter((t) => active.has(t.courseId)),
      attempts,
    );
  }, [topics, attempts, courses]);
}

export function useRecurringMistakes() {
  const attempts = useAttempts();
  const questions = useAllQuestions();
  return useMemo(() => {
    const byId = new Map(questions.map((q) => [q.id, q]));
    return recurringMistakes(attempts, (id) => byId.get(id)?.prompt);
  }, [attempts, questions]);
}

/* ── Assessments ──────────────────────────────────────────────────────── */

export function useAllAssessments(): PlannedAssessment[] {
  return useAppState().assessments;
}

export function useAssessments(): PlannedAssessment[] {
  const scoped = useScoped(useAllAssessments());
  return useMemo(
    () => [...scoped].sort((a, b) => a.date.localeCompare(b.date)),
    [scoped],
  );
}

export function useAssessment(id: string | undefined): PlannedAssessment | undefined {
  const all = useAllAssessments();
  return useMemo(() => (id ? all.find((a) => a.id === id) : undefined), [all, id]);
}

/** Upcoming assessments across every active course, soonest first. */
export function useUpcomingAssessments(limit?: number): PlannedAssessment[] {
  const all = useAllAssessments();
  const courses = useActiveCourses();
  return useMemo(() => {
    const active = new Set(courses.map((c) => c.id));
    const rows = upcomingAssessments(all.filter((a) => active.has(a.courseId)));
    return limit ? rows.slice(0, limit) : rows;
  }, [all, courses, limit]);
}

/* ── Planner ──────────────────────────────────────────────────────────── */

export function useAvailability() {
  return useAppState().availability;
}

export function useAllSessions(): PlannedSession[] {
  return useAppState().sessions;
}

export function useSessions(): PlannedSession[] {
  return useScoped(useAllSessions());
}

export function useSession(id: string | undefined): PlannedSession | undefined {
  const all = useAllSessions();
  return useMemo(() => (id ? all.find((s) => s.id === id) : undefined), [all, id]);
}

/** Sessions on a given local date, across every course, earliest first. */
export function useSessionsOn(date: string): PlannedSession[] {
  const all = useAllSessions();
  return useMemo(
    () =>
      all
        .filter((s) => s.date === date)
        .sort((a, b) => a.startMinutes - b.startMinutes),
    [all, date],
  );
}

/** Planned sessions whose date has passed without being completed or skipped. */
export function useOverdueSessions(): PlannedSession[] {
  const all = useAllSessions();
  return useMemo(() => {
    const today = localISO(new Date());
    return all
      .filter((s) => s.status === 'planned' && s.date < today)
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [all]);
}

/* ── Practice ─────────────────────────────────────────────────────────── */

export function useAllPracticeSets(): SavedPracticeSet[] {
  return useAppState().savedPractice;
}

export function usePracticeSets(): SavedPracticeSet[] {
  const scoped = useScoped(useAllPracticeSets());
  return useMemo(
    () => [...scoped].sort((a, b) => (a.savedAt < b.savedAt ? 1 : -1)),
    [scoped],
  );
}

export function usePracticeSet(setId: string | undefined): SavedPracticeSet | undefined {
  const all = useAllPracticeSets();
  return useMemo(() => (setId ? all.find((s) => s.id === setId) : undefined), [all, setId]);
}

export function useAllPracticeRuns(): PracticeAttemptState[] {
  return useAppState().practiceRuns;
}

export function usePracticeRun(runId: string | undefined): PracticeAttemptState | undefined {
  const all = useAllPracticeRuns();
  return useMemo(() => (runId ? all.find((r) => r.id === runId) : undefined), [all, runId]);
}

/** The unfinished run for a set, if there is one. Drives every Resume action. */
export function useOpenRunForSet(setId: string | undefined): PracticeAttemptState | undefined {
  const all = useAllPracticeRuns();
  return useMemo(
    () => (setId ? all.find((r) => r.setId === setId) : undefined),
    [all, setId],
  );
}

/** Unfinished practice runs in the current course. */
export function useOpenPracticeRuns(): PracticeAttemptState[] {
  return useScoped(useAllPracticeRuns());
}

/* ── Exams ────────────────────────────────────────────────────────────── */

export function useAllExamConfigs(): ExamConfig[] {
  return useAppState().examConfigs;
}

export function useExamConfigs(): ExamConfig[] {
  return useScoped(useAllExamConfigs());
}

export function useExamConfig(configId: string | undefined): ExamConfig | undefined {
  const all = useAllExamConfigs();
  return useMemo(
    () => (configId ? all.find((c) => c.id === configId) : undefined),
    [all, configId],
  );
}

/* ── Tutor ────────────────────────────────────────────────────────────── */

export function useAllTutorSessions(): TutorSession[] {
  return useAppState().tutorSessions;
}

export function useTutorSessions(): TutorSession[] {
  return useScoped(useAllTutorSessions());
}

/** The tutor session a resume action should open, in this course. */
export function useOpenTutorSession() {
  const sessions = useTutorSessions();
  return useMemo(
    () =>
      [...sessions]
        .filter((s) => !s.endedAt)
        .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))[0],
    [sessions],
  );
}

export function useTutorSession(sessionId: string | undefined) {
  const sessions = useAllTutorSessions();
  return useMemo(
    () => (sessionId ? sessions.find((s) => s.id === sessionId) : undefined),
    [sessions, sessionId],
  );
}

/* ── Activity, history and streak ─────────────────────────────────────── */

/** Every qualifying study event, newest first, across every course. */
export function useActivity(): ActivityEvent[] {
  const attempts = useAllAttempts();
  const tutorSessions = useAllTutorSessions();
  return useMemo(
    () => activityEvents(attempts, tutorSessions),
    [attempts, tutorSessions],
  );
}

export function useStreak(): StreakSummary {
  const events = useActivity();
  return useMemo(() => streak(events), [events]);
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
   * Spread across formats *and* topics.
   *
   * ── Why format is the outer loop ──────────────────────────────────────────
   *
   * Round-robin by topic alone produced a six-question "quiz" that was six
   * multiple-choice questions — each topic's first quiz-format question happens
   * to be multiple-choice, so taking index 0 from every topic takes six of them.
   * The set was correctly spread across the course and looked like one format,
   * which is not what a mixed quiz means.
   *
   * Interleaving formats *inside* each topic was the first fix and it was not
   * enough: with six topics and a limit of six, the outer topic loop still only
   * ever reaches index 0 of each list, so every question still comes from
   * whichever format happens to sort first.
   *
   * So the round-robin runs over **formats** at the outer level, and picks the
   * next topic that still has a question of that format underneath it. A
   * six-question set now genuinely spans the formats the pool holds, and topic
   * spread is preserved by the inner rotation rather than by the outer one.
   */
  const byFormat = new Map<QuestionFormat, Question[]>();
  for (const q of matches) {
    byFormat.set(q.format, [...(byFormat.get(q.format) ?? []), q]);
  }

  /** Reorders one format's questions so consecutive picks differ in topic. */
  const spreadTopics = (questions: Question[]): Question[] => {
    const byTopic = new Map<string, Question[]>();
    for (const q of questions) {
      byTopic.set(q.topicId, [...(byTopic.get(q.topicId) ?? []), q]);
    }
    const lists = [...byTopic.values()];
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

  const lists = [...byFormat.values()].map(spreadTopics);

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

/**
 * Which question formats each practice activity draws on.
 *
 * Shared rather than owned by the setup screen, because two places now resolve
 * a `PracticeConfig` into questions: generation, and the recovery that repairs
 * a saved set which stored only its settings. They have to agree, or a
 * recovered set is a different set from the one the student generated.
 */
export const ACTIVITY_FORMATS: Record<ActivityType, QuestionFormat[]> = {
  flashcards: ['flashcard'],
  quiz: ['multiple-choice', 'multiple-select', 'matching', 'ordering', 'fill-blank'],
  'written-recall': ['written-recall'],
  'source-analysis': ['source-analysis'],
  essay: ['essay'],
};

/**
 * The questions a saved set's configuration resolves to.
 *
 * `pool` must already be that set's own course, which is what stops a recovery
 * attaching another subject's questions to a history set.
 */
export function resolveSetQuestions(
  set: SavedPracticeSet,
  pool: Question[],
): Question[] {
  return selectQuestions(
    pool,
    {
      formats: ACTIVITY_FORMATS[set.config.activity],
      ...(set.config.topicIds.length ? { topicIds: set.config.topicIds } : {}),
      ...(set.config.difficulties.length
        ? { difficulties: set.config.difficulties }
        : {}),
      ...(set.config.materialIds.length
        ? { materialIds: set.config.materialIds }
        : {}),
    },
    set.config.length || undefined,
  );
}

/** How many questions match a filter — the number the setup UI clamps to. */
export function countAvailable(pool: Question[], filter: QuestionFilter): number {
  return selectQuestions(pool, filter).length;
}

/* ── The plan ─────────────────────────────────────────────────────────── */

/**
 * Today's suggested work across every course.
 *
 * Global rather than course-scoped, because "what should I do now" is a
 * question about the student's day rather than about one subject. Each
 * suggestion carries its `courseId` so the UI can label and route it.
 */
export function usePlan(): Suggestion[] {
  const state = useAppState();
  return useMemo(() => {
    if (state.courses.length === 0) return [];

    const today = localISO(new Date());

    const openSession = [...state.tutorSessions]
      .filter((s) => !s.endedAt)
      .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))[0];

    const openRun = [...state.practiceRuns].sort((a, b) =>
      a.updatedAt < b.updatedAt ? 1 : -1,
    )[0];

    const resumable = state.activeExam
      ? {
          courseId: state.activeExam.courseId,
          title: `Resume ${state.activeExam.configSnapshot.name}`,
          to: `/course/${state.activeExam.courseId}/exams/run`,
          kind: 'exam' as const,
        }
      : openRun
        ? {
            courseId: openRun.courseId,
            title: 'Resume your practice set',
            to: `/course/${openRun.courseId}/practice/run/${openRun.id}`,
            kind: 'practice' as const,
          }
        : openSession
          ? {
              courseId: openSession.courseId,
              title: 'Resume your tutor session',
              to: `/course/${openSession.courseId}/tutor/${openSession.id}`,
              kind: 'tutor' as const,
            }
          : undefined;

    return buildPlan({
      courses: state.courses,
      topics: state.topics,
      attempts: state.attempts,
      assessments: state.assessments,
      checkIns: state.checkIns,
      todaysSessions: state.sessions.filter((s) => s.date === today),
      questions: state.questions,
      materials: state.materials,
      ...(resumable ? { resumable } : {}),
    });
  }, [state]);
}
