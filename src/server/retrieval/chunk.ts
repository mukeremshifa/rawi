/**
 * Splitting a source into retrievable passages.
 *
 * ── Bound by CPU, not by convenience ──────────────────────────────────────
 *
 * The Workers free plan allows roughly 10ms of CPU per invocation. Chunking a
 * whole document in one go will exceed it, and the failure mode is a Worker
 * killed mid-loop with half a source indexed. So a step processes at most
 * `MAX_CHUNKS_PER_STEP` chunks or `MAX_CHARS_PER_STEP` characters, whichever
 * comes first, then yields and lets the client poll.
 *
 * Worth being precise about what that limit covers: **time spent waiting on
 * Vertex or Supabase is I/O, not CPU, and does not count against it.** Long
 * model calls are fine. Long loops are not. That asymmetry is why this file
 * bounds the loop and nothing bounds the fetches.
 */

/** A step never emits more than this many chunks. */
export const MAX_CHUNKS_PER_STEP = 32;
/** …nor consumes more than this much input text. */
export const MAX_CHARS_PER_STEP = 64 * 1024;

/** Target chunk size. Small enough to cite, large enough to mean something. */
const TARGET_CHARS = 900;
/**
 * Overlap between neighbours, so a sentence spanning a boundary is retrievable
 * from both sides. Without it, the one passage that answers a question is
 * exactly the one split down the middle.
 */
const OVERLAP_CHARS = 120;

export interface PendingChunk {
  ordinal: number;
  text: string;
}

export interface ChunkStepResult {
  chunks: PendingChunk[];
  /** Where the next step resumes. */
  nextOffset: number;
  done: boolean;
}

/**
 * Split at paragraph boundaries where possible, sentence boundaries otherwise,
 * and a hard cut only as a last resort.
 *
 * Splitting on a fixed character count is simpler and produces chunks that cut
 * mid-clause — which shows up later as a citation that quotes half a thought,
 * and a learner deciding the citations are noise.
 */
function findBreak(text: string, from: number, limit: number): number {
  const window = text.slice(from, from + limit);
  if (from + limit >= text.length) return text.length;

  const paragraph = window.lastIndexOf('\n\n');
  if (paragraph > limit * 0.4) return from + paragraph + 2;

  const sentence = Math.max(
    window.lastIndexOf('. '),
    window.lastIndexOf('! '),
    window.lastIndexOf('? '),
    window.lastIndexOf('.\n'),
  );
  if (sentence > limit * 0.4) return from + sentence + 2;

  const space = window.lastIndexOf(' ');
  if (space > limit * 0.4) return from + space + 1;

  return from + limit;
}

/** One bounded step of chunking, resuming from `offset`. */
export function chunkStep(
  text: string,
  offset: number,
  startOrdinal: number,
): ChunkStepResult {
  const chunks: PendingChunk[] = [];
  let cursor = offset;
  let ordinal = startOrdinal;
  let consumed = 0;

  while (
    cursor < text.length &&
    chunks.length < MAX_CHUNKS_PER_STEP &&
    consumed < MAX_CHARS_PER_STEP
  ) {
    const end = findBreak(text, cursor, TARGET_CHARS);
    const slice = text.slice(cursor, end).trim();
    if (slice.length > 0) {
      chunks.push({ ordinal, text: slice });
      ordinal += 1;
    }
    consumed += end - cursor;
    // The overlap is taken off the *advance*, not added to the chunk, so the
    // two neighbours genuinely share text rather than each holding a copy.
    cursor = end >= text.length ? end : Math.max(cursor + 1, end - OVERLAP_CHARS);
  }

  return { chunks, nextOffset: cursor, done: cursor >= text.length };
}

/** How many chunks a text will produce, for a job's `unitsTotal`. */
export function estimateChunkCount(text: string): number {
  if (text.trim().length === 0) return 0;
  return Math.max(1, Math.ceil(text.length / (TARGET_CHARS - OVERLAP_CHARS)));
}

/**
 * v1 accepts `.txt` and `.md` only, and "extraction" is a plain-text read.
 *
 * No PDF and no OCR — both are an ingestion dependency and a failure surface
 * for a corpus that is one learner's own notes, which they can paste.
 */
export function extractPlainText(raw: string, contentType: string): string {
  if (contentType !== 'text/plain' && contentType !== 'text/markdown') {
    throw new Error(`unsupported content type: ${contentType}`);
  }
  // Normalise line endings only. Markdown is left as written: it is what the
  // learner sees in the source reader, and stripping it would make a citation
  // quote text that does not appear on screen.
  return raw.replace(/\r\n/g, '\n');
}
