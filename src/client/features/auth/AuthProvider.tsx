import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { API_MODE } from '@/api/provider.tsx';

/**
 * Supabase Auth, with **email magic link as the primary method**.
 *
 * ── Why magic link and not a password ─────────────────────────────────────
 *
 * No password is stored, no reset flow has to be built, no SMTP has to be
 * configured beyond Supabase's defaults, and the owner's external setup is one
 * checkbox. For a product at this stage, every one of those is a whole class of
 * work that does not have to happen — and the security posture is better, not
 * worse, than a password nobody will have chosen carefully.
 *
 * Google OAuth is implemented and **feature-flagged off**
 * (`RAWI_GOOGLE_OAUTH_ENABLED`). The button appears once the owner has
 * configured the provider in Supabase; until then it would be a button that
 * fails.
 *
 * ── Fake mode is signed in, and that is not a shortcut ────────────────────
 *
 * With `VITE_API_MODE=fake` there is no Supabase project and no token to get.
 * Pretending otherwise would mean the e2e suite tests a sign-in screen that
 * cannot succeed. So fake mode reports a demo session and the app runs — which
 * is exactly what makes the whole gate runnable with no credentials.
 */

export interface AuthUser {
  id: string;
  email: string | null;
}

interface AuthContextValue {
  user: AuthUser | null;
  /** Distinguishes "signed out" from "we have not looked yet". */
  loading: boolean;
  /** Null in fake mode, where nothing needs a token. */
  getToken: () => Promise<string | null>;
  signInWithEmail: (email: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  googleEnabled: boolean;
  /** Exposed so the callback route can complete the exchange. */
  supabase: SupabaseClient | null;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const url = import.meta.env['VITE_SUPABASE_URL'] as string | undefined;
const anonKey = import.meta.env['VITE_SUPABASE_ANON_KEY'] as string | undefined;

/**
 * One client per page load. `createClient` sets up a token-refresh timer and a
 * storage listener, so building a second one leaves the first running and the
 * two race each other to write the session.
 */
export const supabaseClient: SupabaseClient | null =
  API_MODE === 'live' && url && anonKey ? createClient(url, anonKey) : null;

const DEMO_USER: AuthUser = { id: 'demo-user', email: 'you@example.com' };

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(
    supabaseClient ? null : DEMO_USER,
  );
  const [loading, setLoading] = useState(supabaseClient !== null);

  useEffect(() => {
    if (!supabaseClient) return;

    let cancelled = false;

    void supabaseClient.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      setUser(
        data.session
          ? { id: data.session.user.id, email: data.session.user.email ?? null }
          : null,
      );
      setLoading(false);
    });

    const { data: subscription } = supabaseClient.auth.onAuthStateChange(
      (_event, session) => {
        setUser(
          session ? { id: session.user.id, email: session.user.email ?? null } : null,
        );
        setLoading(false);
      },
    );

    return () => {
      cancelled = true;
      subscription.subscription.unsubscribe();
    };
  }, []);

  const getToken = useCallback(async () => {
    if (!supabaseClient) return null;
    // Read through `getSession` rather than caching: it refreshes an expired
    // token transparently, and a token captured at mount expires mid-session.
    const { data } = await supabaseClient.auth.getSession();
    return data.session?.access_token ?? null;
  }, []);

  const signInWithEmail = useCallback(async (email: string) => {
    if (!supabaseClient) return;
    const { error } = await supabaseClient.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) throw new Error(error.message);
  }, []);

  const signInWithGoogle = useCallback(async () => {
    if (!supabaseClient) return;
    const { error } = await supabaseClient.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) throw new Error(error.message);
  }, []);

  const signOut = useCallback(async () => {
    if (!supabaseClient) return;
    await supabaseClient.auth.signOut();
    setUser(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      getToken,
      signInWithEmail,
      signInWithGoogle,
      signOut,
      // Read from the build, so an unconfigured provider cannot be offered.
      googleEnabled:
        (import.meta.env['VITE_GOOGLE_OAUTH_ENABLED'] as string | undefined) === 'true',
      supabase: supabaseClient,
    }),
    [user, loading, getToken, signInWithEmail, signInWithGoogle, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}
