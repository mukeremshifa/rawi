/**
 * A numeric question written once by a model and computed by code. Each draw picks fresh values
 * for the parameters within their ranges and works out the answer from the expression.
 */
export interface NumericTemplate {
  /** The question, with each parameter written as {name}. */
  stem: string;
  params: { name: string; min: number; max: number; step: number }[];
  /** How the answer follows from the parameters, such as `rate * hours`. */
  expression: string;
  unit?: string;
  /** Decimal places the answer is given to. */
  decimals: number;
  explanation: string;
}

/** How an item was checked before it was saved. Items that fail are never saved. */
export interface ItemVerification {
  /** Rule checks that ran, all passed. */
  rules: string[];
  /** The second reader that solved it from the source before seeing the key, when one did. */
  solver?: { route: string; agreed: boolean; reason: string };
  /** For a written multiple-choice item, the kind of thing its answer is, so later stems can borrow it as a wrong answer. */
  answerType?: string;
}
