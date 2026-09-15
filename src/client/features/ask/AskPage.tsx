import { useState, type FormEvent } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { MessageCircleQuestionIcon } from 'lucide-react';

import type { AskResponse } from '@shared/contract.ts';
import { ASK_DURING_CHECK_WARNING, EMPTY } from '@shared/messages.ts';

import { useAsk } from '@/api/queries.ts';
import { InlineText } from '@/components/InlineText.tsx';
import { Page, PageHeader, Section } from '@/components/layout.tsx';
import { EmptyState, ErrorState } from '@/components/states.tsx';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert.tsx';
import { Button } from '@/components/ui/button.tsx';
import { Label } from '@/components/ui/label.tsx';
import { Textarea } from '@/components/ui/textarea.tsx';

/**
 * Grounded chat.
 *
 * ── The warning is shown before the question is sent ──────────────────────
 *
 * When this page is opened from inside a session (`?session=`), asking counts
 * as help and the answer the learner then gives is recorded as assisted. That
 * is said **above the box**, not in a toast afterwards. A learner should get to
 * decide whether the help is worth it while they still have the choice — a
 * consequence revealed after the fact is a trap, however accurately it is
 * logged.
 *
 * ── "The sources do not cover this" is an answer ──────────────────────────
 *
 * When nothing retrieves, or when the model reports it cannot ground an answer,
 * the page says so plainly and cites nothing. It does not fall back to general
 * knowledge, because the one promise this surface makes is that everything it
 * says comes from your sources.
 */
export function AskPage() {
  const { workspaceId = '' } = useParams();
  const [searchParams] = useSearchParams();
  const sessionId = searchParams.get('session');

  const ask = useAsk(workspaceId);
  const [question, setQuestion] = useState('');
  const [history, setHistory] = useState<{ question: string; response: AskResponse }[]>([]);

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    const asked = question.trim();
    if (!asked) return;
    ask.mutate(
      { question: asked, sessionId },
      {
        onSuccess: (response) => {
          setHistory((current) => [{ question: asked, response }, ...current]);
          setQuestion('');
        },
      },
    );
  }

  return (
    <Page width="prose" className="py-page">
      <PageHeader
        title="Ask"
        description="Answers come only from this workspace's sources, with citations."
      />

      {sessionId && (
        <Alert>
          <AlertTitle>This counts as help</AlertTitle>
          <AlertDescription>{ASK_DURING_CHECK_WARNING}</AlertDescription>
        </Alert>
      )}

      <form onSubmit={onSubmit} className="flex flex-col gap-base">
        <div className="flex flex-col gap-tight">
          <Label htmlFor="question">Your question</Label>
          <Textarea
            id="question"
            rows={3}
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder="What does elasticity have to do with revenue?"
          />
        </div>

        <Button type="submit" disabled={ask.isPending || question.trim().length === 0}>
          {ask.isPending ? 'Looking through your sources…' : 'Ask'}
        </Button>

        {ask.isError && (
          <ErrorState title="Could not answer that" detail={ask.error.message} />
        )}
      </form>

      <Section>
        {history.length === 0 ? (
          <EmptyState
            icon={<MessageCircleQuestionIcon />}
            title={EMPTY.ask.title}
            description={EMPTY.ask.description}
          />
        ) : (
          <ul className="flex flex-col gap-section">
            {history.map((entry, index) => (
              <li key={index} className="flex flex-col gap-snug">
                <p className="font-serif text-lg leading-snug">{entry.question}</p>

                <div className="ui-reading text-base leading-relaxed">
                  <InlineText text={entry.response.answer} />
                </div>

                {entry.response.refusedForLackOfGrounding ? (
                  <p className="text-muted-foreground text-xs">
                    Nothing cited, because nothing in your sources answers it.{' '}
                    <Link
                      to={`/w/${workspaceId}/sources`}
                      className="text-primary underline-offset-4 hover:underline"
                    >
                      Add a source
                    </Link>
                  </p>
                ) : (
                  <ul className="flex flex-col gap-tight">
                    {entry.response.citations.map((citation) => (
                      <li
                        key={citation.chunkId}
                        className="border-border-strong border-s-2 ps-snug text-sm leading-relaxed"
                      >
                        {/* A logical-property border, so the citation rule sits
                            on the correct edge if an Arabic UI is ever added.
                            Not in v1 — but it costs nothing to keep cheap. */}
                        <Link
                          to={`/w/${workspaceId}/sources/${citation.sourceId}`}
                          className="text-primary text-xs underline-offset-4 hover:underline"
                        >
                          {citation.sourceTitle}
                        </Link>
                        <p className="text-muted-foreground">
                          <InlineText text={citation.quote} />
                        </p>
                      </li>
                    ))}
                  </ul>
                )}

                {entry.response.recordedAsSupport && (
                  <p className="text-muted-foreground text-xs">
                    Recorded as help on the question you are checking.
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </Section>
    </Page>
  );
}
