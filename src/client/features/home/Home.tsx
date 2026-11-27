import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRightIcon, CheckCircle2Icon, CircleIcon, GraduationCapIcon } from 'lucide-react';
import type { TutorDetail } from '@shared/contracts/tutor';
import type { PlannerView } from '../../../server/api-types';

import { ACTIVITY_LABEL, DueLabel, SESSION_STATUS_LABEL, formatRelativeInline } from '@/components/domain';
import { Page, PageHeader, Section } from '@/components/layout';
import { ErrorState, PageLoading } from '@/components/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CheckInPrompt, ShortList, courseName, timeOfDay, type ProgressData } from '@/features/progress/parts';
import { useAccount } from '@/lib/account';
import { errorMessage, request } from '@/lib/api';
import { useApi, useSeed } from '@/lib/data';
import { cn } from '@/lib/utils';

/**
 * Study the suggested topic with the tutor: a guided session that opens with a plan from what the
 * student has shown and offers each next step. The id is kept so a retry never makes two sessions.
 */
function GuidedStart({ courseId, topicId }: { courseId: string; topicId: string }) {
  const { user } = useAccount();
  const navigate = useNavigate();
  const seed = useSeed();
  const [id] = useState(() => crypto.randomUUID());
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const start = async () => {
    setBusy(true);
    setError('');
    try {
      const d = await request<TutorDetail>(
        `/v1/courses/${courseId}/tutor`,
        user.id,
        { id, guided: true, topicId },
        'POST',
      );
      seed(`/v1/tutor/${d.session.id}`, d);
      navigate(`/tutor/${d.session.id}`);
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  };
  return (
    <>
      {error && (
        <span className="text-danger-text text-sm" title={error}>
          Not started.
        </span>
      )}
      <Button size="lg" variant="secondary" loading={busy} onClick={() => void start()}>
        <GraduationCapIcon />
        {error ? 'Retry' : 'Study with the tutor'}
      </Button>
    </>
  );
}

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

/** A new workspace's first steps, shown until the learner has started. */
function SetupChecklist({ row }: { row: ProgressData }) {
  const firstCourse = row.courses.find(c => !c.archived);
  const planner = useApi<PlannerView>('/v1/planner');
  const materials = useApi<{ materials: unknown[] }>(
    firstCourse ? `/v1/courses/${firstCourse.id}/materials?limit=1&archived=all` : null,
  );
  const steps = [
    { done: !!firstCourse, title: 'Add a course', detail: 'A name is all it needs.', to: '/courses?new=1' },
    {
      done: row.topics.length > 0 || !!materials.data?.materials.length || !!firstCourse?.syllabusMaterialId,
      title: 'Add your syllabus or a first material',
      detail: 'Rawi works out the course outline from your documents.',
      to: firstCourse ? `/course/${firstCourse.id}` : '/courses?new=1',
    },
    {
      done: !!planner.data?.availability.windows.length,
      title: 'Set your study hours',
      detail: 'So the planner knows when you are free.',
      to: '/planner?availability=1',
    },
  ];
  if (steps.every(s => s.done)) return null;
  const next = steps.find(s => !s.done)!;
  return (
    <Section title="Get set up" description={`${steps.filter(s => s.done).length} of ${steps.length} done`}>
      <ol className="divide-y border-y">
        {steps.map(step => (
          <li key={step.title}>
            <Link
              to={step.to}
              className={cn(
                'hover:bg-surface flex items-center gap-snug py-2.5 outline-none focus-visible:bg-surface',
                step.done && 'text-muted-foreground',
              )}
            >
              {step.done ? (
                <CheckCircle2Icon className="text-success size-4 shrink-0" aria-label="Done" />
              ) : (
                <CircleIcon className="text-border-strong size-4 shrink-0" aria-label="Not done" />
              )}
              <span className="flex min-w-0 flex-1 flex-col">
                <span className={cn('text-base', step.done ? 'line-through decoration-1' : 'font-medium')}>
                  {step.title}
                </span>
                {!step.done && <span className="text-muted-foreground text-sm">{step.detail}</span>}
              </span>
              {step === next && <ArrowRightIcon className="text-muted-foreground size-4" aria-hidden />}
            </Link>
          </li>
        ))}
      </ol>
    </Section>
  );
}

/** Home: what to do next, today's plan, unfinished work and deadlines. */
export function Home() {
  const me = useAccount();
  const data = useApi<ProgressData>('/v1/progress');
  const first = me.user.name.split(/\s+/)[0];
  const header = (
    <PageHeader
      display
      title={`${greeting()}${first ? `, ${first}` : ''}`}
      description={
        data.data
          ? `${new Date(`${data.data.today}T12:00:00`).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}${data.data.streak ? ` · ${data.data.streak} day streak` : ''}`
          : undefined
      }
    />
  );
  if (data.isPending)
    return (
      <Page>
        {header}
        <PageLoading label="Loading your day" />
      </Page>
    );
  if (data.error)
    return (
      <Page>
        {header}
        <ErrorState error={data.error} onRetry={() => void data.refetch()} />
      </Page>
    );
  const row = data.data;
  const planned = row.sessions.filter(s => s.status === 'planned').sort((a, b) => a.startMinutes - b.startMinutes);
  const next = row.suggestions[0];
  const started = row.attempts.length > 0;
  return (
    <Page>
      {header}
      {!started && <SetupChecklist row={row} />}
      {next && (
        <section
          aria-labelledby="next-up"
          className="bg-card flex flex-col gap-snug rounded-lg border p-5 shadow-raised sm:flex-row sm:items-center sm:gap-gutter"
        >
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <h2 id="next-up" className="text-muted-foreground text-sm font-medium">
              Next up · {courseName(row, next.courseId)}
            </h2>
            <p className="text-lg font-semibold tracking-tight text-balance">{next.title}</p>
            <p className="text-muted-foreground text-base">{next.reason}</p>
          </div>
          <div className="flex flex-wrap items-center gap-snug sm:shrink-0 sm:flex-nowrap">
            <span className="text-muted-foreground tabular text-sm whitespace-nowrap">{next.minutes} min</span>
            {next.topicId && next.kind !== 'setup' && <GuidedStart courseId={next.courseId} topicId={next.topicId} />}
            <Button asChild size="lg">
              <Link to={next.to}>
                Start
                <ArrowRightIcon />
              </Link>
            </Button>
          </div>
        </section>
      )}
      <CheckInPrompt row={row} />
      <div className="grid gap-section lg:grid-cols-2">
        <Section
          title="Today"
          actions={
            <Button asChild variant="ghost" size="sm">
              <Link to="/planner">Planner</Link>
            </Button>
          }
        >
          <ShortList
            empty="Nothing planned for today."
            items={row.sessions
              .sort((a, b) => a.startMinutes - b.startMinutes)
              .map(s => ({
                key: s.id,
                to: `/planner?session=${s.id}`,
                title: s.title,
                meta: `${timeOfDay(s.startMinutes)} · ${s.durationMinutes} min · ${ACTIVITY_LABEL[s.activity]} · ${courseName(row, s.courseId)}`,
                trailing: s.status !== 'planned' ? <Badge>{SESSION_STATUS_LABEL[s.status]}</Badge> : undefined,
              }))}
          />
          {planned.length > 0 && <p className="text-muted-foreground text-sm">{planned.length} still to do.</p>}
        </Section>
        <Section title="Continue">
          <ShortList
            empty="No unfinished practice."
            items={row.runs.slice(0, 5).map(r => ({
              key: r.id,
              to: `/runs/${r.id}`,
              title: courseName(row, r.courseId),
              meta: `${r.title} · ${r.answered} of ${r.total} answered · started ${formatRelativeInline(r.startedAt)}`,
              trailing: <ArrowRightIcon className="text-muted-foreground size-4" aria-hidden />,
            }))}
          />
        </Section>
        <Section title="Upcoming deadlines">
          <ShortList
            empty="No assessments coming up."
            items={[...row.assessments]
              .sort((a, b) => a.date.localeCompare(b.date))
              .slice(0, 6)
              .map(a => ({
                key: a.id,
                to: `/course/${a.courseId}`,
                title: a.title,
                meta: courseName(row, a.courseId),
                trailing: <DueLabel date={a.date} />,
              }))}
          />
        </Section>
        {row.suggestions.length > 1 && (
          <Section title="Also worth doing">
            <ShortList
              empty=""
              items={row.suggestions.slice(1, 5).map(s => ({
                key: s.id,
                to: s.to,
                title: s.title,
                meta: `${courseName(row, s.courseId)} · ${s.minutes} min`,
              }))}
            />
          </Section>
        )}
      </div>
    </Page>
  );
}
