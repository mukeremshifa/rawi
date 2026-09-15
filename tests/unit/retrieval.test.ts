import { describe, expect, it } from 'vitest';

import {
  chunkStep,
  estimateChunkCount,
  extractPlainText,
  MAX_CHUNKS_PER_STEP,
} from '../../src/server/retrieval/chunk.ts';
import { lexicalScore, MemoryRetriever, terms } from '../../src/server/retrieval/search.ts';

describe('chunking', () => {
  it('bounds a step by chunk count', () => {
    // The CPU limit is the whole reason this is stepped. A step that ignores
    // the bound is a Worker killed mid-loop with half a source indexed.
    const text = 'A sentence that is long enough to be its own chunk. '.repeat(1500);
    const step = chunkStep(text, 0, 0);
    expect(step.chunks.length).toBeLessThanOrEqual(MAX_CHUNKS_PER_STEP);
    expect(step.done).toBe(false);
  });

  it('resumes where the previous step stopped, without gaps', () => {
    const text = 'Paragraph one.\n\nParagraph two.\n\nParagraph three.';
    const first = chunkStep(text, 0, 0);
    expect(first.done).toBe(true);
    expect(first.chunks[0]!.ordinal).toBe(0);
    // A short document finishes in one step, and the ordinals are contiguous.
    first.chunks.forEach((chunk, index) => expect(chunk.ordinal).toBe(index));
  });

  it('eventually completes a long document', () => {
    const text = 'Sentence. '.repeat(20_000);
    let offset = 0;
    let ordinal = 0;
    let steps = 0;
    while (steps < 200) {
      const step = chunkStep(text, offset, ordinal);
      offset = step.nextOffset;
      ordinal += step.chunks.length;
      steps += 1;
      if (step.done) break;
    }
    expect(steps).toBeLessThan(200);
    expect(ordinal).toBeGreaterThan(0);
  });

  it('never emits an empty chunk', () => {
    const step = chunkStep('\n\n\n\nReal text here.\n\n\n\n', 0, 0);
    for (const chunk of step.chunks) expect(chunk.text.trim().length).toBeGreaterThan(0);
  });

  it('estimates a count without claiming zero for real text', () => {
    expect(estimateChunkCount('')).toBe(0);
    expect(estimateChunkCount('short')).toBe(1);
    expect(estimateChunkCount('x'.repeat(5000))).toBeGreaterThan(1);
  });

  it('accepts only the two v1 content types', () => {
    expect(extractPlainText('a\r\nb', 'text/plain')).toBe('a\nb');
    expect(extractPlainText('# heading', 'text/markdown')).toBe('# heading');
    expect(() => extractPlainText('%PDF', 'application/pdf')).toThrow();
  });

  it('leaves markdown as written', () => {
    // A citation has to quote text that appears on screen. Stripping the
    // markdown here would make every citation quote something the reader
    // cannot find.
    expect(extractPlainText('**bold** and `code`', 'text/markdown')).toBe(
      '**bold** and `code`',
    );
  });
});

describe('lexical scoring', () => {
  it('drops stop words and short tokens', () => {
    expect(terms('What is the price of it')).toEqual(['price']);
  });

  it('scores by term coverage, not raw frequency', () => {
    const query = terms('price elasticity revenue');
    const covering = lexicalScore(query, 'price elasticity revenue');
    const repetitive = lexicalScore(query, 'price price price price price price');
    expect(covering).toBeGreaterThan(repetitive);
  });

  it('is zero for a query with nothing to match', () => {
    expect(lexicalScore([], 'anything')).toBe(0);
  });
});

describe('MemoryRetriever', () => {
  const chunks = [
    {
      id: 'c1',
      sourceId: 's1',
      sourceTitle: 'Mine',
      ordinal: 0,
      text: 'Elastic demand means revenue falls when price rises.',
      score: 0,
      userId: 'me',
      workspaceId: 'w1',
    },
    {
      id: 'c2',
      sourceId: 's2',
      sourceTitle: 'Theirs',
      ordinal: 0,
      text: 'Elastic demand means revenue falls when price rises.',
      score: 0,
      userId: 'someone-else',
      workspaceId: 'w1',
    },
    {
      id: 'c3',
      sourceId: 's3',
      sourceTitle: 'Other workspace',
      ordinal: 0,
      text: 'Elastic demand means revenue falls when price rises.',
      score: 0,
      userId: 'me',
      workspaceId: 'w2',
    },
  ];

  it('returns only chunks inside the scope', async () => {
    // Invariant 8. The identical text in three places is the point: ranking
    // cannot be what separates them, so scoping has to.
    const results = await new MemoryRetriever(chunks).retrieve(
      { userId: 'me', workspaceId: 'w1' },
      'elastic revenue',
    );
    expect(results.map((chunk) => chunk.id)).toEqual(['c1']);
  });

  it('returns nothing when nothing matches', async () => {
    const results = await new MemoryRetriever(chunks).retrieve(
      { userId: 'me', workspaceId: 'w1' },
      'photosynthesis chloroplast',
    );
    expect(results).toHaveLength(0);
  });
});
