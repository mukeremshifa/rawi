import { Link, useNavigate, useParams } from 'react-router-dom';
import { CheckCircle2Icon } from 'lucide-react';

import type { PlanEntry } from '@shared/contract.ts';
import { EMPTY } from '@shared/messages.ts';

import { useStartReview, useStartSession, useStudyPlan } from '@/api/queries.ts';
import { Page, PageHeader, Section } from '@/components/layout.tsx';
import { EmptyState, ErrorState, LoadingState } from '@/components/states.tsx';
import { Button } from '@/components/ui/button.tsx';
import { EvidenceDot } from '@/features/concepts/EvidenceBadge.tsx';

/**
 * What to do next, and why.
 *
 * ── The reason column is not decoration ───────────────────────────────────
 *
 * Every entry carries a sentence the server can defend from the attempt log. A
 * plan that cannot say why it chose something is a plan the learner has to
 * trust blindly — and a learner who does not trust the ordering ignores it and
 * picks a concept at random, which is the state this screen exists to improve on.
 *
 * ── "Nothing due" is success ──────────────────────────────────────────────
 *
 * The empty state says so. In a product built on delayed re-checks, an empty
 * plan is the healthy case, and rendering it as a sad grey box would be
 * misleading about what just happened.
 */
export function PlanPage() {
  const { workspaceId = '' } = useParams();
  const plan = useStudyPlan(workspaceId);

  return (
    <Page width="wide" className="py-page">
      <PageHeader
        title="What to do next"
        description="Ordered by what is due, then what you have started, then what you have not. Each line says why."
      />

      <Section>
        {plan.isPending ? (
          <LoadingState lines={4} label="Working out what is next" />
        ) : plan.isError ? (
          <ErrorState
            title="Could not build your plan"
            detail={plan.error.message}
            onRetry={() => void plan.refetch()}
          />
        ) : plan.data.allCaughtUp ? (
          <EmptyState
            icon={<CheckCircle2Icon />}
            title={EMPTY.plan.title}
            description={EMPTY.plan.description}
            action={
              <Button asChild variant="outline">
                <Link to={`/w/${workspaceId}/concepts`}>Look at the concept map</Link>
              </Button>
            }
          />
        ) : (
          <ul className="flex flex-col gap-base">
            {plan.data.entries.map((entry) => (
              <PlanRow key={entry.conceptId} workspaceId={workspaceId} entry={entry} />
            ))}
          </ul>
        )}
      </Section>
    </Page>
  );
}

function PlanRow({ workspaceId, entry }: { workspaceId: string; entry: PlanEntry }) {
  const navigate = useNavigate();
  const startSession = useStartSession(workspaceId);
  const startReview = useStartReview(workspaceId);
  const pending = startSession.isPending || startReview.isPending;

  function open() {
    const mutation = entry.action === 'review' ? startReview : startSession;
    mutation.mutate(entry.conceptId, {
      onSuccess: (session) =>
        navigate(`/w/${workspaceId}/concepts/${entry.conceptId}/session/${session.id}`),
    });
  }

  const label =
    entry.action === 'review'
      ? 'Re-check'
      : entry.action === 'check'
        ? 'Check'
        : entry.action === 'practice'
          ? 'Practise'
          : 'Learn';

  return (
    <li className="border-border flex flex-wrap items-start gap-base rounded-xl border p-gutter">
      <EvidenceDot state={entry.evidence} className="mt-2" />

      <div className="flex min-w-0 flex-1 flex-col gap-hairline">
        <Link
          to={`/w/${workspaceId}/concepts/${entry.conceptId}`}
          className="focus-visible:ring-ring rounded-sm font-serif text-lg leading-tight outline-none hover:underline focus-visible:ring-2"
        >
          {entry.conceptName}
        </Link>
        <p className="text-muted-foreground max-w-prose text-sm leading-relaxed">
          {entry.reason}
        </p>
        {entry.dueAt && (
          <p className="text-muted-foreground font-mono text-xs tabular-nums">
            due {entry.dueAt}
          </p>
        )}
      </div>

      <Button onClick={open} disabled={pending} className="shrink-0">
        {pending ? 'Opening…' : label}
      </Button>
    </li>
  );
}
