/**
 * The learning workspace.
 *
 * Renders whatever the server says the session is. There is deliberately no
 * client-side grading, no local assistance flag and no optimistic progress:
 * every transition is a request, and the response replaces the view. That is
 * why a refresh or a second tab cannot un-do a revealed answer.
 *
 * R02B changes:
 *  - Conflict refresh: 409 tries to reload; distinguishes confirmed, failed and
 *    session-gone outcomes. Does NOT claim the view is current before the reload
 *    succeeds.
 *  - Item-replacement: 409 with error 'item_replaced' has the same reload
 *    behaviour, but shows a distinct message.
 *  - Get help button in the check stage; shows exhaustion state honestly.
 *  - Focus and selection reset when activeCheckId changes (same stage, new item).
 *  - Correctness and help-used are rendered separately in Result.
 *
 * R03 changes:
 *  - Home screen shows Continue (most recent session) and Review due list.
 *  - loadSessions() runs on mount; silently ignored when DB is not configured.
 *  - Supabase restores/refreshes the browser session and each API call reads
 *    its current access token.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { MeResponse, SessionSummary, SessionView, Stage } from '../shared/types.js';
import * as api from './api.js';
import * as auth from './auth.js';
import { messages } from './messages.js';
import { EvidencePanel } from './EvidencePanel.js';

const SESSION_KEY = 'rawi.sessionId';

type AccessState =
  | { readonly status: 'loading' }
  | { readonly status: 'fixture' }
  | { readonly status: 'signed-out' }
  | { readonly status: 'setup-required' }
  | { readonly status: 'not-enrolled'; readonly me: MeResponse }
  | { readonly status: 'ready'; readonly me: MeResponse }
  | { readonly status: 'error' };

export function App() {
  const [session, setSession] = useState<SessionView | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [choice, setChoice] = useState<string>('');
  const [reasoning, setReasoning] = useState('');
  // R03: session list for the resume UI. Null = not yet loaded; [] = loaded, none found.
  const [sessionList, setSessionList] = useState<SessionSummary[] | null>(null);
  const [access, setAccess] = useState<AccessState>({ status: 'loading' });
  const [authAttempt, setAuthAttempt] = useState(0);

  // Focus moves to the stage heading on every stage change so keyboard and
  // screen-reader users are not left at the top of the document.
  const stageHeadingRef = useRef<HTMLHeadingElement>(null);
  const previousStage = useRef<Stage | null>(null);
  // R02B: also track the active check ID so that a same-stage item replacement
  // triggers focus and selection reset.
  const previousCheckId = useRef<string | null>(null);

  /**
   * Attempt a reload after a conflict. Returns one of three outcomes:
   *  'refreshed' — reload succeeded; caller should show confirmed-refresh message
   *  'session-gone' — 404; session no longer exists
   *  'failed' — network or other error; caller should show unavailable-refresh message
   */
  const tryReload = useCallback(
    async (sessionId: string): Promise<'refreshed' | 'session-gone' | 'failed'> => {
      try {
        setSession(await api.loadSession(sessionId));
        return 'refreshed';
      } catch (caught) {
        const err = caught as api.ApiError;
        if (err.status === 404) return 'session-gone';
        return 'failed';
      }
    },
    [],
  );

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
          // actually was. Try to reload to show the authoritative current state.
          const saved = window.localStorage.getItem(SESSION_KEY);
          const isItemReplaced = err.code === 'item_replaced';

          if (saved) {
            const outcome = await tryReload(saved);
            if (outcome === 'refreshed') {
              setError(
                isItemReplaced
                  ? messages.error.itemReplaced
                  : messages.error.staleRefreshed,
              );
            } else if (outcome === 'session-gone') {
              window.localStorage.removeItem(SESSION_KEY);
              setSession(null);
              setError(
                isItemReplaced
                  ? messages.error.staleSessionGone
                  : messages.error.staleSessionGone,
              );
            } else {
              // Reload failed — do NOT claim the view is current.
              setError(
                isItemReplaced
                  ? messages.error.itemReplacedRefreshFailed
                  : messages.error.staleRefreshFailed,
              );
            }
          } else {
            setError(
              isItemReplaced
                ? messages.error.itemReplacedRefreshFailed
                : messages.error.staleRefreshFailed,
            );
          }
        } else if (err.status === 503) {
          setError(messages.error.persistenceUnavailable);
        } else {
          setError(err.code === 'network' ? messages.error.network : err.message);
        }
      } finally {
        setBusy(false);
      }
    },
    [tryReload],
  );

  // Bootstrap fixture mode or restore the Supabase PKCE session before any
  // owner-scoped session request is made.
  useEffect(() => {
    let active = true;
    setAccess({ status: 'loading' });

    const bootstrap = async () => {
      try {
        const authState = await auth.bootstrapAuth();
        if (!active) return;

        if (authState.mode === 'fixture') {
          setAccess({ status: 'fixture' });
          setSessionList([]);
          const saved = window.localStorage.getItem(SESSION_KEY);
          if (saved) await run(() => api.loadSession(saved));
          return;
        }
        if (authState.mode === 'setup-required') {
          setAccess({ status: 'setup-required' });
          return;
        }
        if (authState.mode === 'signed-out') {
          setAccess({ status: 'signed-out' });
          return;
        }

        const me = await api.loadMe();
        if (!active) return;
        if (!me.enrolled) {
          setAccess({ status: 'not-enrolled', me });
          return;
        }

        setAccess({ status: 'ready', me });
        const [{ sessions }] = await Promise.all([api.listSessions()]);
        if (!active) return;
        setSessionList(sessions);
        const saved = window.localStorage.getItem(SESSION_KEY);
        if (saved) await run(() => api.loadSession(saved));
      } catch {
        if (active) setAccess({ status: 'error' });
      }
    };

    void bootstrap();
    return () => {
      active = false;
    };
  }, [authAttempt, run]);

  useEffect(() => {
    if (session) window.localStorage.setItem(SESSION_KEY, session.sessionId);
  }, [session]);

  useEffect(() => {
    if (!session) return;

    const stageChanged = session.stage !== previousStage.current;
    // R02B: detect item replacement — same stage but different activeCheckId.
    const checkItemChanged =
      session.activeCheckId !== undefined &&
      session.activeCheckId !== previousCheckId.current;

    if (stageChanged || checkItemChanged) {
      previousStage.current = session.stage;
      previousCheckId.current = session.activeCheckId ?? null;
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

  const signIn = async () => {
    setBusy(true);
    setError(null);
    try {
      await auth.signInWithGoogle();
    } catch {
      setError(messages.auth.signInFailed);
      setBusy(false);
    }
  };

  const signOut = async () => {
    setBusy(true);
    setError(null);
    try {
      await auth.signOut();
      window.localStorage.removeItem(SESSION_KEY);
      setSession(null);
      setSessionList(null);
      setAccess({ status: 'signed-out' });
    } catch {
      setError(messages.auth.signOutFailed);
    } finally {
      setBusy(false);
    }
  };

  const learningReady = access.status === 'fixture' || access.status === 'ready';

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-row">
          <h1>{messages.appName}</h1>
          {(access.status === 'ready' || access.status === 'not-enrolled') && (
            <button type="button" className="ghost" disabled={busy} onClick={() => void signOut()}>
              {messages.auth.signOut}
            </button>
          )}
        </div>
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
        {!learningReady ? (
          <AccessScreen
            access={access}
            busy={busy}
            onSignIn={() => void signIn()}
            onRetry={() => setAuthAttempt((attempt) => attempt + 1)}
          />
        ) : !session ? (
          <HomeScreen
            busy={busy}
            sessionList={sessionList}
            onStart={start}
            onResume={(id) => void run(() => api.loadSession(id))}
          />
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

interface AccessScreenProps {
  access: Exclude<AccessState, { status: 'fixture' } | { status: 'ready' }>;
  busy: boolean;
  onSignIn: () => void;
  onRetry: () => void;
}

function AccessScreen({ access, busy, onSignIn, onRetry }: AccessScreenProps) {
  if (access.status === 'loading') {
    return <section className="card auth-card"><h2>{messages.auth.restoring}</h2></section>;
  }
  if (access.status === 'signed-out') {
    return (
      <section className="card auth-card">
        <h2>{messages.auth.heading}</h2>
        <p>{messages.auth.body}</p>
        <button type="button" disabled={busy} onClick={onSignIn}>
          {messages.auth.signIn}
        </button>
      </section>
    );
  }
  if (access.status === 'not-enrolled') {
    return (
      <section className="card auth-card">
        <h2>{messages.auth.notEnrolledHeading}</h2>
        <p>{messages.auth.notEnrolledBody}</p>
        {access.me.email && <p className="muted">{access.me.email}</p>}
      </section>
    );
  }
  if (access.status === 'setup-required') {
    return (
      <section className="card auth-card">
        <h2>{messages.auth.setupHeading}</h2>
        <p>{messages.auth.setupBody}</p>
      </section>
    );
  }
  return (
    <section className="card auth-card">
      <h2>{messages.auth.unavailableHeading}</h2>
      <p>{messages.auth.unavailableBody}</p>
      <button type="button" disabled={busy} onClick={onRetry}>
        {messages.actions.retry}
      </button>
    </section>
  );
}

// ─── HomeScreen ───────────────────────────────────────────────────────────────

interface HomeScreenProps {
  busy: boolean;
  sessionList: SessionSummary[] | null;
  onStart: () => void;
  onResume: (sessionId: string) => void;
}

/**
 * Home screen shown when no session is active.
 *
 * R03: when the learner has prior sessions (loaded from Supabase via
 * /api/sessions), shows a Continue button for the most recent one and a
 * "Review due" list for sessions with a past due date.
 * Falls back to the simple start card when there are no prior sessions or
 * the DB is not configured (sessionList is empty or null).
 */
function HomeScreen({ busy, sessionList, onStart, onResume }: HomeScreenProps) {
  const today = new Date().toISOString().slice(0, 10);

  const mostRecent = sessionList?.[0] ?? null;
  const reviewDue = (sessionList ?? []).filter(
    (s) => s.nextReviewDue && s.nextReviewDue <= today,
  );

  return (
    <>
      <section className="card">
        <h2>{messages.start.heading}</h2>
        <p>{messages.start.body}</p>
        <button type="button" onClick={onStart} disabled={busy}>
          {messages.start.action}
        </button>
      </section>

      {mostRecent && (
        <section className="card resume-card" aria-label={messages.resume.continueLabel}>
          <h2>{messages.resume.continueHeading}</h2>
          <p className="resume-meta">
            {messages.evidence.state[mostRecent.evidenceState as keyof typeof messages.evidence.state] ?? mostRecent.evidenceState}
            {' · '}
            {messages.resume.lastSeen}{' '}
            {new Date(mostRecent.updatedAt).toLocaleDateString()}
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={() => onResume(mostRecent.sessionId)}
          >
            {messages.resume.continueAction}
          </button>
        </section>
      )}

      {reviewDue.length > 0 && (
        <section className="card review-due-card" aria-label={messages.resume.reviewDueLabel}>
          <h2>{messages.resume.reviewDueHeading}</h2>
          <ul className="review-due-list">
            {reviewDue.map((s) => (
              <li key={s.sessionId}>
                <button
                  type="button"
                  disabled={busy}
                  className="ghost"
                  onClick={() => onResume(s.sessionId)}
                >
                  {messages.resume.reviewAction}{' '}
                  <span className="review-due-date">{s.nextReviewDue}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
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
          onClick={() => void run(() => api.setStage(sessionId, 'practice', stage))}
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
      api.submitAttempt(
        sessionId,
        stage,
        choice,
        reasoning || undefined,
        // R02B: pass the item ID at check stage for stale-item detection.
        stage === 'check' ? (session.activeCheckId ?? question.id) : undefined,
      ),
    );
  };

  // R02B: show the exhaustion message instead of the question at check stage.
  if (stage === 'check' && session.checkBankExhausted) {
    return (
      <div className="check-exhausted" role="note">
        <p className="warn">{messages.check.bankExhausted}</p>
        <button
          type="button"
          disabled={busy}
          onClick={() => void run(() => api.setStage(sessionId, 'practice', stage))}
        >
          {messages.actions.toPractice}
        </button>
      </div>
    );
  }

  // R02B: show the converted state — question has been converted to practice.
  if (stage === 'check' && session.checkConverted) {
    return (
      <div className="check-converted" role="note">
        <p>{messages.check.converted}</p>
        <button
          type="button"
          disabled={busy}
          onClick={() => void run(() => api.setStage(sessionId, 'practice', stage))}
        >
          {messages.actions.toPractice}
        </button>
      </div>
    );
  }

  return (
    <>
      {/* stage is narrowed to a question stage here: learn and summary
          returned earlier. */}
      <p className="mode-note">{messages.modeNote[stage as keyof typeof messages.modeNote]}</p>

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
                onClick={() =>
                  void run(() =>
                    api.requestHintWithItem(sessionId, stage),
                  )
                }
              >
                {messages.actions.hint}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  void run(() => api.revealAnswerWithItem(sessionId, stage))
                }
              >
                {messages.actions.reveal}
              </button>
            </>
          )}

          {/* R02B: Get help button in the check stage, only before submission. */}
          {stage === 'check' && !answered && (
            <button
              type="button"
              disabled={busy}
              className="ghost help-check"
              onClick={() =>
                void run(() =>
                  api.convertCheck(
                    sessionId,
                    session.activeCheckId ?? question.id,
                  ),
                )
              }
            >
              {messages.actions.getHelp}
            </button>
          )}
        </div>
      </form>

      {stage === 'check' && !answered && (
        <p className="warn check-help-warning">{messages.check.getHelpWarning}</p>
      )}

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

  /**
   * R02B: render correctness and help-used as two independent facts.
   *
   * The old code derived both from `countsAsIndependent`, which conflated
   * "correct" with "no help used". A wrong unaided answer would show the same
   * label as an assisted correct answer ("assisted"), which is misleading —
   * they describe completely different events.
   *
   * New rule:
   *  - countsAsIndependent true  → "Recorded as independent"
   *  - assistance !== 'none'     → "Recorded as assisted: help was used"
   *  - correct false, no help    → "Not recorded as independent: wrong"
   */
  let helpLabel: string;
  if (result.countsAsIndependent) {
    helpLabel = messages.feedback.independent;
  } else if (result.assistance !== 'none') {
    helpLabel = messages.feedback.helpUsed;
  } else {
    helpLabel = messages.feedback.incorrectUnaided;
  }

  const helpClass = result.countsAsIndependent
    ? 'independent'
    : result.assistance !== 'none'
      ? 'assisted'
      : 'wrong-unaided';

  return (
    <section className="result" aria-live="polite">
      <h3>{result.correct ? messages.feedback.correct : messages.feedback.incorrect}</h3>
      <p>{result.feedback}</p>
      <p className={helpClass}>{helpLabel}</p>
      {next && (
        <button
          type="button"
          disabled={busy}
          onClick={() => void run(() => api.setStage(session.sessionId, next, session.stage))}
        >
          {nextLabel}
        </button>
      )}
    </section>
  );
}
