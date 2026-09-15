import { PROMPT_VERSION } from './ai/prompts.ts';

/**
 * The environment, read once and interpreted in one place.
 *
 * ── Fail closed ───────────────────────────────────────────────────────────
 *
 * `aiMode` is `live` only when **all** of it is present: a project, a service
 * account, and both caps. Missing configuration is not a reason to fall back to
 * "probably fine" — a missing cap means nobody has decided what this may cost,
 * and the honest response is fixtures plus a sentence saying why.
 *
 * `unavailableReason` exists so the app can say which piece is missing. "AI is
 * unavailable" sends the owner to read source; "RAWI_AI_USER_MONTHLY_CAP_USD is
 * not set" sends them to one line of `.dev.vars`.
 */

export interface Env {
  // Vars (wrangler.jsonc)
  RAWI_AI_MODE?: string;
  RAWI_INVITE_ONLY?: string;
  RAWI_GOOGLE_OAUTH_ENABLED?: string;
  RAWI_UPLOADS_ENABLED?: string;
  RAWI_AI_TIMEOUT_MS?: string;
  RAWI_RETENTION_DAYS?: string;

  // Secrets (.dev.vars / wrangler secret put)
  GOOGLE_CLOUD_PROJECT?: string;
  VERTEX_LOCATION?: string;
  VERTEX_MODEL?: string;
  GOOGLE_SA_CLIENT_EMAIL?: string;
  GOOGLE_SA_PRIVATE_KEY?: string;
  SUPABASE_URL?: string;
  SUPABASE_ANON_KEY?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  RAWI_AI_MONTHLY_CAP_USD?: string;
  RAWI_AI_USER_MONTHLY_CAP_USD?: string;
  VERTEX_INPUT_USD_PER_MILLION?: string;
  VERTEX_OUTPUT_USD_PER_MILLION?: string;

  ASSETS: { fetch: (request: Request) => Promise<Response> };
}

export interface AiSettings {
  mode: 'fixture' | 'live';
  unavailableReason: string | null;
  project: string;
  location: string;
  model: string;
  clientEmail: string;
  privateKey: string;
  timeoutMs: number;
  monthlyCapMicrosUsd: number | null;
  userCapMicrosUsd: number | null;
  pricing: { inputUsdPerMillion: number; outputUsdPerMillion: number };
  promptVersion: string;
}

function usdToMicros(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return Math.round(parsed * 1_000_000);
}

export function aiSettings(env: Env): AiSettings {
  const monthlyCapMicrosUsd = usdToMicros(env.RAWI_AI_MONTHLY_CAP_USD);
  const userCapMicrosUsd = usdToMicros(env.RAWI_AI_USER_MONTHLY_CAP_USD);

  const base = {
    project: env.GOOGLE_CLOUD_PROJECT ?? '',
    location: env.VERTEX_LOCATION ?? 'global',
    model: env.VERTEX_MODEL ?? 'gemini-3.6-flash',
    clientEmail: env.GOOGLE_SA_CLIENT_EMAIL ?? '',
    privateKey: env.GOOGLE_SA_PRIVATE_KEY ?? '',
    timeoutMs: Number(env.RAWI_AI_TIMEOUT_MS ?? '20000'),
    monthlyCapMicrosUsd,
    userCapMicrosUsd,
    pricing: {
      inputUsdPerMillion: Number(env.VERTEX_INPUT_USD_PER_MILLION ?? '0'),
      outputUsdPerMillion: Number(env.VERTEX_OUTPUT_USD_PER_MILLION ?? '0'),
    },
    promptVersion: PROMPT_VERSION,
  };

  if (env.RAWI_AI_MODE !== 'live') {
    return { ...base, mode: 'fixture', unavailableReason: null };
  }

  const missing: string[] = [];
  if (!base.project) missing.push('GOOGLE_CLOUD_PROJECT');
  if (!base.clientEmail) missing.push('GOOGLE_SA_CLIENT_EMAIL');
  if (!base.privateKey) missing.push('GOOGLE_SA_PRIVATE_KEY');
  if (monthlyCapMicrosUsd === null) missing.push('RAWI_AI_MONTHLY_CAP_USD');
  if (userCapMicrosUsd === null) missing.push('RAWI_AI_USER_MONTHLY_CAP_USD');
  if (!base.pricing.inputUsdPerMillion) missing.push('VERTEX_INPUT_USD_PER_MILLION');
  if (!base.pricing.outputUsdPerMillion) missing.push('VERTEX_OUTPUT_USD_PER_MILLION');

  if (missing.length > 0) {
    return {
      ...base,
      mode: 'fixture',
      unavailableReason: `RAWI_AI_MODE is "live" but ${missing.join(', ')} ${missing.length === 1 ? 'is' : 'are'} not set, so Rawi is running on fixtures. See docs/OPERATIONS.md §5.1.`,
    };
  }

  return { ...base, mode: 'live', unavailableReason: null };
}

export function flag(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  return value === 'true' || value === '1';
}
