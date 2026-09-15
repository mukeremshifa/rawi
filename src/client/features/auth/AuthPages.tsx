import { useEffect, useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';

import { Logo } from '@/components/Logo.tsx';
import { Page } from '@/components/layout.tsx';
import { ErrorState, LoadingState } from '@/components/states.tsx';
import { Button } from '@/components/ui/button.tsx';
import { Input } from '@/components/ui/input.tsx';
import { Label } from '@/components/ui/label.tsx';

import { useAuth } from './AuthProvider.tsx';

/**
 * Sign in, and the callback the magic link lands on.
 *
 * The sign-in screen says what Rawi is in one sentence before asking for an
 * email. A form with no explanation is a form people abandon, and this is the
 * only screen a stranger sees.
 */
export function SignInPage() {
  const { user, loading, signInWithEmail, signInWithGoogle, googleEnabled } = useAuth();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (loading) {
    return (
      <Page width="prose">
        <LoadingState lines={4} label="Checking your session" />
      </Page>
    );
  }
  if (user) return <Navigate to="/" replace />;

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await signInWithEmail(email);
      setSent(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'That did not work.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Page width="prose" className="pt-page">
      <div className="flex flex-col gap-section">
        <Logo />

        <div className="flex flex-col gap-snug">
          <h1 className="font-serif text-3xl tracking-tight">Sign in</h1>
          <p className="text-muted-foreground text-sm leading-relaxed">
            Rawi takes material you do not understand, teaches it, and checks you can
            use it without help — then checks again later.
          </p>
        </div>

        {sent ? (
          <div
            className="border-border-strong rounded-lg border p-gutter"
            role="status"
            aria-live="polite"
          >
            <p className="text-sm leading-relaxed">
              Check <span className="font-mono">{email}</span> for a sign-in link. It
              opens Rawi directly; there is no password to remember.
            </p>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="flex flex-col gap-base">
            <div className="flex flex-col gap-tight">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
                className="font-mono"
              />
            </div>

            {error && <ErrorState title="Could not send the link" detail={error} />}

            <Button type="submit" disabled={busy || email.length === 0}>
              {busy ? 'Sending…' : 'Email me a sign-in link'}
            </Button>

            {googleEnabled && (
              <Button type="button" variant="outline" onClick={() => void signInWithGoogle()}>
                Continue with Google
              </Button>
            )}
          </form>
        )}
      </div>
    </Page>
  );
}

/**
 * The magic link lands here.
 *
 * Supabase's client picks the session out of the URL on load, so this route's
 * job is to wait for that and then get out of the way. It renders a loading
 * state rather than nothing, because a blank screen during a redirect is the
 * moment people press back.
 */
export function AuthCallbackPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    if (!loading && user) navigate('/', { replace: true });
  }, [loading, user, navigate]);

  useEffect(() => {
    // A link that was already used, or expired, leaves this screen waiting
    // forever. Saying so beats spinning.
    const timer = setTimeout(() => setTimedOut(true), 8000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <Page width="prose" className="pt-page">
      {timedOut && !user ? (
        <ErrorState
          title="That link did not sign you in"
          detail="It may have already been used, or expired. Ask for a new one."
          onRetry={() => navigate('/sign-in', { replace: true })}
          retryLabel="Back to sign in"
        />
      ) : (
        <LoadingState lines={3} label="Signing you in" />
      )}
    </Page>
  );
}
