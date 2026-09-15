import { AskInput, type AskResponse } from '../../shared/contract.ts';
import { ASK_NO_GROUNDING } from '../../shared/messages.ts';
import { liveAsk } from '../ai/assess.ts';
import { askWithFixture } from '../assessment/fixture.ts';
import { AssessmentRejected, validateAskOutput } from '../assessment/validate.ts';
import { ApiClientError } from '../../shared/contract.ts';
import { aiSettings } from '../env.ts';
import { PostgresRetriever } from '../db/sources.ts';
import { assertOwnsWorkspace } from '../db/workspaces.ts';
import { markAskedForHelp } from '../learning/session.ts';
import { param, parseBody, type Route } from './types.ts';

/**
 * Grounded chat.
 *
 * ── The ordering that makes invariant 2 true ──────────────────────────────
 *
 * When a question arrives with a `sessionId`, the active item's assistance is
 * raised **before the model is reached**. Not after the answer comes back, and
 * not only when the answer is useful.
 *
 * The reason is the failure case: a learner asks for help, the request times
 * out, and they answer correctly anyway. If assistance were recorded on
 * success, that answer would be logged as independent — they used help, the
 * help failed to arrive, and the record says they needed none. Recording first
 * means the log says what happened.
 *
 * The learner is told this before they send the question
 * (`ASK_DURING_CHECK_WARNING`), so it is a choice rather than a trap.
 *
 * ── Retrieval is scoped before it searches ────────────────────────────────
 *
 * Invariant 8: `search_chunks` takes the verified user id and workspace id and
 * filters on them in SQL. Nothing here searches broadly and filters after.
 */
export const askRoutes: Route[] = [
  {
    method: 'POST',
    path: '/api/workspaces/:workspaceId/ask',
    op: 'ask',
    handler: async (context): Promise<AskResponse> => {
      const workspaceId = param(context, 'workspaceId');
      await assertOwnsWorkspace(context.db, context.userId, workspaceId);
      const input = parseBody(AskInput, context.body);

      let recordedAsSupport = false;
      if (input.sessionId) {
        const { itemId } = await markAskedForHelp(
          {
            db: context.db,
            userId: context.userId,
            workspaceId,
            now: context.now,
            assess: async () => {
              throw new ApiClientError('internal', 'unreachable');
            },
          },
          input.sessionId,
        );
        recordedAsSupport = itemId !== null;
      }

      const retriever = new PostgresRetriever(context.db);
      const chunks = await retriever.retrieve(
        { userId: context.userId, workspaceId },
        input.question,
      );

      if (chunks.length === 0) {
        return {
          answer: ASK_NO_GROUNDING,
          citations: [],
          recordedAsSupport,
          refusedForLackOfGrounding: true,
        };
      }

      const ai = aiSettings(context.env);
      const payload = {
        question: input.question,
        passages: chunks.map((chunk) => ({ chunk_id: chunk.id, text: chunk.text })),
      };

      const raw =
        ai.mode === 'live'
          ? await liveAsk({ settings: ai, db: context.db, userId: context.userId })(payload)
          : askWithFixture({ question: input.question, chunks });

      let validated: ReturnType<typeof validateAskOutput>;
      try {
        validated = validateAskOutput(raw, chunks);
      } catch (error) {
        if (error instanceof AssessmentRejected) {
          // Invariant 11 again: an answer that cited something it was not given
          // is thrown away rather than shown with a caveat.
          throw new ApiClientError(
            'assessment_rejected',
            `${error.message}. Nothing was shown, because an answer that cites what it was not given is worse than no answer.`,
          );
        }
        throw error;
      }

      if (!validated.grounded) {
        return {
          answer: ASK_NO_GROUNDING,
          citations: [],
          recordedAsSupport,
          refusedForLackOfGrounding: true,
        };
      }

      const byId = new Map(chunks.map((chunk) => [chunk.id, chunk]));

      await context.db.from('ask_log').insert({
        workspace_id: workspaceId,
        user_id: context.userId,
        session_id: input.sessionId ?? null,
        question: input.question,
        answer: validated.answer,
        citations: validated.citations,
        grounded: true,
      });

      return {
        answer: validated.answer,
        citations: validated.citations.map((citation) => ({
          sourceId: byId.get(citation.chunkId)?.sourceId ?? '',
          sourceTitle: byId.get(citation.chunkId)?.sourceTitle ?? '',
          chunkId: citation.chunkId,
          quote: citation.quote,
        })),
        recordedAsSupport,
        refusedForLackOfGrounding: false,
      };
    },
  },
];
