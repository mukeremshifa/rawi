import type { Language, ServiceTier, Skill, Usage, Vendor } from './types';

/**
 * Every model route Rawi can call, all through OpenRouter. A route names the model and the
 * providers it may run on, in order, and every request is restricted to endpoints that keep no
 * prompts. Which route serves a skill is the order in `PREFERENCE`. The router skips routes that
 * are unconfigured for the funding source, unhealthy, too small for the request or not cleared for
 * student writing.
 *
 * Prices are dollars per million units, which is micro-dollars per unit, read from OpenRouter on
 * 27 November 2026 for the pinned providers. They bound a reservation before a call. The settled
 * charge is what OpenRouter reports.
 */
export interface Route {
  id: string;
  vendor: Vendor;
  /** OpenRouter's model id. */
  model: string;
  /** Provider slugs the request may run on, tried in order. Nothing else is used. */
  providers: string[];
  /** The providers, as recorded on each call. */
  region: string;
  price: { input: number; cacheWrite: number; cacheRead: number; output: number; perImage?: number };
  /** Input tokens the route accepts. */
  context: number;
  /** A discounted lane for background work. None of the pinned providers offers one yet. */
  flex: boolean;
  /** `explicit` takes a cache point after the stable prefix, `implicit` reuses one by itself. */
  cache: 'explicit' | 'implicit' | 'none';
  vision: boolean;
  /**
   * Cleared for what a student writes: the pinned providers are known to keep no copy at all,
   * not even prompts a safety filter flags. Bedrock qualifies. Routes without it serve course
   * material only.
   */
  student: boolean;
  /** Whether the model takes a temperature. Reasoning models set their own. */
  temperature: boolean;
  /** How much the model may think before answering. Off unless a task gains from it. */
  reasoning?: 'none' | 'low';
  kind: 'text' | 'embed';
  /** Embedding size, for embedding routes. Must match the vector column. */
  dimensions?: number;
}

const openrouter = (
  id: string,
  model: string,
  providers: string[],
  price: Route['price'],
  extra: Partial<Route> = {},
): Route => ({
  id,
  vendor: 'openrouter',
  model,
  providers,
  region: providers.join(','),
  price,
  context: 200_000,
  flex: false,
  cache: 'none',
  vision: false,
  student: false,
  temperature: true,
  kind: 'text',
  ...extra,
});

/** An image costs roughly this many input tokens on the routes that read them. */
const IMAGE_TOKENS = 1600;

export const ROUTES: Route[] = [
  // The workhorse for anything a student writes, and the solving check. On Bedrock, which keeps no prompts.
  openrouter(
    'claude-haiku-5.5',
    'anthropic/claude-haiku-5.5',
    ['amazon-bedrock'],
    { input: 0.1, cacheWrite: 0.125, cacheRead: 0.01, output: 0.5, perImage: 0.1 * IMAGE_TOKENS },
    { cache: 'explicit', vision: true, student: true, temperature: false, reasoning: 'none' },
  ),
  // The other family at the same price: writes questions, so its checker is a different model.
  openrouter(
    'gpt-6-luna',
    'openai/gpt-6-luna',
    ['azure'],
    { input: 0.1, cacheWrite: 0, cacheRead: 0.01, output: 0.5, perImage: 0.1 * IMAGE_TOKENS },
    { cache: 'implicit', vision: true, temperature: false, reasoning: 'none' },
  ),
  // Escalation, and the fallback for student writing when the workhorse is down.
  openrouter(
    'claude-sonnet-5.5',
    'anthropic/claude-sonnet-5.5',
    ['amazon-bedrock'],
    { input: 2, cacheWrite: 2.5, cacheRead: 0.1, output: 10, perImage: 2 * IMAGE_TOKENS },
    { cache: 'explicit', vision: true, student: true, temperature: false, reasoning: 'none' },
  ),
  // A cheap open-weight fallback for course material when both workhorses are down.
  openrouter(
    'deepseek-v4.1-flash',
    'deepseek/deepseek-v4.1-flash',
    ['fireworks', 'deepinfra'],
    { input: 0.15, cacheWrite: 0, cacheRead: 0.03, output: 0.6 },
    { cache: 'implicit', reasoning: 'none' },
  ),
  // Multilingual embeddings on Bedrock, so a student's own question can be embedded too.
  openrouter(
    'titan-embed-v2',
    'amazon/titan-embed-text-v2',
    ['amazon-bedrock'],
    { input: 0.02, cacheWrite: 0, cacheRead: 0, output: 0 },
    { kind: 'embed', student: true, context: 8_000, dimensions: 1024 },
  ),
];

/**
 * Routes for each skill, most preferred first. A failed check moves to the next one. GPT-6 Luna
 * writes questions and Claude Haiku solves them, so the check is by a different model family.
 * Claude Sonnet is the last resort where one call decides a lot.
 */
export const PREFERENCE: Record<Skill, string[]> = {
  chat: ['claude-haiku-5.5', 'claude-sonnet-5.5'],
  extract: ['claude-haiku-5.5', 'gpt-6-luna', 'deepseek-v4.1-flash', 'claude-sonnet-5.5'],
  write: ['gpt-6-luna', 'claude-haiku-5.5', 'deepseek-v4.1-flash'],
  check: ['claude-haiku-5.5', 'gpt-6-luna', 'claude-sonnet-5.5'],
  vision: ['claude-haiku-5.5', 'gpt-6-luna'],
  embed: ['titan-embed-v2'],
};

export const route = (id: string) => ROUTES.find(r => r.id === id);

/** Micro-dollars for a call, from list prices. Used to reserve, and to settle when no cost is reported. */
export function cost(r: Route, usage: Usage, tier: ServiceTier) {
  const f = tier === 'flex' && r.flex ? 0.5 : 1;
  return Math.ceil(
    f *
      (usage.input * r.price.input +
        usage.cacheWrite * r.price.cacheWrite +
        usage.cacheRead * r.price.cacheRead +
        (usage.output + usage.reasoning) * r.price.output) +
      usage.images * (r.price.perImage ?? 0),
  );
}

/**
 * An upper bound on input tokens before the call. Latin text runs about four characters a token,
 * Arabic script about two. Dividing by the smaller figure keeps the reservation an overestimate.
 */
export function estimateTokens(text: string, language: Language) {
  return Math.ceil(text.length / (language === 'en' ? 3 : 1.5)) + 50;
}

/**
 * The reservation: every input token at the dearer of the input and cache-write prices, since a
 * cached prefix is written at a premium, plus the task's own output cap.
 */
export function reservation(r: Route, inputTokens: number, outputCap: number, tier: ServiceTier, images = 0) {
  const writes = r.price.cacheWrite > r.price.input;
  return cost(
    r,
    {
      input: writes ? 0 : inputTokens,
      cacheWrite: writes ? inputTokens : 0,
      cacheRead: 0,
      output: outputCap,
      reasoning: 0,
      audioSeconds: 0,
      images,
    },
    tier,
  );
}
