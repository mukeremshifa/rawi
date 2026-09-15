import {
  CreateWorkspaceInput,
  UpdateWorkspaceInput,
} from '../../shared/contract.ts';
import * as workspaces from '../db/workspaces.ts';
import { pageFromQuery, param, parseBody, type Route } from './types.ts';

/**
 * Workspace routes.
 *
 * Every other route file begins by calling `assertOwnsWorkspace`. It is not
 * factored into middleware on purpose: middleware that enforces ownership is
 * middleware someone can forget to apply to a new route, and the failure is
 * silent. A handler whose first line is the check is a handler you can audit by
 * reading its first line.
 */
export const workspaceRoutes: Route[] = [
  {
    method: 'GET',
    path: '/api/workspaces',
    op: 'listWorkspaces',
    handler: async (context) =>
      workspaces.listWorkspaces(
        context.db,
        context.userId,
        pageFromQuery(context.query),
        context.now,
      ),
  },
  {
    method: 'POST',
    path: '/api/workspaces',
    op: 'createWorkspace',
    handler: async (context) =>
      workspaces.createWorkspace(
        context.db,
        context.userId,
        parseBody(CreateWorkspaceInput, context.body),
      ),
  },
  {
    method: 'GET',
    path: '/api/workspaces/:workspaceId',
    op: 'getWorkspace',
    handler: async (context) =>
      workspaces.getWorkspace(
        context.db,
        context.userId,
        param(context, 'workspaceId'),
        context.now,
      ),
  },
  {
    method: 'PATCH',
    path: '/api/workspaces/:workspaceId',
    op: 'updateWorkspace',
    handler: async (context) => {
      const workspaceId = param(context, 'workspaceId');
      await workspaces.assertOwnsWorkspace(context.db, context.userId, workspaceId);
      return workspaces.updateWorkspace(
        context.db,
        context.userId,
        workspaceId,
        parseBody(UpdateWorkspaceInput, context.body),
        context.now,
      );
    },
  },
  {
    method: 'DELETE',
    path: '/api/workspaces/:workspaceId',
    op: 'deleteWorkspace',
    handler: async (context) => {
      const workspaceId = param(context, 'workspaceId');
      await workspaces.assertOwnsWorkspace(context.db, context.userId, workspaceId);
      await workspaces.deleteWorkspace(context.db, context.userId, workspaceId);
      return null;
    },
  },
];
