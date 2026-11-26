/**
 * The Rawi domain, as plain types.
 *
 * ── Why types and not Zod schemas ─────────────────────────────────────────
 *
 * The previous prototype validated everything through Zod because it was
 * designed against a server contract. There is no server here and there is not
 * going to be one at this checkpoint, so parsing our own literals at startup
 * buys nothing but startup cost. The one place untrusted data genuinely enters
 * is restored `localStorage`, and that is handled where it belongs — in the
 * store's restore path, which validates shape defensively and falls back to a
 * fresh seed rather than trusting a JSON blob written by an older build.
 *
 * ── The shape of the domain ───────────────────────────────────────────────
 *
 * A student has **several courses**. Topics, materials, questions, attempts,
 * tutor sessions and exam configurations all carry a `courseId` and belong to
 * exactly one; that field is what keeps two courses' histories from bleeding
 * into each other, and what lets the global views aggregate them on purpose
 * rather than by accident.
 *
 * Above the courses sit the student-wide records: planned assessments are
 * owned by a course but scheduled on one calendar, and availability, planner
 * sessions and check-ins belong to the student rather than to any one course.
 *
 * Blocks of a converted document are the addressable unit inside a material,
 * because "ask the tutor about this bit" and "this exam question came from
 * that bit" both need an id to point at. Everything a student does becomes an `Attempt`, and Progress is
 * a read over the attempt log rather than a separate score that can drift away
 * from it.
 */

/* ── Course and topics ────────────────────────────────────────────────── */

export interface StudyCourse {
  id: string;
  name: string;
  /** One or two sentences about the course itself. Optional. */
  description: string;
  /** Set when the student finished setup rather than landing on the seed. */
  createdAt: string;
  /**
   * Archived courses stay readable and keep their history, but drop out of
   * planning and the default course list.
   */
  archived?: boolean;
}

export interface StudyTopic {
  id: string;
  courseId: string;
  title: string;
  /** One or two sentences from the source. Empty for a topic the student added. */
  summary: string;
  /**
   * Which module/week of the outline this topic sits in. Free text, because a
   * syllabus says "Week 3" or "Unit II" and the prototype should not impose
   * one of those on a student whose course uses the other.
   */
  module?: string;
  /** Position within the outline. Lower sorts first. */
  order: number;
}

/* ── Materials ────────────────────────────────────────────────────────── */

export type MaterialKind = 'reading' | 'lecture-notes';

export interface StudyMaterial {
  archived?: boolean;
  id: string;
  courseId: string;
  title: string;
  kind: MaterialKind;
  /** Where the text came from, as the learner recorded it. */
  attribution?: string;
  /** Topics its current version's sections are linked to. */
  topicIds: string[];
  /** The current version converted to ready or partial blocks. */
  readable: boolean;
  addedAt: string;
  updatedAt?: string;
}

/* ── Questions ────────────────────────────────────────────────────────── */

/**
 * Every format is marked by code except two the student marks: a flashcard is rated for recall,
 * and a self-check answer is compared with a model answer. Nothing is marked by a model.
 */
export type QuestionFormat =
  'flashcard' | 'multiple-choice' | 'numeric' | 'cloze' | 'ordering' | 'matching' | 'self-check';

export type Difficulty = 'recall' | 'reasoning' | 'stretch';

/** Exact blocks of one immutable material version. */
export type SourceRef = import('../contracts/document').Citation;

export interface MatchPair {
  left: string;
  right: string;
}

/**
 * One authored question.
 *
 * Every format shares this record and uses the fields it needs. A discriminated
 * union per format would be tidier in isolation and much worse in practice: the
 * exam runner, the practice runner and the results review all walk mixed lists,
 * and a union forces a `switch` with a branch per format at every one of those
 * sites. A shared record with format-specific optionals keeps the common paths
 * — render, store an answer, mark it — genuinely common.
 */
export interface Question {
  id: string;
  courseId: string;
  format: QuestionFormat;
  /** Taken from the section of its source. Questions without one still work everywhere. */
  topicId?: string;
  difficulty: Difficulty;
  /** Marks this question is worth in an exam. Practice ignores it. */
  marks: number;
  prompt: string;
  /** Flashcard back, or the model answer a self-check is compared with. */
  answer?: string;
  /** multiple-choice. */
  options?: string[];
  /** Indices into `options`. One entry for multiple-choice. */
  correctIndices?: number[];
  /** matching. */
  pairs?: MatchPair[];
  /** ordering: the correct sequence, top to bottom. */
  sequence?: string[];
  /** cloze: the text with `___` marking each blank. */
  template?: string;
  /** cloze: accepted answers per blank, compared without case. */
  blanks?: string[][];
  /** numeric: the computed answer, how far off still counts, and the unit. */
  numeric?: { value: number; tolerance: number; unit?: string };
  /** Shown after marking, for every format. */
  explanation: string;
  source?: SourceRef;
  /** Set on questions a model wrote. Authored questions have none. */
  provenance?: QuestionProvenance;
}

/**
 * How a question was made: built by code from the material's facts, or written by a model and
 * checked against the source. Kept with the question so a set can say where it came from.
 */
export interface QuestionProvenance {
  kind: 'built' | 'generated';
  /** The model that wrote it, when one did. */
  model?: string;
  generatedAt: string;
  materialIds: string[];
  /** The facts it tests. */
  factIds?: string[];
}

/* ── Attempts: the single record of everything a student does ─────────── */

/**
 * How much help was available. The brief asks that supported learning and
 * independent assessment stay distinguishable, and this is the field that
 * keeps them apart everywhere downstream.
 *
 *   tutored      worked through with the tutor, hints on tap
 *   practice     practice suite, hints may or may not have been used
 *   self-rated   the student graded their own recall (flashcards)
 *   exam         independent, under exam conditions
 */
export type AttemptMode = 'tutored' | 'practice' | 'self-rated' | 'exam';

export type Outcome = 'correct' | 'partial' | 'incorrect' | 'skipped';

export interface QuestionAttempt {
  questionId: string;
  topicId?: string;
  format: QuestionFormat;
  /** The student's raw answer, in whatever shape the format uses. */
  response: AnswerValue;
  outcome: Outcome;
  marksAwarded: number;
  marksAvailable: number;
  usedHint: boolean;
}

/** Every shape an answer can take, across every format. */
export type AnswerValue =
  | { kind: 'none' }
  | { kind: 'choice'; indices: number[] }
  | { kind: 'text'; text: string }
  | { kind: 'blanks'; values: string[] }
  | { kind: 'ordering'; sequence: string[] }
  | { kind: 'matching'; assignments: Record<string, string> }
  | { kind: 'number'; value: string }
  | { kind: 'self-rating'; rating: SelfRating }
  | { kind: 'self-check'; text: string; mark: SelfMark | null };

export type SelfRating = 'again' | 'hard' | 'good' | 'easy';
/** How a student marks their own answer against the model answer. */
export type SelfMark = 'got' | 'partly' | 'missed';

export type AttemptKind = 'practice' | 'exam' | 'tutor';

export interface Attempt {
  examConfigSnapshot?: ExamConfig;
  id: string;
  courseId: string;
  kind: AttemptKind;
  mode: AttemptMode;
  /** What the student called it, or a generated name. */
  title: string;
  topicIds: string[];
  startedAt: string;
  completedAt?: string;
  questions: QuestionAttempt[];
  marksAwarded: number;
  marksAvailable: number;
  /** Set for exams, so results can re-read the configuration. */
  examConfigId?: string;
  /** The saved practice set this attempt ran, when it came from one. */
  practiceSetId?: string;
  /** The planned assessment this rehearsal was preparing for, if any. */
  assessmentId?: string;
  /** The planner session this attempt completed, so it completes it once. */
  plannedSessionId?: string;
  /** Set when this attempt was created to fix a specific earlier mistake. */
  remediatesAttemptId?: string;
  /**
   * How an exam ended. Results say so, because "you ran out of time" and "you
   * submitted" explain a low mark very differently and the student deserves
   * the distinction.
   */
  finish?: 'manual' | 'expired';
  /**
   * Whether the per-question `usedHint` record can be trusted.
   *
   * Runs started before assistance tracking was reliable are marked `unknown`
   * and are never counted as independent evidence. The alternative — assuming
   * no hints were taken — would silently promote assisted work to exam
   * evidence, which is the one thing the evidence ladder exists to prevent.
   */
  assistanceRecord?: 'tracked' | 'unknown';
}

/* ── Tutor ────────────────────────────────────────────────────────────── */

export type TutorStage = 'orient' | 'understand' | 'recall' | 'reason' | 'apply' | 'reflect';

export type TutorRole = 'tutor' | 'student';

export interface TutorTurn {
  id: string;
  role: TutorRole;
  text: string;
  stage: TutorStage;
  /** Material the tutor is pointing at, rendered as a link. */
  source?: SourceRef;
  /** Suggested replies offered with a tutor turn. */
  suggestions?: TutorSuggestion[];
  /** Marks a scripted-scope disclosure rather than teaching content. */
  meta?: boolean;
  /**
   * The model that wrote this turn. Tutor turns without one were authored
   * responses from an earlier build.
   */
  model?: string;
  /** `interrupted` turns were cut off and are not complete teaching. */
  status?: 'complete' | 'interrupted';
  /** How far the reply rests on the course material. */
  grounding?: 'materials' | 'mixed' | 'general' | 'insufficient';
  /** Validated block citations in the text, in citation order. */
  citations?: SourceRef[];
  /** Citations the model made to passages it was not given, removed. */
  droppedCitations?: number;
}

export interface TutorSuggestion {
  label: string;
  /** Which authored branch this takes. */
  intent: TutorIntent;
}

export type TutorIntent =
  'explain' | 'simpler' | 'example' | 'hint' | 'answer' | 'check' | 'why' | 'practice' | 'continue' | 'summary';

export interface AnswerReview {
  attemptId: string;
  questionId: string;
  courseId: string;
  topicId?: string;
  prompt: string;
  response: string;
  answerKey: string;
  feedback: string;
  marksAwarded: number;
  marksAvailable: number;
  usedHint: boolean;
}

/* ── Practice ─────────────────────────────────────────────────────────── */

export type ActivityType = 'flashcards' | 'quiz' | 'self-check';

/* ── Exams ────────────────────────────────────────────────────────────── */

export type NavigationMode = 'free' | 'sequential';
export type TimingMode = 'overall' | 'per-section' | 'untimed';
export type BookMode = 'closed' | 'open';

export interface ExamSection {
  id: string;
  title: string;
  instructions: string;
  formats: QuestionFormat[];
  topicIds: string[];
  count: number;
  /** Only used when timing is `per-section`. */
  minutes: number;
}

export interface ExamConfig {
  archived?: boolean;
  id: string;
  courseId: string;
  name: string;
  sections: ExamSection[];
  timing: TimingMode;
  /** Whole-paper minutes. Used when timing is `overall`. */
  totalMinutes: number;
  /** Percentage extra time, 0–100. Applied to whichever timer is running. */
  extraTimePercent: number;
  book: BookMode;
  /** Material ids the student may consult. Only meaningful when open book. */
  allowedMaterialIds: string[];
  navigation: NavigationMode;
  flaggingEnabled: boolean;
  /**
   * Whether finishing a section locks its answers.
   *
   * This is the only thing "finishing a section" does now. It never releases
   * feedback: under exam conditions nothing is marked until the whole paper is
   * submitted, so a locked section can be re-read but not re-answered, and the
   * student is told which it will be before they confirm.
   */
  lockSectionsOnFinish: boolean;
  /** Planned assessments this configuration rehearses for. */
  assessmentIds?: string[];
  /** True for the built-in presets, which cannot be deleted. */
  preset?: boolean;
  savedAt: string;
}

/** A section-timer expiry, recorded so results can explain what happened. */
export interface SectionOutcome {
  sectionId: string;
  /** How the section ended. */
  ended: 'submitted' | 'expired';
  endedAt: string;
}

export interface ExamRun {
  id: string;
  courseId: string;
  configId: string;
  configSnapshot: ExamConfig;
  /** Question ids per section, resolved at start so a reload is stable. */
  sectionQuestions: Record<string, string[]>;
  answers: Record<string, AnswerValue>;
  flagged: string[];
  startedAt: string;
  /** Deadline for the whole paper, when timing is `overall`. */
  deadlineAt?: string;
  /**
   * Deadline per section id, when timing is `per-section`.
   *
   * A map rather than one "current section" deadline, because free navigation
   * means a student can leave a section and come back. A single field would
   * have to be recomputed on re-entry, which hands out a fresh allowance every
   * time the student returns. Every section's clock starts when it is first
   * entered and then runs down whether or not it is on screen, so a reload or
   * a detour cannot buy more time.
   */
  sectionDeadlines: Record<string, string>;
  currentSectionIndex: number;
  currentQuestionIndex: number;
  /** Sections whose answers are locked and can only be re-read. */
  lockedSectionIds: string[];
  sectionOutcomes: SectionOutcome[];
  /**
   * The planner session this paper was opened from, when it was.
   *
   * Carried on the run rather than passed at submission, because submission
   * can happen after a reload, in another tab, or from a timer expiring while
   * the student is elsewhere. The link has to survive all of those, and the
   * run is the only thing that does.
   */
  plannedSessionId?: string;
  /** The planned assessment this rehearsal was launched to prepare for. */
  assessmentId?: string;
  /** Set when the paper is finished. Results read from the attempt. */
  finishedAt?: string;
  attemptId?: string;
  /** How the paper ended, for the results header. */
  finish?: 'manual' | 'expired';
}

/* ── Planned assessments ──────────────────────────────────────────────── */

/**
 * A real course milestone: the week-four quiz, the midterm, the final.
 *
 * ── Three objects, deliberately kept apart ────────────────────────────────
 *
 * A `PlannedAssessment` is a thing that happens to the student on a date the
 * institution chose. An `ExamConfig` is a rehearsal setup the student built. An
 * `Attempt` is one run of a rehearsal. The previous checkpoint had a single
 * `examDate` on the course and called all three "the exam", which meant a
 * rehearsal could not be distinguished from the thing it rehearsed for.
 *
 * Keeping them separate is what lets a course have four assessments, each with
 * its own coverage, and lets one of them be rehearsed five times without any of
 * those rehearsals being mistaken for the assessment itself.
 */
export type AssessmentType = 'quiz' | 'midterm' | 'final' | 'essay' | 'presentation' | 'other';

export interface PlannedAssessment {
  id: string;
  courseId: string;
  title: string;
  type: AssessmentType;
  /**
   * ISO date (YYYY-MM-DD). Null when the syllabus names the assessment without
   * a date. Undated assessments do not affect scheduling until dated.
   */
  date: string | null;
  /**
   * HH:MM, when the student knows it. Optional because a syllabus often gives
   * only a date, and inventing "09:00" would be a fact the prototype made up.
   */
  time?: string;
  /** Minutes the assessment itself lasts, when known. */
  durationMinutes?: number;
  /** Topics the assessment covers. Empty means "not recorded yet". */
  topicIds: string[];
  /** Percentage of the final grade, when the student recorded one. */
  weightPercent?: number;
  notes?: string;
  createdAt: string;
}

/* ── The planner ──────────────────────────────────────────────────────── */

/** 0 = Sunday, matching `Date.getDay()`. */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/** A window of time on one weekday, as minutes from midnight. */
export interface AvailabilityWindow {
  id: string;
  day: Weekday;
  /** Minutes from midnight. 9:30am is 570. */
  startMinutes: number;
  endMinutes: number;
}

/**
 * A day that does not follow the weekly pattern.
 *
 * `windows` replaces that day's recurring windows entirely — an empty list
 * means "nothing available", which is how a student says they are away.
 */
export interface AvailabilityException {
  id: string;
  /** ISO date (YYYY-MM-DD). */
  date: string;
  windows: { startMinutes: number; endMinutes: number }[];
  note?: string;
}

export interface Availability {
  windows: AvailabilityWindow[];
  exceptions: AvailabilityException[];
  /** Minutes the student prefers a single sitting to last. */
  sessionMinutes: number;
}

/** What a scheduled session is for. Decides which activity it opens. */
export type SessionActivity = 'tutor' | 'read' | 'practice' | 'flashcards' | 'exam' | 'review' | 'other';

export type SessionStatus = 'planned' | 'completed' | 'skipped';

/**
 * One block of study on the calendar.
 *
 * ── Why the link is a reference and not a copy ────────────────────────────
 *
 * `link` names what the session opens — a material, a saved set, an exam
 * configuration, a topic to tutor. Completing that activity completes this
 * session, exactly once, by id. Storing a copy of the target would mean a
 * renamed set leaves the planner describing something that no longer exists.
 */
export interface PlannedSession {
  id: string;
  courseId: string;
  /** ISO date (YYYY-MM-DD). */
  date: string;
  /** Minutes from midnight. */
  startMinutes: number;
  durationMinutes: number;
  title: string;
  activity: SessionActivity;
  topicIds: string[];
  /** The assessment this session is preparing for, when it has one. */
  assessmentId?: string;
  /** What this session opens, with its context preselected. */
  link?: SessionLink;
  status: SessionStatus;
  completedAt?: string;
  /** The attempt or tutor session that completed this. Set once. */
  completedBy?: string;
  /**
   * Set when "Plan my week" created this session. A student who edits a
   * generated session makes it theirs — `locked` goes true and regeneration
   * leaves it alone.
   */
  generated?: boolean;
  locked?: boolean;
  /** Why the planner proposed this. Shown on the session. */
  reason?: string;
  createdAt: string;
}

export type SessionLink =
  | { kind: 'mistake-review'; attemptId: string; questionIds: string[] }
  | { kind: 'material'; materialId: string }
  | { kind: 'practice-set'; setId: string }
  | { kind: 'exam-config'; configId: string }
  | { kind: 'tutor'; topicId: string }
  | { kind: 'practice-new'; topicIds: string[]; activity: ActivityType };

/**
 * A proposed week, before it is applied.
 *
 * The brief asks that a plan be inspectable before it changes anything, and
 * that work which does not fit be shown rather than quietly dropped. So the
 * proposal carries both: the sessions it would add, and the work it could not
 * place, with the reason.
 */
export interface PlanProposal {
  /** The Monday of the week this plans, as an ISO date. */
  weekStart: string;
  sessions: PlannedSession[];
  /** Sessions already on the calendar that the proposal keeps as they are. */
  keptSessionIds: string[];
  unscheduled: UnscheduledWork[];
  /** Minutes of availability the proposal used, and how many there were. */
  minutesPlanned: number;
  minutesAvailable: number;
  notes: string[];
}

export interface UnscheduledWork {
  courseId: string;
  title: string;
  minutes: number;
  reason: string;
}

/* ── Plan, check-ins and progress ─────────────────────────────────────── */

export type CheckInMood = 'less-time' | 'on-track' | 'struggling' | 'confident';

export interface CheckIn {
  id: string;
  mood: CheckInMood;
  /** The course the difficult topic belongs to, when one was named. */
  courseId?: string;
  /** Topic the student named as difficult, when they named one. */
  topicId?: string;
  /** Minutes available today, when they said it differs from the norm. */
  minutesToday?: number;
  note?: string;
  at: string;
}

/** What the plan suggests next. Recomputed from state, never stored stale. */
export interface Suggestion {
  id: string;
  courseId: string;
  title: string;
  /** Why this is being suggested. The brief asks for visible reasons. */
  reason: string;
  minutes: number;
  /** Route to open. */
  to: string;
  topicId?: string;
  kind: 'tutor' | 'practice' | 'exam' | 'review' | 'setup' | 'materials';
  /** Ordering weight; higher first. */
  weight: number;
  /** The planner session this suggestion came from, when it came from one. */
  sessionId?: string;
}

/**
 * A topic's mastery, read from its sections' marked answers (`mastery.ts`), practice, exams and
 * tutor questions alike. It sits beside topic evidence, which counts only unaided exam work as
 * independent, rather than replacing it.
 */
export interface TopicMastery {
  courseId: string;
  topicId: string;
  level: 'not-checked' | 'shaky' | 'learning' | 'secure';
  /** Sections the topic introduces or covers, and how many of them have marked answers. */
  sections: number;
  answered: number;
  secure: number;
  shaky: number;
  due: number;
  dueOn: string | null;
  lastDay: string | null;
  daysSince: number | null;
}

/** A topic with a section due for review under the mastery ladder (`mastery.ts`). */
export interface ReviewDue {
  courseId: string;
  topicId: string;
  /** Days since a section of this topic was last answered. */
  daysSince: number;
  /** The earliest local date one of its sections came due. */
  dueOn: string;
}

/**
 * The four evidence levels, carried over from the earlier prototype because
 * the distinction is exactly what the brief asks for: practice with help,
 * self-rated recall and independent exam work must not collapse into one
 * number. The ramp tokens in `globals.css` are keyed to these names.
 */
export type EvidenceLevel = 'not-checked' | 'practising' | 'independent-once' | 'retained';

export interface TopicEvidence {
  courseId: string;
  topicId: string;
  level: EvidenceLevel;
  /** Counts the level is derived from, so the student can inspect it. */
  tutored: number;
  practised: number;
  selfRated: number;
  independent: number;
  independentCorrect: number;
  /** Attempt ids contributing, newest first. */
  attemptIds: string[];
  lastWorkedAt?: string;
}

/** A question the student has got wrong more than once. */
export interface RecurringMistake {
  courseId: string;
  questionId: string;
  topicId?: string;
  prompt: string;
  times: number;
  lastAttemptId: string;
  lastAt: string;
}

/** An assessment with a date, the only kind that affects scheduling. */
export type DatedAssessment = PlannedAssessment & { date: string };
export const isDated = <T extends PlannedAssessment>(a: T): a is T & { date: string } => a.date !== null;
