import type { Language, ServiceTier, Skill, Usage, Vendor } from './types';

/**
 * Every model route Rawi can call, with its price and what it supports. Prices are dollars per
 * million units, which is micro-dollars per unit. Which route serves a skill is the order in
 * `PREFERENCE`. The router skips routes that are unconfigured for the funding source, unhealthy,
 * too small for the request or outside the source's data rules.
 *
 * Prices were checked on 10 October 2026 against the AWS Price List API and the Cloud Billing
 * catalog. Anthropic and OpenAI models on Bedrock refuse calls from the development account, so
 * none is listed. Adding one is a row here and a place in `PREFERENCE`.
 */
export interface Route {
  id: string;
  vendor: Vendor;
  /** The vendor's model id or inference profile. */
  model: string;
  region: string;
  price: { input: number; cacheWrite: number; cacheRead: number; output: number; perImage?: number; perChar?: number };
  /** Input tokens the route accepts. */
  context: number;
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
  ({ id, vendor: 'bedrock', model, region: 'us-east-1', price, context: 128_000, flex: false, cache: 'none', structured: 'tool', vision: false, retention: 'none', kind: 'text', ...extra });
const vertex = (id: string, model: string, price: Route['price'], extra: Partial<Route> = {}): Route =>
  ({ id, vendor: 'vertex', model, region: 'global', price, context: 1_000_000, flex: false, cache: 'implicit', structured: 'schema', vision: true, retention: 'standard', reasoning: 'gemini-off', kind: 'text', ...extra });

export const ROUTES: Route[] = [
  bedrock('qwen3-32b', 'qwen.qwen3-32b-v1:0', { input: 0.15, cacheWrite: 0, cacheRead: 0, output: 0.6 }, { flex: true, context: 32_000 }),
  bedrock('gpt-oss-20b', 'openai.gpt-oss-20b-1:0', { input: 0.07, cacheWrite: 0, cacheRead: 0, output: 0.3 }, { flex: true, reasoning: 'gpt-oss-low' }),
  bedrock('gpt-oss-120b', 'openai.gpt-oss-120b-1:0', { input: 0.15, cacheWrite: 0, cacheRead: 0, output: 0.6 }, { flex: true, reasoning: 'gpt-oss-low' }),
  bedrock('mistral-large-3', 'mistral.mistral-large-3-675b-instruct', { input: 0.5, cacheWrite: 0, cacheRead: 0, output: 1.5 }),
  bedrock('nova-lite', 'us.amazon.nova-lite-v1:0', { input: 0.06, cacheWrite: 0, cacheRead: 0.015, output: 0.24 }, { cache: 'explicit', vision: true, context: 300_000 }),
  bedrock('nova-micro', 'us.amazon.nova-micro-v1:0', { input: 0.035, cacheWrite: 0, cacheRead: 0.00875, output: 0.14 }, { cache: 'explicit' }),
  // Candidates for chat, priced on 15 November 2026 from the AWS Price List API. A route serves
  // nothing until it has a place in `PREFERENCE`. `dev/measure.ts --chat ID` tries one.
  bedrock('nova-2-lite', 'us.amazon.nova-2-lite-v1:0', { input: 0.33, cacheWrite: 0, cacheRead: 0.0825, output: 2.75 }, { cache: 'explicit', vision: true, context: 300_000 }),
  bedrock('nova-pro', 'us.amazon.nova-pro-v1:0', { input: 0.8, cacheWrite: 0, cacheRead: 0.2, output: 3.2 }, { cache: 'explicit', vision: true, context: 300_000, flex: true }),
  bedrock('qwen3-next-80b', 'qwen.qwen3-next-80b-a3b', { input: 0.14, cacheWrite: 0, cacheRead: 0, output: 1.2 }),
  bedrock('minimax-m2.5', 'minimax.minimax-m2.5', { input: 0.3, cacheWrite: 0, cacheRead: 0, output: 1.2 }, { flex: true }),
  bedrock('deepseek-v3.2', 'deepseek.v3.2', { input: 0.62, cacheWrite: 0, cacheRead: 0, output: 1.85 }, { flex: true }),
  bedrock('glm-5', 'zai.glm-5', { input: 1.0, cacheWrite: 0, cacheRead: 0, output: 3.2 }, { flex: true }),
  vertex('gemini-2.5-flash-lite', 'gemini-2.5-flash-lite', { input: 0.1, cacheWrite: 0, cacheRead: 0.01, output: 0.4 }),
  vertex('gemini-3.1-flash-lite', 'gemini-3.1-flash-lite', { input: 0.25, cacheWrite: 0, cacheRead: 0.025, output: 1.5 }),
  // Priced per character. Batches many texts per call, which keeps ingest within subrequest limits.
  vertex('text-multilingual-embedding-002', 'text-multilingual-embedding-002', { input: 0, cacheWrite: 0, cacheRead: 0, output: 0, perChar: 0.025 }, { region: 'us-central1', kind: 'embed', cache: 'none', vision: false, reasoning: undefined, context: 2_000 }),
];

/**
 * Routes for each skill, most preferred first. A failed check moves to the next one. These are
 * the cheapest routes that passed the reviewed cases on 11 October 2026: Nova Lite and Qwen3 32B
 * cite and keep the reply format, gpt-oss-20b reads structure, Gemini 3.1 Flash-Lite writes
 * well-formed questions, and Mistral Large 3 solves them from the source most reliably.
 */
export const PREFERENCE: Record<Skill, string[]> = {
  chat: ['nova-lite', 'qwen3-32b', 'gpt-oss-120b'],
  extract: ['gpt-oss-20b', 'qwen3-32b', 'gemini-2.5-flash-lite', 'gpt-oss-120b'],
  write: ['gemini-3.1-flash-lite', 'qwen3-32b'],
  check: ['mistral-large-3', 'gemini-3.1-flash-lite', 'gpt-oss-120b'],
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
