/**
 * Evidence summary.
 *
 * Shows descriptive states and the attempts behind them - never a mastery
 * percentage (PRODUCT.md: "Do not turn a model's confidence into a precise
 * mastery percentage"). Each attempt is labelled independent or assisted so the
 * learner can see exactly what the state is based on.
 */
import type { EvidenceSummary } from '../shared/types.js';
import { messages } from './messages.js';

export function EvidencePanel(props: {
  evidence: EvidenceSummary;
  busy: boolean;
  onRestart: () => void;
}) {
  const { evidence, busy, onRestart } = props;

  return (
    <section className="card evidence" aria-labelledby="evidence-heading">
      <h2 id="evidence-heading">{messages.evidence.heading}</h2>

      <p className="concept">{evidence.conceptName}</p>
      <p className={`state state-${evidence.state}`}>
        {messages.evidence.state[evidence.state]}
      </p>

      <h3>{messages.evidence.attemptsHeading}</h3>
      {evidence.attempts.length === 0 ? (
        <p className="muted">{messages.evidence.noAttempts}</p>
      ) : (
        <ol className="attempts">
          {evidence.attempts.map((attempt) => (
            <li key={`${attempt.questionId}-${attempt.at}`}>
              <span className="attempt-stage">
                {messages.stage[attempt.stage]}
              </span>
              <span className={attempt.correct ? 'ok' : 'no'}>
                {attempt.correct
                  ? messages.feedback.correct
                  : messages.feedback.incorrect}
              </span>
              <span className="badge">
                {attempt.countsAsIndependent
                  ? messages.evidence.independentBadge
                  : messages.evidence.assistedBadge}
              </span>
            </li>
          ))}
        </ol>
      )}

      {evidence.nextReviewDue && (
        <p className="review-due">
          {messages.evidence.nextReview}: <time>{evidence.nextReviewDue}</time>
        </p>
      )}

      <button type="button" onClick={onRestart} disabled={busy} className="ghost">
        {messages.actions.restart}
      </button>
    </section>
  );
}
