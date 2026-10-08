import { AI_LIMITS, type AiPassage, type AiTopic } from './ai';
import type { Attempt, Material, Passage, Question, Topic } from './types';

/**
 * Bounded context for AI requests, built from one course's records.
 *
 * Relevance is deliberately simple: a passage the session was opened from
 * comes first, then passages linked to the topic, then passages that share
 * words with the topic and the student's question. At the size of one
 * student's course that is enough, and it is easy to explain. Every function
 * here takes records that the caller has already scoped to one course, and
 * `forCourse` checks that again before anything leaves the browser.
 */

/**
 * Material whose text is real. A `preview` is a placeholder recorded for a
 * file Rawi could not read, and its text is a description of that failure,
 * so it must never be sent as if it were course content.
 */
export function isUsableMaterial(material: Material): boolean {
  return !material.archived && material.origin !== 'preview' && material.passages.some((p) => p.text.trim());
}

const STOP = new Set(
  'about above after again against because been before being below between both could does doing down during each from further have having here into itself just more most other over same should some such than that their theirs them then there these they this those through under until very what when where which while with would your yours what how why the and for are was were not but can its you'.split(
    ' ',
  ),
);

function terms(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .filter((w) => w.length >= 4 && !STOP.has(w)),
  );
}

function overlap(a: Set<string>, text: string): number {
  if (a.size === 0) return 0;
  let hits = 0;
  for (const word of terms(text)) if (a.has(word)) hits += 1;
  return hits;
}

/** Usable materials in this course that relate to the topic at all. */
export function materialsForTopic(topic: Topic, materials: Material[]): Material[] {
  const topicTerms = terms(`${topic.title} ${topic.summary}`);
  return materials.filter(
    (m) =>
      m.courseId === topic.courseId &&
      isUsableMaterial(m) &&
      (m.topicIds.includes(topic.id) ||
        m.passages.some((p) => p.topicIds.includes(topic.id)) ||
        m.passages.some((p) => overlap(topicTerms, `${p.heading} ${p.text}`) >= 2)),
  );
}

export function toAiTopic(topic: Topic): AiTopic {
  return { id: topic.id, title: topic.title, summary: topic.summary };
}

export function toAiPassage(material: Material, passage: Passage): AiPassage {
  return {
    id: passage.id,
    materialId: material.id,
    courseId: material.courseId,
    materialTitle: material.title,
    heading: passage.heading,
    text: passage.text.slice(0, AI_LIMITS.maxPassageChars),
    topicIds: passage.topicIds,
  };
}

/**
 * The most relevant passages within a character budget.
 *
 * Passages with no connection to the topic or the query are left out rather
 * than used as padding, so an unrelated course document never reaches the
 * model just because there was room for it.
 */
export function selectPassages(params: {
  courseId: string;
  materials: Material[];
  topicIds: string[];
  query: string;
  focusPassageId?: string;
  maxPassages?: number;
  maxChars?: number;
}): AiPassage[] {
  const queryTerms = terms(params.query);
  const topics = new Set(params.topicIds);
  const scored: { score: number; passage: AiPassage }[] = [];

  for (const material of params.materials) {
    if (material.courseId !== params.courseId || !isUsableMaterial(material)) continue;
    const materialLinked = material.topicIds.some((t) => topics.has(t));
    for (const passage of material.passages) {
      if (!passage.text.trim()) continue;
      let score = 0;
      if (passage.id === params.focusPassageId) score += 100;
      if (passage.topicIds.some((t) => topics.has(t))) score += 6;
      if (materialLinked) score += 3;
      score += Math.min(8, overlap(queryTerms, `${passage.heading} ${passage.text}`));
      if (score > 0) scored.push({ score, passage: toAiPassage(material, passage) });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  const maxPassages = params.maxPassages ?? 10;
  const maxChars = params.maxChars ?? 18000;
  const picked: AiPassage[] = [];
  let used = 0;
  for (const { passage } of scored) {
    if (picked.length >= maxPassages) break;
    if (used + passage.text.length > maxChars) continue;
    picked.push(passage);
    used += passage.text.length;
  }
  return picked;
}

/** A few lines about the student's recent work on this topic. */
export function priorWorkLines(
  topicId: string,
  attempts: Attempt[],
  questions: Map<string, Question>,
): string[] {
  const recent = attempts
    .filter((a) => a.completedAt && a.questions.some((q) => q.topicId === topicId))
    .sort((a, b) => (a.completedAt! < b.completedAt! ? 1 : -1))
    .slice(0, 3);

  const lines: string[] = [];
  for (const attempt of recent) {
    const onTopic = attempt.questions.filter(
      (q) => q.topicId === topicId && q.outcome !== 'pending',
    );
    if (onTopic.length === 0) continue;
    const awarded = onTopic.reduce((s, q) => s + q.marksAwarded, 0);
    const available = onTopic.reduce((s, q) => s + q.marksAvailable, 0);
    const missed = onTopic
      .filter((q) => q.outcome === 'incorrect' || q.outcome === 'partial')
      .map((q) => questions.get(q.questionId)?.prompt)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => `"${p!.slice(0, 120)}"`);
    lines.push(
      `${attempt.mode === 'exam' ? 'Exam rehearsal' : 'Practice'} on ${attempt.completedAt!.slice(0, 10)}: ${awarded} of ${available} marks on this topic.${missed.length ? ` Struggled with ${missed.join(' and ')}.` : ''}`,
    );
  }
  return lines;
}

/**
 * Drops anything that does not belong to the course. The server checks the
 * same thing, and this is the browser's half of that promise.
 */
export function forCourse(courseId: string, passages: AiPassage[]): AiPassage[] {
  return passages.filter((p) => p.courseId === courseId);
}
