import { askRoutes } from './ask.ts';
import { conceptRoutes } from './concepts.ts';
import { evidenceRoutes } from './evidence.ts';
import { sessionRoutes } from './session.ts';
import { sourceRoutes } from './sources.ts';
import { workspaceRoutes } from './workspaces.ts';
import type { Route } from './types.ts';

/**
 * The route table. One row per contract method, and `scripts/check-routes.mjs`
 * fails the build if that stops being true in either direction.
 *
 * It is a data structure rather than a series of `app.get(...)` calls so that
 * the check can read it without executing it, and so that `index.ts` has one
 * loop rather than thirty registrations to keep in step.
 */
export const ROUTES: Route[] = [
  ...workspaceRoutes,
  ...sourceRoutes,
  ...conceptRoutes,
  ...sessionRoutes,
  ...askRoutes,
  ...evidenceRoutes,
];

export type { Route } from './types.ts';
