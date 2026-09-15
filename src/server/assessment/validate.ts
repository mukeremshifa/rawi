import type { Support, Task } from '../../shared/content.ts';
import { ANSWER_BEARING_SUPPORT } from '../../shared/content.ts';
import { assessmentSchema, askModelOutputSchema, type Assessment } from './schema.ts';

/**
 * **The grounding validator.** Invariant 11 lives here.
 *
 * Carried from Concept Bridge, where it is the crown jewel of the repo, and
 * kept whole because each of its three jobs prevents a different lie:
 *
 * **1. Exact ID sets.** The observations must name exactly the claims the task
 * requires — no extras, no omissions, no duplicates. A model that can drop a
 * claim can quietly decline to assess the one it is unsure about; a model that
 * can add one can invent something to be right about.
 *
 * **2. No quote the learner did not write.** Every `evidence_quote` must be a
 * *literal substring of the learner's own response*. This is the single check
 * that stops a fluent model from paraphrasing the learner into having said
 * something they did not, which is the most plausible-looking failure an
 * assessor has and the hardest to catch by reading output.
 *
 * **3. Automatic downgrade under answer-bearing support.** If a sentence frame
 * or a worked example was in force, the response is not independent evidence,
 * whatever the model thinks. Invariant 2 is enforced here as well as in
 * `rules.ts`, on purpose: the model's opinion about independence never reaches
 * the log.
 *
 * ── An invented quote is a rejected assessment, not a logged warning ──────
 *
 * Every failure below throws. The caller turns that into `assessment_rejected`
 * and the response is saved with **no evidence recorded at all**. Downgrading
 * to "we'll take the parts that checked out" is how a validator becomes
 * decorative — the whole point is that a model which lied once is not a model
 * whose other claims should be believed in the same breath.
 */

export class AssessmentRejected extends Error {
  constructor(
    readonly reason:
      | 'INVALID_SHAPE'
      | 'INVALID_CLAIM_IDS'
      | 'MISSING_EVIDENCE_QUOTE'
      | 'INVENTED_EVIDENCE_QUOTE'
      | 'INVALID_CLARIFICATION_ID',
    message: string,
  ) {
    super(message);
    this.name = 'AssessmentRejected';
  }
}

function exactIds(actual: string[], expected: readonly string[]): boolean {
  if (new Set(actual).size !== actual.length) return false;
  if (actual.length !== expected.length) return false;
  return actual.every((id) => expected.includes(id));
}

/**
 * Normalise whitespace before the substring test.
 *
 * **This is a deliberate loosening and it is the only one.** A model given
 * `"water   evaporates"` across a line break will return it with the break
 * collapsed, and rejecting that would reject honest quotes for a formatting
 * difference — which trains whoever maintains this to relax the rule properly
 * later. Collapsing runs of whitespace on both sides keeps the property that
 * matters (the *words* are the learner's, in that order) while removing the
 * one false positive it otherwise has.
 */
function normalise(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

export function validateAssessment(
  value: unknown,
  task: Task,
  /** The learner's response, exactly as submitted. */
  originalResponse: string,
  /** The supports that were actually in force on this item. */
  supportsInForce: readonly Support[],
): { assessment: Assessment; countsAsIndependent: boolean } {
  const parsed = assessmentSchema.safeParse(value);
  if (!parsed.success) {
    throw new AssessmentRejected(
      'INVALID_SHAPE',
      `assessment did not match the schema: ${parsed.error.issues[0]?.message ?? 'unknown'}`,
    );
  }
  const assessment = parsed.data;

  if (!exactIds(assessment.claims.map((claim) => claim.claim_id), task.required_claim_ids)) {
    throw new AssessmentRejected(
      'INVALID_CLAIM_IDS',
      'the assessment did not observe exactly the claims this item requires',
    );
  }

  const haystack = normalise(originalResponse);

  for (const claim of assessment.claims) {
    const requiresQuote = claim.status === 'supported' || claim.status === 'contradicted';

    if (requiresQuote && !claim.evidence_quote) {
      throw new AssessmentRejected(
        'MISSING_EVIDENCE_QUOTE',
        `claim ${claim.claim_id} was called ${claim.status} with nothing quoted to support it`,
      );
    }

    // Checked for *every* quote, not only required ones: a quote attached to a
    // `not_observed` claim is still an assertion about what the learner wrote.
    if (claim.evidence_quote && !haystack.includes(normalise(claim.evidence_quote))) {
      throw new AssessmentRejected(
        'INVENTED_EVIDENCE_QUOTE',
        `claim ${claim.claim_id} quoted text the learner did not write`,
      );
    }
  }

  if (
    assessment.suggested_clarification_id &&
    !task.clarification_task_ids.includes(assessment.suggested_clarification_id)
  ) {
    throw new AssessmentRejected(
      'INVALID_CLARIFICATION_ID',
      'the assessment suggested a clarification this item does not offer',
    );
  }

  // The downgrade. The model does not get a vote on this.
  const answerBearing = supportsInForce.some((support) =>
    ANSWER_BEARING_SUPPORT.includes(support.type),
  );
  const countsAsIndependent = assessment.answered_correctly && !answerBearing;

  return { assessment, countsAsIndependent };
}

/**
 * The same discipline for a grounded answer.
 *
 * A citation must quote a chunk the retrieval step actually returned, and the
 * quote must be a literal substring of that chunk. A model that can cite a
 * chunk id it was not given can attribute its own invention to the learner's
 * own course notes, which is the worst available failure in a product whose
 * one promise is that everything it says comes from your sources.
 */
export function validateAskOutput(
  value: unknown,
  allowedChunks: readonly { id: string; text: string }[],
): { answer: string; citations: { chunkId: string; quote: string }[]; grounded: boolean } {
  const parsed = askModelOutputSchema.safeParse(value);
  if (!parsed.success) {
    throw new AssessmentRejected('INVALID_SHAPE', 'the answer did not match the schema');
  }

  const byId = new Map(allowedChunks.map((chunk) => [chunk.id, normalise(chunk.text)]));
  const citations: { chunkId: string; quote: string }[] = [];

  for (const citation of parsed.data.citations) {
    const chunk = byId.get(citation.chunk_id);
    if (!chunk) {
      throw new AssessmentRejected(
        'INVENTED_EVIDENCE_QUOTE',
        'the answer cited a passage that was not retrieved',
      );
    }
    if (!chunk.includes(normalise(citation.quote))) {
      throw new AssessmentRejected(
        'INVENTED_EVIDENCE_QUOTE',
        'the answer quoted text that is not in the passage it cited',
      );
    }
    citations.push({ chunkId: citation.chunk_id, quote: citation.quote });
  }

  // Claiming groundedness with nothing cited is the failure this catches: the
  // model asserting "yes, the sources say so" and declining to point at where.
  if (parsed.data.grounded && citations.length === 0) {
    throw new AssessmentRejected(
      'MISSING_EVIDENCE_QUOTE',
      'the answer claimed to be grounded but cited nothing',
    );
  }

  return { answer: parsed.data.answer, citations, grounded: parsed.data.grounded };
}
