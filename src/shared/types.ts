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
 * One course. Topics hang off it. Materials are the reading; passages are the
 * addressable unit inside a material, because "ask the tutor about this bit"
 * and "this exam question came from that bit" both need an id to point at.
 * Everything a student does becomes an `Attempt`, and Progress is a read over
 * the attempt log rather than a separate score that can drift away from it.
 */

/* ── Course and topics ────────────────────────────────────────────────── */

export interface Course {
  id: string;
  name: string;
  /** The student's own words for what they are trying to achieve. */
  goal: string;
  /** ISO date (YYYY-MM-DD). The exam being prepared for. */
  examDate: string;
  /** Minutes the student says they can give it on a normal day. */
  dailyMinutes: number;
  /** Set when the student finished setup rather than landing on the seed. */
  createdAt: string;
}

/** How much the student wants to weight a topic. Drives plan ordering. */
export type TopicPriority = 'low' | 'normal' | 'high';

export interface Topic {
  id: string;
  title: string;
  /** One sentence. Shown under the title everywhere a topic is listed. */
  summary: string;
  priority: TopicPriority;
  /** Ids of other topics this is usually compared or contrasted with. */
  relatedTopicIds: string[];
}

/* ── Materials ────────────────────────────────────────────────────────── */

export type MaterialKind = 'reading' | 'lecture-notes' | 'student-note';

/**
 * How a material's text got here. This is the honesty flag: the prototype
 * cannot parse a PDF, so anything that is not real text says so.
 *
 *   authored   seeded course content, written for this prototype
 *   pasted     the student pasted text in
 *   text-file  a .txt/.md file read in the browser with the File API
 *   preview    an unsupported file type. The text is a labelled sample, and
 *              every surface that shows it says the file was not parsed.
 */
export type MaterialOrigin = 'authored' | 'pasted' | 'text-file' | 'preview';

export interface Passage {
  id: string;
  /** Usually a heading; falls back to "Passage 3" style numbering. */
  heading: string;
  text: string;
  /** Topics this passage is evidence for. Drives "practise this" actions. */
  topicIds: string[];
}

export interface Material {
  id: string;
  title: string;
  kind: MaterialKind;
  origin: MaterialOrigin;
  /** Fictional attribution, always labelled as such in the UI. */
  attribution?: string;
  /** The original filename, when one exists. Shown for previews. */
  fileName?: string;
  topicIds: string[];
  passages: Passage[];
  addedAt: string;
}

/* ── Questions ────────────────────────────────────────────────────────── */

export type QuestionFormat =
  | 'flashcard'
  | 'multiple-choice'
  | 'multiple-select'
  | 'matching'
  | 'ordering'
  | 'fill-blank'
  | 'written-recall'
  | 'source-analysis'
  | 'essay';

export type Difficulty = 'recall' | 'reasoning' | 'stretch';

/** Where a question points back to in the library. */
export interface SourceRef {
  materialId: string;
  passageId: string;
}

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
  format: QuestionFormat;
  topicId: string;
  difficulty: Difficulty;
  /** Marks this question is worth in an exam. Practice ignores it. */
  marks: number;
  prompt: string;
  /** Flashcard back, or the model answer's headline for other formats. */
  answer?: string;
  /** multiple-choice / multiple-select. */
  options?: string[];
  /** Indices into `options`. One entry for multiple-choice. */
  correctIndices?: number[];
  /** matching. */
  pairs?: MatchPair[];
  /** ordering — the correct sequence, top to bottom. */
  sequence?: string[];
  /** fill-blank — the text with `___` marking each blank. */
  template?: string;
  /** fill-blank — accepted answers per blank, lowercased on comparison. */
  blanks?: string[][];
  /** source-analysis / essay — the passage or extract the question is about. */
  extract?: string;
  /** The rubric points a written answer is marked against. */
  rubric?: RubricPoint[];
  /** Shown after marking, for every format. */
  explanation: string;
  source?: SourceRef;
}

export interface RubricPoint {
  id: string;
  /** What the marker is looking for. Shown to the student after submission. */
  label: string;
  marks: number;
  /**
   * Lowercased keywords. If an answer contains any, the simulated marker
   * credits the point. This is string matching, labelled as such in the UI —
   * it is not comprehension and the prototype never says it is.
   */
  keywords: string[];
  /** Said when the point was missed. */
  missedAdvice: string;
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
  topicId: string;
  format: QuestionFormat;
  /** The student's raw answer, in whatever shape the format uses. */
  response: AnswerValue;
  outcome: Outcome;
  marksAwarded: number;
  marksAvailable: number;
  usedHint: boolean;
  /** Rubric point ids credited, for written formats. */
  creditedRubricIds?: string[];
}

/** Every shape an answer can take, across every format. */
export type AnswerValue =
  | { kind: 'none' }
  | { kind: 'choice'; indices: number[] }
  | { kind: 'text'; text: string }
  | { kind: 'blanks'; values: string[] }
  | { kind: 'ordering'; sequence: string[] }
  | { kind: 'matching'; assignments: Record<string, string> }
  | { kind: 'self-rating'; rating: SelfRating };

export type SelfRating = 'again' | 'hard' | 'good' | 'easy';

export type AttemptKind = 'practice' | 'exam' | 'tutor';

export interface Attempt {
  id: string;
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
  /** Set when this attempt was created to fix a specific earlier mistake. */
  remediatesAttemptId?: string;
  /**
   * How an exam ended. Results say so, because "you ran out of time" and "you
   * submitted" explain a low mark very differently and the student deserves
   * the distinction.
   */
  finish?: 'manual' | 'expired';
}

/* ── Tutor ────────────────────────────────────────────────────────────── */

export type TutorStage =
  | 'orient'
  | 'understand'
  | 'recall'
  | 'reason'
  | 'apply'
  | 'reflect';

export type TutorRole = 'tutor' | 'student';

export interface TutorMessage {
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
}

export interface TutorSuggestion {
  label: string;
  /** Which authored branch this takes. */
  intent: TutorIntent;
}

export type TutorIntent =
  | 'explain'
  | 'simpler'
  | 'example'
  | 'hint'
  | 'answer'
  | 'check'
  | 'why'
  | 'practice'
  | 'continue'
  | 'summary';

export interface TutorSession {
  id: string;
  topicId: string;
  /** Set when the session was opened from a passage. */
  source?: SourceRef;
  /** Set when the session was opened to review a specific exam mistake. */
  fromAttemptId?: string;
  fromQuestionId?: string;
  messages: TutorMessage[];
  stage: TutorStage;
  startedAt: string;
  updatedAt: string;
  /** Set when the student ended the session and saw a summary. */
  endedAt?: string;
  /** Practice sets launched from inside this session. */
  launchedAttemptIds: string[];
}

/* ── Practice ─────────────────────────────────────────────────────────── */

export type ActivityType =
  | 'flashcards'
  | 'quiz'
  | 'written-recall'
  | 'source-analysis'
  | 'essay';

export type FeedbackTiming = 'immediate' | 'end';

export interface PracticeConfig {
  activity: ActivityType;
  topicIds: string[];
  materialIds: string[];
  /** Number of questions requested. Clamped to the authored pool. */
  length: number;
  difficulties: Difficulty[];
  hintsAllowed: boolean;
  feedback: FeedbackTiming;
}

export interface SavedPracticeSet {
  id: string;
  name: string;
  config: PracticeConfig;
  savedAt: string;
}

/* ── Exams ────────────────────────────────────────────────────────────── */

export type NavigationMode = 'free' | 'sequential';
export type TimingMode = 'overall' | 'per-section' | 'untimed';
export type BookMode = 'closed' | 'open';
export type FeedbackRelease = 'per-section' | 'final';

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
  id: string;
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
  tutorAllowed: boolean;
  navigation: NavigationMode;
  flaggingEnabled: boolean;
  feedback: FeedbackRelease;
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
  configId: string;
  configSnapshot: ExamConfig;
  /** Question ids per section, resolved at start so a reload is stable. */
  sectionQuestions: Record<string, string[]>;
  answers: Record<string, AnswerValue>;
  flagged: string[];
  startedAt: string;
  /** Deadline for the whole paper, when timing is `overall`. */
  deadlineAt?: string;
  /** Deadline for the current section, when timing is `per-section`. */
  sectionDeadlineAt?: string;
  currentSectionIndex: number;
  currentQuestionIndex: number;
  /** Sections whose answers are locked, because feedback was released. */
  lockedSectionIds: string[];
  sectionOutcomes: SectionOutcome[];
  /** Set when the paper is finished. Results read from the attempt. */
  finishedAt?: string;
  attemptId?: string;
  /** How the paper ended, for the results header. */
  finish?: 'manual' | 'expired';
}

/* ── Plan, check-ins and progress ─────────────────────────────────────── */

export type CheckInMood = 'less-time' | 'on-track' | 'struggling' | 'confident';

export interface CheckIn {
  id: string;
  mood: CheckInMood;
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
}

/** A review that has come due under the local spacing rule. */
export interface ReviewDue {
  topicId: string;
  /** Days since the last independent evidence for this topic. */
  daysSince: number;
  lastAttemptId?: string;
}

/**
 * The four evidence levels, carried over from the earlier prototype because
 * the distinction is exactly what the brief asks for: practice with help,
 * self-rated recall and independent exam work must not collapse into one
 * number. The ramp tokens in `globals.css` are keyed to these names.
 */
export type EvidenceLevel =
  | 'not-checked'
  | 'practising'
  | 'independent-once'
  | 'retained';

export interface TopicEvidence {
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
  questionId: string;
  topicId: string;
  prompt: string;
  times: number;
  lastAttemptId: string;
  lastAt: string;
}
