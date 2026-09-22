import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';

import { ErrorBoundary } from '@/components/ErrorBoundary.tsx';
import { ThemeProvider } from '@/components/theme.tsx';
import { TooltipProvider } from '@/components/ui/tooltip.tsx';
import { Toaster } from '@/components/ui/sonner.tsx';
import { StoreProvider } from '@/store/store.tsx';
import { AppRoutes } from '@/routes.tsx';

import '@/styles/globals.css';

/**
 * The composition root.
 *
 * ── What is not here any more ─────────────────────────────────────────────
 *
 * The previous version mounted React Query over a simulated async API. There is
 * no async here: every read is a synchronous function of a local state tree, so
 * a query cache would add loading states that resolve in the same tick and an
 * invalidation story for data that cannot go stale. `StoreProvider` replaced
 * it, and the dependency went with it.
 *
 * The one genuinely async operation left — reading a text file the student
 * picked — is a promise awaited inside the component that owns the input, which
 * is the right size of machinery for one file read.
 *
 * `TooltipProvider` wraps everything because tooltips appear in several
 * features and Radix wants one provider for shared open/close timing; per-
 * instance providers give each tooltip its own delay, which reads as
 * inconsistent.
 */

const root = document.getElementById('root');
if (!root) throw new Error('#root is missing from index.html');

createRoot(root).render(
  <StrictMode>
    <ErrorBoundary>
      <ThemeProvider>
        <StoreProvider>
          <TooltipProvider delayDuration={300}>
            <BrowserRouter>
              <AppRoutes />
              <Toaster />
            </BrowserRouter>
          </TooltipProvider>
        </StoreProvider>
      </ThemeProvider>
    </ErrorBoundary>
  </StrictMode>,
);
