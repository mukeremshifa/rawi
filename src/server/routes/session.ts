import {
  AdvanceStageInput,
  SessionCommandInput,
  SubmitResponseInput,
} from '../../shared/contract.ts';
import { aiSettings } from '../env.ts';
import { assertOwnsWorkspace } from '../db/workspaces.ts';
import { listDueConcepts } from '../db/concepts.ts';
import * as session from '../learning/session.ts';
import { liveAssessor } from '../ai/assess.ts';
import { param, parseBody, type Route } from './types.ts';
import type { RequestContext } from './types.ts';

/**
 * The teaching loop's routes.
 *
 * Each one does the same two things before touching a session: confirm the
 * workspace is this learner's, and build a `SessionContext` carrying the clock
 * and the assessor. Injecting the assessor here is what makes fixture and live
 * the *same* pipeline with a different function in one slot — the validator,
 * the router, the scheduler and the log do not know which mode they are in.
 */
async function contextFor(context: RequestContext): Promise<session.SessionContext> {
  const workspaceId = param(context, 'workspaceId');
  await assertOwnsWorkspace(context.db, context.userId, workspaceId);

  const ai = aiSettings(context.env);

  return {
    db: context.db,
    userId: context.userId,
    workspaceId,
    now: context.now,
    assess:
      ai.mode === 'live'
        ? liveAssessor({ settings: ai, db: context.db, userId: context.userId })
        : session.fixtureAssessor,
  };
}

export const sessionRoutes: Route[] = [
  {
    method: 'POST',
    path: '/api/workspaces/:workspaceId/concepts/:conceptId/session',
    op: 'startSession',
    handler: async (context) =>
      session.startSession(await contextFor(context), param(context, 'conceptId')),
  },
  {
    method: 'GET',
    path: '/api/workspaces/:workspaceId/sessions/:sessionId',
    op: 'getSession',
    handler: async (context) =>
      session.getSession(await contextFor(context), param(context, 'sessionId')),
  },
  {
    method: 'POST',
    path: '/api/workspaces/:workspaceId/sessions/:sessionId/stage',
    op: 'advanceStage',
    handler: async (context) =>
      session.advanceStage(
        await contextFor(context),
        param(context, 'sessionId'),
        parseBody(AdvanceStageInput, context.body),
      ),
  },
  {
    method: 'POST',
    path: '/api/workspaces/:workspaceId/sessions/:sessionId/hint',
    op: 'requestHint',
    handler: async (context) =>
      session.requestHint(
        await contextFor(context),
        param(context, 'sessionId'),
        parseBody(SessionCommandInput, context.body),
      ),
  },
  {
    method: 'POST',
    path: '/api/workspaces/:workspaceId/sessions/:sessionId/reveal',
    op: 'revealAnswer',
    handler: async (context) =>
      session.revealAnswer(
        await contextFor(context),
        param(context, 'sessionId'),
        parseBody(SessionCommandInput, context.body),
      ),
  },
  {
    method: 'POST',
    path: '/api/workspaces/:workspaceId/sessions/:sessionId/response',
    op: 'submitResponse',
    handler: async (context) =>
      session.submitResponse(
        await contextFor(context),
        param(context, 'sessionId'),
        parseBody(SubmitResponseInput, context.body),
      ),
  },
  {
    method: 'POST',
    path: '/api/workspaces/:workspaceId/sessions/:sessionId/end',
    op: 'endSession',
    handler: async (context) =>
      session.endSession(await contextFor(context), param(context, 'sessionId')),
  },
  {
    method: 'GET',
    path: '/api/workspaces/:workspaceId/reviews',
    op: 'listDueReviews',
    handler: async (context) => {
      const workspaceId = param(context, 'workspaceId');
      await assertOwnsWorkspace(context.db, context.userId, workspaceId);
      return listDueConcepts(context.db, context.userId, workspaceId, context.now);
    },
  },
  {
    method: 'POST',
    path: '/api/workspaces/:workspaceId/concepts/:conceptId/review',
    op: 'startReview',
    handler: async (context) =>
      session.startReview(await contextFor(context), param(context, 'conceptId')),
  },
];
