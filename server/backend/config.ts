export const requiredBindings = ['DATABASE_URL', 'BETTER_AUTH_SECRET', 'BETTER_AUTH_URL', 'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'] as const;
export type BackendBindings = Omit<Env, typeof requiredBindings[number]> & Partial<Record<typeof requiredBindings[number], string>>;
export function configurationProblems(env: BackendBindings) {
  const missing: string[] = requiredBindings.filter(key => !env[key]?.trim());
  if (env.BETTER_AUTH_SECRET && (env.BETTER_AUTH_SECRET.length < 32 || env.BETTER_AUTH_SECRET.startsWith('REPLACE_'))) missing.push('BETTER_AUTH_SECRET must be a random secret of at least 32 characters');
  if (env.BETTER_AUTH_URL) {
    try {
      const url = new URL(env.BETTER_AUTH_URL);
      if (url.origin !== env.BETTER_AUTH_URL || (url.protocol !== 'https:' && !(url.protocol === 'http:' && url.hostname === 'localhost'))) throw new Error();
    } catch { missing.push('BETTER_AUTH_URL must be an HTTPS origin, or http://localhost:5173 for development'); }
  }
  return missing;
}
