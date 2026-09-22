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
  CheckIn,
  Course,
  ExamConfig,
  ExamRun,
  Material,
  Question,
  SavedPracticeSet,
  Topic,
  TutorSession,
} from '@shared/types.ts';
import { SEED_COURSE, SEED_TOPICS } from '@shared/course/topics.ts';
import { SEED_MATERIALS } from '@shared/course/materials.ts';
import { SEED_QUESTIONS } from '@shared/course/questions.ts';
import { SEED_ATTEMPTS, SEED_EXAM_PRESETS } from '@shared/course/history.ts';

/**
 * The whole prototype's state, in one store.
 *
 * ── Why a reducer and not React Query ─────────────────────────────────────
 *
 * The previous prototype used React Query over a simulated async API, which was
 * the right shape for something that expected a server. Nothing here is async —
 * every read is a synchronous function of local state — so a query cache adds a
 * loading state that is always instantly resolved, and an invalidation story
 * for data that cannot go stale. A reducer plus derived selectors is smaller
 * and says what is actually true: this is one client-side state tree.
 *
 * React Query is still mounted in `main.tsx` for the one genuinely async thing
 * in the app — reading a local text file — but the domain does not go through
 * it.
 *
 * ── Persistence ──────────────────────────────────────────────────────────
 *
 * The whole tree is written to `localStorage` on change, debounced by the
 * browser's own microtask batching via an effect. Restore is defensive: a blob
 * from an older build with a missing field would otherwise crash a screen deep
 * in the app, so `restore()` checks the shape it depends on and falls back to a
 * clean seed rather than trusting what it finds. That is the one place in this
 * prototype where untrusted data genuinely enters.
 *
 * `resetDemo()` clears the key and reseeds, which the brief requires whenever
 * local persistence is used.
 */

const STORAGE_KEY = 'rawi.state.v1';
const STORAGE_VERSION = 1;

export interface AppState {
  version: number;
  /** Null until the student completes setup — drives the first-run flow. */
  course: Course | null;
  topics: Topic[];
  materials: Material[];
  /** Authored pool plus nothing else; the prototype does not generate questions. */
  questions: Question[];
  attempts: Attempt[];
  tutorSessions: TutorSession[];
  savedPractice: SavedPracticeSet[];
  examConfigs: ExamConfig[];
  /** The exam currently being sat, if any. One at a time, deliberately. */
  activeExam: ExamRun | null;
  checkIns: CheckIn[];
  /** True when this tree came from the seed rather than from setup. */
  seeded: boolean;
}

function seedState(): AppState {
  return {
    version: STORAGE_VERSION,
    course: SEED_COURSE,
    topics: SEED_TOPICS,
    materials: SEED_MATERIALS,
    questions: SEED_QUESTIONS,
    attempts: SEED_ATTEMPTS,
    tutorSessions: [],
    savedPractice: [
      {
        id: 'saved-1',
        name: 'Comparison drill',
        savedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 4).toISOString(),
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
    ],
    examConfigs: SEED_EXAM_PRESETS,
    activeExam: null,
    checkIns: [],
    seeded: true,
  };
}

/** An empty tree, for the first-run setup flow. */
function emptyState(): AppState {
  return {
    ...seedState(),
    course: null,
    materials: [],
    attempts: [],
    savedPractice: [],
    checkIns: [],
    seeded: false,
  };
}

/* ── Actions ──────────────────────────────────────────────────────────── */

export type Action =
  | { type: 'reset-demo' }
  | { type: 'start-fresh' }
  | { type: 'create-course'; course: Course; topics: Topic[] }
  | { type: 'update-course'; patch: Partial<Course> }
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
  | { type: 'save-exam-config'; config: ExamConfig }
  | { type: 'remove-exam-config'; configId: string }
  | { type: 'set-active-exam'; run: ExamRun | null }
  | { type: 'add-check-in'; checkIn: CheckIn };

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'reset-demo':
      return seedState();

    case 'start-fresh':
      return emptyState();

    case 'create-course':
      return {
        ...state,
        course: action.course,
        topics: action.topics,
        seeded: false,
      };

    case 'update-course':
      return state.course
        ? { ...state, course: { ...state.course, ...action.patch } }
        : state;

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

    case 'record-attempt':
      return { ...state, attempts: [...state.attempts, action.attempt] };

    case 'upsert-tutor-session': {
      const exists = state.tutorSessions.some((s) => s.id === action.session.id);
      return {
        ...state,
        tutorSessions: exists
          ? state.tutorSessions.map((s) =>
              s.id === action.session.id ? action.session : s,
            )
          : [...state.tutorSessions, action.session],
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

    case 'add-check-in':
      return { ...state, checkIns: [...state.checkIns, action.checkIn] };
  }
}

/* ── Persistence ──────────────────────────────────────────────────────── */

/**
 * Reads the stored tree, or returns null if there is nothing usable there.
 *
 * The checks are shallow on purpose. Validating every nested field would need a
 * schema and would still not cover a genuinely corrupt blob; what these checks
 * catch is the realistic case — a tree written by an earlier version whose
 * shape has since changed — and the fallback is a clean reseed, which is a
 * recoverable outcome rather than a white screen.
 */
function restore(): AppState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const candidate = parsed as Partial<AppState>;
    if (candidate.version !== STORAGE_VERSION) return null;
    if (
      !Array.isArray(candidate.topics) ||
      !Array.isArray(candidate.materials) ||
      !Array.isArray(candidate.attempts) ||
      !Array.isArray(candidate.examConfigs)
    ) {
      return null;
    }
    // The authored pools are code, not user data. Restoring them from storage
    // would pin a student to an old question bank after the seed content is
    // edited, so they are always taken fresh.
    return {
      ...seedState(),
      ...candidate,
      questions: SEED_QUESTIONS,
      version: STORAGE_VERSION,
    } as AppState;
  } catch {
    return null;
  }
}

function persist(state: AppState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
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
  return restore() ?? seedState();
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, init);

  useEffect(() => {
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
