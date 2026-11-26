/**
 * Types shared by the engine, the schema and the features that call tasks.
 * Nothing here names a model: features ask for a task, and the router picks.
 */

export type Vendor = 'bedrock' | 'vertex';
/** ISO 639-1. Tasks, prompts and stored content carry it, so Arabic needs no new seams. */
export type Language = 'en' | 'ar' | (string & {});
/**
 * What a task needs a model to be good at. Routes list the skills they serve in preference
 * order, so a model swap is an edit to that data and never to a task.
 */
export type Skill = 'chat' | 'extract' | 'write' | 'check' | 'vision' | 'embed';
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
export const noUsage = (): Usage => ({
  input: 0,
  cacheWrite: 0,
  cacheRead: 0,
  output: 0,
  reasoning: 0,
  audioSeconds: 0,
  images: 0,
});

/** Spend limits in micro-dollars, null for none, and calls running at once. */
export interface Limits {
  dailyMicros: number | null;
  monthlyMicros: number | null;
  concurrent: number;
}

/** `student`: tutor turns and anything a student wrote. `institution`: course material only. */
export type DataClass = 'student' | 'institution';

export type CallState = 'reserved' | 'settled' | 'ambiguous' | 'released';
export type Validation = 'passed' | 'failed' | 'skipped';
