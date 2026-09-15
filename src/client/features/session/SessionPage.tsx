import { useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { EyeIcon, LightbulbIcon } from 'lucide-react';

import type { Session } from '@shared/contract.ts';
import { ASK_DURING_CHECK_WARNING, ASSISTANCE_LABEL } from '@shared/messages.ts';

import {
  useAdvanceStage,
  useEndSession,
  useRequestHint,
  useRevealAnswer,
  useSession,
  useSubmitResponse,
} from '@/api/queries.ts';
import { InlineText } from '@/components/InlineText.tsx';
import { Page, PageHeader, Section } from '@/components/layout.tsx';
import { ErrorState, LoadingState } from '@/components/states.tsx';
import { Button } from '@/components/ui/button.tsx';
import { Label } from '@/components/ui/label.tsx';
import { Textarea } from '@/components/ui/textarea.tsx';
import { EvidenceBadge } from '@/features/concepts/EvidenceBadge.tsx';

/**
 * The teaching surface: diagnose → teach → practise → check.
 *
 * ── One generous reading column ───────────────────────────────────────────
 *
 * SynapseDeck's three-pane shell was right for a working session where you
 * compare a card to its deck. This is reading and thinking, so the sources and
 * the evidence are *available* rather than always present, and the column is
 * sized to a comfortable measure. The screen should look like a well-set page,
 * not a dashboard.
 *
 * ── Every command names what it was built against ─────────────────────────
 *
 * `itemId`, `expectedStage` and `expectedVersion` go with every hint, reveal
 * and submission. A second tab that has moved on gets `stale_request` rather
 * than silently applying its command to whatever is active now. The error
 * surface below says exactly that and offers a reload, because "this moved
 * on" is a normal outcome and not a crash.
 *
 * ── Assistance is stated before it is taken ───────────────────────────────
 *
 * The hint and reveal buttons say what they cost, and the Ask link carries the
 * warning. A learner should never discover afterwards that the thing they
 * clicked changed what their answer was worth.
 */
export function SessionPage() {
  const { workspaceId = '', conceptId = '', sessionId = '' } = useParams();
  const session = useSession(workspaceId, sessionId);

  if (session.isPending) {
    return (
      <Page width="prose" className="py-page">
        <LoadingState lines={6} label="Opening your session" />
      </Page>
    );
  }

  if (session.isError) {
    return (
      <Page width="prose" className="py-page">
        <ErrorState
          title="Could not open this session"
          detail={session.error.message}
          onRetry={() => void session.refetch()}
        />
      </Page>
    );
  }

  return (
    <SessionBody
      workspaceId={workspaceId}
      conceptId={conceptId}
      session={session.data}
      onReload={() => void session.refetch()}
    />
  );
}

function SessionBody({
  workspaceId,
  conceptId,
  session,
  onReload,
}: {
  workspaceId: string;
  conceptId: string;
  session: Session;
  onReload: () => void;
}) {
  const [response, setResponse] = useState('');
  const hint = useRequestHint(workspaceId, session.id);
  const reveal = useRevealAnswer(workspaceId, session.id);
  const submit = useSubmitResponse(workspaceId, session.id);
  const advance = useAdvanceStage(workspaceId, session.id);
  const end = useEndSession(workspaceId, session.id);

  const command = session.item
    ? {
        itemId: session.item.id,
        expectedStage: session.stage,
        expectedVersion: session.version,
      }
    : null;

  const error = hint.error ?? reveal.error ?? submit.error ?? advance.error;
  const busy = hint.isPending || reveal.isPending || submit.isPending || advance.isPending;

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!command || response.trim().length === 0) return;
    submit.mutate(
      {
        ...command,
        response: response.trim(),
        // Derived from what is being submitted, so a double-click or a retried
        // request is one recorded attempt rather than two.
        idempotencyKey: `${session.id}-${command.itemId}-${response.trim().length}-${response.trim().slice(0, 24)}`,
      },
      { onSuccess: () => setResponse('') },
    );
  }

  return (
    <Page width="prose" className="py-page">
      <PageHeader
        title={session.stage === 'review' ? 'Re-check' : 'Session'}
        description={
          session.stage === 'review'
            ? 'A different question about something you solved unaided before.'
            : 'Work through it. Help is here if you need it, and using it is recorded.'
        }
        actions={<EvidenceBadge state={session.evidence} />}
      />

      {error && (
        <ErrorState
          title="That did not go through"
          detail={error.message}
          onRetry={onReload}
          retryLabel="Reload this session"
        />
      )}

      {session.teaching && (
        <Section title="The explanation">
          <div className="ui-reading text-base leading-relaxed">
            <InlineText text={session.teaching.text} />
          </div>
          {session.teaching.citations.length > 0 && (
            <p className="text-muted-foreground text-xs">
              Grounded in {session.teaching.citations.length} passage
              {session.teaching.citations.length === 1 ? '' : 's'} from your sources.
            </p>
          )}
        </Section>
      )}

      {session.stage === 'diagnose' && !session.teaching && command && (
        <Button
          variant="outline"
          className="self-start"
          onClick={() =>
            advance.mutate({
              to: 'teach',
              expectedStage: session.stage,
              expectedVersion: session.version,
            })
          }
        >
          Show me the explanation
        </Button>
      )}

      {/*
        The feedback about the LAST answer sits above the NEXT question, not
        below the form. Seen in the browser: after submitting, the new question
        arrived at the top and the sentence explaining what happened to the
        previous one was below the answer box, past two paragraphs of help
        text. A learner reads top to bottom and would have moved on before
        finding out how they did.
      */}
      {session.feedback && session.item && (
        <p
          className="border-border-strong ui-reading rounded-lg border-s-2 ps-base text-sm leading-relaxed"
          role="status"
          aria-live="polite"
        >
          {session.feedback.text}
        </p>
      )}

      {session.item ? (
        <Section title={session.stage === 'review' ? 'The re-check' : 'The question'}>
          <div className="ui-reading font-serif text-xl leading-snug">
            <InlineText text={session.item.prompt} />
          </div>

          {session.hints.length > 0 && (
            <ul className="border-border-strong flex flex-col gap-tight rounded-lg border p-gutter">
              {session.hints.map((text, index) => (
                <li key={index} className="text-sm leading-relaxed">
                  <InlineText text={text} />
                </li>
              ))}
            </ul>
          )}

          {session.revealedAnswer && (
            <div className="bg-muted flex flex-col gap-tight rounded-lg p-gutter">
              <p className="text-xs font-medium uppercase tracking-wide">The answer</p>
              <div className="text-sm leading-relaxed">
                <InlineText text={session.revealedAnswer} />
              </div>
            </div>
          )}

          <form onSubmit={onSubmit} className="flex flex-col gap-base">
            {session.item.responseMode === 'choice' && session.item.options ? (
              <fieldset className="flex flex-col gap-tight">
                <legend className="sr-only">Choose one</legend>
                {session.item.options.map((option) => (
                  <label
                    key={option.id}
                    className="border-border hover:border-border-strong has-checked:border-primary flex cursor-pointer items-start gap-snug rounded-lg border p-snug text-sm leading-relaxed transition-colors"
                  >
                    <input
                      type="radio"
                      name="choice"
                      value={option.id}
                      checked={response === option.id}
                      onChange={(event) => setResponse(event.target.value)}
                      className="mt-1"
                    />
                    <span>{option.text}</span>
                  </label>
                ))}
              </fieldset>
            ) : (
              <div className="flex flex-col gap-tight">
                <Label htmlFor="response">Your answer</Label>
                <Textarea
                  id="response"
                  rows={5}
                  value={response}
                  onChange={(event) => setResponse(event.target.value)}
                  placeholder="Explain it in your own words."
                />
              </div>
            )}

            <div className="flex flex-wrap items-center gap-tight">
              <Button type="submit" disabled={busy || response.trim().length === 0}>
                {submit.isPending ? 'Checking…' : 'Submit'}
              </Button>

              {session.item.hintCount > session.hints.length && command && (
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={() => hint.mutate(command)}
                >
                  <LightbulbIcon aria-hidden />
                  Hint — recorded as help
                </Button>
              )}

              {session.assistance !== 'revealed' && command && (
                <Button
                  type="button"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => reveal.mutate(command)}
                >
                  <EyeIcon aria-hidden />
                  Show the answer — this cannot be undone
                </Button>
              )}
            </div>

            <p className="text-muted-foreground text-xs">
              {ASSISTANCE_LABEL[session.assistance]}
              {session.assistance === 'none' &&
                ' — answer correctly now and it counts as independent.'}
            </p>

            <p className="text-muted-foreground max-w-prose text-xs leading-relaxed">
              {ASK_DURING_CHECK_WARNING}{' '}
              <Link
                to={`/w/${workspaceId}/ask?session=${session.id}`}
                className="text-primary rounded-sm underline-offset-4 hover:underline"
              >
                Ask anyway
              </Link>
            </p>
          </form>
        </Section>
      ) : (
        <Section title="Where that leaves you">
          {session.feedback && (
            <p className="ui-reading text-base leading-relaxed">{session.feedback.text}</p>
          )}

          {session.itemBankExhausted && (
            <p className="text-muted-foreground ui-reading text-sm leading-relaxed">
              Every question written for this concept has now been used. Rawi will not
              re-serve one as if it were new.
            </p>
          )}

          <div className="flex flex-wrap gap-tight">
            <Button asChild variant="outline">
              <Link to={`/w/${workspaceId}/concepts/${conceptId}`}>Back to the concept</Link>
            </Button>
            <Button asChild>
              <Link to={`/w/${workspaceId}`}>What to do next</Link>
            </Button>
          </div>
        </Section>
      )}

      {session.item && (
        <Button
          variant="ghost"
          className="self-start"
          onClick={() => end.mutate()}
          disabled={end.isPending}
        >
          Stop here — your evidence is saved
        </Button>
      )}
    </Page>
  );
}
