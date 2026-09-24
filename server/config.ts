/**
 * Server configuration, read once from the environment.
 *
 * `.env.local` in the project root is loaded when present, and it is ignored
 * by Git. Nothing here is ever sent to the browser except the model names,
 * the location and the budget figures, which `/api/ai/status` reports.
 */

try {
  process.loadEnvFile('.env.local');
} catch {
  /* No file is fine: the variables may come from the shell instead. */
}

function num(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${name} must be a non-negative number, got "${raw}".`);
  }
  return value;
}

function str(name: string, fallback: string): string {
  const raw = process.env[name]?.trim();
  return raw ? raw : fallback;
}

export type Task = 'tutor' | 'generate' | 'grade';

export interface ModelPrice {
  inputPerMillion: number;
  outputPerMillion: number;
}

export const config = {
  port: num('RAWI_API_PORT', 8787),
  /** Loopback only. The server refuses to bind anywhere else. */
  host: '127.0.0.1',
  allowedOrigins: str(
    'RAWI_ALLOWED_ORIGINS',
    'http://localhost:5173,http://127.0.0.1:5173',
  )
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean),
  maxBodyBytes: num('RAWI_MAX_BODY_BYTES', 256 * 1024),

  project: process.env.GOOGLE_CLOUD_PROJECT?.trim() || null,
  location: str('GOOGLE_CLOUD_LOCATION', 'global'),

  mainModel: str('RAWI_MODEL', 'gemini-3.8-flash'),
  liteModel: str('RAWI_LITE_MODEL', 'gemini-3.5-flash-lite'),
  /** Tasks sent to the lite model instead. Empty by default. */
  liteTasks: new Set(
    str('RAWI_LITE_TASKS', '')
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean) as Task[],
  ),
  /** LOW, MEDIUM or HIGH for the main model. Empty sends no thinking config. */
  thinkingLevel: str('RAWI_THINKING_LEVEL', 'LOW'),
  liteThinkingLevel: process.env.RAWI_LITE_THINKING_LEVEL?.trim() ?? '',

  maxOutputTokens: {
    tutor: num('RAWI_MAX_OUTPUT_TUTOR', 2048),
    generate: num('RAWI_MAX_OUTPUT_GENERATE', 8192),
    grade: num('RAWI_MAX_OUTPUT_GRADE', 2048),
  } satisfies Record<Task, number>,
  /** Estimated input tokens above which a request is refused. */
  maxInputTokens: num('RAWI_MAX_INPUT_TOKENS', 16000),

  maxConcurrent: num('RAWI_MAX_CONCURRENT', 2),
  /** Extra attempts after a retryable upstream failure. */
  maxRetries: num('RAWI_MAX_RETRIES', 1),

  dailyBudgetUsd: num('RAWI_DAILY_BUDGET_USD', 5),
  totalBudgetUsd: num('RAWI_TOTAL_BUDGET_USD', 80),
  ledgerPath: str('RAWI_LEDGER_PATH', '.rawi/ledger.json'),

  /**
   * Prices per million tokens. Output includes thinking tokens. Defaults are
   * the published global standard rates the owner supplied for September 2026,
   * and they are estimates for the ledger, not a bill.
   */
  prices: {
    main: {
      inputPerMillion: num('RAWI_PRICE_MAIN_INPUT', 0.75),
      outputPerMillion: num('RAWI_PRICE_MAIN_OUTPUT', 3.75),
    },
    lite: {
      inputPerMillion: num('RAWI_PRICE_LITE_INPUT', 0.3),
      outputPerMillion: num('RAWI_PRICE_LITE_OUTPUT', 2.5),
    },
  } satisfies Record<'main' | 'lite', ModelPrice>,
};

export function modelFor(task: Task): { model: string; tier: 'main' | 'lite' } {
  return config.liteTasks.has(task)
    ? { model: config.liteModel, tier: 'lite' }
    : { model: config.mainModel, tier: 'main' };
}

/** What is missing before a request can be sent, in plain words. */
export function missingConfiguration(): string[] {
  const missing: string[] = [];
  if (!config.project) {
    missing.push(
      'GOOGLE_CLOUD_PROJECT is not set. Add it to .env.local in the project folder and restart npm run dev.',
    );
  }
  return missing;
}
