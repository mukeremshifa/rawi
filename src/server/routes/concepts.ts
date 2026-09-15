import { type Readiness } from '../../shared/contract.ts';
import { JOB_STAGE } from '../../shared/messages.ts';
import { aiSettings } from '../env.ts';
import * as concepts from '../db/concepts.ts';
import { createJob } from '../db/jobs.ts';
import { listAttempts } from '../db/attempts.ts';
import { listSources } from '../db/sources.ts';
import { assertOwnsWorkspace } from '../db/workspaces.ts';
import { param, type Route } from './types.ts';

/**
 * Concept routes, plus the readiness check.
 *
 * ── Why readiness is a route and not a client-side guess ──────────────────
 *
 * "Can this concept be checked?" depends on things only the server knows: what
 * items exist, which have been seen, whether the AI budget is intact. A client
 * that guesses will eventually offer a button the server refuses, and a surface
 * that offers an action the server will refuse is a surface that lies. So the
 * blockers come back as a list, in the order they should be fixed.
 */
export const conceptRoutes: Route[] = [
  {
    method: 'GET',
    path: '/api/workspaces/:workspaceId/concepts',
    op: 'listConcepts',
    handler: async (context) => {
      const workspaceId = param(context, 'workspaceId');
      await assertOwnsWorkspace(context.db, context.userId, workspaceId);
      return concepts.listConcepts(context.db, context.userId, workspaceId);
    },
  },
  {
    method: 'GET',
    path: '/api/workspaces/:workspaceId/concepts/:conceptId',
    op: 'getConcept',
    handler: async (context) => {
      const workspaceId = param(context, 'workspaceId');
      await assertOwnsWorkspace(context.db, context.userId, workspaceId);
      return concepts.getConcept(
        context.db,
        context.userId,
        workspaceId,
        param(context, 'conceptId'),
      );
    },
  },
  {
    method: 'POST',
    path: '/api/workspaces/:workspaceId/concepts/extract',
    op: 'extractConcepts',
    handler: async (context) => {
      const workspaceId = param(context, 'workspaceId');
      await assertOwnsWorkspace(context.db, context.userId, workspaceId);
      return createJob(context.db, {
        userId: context.userId,
        workspaceId,
        kind: 'extract-concepts',
        stage: JOB_STAGE.extracting,
        // Genuinely unknown until the sources have been read. `null`, not 0 —
        // GeneratingState breathes for one and draws an empty bar for the other.
        unitsTotal: null,
        subjectId: null,
      });
    },
  },
  {
    method: 'GET',
    path: '/api/workspaces/:workspaceId/concepts/:conceptId/readiness',
    op: 'getConceptReadiness',
    handler: async (context): Promise<Readiness> => {
      const workspaceId = param(context, 'workspaceId');
      const conceptId = param(context, 'conceptId');
      await assertOwnsWorkspace(context.db, context.userId, workspaceId);

      const blockers: Readiness['blockers'] = [];

      const sources = await listSources(context.db, context.userId, workspaceId, {
        limit: 1,
      });
      if (sources.items.length === 0) {
        blockers.push({
          code: 'no-sources',
          message: 'This workspace has no sources, so there is nothing to ground a check in.',
        });
      }

      const row = await concepts.getConceptRow(
        context.db,
        context.userId,
        workspaceId,
        conceptId,
      );
      const content = concepts.contentOf(row);

      if (!content) {
        blockers.push({
          code: 'no-concepts',
          message: 'No questions have been written for this concept yet.',
        });
      } else {
        const exposed = await concepts.exposedItemIds(context.db, context.userId, conceptId);
        if (content.tasks.every((task) => exposed.includes(task.id))) {
          blockers.push({
            code: 'items-exhausted',
            message:
              'Every question written for this concept has been used. Nothing will be re-served as if it were new.',
          });
        }

        const attempts = await listAttempts(context.db, context.userId, conceptId);
        if (attempts.length === 0 && content.teaching_explanation) {
          blockers.push({
            code: 'not-taught',
            message: 'Read the explanation first — a check before teaching is not a check.',
          });
        }
      }

      const ai = aiSettings(context.env);
      if (ai.unavailableReason) {
        blockers.push({ code: 'quota-exceeded', message: ai.unavailableReason });
      }

      return { ready: blockers.length === 0, blockers };
    },
  },
];
