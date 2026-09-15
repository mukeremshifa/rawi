import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';

import { Page } from '@/components/layout.tsx';
import { LoadingState } from '@/components/states.tsx';

import { useAuth } from './AuthProvider.tsx';

/**
 * The guard.
 *
 * The three-state check matters: `loading` is not `signed out`. Redirecting on
 * the first render — before the session has been read — bounces an
 * already-signed-in learner to the sign-in screen and back, which is the flicker
 * every auth implementation has once before someone notices it.
 */
export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <Page width="prose">
        <LoadingState lines={4} label="Checking your session" />
      </Page>
    );
  }

  if (!user) {
    // `state.from` so signing in returns you where you were trying to go,
    // rather than to the top of the app.
    return <Navigate to="/sign-in" replace state={{ from: location.pathname }} />;
  }

  return <>{children}</>;
}
