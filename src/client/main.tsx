import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { ApiProvider } from '@/api/provider.tsx';
import { ErrorBoundary } from '@/components/ErrorBoundary.tsx';
import { ThemeProvider } from '@/components/theme.tsx';
import { Toaster } from '@/components/ui/sonner.tsx';
import { AuthProvider, useAuth } from '@/features/auth/AuthProvider.tsx';
import { AppRoutes } from '@/routes.tsx';

import '@/styles/globals.css';

/**
 * The composition root.
 *
 * ── Retry, and why `stale_request` must not be retried ────────────────────
 *
 * React Query retries failed queries by default, which is right for a dropped
 * connection and wrong for everything else here. A 409 means the session moved
 * on; retrying it three times produces three identical rejections and delays
 * the reload the learner actually needs. So retries are limited to genuinely
 * transient codes, and everything else surfaces immediately.
 */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error) => {
        const code = (error as { code?: string }).code;
        const transient = code === 'network' || code === 'rate_limited';
        return transient && failureCount < 2;
      },
      // A learner switching tabs mid-session does not need everything refetched
      // on focus; the session state is written by its own mutations.
      refetchOnWindowFocus: false,
      staleTime: 30_000,
    },
    mutations: { retry: false },
  },
});

function App() {
  const { getToken } = useAuth();
  return (
    <ApiProvider getToken={getToken}>
      <AppRoutes />
      <Toaster />
    </ApiProvider>
  );
}

const root = document.getElementById('root');
if (!root) throw new Error('#root is missing from index.html');

createRoot(root).render(
  <StrictMode>
    <ErrorBoundary>
      <ThemeProvider>
        <QueryClientProvider client={queryClient}>
          <BrowserRouter>
            <AuthProvider>
              <App />
            </AuthProvider>
          </BrowserRouter>
        </QueryClientProvider>
      </ThemeProvider>
    </ErrorBoundary>
  </StrictMode>,
);
