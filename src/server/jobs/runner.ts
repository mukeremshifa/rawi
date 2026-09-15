import { ApiClientError, type Job } from '../../shared/contract.ts';
import { JOB_STAGE } from '../../shared/messages.ts';
import type { Db } from '../db/client.ts';
import { commitJobStep, loadJobRow, toJob } from '../db/jobs.ts';
import {
  allChunks,
  getSourceText,
  insertChunks,
  markSourceFailed,
  markSourceReady,
} from '../db/sources.ts';
import { upsertConcepts } from '../db/concepts.ts';
import { chunkStep, estimateChunkCount } from '../retrieval/chunk.ts';

/**
 * One bounded step per invocation, and the client polls.
 *
 * ── The CPU budget, and what actually counts against it ───────────────────
 *
 * The Workers free plan allows roughly 10ms of CPU per invocation. Chunking a
 * whole document in one loop will exceed it, and the failure is a Worker killed
 * mid-loop with half a source indexed and a job row that says "running"
 * forever.
 *
 * The distinction that makes this workable: **waiting on Vertex or Supabase is
 * I/O, not CPU.** A twenty-second model call costs nothing against the limit. A
 * tight loop over a megabyte of text costs everything. So `chunk.ts` bounds the
 * loop — 32 chunks or 64KB, whichever comes first — and nothing bounds the
 * fetches.
 *
 * ── Why `getJob` is what advances it ──────────────────────────────────────
 *
 * There is no background scheduler, so something has to drive the work, and the
 * thing already polling is the client. `advanceJob` runs one step and returns
 * the job; the polling UI is the pump. The cost is that a learner who closes
 * the tab pauses their own ingestion, which is honest — and the job resumes on
 * the next poll rather than needing to be restarted.
 *
 * The `version` guard on `commitJobStep` is what makes the double-poll safe:
 * two concurrent steps read the same cursor, and only one commit lands.
 */

export async function advanceJob(
  db: Db,
  userId: string,
  workspaceId: string,
  jobId: string,
): Promise<Job> {
  const row = await loadJobRow(db, userId, workspaceId, jobId);
  if (row.status === 'succeeded' || row.status === 'failed') return toJob(row);

  try {
    switch (row.kind) {
      case 'ingest-source':
        return await ingestStep(db, userId, workspaceId, row);
      case 'extract-concepts':
        return await extractStep(db, userId, workspaceId, row);
      default:
        return toJob(row);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'The job failed.';
    const code = error instanceof ApiClientError ? error.code : 'internal';
    if (row.kind === 'ingest-source' && row.subject_id) {
      await markSourceFailed(db, userId, row.subject_id);
    }
    const failed = await commitJobStep(db, {
      userId,
      jobId,
      expectedVersion: row.version,
      patch: { status: 'failed', stage: 'Failed', errorCode: code, errorMessage: message },
    });
    return toJob(failed ?? { ...row, status: 'failed', error_message: message });
  }
}

type JobRow = Awaited<ReturnType<typeof loadJobRow>>;

async function ingestStep(
  db: Db,
  userId: string,
  workspaceId: string,
  row: JobRow,
): Promise<Job> {
  const sourceId = row.subject_id;
  if (!sourceId) throw new ApiClientError('internal', 'ingest job has no source');

  const text = await getSourceText(db, userId, sourceId);
  const offset = Number(row.cursor['offset'] ?? 0);
  const ordinal = Number(row.cursor['ordinal'] ?? 0);

  // The total is computed on the first step, once the text is in hand. Before
  // that the job reports `unitsTotal: null` — "we have not counted yet", which
  // is a different statement from "there are none" and renders differently.
  const unitsTotal = row.units_total ?? estimateChunkCount(text);

  const step = chunkStep(text, offset, ordinal);

  await insertChunks(db, {
    userId,
    workspaceId,
    sourceId,
    chunks: step.chunks,
  });

  const unitsDone = ordinal + step.chunks.length;

  if (step.done) {
    await markSourceReady(db, userId, sourceId, unitsDone);
    const committed = await commitJobStep(db, {
      userId,
      jobId: row.id,
      expectedVersion: row.version,
      patch: {
        status: 'succeeded',
        stage: JOB_STAGE.done,
        unitsDone,
        // The real count replaces the estimate. A finished job reporting an
        // estimated total would be a number nobody can reconcile with the
        // chunk list beside it.
        unitsTotal: unitsDone,
        cursor: { offset: step.nextOffset, ordinal: unitsDone },
      },
    });
    return toJob(committed ?? row);
  }

  const committed = await commitJobStep(db, {
    userId,
    jobId: row.id,
    expectedVersion: row.version,
    patch: {
      status: 'running',
      stage: JOB_STAGE.chunking,
      unitsDone,
      unitsTotal,
      cursor: { offset: step.nextOffset, ordinal: unitsDone },
    },
  });
  return toJob(committed ?? row);
}

/**
 * Concept extraction.
 *
 * ── Fixture mode extracts too, and that is the point ──────────────────────
 *
 * In fixture mode this groups chunks by source and produces one concept per
 * source with the source's first sentences as its summary, and **no authored
 * content** — so `itemsRemaining` is 0 and the app honestly says there are no
 * questions yet. That is a real state a learner can hit in live mode too (a
 * source too thin to author from), and having fixture mode produce it means the
 * empty-concept path is exercised constantly rather than discovered late.
 *
 * Live extraction replaces the body of `conceptsFromChunks` with a Vertex call;
 * the stepping, the cursor and the job surface do not change.
 */
async function extractStep(
  db: Db,
  userId: string,
  workspaceId: string,
  row: JobRow,
): Promise<Job> {
  const chunks = await allChunks(db, userId, workspaceId);
  if (chunks.length === 0) {
    const committed = await commitJobStep(db, {
      userId,
      jobId: row.id,
      expectedVersion: row.version,
      patch: {
        status: 'failed',
        stage: 'Nothing to read',
        errorCode: 'invalid_input',
        errorMessage: 'This workspace has no ready sources to extract concepts from.',
      },
    });
    return toJob(committed ?? row);
  }

  const bySource = new Map<string, { id: string; text: string }[]>();
  for (const chunk of chunks) {
    const list = bySource.get(chunk.sourceId) ?? [];
    list.push({ id: chunk.id, text: chunk.text });
    bySource.set(chunk.sourceId, list);
  }

  const concepts = [...bySource.entries()].map(([sourceId, sourceChunks]) => {
    const first = sourceChunks[0]?.text ?? '';
    const sentences = first.split(/(?<=[.!?])\s+/).slice(0, 2).join(' ');
    return {
      name: sentences.slice(0, 60).replace(/\s+\S*$/, '') || 'Untitled concept',
      summary: sentences.slice(0, 280),
      sourceIds: [sourceId],
      // No authored items. The concept map shows it; the session honestly says
      // there is nothing to check yet.
      content: null,
    };
  });

  await upsertConcepts(db, { userId, workspaceId, concepts });

  const committed = await commitJobStep(db, {
    userId,
    jobId: row.id,
    expectedVersion: row.version,
    patch: {
      status: 'succeeded',
      stage: JOB_STAGE.done,
      unitsDone: concepts.length,
      unitsTotal: concepts.length,
    },
  });
  return toJob(committed ?? row);
}
