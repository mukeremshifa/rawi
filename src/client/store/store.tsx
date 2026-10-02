import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import type {
  Attempt,
  Availability,
  AvailabilityException,
  CheckIn,
  Course,
  ExamConfig,
  ExamRun,
  Material,
  PlannedAssessment,
  PlannedSession,
  PracticeAttemptState,
  Question,
  SavedPracticeSet,
  Topic,
  QuestionAttempt,
  TutorMessage,
  TutorSession,
  TutorStage,
  WrittenGrading,
} from '@shared/types.ts';
import { attemptTotals } from '@shared/marking.ts';
import { SEED_COURSE, SEED_TOPICS, ATLANTIC_COURSE_ID } from '@shared/course/topics.ts';
import { SEED_MATERIALS } from '@shared/course/materials.ts';
import { SEED_QUESTIONS } from '@shared/course/questions.ts';
import { SEED_ATTEMPTS, SEED_EXAM_PRESETS } from '@shared/course/history.ts';
import {
  STATS_COURSE,
  STATS_COURSE_ID,
  STATS_MATERIALS,
  STATS_QUESTIONS,
  STATS_TOPICS,
} from '@shared/course/stats.ts';
import {
  SEED_ASSESSMENTS,
  SEED_AVAILABILITY,
  seedSessions,
  statsAttempts,
} from '@shared/course/planning.ts';

/**
 * The whole prototype's state, in one store.
 *
 * ── The shape, and what changed at this checkpoint ────────────────────────
 *
 * The tree used to hold one course inline: `course`, `topics`, `materials`.
 * It now holds a list of courses and course-owned records that each carry a
 * `courseId`, plus a layer of genuinely student-wide records — assessments,
 * availability, planner sessions, check-ins — that belong to the student
 * rather than to any one course.
 *
 * Records stay in flat arrays rather than being nested under their course.
 * Nesting reads better in a debugger and is worse for everything else here:
 * the global views (Home, Planner, history) are all cross-course reads, and
 * nesting turns each of them into a flatMap over courses before the real work
 * starts. Flat arrays with a `courseId` make the global read trivial and the
 * scoped read a filter, and the filter is what the selectors provide so no
 * screen writes it by hand.
 *
 * `activeCourseId` is the course the UI is currently inside. It is persisted,
 * so a reload returns to the same course, and route params override it so a
 * deep link into another course's page switches context rather than showing
 * one course's URL with another course's content.
 *
 * ── Persistence and migration ────────────────────────────────────────────
 *
 * The tree is written to `localStorage` on change. Restore is defensive and,
 * from this checkpoint, *migrating* rather than merely validating: a v1 tree
 * written by the previous build is upgraded in place — its course gains an id
 * and a description, its records gain that course id, its single exam date
 * becomes a planned assessment, and its daily-minutes preference seeds the
 * planner's availability. Only a tree that cannot be understood at all falls
 * back, and it falls back to a *choice* rather than a silent wipe, which is
 * what `restoreProblem` carries to the UI.
 */

const STORAGE_KEY = 'rawi.state.v1';
const STORAGE_VERSION = 2;
let saveFailed = false;
export const localSaveFailed = () => saveFailed;

/** A tree that could not be restored, kept so the student can decide. */
export interface RestoreProblem {
  reason: string;
  /** The raw JSON, offered as a download rather than thrown away. */
  raw: string;
}

export interface WorkspacePreferences {
  displayName: string;
  workspaceName: string;
  accent: string;
  questionCount: number;
  hints: boolean;
  feedback: 'immediate' | 'end';
  readingSize: 'normal' | 'large' | 'larger';
  motion: 'system' | 'reduced' | 'full';
  theme: 'system' | 'light' | 'dark';
  reminders: { assessments: boolean; study: boolean; review: boolean; days: number };
}
export const DEFAULT_PREFERENCES: WorkspacePreferences = {
  displayName: '', workspaceName: 'My workspace', accent: 'indigo',
  questionCount: 6, hints: true, feedback: 'immediate', readingSize: 'normal', motion: 'system', theme: 'system',
  reminders: { assessments: true, study: true, review: false, days: 1 },
};

export interface AppState {
  version: number;
  onboarded: boolean;
  preferences: WorkspacePreferences;
  drafts: Record<string, unknown>;
  reminderState: Record<string, 'read' | 'dismissed'>;
  courses: Course[];
  /** The course the UI is inside. Null on the student-wide screens. */
  activeCourseId: string | null;
  topics: Topic[];
  retiredTopics?: Topic[];
  materials: Material[];
  /** Authored pool plus nothing else; the prototype does not generate questions. */
  questions: Question[];
  attempts: Attempt[];
  tutorSessions: TutorSession[];
  savedPractice: SavedPracticeSet[];
  /** Unfinished practice runs, keyed by their own id. */
  practiceRuns: PracticeAttemptState[];
  examConfigs: ExamConfig[];
  /** The exam currently being sat, if any. One at a time, deliberately. */
  activeExam: ExamRun | null;
  assessments: PlannedAssessment[];
  availability: Availability;
  sessions: PlannedSession[];
  checkIns: CheckIn[];
  /** True when this tree came from the seed rather than from setup. */
  seeded: boolean;
  /** Set when a stored tree could not be restored. Cleared once handled. */
  restoreProblem?: RestoreProblem;
  /**
   * Something the upgrade could not carry forward but did not want to throw
   * away. Holds an explanation and the original JSON, downloadable exactly as
   * `restoreProblem` is. Cleared once the student has seen it.
   */
  carriedForward?: RestoreProblem;
}

/**
 * Every question this build ships, across the two fictional sample courses.
 *
 * One list, used in three places: the fresh seed, the restore path that
 * refreshes the authored pool, and the v1 migration that resolves saved sets
 * against it. Defining it once is what keeps those three from disagreeing
 * about what counts as an authored question.
 *
 * Questions that are not in this list are user data and are restored exactly
 * as stored. That includes generated questions and the questions of the CENG
 * 401 course an earlier build seeded: that course is no longer shipped, but a
 * workspace that already holds it keeps every record of it.
 */
const AUTHORED_QUESTIONS: Question[] = [...SEED_QUESTIONS, ...STATS_QUESTIONS];

function seedState(): AppState {
  return {
    version: STORAGE_VERSION,
    onboarded: true,
    preferences: DEFAULT_PREFERENCES,
    drafts: {},
    reminderState: {},
    courses: [SEED_COURSE, STATS_COURSE],
    activeCourseId: null,
    topics: [...SEED_TOPICS, ...STATS_TOPICS],
    materials: [...SEED_MATERIALS, ...STATS_MATERIALS],
    questions: AUTHORED_QUESTIONS,
    attempts: [...SEED_ATTEMPTS, ...statsAttempts()],
    tutorSessions: [],
    savedPractice: [
      {
        id: 'saved-1',
        courseId: ATLANTIC_COURSE_ID,
        name: 'Comparison drill',
        savedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 4).toISOString(),
        /* Resolved here rather than left empty. A saved set *is* its
           questions: a set that carries only a configuration cannot be
           started, and two attempts at it would not be comparable. */
        questionIds: [
          'q-enc-mc-2',
          'q-deb-mc-1',
          'q-deb-ord-1',
          'q-enc-match-1',
          'q-deb-match-1',
        ],
        config: {
          activity: 'quiz',
          topicIds: ['topic-debate', 'topic-encomienda'],
          materialIds: [],
          length: 6,
          difficulties: ['reasoning', 'stretch'],
          hintsAllowed: true,
          feedback: 'immediate',
        },
      },
      {
        id: 'set-stat-intervals',
        courseId: STATS_COURSE_ID,
        name: 'Problem set: confidence intervals',
        savedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 3).toISOString(),
        questionIds: ['q-stat-int-mc-1', 'q-stat-int-order-1', 'q-stat-int-ms-1'],
        config: {
          activity: 'quiz',
          topicIds: ['stat-intervals'],
          materialIds: [],
          length: 3,
          difficulties: ['reasoning', 'stretch'],
          hintsAllowed: true,
          feedback: 'immediate',
        },
      },
    ],
    practiceRuns: [],
    examConfigs: SEED_EXAM_PRESETS,
    activeExam: null,
    assessments: SEED_ASSESSMENTS,
    availability: SEED_AVAILABILITY,
    sessions: seedSessions(),
    checkIns: [],
    seeded: true,
  };
}

/**
 * An empty tree, for the first-run flow.
 *
 * The authored question bank stays — it is code, not user data, and a student
 * who creates their own course simply has no topics that point into it. What
 * goes is everything that represents *activity*.
 */
function emptyState(): AppState {
  return {
    ...seedState(),
    courses: [],
    activeCourseId: null,
    topics: [],
    materials: [],
    attempts: [],
    savedPractice: [],
    practiceRuns: [],
    examConfigs: [],
    assessments: [],
    sessions: [],
    availability: { ...SEED_AVAILABILITY, windows: [], exceptions: [] },
    checkIns: [],
    seeded: false,
  };
}

/* ── Actions ──────────────────────────────────────────────────────────── */

export type Action =
  | { type: 'replace-workspace'; state: AppState }
  | { type: 'preferences'; patch: Partial<WorkspacePreferences> }
  | { type: 'draft'; key: string; value: unknown }
  | { type: 'clear-draft'; prefix: string }
  | { type: 'reminder'; key: string; value: 'read' | 'dismissed' }
  | { type: 'reset-demo' }
  | { type: 'start-fresh' }
  | { type: 'dismiss-restore-problem' }
  | { type: 'dismiss-carried-forward' }
  | { type: 'set-active-course'; courseId: string | null }
  | { type: 'create-course'; course: Course; topics: Topic[] }
  | { type: 'update-course'; courseId: string; patch: Partial<Course> }
  | { type: 'remove-course'; courseId: string }
  /** Replaces a course's whole outline — the syllabus/outline editor's commit. */
  | { type: 'set-topics'; courseId: string; topics: Topic[] }
  | { type: 'update-topic'; topicId: string; patch: Partial<Topic> }
  | { type: 'add-topic'; topic: Topic }
  | { type: 'remove-topic'; topicId: string }
  | { type: 'add-material'; material: Material }
  | { type: 'update-material'; materialId: string; patch: Partial<Material> }
  | { type: 'remove-material'; materialId: string }
  | { type: 'record-attempt'; attempt: Attempt }
  | { type: 'upsert-tutor-session'; session: TutorSession }
  /** Appends turns to the stored session, so a slow reply never overwrites newer state. */
  | {
      type: 'append-tutor-messages';
      sessionId: string;
      messages: TutorMessage[];
      stage?: TutorStage;
    }
  /** Generated questions and the set made of them, saved together or not at all. */
  | { type: 'save-generated-set'; questions: Question[]; set: SavedPracticeSet }
  /** Replaces one answer record inside a recorded attempt, and recomputes its totals. */
  | {
      type: 'update-attempt-question';
      attemptId: string;
      index: number;
      questionAttempt: QuestionAttempt;
    }
  | { type: 'save-practice'; set: SavedPracticeSet }
  | { type: 'remove-practice'; setId: string }
  | { type: 'upsert-practice-run'; run: PracticeAttemptState }
  | { type: 'remove-practice-run'; runId: string }
  /** Records feedback for one answer on the latest copy of a run. */
  | {
      type: 'set-practice-grading';
      runId: string;
      questionId: string;
      grading: WrittenGrading;
    }
  | { type: 'save-exam-config'; config: ExamConfig }
  | { type: 'remove-exam-config'; configId: string }
  | { type: 'set-active-exam'; run: ExamRun | null }
  | { type: 'save-assessment'; assessment: PlannedAssessment }
  | { type: 'remove-assessment'; assessmentId: string }
  | { type: 'set-availability'; availability: Availability }
  | { type: 'set-availability-exception'; exception: AvailabilityException }
  | { type: 'remove-availability-exception'; exceptionId: string }
  | { type: 'save-session'; session: PlannedSession }
  | { type: 'save-sessions'; sessions: PlannedSession[] }
  | { type: 'remove-session'; sessionId: string }
  | { type: 'add-check-in'; checkIn: CheckIn };

/**
 * Completes the planner session an attempt was doing, exactly once.
 *
 * ── Why this lives in the reducer ─────────────────────────────────────────
 *
 * The brief requires that completing a linked activity completes its session
 * once, and that unrelated activity completes nothing. Both are properties of
 * the *transition*, not of any screen, so doing it here means every path that
 * records an attempt — practice, exam, a resumed run — gets it, and no path can
 * forget. The `status === 'planned'` guard is what makes it once: a session
 * that is already complete is left exactly as it was, so re-submitting cannot
 * move the completion date or double-count toward a streak.
 */
function completeLinkedSession(
  sessions: PlannedSession[],
  sessionId: string | undefined,
  attemptId: string,
  at: string,
  /**
   * The course the work belonged to. A link that names a session in another
   * course is stale navigation state rather than a real link, and completing
   * it would tick off a task the student did not do.
   */
  courseId?: string,
): PlannedSession[] {
  if (!sessionId) return sessions;

  const target = sessions.find((s) => s.id === sessionId);
  /* A deleted session, an already-finished one, or one belonging to another
     course: all three complete nothing, silently. The attempt itself is
     recorded either way, so no work is lost by declining the link. */
  if (!target) return sessions;
  if (target.status !== 'planned') return sessions;
  if (courseId && target.courseId !== courseId) return sessions;

  return sessions.map((s) =>
    s.id === sessionId
      ? { ...s, status: 'completed' as const, completedAt: at, completedBy: attemptId }
      : s,
  );
}

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'replace-workspace': return action.state;
    case 'preferences': return { ...state, preferences: { ...state.preferences, ...action.patch } };
    case 'draft': return { ...state, drafts: { ...state.drafts, [action.key]: action.value } };
    case 'clear-draft': return { ...state, drafts: Object.fromEntries(Object.entries(state.drafts).filter(([key]) => !key.startsWith(action.prefix))) };
    case 'reminder': return { ...state, reminderState: { ...state.reminderState, [action.key]: action.value } };
    case 'reset-demo':
      return seedState();

    case 'start-fresh':
      return emptyState();

    case 'dismiss-restore-problem': {
      const { restoreProblem: _dropped, ...rest } = state;
      return rest;
    }

    case 'dismiss-carried-forward': {
      const { carriedForward: _dropped, ...rest } = state;
      return rest;
    }

    case 'set-active-course':
      return { ...state, activeCourseId: action.courseId };

    case 'create-course':
      return {
        ...state,
        courses: [...state.courses, action.course],
        topics: [...state.topics, ...action.topics],
        activeCourseId: action.course.id,
        seeded: false,
      };

    case 'update-course':
      return {
        ...state,
        courses: state.courses.map((c) =>
          c.id === action.courseId ? { ...c, ...action.patch } : c,
        ),
      };

    /*
     * Removing a course takes its records with it.
     *
     * The alternative — orphaning them — leaves attempts in the global history
     * attributed to a course that no longer exists, which the history view
     * would then have to render as "unknown course" forever. The UI names the
     * counts before confirming, so this is a stated consequence rather than a
     * surprise.
     */
    case 'remove-course': {
      const id = action.courseId;
      return {
        ...state,
        drafts: Object.fromEntries(Object.entries(state.drafts).filter(([key]) => !key.includes(id))),
        retiredTopics: state.retiredTopics?.filter(t => t.courseId !== id),
        courses: state.courses.filter((c) => c.id !== id),
        topics: state.topics.filter((t) => t.courseId !== id),
        materials: state.materials.filter((m) => m.courseId !== id),
        attempts: state.attempts.filter((a) => a.courseId !== id),
        tutorSessions: state.tutorSessions.filter((s) => s.courseId !== id),
        savedPractice: state.savedPractice.filter((s) => s.courseId !== id),
        practiceRuns: state.practiceRuns.filter((r) => r.courseId !== id),
        examConfigs: state.examConfigs.filter((c) => c.courseId !== id),
        assessments: state.assessments.filter((a) => a.courseId !== id),
        sessions: state.sessions.filter((s) => s.courseId !== id),
        checkIns: state.checkIns.map((c) =>
          c.courseId === id ? { ...c, courseId: undefined, topicId: undefined } : c,
        ),
        activeExam: state.activeExam?.courseId === id ? null : state.activeExam,
        activeCourseId: state.activeCourseId === id ? null : state.activeCourseId,
        questions: state.questions.filter((q) => q.courseId !== id),
      };
    }

    case 'set-topics': {
      const kept = state.topics.filter((t) => t.courseId !== action.courseId);
      const removed = state.topics.filter(t => t.courseId === action.courseId && !action.topics.some(next => next.id === t.id));
      const removedIds = new Set(removed.map(t => t.id));
      return { ...state, topics: [...kept, ...action.topics], retiredTopics: [...(state.retiredTopics ?? []), ...removed],
        materials: state.materials.map(m => m.courseId === action.courseId ? { ...m, topicIds: m.topicIds.filter(id => !removedIds.has(id)), passages: m.passages.map(p => ({ ...p, topicIds: p.topicIds.filter(id => !removedIds.has(id)) })) } : m),
        assessments: state.assessments.map(a => a.courseId === action.courseId ? { ...a, topicIds: a.topicIds.filter(id => !removedIds.has(id)) } : a),
      };
    }

    case 'update-topic':
      return {
        ...state,
        topics: state.topics.map((t) =>
          t.id === action.topicId ? { ...t, ...action.patch } : t,
        ),
      };

    case 'add-topic':
      return { ...state, topics: [...state.topics, action.topic] };

    case 'remove-topic':
      return {
        ...state,
        topics: state.topics.filter((t) => t.id !== action.topicId),
      };

    case 'add-material':
      return { ...state, materials: [action.material, ...state.materials] };

    case 'update-material':
      return {
        ...state,
        materials: state.materials.map((m) =>
          m.id === action.materialId ? { ...m, ...action.patch } : m,
        ),
      };

    case 'remove-material':
      return {
        ...state,
        materials: state.materials.filter((m) => m.id !== action.materialId),
      };

    case 'record-attempt': {
      // Recording is idempotent by id, so a double submit cannot produce two
      // history entries for one paper.
      if (state.attempts.some((a) => a.id === action.attempt.id)) return state;
      const at = action.attempt.completedAt ?? new Date().toISOString();
      return {
        ...state,
        attempts: [...state.attempts, action.attempt],
        tutorSessions: state.tutorSessions.map(s => state.savedPractice.find(set => set.id === action.attempt.practiceSetId)?.fromTutorId === s.id && !s.launchedAttemptIds.includes(action.attempt.id) ? { ...s, launchedAttemptIds: [...s.launchedAttemptIds, action.attempt.id] } : s),
        sessions: completeLinkedSession(
          state.sessions,
          action.attempt.plannedSessionId,
          action.attempt.id,
          at,
          action.attempt.courseId,
        ),
      };
    }

    /*
     * A tutor session, and the planner session it may complete.
     *
     * ── When a tutor session counts as study ──────────────────────────────
     *
     * Not when it is opened, and not when it is merely left. Opening the tutor
     * and walking away is not study, and if it completed a planned session the
     * streak would be inflatable by clicking. So the bar is the same one
     * `activityEvents` already uses for history: the session has ended *and*
     * the student took at least two turns in it. That is the point at which
     * something was actually worked through.
     *
     * The completion goes through `completeLinkedSession`, so it happens once,
     * cannot move an earlier completion date, and declines a link that names
     * another course's session.
     */
    case 'upsert-tutor-session': {
      const exists = state.tutorSessions.some((s) => s.id === action.session.id);
      const session = action.session;
      const tutorSessions = exists
        ? state.tutorSessions.map((s) => (s.id === session.id ? session : s))
        : [...state.tutorSessions, session];

      const studentTurns = session.messages.filter(
        (m) => m.role === 'student',
      ).length;
      const previous = state.tutorSessions.find(s => s.id === session.id);
      const reachedCompletion = !previous?.endedAt && Boolean(session.endedAt) && studentTurns >= 2;

      return {
        ...state,
        tutorSessions,
        sessions: reachedCompletion
          ? completeLinkedSession(
              state.sessions,
              session.plannedSessionId,
              session.id,
              session.endedAt ?? new Date().toISOString(),
              session.courseId,
            )
          : state.sessions,
      };
    }

    case 'append-tutor-messages': {
      const session = state.tutorSessions.find((s) => s.id === action.sessionId);
      if (!session) return state;
      return reducer(state, {
        type: 'upsert-tutor-session',
        session: {
          ...session,
          messages: [...session.messages, ...action.messages],
          stage: action.stage ?? session.stage,
          updatedAt: new Date().toISOString(),
        },
      });
    }

    case 'save-generated-set': {
      /* Every question must belong to the set's course. The caller checks
         this too, and a mismatch here saves nothing rather than half a set. */
      if (action.questions.some((q) => q.courseId !== action.set.courseId)) return state;
      const known = new Set(state.questions.map((q) => q.id));
      return reducer(
        {
          ...state,
          questions: [
            ...state.questions,
            ...action.questions.filter((q) => !known.has(q.id)),
          ],
        },
        { type: 'save-practice', set: action.set },
      );
    }

    case 'update-attempt-question':
      return {
        ...state,
        attempts: state.attempts.map((attempt) => {
          if (attempt.id !== action.attemptId) return attempt;
          const current = attempt.questions[action.index];
          if (!current || current.questionId !== action.questionAttempt.questionId) {
            return attempt;
          }
          const questions = attempt.questions.map((qa, i) =>
            i === action.index ? action.questionAttempt : qa,
          );
          const totals = attemptTotals(questions);
          return {
            ...attempt,
            questions,
            marksAwarded: totals.marksAwarded,
            marksAvailable: totals.marksAvailable,
          };
        }),
      };

    case 'save-practice': {
      const exists = state.savedPractice.some((s) => s.id === action.set.id);
      return {
        ...state,
        savedPractice: exists
          ? state.savedPractice.map((s) => (s.id === action.set.id ? action.set : s))
          : [action.set, ...state.savedPractice],
      };
    }

    case 'remove-practice':
      if (state.practiceRuns.some(r => r.setId === action.setId)) return state;
      return {
        ...state,
        savedPractice: state.savedPractice.filter((s) => s.id !== action.setId),
        practiceRuns: state.practiceRuns.filter((r) => r.setId !== action.setId),
      };

    case 'upsert-practice-run': {
      const exists = state.practiceRuns.some((r) => r.id === action.run.id);
      return {
        ...state,
        practiceRuns: exists
          ? state.practiceRuns.map((r) => (r.id === action.run.id ? action.run : r))
          : [...state.practiceRuns, action.run],
      };
    }

    case 'set-practice-grading':
      return {
        ...state,
        practiceRuns: state.practiceRuns.map((r) =>
          r.id === action.runId
            ? {
                ...r,
                gradings: { ...(r.gradings ?? {}), [action.questionId]: action.grading },
              }
            : r,
        ),
      };

    case 'remove-practice-run':
      return {
        ...state,
        practiceRuns: state.practiceRuns.filter((r) => r.id !== action.runId),
      };

    case 'save-exam-config': {
      const exists = state.examConfigs.some((c) => c.id === action.config.id);
      return {
        ...state,
        examConfigs: exists
          ? state.examConfigs.map((c) =>
              c.id === action.config.id ? action.config : c,
            )
          : [...state.examConfigs, action.config],
      };
    }

    case 'remove-exam-config':
      if (state.activeExam?.configId === action.configId) return state;
      return {
        ...state,
        examConfigs: state.examConfigs.filter(
          (c) => c.id !== action.configId || c.preset,
        ),
      };

    case 'set-active-exam':
      return { ...state, activeExam: action.run };

    case 'save-assessment': {
      const exists = state.assessments.some((a) => a.id === action.assessment.id);
      return {
        ...state,
        assessments: exists
          ? state.assessments.map((a) =>
              a.id === action.assessment.id ? action.assessment : a,
            )
          : [...state.assessments, action.assessment],
      };
    }

    /*
     * Removing an assessment detaches it rather than cascading.
     *
     * Sessions and configurations that pointed at it are real work the student
     * did; deleting them because the deadline was removed would destroy more
     * than was asked for. They lose the link and keep everything else.
     */
    case 'remove-assessment':
      return {
        ...state,
        assessments: state.assessments.filter((a) => a.id !== action.assessmentId),
        sessions: state.sessions.map((s) =>
          s.assessmentId === action.assessmentId
            ? { ...s, assessmentId: undefined }
            : s,
        ),
        examConfigs: state.examConfigs.map((c) =>
          c.assessmentIds?.includes(action.assessmentId)
            ? {
                ...c,
                assessmentIds: c.assessmentIds.filter(
                  (id) => id !== action.assessmentId,
                ),
              }
            : c,
        ),
      };

    case 'set-availability':
      return { ...state, availability: action.availability };

    case 'set-availability-exception': {
      const exceptions = state.availability.exceptions.filter(
        (e) => e.date !== action.exception.date,
      );
      return {
        ...state,
        availability: {
          ...state.availability,
          exceptions: [...exceptions, action.exception],
        },
      };
    }

    case 'remove-availability-exception':
      return {
        ...state,
        availability: {
          ...state.availability,
          exceptions: state.availability.exceptions.filter(
            (e) => e.id !== action.exceptionId,
          ),
        },
      };

    case 'save-session': {
      const exists = state.sessions.some((s) => s.id === action.session.id);
      return {
        ...state,
        sessions: exists
          ? state.sessions.map((s) =>
              s.id === action.session.id ? action.session : s,
            )
          : [...state.sessions, action.session],
      };
    }

    /** Applying a generated plan: several sessions in one transition. */
    case 'save-sessions': {
      const incoming = new Map(action.sessions.map((s) => [s.id, s]));
      const updated = state.sessions.map((s) => incoming.get(s.id) ?? s);
      const added = action.sessions.filter(
        (s) => !state.sessions.some((existing) => existing.id === s.id),
      );
      return { ...state, sessions: [...updated, ...added] };
    }

    case 'remove-session':
      return {
        ...state,
        sessions: state.sessions.filter((s) => s.id !== action.sessionId),
      };

    case 'add-check-in':
      return { ...state, checkIns: [...state.checkIns, action.checkIn] };
  }
}

/* ── Persistence and migration ────────────────────────────────────────── */

/** The v1 tree's shape, as far as the migration needs to know it. */
interface LegacyState {
  version: 1;
  course: {
    id?: string;
    name?: string;
    goal?: string;
    examDate?: string;
    dailyMinutes?: number;
    createdAt?: string;
  } | null;
  topics?: unknown[];
  materials?: unknown[];
  attempts?: unknown[];
  tutorSessions?: unknown[];
  savedPractice?: unknown[];
  examConfigs?: unknown[];
  checkIns?: unknown[];
  seeded?: boolean;
  /** An unfinished paper the old build was in the middle of. */
  activeExam?: unknown;
}

/**
 * The question ids a config-only set resolves to.
 *
 * Deliberately a plain function over the pool rather than the `selectQuestions`
 * selector: this runs during restore, before React exists. It mirrors the
 * activity-to-format mapping the practice setup uses, and the *page* remains
 * the place a set is repaired interactively. This one exists so that a store
 * upgraded by this build arrives already correct.
 */
function resolveLegacySet(set: SavedPracticeSet, pool: Question[]): string[] {
  const formats: Record<string, string[]> = {
    flashcards: ['flashcard'],
    quiz: ['multiple-choice', 'multiple-select', 'matching', 'ordering', 'fill-blank'],
    'written-recall': ['written-recall'],
    'source-analysis': ['source-analysis'],
    essay: ['essay'],
  };
  const wanted = new Set(formats[set.config?.activity ?? 'quiz'] ?? []);
  const topics = new Set(set.config?.topicIds ?? []);
  const difficulties = new Set(set.config?.difficulties ?? []);

  return pool
    .filter(
      (q) =>
        q.courseId === set.courseId &&
        wanted.has(q.format) &&
        (topics.size === 0 || topics.has(q.topicId)) &&
        (difficulties.size === 0 || difficulties.has(q.difficulty)),
    )
    .slice(0, set.config?.length || undefined)
    .map((q) => q.id);
}

/**
 * Upgrades a v1 tree to the current shape.
 *
 * ── What is preserved, and what is derived ────────────────────────────────
 *
 * Everything the student made is kept: the course, its topics and materials,
 * every attempt, tutor session, saved set and exam configuration. What changes
 * is ownership and vocabulary — each record gains the course id it implicitly
 * had, and the two course-level fields that this checkpoint removed become the
 * objects that replaced them:
 *
 *   `examDate`      → a planned assessment called "Exam", so the date the
 *                     student entered still drives every countdown.
 *   `dailyMinutes`  → weekday availability windows, so the planner starts from
 *                     the time budget they had already told us about.
 *
 * Old attempts get `assistanceRecord: 'unknown'`. Their `usedHint` flags were
 * written by a build where an exam could offer tutor hints and the run did not
 * always record them, so treating them as reliable would let assisted answers
 * count as independent evidence. Marking them unknown keeps the attempts and
 * their marks fully visible while withholding the one claim the data cannot
 * support, and the progress view says so where it matters.
 */
function migrateV1(legacy: LegacyState): AppState {
  const base = emptyState();
  const legacyCourse = legacy.course;

  if (!legacyCourse) {
    // No course means the old tree was mid-first-run. Nothing to preserve.
    return { ...base, version: STORAGE_VERSION };
  }

  const courseId = legacyCourse.id ?? ATLANTIC_COURSE_ID;
  const now = new Date().toISOString();

  const course: Course = {
    id: courseId,
    name: legacyCourse.name ?? 'Your course',
    description: '',
    goal: legacyCourse.goal ?? '',
    accent: 'indigo',
    createdAt: legacyCourse.createdAt ?? now,
  };

  /** Stamps `courseId` onto a legacy record that did not carry one. */
  const own = <T extends object>(rows: unknown[] | undefined): T[] =>
    (Array.isArray(rows) ? rows : [])
      .filter((r): r is object => typeof r === 'object' && r !== null)
      .map((r, i) => ({ courseId, order: i, ...r }) as T);

  const topics = own<Topic>(legacy.topics).map((t, i) => ({
    ...t,
    order: typeof t.order === 'number' ? t.order : i,
  }));

  const attempts = own<Attempt>(legacy.attempts).map((a) => ({
    ...a,
    assistanceRecord: a.assistanceRecord ?? ('unknown' as const),
  }));

  const examConfigs = own<ExamConfig>(legacy.examConfigs).map((c) => {
    // `tutorAllowed` and `feedback` no longer exist. A paper that previously
    // released feedback per section becomes one that locks per section, which
    // is the part of that behaviour the new rules keep.
    const legacyConfig = c as ExamConfig & {
      feedback?: string;
      tutorAllowed?: boolean;
    };
    const { feedback, tutorAllowed: _dropped, ...rest } = legacyConfig;
    return {
      ...rest,
      lockSectionsOnFinish:
        typeof rest.lockSectionsOnFinish === 'boolean'
          ? rest.lockSectionsOnFinish
          : feedback === 'per-section',
    };
  });

  /*
   * v1 sets stored only a configuration.
   *
   * Leaving `questionIds` empty was honest but useless: the content was never
   * resolved anywhere, so every migrated set arrived with nothing in it and a
   * disabled Start button. Resolving here, against the set's *own course*
   * pool, gives it the content its settings describe. A set whose settings no
   * longer match anything stays empty and the set page explains why rather
   * than pretending.
   */
  const pool = AUTHORED_QUESTIONS;
  const savedPractice = own<SavedPracticeSet>(legacy.savedPractice).map((s) => {
    if (Array.isArray(s.questionIds) && s.questionIds.length > 0) return s;
    return { ...s, questionIds: resolveLegacySet(s, pool) };
  });

  /* The old single exam date becomes a planned assessment. */
  const assessments: PlannedAssessment[] = legacyCourse.examDate
    ? [
        {
          id: `assess-migrated-${courseId}`,
          courseId,
          title: 'Exam',
          type: 'final',
          date: legacyCourse.examDate,
          topicIds: topics.map((t) => t.id),
          notes:
            'Carried over from the single exam date this course used to have. Rename it, give it a time, or narrow what it covers.',
          createdAt: now,
        },
      ]
    : [];

  /* The old daily-minutes preference becomes weekday availability. */
  const minutes = legacyCourse.dailyMinutes ?? 45;
  const availability: Availability = {
    sessionMinutes: Math.min(60, Math.max(20, minutes)),
    exceptions: [],
    windows: ([1, 2, 3, 4, 5] as const).map((day) => ({
      id: `av-migrated-${day}`,
      day,
      startMinutes: 18 * 60,
      endMinutes: 18 * 60 + minutes,
    })),
  };

  /*
   * An unfinished paper from the old build cannot be resumed.
   *
   * Its run predates the rules this checkpoint introduced: per-section
   * deadlines, section locking, and the guarantee that an exam offered no
   * assistance. Resuming it would either hand out fresh time or quietly claim
   * its answers were independent evidence when the old build could not say
   * whether hints had been used. Neither is acceptable, so the run is not
   * restored. It is also not silently dropped: the raw record is kept and
   * offered as a download, with the reason stated.
   */
  const carriedForward: RestoreProblem | undefined = legacy.activeExam
    ? {
        reason:
          'You had an unfinished exam in progress. It cannot be resumed under this version’s exam rules: its timing and its record of whether help was used were kept differently, so continuing it would either grant fresh time or count assisted answers as independent evidence.',
        raw: JSON.stringify(legacy.activeExam, null, 2),
      }
    : undefined;

  return {
    ...base,
    version: STORAGE_VERSION,
    ...(carriedForward ? { carriedForward } : {}),
    courses: [course],
    activeCourseId: courseId,
    topics,
    materials: own<Material>(legacy.materials),
    attempts,
    tutorSessions: own<TutorSession>(legacy.tutorSessions),
    savedPractice,
    examConfigs,
    assessments,
    availability,
    checkIns: (Array.isArray(legacy.checkIns) ? legacy.checkIns : []) as CheckIn[],
    seeded: legacy.seeded === true,
  };
}

/**
 * Reads the stored tree, migrating it if it is older than this build.
 *
 * Returns the state to use, or a `RestoreProblem` describing why it could not
 * be read. The brief is explicit that stored data must not be wiped silently to
 * make a new structure work, so an unreadable tree is *reported* — with its raw
 * JSON attached so the student can keep it — rather than quietly replaced.
 */
function restore(): { state: AppState } | { problem: RestoreProblem } | null {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch {
    return { problem: { reason: 'Browser storage could not be read. Keep this page open and use Workspace data to restore a recovery copy.', raw: '' } };
  }
  if (!raw) return null;

  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) {
      return { problem: { reason: 'The saved data was not an object.', raw } };
    }

    const candidate = parsed as Partial<AppState> & { version?: number };

    if (candidate.version === 1) {
      return { state: migrateV1(parsed as unknown as LegacyState) };
    }

    if (candidate.version !== STORAGE_VERSION) {
      return {
        problem: {
          reason: `The saved data is version ${String(
            candidate.version ?? 'unknown',
          )}, and this build reads version ${STORAGE_VERSION}.`,
          raw,
        },
      };
    }

    if (
      !Array.isArray(candidate.courses) ||
      !Array.isArray(candidate.topics) ||
      !Array.isArray(candidate.attempts)
    ) {
      return {
        problem: { reason: 'The saved data is missing its course records.', raw },
      };
    }

    /*
     * The authored pools are code, not user data. Restoring them from storage
     * would pin a student to an old question bank after the seed content is
     * edited — but a *created* course's questions would be lost by taking the
     * seed alone, so anything that is not a seeded question is kept.
     */
    const storedQuestions = candidate.questions ?? [];
    const storedIds = new Set(storedQuestions.map(q => q.id));
    const missingAuthored = AUTHORED_QUESTIONS.filter(q => !storedIds.has(q.id));

    /*
     * No course is added here. An earlier build installed CENG 401 into every
     * restored workspace, and that pass is gone: a workspace that holds the
     * course keeps it, with its materials, questions, sets, attempts and tutor
     * sessions exactly as stored, and a workspace without it stays without it.
     * Nothing needs migrating, because every one of those records was already
     * written to storage by the build that installed it.
     */
    const restored = {
      ...emptyState(),
      ...candidate,
      onboarded: candidate.onboarded ?? true,
      preferences: { ...DEFAULT_PREFERENCES, ...candidate.preferences, reminders: { ...DEFAULT_PREFERENCES.reminders, ...candidate.preferences?.reminders }, theme: candidate.preferences?.theme ?? (() => { try { const old = localStorage.getItem('rawi.theme'); return old === 'light' || old === 'dark' ? old : 'system'; } catch { return 'system'; } })() },
      drafts: candidate.drafts ?? {},
      reminderState: candidate.reminderState ?? {},
      questions: [...storedQuestions, ...missingAuthored],
      version: STORAGE_VERSION,
    } as AppState;

    try {
      return { state: { ...importWorkspace(JSON.stringify(restored)), onboarded: restored.onboarded } };
    } catch (error) {
      return { problem: { reason: error instanceof Error ? error.message : 'The saved workspace has invalid records.', raw } };
    }
  } catch {
    return { problem: { reason: 'The saved data could not be parsed as JSON.', raw } };
  }
}

/** Recovery is checked before replacing anything in memory or storage. */
export function importWorkspace(raw: string): AppState {
  let data: unknown;
  try { data = JSON.parse(raw); } catch { throw new Error('The recovery file is not valid JSON. Nothing changed.'); }
  if (!data || typeof data !== 'object') throw new Error('This is not a Rawi workspace. Nothing changed.');
  const envelope = data as Record<string, unknown>;
  if (envelope.format === 'rawi-workspace') {
    if (envelope.version !== 1) throw new Error('This recovery export version is not supported. Nothing changed.');
    data = envelope.state;
  }
  if (!data || typeof data !== 'object') throw new Error('The file has no workspace. Nothing changed.');
  const candidate = data as AppState;
  if (candidate.version === 1) return importWorkspace(JSON.stringify(migrateV1(candidate as unknown as LegacyState)));
  if (candidate.version !== STORAGE_VERSION) throw new Error('This workspace version cannot be read by this build. Nothing changed.');
  const arrays = ['courses', 'topics', 'materials', 'questions', 'attempts', 'tutorSessions', 'savedPractice', 'examConfigs', 'assessments', 'sessions', 'checkIns'] as const;
  for (const key of arrays) {
    if (!Array.isArray(candidate[key]) || candidate[key].some((r: unknown) => !r || typeof r !== 'object' || typeof (r as { id?: unknown }).id !== 'string')) throw new Error(`Invalid ${key} records. Nothing changed.`);
    const ids = candidate[key].map(r => r.id);
    if (new Set(ids).size !== ids.length) throw new Error(`Duplicate ${key} records. Nothing changed.`);
  }
  const courses = new Set(candidate.courses.map(c => c.id));
  for (const key of ['topics', 'materials', 'questions', 'attempts', 'tutorSessions', 'savedPractice', 'examConfigs', 'assessments', 'sessions'] as const) {
    if (candidate[key].some(r => typeof r.courseId !== 'string')) throw new Error(`Invalid course ownership in ${key}. Nothing changed.`);
    // Authored questions may remain in an empty workspace, but all user records need a course.
    if (key !== 'questions' && candidate[key].some(r => !courses.has(r.courseId))) throw new Error(`Missing course in ${key}. Nothing changed.`);
  }
  if (candidate.courses.some(c => typeof c.name !== 'string') || candidate.topics.some(t => typeof t.title !== 'string' || typeof t.summary !== 'string' || !Array.isArray(t.relatedTopicIds)) || candidate.materials.some(m => typeof m.title !== 'string' || !Array.isArray(m.topicIds) || !Array.isArray(m.passages) || m.passages.some(p => typeof p.id !== 'string' || typeof p.text !== 'string' || typeof p.heading !== 'string' || !Array.isArray(p.topicIds)))) throw new Error('Invalid course content. Nothing changed.');
  if (candidate.tutorSessions.some(s => !Array.isArray(s.messages) || s.messages.some(m => typeof m.text !== 'string')) || candidate.savedPractice.some(s => !s.config || !Array.isArray(s.questionIds) || !Array.isArray(s.config.topicIds)) || candidate.attempts.some(a => !Array.isArray(a.questions)) || candidate.examConfigs.some(c => !Array.isArray(c.sections))) throw new Error('Invalid saved study work. Nothing changed.');
  if (!candidate.availability || !Array.isArray(candidate.availability.windows) || !Array.isArray(candidate.availability.exceptions) || !Number.isFinite(candidate.availability.sessionMinutes)) throw new Error('Invalid study availability. Nothing changed.');
  const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
  const strings = (v: unknown) => Array.isArray(v) && v.every(x => typeof x === 'string');
  if (candidate.courses.some(c => typeof c.description !== 'string' || typeof c.goal !== 'string' || typeof c.createdAt !== 'string') || candidate.questions.some(q => typeof q.prompt !== 'string' || typeof q.explanation !== 'string' || typeof q.topicId !== 'string' || !Number.isFinite(q.marks))) throw new Error('Invalid course or question fields. Nothing changed.');
  if (candidate.attempts.some(a => typeof a.title !== 'string' || !strings(a.topicIds) || typeof a.startedAt !== 'string' || a.questions.some(q => !q || typeof q.questionId !== 'string' || typeof q.topicId !== 'string' || !object(q.response))) || candidate.tutorSessions.some(s => typeof s.topicId !== 'string' || typeof s.updatedAt !== 'string' || !strings(s.launchedAttemptIds)) || candidate.savedPractice.some(s => typeof s.name !== 'string' || typeof s.savedAt !== 'string' || !strings(s.config.materialIds) || !strings(s.config.difficulties)) || candidate.examConfigs.some(c => typeof c.name !== 'string' || typeof c.savedAt !== 'string' || !strings(c.allowedMaterialIds) || c.sections.some(s => !s || !strings(s.topicIds) || !strings(s.formats)))) throw new Error('Invalid study record fields. Nothing changed.');
  if (candidate.assessments.some(a => typeof a.title !== 'string' || typeof a.date !== 'string' || !strings(a.topicIds)) || candidate.sessions.some(s => typeof s.title !== 'string' || typeof s.date !== 'string' || !strings(s.topicIds) || !object(s.link)) || candidate.checkIns.some(c => typeof c.courseId !== 'string')) throw new Error('Invalid planning records. Nothing changed.');
  if (candidate.practiceRuns && (!Array.isArray(candidate.practiceRuns) || candidate.practiceRuns.some(r => !r || typeof r.id !== 'string' || !courses.has(r.courseId) || !strings(r.questionIds) || !strings(r.checkedIds) || !strings(r.hintedIds) || !strings(r.revisitIds) || !object(r.answers) || !Number.isInteger(r.index)))) throw new Error('Invalid unfinished practice. Nothing changed.');
  if (candidate.activeExam && (!courses.has(candidate.activeExam.courseId) || !object(candidate.activeExam.configSnapshot) || !Array.isArray(candidate.activeExam.configSnapshot.sections) || !object(candidate.activeExam.answers) || !object(candidate.activeExam.sectionQuestions) || !strings(candidate.activeExam.flagged) || !strings(candidate.activeExam.lockedSectionIds) || !Array.isArray(candidate.activeExam.sectionOutcomes))) throw new Error('Invalid unfinished exam. Nothing changed.');
  if ((candidate.drafts && !object(candidate.drafts)) || (candidate.reminderState && (!object(candidate.reminderState) || Object.values(candidate.reminderState).some(v => v !== 'read' && v !== 'dismissed'))) || (candidate.retiredTopics && (!Array.isArray(candidate.retiredTopics) || candidate.retiredTopics.some(t => !t || !courses.has(t.courseId) || typeof t.id !== 'string' || typeof t.title !== 'string')))) throw new Error('Invalid saved workspace context. Nothing changed.');
  const topicOwners = new Map([...candidate.topics, ...(candidate.retiredTopics ?? [])].map(t => [t.id, t.courseId]));
  const materialOwners = new Map(candidate.materials.map(m => [m.id, m.courseId]));
  const questionOwners = new Map(candidate.questions.map(q => [q.id, q.courseId]));
  const attemptOwners = new Map(candidate.attempts.map(a => [a.id, a.courseId]));
  const sameCourse = (ids: string[], owners: Map<string, string>, courseId: string) => ids.every(id => !owners.has(id) || owners.get(id) === courseId);
  const sourceMatches = (source: Material['noteSource'], courseId: string) => !source || (typeof source.materialId === 'string' && typeof source.passageId === 'string' && sameCourse([source.materialId], materialOwners, courseId));
  if (candidate.materials.some(m => !sameCourse(m.topicIds, topicOwners, m.courseId) || !sourceMatches(m.noteSource, m.courseId) || m.passages.some(p => !sameCourse(p.topicIds, topicOwners, m.courseId))) || candidate.questions.some(q => !sameCourse([q.topicId], topicOwners, q.courseId) || !sourceMatches(q.source, q.courseId)) || candidate.savedPractice.some(s => !sameCourse(s.questionIds, questionOwners, s.courseId) || !sameCourse(s.config.topicIds, topicOwners, s.courseId) || !sameCourse(s.config.materialIds, materialOwners, s.courseId)) || candidate.attempts.some(a => !sameCourse(a.topicIds, topicOwners, a.courseId) || a.questions.some(q => !sameCourse([q.questionId], questionOwners, a.courseId) || !sameCourse([q.topicId], topicOwners, a.courseId))) || candidate.tutorSessions.some(s => !sameCourse([s.topicId], topicOwners, s.courseId) || !sourceMatches(s.source, s.courseId) || s.review && (s.review.courseId !== s.courseId || s.review.topicId !== s.topicId || !sameCourse([s.review.attemptId], attemptOwners, s.courseId)) || s.messages.some(m => !sourceMatches(m.source, s.courseId) || (m.citations ?? []).some(ref => !sourceMatches(ref, s.courseId))))) throw new Error('A recovery record references work from another course. Nothing changed.');
  if (candidate.examConfigs.some(c => !sameCourse(c.allowedMaterialIds, materialOwners, c.courseId) || c.sections.some(s => !sameCourse(s.topicIds, topicOwners, c.courseId))) || candidate.assessments.some(a => !sameCourse(a.topicIds, topicOwners, a.courseId)) || candidate.sessions.some(s => !sameCourse(s.topicIds, topicOwners, s.courseId)) || (candidate.practiceRuns ?? []).some(r => !sameCourse(r.questionIds, questionOwners, r.courseId))) throw new Error('A recovery activity references another course. Nothing changed.');
  const invalidPriorPassages = candidate.materials.some(m => m.priorPassages && (
    !Array.isArray(m.priorPassages) || m.priorPassages.some(p =>
      !p || typeof p.id !== 'string' || typeof p.heading !== 'string' || typeof p.text !== 'string' || !strings(p.topicIds)
    )
  ));
  const invalidQuestions = candidate.questions.some(q =>
    !['flashcard', 'multiple-choice', 'multiple-select', 'matching', 'ordering', 'fill-blank', 'written-recall', 'source-analysis', 'essay'].includes(q.format) ||
    (q.options && !strings(q.options)) || (q.sequence && !strings(q.sequence)) ||
    (q.rubric && (!Array.isArray(q.rubric) || q.rubric.some(p => !p || typeof p.id !== 'string' || typeof p.label !== 'string' || !Number.isFinite(p.marks))))
  );
  if (invalidPriorPassages || invalidQuestions) throw new Error('Invalid passage or question content. Nothing changed.');
  const preferences = { ...DEFAULT_PREFERENCES, ...candidate.preferences, reminders: { ...DEFAULT_PREFERENCES.reminders, ...candidate.preferences?.reminders } };
  if (typeof preferences.displayName !== 'string' || typeof preferences.workspaceName !== 'string' || !Number.isInteger(preferences.questionCount) || preferences.questionCount < 1 || preferences.questionCount > 30) throw new Error('Invalid workspace preferences. Nothing changed.');
  if (!['indigo', 'amber', 'teal', 'rose', 'violet'].includes(preferences.accent) || !['immediate', 'end'].includes(preferences.feedback) || !['normal', 'large', 'larger'].includes(preferences.readingSize) || !['system', 'reduced', 'full'].includes(preferences.motion) || !['system', 'light', 'dark'].includes(preferences.theme) || typeof preferences.hints !== 'boolean' || ![0, 1, 3, 7].includes(preferences.reminders.days) || [preferences.reminders.assessments, preferences.reminders.study, preferences.reminders.review].some(v => typeof v !== 'boolean')) throw new Error('Invalid study or appearance preferences. Nothing changed.');
  return { ...emptyState(), ...candidate, onboarded: true, preferences, drafts: candidate.drafts ?? {}, reminderState: candidate.reminderState ?? {}, restoreProblem: undefined };
}

function persist(state: AppState) {
  try {
    // The restore problem is a report about a *previous* load, not part of the
    // tree. Writing it back would make one bad load permanent.
    const { restoreProblem: _omit, ...persistable } = state;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(persistable));
    saveFailed = false;
    return true;
  } catch {
    // A full or disabled storage should not take the app down. The session
    // still works in memory and the shell exposes recovery.
    saveFailed = true;
    return false;
  }
}

export function clearStorage() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* see persist() */
  }
}

/* ── Context ──────────────────────────────────────────────────────────── */

interface StoreValue {
  state: AppState;
  dispatch: (action: Action) => void;
  resetDemo: () => void;
  saveError: boolean;
  retrySave: () => void;
}

const StoreContext = createContext<StoreValue | null>(null);

function init(): AppState {
  const restored = restore();
  if (!restored) return { ...emptyState(), onboarded: false };
  if ('problem' in restored) {
    return { ...seedState(), restoreProblem: restored.problem };
  }
  return restored.state;
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState(init);
  const current = useRef(state);
  const [saveError, setSaveError] = useState(false);
  const dispatch = useCallback((action: Action) => {
    const next = reducer(current.current, action);
    current.current = next;
    setState(next);
    if (!next.restoreProblem) setSaveError(!persist(next));
  }, []);
  const retrySave = useCallback(() => { if (!current.current.restoreProblem) setSaveError(!persist(current.current)); }, []);

  useEffect(() => {
    // A tree that failed to restore is not written back until the student has
    // decided what to do, so their original blob survives a reload.
    if (state.restoreProblem) return;
    setSaveError(!persist(state));
  }, [state]);

  const resetDemo = useCallback(() => {
    clearStorage();
    dispatch({ type: 'reset-demo' });
  }, []);

  const value = useMemo(
    () => ({ state, dispatch, resetDemo, saveError, retrySave }),
    [state, dispatch, resetDemo, saveError, retrySave],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreValue {
  const value = useContext(StoreContext);
  if (!value) throw new Error('useStore must be used inside StoreProvider');
  return value;
}

/** Convenience for the very common read-only case. */
export function useAppState(): AppState {
  return useStore().state;
}

export function useDispatch(): (action: Action) => void {
  return useStore().dispatch;
}
