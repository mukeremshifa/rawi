import type { ConceptContent, Task } from '../../src/shared/content.ts';
import { createSession, type SessionState } from '../../src/server/learning/rules.ts';

/**
 * Minimal fixtures for the invariant tests.
 *
 * Deliberately small: an invariant you can only demonstrate with a realistic
 * document is an invariant nobody will re-check after changing it. Each of
 * these is the least content the rule needs to be true or false.
 */

export function task(id: string, overrides: Partial<Task> = {}): Task {
  return {
    id,
    version: 1,
    family_id: `fam-${id}`,
    purpose: 'probe' as Task['purpose'],
    prompt: `Prompt for ${id}`,
    response_mode: 'text',
    options: null,
    correct_option_id: null,
    answer_explanation: `Answer for ${id}`,
    hints: [],
    required_claim_ids: ['CLAIM'],
    clarification_task_ids: [],
    support_ids: [],
    ...overrides,
  } as Task;
}

export function sessionWith(first: Task): SessionState {
  return createSession({
    sessionId: 's1',
    workspaceId: 'w1',
    conceptId: 'c1',
    firstItem: first,
    previouslyExposedItemIds: [],
    now: new Date('2026-09-15T09:00:00.000Z'),
  });
}

export function content(tasks: Task[]): ConceptContent {
  return {
    schema_version: 1,
    concept_id: 'c1',
    name: 'A concept',
    summary: 'A summary.',
    teaching_explanation: 'The explanation.',
    teaching_chunk_ids: ['chunk-1'],
    claims: [
      {
        id: 'CLAIM',
        meaning: 'The claim.',
        acceptable_examples: ['yes it does'],
        contradiction_examples: ['no it does not'],
        source_chunk_ids: ['chunk-1'],
      },
    ],
    supports: [],
    tasks,
  } as ConceptContent;
}
