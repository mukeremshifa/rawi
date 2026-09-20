import { Link, Navigate, Route, Routes } from 'react-router-dom';

import { Page, PageHeader } from '@/components/layout.tsx';
import { Button } from '@/components/ui/button.tsx';
import { AskPage } from '@/features/ask/AskPage.tsx';
import { ConceptMapPage } from '@/features/concepts/ConceptMapPage.tsx';
import { ConceptPage } from '@/features/concepts/ConceptPage.tsx';
import { EvidencePage } from '@/features/evidence/EvidencePage.tsx';
import { PlanPage } from '@/features/plan/PlanPage.tsx';
import { SessionPage } from '@/features/session/SessionPage.tsx';
import { SourcePage } from '@/features/sources/SourcePage.tsx';
import { SourcesPage } from '@/features/sources/SourcesPage.tsx';
import { WorkspaceListPage } from '@/features/workspace/WorkspaceListPage.tsx';
import { WorkspaceShell } from '@/features/workspace/WorkspaceShell.tsx';

/**
 * The route table.
 *
 * **What you are looking at lives in the URL.** Every screen below can be
 * bookmarked, shared and reloaded into the same state, and the workspace is
 * always in the path rather than in a context that survived a navigation. That
 * is the same rule the contract enforces on the server side, applied to the
 * browser: a surface that cannot name its workspace is not a valid surface.
 *
 * Note the session route nests under its concept. A session is not a top-level
 * object you visit; it is a thing happening to a concept, and the URL says so —
 * which also means the back button from a session lands somewhere sensible.
 */
export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<WorkspaceListPage />} />

      <Route path="/w/:workspaceId" element={<WorkspaceShell />}>
        <Route index element={<PlanPage />} />
        <Route path="concepts" element={<ConceptMapPage />} />
        <Route path="concepts/:conceptId" element={<ConceptPage />} />
        <Route path="concepts/:conceptId/session/:sessionId" element={<SessionPage />} />
        <Route path="sources" element={<SourcesPage />} />
        <Route path="sources/:sourceId" element={<SourcePage />} />
        <Route path="ask" element={<AskPage />} />
        <Route path="evidence" element={<EvidencePage />} />
      </Route>

      {/* A real 404 rather than a redirect to the root. Silently sending a
          mistyped URL home hides the mistake and loses the address someone was
          trying to reach. */}
      <Route path="/404" element={<NotFoundPage />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}

function NotFoundPage() {
  return (
    <Page width="prose" className="py-page">
      <PageHeader
        title="Not here"
        description="That address does not point at anything in Rawi. It may have been deleted, or the link may be wrong."
      />
      <Button asChild className="self-start">
        <Link to="/">Back to your workspaces</Link>
      </Button>
    </Page>
  );
}

export { NotFoundPage };
export { Navigate };
