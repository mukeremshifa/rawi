import type { ActivityType, Difficulty, Question, QuestionFormat, SavedPracticeSet } from './types';

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

