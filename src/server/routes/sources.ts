import {
  AddSourceInput,
  ApiClientError,
  UploadRequest,
  type UploadTicket,
} from '../../shared/contract.ts';
import { JOB_STAGE } from '../../shared/messages.ts';
import { flag } from '../env.ts';
import { createJob } from '../db/jobs.ts';
import * as sources from '../db/sources.ts';
import { assertOwnsWorkspace } from '../db/workspaces.ts';
import { estimateChunkCount, extractPlainText } from '../retrieval/chunk.ts';
import { pageFromQuery, param, parseBody, type Route } from './types.ts';

/**
 * Source routes.
 *
 * ── Why `addSource` returns a job and not a source ────────────────────────
 *
 * Chunking is stepped (see `jobs/runner.ts`), so a source is not searchable the
 * moment it is created. Returning the source would let the UI show it as ready
 * when it is not, and the first Ask against it would find nothing and look
 * broken. Returning a job makes the wait visible, which is what
 * `GeneratingState` exists for.
 */
export const sourceRoutes: Route[] = [
  {
    method: 'GET',
    path: '/api/workspaces/:workspaceId/sources',
    op: 'listSources',
    handler: async (context) => {
      const workspaceId = param(context, 'workspaceId');
      await assertOwnsWorkspace(context.db, context.userId, workspaceId);
      return sources.listSources(
        context.db,
        context.userId,
        workspaceId,
        pageFromQuery(context.query),
      );
    },
  },
  {
    method: 'GET',
    path: '/api/workspaces/:workspaceId/sources/:sourceId',
    op: 'getSource',
    handler: async (context) => {
      const workspaceId = param(context, 'workspaceId');
      await assertOwnsWorkspace(context.db, context.userId, workspaceId);
      return sources.getSource(
        context.db,
        context.userId,
        workspaceId,
        param(context, 'sourceId'),
      );
    },
  },
  {
    method: 'GET',
    path: '/api/workspaces/:workspaceId/sources/:sourceId/chunks',
    op: 'getSourceChunks',
    handler: async (context) => {
      const workspaceId = param(context, 'workspaceId');
      await assertOwnsWorkspace(context.db, context.userId, workspaceId);
      return sources.listChunks(
        context.db,
        context.userId,
        workspaceId,
        param(context, 'sourceId'),
        pageFromQuery(context.query),
      );
    },
  },
  {
    method: 'POST',
    path: '/api/workspaces/:workspaceId/uploads',
    op: 'requestUpload',
    handler: async (context): Promise<UploadTicket> => {
      const workspaceId = param(context, 'workspaceId');
      await assertOwnsWorkspace(context.db, context.userId, workspaceId);

      if (!flag(context.env.RAWI_UPLOADS_ENABLED, true)) {
        throw new ApiClientError('forbidden', 'Uploads are turned off right now.');
      }

      const input = parseBody(UploadRequest, context.body);

      // The path starts with the user id because the storage policy in
      // migration 007 keys on the first folder segment. Putting the workspace
      // first would make that policy unwritable without a join.
      const path = `${context.userId}/${workspaceId}/${crypto.randomUUID()}-${input.filename}`;

      const { data, error } = await context.db.storage
        .from('sources')
        .createSignedUploadUrl(path);

      if (error || !data) {
        throw new ApiClientError(
          'internal',
          `Could not prepare the upload: ${error?.message ?? 'unknown'}. Is the private "sources" bucket created? See docs/OPERATIONS.md step 2.`,
        );
      }

      return {
        uploadUrl: data.signedUrl,
        path,
        expiresAt: new Date(context.now.getTime() + 2 * 60 * 60 * 1000).toISOString(),
      };
    },
  },
  {
    method: 'POST',
    path: '/api/workspaces/:workspaceId/sources',
    op: 'addSource',
    handler: async (context) => {
      const workspaceId = param(context, 'workspaceId');
      await assertOwnsWorkspace(context.db, context.userId, workspaceId);
      const input = parseBody(AddSourceInput, context.body);

      let text: string;
      if (input.kind === 'pasted') {
        if (!input.text?.trim()) {
          throw new ApiClientError('invalid_input', 'There is no text to add.');
        }
        text = extractPlainText(input.text, 'text/plain');
      } else {
        if (!input.uploadPath) {
          throw new ApiClientError('invalid_input', 'The upload did not complete.');
        }
        const { data, error } = await context.db.storage
          .from('sources')
          .download(input.uploadPath);
        if (error || !data) {
          throw new ApiClientError('not_found', 'That upload is not there.');
        }
        text = extractPlainText(
          await data.text(),
          input.uploadPath.endsWith('.md') ? 'text/markdown' : 'text/plain',
        );
      }

      const source = await sources.createSource(context.db, {
        userId: context.userId,
        workspaceId,
        title: input.title,
        kind: input.kind,
        text,
        storagePath: input.uploadPath ?? null,
      });

      return createJob(context.db, {
        userId: context.userId,
        workspaceId,
        kind: 'ingest-source',
        stage: JOB_STAGE.reading,
        // An estimate, replaced by the real count when the job finishes. It is
        // a number rather than null because the text is already in hand — the
        // null case is for work whose size genuinely is not known yet.
        unitsTotal: estimateChunkCount(text),
        subjectId: source.id,
        cursor: { offset: 0, ordinal: 0 },
      });
    },
  },
  {
    method: 'DELETE',
    path: '/api/workspaces/:workspaceId/sources/:sourceId',
    op: 'deleteSource',
    handler: async (context) => {
      const workspaceId = param(context, 'workspaceId');
      await assertOwnsWorkspace(context.db, context.userId, workspaceId);
      await sources.deleteSource(
        context.db,
        context.userId,
        workspaceId,
        param(context, 'sourceId'),
      );
      return null;
    },
  },
];
