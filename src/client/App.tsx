/**
 * The learning workspace.
 *
 * Renders whatever the server says the session is. There is deliberately no
 * client-side grading, no local assistance flag and no optimistic progress:
 * every transition is a request, and the response replaces the view. That is
 * why a refresh or a second tab cannot un-do a revealed answer.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { SessionView, Stage } from '../shared/types.js';
import * as api from './api.js';
import { messages } from './messages.js';
import { EvidencePanel } from './EvidencePanel.js';

const SESSION_KEY = 'rawi.sessionId';

export function App() {
  const [session, setSession] = useState<SessionView | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [choice, setChoice] = useState<string>('');
  const [reasoning, setReasoning] = useState('');

  // Focus moves to the stage heading on every stage change so keyboard and
  // screen-reader users are not left at the top of the document.
  const stageHeadingRef = useRef<HTMLHeadingElement>(null);
  const previousStage = useRef<Stage | null>(null);

  const run = useCallback(
    async (action: () => Promise<SessionView>) => {
      setBusy(true);
      setError(null);
      try {
        setSession(await action());
      } catch (caught) {
        const err = caught as api.ApiError;
        if (err.status === 404) {
          window.localStorage.removeItem(SESSION_KEY);
          setSession(null);
          setError(messages.error.sessionLost);
        } else if (err.status === 409) {
          // The server refused a command that did not match the session as it
          // actually was - a stale tab, a double submit, or a request built
          // against a screen the learner has left. Nothing was written, so the
          // recovery is to show the authoritative state rather than the
          // learner's assumption of it.
          setError(messages.error.stale);
          const saved = window.localStorage.getItem(SESSION_KEY);
          if (saved) {
            try {
              setSession(await api.loadSession(saved));
            } catch {
              // Leave the existing view in place; the message already explains.
            }
          }
        } else {
          setError(err.code === 'network' ? messages.error.network : err.message);
        }
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  // Resume an existing session on load, so a refresh keeps the learner's place
  // and, more importantly, keeps their assistance record.
  useEffect(() => {
    const saved = window.localStorage.getItem(SESSION_KEY);
    if (saved) void run(() => api.loadSession(saved));
  }, [run]);

  useEffect(() => {
    if (session) window.localStorage.setItem(SESSION_KEY, session.sessionId);
  }, [session]);

  useEffect(() => {
    if (session && session.stage !== previousStage.current) {
      previousStage.current = session.stage;
      setChoice('');
      setReasoning('');
      stageHeadingRef.current?.focus();
    }
  }, [session]);

  const start = () => void run(() => api.startSession());

  const restart = () => {
    window.localStorage.removeItem(SESSION_KEY);
    setSession(null);
    setError(null);
    void run(() => api.startSession());
  };

  return (
    <div className="app">
      <header className="app-header">
        <h1>{messages.appName}</h1>
        <p className="tagline">{messages.tagline}</p>
        <p className="fixture-banner" role="note">
          {messages.fixtureBanner}
        </p>
      </header>

      {/* Status region: announced without stealing focus mid-task. */}
      <div className="live" role="status" aria-live="polite">
        {busy ? messages.loading : ''}
      </div>

      {error && (
        <div className="error" role="alert">
          <strong>{messages.error.heading}</strong>
          <p>{error}</p>
        </div>
      )}

      <main>
        {!session ? (
          <section className="card">
            <h2>{messages.start.heading}</h2>
            <p>{messages.start.body}</p>
            <button type="button" onClick={start} disabled={busy}>
              {messages.start.action}
            </button>
          </section>
        ) : (
          <div className="workspace">
            <section className="card activity" aria-labelledby="stage-heading">
              <h2 id="stage-heading" tabIndex={-1} ref={stageHeadingRef}>
                {messages.stage[session.stage]}
              </h2>
              <p className="lesson-title">{session.lessonTitle}</p>

              <StageBody
                session={session}
                busy={busy}
                choice={choice}
                reasoning={reasoning}
                onChoice={setChoice}
                onReasoning={setReasoning}
                run={run}
              />
            </section>

            <EvidencePanel
              evidence={session.evidence}
              onRestart={restart}
              busy={busy}
            />
          </div>
        )}
      </main>
    </div>
  );
}

interface StageBodyProps {
  session: SessionView;
  busy: boolean;
  choice: string;
  reasoning: string;
  onChoice: (value: string) => void;
  onReasoning: (value: string) => void;
  run: (action: () => Promise<SessionView>) => Promise<void>;
}

function StageBody(props: StageBodyProps) {
  const { session, busy, choice, reasoning, onChoice, onReasoning, run } = props;
  const { sessionId, stage } = session;

  if (stage === 'learn') {
    return (
      <>
        {session.explanation && (
          <article className="explanation">
            {session.explanation.body.split('\n\n').map((para) => (
              <p key={para.slice(0, 24)}>{para}</p>
            ))}
            {session.explanation.sourceExcerpt && (
              <aside className="source">
                <h3>{messages.source.heading}</h3>
                <blockquote>{session.explanation.sourceExcerpt.excerpt}</blockquote>
                <p className="source-meta">
                  {session.explanation.sourceExcerpt.title} &middot;{' '}
                  {messages.source.version}{' '}
                  {session.explanation.sourceExcerpt.version}
                  <br />
                  {messages.source.permission}:{' '}
                  {session.explanation.sourceExcerpt.permission}
                </p>
              </aside>
            )}
          </article>
        )}
        <button
          type="button"
          disabled={busy}
          onClick={() => void run(() => api.setStage(sessionId, 'practice'))}
        >
          {messages.actions.toPractice}
        </button>
      </>
    );
  }

  if (stage === 'summary') {
    return (
      <p className="summary-note">{messages.evidence.reviewNote}</p>
    );
  }

  if (!session.question) return null;

  const question = session.question;
  const answered = session.lastResult?.questionId === question.id;
  const hintsLeft = session.hintsAvailable - session.revealedHints.length;

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!choice || busy || answered) return;
    void run(() =>
      api.submitAttempt(sessionId, stage, choice, reasoning || undefined),
    );
  };

  return (
    <>
      {/* stage is narrowed to a question stage here: learn and summary
          returned earlier. */}
      <p className="mode-note">{messages.modeNote[stage]}</p>

      <form onSubmit={submit}>
        <fieldset disabled={busy || answered}>
          <legend>{question.prompt}</legend>
          {question.options.map((option) => (
            <label key={option.id} className="option">
              <input
                type="radio"
                name="answer"
                value={option.id}
                checked={choice === option.id}
                onChange={(e) => onChoice(e.target.value)}
              />
              <span>{option.label}</span>
            </label>
          ))}

          {question.explainPrompt && (
            <label className="reasoning">
              <span>{question.explainPrompt}</span>
              <textarea
                value={reasoning}
                onChange={(e) => onReasoning(e.target.value)}
                rows={2}
              />
            </label>
          )}
        </fieldset>

        <div className="actions">
          {!answered && (
            <button type="submit" disabled={busy || !choice}>
              {messages.actions.submit}
            </button>
          )}

          {/* Hints and reveal are offered in practice only. The check stage
              withholds them before submission, per PRODUCT.md. */}
          {stage === 'practice' && !answered && (
            <>
              <button
                type="button"
                disabled={busy || hintsLeft <= 0}
                onClick={() => void run(() => api.requestHint(sessionId, stage))}
              >
                {messages.actions.hint}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void run(() => api.revealAnswer(sessionId, stage))}
              >
                {messages.actions.reveal}
              </button>
            </>
          )}
        </div>
      </form>

      {!answered && stage === 'practice' && hintsLeft > 0 && (
        <p className="warn">{messages.hints.usingHintWarning}</p>
      )}

      {session.revealedHints.length > 0 && (
        <section className="hints">
          <h3>{messages.hints.heading}</h3>
          <ol>
            {session.revealedHints.map((hint) => (
              <li key={hint}>{hint}</li>
            ))}
          </ol>
          {hintsLeft <= 0 && <p className="muted">{messages.hints.noneLeft}</p>}
        </section>
      )}

      {session.revealedAnswer && !answered && (
        <section className="revealed" role="note">
          <h3>{messages.reveal.heading}</h3>
          <p>{session.revealedAnswer}</p>
          <p className="warn">{messages.reveal.warning}</p>
        </section>
      )}

      {answered && session.lastResult && (
        <Result session={session} run={run} busy={busy} />
      )}
    </>
  );
}

function Result(props: {
  session: SessionView;
  busy: boolean;
  run: (action: () => Promise<SessionView>) => Promise<void>;
}) {
  const { session, busy, run } = props;
  const result = session.lastResult;
  if (!result) return null;

  const next: Stage | null =
    session.stage === 'diagnose'
      ? 'learn'
      : session.stage === 'practice'
        ? 'check'
        : session.stage === 'check'
          ? 'summary'
          : null;

  const nextLabel =
    session.stage === 'diagnose'
      ? messages.actions.continue
      : session.stage === 'practice'
        ? messages.actions.toCheck
        : messages.actions.finish;

  return (
    <section className="result" aria-live="polite">
      <h3>{result.correct ? messages.feedback.correct : messages.feedback.incorrect}</h3>
      <p>{result.feedback}</p>
      <p className={result.countsAsIndependent ? 'independent' : 'assisted'}>
        {result.countsAsIndependent
          ? messages.feedback.independent
          : messages.feedback.assisted}
      </p>
      {next && (
        <button
          type="button"
          disabled={busy}
          onClick={() => void run(() => api.setStage(session.sessionId, next))}
        >
          {nextLabel}
        </button>
      )}
    </section>
  );
}
