import { z } from 'zod';

/** Ids are uppercase-underscore so they are visibly not prose. */
const IdSchema = z.string().regex(/^[A-Z][A-Z0-9_]*$/);

/**
 * One checkable proposition inside a concept.
 *
 * `acceptable_examples` and `contradiction_examples` are what an assessment is
 * measured against. Both are required and both must be non-empty: a claim with
 * no contradictions is a claim nothing can fail, which makes every answer look
 * supported.
 */
export const claimSchema = z
  .object({
    id: IdSchema,
    meaning: z.string().min(1),
    acceptable_examples: z.array(z.string().min(1)).min(1),
    contradiction_examples: z.array(z.string().min(1)).min(1),
    /** The chunks this claim was grounded in. Nothing is authored from nothing. */
    source_chunk_ids: z.array(z.string()).min(1),
  })
  .strict();
export type Claim = z.infer<typeof claimSchema>;

/**
 * A scaffold offered during teaching or practice.
 *
 * `sentence_frame` and `worked_example` are **answer-bearing**: they contain
 * enough of the answer that using one means the response cannot be independent
 * evidence. `validateAssessment` downgrades on exactly that basis, so the type
 * is not decoration — it is the input to a rule.
 */
export const supportSchema = z
  .object({
    id: z.string().min(1),
    type: z.enum(['vocabulary', 'relationship', 'sentence_frame', 'worked_example']),
    text: z.string().min(1),
  })
  .strict();
export type Support = z.infer<typeof supportSchema>;

/** Answer-bearing support types, named once so the rule has one home. */
export const ANSWER_BEARING_SUPPORT: readonly Support['type'][] = [
  'sentence_frame',
  'worked_example',
];

export const taskSchema = z
  .object({
    id: z.string().min(1),
    version: z.number().int().positive(),
    /** See the file header. The re-check depends on this. */
    family_id: z.string().min(1),
    purpose: z.enum([
      'entry',
      'probe',
      'clarification',
      'practice',
      'transfer',
      'review',
    ]),
    prompt: z.string().min(1),
    response_mode: z.enum(['text', 'choice']),
    options: z
      .array(z.object({ id: z.string().min(1), text: z.string().min(1) }))
      .nullable(),

    correct_option_id: z.string().nullable(),
    /** The prose shown after a reveal, or after the item is answered. */
    answer_explanation: z.string().min(1),
    hints: z.array(z.string().min(1)),
    required_claim_ids: z.array(z.string()).min(1),
    clarification_task_ids: z.array(z.string()),
    support_ids: z.array(z.string()),
  })
  .strict();
export type Task = z.infer<typeof taskSchema>;

export const conceptContentSchema = z
  .object({
    schema_version: z.literal(1),
    concept_id: z.string().min(1),
    name: z.string().min(1),
    summary: z.string().min(1),
    /** The prose the `teach` stage shows. Grounded, and it cites its chunks. */
    teaching_explanation: z.string().min(1),
    teaching_chunk_ids: z.array(z.string()).min(1),
    claims: z.array(claimSchema).min(1),
    supports: z.array(supportSchema),
    tasks: z.array(taskSchema).min(1),
  })
  .strict()
  .superRefine((content, ctx) => {
    const claimIds = new Set(content.claims.map((claim) => claim.id));
    const supportIds = new Set(content.supports.map((support) => support.id));
    const taskIds = new Set(content.tasks.map((task) => task.id));

    for (const task of content.tasks) {
      for (const id of task.required_claim_ids) {
        if (!claimIds.has(id)) {
          ctx.addIssue({
            code: 'custom',
            path: ['tasks'],
            message: `task ${task.id} requires unknown claim ${id}`,
          });
        }
      }
      for (const id of task.support_ids) {
        if (!supportIds.has(id)) {
          ctx.addIssue({
            code: 'custom',
            path: ['tasks'],
            message: `task ${task.id} names unknown support ${id}`,
          });
        }
      }
      for (const id of task.clarification_task_ids) {
        if (!taskIds.has(id)) {
          ctx.addIssue({
            code: 'custom',
            path: ['tasks'],
            message: `task ${task.id} names unknown clarification ${id}`,
          });
        }
      }
      if (task.response_mode === 'choice' && !task.options?.length) {
        ctx.addIssue({
          code: 'custom',
          path: ['tasks'],
          message: `choice task ${task.id} has no options`,
        });
      }
    }

    // A re-check has to be able to find a different family. One family across
    // every task means the sixth v1 feature is structurally impossible, and
    // that is worth failing at authoring time rather than discovering a week
    // later when the first review comes due.
    if (new Set(content.tasks.map((task) => task.family_id)).size < 2) {
      ctx.addIssue({
        code: 'custom',
        path: ['tasks'],
        message:
          'a concept needs at least two item families, or a delayed re-check can only repeat itself',
      });
    }
  });
export type ConceptContent = z.infer<typeof conceptContentSchema>;

/** Whether any of these supports would make a response non-independent. */
export function hasAnswerBearingSupport(supports: readonly Support[]): boolean {
  return supports.some((support) =>
    ANSWER_BEARING_SUPPORT.includes(support.type),
  );
}
