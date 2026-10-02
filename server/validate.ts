import {
  AI_LIMITS,
  type AiPassage,
  type AiTopic,
  type GenerateRequest,
  type GeneratedQuestion,
  type GradePoint,
  type GradeRequest,
  type TutorRequest,
  type TutorTurn,
} from '../src/shared/ai.ts';
import type { Difficulty, TutorStage } from '../src/shared/types.ts';

/**
 * Runtime checks for everything that crosses the server boundary: request
 * bodies from the browser, and structured output from the model. Both are
 * treated as untrusted. A body that fails is refused with the first reason
 * found, and model output that fails is dropped rather than repaired.
 */

export class InvalidBody extends Error {}

const STAGES: TutorStage[] = ['orient', 'understand', 'recall', 'reason', 'apply', 'reflect'];
const DIFFICULTIES: Difficulty[] = ['recall', 'reasoning', 'stretch'];

type Obj = Record<string, unknown>;

function obj(value: unknown, what: string): Obj {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new InvalidBody(`${what} must be an object.`);
  }
  return value as Obj;
}

function text(value: unknown, what: string, max: number, { allowEmpty = false } = {}): string {
  if (typeof value !== 'string') throw new InvalidBody(`${what} must be text.`);
  if (!allowEmpty && !value.trim()) throw new InvalidBody(`${what} is empty.`);
  if (value.length > max) throw new InvalidBody(`${what} is longer than ${max} characters.`);
  return value;
}

function list(value: unknown, what: string, max: number): unknown[] {
  if (!Array.isArray(value)) throw new InvalidBody(`${what} must be a list.`);
  if (value.length > max) throw new InvalidBody(`${what} has more than ${max} entries.`);
  return value;
}

function oneOf<T extends string>(value: unknown, options: readonly T[], what: string): T {
  if (typeof value !== 'string' || !options.includes(value as T)) {
    throw new InvalidBody(`${what} must be one of ${options.join(', ')}.`);
  }
  return value as T;
}

function id(value: unknown, what: string): string {
  const v = text(value, what, 200);
  if (!/^[\w.:-]+$/.test(v)) throw new InvalidBody(`${what} is not a valid id.`);
  return v;
}

function topic(value: unknown): AiTopic {
  const t = obj(value, 'topic');
  return {
    id: id(t.id, 'topic id'),
    title: text(t.title, 'topic title', 300),
    summary: text(t.summary ?? '', 'topic summary', 1000, { allowEmpty: true }),
  };
}

/** Passages, each required to belong to the request's own course. */
function passages(value: unknown, courseId: string): AiPassage[] {
  const rows = list(value, 'passages', AI_LIMITS.maxPassages).map((row) => {
    const p = obj(row, 'passage');
    const passage: AiPassage = {
      id: id(p.id, 'passage id'),
      materialId: id(p.materialId, 'material id'),
      courseId: id(p.courseId, 'passage course'),
      materialTitle: text(p.materialTitle, 'material title', 300),
      heading: text(p.heading ?? '', 'passage heading', 300, { allowEmpty: true }),
      text: text(p.text, 'passage text', AI_LIMITS.maxPassageChars),
      topicIds: list(p.topicIds ?? [], 'passage topics', 50).map((t) => id(t, 'topic id')),
    };
    if (passage.courseId !== courseId) {
      throw new InvalidBody('A passage from another course was included. Requests are limited to one course.');
    }
    return passage;
  });
  const total = rows.reduce((sum, p) => sum + p.text.length, 0);
  if (total > AI_LIMITS.maxContextChars) {
    throw new InvalidBody(`The passages total ${total} characters, above the ${AI_LIMITS.maxContextChars} limit.`);
  }
  if (new Set(rows.map((p) => p.id)).size !== rows.length) {
    throw new InvalidBody('Passage ids must be unique.');
  }
  return rows;
}

export function tutorRequest(body: unknown): TutorRequest {
  const b = obj(body, 'request');
  const courseId = id(b.courseId, 'course id');
  const ps = passages(b.passages, courseId);
  const focus = b.focusPassageId === undefined ? undefined : id(b.focusPassageId, 'focus passage');
  if (focus && !ps.some((p) => p.id === focus)) {
    throw new InvalidBody('The focus passage is not among the supplied passages.');
  }
  const history: TutorTurn[] = list(b.history ?? [], 'history', AI_LIMITS.maxHistoryTurns).map((row) => {
    const h = obj(row, 'turn');
    return {
      role: oneOf(h.role, ['tutor', 'student'] as const, 'turn role'),
      text: text(h.text, 'turn text', AI_LIMITS.maxResponseChars),
      ...(h.interrupted === true ? { interrupted: true } : {}),
    };
  });
  return {
    courseId,
    courseName: text(b.courseName, 'course name', 300),
    ...(b.review === undefined ? {} : { review: (() => {
      const r = obj(b.review, 'answer review');
      const reviewCourse = id(r.courseId, 'review course');
      const reviewTopic = id(r.topicId, 'review topic');
      if (reviewCourse !== courseId || reviewTopic !== topic(b.topic).id) throw new InvalidBody('The answer review must belong to this course and topic.');
      if (typeof r.marksAwarded !== 'number' || typeof r.marksAvailable !== 'number' || !Number.isFinite(r.marksAwarded) || !Number.isFinite(r.marksAvailable) || r.marksAwarded < 0 || r.marksAvailable < r.marksAwarded) throw new InvalidBody('Invalid review marks.');
      if (typeof r.usedHint !== 'boolean' || typeof r.pending !== 'boolean') throw new InvalidBody('Invalid review assistance or feedback state.');
      return { attemptId: id(r.attemptId, 'review attempt'), questionId: id(r.questionId, 'review question'), courseId: reviewCourse, topicId: reviewTopic,
        prompt: text(r.prompt, 'review prompt', 6000), response: text(r.response, 'review response', 6000, { allowEmpty: true }),
        answerKey: text(r.answerKey, 'review key', 6000, { allowEmpty: true }), feedback: text(r.feedback, 'review feedback', 6000, { allowEmpty: true }),
        marksAwarded: r.marksAwarded, marksAvailable: r.marksAvailable, usedHint: r.usedHint, pending: r.pending };
    })() }),
    topic: topic(b.topic),
    stage: oneOf(b.stage, STAGES, 'stage'),
    action: oneOf(b.action, ['message', 'explain', 'example', 'hint', 'check', 'simpler'] as const, 'action'),
    message: text(b.message, 'message', AI_LIMITS.maxMessageChars),
    ...(focus ? { focusPassageId: focus } : {}),
    passages: ps,
    history,
    priorWork: list(b.priorWork ?? [], 'prior work', 12).map((l) => text(l, 'prior work line', 400)),
  };
}

export function generateRequest(body: unknown): GenerateRequest {
  const b = obj(body, 'request');
  const courseId = id(b.courseId, 'course id');
  const count = b.count;
  if (typeof count !== 'number' || !Number.isInteger(count) || count < 1 || count > AI_LIMITS.maxQuestionsPerRequest) {
    throw new InvalidBody(`count must be a whole number from 1 to ${AI_LIMITS.maxQuestionsPerRequest}.`);
  }
  const topics = list(b.topics, 'topics', 40).map(topic);
  if (topics.length === 0) throw new InvalidBody('Select at least one topic.');
  const ps = passages(b.passages, courseId);
  if (ps.length === 0) throw new InvalidBody('There is no readable material to generate from.');
  const difficulties = list(b.difficulties, 'difficulties', 3).map((d) => oneOf(d, DIFFICULTIES, 'difficulty'));
  if (difficulties.length === 0) throw new InvalidBody('Select at least one difficulty.');
  return {
    courseId,
    courseName: text(b.courseName, 'course name', 300),
    format: oneOf(b.format, ['flashcard', 'multiple-choice', 'written-recall'] as const, 'format'),
    count,
    difficulties,
    topics,
    passages: ps,
  };
}

export function gradeRequest(body: unknown): GradeRequest {
  const b = obj(body, 'request');
  const courseId = id(b.courseId, 'course id');
  const rubric = list(b.rubric, 'rubric', 12).map((row) => {
    const r = obj(row, 'rubric point');
    const marks = r.marks;
    if (typeof marks !== 'number' || !Number.isInteger(marks) || marks < 1 || marks > 50) {
      throw new InvalidBody('Rubric marks must be whole numbers from 1 to 50.');
    }
    return { id: id(r.id, 'rubric id'), label: text(r.label, 'rubric label', 1000), marks };
  });
  if (rubric.length === 0) throw new InvalidBody('A rubric is required.');
  if (new Set(rubric.map((r) => r.id)).size !== rubric.length) {
    throw new InvalidBody('Rubric ids must be unique.');
  }
  return {
    courseId,
    prompt: text(b.prompt, 'question', 4000),
    modelAnswer: text(b.modelAnswer ?? '', 'model answer', 6000, { allowEmpty: true }),
    rubric,
    passages: passages(b.passages ?? [], courseId),
    response: text(b.response, 'answer', 20000),
  };
}

/* ── Model output ───────────────────────────────────────────────────────── */

function clean(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const v = value.trim();
  return v && v.length <= max ? v : null;
}

/**
 * Checks one generated question against the request. Returns null when any
 * part fails: an answer key out of range, duplicated options, a rubric that
 * does not add up, or a source or topic that was not supplied.
 */
export function generatedQuestion(raw: unknown, request: GenerateRequest): GeneratedQuestion | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const q = raw as Obj;
  const topicIds = new Set(request.topics.map((t) => t.id));
  const passageIds = new Set(request.passages.map((p) => p.id));

  const topicId = typeof q.topicId === 'string' && topicIds.has(q.topicId) ? q.topicId : null;
  const sourcePassageId =
    typeof q.sourcePassageId === 'string' && passageIds.has(q.sourcePassageId) ? q.sourcePassageId : null;
  const difficulty =
    typeof q.difficulty === 'string' && request.difficulties.includes(q.difficulty as Difficulty)
      ? (q.difficulty as Difficulty)
      : null;
  const prompt = clean(q.prompt, 1200);
  const explanation = clean(q.explanation, 2000);
  if (!topicId || !sourcePassageId || !difficulty || !prompt || !explanation) return null;

  const base = { topicId, sourcePassageId, difficulty, prompt, explanation };

  switch (request.format) {
    case 'flashcard': {
      const answer = clean(q.answer, 1500);
      return answer ? { ...base, answer } : null;
    }
    case 'multiple-choice': {
      if (!Array.isArray(q.options) || q.options.length < 3 || q.options.length > 6) return null;
      const options = q.options.map((o) => clean(o, 400));
      if (options.some((o) => o === null)) return null;
      const normalised = options.map((o) => o!.toLowerCase().replace(/\s+/g, ' '));
      if (new Set(normalised).size !== options.length) return null;
      const index = q.correctIndex;
      if (typeof index !== 'number' || !Number.isInteger(index) || index < 0 || index >= options.length) {
        return null;
      }
      return { ...base, options: options as string[], correctIndex: index, answer: options[index]! };
    }
    case 'written-recall': {
      const answer = clean(q.answer, 3000);
      if (!answer || !Array.isArray(q.rubric) || q.rubric.length < 2 || q.rubric.length > 5) return null;
      const rubric = q.rubric.map((row) => {
        if (typeof row !== 'object' || row === null) return null;
        const r = row as Obj;
        const label = clean(r.label, 400);
        const missedAdvice = clean(r.missedAdvice, 600);
        const marks = r.marks;
        if (!label || !missedAdvice) return null;
        if (typeof marks !== 'number' || !Number.isInteger(marks) || marks < 1 || marks > 5) return null;
        return { label, marks, missedAdvice };
      });
      if (rubric.some((r) => r === null)) return null;
      const total = rubric.reduce((sum, r) => sum + r!.marks, 0);
      if (total < 2 || total > 12) return null;
      return { ...base, answer, rubric: rubric as NonNullable<(typeof rubric)[number]>[] };
    }
  }
}

export function gradeOutput(raw: unknown, request: GradeRequest): { points: GradePoint[]; summary: string } | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const g = raw as Obj;
  const summary = clean(g.summary, 2000);
  if (!summary || !Array.isArray(g.points)) return null;
  const byId = new Map<string, GradePoint>();
  for (const row of g.points) {
    if (typeof row !== 'object' || row === null) return null;
    const p = row as Obj;
    const point = request.rubric.find((r) => r.id === p.rubricId);
    const feedback = clean(p.feedback, 1200);
    const awarded = p.awarded;
    if (!point || !feedback || byId.has(point.id)) return null;
    if (typeof awarded !== 'number' || !Number.isInteger(awarded) || awarded < 0 || awarded > point.marks) {
      return null;
    }
    byId.set(point.id, { rubricId: point.id, awarded, feedback });
  }
  if (byId.size !== request.rubric.length) return null;
  return { points: request.rubric.map((r) => byId.get(r.id)!), summary };
}

export { STAGES };
