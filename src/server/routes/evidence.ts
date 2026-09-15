import { currentMonth } from '../ai/budget.ts';
import { aiSettings, flag } from '../env.ts';
import { monthlyUsage } from '../db/ai.ts';
import { listAttempts } from '../db/attempts.ts';
import {
  contentOf,
  exposedItemIds,
  getConceptEvidence,
  listConcepts,
} from '../db/concepts.ts';
import { assertOwnsWorkspace } from '../db/workspaces.ts';
import { buildStudyPlan } from '../analytics/mastery.ts';
import { summarise } from '../analytics/progress.ts';
import { advanceJob } from '../jobs/runner.ts';
import { getJob, listJobs } from '../db/jobs.ts';
import { param, type Route } from './types.ts';
import type { Profile, Quota } from '../../shared/contract.ts';

/**
 * Evidence, plan, jobs and account.
 *
 * ── `getJob` is what advances a job, and that is deliberate ───────────────
 *
 * There is no background scheduler on the free plan, so the polling client is
 * the pump. A learner who closes the tab pauses their own ingestion, which is
 * honest and resumes on the next poll. The `version` guard inside
 * `commitJobStep` is what makes a double-poll safe.
 */
export const evidenceRoutes: Route[] = [
  {
    method: 'GET',
    path: '/api/workspaces/:workspaceId/concepts/:conceptId/evidence',
    op: 'getConceptEvidence',
    handler: async (context) => {
      const workspaceId = param(context, 'workspaceId');
      await assertOwnsWorkspace(context.db, context.userId, workspaceId);
      return getConceptEvidence(
        context.db,
        context.userId,
        workspaceId,
        param(context, 'conceptId'),
      );
    },
  },
  {
    method: 'GET',
    path: '/api/workspaces/:workspaceId/evidence',
    op: 'getEvidenceSummary',
    handler: async (context) => {
      const workspaceId = param(context, 'workspaceId');
      await assertOwnsWorkspace(context.db, context.userId, workspaceId);

      const concepts = await listConcepts(context.db, context.userId, workspaceId);
      const withAttempts = await Promise.all(
        concepts.map(async (concept) => ({
          conceptId: concept.id,
          attempts: await listAttempts(context.db, context.userId, concept.id),
          dueDate: concept.dueAt,
        })),
      );

      return summarise(workspaceId, withAttempts, context.now);
    },
  },
  {
    method: 'GET',
    path: '/api/workspaces/:workspaceId/plan',
    op: 'getStudyPlan',
    handler: async (context) => {
      const workspaceId = param(context, 'workspaceId');
      await assertOwnsWorkspace(context.db, context.userId, workspaceId);

      const concepts = await listConcepts(context.db, context.userId, workspaceId);
      const inputs = await Promise.all(
        concepts.map(async (concept) => {
          const attempts = await listAttempts(context.db, context.userId, concept.id);
          const exposed = await exposedItemIds(context.db, context.userId, concept.id);
          return {
            conceptId: concept.id,
            conceptName: concept.name,
            prerequisiteIds: concept.prerequisiteIds,
            attempts,
            dueDate: concept.dueAt,
            // "Taught" is an observation from the log, not a flag someone set:
            // a recorded attempt past the diagnose stage means the explanation
            // was on screen.
            taught: attempts.some((attempt) => attempt.stage !== 'diagnose'),
            hasUnseenItems: concept.itemsRemaining > 0,
          };
        }),
      );

      return buildStudyPlan(workspaceId, inputs, context.now);
    },
  },
  {
    method: 'GET',
    path: '/api/workspaces/:workspaceId/jobs/:jobId',
    op: 'getJob',
    handler: async (context) => {
      const workspaceId = param(context, 'workspaceId');
      await assertOwnsWorkspace(context.db, context.userId, workspaceId);
      return advanceJob(
        context.db,
        context.userId,
        workspaceId,
        param(context, 'jobId'),
      );
    },
  },
  {
    method: 'GET',
    path: '/api/workspaces/:workspaceId/jobs',
    op: 'listJobs',
    handler: async (context) => {
      const workspaceId = param(context, 'workspaceId');
      await assertOwnsWorkspace(context.db, context.userId, workspaceId);
      return listJobs(context.db, context.userId, workspaceId);
    },
  },
  {
    method: 'GET',
    path: '/api/profile',
    op: 'getProfile',
    handler: async (context): Promise<Profile> => {
      const inviteOnly = flag(context.env.RAWI_INVITE_ONLY, false);

      let awaitingInvite = false;
      if (inviteOnly) {
        const { data } = await context.db
          .from('invite_enrollments')
          .select('enrollment_status')
          .eq('user_id', context.userId)
          .maybeSingle();
        awaitingInvite = (data as { enrollment_status?: string } | null)
          ?.enrollment_status !== 'enrolled';
      }

      return {
        userId: context.userId,
        email: context.email,
        timezone: context.query.get('tz') ?? 'UTC',
        awaitingInvite,
      };
    },
  },
  {
    method: 'GET',
    path: '/api/quota',
    op: 'getQuota',
    handler: async (context): Promise<Quota> => {
      const ai = aiSettings(context.env);
      const usage =
        ai.mode === 'live'
          ? await monthlyUsage(context.db, context.userId, currentMonth(context.now))
          : { spentMicrosUsd: 0, ambiguousCalls: 0 };

      const userCapCents =
        ai.userCapMicrosUsd === null ? null : Math.round(ai.userCapMicrosUsd / 10_000);
      const spentCents = Math.round(usage.spentMicrosUsd / 10_000);

      return {
        mode: ai.mode,
        monthlyCapCents:
          ai.monthlyCapMicrosUsd === null
            ? null
            : Math.round(ai.monthlyCapMicrosUsd / 10_000),
        userCapCents,
        userSpentCents: spentCents,
        ambiguousCalls: usage.ambiguousCalls,
        available: ai.mode === 'live' && (userCapCents === null || spentCents < userCapCents),
        unavailableReason:
          ai.unavailableReason ??
          (ai.mode === 'fixture'
            ? 'Running on fixtures. Set RAWI_AI_MODE to "live" once both caps and a service account are configured.'
            : null),
      };
    },
  },
];

/** Re-exported so the route table can be assembled without a second import. */
export { getJob };
