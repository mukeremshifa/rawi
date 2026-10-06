import type { AiPassage, TutorAction, TutorRequest, TutorTurn } from '@shared/ai.ts';
import { AI_LIMITS } from '@shared/ai.ts';
import { priorWorkLines, selectPassages, toAiTopic } from '@shared/ai-context.ts';
import type {
  Attempt,
  Course,
  Material,
  Question,
  SourceRef,
  Topic,
  TutorMessage,
  TutorSession,
  TutorStage,
} from '@shared/types.ts';

import { newId } from '@/lib/id';

/**
 * Tutor sessions: how they open, what a request carries, and how a session
 * is summarised.
 *
 * Every teaching turn is written by the model through the local API. Nothing
 * in this file writes teaching content. The one fixed message is the opening
 * note, which says what the tutor will use and is marked `meta` so it is
 * never mistaken for, or sent back as, teaching.
 */

export function studentMessage(text: string, stage: TutorStage): TutorMessage {
  return { id: newId('msg'), role: 'student', text, stage };
}

/** Creates a session. No request is made until the student asks something. */
export function openSession(params: {
  courseId: string;
  topic: Topic;
  source?: SourceRef;
  quote?: string;
  fromAttemptId?: string;
  fromQuestionId?: string;
  plannedSessionId?: string;
}): TutorSession {
  const now = new Date().toISOString();
  const messages: TutorMessage[] = [
    {
      id: newId('msg'),
      role: 'tutor',
      stage: 'orient',
      meta: true,
      text: params.fromAttemptId
        ? `This session is about a question you missed on ${params.topic.title}. Tell me how you approached it, or ask what went wrong. I will use your course material and say when I go beyond it.`
        : `Ask anything about ${params.topic.title}, or choose a starting point below. I will use your course material, cite the passages I rely on, and say when I go beyond it.`,
    },
  ];
  if (params.quote) {
    messages.push({
      id: newId('msg'),
      role: 'tutor',
      stage: 'orient',
      meta: true,
      text: `You highlighted:\n\n> ${params.quote}`,
      ...(params.source ? { source: params.source } : {}),
    });
  }

  return {
    id: newId('ses'),
    courseId: params.courseId,
    topicId: params.topic.id,
    messages,
    stage: 'orient',
    startedAt: now,
    updatedAt: now,
    launchedAttemptIds: [],
    ...(params.source ? { source: params.source } : {}),
    ...(params.fromAttemptId ? { fromAttemptId: params.fromAttemptId } : {}),
    ...(params.fromQuestionId ? { fromQuestionId: params.fromQuestionId } : {}),
    ...(params.plannedSessionId ? { plannedSessionId: params.plannedSessionId } : {}),
  };
}

/** The conversation as the model sees it: recent, bounded, no meta notes. */
function historyOf(messages: TutorMessage[]): TutorTurn[] {
  return messages
    .filter((m) => !m.meta)
    .slice(-AI_LIMITS.maxHistoryTurns)
    .map((m) => ({
      role: m.role,
      text: m.text.slice(0, 3000),
      ...(m.status === 'interrupted' ? { interrupted: true } : {}),
    }));
}

/**
 * Everything one tutor turn sends, built only from this course's records.
 *
 * `history` is the conversation *before* the new student message, which
 * travels separately so the model knows exactly what it is answering.
 */
export function buildTutorRequest(params: {
  course: Course;
  topic: Topic;
  session: TutorSession;
  history: TutorMessage[];
  message: string;
  action: TutorAction;
  materials: Material[];
  attempts: Attempt[];
  questions: Map<string, Question>;
}): TutorRequest {
  const { course, topic, session } = params;
  const fromQuestion = session.fromQuestionId
    ? params.questions.get(session.fromQuestionId)
    : undefined;
  const passages: AiPassage[] = selectPassages({
    courseId: course.id,
    materials: params.materials.filter((m) => m.courseId === course.id),
    topicIds: [topic.id],
    query: [
      params.message,
      topic.title,
      topic.summary,
      fromQuestion?.prompt ?? '',
      ...params.history.slice(-2).map((m) => m.text),
    ].join(' '),
    ...(session.source ? { focusPassageId: session.source.passageId } : {}),
  });
  const priorWork = priorWorkLines(
    topic.id,
    params.attempts.filter((a) => a.courseId === course.id),
    params.questions,
  );
  if (fromQuestion) {
    priorWork.unshift(`This session was opened to review the question: "${fromQuestion.prompt.slice(0, 300)}"`);
  }

  return {
    courseId: course.id,
    courseName: course.name,
    ...(session.review?.courseId === course.id && session.review.topicId === topic.id ? { review: session.review } : {}),
    topic: toAiTopic(topic),
    stage: session.stage,
    action: params.action,
    message: params.message.slice(0, AI_LIMITS.maxMessageChars),
    ...(session.source && passages.some((p) => p.id === session.source!.passageId)
      ? { focusPassageId: session.source.passageId }
      : {}),
    passages,
    history: historyOf(params.history),
    priorWork,
  };
}

/**
 * Turns validated citation ids back into source references, keeping only
 * passages that were sent in this request, and therefore belong to this
 * course. The server has already checked this, and the browser checks again
 * before any link is rendered.
 */
export function resolveCitations(ids: string[], passages: AiPassage[]): SourceRef[] {
  const byId = new Map(passages.map((p) => [p.id, p]));
  return ids
    .map((id) => byId.get(id))
    .filter((p): p is AiPassage => !!p)
    .map((p) => ({ materialId: p.materialId, passageId: p.id }));
}

/**
 * Replaces `[[passage-id]]` markers with numbered references. Markers for
 * passages not in `citations` are removed, and a marker still arriving at the
 * end of a streamed chunk is hidden until it is complete.
 */
export function renderCitations(text: string, citations: string[]): string {
  return text
    .replace(/\[\[([^\]\s]{1,200})\]\]/g, (_m, id: string) => {
      const n = citations.indexOf(id);
      return n >= 0 ? `[${n + 1}]` : '';
    })
    .replace(/\[\[[^\]]*$/, '');
}

/** Citation ids in the order they first appear in streamed text. */
export function citationOrder(text: string): string[] {
  const out: string[] = [];
  for (const match of text.matchAll(/\[\[([^\]\s]{1,200})\]\]/g)) {
    if (!out.includes(match[1]!)) out.push(match[1]!);
  }
  return out;
}

export { summarise } from '@shared/tutor-summary';
