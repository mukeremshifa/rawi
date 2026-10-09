export const requiredBindings = ['DATABASE_URL', 'BETTER_AUTH_SECRET', 'BETTER_AUTH_URL', 'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'] as const;
type FileBindings = {
  MATERIALS_BUCKET?: R2Bucket;
  R2_ACCOUNT_ID?: string; R2_BUCKET_NAME?: string; R2_ACCESS_KEY_ID?: string; R2_SECRET_ACCESS_KEY?: string; R2_ENVIRONMENT?: string;
  MATERIAL_MAX_FILE_BYTES?: string; MATERIAL_MAX_TEXT_BYTES?: string; MATERIAL_WORKSPACE_BYTES?: string; MATERIAL_PENDING_LIMIT?: string;
  // Document conversion. Server-side only, never logged or sent to the client.
  DATALAB_API_KEY?: string;
};
export type BackendBindings = Omit<Env, typeof requiredBindings[number] | keyof FileBindings> & Partial<Record<typeof requiredBindings[number], string>> & FileBindings;
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
