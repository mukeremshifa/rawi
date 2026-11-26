import { z } from 'zod';
import type { Task } from '../../ai/engine';
import { DATA_RULE, escapeTags, house, parsed, schemaOf } from '../../ai/style';

export const AGENT_PROMPT_VERSION = 'agent-v1';

export interface SummaryInput {
  courses: string[];
  actions: { tool: string; reason: string; outcome: string }[];
}
const summarySchema = z.object({
  summary: z.string().describe('Two or three plain sentences to the student on what Rawi did and why'),
});

/** Numbers in a text, so a summary can be held to the numbers it was given. */
const numbers = (text: string) => text.match(/\d+(?:[.,]\d+)?/g) ?? [];

/**
 * The run's note to the student, written from the actions code already took. It adds no facts: a
 * note that states a number the actions do not, or uses a dash or semicolon, is refused and the
 * code's own note stands.
 */
export const summaryTask: Task<SummaryInput, string> = {
  name: 'agent.summary',
  promptVersion: AGENT_PROMPT_VERSION,
  temperature: 0.2,
  needs: { skill: 'chat', data: 'student', lane: 'background', maxOutput: 300, cache: 'none', attempts: 1 },
  language: () => 'en',
  build: i => ({
    system: [
      'You are Rawi, a study agent. You already took the actions listed below for a university student.',
      'Write two or three short sentences to the student, in the second person, on what you did and why. Lead with what matters most for their next study session.',
      'Use only what the actions say. Do not add advice, numbers, dates or facts that are not in them. Do not praise or scold.',
      DATA_RULE,
      house('en'),
    ].join('\n'),
    prompt: `Courses: ${i.courses.map(escapeTags).join(', ')}\n<document>\n${i.actions.map(a => `- ${escapeTags(a.tool)}: ${escapeTags(a.reason)} Result: ${escapeTags(a.outcome)}`).join('\n')}\n</document>`,
    schema: schemaOf(summarySchema),
  }),
  check: (r, i) => {
    const text = parsed(summarySchema, r.json)?.summary.trim();
    if (!text || text.length > 600 || /[—–;]/.test(text)) return null;
    const given = new Set(i.actions.flatMap(a => [...numbers(a.reason), ...numbers(a.outcome)]));
    return numbers(text).every(n => given.has(n)) ? text : null;
  },
};
