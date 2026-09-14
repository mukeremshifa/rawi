import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { AuthConfigResponse } from '../shared/types.js';

let client: SupabaseClient | null = null;

export type AuthBootstrap =
  | { readonly mode: 'fixture' }
  | { readonly mode: 'setup-required' }
  | { readonly mode: 'signed-out' }
  | { readonly mode: 'signed-in' };

export async function bootstrapAuth(): Promise<AuthBootstrap> {
  const response = await fetch('/api/auth/config', {
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) throw new Error('auth_config_unavailable');

  const config = (await response.json()) as AuthConfigResponse;
  if (!config.configured) return { mode: 'fixture' };
  if (!config.serverReady || !config.supabaseUrl || !config.supabaseAnonKey) {
    return { mode: 'setup-required' };
  }

  client = createClient(config.supabaseUrl, config.supabaseAnonKey, {
    auth: {
      flowType: 'pkce',
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });

  const { data, error } = await client.auth.getSession();
  if (error) throw error;

  // Supabase has exchanged the single-use callback code by this point. Remove
  // it from browser history so refresh/back cannot attempt the exchange again.
  const url = new URL(window.location.href);
  if (url.searchParams.has('code')) {
    window.history.replaceState({}, document.title, '/');
  }

  return data.session ? { mode: 'signed-in' } : { mode: 'signed-out' };
}

export async function getAccessToken(): Promise<string | null> {
  if (!client) return null;
  const { data, error } = await client.auth.getSession();
  if (error) return null;
  return data.session?.access_token ?? null;
}

export async function signInWithGoogle(): Promise<void> {
  if (!client) throw new Error('auth_not_configured');
  const redirectTo = `${window.location.origin}/auth/callback`;
  const { error } = await client.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo },
  });
  if (error) throw error;
}

export async function signOut(): Promise<void> {
  if (client) {
    const { error } = await client.auth.signOut({ scope: 'local' });
    if (error) throw error;
  }
  client = null;
}
