import { Link, useNavigate, useParams } from 'react-router-dom';

import {
  useConcept,
  useConceptEvidence,
  useReadiness,
  useStartReview,
  useStartSession,
} from '@/api/queries.ts';
import { Page, PageHeader, Section } from '@/components/layout.tsx';
import { ErrorState, LoadingState } from '@/components/states.tsx';
import { Button } from '@/components/ui/button.tsx';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert.tsx';

import { AssistanceNote, EvidenceStatement } from './EvidenceBadge.tsx';

/**
 * One concept: what it is, what you have shown, and what you can do next.
 *
 * ── Readiness is asked for, not guessed ───────────────────────────────────
 *
 * The buttons below are gated by the server's own answer to "can this be
 * checked?". A surface that offers an action the server will refuse is a
 * surface that lies — and the blockers come back as sentences, in the order
 * they should be fixed, so the learner is told what to do rather than that
 * something is unavailable.
 */
export function ConceptPage() {
  const { workspaceId = '', conceptId = '' } = useParams();
  const navigate = useNavigate();

  const concept = useConcept(workspaceId, conceptId);
  const evidence = useConceptEvidence(workspaceId, conceptId);
  const readiness = useReadiness(workspaceId, conceptId);
  const startSession = useStartSession(workspaceId);
  const startReview = useStartReview(workspaceId);

  if (concept.isPending) {
    return (
      <Page width="prose" className="py-page">
        <LoadingState lines={6} label="Loading this concept" />
      </Page>
    );
  }

  if (concept.isError) {
    return (
      <Page width="prose" className="py-page">
        <ErrorState
          title="Could not load this concept"
          detail={concept.error.message}
          onRetry={() => void concept.refetch()}
        />
      </Page>
    );
  }

  const due =
    concept.data.dueAt !== null &&
    concept.data.dueAt <= new Date().toISOString().slice(0, 10);

  function open(kind: 'session' | 'review') {
    const mutation = kind === 'review' ? startReview : startSession;
    mutation.mutate(conceptId, {
      onSuccess: (session) =>
        navigate(`/w/${workspaceId}/concepts/${conceptId}/session/${session.id}`),
    });
  }

  return (
    <Page width="prose" className="py-page">
      <PageHeader title={concept.data.name} description={concept.data.summary} />

      <Section title="What you have shown">
        <EvidenceStatement state={concept.data.evidence} />

        {evidence.data?.earnedBy && (
          <p className="text-muted-foreground text-sm leading-relaxed">
            Earned on{' '}
            <span className="font-mono tabular-nums">
              {evidence.data.earnedBy.at.slice(0, 10)}
            </span>
            {' · '}
            <AssistanceNote
              assistance={evidence.data.earnedBy.assistance}
              usedAsk={evidence.data.earnedBy.usedAsk}
            />
          </p>
        )}

        <Link
          to={`/w/${workspaceId}/evidence`}
          className="text-primary focus-visible:ring-ring w-fit rounded-sm text-sm underline-offset-4 outline-none hover:underline focus-visible:ring-2"
        >
          See every attempt
        </Link>
      </Section>

      {readiness.data && readiness.data.blockers.length > 0 && (
        <Alert>
          <AlertTitle>Before a check will mean anything</AlertTitle>
          <AlertDescription>
            <ul className="flex list-disc flex-col gap-hairline pl-base">
              {readiness.data.blockers.map((blocker) => (
                <li key={blocker.code}>{blocker.message}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      <Section title="Next">
        <div className="flex flex-wrap gap-tight">
          <Button
            onClick={() => open('session')}
            disabled={
              startSession.isPending || concept.data.itemsRemaining === 0
            }
          >
            {startSession.isPending ? 'Opening…' : 'Start a session'}
          </Button>

          {due && (
            <Button variant="outline" onClick={() => open('review')} disabled={startReview.isPending}>
              Do the re-check
            </Button>
          )}
        </div>

        {concept.data.itemsRemaining === 0 && (
          <p className="text-muted-foreground max-w-prose text-sm leading-relaxed">
            Every question written for this concept has been used. Nothing will be
            re-served as if it were new — add a source that covers this concept and
            extract again to get more.
          </p>
        )}

        {(startSession.isError || startReview.isError) && (
          <ErrorState
            title="Could not start"
            detail={(startSession.error ?? startReview.error)?.message}
          />
        )}
      </Section>
    </Page>
  );
}
