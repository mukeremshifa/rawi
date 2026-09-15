import { Link, useParams } from 'react-router-dom';
import { BookOpenIcon } from 'lucide-react';

import { EVIDENCE_LABEL, EMPTY } from '@shared/messages.ts';
import type { EvidenceState } from '@shared/contract.ts';

import { useConcepts, useEvidenceSummary } from '@/api/queries.ts';
import { Page, PageHeader, Section } from '@/components/layout.tsx';
import { EmptyState, ErrorState, LoadingState } from '@/components/states.tsx';
import { EvidenceDot } from '@/features/concepts/EvidenceBadge.tsx';

/**
 * Evidence: what you did, unaided or not, when, and what is due.
 *
 * ── There is no score on this page and there never will be ────────────────
 *
 * Invariant 6. The numbers here are **row counts** — how many concepts are in
 * each state, how many attempts exist, how many of those were unaided. Each one
 * is something you could go and count, and none of them is an estimate of what
 * anyone knows. The old app had a mastery percentage; its deletion is the point
 * of this screen.
 *
 * ── The counts are in mono, and they are not a bar ────────────────────────
 *
 * A stacked bar across the four states would read as a progress bar toward
 * "fully retained", which is precisely the claim this product refuses to make.
 * Four rows with four numbers say the same thing and promise nothing.
 */
const ORDER: EvidenceState[] = [
  'retained-on-review',
  'independent-once',
  'practicing',
  'not-checked',
];

export function EvidencePage() {
  const { workspaceId = '' } = useParams();
  const summary = useEvidenceSummary(workspaceId);
  const concepts = useConcepts(workspaceId);

  return (
    <Page width="wide" className="py-page">
      <PageHeader
        title="Evidence"
        description="What you have actually done, and whether you did it unaided. Nothing here is a score."
      />

      {summary.isPending ? (
        <LoadingState lines={5} label="Reading your evidence" />
      ) : summary.isError ? (
        <ErrorState
          title="Could not load your evidence"
          detail={summary.error.message}
          onRetry={() => void summary.refetch()}
        />
      ) : summary.data.totalAttempts === 0 ? (
        <EmptyState
          icon={<BookOpenIcon />}
          title={EMPTY.evidence.title}
          description={EMPTY.evidence.description}
        />
      ) : (
        <>
          <Section title="Across this workspace">
            <dl className="flex flex-col gap-tight">
              {ORDER.map((state) => (
                <div key={state} className="flex items-center gap-snug">
                  <EvidenceDot state={state} />
                  <dt className="text-sm">{EVIDENCE_LABEL[state]}</dt>
                  <dd className="ms-auto font-mono text-sm tabular-nums">
                    {summary.data.counts[state]}
                  </dd>
                </div>
              ))}
            </dl>

            <p className="text-muted-foreground text-sm leading-relaxed">
              <span className="font-mono tabular-nums">
                {summary.data.independentAttempts}
              </span>{' '}
              of{' '}
              <span className="font-mono tabular-nums">{summary.data.totalAttempts}</span>{' '}
              recorded attempts were correct with no help of any kind.
              {summary.data.dueToday > 0 && (
                <>
                  {' '}
                  <span className="font-mono tabular-nums">{summary.data.dueToday}</span>{' '}
                  re-check{summary.data.dueToday === 1 ? ' is' : 's are'} due.
                </>
              )}
            </p>
          </Section>

          <Section title="By concept">
            {concepts.isPending ? (
              <LoadingState lines={4} />
            ) : concepts.isError ? (
              <ErrorState detail={concepts.error.message} />
            ) : (
              <ul className="flex flex-col gap-snug">
                {concepts.data.map((concept) => (
                  <li key={concept.id}>
                    <Link
                      to={`/w/${workspaceId}/concepts/${concept.id}`}
                      className="border-border hover:border-border-strong focus-visible:ring-ring flex flex-wrap items-center gap-snug rounded-lg border p-snug text-sm transition-colors outline-none focus-visible:ring-2"
                    >
                      <EvidenceDot state={concept.evidence} />
                      <span className="min-w-0 flex-1 truncate">{concept.name}</span>
                      <span className="text-muted-foreground text-xs">
                        {EVIDENCE_LABEL[concept.evidence]}
                      </span>
                      <span className="text-muted-foreground font-mono text-xs tabular-nums">
                        {/* Unknown renders as unknown. A concept never attempted
                            shows an em dash, not a date and not a zero. */}
                        {concept.lastAttemptAt ? concept.lastAttemptAt.slice(0, 10) : '—'}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </>
      )}
    </Page>
  );
}
