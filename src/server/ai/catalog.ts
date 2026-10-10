import type { Language, ServiceTier, Tier, Usage, Vendor } from './types';

/**
 * Every model route Rawi can call, with its price and what it supports. Prices are dollars per
 * million units, which is micro-dollars per unit. Changing which model serves a tier is an edit to
 * `TIERS`, and the router skips routes that are unconfigured, unhealthy or outside policy.
 *
 * Verified on 10 October 2026 against the AWS Price List API and the Cloud Billing catalog, and
 * by calling each route from the development machine. Anthropic and OpenAI models on Bedrock
 * refused calls from there as an unsupported country, so none is listed.
 */
export interface Route {
  id: string;
  vendor: Vendor;
  /** The vendor's model id or inference profile. */
  model: string;
  region: string;
  price: { input: number; cacheWrite: number; cacheRead: number; output: number; perImage?: number; perChar?: number };
  /** Flex costs half on both vendors where it exists. */
  flex: boolean;
  /** `explicit` needs a cache point, `implicit` reuses a stable prefix by itself. */
  cache: 'explicit' | 'implicit' | 'none';
  /** Bedrock open-weight and Nova take a forced tool, Gemini takes a JSON schema. */
  structured: 'tool' | 'schema';
  vision: boolean;
  /** Bedrock keeps no prompts. Vertex logs prompts for abuse monitoring unless an exception is granted. */
  retention: 'none' | 'standard';
  /** Request fields that keep reasoning short on models that think by default. */
  reasoning?: 'gpt-oss-low' | 'gemini-off';
  kind: 'text' | 'embed';
}

const bedrock = (id: string, model: string, price: Route['price'], extra: Partial<Route> = {}): Route =>
  ({ id, vendor: 'bedrock', model, region: 'us-east-1', price, flex: false, cache: 'none', structured: 'tool', vision: false, retention: 'none', kind: 'text', ...extra });
const vertex = (id: string, model: string, price: Route['price'], extra: Partial<Route> = {}): Route =>
  ({ id, vendor: 'vertex', model, region: 'global', price, flex: false, cache: 'implicit', structured: 'schema', vision: true, retention: 'standard', reasoning: 'gemini-off', kind: 'text', ...extra });

export const ROUTES: Route[] = [
  bedrock('qwen3-32b', 'qwen.qwen3-32b-v1:0', { input: 0.15, cacheWrite: 0, cacheRead: 0, output: 0.6 }, { flex: true }),
  bedrock('gpt-oss-20b', 'openai.gpt-oss-20b-1:0', { input: 0.07, cacheWrite: 0, cacheRead: 0, output: 0.3 }, { flex: true, reasoning: 'gpt-oss-low' }),
  bedrock('gpt-oss-120b', 'openai.gpt-oss-120b-1:0', { input: 0.15, cacheWrite: 0, cacheRead: 0, output: 0.6 }, { flex: true, reasoning: 'gpt-oss-low' }),
  // Priced from the AWS Price List API on 10 October 2026. Where the list shows two regional
  // figures the higher one is used, so the meter overestimates rather than under.
  bedrock('mistral-large-3', 'mistral.mistral-large-3-675b-instruct', { input: 0.5, cacheWrite: 0, cacheRead: 0, output: 1.5 }),
  bedrock('nova-lite', 'us.amazon.nova-lite-v1:0', { input: 0.06, cacheWrite: 0, cacheRead: 0.015, output: 0.24 }, { cache: 'explicit', vision: true }),
  bedrock('nova-micro', 'us.amazon.nova-micro-v1:0', { input: 0.035, cacheWrite: 0, cacheRead: 0.00875, output: 0.14 }, { cache: 'explicit' }),
  vertex('gemini-2.5-flash-lite', 'gemini-2.5-flash-lite', { input: 0.1, cacheWrite: 0, cacheRead: 0.01, output: 0.4 }),
  vertex('gemini-3.1-flash-lite', 'gemini-3.1-flash-lite', { input: 0.25, cacheWrite: 0, cacheRead: 0.025, output: 1.5 }),
  vertex('gemini-3.5-flash', 'gemini-3.5-flash', { input: 1.5, cacheWrite: 0, cacheRead: 0.15, output: 9 }),
  // Priced per character. Batches many texts per call, which keeps ingest within subrequest limits.
  vertex('text-multilingual-embedding-002', 'text-multilingual-embedding-002', { input: 0, cacheWrite: 0, cacheRead: 0, output: 0, perChar: 0.025 }, { region: 'us-central1', kind: 'embed', cache: 'none', vision: false, reasoning: undefined }),
];

/**
 * The ordered routes for each kind of work. The first available route serves, and a task's
 * escalation moves to its next tier. Chosen from `dev/compare.ts` runs on 10 October 2026:
 * - small: gpt-oss-20b passed digest, syllabus and grading fixtures at the lowest cost. It wrote
 *   a wrong fact in free chat, so it serves structured work only.
 * - chat: Qwen3 32B cited and kept the reply format every time, with first tokens under a second.
 * - writer: only Gemini 3.1 Flash-Lite wrote complete, rule-clean question sets.
 * - strong: Gemini 3.5 Flash matched Flash-Lite on every fixture at six times the cost and took
 *   up to 150 seconds, so it is left out. Mistral Large 3 passed syllabus, digest and grading
 *   6 of 6 at about a thousandth of a dollar a call and keeps no prompts, so it leads. It cannot
 *   write questions (0 of 6). Kimi K3 passed too, at 20 to 40 times the cost and about 5 seconds
 *   to a first token. DeepSeek V3.2, Nemotron Super 120B and Nova Pro wrote complete question
 *   sets at most 1 time in 6, so Gemini 3.1 Flash-Lite stays the only writer.
 * - tutor: no model keeps the reply format reliably (see the tutor trailer), so the choice
 *   between Qwen3 32B and the others is open until that is fixed.
 * Vertex returned quota errors (429) for Gemini 2.5 Flash-Lite under light load, so Bedrock leads
 * where quality allows.
 */
export const TIERS: Record<Tier, string[]> = {
  small: ['gpt-oss-20b', 'qwen3-32b', 'gemini-2.5-flash-lite'],
  chat: ['qwen3-32b', 'gemini-2.5-flash-lite', 'gpt-oss-120b'],
  writer: ['gemini-3.1-flash-lite', 'qwen3-32b'],
  strong: ['mistral-large-3', 'gemini-3.1-flash-lite', 'qwen3-32b', 'gpt-oss-120b'],
  vision: ['gemini-2.5-flash-lite', 'nova-lite'],
  embed: ['text-multilingual-embedding-002'],
};

export const route = (id: string) => ROUTES.find(r => r.id === id);

/** Micro-dollars for a settled call. Flex halves the token prices. */
export function cost(r: Route, usage: Usage, tier: ServiceTier, chars = 0) {
  const f = tier === 'flex' && r.flex ? 0.5 : 1;
  return Math.ceil(f * (usage.input * r.price.input + usage.cacheWrite * r.price.cacheWrite + usage.cacheRead * r.price.cacheRead + (usage.output + usage.reasoning) * r.price.output)
    + usage.images * (r.price.perImage ?? 0) + chars * (r.price.perChar ?? 0));
}

/**
 * An upper bound on input tokens before the call. Latin text runs about four characters a token,
 * Arabic script about two. Dividing by the smaller figure keeps the reservation an overestimate.
 */
export function estimateTokens(text: string, language: Language) {
  return Math.ceil(text.length / (language === 'en' ? 3 : 1.5)) + 50;
}

/** The reservation: every input token at full price plus the task's own output cap. */
export function reservation(r: Route, inputTokens: number, outputCap: number, tier: ServiceTier, images = 0, chars = 0) {
  return cost(r, { input: inputTokens, cacheWrite: 0, cacheRead: 0, output: outputCap, reasoning: 0, audioSeconds: 0, images }, tier, chars);
}
