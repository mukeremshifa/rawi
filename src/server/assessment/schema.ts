import { z } from 'zod';

/**
 * What an assessment is allowed to say.
 *
 * Taken almost verbatim from Concept Bridge's `lib/server/assessment/schema.ts`
 * and generalised from science-claims to concept-claims. Two properties of the
 * donor shape are the reason it survived intact:
 *
 * **`.strict()` everywhere.** An assessor that can add fields is an assessor
 * that can smuggle a score, a diagnosis, or a new identifier into a payload
 * something downstream will eventually read. Unknown keys are a parse failure.
 *
 * **`evidence_quote` is nullable but never optional.** A model that may omit a
 * field will omit it exactly when it has nothing to quote and wants to claim
 * something anyway. Requiring the key forces an explicit `null`, which
 * `validateAssessment` can then hold to the rule.
 *
 * Notice what the shape cannot express: a number, a confidence, a grade, a
 * percentage, or a recommendation about what the learner "knows". That is not
 * an omission — the model is being asked what it *observed*, and everything
 * else in this system is derived from the log rather than from an opinion.
 */

export const claimObservationSchema = z
  .object({
    claim_id: z.string(),
    status: z.enum(['supported', 'contradicted', 'not_observed', 'unclear']),
    evidence_quote: z.string().min(1).nullable(),
  })
  .strict();
export type ClaimObservation = z.infer<typeof claimObservationSchema>;

export const assessmentSchema = z
  .object({
    interpretation_status: z.enum(['clear', 'ambiguous', 'uninterpretable']),
    claims: z.array(claimObservationSchema),
    /** At most four, each short. A long list is a model padding. */
    ambiguities: z.array(z.string().max(300)).max(4),
    suggested_clarification_id: z.string().nullable(),
    /**
     * Whether the response answers the item correctly. The one judgement the
     * model is trusted with — and even this is only trusted after
     * `validateAssessment` has held every quote to the learner's own text.
     */
    answered_correctly: z.boolean(),
  })
  .strict();
export type Assessment = z.infer<typeof assessmentSchema>;

/**
 * The same shape in the **OpenAPI 3.0 subset Vertex's REST surface accepts**,
 * which is not the JSON Schema the `@google/genai` SDK took.
 *
 * Three differences, and getting any of them wrong is a 400 at request time:
 *   - type names are **uppercase** (`OBJECT`, `ARRAY`, `STRING`, `BOOLEAN`)
 *   - nullability is `nullable: true`, not `anyOf: [..., {type: 'null'}]`
 *   - `additionalProperties` is not accepted at all
 *
 * This steers the model. **Zod above is what actually enforces the shape** —
 * a response schema is a hint, and invariant 11 does not accept hints.
 */
export const assessmentResponseSchema = {
  type: 'OBJECT',
  required: [
    'interpretation_status',
    'claims',
    'ambiguities',
    'suggested_clarification_id',
    'answered_correctly',
  ],
  properties: {
    interpretation_status: {
      type: 'STRING',
      enum: ['clear', 'ambiguous', 'uninterpretable'],
    },
    claims: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        required: ['claim_id', 'status', 'evidence_quote'],
        properties: {
          claim_id: { type: 'STRING' },
          status: {
            type: 'STRING',
            enum: ['supported', 'contradicted', 'not_observed', 'unclear'],
          },
          evidence_quote: { type: 'STRING', nullable: true },
        },
      },
    },
    ambiguities: { type: 'ARRAY', items: { type: 'STRING' } },
    suggested_clarification_id: { type: 'STRING', nullable: true },
    answered_correctly: { type: 'BOOLEAN' },
  },
} as const;

/** The shape of a grounded answer, in the same dialect. */
export const askResponseSchema = {
  type: 'OBJECT',
  required: ['answer', 'citations', 'grounded'],
  properties: {
    answer: { type: 'STRING' },
    citations: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        required: ['chunk_id', 'quote'],
        properties: {
          chunk_id: { type: 'STRING' },
          quote: { type: 'STRING' },
        },
      },
    },
    /** False when the sources do not answer the question. Not a refusal to try. */
    grounded: { type: 'BOOLEAN' },
  },
} as const;

export const askModelOutputSchema = z
  .object({
    answer: z.string(),
    citations: z.array(
      z.object({ chunk_id: z.string(), quote: z.string().min(1) }).strict(),
    ),
    grounded: z.boolean(),
  })
  .strict();
export type AskModelOutput = z.infer<typeof askModelOutputSchema>;
