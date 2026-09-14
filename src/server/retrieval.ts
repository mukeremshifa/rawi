import type { SourceExcerpt } from '../shared/types.js';
import type { AuthoredLesson } from '../content/demo-lesson.js';

const STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'for', 'from', 'how', 'i',
  'in', 'is', 'it', 'of', 'on', 'or', 'that', 'the', 'this', 'to', 'what',
  'when', 'why', 'with',
]);

function terms(value: string): string[] {
  return value
    .toLocaleLowerCase('en')
    .match(/[a-z0-9]+/g)
    ?.filter((term) => term.length > 1 && !STOP_WORDS.has(term)) ?? [];
}

/** Small deterministic lexical baseline; no external vector service or spend. */
export function retrieveCourseSources(
  lesson: AuthoredLesson,
  query: string,
  requestedIds: readonly string[] = [],
  limit = 2,
): SourceExcerpt[] {
  const allowed = new Map(lesson.sources.map((source) => [source.sourceId, source]));
  for (const id of requestedIds) {
    if (!allowed.has(id)) throw new Error('unauthorized_source_reference');
  }

  const queryTerms = new Set(terms(query));
  const candidates = requestedIds.length
    ? requestedIds.map((id) => allowed.get(id)!)
    : lesson.sources;

  return candidates
    .map((source, index) => {
      const sourceTerms = terms(`${source.title} ${source.excerpt}`);
      const score = sourceTerms.reduce(
        (total, term) => total + (queryTerms.has(term) ? 1 : 0),
        0,
      );
      return { source, score, index };
    })
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .slice(0, Math.max(1, Math.min(limit, 3)))
    .map(({ source }) => source);
}

export function validateSourceReferences(
  sourceIds: readonly string[],
  authorizedSources: readonly SourceExcerpt[],
): boolean {
  if (sourceIds.length === 0) return false;
  const allowed = new Set(authorizedSources.map((source) => source.sourceId));
  return sourceIds.every((id) => allowed.has(id));
}

