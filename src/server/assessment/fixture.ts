import type { Support, Task } from '../../shared/content.ts';
import { ANSWER_BEARING_SUPPORT } from '../../shared/content.ts';
import type { Assessment } from './schema.ts';
import type { AskModelOutput } from './schema.ts';

/**
 * Deterministic assessment, so CI never spends money and local development
 * never needs a credential.
 *
 * ── Why this is not a stub ────────────────────────────────────────────────
 *
 * A stub that always says "supported" would make every test pass and prove
 * nothing. This decides from the response itself, using the same two example
 * sets the live assessor is given — `acceptable_examples` and
 * `contradiction_examples` — so a fixture run exercises the *same* three
 * outcomes the real one does: supported, contradicted, unclear.
 *
 * It is also honest about what it is. It quotes **the learner's actual words**,
 * so `validateAssessment` runs over fixture output exactly as it runs over live
 * output. A fixture path that bypassed the validator would leave the one rule
 * that matters most untested in the mode that is tested most.
 *
 * ── The matching rule ─────────────────────────────────────────────────────
 *
 * Case-insensitive substring, over the examples authored on each claim.
 * Deliberately crude: this is a *deterministic oracle*, not a model, and
 * anything cleverer would start having opinions of its own — at which point
 * fixture and live stop testing the same pipeline.
 */

function normalise(value: string): string {
  return value.toLocaleLowerCase('en').replace(/\s+/g, ' ').trim();
}

/** The longest authored example present in the response, if any. */
function matchExample(response: string, examples: readonly string[]): string | null {
  const haystack = normalise(response);
  const hits = examples
    .filter((example) => haystack.includes(normalise(example)))
    .sort((a, b) => b.length - a.length);
  return hits[0] ?? null;
}

/**
 * Quote the learner's own words for an example that matched.
 *
 * The validator requires a literal substring of the response, so this finds the
 * matched span *in the response* rather than returning the authored example —
 * which would differ in case and fail the very check it exists to feed.
 */
function quoteFromResponse(response: string, example: string): string | null {
  const index = normalise(response).indexOf(normalise(example));
  if (index < 0) return null;
  // The normalised index is close enough to the raw one for the whitespace-
  // collapsed comparison the validator does; take a generous window and trim.
  return response.slice(index, index + example.length + 8).trim() || null;
}

export function assessWithFixture(input: {
  task: Task;
  response: string;
  claims: readonly {
    id: string;
    acceptable_examples: readonly string[];
    contradiction_examples: readonly string[];
  }[];
  supportsInForce: readonly Support[];
}): Assessment {
  const { task, response, claims } = input;

  const observations = task.required_claim_ids.map((claimId) => {
    const claim = claims.find((candidate) => candidate.id === claimId);
    if (!claim) {
      return { claim_id: claimId, status: 'not_observed' as const, evidence_quote: null };
    }

    const contradiction = matchExample(response, claim.contradiction_examples);
    if (contradiction) {
      return {
        claim_id: claimId,
        status: 'contradicted' as const,
        evidence_quote: quoteFromResponse(response, contradiction),
      };
    }

    const acceptable = matchExample(response, claim.acceptable_examples);
    if (acceptable) {
      return {
        claim_id: claimId,
        status: 'supported' as const,
        evidence_quote: quoteFromResponse(response, acceptable),
      };
    }

    // Nothing matched. A very short response is more likely uninterpretable
    // than wrong, and the distinction is the one the router turns on.
    return {
      claim_id: claimId,
      status: response.trim().length < 12 ? ('unclear' as const) : ('not_observed' as const),
      evidence_quote: null,
    };
  });

  const anyUnclear = observations.some((item) => item.status === 'unclear');
  const allSupported = observations.every((item) => item.status === 'supported');

  // A choice item has an authored answer, so correctness is not a judgement
  // call at all — compare and be done. Text items fall back to the claims.
  const correct =
    task.response_mode === 'choice'
      ? task.correct_option_id !== null && response.trim() === task.correct_option_id
      : allSupported;

  return {
    interpretation_status: anyUnclear ? 'ambiguous' : 'clear',
    claims: observations,
    ambiguities: anyUnclear
      ? ['The response is too short to tell which idea is being described.']
      : [],
    suggested_clarification_id: anyUnclear ? (task.clarification_task_ids[0] ?? null) : null,
    answered_correctly: correct,
  };
}

/** Whether fixture output would count as independent, before the validator. */
export function fixtureWouldBeIndependent(
  assessment: Assessment,
  supportsInForce: readonly Support[],
): boolean {
  return (
    assessment.answered_correctly &&
    !supportsInForce.some((support) => ANSWER_BEARING_SUPPORT.includes(support.type))
  );
}

/**
 * Grounded answering, deterministically.
 *
 * Returns the best-matching retrieved chunk as the answer with itself as the
 * citation, and — importantly — **returns `grounded: false` when nothing
 * matched**, so the "the sources do not cover this" path is exercised in
 * fixture mode rather than discovered in production.
 */
export function askWithFixture(input: {
  question: string;
  chunks: readonly { id: string; text: string }[];
}): AskModelOutput {
  const terms = normalise(input.question)
    .split(' ')
    .filter((term) => term.length > 3);

  const scored = input.chunks
    .map((chunk) => ({
      chunk,
      score: terms.filter((term) => normalise(chunk.text).includes(term)).length,
    }))
    .sort((a, b) => b.score - a.score);

  const best = scored[0];
  if (!best || best.score === 0) {
    return { answer: '', citations: [], grounded: false };
  }

  const sentence = best.chunk.text.split(/(?<=[.!?])\s+/)[0] ?? best.chunk.text;
  const quote = sentence.slice(0, 240).trim();
  return {
    answer: quote,
    citations: [{ chunk_id: best.chunk.id, quote }],
    grounded: true,
  };
}
