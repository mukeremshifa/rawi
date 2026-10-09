/**
 * Types shared by the engine, the schema and the features that call tasks.
 * Nothing here names a model: features ask for a task, and the router picks.
 */

export type Vendor = 'bedrock' | 'vertex';
/** ISO 639-1. Tasks, prompts and stored content carry it, so Arabic needs no new seams. */
export type Language = 'en' | 'ar' | (string & {});
/** Text tasks are built now. Voice and charts reuse the same registry, meter and trace later. */
export type TaskKind = 'generate' | 'embed' | 'transcribe' | 'speak';
/** Route lists by job. Each is data in `TIERS`, ordered by preference. */
export type Tier = 'small' | 'chat' | 'writer' | 'strong' | 'vision' | 'embed';
/** Flex is the vendor's discounted, lower-priority synchronous lane for background work. */
export type ServiceTier = 'standard' | 'flex';

/** Usage by billing class. Audio seconds and images are carried for voice and figures. */
export interface Usage {
  input: number;
  cacheWrite: number;
  cacheRead: number;
  output: number;
  /** Thinking or reasoning tokens. Billed as output, recorded apart so they can be watched. */
  reasoning: number;
  audioSeconds: number;
  images: number;
}
export const noUsage = (): Usage => ({ input: 0, cacheWrite: 0, cacheRead: 0, output: 0, reasoning: 0, audioSeconds: 0, images: 0 });

/** Plan or organisation policy, stored as data in `ai_plans`. Money is in micro-dollars. */
export interface AiPolicy {
  dailyMicros: number;
  monthlyMicros: number;
  concurrent: number;
  vendors: Vendor[];
  /** `none` admits only routes whose vendor terms keep no prompts. */
  retention: 'none' | 'standard';
}

export type CallState = 'reserved' | 'settled' | 'ambiguous' | 'released';
export type Validation = 'passed' | 'failed' | 'skipped';
