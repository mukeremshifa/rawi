/**
 * Evidence summary.
 *
 * Shows descriptive states and the attempts behind them - never a mastery
 * percentage (PRODUCT.md: "Do not turn a model's confidence into a precise
 * mastery percentage"). Each attempt is labelled independent or assisted so the
 * learner can see exactly what the state is based on.
 *
 * R02B: correctness and help-used are now rendered as two independent facts per
 * attempt. A wrong unaided attempt gets its own badge (neither "independent"
 * nor "assisted") so it is never confused with an assisted attempt.
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
          {evidence.attempts.map((attempt) => {
            /**
             * R02B badge logic — three distinct states:
             *  - independent: correct AND no help used (countsAsIndependent true)
             *  - assisted: help was used (regardless of correctness)
             *  - wrong, no help: wrong AND no help used
             *
             * The old code used only countsAsIndependent, which mapped both
             * "wrong unaided" and "assisted correct" to the same "assisted" badge,
             * making the history unreadable for learners trying to understand why
             * their evidence state has not advanced.
             */
            let badge: string;
            let badgeClass: string;
            if (attempt.countsAsIndependent) {
              badge = messages.evidence.independentBadge;
              badgeClass = 'badge badge-independent';
            } else if (attempt.assistance !== 'none') {
              badge = messages.evidence.assistedBadge;
              badgeClass = 'badge badge-assisted';
            } else {
              badge = messages.evidence.wrongUnaidedBadge;
              badgeClass = 'badge badge-wrong-unaided';
            }

            return (
              <li key={`${attempt.questionId}-${attempt.at}`}>
                <span className="attempt-stage">
                  {messages.stage[attempt.stage]}
                </span>
                <span className={attempt.correct ? 'ok' : 'no'}>
                  {attempt.correct
                    ? messages.feedback.correct
                    : messages.feedback.incorrect}
                </span>
                <span className={badgeClass}>{badge}</span>
              </li>
            );
          })}
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
