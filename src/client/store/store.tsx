import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
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
  TutorSession,
} from '@shared/types.ts';
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

/** A tree that could not be restored, kept so the student can decide. */
export interface RestoreProblem {
  reason: string;
  /** The raw JSON, offered as a download rather than thrown away. */
  raw: string;
}

export interface AppState {
  version: number;
  courses: Course[];
  /** The course the UI is inside. Null on the student-wide screens. */
  activeCourseId: string | null;
  topics: Topic[];
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

function seedState(): AppState {
  return {
    version: STORAGE_VERSION,
    courses: [SEED_COURSE, STATS_COURSE],
    activeCourseId: null,
    topics: [...SEED_TOPICS, ...STATS_TOPICS],
    materials: [...SEED_MATERIALS, ...STATS_MATERIALS],
    questions: [...SEED_QUESTIONS, ...STATS_QUESTIONS],
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
  | { type: 'save-practice'; set: SavedPracticeSet }
  | { type: 'remove-practice'; setId: string }
  | { type: 'upsert-practice-run'; run: PracticeAttemptState }
  | { type: 'remove-practice-run'; runId: string }
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
      const topicIds = new Set(
        state.topics.filter((t) => t.courseId === id).map((t) => t.id),
      );
      return {
        ...state,
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
        questions: state.questions.filter((q) => !topicIds.has(q.topicId)),
      };
    }

    case 'set-topics': {
      const kept = state.topics.filter((t) => t.courseId !== action.courseId);
      return { ...state, topics: [...kept, ...action.topics] };
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
      const reachedCompletion = Boolean(session.endedAt) && studentTurns >= 2;

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
  const pool = [...SEED_QUESTIONS, ...STATS_QUESTIONS];
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
    return null;
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
    const seededIds = new Set([...SEED_QUESTIONS, ...STATS_QUESTIONS].map((q) => q.id));
    const storedExtra = (candidate.questions ?? []).filter(
      (q) => q && !seededIds.has(q.id),
    );

    return {
      state: {
        ...seedState(),
        ...candidate,
        questions: [...SEED_QUESTIONS, ...STATS_QUESTIONS, ...storedExtra],
        version: STORAGE_VERSION,
      } as AppState,
    };
  } catch {
    return { problem: { reason: 'The saved data could not be parsed as JSON.', raw } };
  }
}

function persist(state: AppState) {
  try {
    // The restore problem is a report about a *previous* load, not part of the
    // tree. Writing it back would make one bad load permanent.
    const { restoreProblem: _omit, carriedForward: _alsoOmit, ...persistable } = state;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(persistable));
  } catch {
    // A full or disabled storage should not take the app down. The session
    // still works; it just will not survive a reload, which is the documented
    // prototype behaviour anyway.
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
}

const StoreContext = createContext<StoreValue | null>(null);

function init(): AppState {
  const restored = restore();
  if (!restored) return seedState();
  if ('problem' in restored) {
    return { ...seedState(), restoreProblem: restored.problem };
  }
  return restored.state;
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, init);

  useEffect(() => {
    // A tree that failed to restore is not written back until the student has
    // decided what to do, so their original blob survives a reload.
    if (state.restoreProblem) return;
    persist(state);
  }, [state]);

  const resetDemo = useCallback(() => {
    clearStorage();
    dispatch({ type: 'reset-demo' });
  }, []);

  const value = useMemo(
    () => ({ state, dispatch, resetDemo }),
    [state, resetDemo],
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
