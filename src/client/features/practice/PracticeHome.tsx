import { useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowRightIcon, PlayIcon } from 'lucide-react';
import type { LearningAttempt, LearningRun, LearningSet } from '@shared/contracts/learning';
import type { OutlineView, ScopeSummary, ScopeView } from '@shared/contracts/outline';
import type { ActivityType } from '@shared/domain/types';
import { ACTIVITY_FORMATS } from '@shared/domain/question-selection';

import { formatDate, formatRelative } from '@/components/domain';
import { Page, PageHeader, Section } from '@/components/layout';
import { EmptyState, ErrorState, Notice } from '@/components/states';
import { Button } from '@/components/ui/button';
import { CheckboxRow } from '@/components/ui/checkbox';
import { Combobox } from '@/components/ui/combobox';
import { Field, FieldError, FieldSet } from '@/components/ui/field';
import { List, ListLoading, ListRow } from '@/components/ui/list';
import { NumberField } from '@/components/ui/number-field';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { Table, TableBody, TableCell, TableEmpty, TableHead, TableHeader, TableLoading, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAccount } from '@/lib/account';
import { errorMessage, request } from '@/lib/api';
import { useApi, useApiPages } from '@/lib/data';
import type { AiStatusView } from '../../../server/api-types';

const ACTIVITIES: { value: ActivityType; label: string; description: string }[] = [
  { value: 'quiz', label: 'Quiz', description: 'Multiple choice, numbers, fill in the blank, ordering and matching, marked as you go.' },
  { value: 'flashcards', label: 'Flashcards', description: 'Terms and formulas. You rate your own recall.' },
  { value: 'self-check', label: 'Self-check', description: 'Explain in your own words, then compare with a model answer and mark it yourself.' },
];

/**
 * Practice: continue an unfinished run, or practise a scope now. A scope is a topic, an assessment,
 * the whole course or a saved selection. Questions come from your own bank, unseen ones first, and
 * any that have to be written join the run as soon as they pass their checks.
 */
export function Practice() {
  const { id = '' } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { user, preferences } = useAccount();
  const planned = params.get('plannedSessionId');
  const outline = useApi<OutlineView>(`/v1/courses/${id}/outline`);
  const saved = useApi<{ scopes: ScopeSummary[] }>(`/v1/courses/${id}/scopes`);
  const status = useApi<AiStatusView>('/v1/ai/status');
  const runs = useApiPages<{ id: string; title: string; startedAt: string }, 'runs'>(`/v1/courses/${id}/runs?limit=100`, 'runs');
  const [scope, setScope] = useState(params.get('scopeId') ? `scope:${params.get('scopeId')}` : params.get('topicId') ? `topic:${params.get('topicId')}` : params.get('materialId') ? `material:${params.get('materialId')}` : 'course');
  const [activities, setActivities] = useState<ActivityType[]>(['quiz']);
  const [count, setCount] = useState<number | null>(preferences.values.questionCount);
  const [starting, setStarting] = useState(false), [error, setError] = useState('');
  // The ids survive a failed attempt, so a retry never starts a second run.
  const pendingStart = useRef<{ operationId: string; runId: string } | null>(null);
  const topics = outline.data?.topics ?? [];
  const assessments = outline.data?.assessments ?? [];
  const selections = (saved.data?.scopes ?? []).filter(s => s.kind === 'sections');
  const options = [
    { value: 'course', label: 'Whole course' },
    ...topics.map(t => ({ value: `topic:${t.id}`, label: `Topic: ${t.title}` })),
    ...assessments.map(a => ({ value: `assessment:${a.id}`, label: `Assessment: ${a.title}` })),
    ...selections.map(s => ({ value: `scope:${s.id}`, label: `Selection: ${s.name}` })),
    ...(scope.startsWith('material:') ? [{ value: scope, label: 'This material' }] : []),
  ];
  const formats = [...new Set(activities.flatMap(a => ACTIVITY_FORMATS[a]))];
  const writes = activities.some(a => a !== 'flashcards');
  const start = async () => {
    setStarting(true); setError('');
    try {
      const [kind, value] = scope.split(':');
      const body = kind === 'course' ? { kind: 'course' } : kind === 'topic' ? { kind: 'topic', topicId: value } : kind === 'assessment' ? { kind: 'assessment', assessmentId: value } : kind === 'material' ? { kind: 'material', materialId: value } : null;
      const scopeId = body ? (await request<ScopeView>(`/v1/courses/${id}/scopes`, user.id, body, 'POST')).id : value!;
      pendingStart.current ??= { operationId: crypto.randomUUID(), runId: crypto.randomUUID() };
      const run = await request<LearningRun>(`/v1/courses/${id}/practice`, user.id, { ...pendingStart.current, scopeId, formats, count: count ?? 10, ...(planned ? { plannedSessionId: planned } : {}) }, 'POST');
      pendingStart.current = null;
      navigate(`/runs/${run.id}`);
    } catch (e) { setError(errorMessage(e)); setStarting(false); }
  };
  const toggle = (activity: ActivityType, on: boolean) => { pendingStart.current = null; setActivities(list => on ? [...list, activity] : list.filter(a => a !== activity)); };
  return (
    <Page>
      <PageHeader title="Practice" />
      {runs.items && runs.items.length > 0 && (
        <Section title="Continue">
          <List>{runs.items.map(r => <ListRow key={r.id} to={`/runs/${r.id}`} title={r.title} meta={`Started ${formatRelative(r.startedAt)}`} trailing={<ArrowRightIcon className="size-4" aria-hidden />} />)}</List>
        </Section>
      )}
      <section aria-labelledby="practise" className="bg-card flex flex-col gap-base rounded-lg border p-5 shadow-raised">
        <div>
          <h2 id="practise" className="text-md font-semibold">Practise</h2>
          <p className="text-muted-foreground text-base">Questions you have not seen come first. Ones you missed come back a day later.</p>
        </div>
        {outline.error ? <ErrorState error={outline.error} onRetry={() => void outline.refetch()} /> : (
          <fieldset disabled={starting} className="flex flex-col gap-base">
            <Field label="What to practise" className="max-w-md"><Combobox value={scope} onValueChange={v => { pendingStart.current = null; setScope(v); }} options={options} placeholder="Choose a scope" /></Field>
            <FieldSet legend="Kinds of question">
              {ACTIVITIES.map(a => <CheckboxRow key={a.value} label={a.label} description={a.description} checked={activities.includes(a.value)} onCheckedChange={c => toggle(a.value, c === true)} />)}
            </FieldSet>
            <Field label="Questions" description="Between 1 and 30." className="w-40"><NumberField value={count} onValueChange={n => { pendingStart.current = null; setCount(n); }} min={1} max={30} /></Field>
          </fieldset>
        )}
        {writes && status.data && !status.data.available && <Notice>{status.data.reason} Questions built straight from your material are still available.</Notice>}
        <div className="flex flex-wrap items-center gap-snug">
          <Button size="lg" loading={starting} disabled={!activities.length || !count || outline.isPending} onClick={() => void start()}><PlayIcon />{error ? 'Retry' : 'Start'}</Button>
          {error && <FieldError>{error}</FieldError>}
        </div>
      </section>
      <Tabs defaultValue="history">
        <TabsList><TabsTrigger value="history">History</TabsTrigger><TabsTrigger value="sets">Saved sets</TabsTrigger></TabsList>
        <TabsContent value="history"><History courseId={id} /></TabsContent>
        <TabsContent value="sets"><SavedSets courseId={id} planned={planned} /></TabsContent>
      </Tabs>
    </Page>
  );
}

function SavedSets({ courseId, planned }: { courseId: string; planned: string | null }) {
  const [status, setStatus] = useState<'false' | 'true'>('false');
  const sets = useApiPages<LearningSet, 'sets'>(`/v1/courses/${courseId}/sets?archived=${status}`, 'sets');
  return (
    <div className="flex flex-col gap-snug">
      <SegmentedControl aria-label="Set status" value={status} onValueChange={setStatus} options={[{ value: 'false', label: 'Active' }, { value: 'true', label: 'Archived' }]} />
      {sets.error ? <ErrorState error={sets.error} onRetry={() => void sets.refetch()} /> : sets.isPending ? <ListLoading rows={3} /> :
        !sets.items?.length ? <EmptyState compact title={status === 'true' ? 'No archived sets' : 'No saved sets yet'} description={status === 'true' ? undefined : 'Every practice is kept as a set you can run again with the same questions.'} /> : (
          <List>
            {sets.items.map(s => <ListRow key={s.id} to={`/sets/${s.id}${planned ? `?plannedSessionId=${planned}` : ''}`} title={s.name}
              meta={`${s.feedback === 'immediate' ? 'Feedback after each answer' : 'Feedback at the end'}${s.hintsAllowed ? ' · Hints allowed' : ''}`} trailing={<ArrowRightIcon className="size-4" aria-hidden />} />)}
          </List>
        )}
      {sets.hasNextPage && <Button variant="secondary" className="self-start" loading={sets.isFetchingNextPage} onClick={() => void sets.fetchNextPage()}>Load more</Button>}
    </div>
  );
}

function History({ courseId }: { courseId: string }) {
  const navigate = useNavigate();
  const attempts = useApiPages<LearningAttempt, 'attempts'>(`/v1/courses/${courseId}/attempts?limit=50`, 'attempts');
  if (attempts.error) return <ErrorState error={attempts.error} onRetry={() => void attempts.refetch()} />;
  return (
    <div className="flex flex-col gap-snug">
      <Table>
        <TableHeader><TableRow><TableHead className="w-28">Date</TableHead><TableHead>Set</TableHead><TableHead className="w-20 text-right">Score</TableHead></TableRow></TableHeader>
        <TableBody>
          {attempts.isPending && <TableLoading colSpan={3} />}
          {!attempts.isPending && !attempts.items?.length && <TableEmpty colSpan={3}>Finished practice appears here.</TableEmpty>}
          {attempts.items?.map(a => (
            <TableRow key={a.id} onClick={() => navigate(`/attempts/${a.id}`)}>
              <TableCell className="text-muted-foreground tabular text-sm whitespace-nowrap">{formatDate(a.completedAt)}</TableCell>
              <TableCell className="max-w-0"><Link to={`/attempts/${a.id}`} onClick={e => e.stopPropagation()} className="block truncate font-medium hover:underline">{a.title}</Link>{a.exam && <span className="text-muted-foreground text-sm">Exam rehearsal</span>}</TableCell>
              <TableCell className="tabular text-right">{a.marksAvailable ? `${a.marksAwarded}/${a.marksAvailable}` : '—'}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {attempts.hasNextPage && <Button variant="secondary" className="self-start" loading={attempts.isFetchingNextPage} onClick={() => void attempts.fetchNextPage()}>Load more</Button>}
    </div>
  );
}
