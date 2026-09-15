/**
 * Retrieval, behind an interface.
 *
 * ── The decision, and why it is not embeddings ────────────────────────────
 *
 * Chunks carry a Postgres `tsvector`; retrieval is `websearch_to_tsquery` plus
 * `ts_rank_cd`. No pgvector, no embedding API.
 *
 * Embeddings would double the AI cost surface and add an ingestion dependency —
 * a source could not become searchable without a successful model call — for a
 * corpus that is one learner's own course material: small, and lexically very
 * close to the questions asked of it. Someone studying price elasticity asks
 * about price elasticity. Semantic search earns its keep across a large
 * heterogeneous corpus, which this is not.
 *
 * It is behind `Retriever` so that swapping in pgvector later is a new
 * implementation rather than a rewrite of every caller.
 *
 * ── Ownership is checked before the search, not after ─────────────────────
 *
 * Invariant 8: `scope` is a verified `{ userId, workspaceId }`, and the query
 * filters on it in SQL. Retrieving broadly and filtering the results in
 * TypeScript is the shape of bug that leaks one learner's notes into another's
 * answer — and it passes every test written against a single-user fixture.
 */

export interface RetrievalScope {
  /** Derived from the verified JWT. Never client-supplied. */
  userId: string;
  workspaceId: string;
}

export interface RetrievedChunk {
  id: string;
  sourceId: string;
  sourceTitle: string;
  ordinal: number;
  text: string;
  /** `ts_rank_cd`, or the lexical fallback's score. Comparable within a query. */
  score: number;
}

export interface Retriever {
  retrieve(
    scope: RetrievalScope,
    query: string,
    limit?: number,
  ): Promise<RetrievedChunk[]>;
}

/** Default passages per answer. Enough to ground; few enough to stay cheap. */
export const DEFAULT_RETRIEVAL_LIMIT = 6;

const STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'but', 'by', 'do', 'does', 'for',
  'from', 'how', 'i', 'if', 'in', 'is', 'it', 'its', 'of', 'on', 'or', 'so',
  'that', 'the', 'their', 'then', 'there', 'they', 'this', 'to', 'was', 'were',
  'what', 'when', 'which', 'why', 'with', 'you', 'your',
]);

export function terms(value: string): string[] {
  return (
    value
      .toLocaleLowerCase('en')
      .match(/[a-z0-9]+/g)
      ?.filter((term) => term.length > 1 && !STOP_WORDS.has(term)) ?? []
  );
}

/**
 * The lexical scorer, extracted so the in-memory retriever and any future
 * fallback rank the same way.
 *
 * Term *coverage* rather than raw frequency: a chunk that mentions every word
 * of the question once is a better passage than one that says a single word ten
 * times, and raw frequency picks the second.
 */
export function lexicalScore(queryTerms: readonly string[], text: string): number {
  if (queryTerms.length === 0) return 0;
  const haystack = new Set(terms(text));
  const matched = queryTerms.filter((term) => haystack.has(term)).length;
  return matched / queryTerms.length;
}

/**
 * An in-memory retriever, used by fixture mode and the tests.
 *
 * It ranks the same way and enforces the same scoping, so a test that passes
 * here is testing the contract rather than the SQL — and the SQL implementation
 * lives in `db/chunks.ts` where the query can be read in one screen.
 */
export class MemoryRetriever implements Retriever {
  constructor(
    private readonly chunks: readonly (RetrievedChunk & {
      userId: string;
      workspaceId: string;
    })[],
  ) {}

  async retrieve(
    scope: RetrievalScope,
    query: string,
    limit = DEFAULT_RETRIEVAL_LIMIT,
  ): Promise<RetrievedChunk[]> {
    const queryTerms = terms(query);
    return this.chunks
      .filter(
        (chunk) => chunk.userId === scope.userId && chunk.workspaceId === scope.workspaceId,
      )
      .map((chunk) => ({ ...chunk, score: lexicalScore(queryTerms, chunk.text) }))
      .filter((chunk) => chunk.score > 0)
      .sort((left, right) => right.score - left.score || left.ordinal - right.ordinal)
      .slice(0, limit)
      .map(({ userId: _userId, workspaceId: _workspaceId, ...chunk }) => chunk);
  }
}
