import { useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { TOOL_LABEL, type AgentRun, type AgentView, type StudyGoal } from '@shared/contracts/agent';
import { daysBetweenDates } from '@shared/domain/planner';
import type { PlannerView } from '../../../server/api-types';

import { Page, PageHeader, Section } from '@/components/layout';
import { EmptyState, ErrorState, PageLoading } from '@/components/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DateField } from '@/components/ui/date-field';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { useApi, useSave } from '@/lib/data';
import { keys, pathKey } from '@/lib/query';

const agentKey = pathKey('/v1/agent');
const usd = (micros: number) => `$${(micros / 1e6).toFixed(micros < 1e6 ? 4 : 2)}`;
const TRIGGER: Record<AgentRun['trigger'], string> = {
  schedule: 'On its own',
  session: 'After a study session',
  student: 'You asked',
};
const STATUS = {
  done: { label: 'Done', variant: 'success' },
  skipped: { label: 'Nothing to do', variant: 'neutral' },
  failed: { label: 'Did not finish', variant: 'danger' },
} as const;
const when = (iso: string) =>
  new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));

/** What Rawi did and why: the agent's goals, and every step it took with its reason, outcome and cost. */
export function Agent() {
  const view = useApi<AgentView>('/v1/agent');
  const planner = useApi<PlannerView>('/v1/planner');
  const save = useSave();
  if (view.isPending) return <PageLoading label="Loading what Rawi did" />;
  if (view.error) return <ErrorState error={view.error} onRetry={() => void view.refetch()} />;
  const { goals, runs, totals } = view.data;
  const courseName = (id: string | null) => planner.data?.courses.find(c => c.id === id)?.name ?? '';
  const checkNow = () =>
    save.run<{ started: boolean; view: AgentView }>(
      { path: '/v1/agent/run' },
      {
        id: `agent-run-${Date.now()}`,
        invalidate: [keys.planner, keys.notifications, keys.progress],
        onSuccess: r => {
          view.setData(r.view);
          if (!r.started) toast('Rawi looked less than a minute ago. The latest run is below.');
        },
      },
    );
  return (
    <Page width="narrow">
      <PageHeader
        title="What Rawi did and why"
        description="Rawi checks your courses on its own, decides what helps next and does it. Every step is listed here with its reason. Code makes each decision. AI writes questions when a step needs them, and the short note at the top of a run."
        actions={
          <Button onClick={checkNow} disabled={save.busy}>
            {save.busy ? 'Rawi is looking' : 'Check now'}
          </Button>
        }
      />
      {save.error && <p className="text-danger-text text-sm">{save.error}</p>}
      <Goals goals={goals} planner={planner.data} courseName={courseName} />
      <Section
        title="Runs"
        description={
          totals.runs
            ? `${totals.actions} ${totals.actions === 1 ? 'step' : 'steps'} in the last ${totals.runs} ${totals.runs === 1 ? 'run' : 'runs'}, ${totals.byCode} decided by code. AI cost ${usd(totals.costMicros)}.`
            : undefined
        }
      >
        {!runs.length ? (
          <EmptyState
            compact
            title="Rawi has not run yet"
            description="It runs every few hours, after each study session, and when you choose Check now."
          />
        ) : (
          <ol className="flex flex-col gap-base">
            {runs.map(r => (
              <RunCard key={r.id} run={r} courseName={courseName} />
            ))}
          </ol>
        )}
      </Section>
    </Page>
  );
}

function RunCard({ run, courseName }: { run: AgentRun; courseName: (id: string | null) => string }) {
  const [open, setOpen] = useState(false);
  const shown = open ? run.actions : run.actions.filter(a => a.status !== 'skipped');
  const hidden = run.actions.length - shown.length;
  return (
    <li className="bg-card flex flex-col gap-snug rounded-lg border p-base">
      <div className="text-muted-foreground flex flex-wrap items-center gap-x-2 text-sm">
        <span>{when(run.startedAt)}</span>
        <span aria-hidden>·</span>
        <span>{TRIGGER[run.trigger]}</span>
        {run.state === 'failed' && <Badge variant="danger">Stopped early</Badge>}
        {run.state === 'running' && <Badge variant="accent">Running</Badge>}
      </div>
      {run.summary && (
        <p className="text-base">
          {run.summary}
          {run.summaryBy === 'model' && (
            <span className="text-muted-foreground text-sm"> Written by AI from the steps below.</span>
          )}
        </p>
      )}
      {run.observation && (
        <p className="text-muted-foreground text-sm">
          Looked at{' '}
          {run.observation.courses
            .map(c =>
              [
                c.name,
                c.goal ? `${c.goal}${c.daysToGoal !== null ? ` in ${c.daysToGoal} days` : ''}` : '',
                c.shaky ? `${c.shaky} shaky` : '',
                c.due ? `${c.due} due` : '',
                c.languageSupported ? `${c.languageSupported} with language support` : '',
              ]
                .filter(Boolean)
                .join(', '),
            )
            .join('. ')}
          .
        </p>
      )}
      {shown.length > 0 && (
        <ul className="divide-y border-y">
          {shown.map(a => (
            <li key={a.id} className="flex flex-col gap-1 py-2.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{TOOL_LABEL[a.tool]}</span>
                <Badge variant={STATUS[a.status].variant}>{STATUS[a.status].label}</Badge>
                {a.courseId && <span className="text-muted-foreground text-sm">{courseName(a.courseId)}</span>}
                {a.costMicros > 0 && <span className="text-muted-foreground text-sm">{usd(a.costMicros)}</span>}
              </div>
              <p className="text-sm">
                <span className="text-muted-foreground">Why: </span>
                {a.reason}
              </p>
              <p className="text-sm">
                <span className="text-muted-foreground">Result: </span>
                {a.outcome}
              </p>
            </li>
          ))}
        </ul>
      )}
      {hidden > 0 && (
        <Button variant="link" className="self-start" onClick={() => setOpen(true)}>
          Show {hidden} {hidden === 1 ? 'step' : 'steps'} with nothing to do
        </Button>
      )}
    </li>
  );
}

function Goals({
  goals,
  planner,
  courseName,
}: {
  goals: StudyGoal[];
  planner: PlannerView | undefined;
  courseName: (id: string | null) => string;
}) {
  const save = useSave();
  const [adding, setAdding] = useState(false);
  const active = goals.filter(g => g.status === 'active');
  const setStatus = (g: StudyGoal, status: StudyGoal['status']) =>
    save.run(
      { path: `/v1/goals/${g.id}`, method: 'PATCH', body: { operationId: crypto.randomUUID(), status } },
      { id: `goal-${g.id}-${status}`, invalidate: [agentKey] },
    );
  const today = planner?.today;
  return (
    <Section
      title="Goals"
      description="What Rawi plans toward. Dated assessments from your syllabus become goals on their own."
      actions={
        !adding && (
          <Button variant="secondary" onClick={() => setAdding(true)} disabled={!planner}>
            Add a goal
          </Button>
        )
      }
    >
      {adding && planner && <GoalForm planner={planner} onDone={() => setAdding(false)} />}
      {!active.length ? (
        !adding && (
          <EmptyState
            compact
            title="No goals yet"
            description="Add one, such as a midterm and its date, or add assessments to a course syllabus."
          />
        )
      ) : (
        <ul className="divide-y border-y">
          {active.map(g => (
            <li key={g.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
              <div className="flex min-w-0 flex-col">
                <span className="font-medium">{g.title}</span>
                <span className="text-muted-foreground text-sm">
                  <Link className="hover:underline" to={`/course/${g.courseId}`}>
                    {courseName(g.courseId)}
                  </Link>
                  {g.date && `, ${g.date}${today ? `, ${daysLeft(daysBetweenDates(today, g.date))}` : ''}`}
                  {g.source === 'syllabus' && ', from the syllabus'}
                </span>
              </div>
              <div className="flex gap-tight">
                <Button size="sm" variant="ghost" disabled={save.busy} onClick={() => setStatus(g, 'done')}>
                  Mark done
                </Button>
                <Button size="sm" variant="ghost" disabled={save.busy} onClick={() => setStatus(g, 'dropped')}>
                  Drop
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {save.error && <p className="text-danger-text text-sm">{save.error}</p>}
    </Section>
  );
}
const daysLeft = (n: number) => (n === 0 ? 'today' : n === 1 ? 'tomorrow' : n < 0 ? 'passed' : `${n} days left`);

function GoalForm({ planner, onDone }: { planner: PlannerView; onDone: () => void }) {
  const save = useSave();
  const courses = planner.courses.filter(c => !c.archived);
  const [courseId, setCourseId] = useState(courses[0]?.id ?? '');
  const [assessmentId, setAssessmentId] = useState('');
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const assessments = planner.assessments.filter(a => a.courseId === courseId && (!a.date || a.date >= planner.today));
  const pick = (id: string) => {
    setAssessmentId(id);
    const a = assessments.find(x => x.id === id);
    if (a) {
      setTitle(a.title);
      setDate(a.date ?? '');
    }
  };
  if (!courses.length) return <p className="text-muted-foreground">Add a course first.</p>;
  return (
    <form
      className="bg-card flex flex-col gap-snug rounded-lg border p-base"
      onSubmit={e => {
        e.preventDefault();
        save.run(
          {
            path: `/v1/courses/${courseId}/goals`,
            body: {
              operationId: crypto.randomUUID(),
              title: title.trim(),
              date: date || null,
              assessmentId: assessmentId || null,
            },
          },
          { id: `goal-new-${courseId}-${assessmentId}-${title}`, invalidate: [agentKey], onSuccess: onDone },
        );
      }}
    >
      <Field label="Course">
        <Select
          value={courseId}
          onValueChange={v => {
            setCourseId(v);
            setAssessmentId('');
          }}
          options={courses.map(c => ({ value: c.id, label: c.name }))}
        />
      </Field>
      {assessments.length > 0 && (
        <Field label="Assessment" description="Optional. Rawi then works on what the assessment covers.">
          <Select
            value={assessmentId}
            onValueChange={pick}
            options={[
              { value: '', label: 'The whole course' },
              ...assessments.map(a => ({ value: a.id, label: a.title })),
            ]}
          />
        </Field>
      )}
      <Field label="Goal">
        <Input value={title} maxLength={120} placeholder="Midterm" onChange={e => setTitle(e.target.value)} />
      </Field>
      <Field label="Date" description="Optional. Rawi counts down to it.">
        <DateField value={date} onValueChange={setDate} />
      </Field>
      {save.error && <p className="text-danger-text text-sm">{save.error}</p>}
      <div className="flex gap-tight">
        <Button type="submit" disabled={!title.trim() || save.busy}>
          Save goal
        </Button>
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
