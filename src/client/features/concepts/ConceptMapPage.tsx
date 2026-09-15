import { Link, useParams } from 'react-router-dom';
import { NetworkIcon } from 'lucide-react';

import { EMPTY } from '@shared/messages.ts';

import { useConcepts, useExtractConcepts, useJob } from '@/api/queries.ts';
import { Page, PageHeader, Section } from '@/components/layout.tsx';
import {
  EmptyState,
  ErrorState,
  GeneratingState,
  LoadingCard,
} from '@/components/states.tsx';
import { Button } from '@/components/ui/button.tsx';
import { useState } from 'react';

import { EvidenceBadge } from './EvidenceBadge.tsx';

/**
 * The concept map.
 *
 * ── Why it is a list and not a graph ──────────────────────────────────────
 *
 * A force-directed graph of a dozen concepts looks impressive and is harder to
 * read than the list it replaces: you cannot scan it, you cannot sort it, and
 * the positions mean nothing. Prerequisites are shown as a line of text under
 * each concept, which is the information the graph was drawing — and here you
 * can click it.
 *
 * ── Prerequisites order the work; they do not gate it ─────────────────────
 *
 * Nothing on this screen is locked. Rawi will not refuse to teach something
 * because a box is not ticked — the plan page suggests an order, and a learner
 * who wants to start in the middle is allowed to.
 */
export function ConceptMapPage() {
  const { workspaceId = '' } = useParams();
  const concepts = useConcepts(workspaceId);
  const extract = useExtractConcepts(workspaceId);
  const [jobId, setJobId] = useState<string | null>(null);
  const job = useJob(workspaceId, jobId);

  const names = new Map((concepts.data ?? []).map((concept) => [concept.id, concept.name]));

  return (
    <Page width="wide" className="py-page">
      <PageHeader
        title="Concepts"
        description="Pulled out of this workspace's sources. Each carries what you have actually shown, not a score."
        actions={
          <Button
            variant="outline"
            onClick={() =>
              extract.mutate(undefined, { onSuccess: (created) => setJobId(created.id) })
            }
            disabled={extract.isPending || job.data?.status === 'running'}
          >
            Extract from sources
          </Button>
        }
      />

      {jobId && job.data && job.data.status !== 'succeeded' && (
        <GeneratingState
          stage={job.data.stage}
          // null when the total is genuinely unknown, which makes the bar
          // breathe rather than claim 0%.
          value={
            job.data.unitsTotal
              ? (job.data.unitsDone / job.data.unitsTotal) * 100
              : null
          }
          detail={
            job.data.status === 'failed'
              ? (job.data.error?.message ?? 'The job failed.')
              : 'Reading every source in this workspace.'
          }
        />
      )}

      <Section>
        {concepts.isPending ? (
          <div className="grid gap-base sm:grid-cols-2">
            <LoadingCard />
            <LoadingCard />
          </div>
        ) : concepts.isError ? (
          <ErrorState
            title="Could not load the concepts"
            detail={concepts.error.message}
            onRetry={() => void concepts.refetch()}
          />
        ) : concepts.data.length === 0 ? (
          <EmptyState
            icon={<NetworkIcon />}
            title={EMPTY.concepts.title}
            description={EMPTY.concepts.description}
            action={
              <Button asChild variant="outline">
                <Link to={`/w/${workspaceId}/sources`}>Add a source</Link>
              </Button>
            }
          />
        ) : (
          <ul className="grid gap-base sm:grid-cols-2">
            {concepts.data.map((concept) => (
              <li key={concept.id}>
                <Link
                  to={`/w/${workspaceId}/concepts/${concept.id}`}
                  className="border-border hover:border-border-strong focus-visible:ring-ring flex h-full flex-col gap-snug rounded-xl border p-gutter transition-colors outline-none focus-visible:ring-2"
                >
                  <span className="font-serif text-lg leading-tight">{concept.name}</span>
                  <span className="text-muted-foreground line-clamp-3 text-sm leading-relaxed">
                    {concept.summary}
                  </span>

                  <EvidenceBadge state={concept.evidence} className="self-start" />

                  {concept.prerequisiteIds.length > 0 && (
                    <span className="text-muted-foreground text-xs">
                      Builds on{' '}
                      {concept.prerequisiteIds
                        .map((id) => names.get(id) ?? 'something not extracted yet')
                        .join(', ')}
                    </span>
                  )}

                  <span className="text-muted-foreground mt-auto font-mono text-xs tabular-nums">
                    {concept.itemsRemaining === 0
                      ? 'no unused questions'
                      : `${concept.itemsRemaining} question${concept.itemsRemaining === 1 ? '' : 's'} unused`}
                    {concept.dueAt && ` · due ${concept.dueAt}`}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </Page>
  );
}
