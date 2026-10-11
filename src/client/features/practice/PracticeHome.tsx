import { useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { z } from 'zod';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowRightIcon, PlayIcon, SlidersHorizontalIcon, SparklesIcon } from 'lucide-react';
import { createSetInput, formats, type LearningAttempt, type LearningRun, type LearningSet, type VersionedQuestion } from '@shared/contracts/learning';
import type { Material } from '@shared/contracts/materials';
import type { Difficulty, QuestionFormat } from '@shared/domain/types';
import { selectQuestions } from '@shared/domain/question-selection';

import { DIFFICULTY_LABEL, FORMAT_LABEL, formatDate, formatRelative } from '@/components/domain';
import { Page, PageHeader, Section } from '@/components/layout';
import { EmptyState, ErrorState, Notice } from '@/components/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Combobox } from '@/components/ui/combobox';
import { Field, FieldError } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { List, ListLoading, ListRow } from '@/components/ui/list';
import { NumberField } from '@/components/ui/number-field';
import { RadioCards } from '@/components/ui/radio-group';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { Select } from '@/components/ui/select';
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableEmpty, TableHead, TableHeader, TableLoading, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAccount } from '@/lib/account';
import { request, errorMessage } from '@/lib/api';
import { useApi, useApiAll, useApiPages, useSave } from '@/lib/data';
import { UNCERTAIN } from '../ai/AiOperation';
import type { AiStatusView } from '../../../server/api-types';
import { useUnsentGuard } from '@/lib/hooks';
import { activityKeys, keys } from '@/lib/query';

type Filters = { format: string; topic: string; difficulty: string; material: string; versionId: string };
const matches = (q: VersionedQuestion, f: Filters) =>
  (!f.format || q.format === f.format) && (!f.topic || q.topicId === f.topic) && (!f.difficulty || q.difficulty === f.difficulty) &&
  (!f.material || q.source?.materialId === f.material) && (!f.versionId || q.source?.versionId === f.versionId);

/**
 * Practice: continue an unfinished run, start a quick set in one click, then
 * saved sets and history in tabs. A custom set is built in a sheet.
 */
export function Practice() {
  const { id = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const { user, preferences } = useAccount();
  const qc = useQueryClient();
  const planned = params.get('plannedSessionId');
  const bank = useApiAll<VersionedQuestion>(`/v1/courses/${id}/questions?limit=100`, 'questions');
  const runs = useApiPages<{ id: string; title: string; startedAt: string }, 'runs'>(`/v1/courses/${id}/runs?limit=100`, 'runs');
  const [topic, setTopic] = useState(params.get('topicId') ?? '');
  const [building, setBuilding] = useState(!!params.get('materialId'));
  const [generating, setGenerating] = useState(false);
  const [starting, setStarting] = useState(false), [startError, setStartError] = useState('');
  const fromMaterial = params.get('materialId') ?? '';
  const topics = useMemo(() => [...new Map(bank.data?.flatMap(q => q.topicId ? [[q.topicId, q.topicLabel ?? 'Topic'] as const] : []) ?? []).entries()].map(([value, label]) => ({ value, label })), [bank.data]);
  const pool = bank.data?.filter(q => !topic || q.topicId === topic) ?? [];
  const count = Math.min(preferences.values.questionCount, pool.length);
  // Two steps: save a set from the bank, then start it. Both keep their ids
  // until they succeed, so a retry cannot create a second set or run.
  const quick = useRef<{ set: z.infer<typeof createSetInput>; saved?: LearningSet; runId: string } | null>(null);
  const quickStart = async () => {
    setStarting(true); setStartError('');
    try {
      const label = topic ? topics.find(t => t.value === topic)?.label : null;
      quick.current ??= { runId: crypto.randomUUID(), set: createSetInput.parse({ id: crypto.randomUUID(), name: `Quick practice${label ? `: ${label}` : ''}, ${new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`.slice(0, 200), questionIds: selectQuestions(pool, {}, count).map(q => q.id), feedback: preferences.values.feedback, hintsAllowed: preferences.values.hints }) };
      const task = quick.current;
      task.saved ??= await request<LearningSet>(`/v1/courses/${id}/sets`, user.id, task.set, 'POST');
      const run = await request<LearningRun>(`/v1/sets/${task.saved.id}/runs`, user.id, { id: task.runId, ...(planned ? { plannedSessionId: planned } : {}) }, 'POST');
      quick.current = null;
      void qc.invalidateQueries({ queryKey: keys.course(id).sets });
      navigate(`/runs/${run.id}`);
    } catch (e) { setStartError(errorMessage(e)); setStarting(false); }
  };
  return (
    <Page>
      <PageHeader title="Practice" actions={<>
        <Button variant="secondary" onClick={() => setGenerating(true)}><SparklesIcon />Generate questions</Button>
        <Button variant="secondary" onClick={() => setBuilding(true)}><SlidersHorizontalIcon />Build a custom set</Button>
      </>} />
      <GenerateSheet courseId={id} open={generating} onOpenChange={setGenerating} />
      {runs.items && runs.items.length > 0 && (
        <Section title="Continue">
          <List>{runs.items.map(r => <ListRow key={r.id} to={`/runs/${r.id}`} title={r.title} meta={`Started ${formatRelative(r.startedAt)}`} trailing={<ArrowRightIcon className="size-4" aria-hidden />} />)}</List>
        </Section>
      )}
      <section aria-labelledby="quick-start" className="bg-card flex flex-col gap-snug rounded-lg border p-5 shadow-raised">
        <div>
          <h2 id="quick-start" className="text-md font-semibold">Quick start</h2>
          <p className="text-muted-foreground text-base">{preferences.values.questionCount} questions, {preferences.values.feedback === 'immediate' ? 'feedback after each answer' : 'feedback at the end'}{preferences.values.hints ? ', hints allowed' : ''}. Change the defaults in Settings.</p>
        </div>
        {bank.error ? <ErrorState error={bank.error} onRetry={() => void bank.refetch()} /> : bank.data?.length === 0 ? (
          <Notice>Your question bank for this course is empty. <button type="button" className="underline underline-offset-2" onClick={() => setGenerating(true)}>Generate questions</button> from a topic or material.</Notice>
        ) : (
          <div className="flex flex-wrap items-end gap-snug">
            <Field label="Topic" className="w-72 max-w-full">
              <Combobox value={topic} onValueChange={v => { setTopic(v); quick.current = null; }} disabled={!bank.data || starting} placeholder="All topics" options={[{ value: '', label: 'All topics' }, ...topics]} />
            </Field>
            <Button size="lg" loading={starting || bank.isPending} disabled={!count} onClick={() => void quickStart()}><PlayIcon />{startError ? 'Retry' : `Start ${count || ''} questions`}</Button>
          </div>
        )}
        {startError && <FieldError>{startError}</FieldError>}
      </section>
      <Tabs defaultValue="sets">
        <TabsList><TabsTrigger value="sets">Saved sets</TabsTrigger><TabsTrigger value="history">History</TabsTrigger></TabsList>
        <TabsContent value="sets"><SavedSets courseId={id} planned={planned} onBuild={() => setBuilding(true)} /></TabsContent>
        <TabsContent value="history"><History courseId={id} /></TabsContent>
      </Tabs>
      <BuildSheet courseId={id} bank={bank.data} open={building} planned={planned}
        initial={{ format: '', topic: params.get('topicId') ?? '', difficulty: '', material: fromMaterial, versionId: params.get('versionId') ?? '' }}
        onOpenChange={open => { setBuilding(open); if (!open && fromMaterial) { const next = new URLSearchParams(params); next.delete('materialId'); next.delete('versionId'); setParams(next, { replace: true }); } }} />
    </Page>
  );
}

function SavedSets({ courseId, planned, onBuild }: { courseId: string; planned: string | null; onBuild: () => void }) {
  const [status, setStatus] = useState<'false' | 'true'>('false');
  const sets = useApiPages<LearningSet, 'sets'>(`/v1/courses/${courseId}/sets?archived=${status}`, 'sets');
  return (
    <div className="flex flex-col gap-snug">
      <SegmentedControl aria-label="Set status" value={status} onValueChange={setStatus} options={[{ value: 'false', label: 'Active' }, { value: 'true', label: 'Archived' }]} />
      {sets.error ? <ErrorState error={sets.error} onRetry={() => void sets.refetch()} /> : sets.isPending ? <ListLoading rows={3} /> :
        !sets.items?.length ? <EmptyState compact title={status === 'true' ? 'No archived sets' : 'No saved sets yet'} description={status === 'true' ? undefined : 'Save a set to repeat the same questions later.'} action={status === 'false' ? <Button variant="secondary" onClick={onBuild}>Build a custom set</Button> : undefined} /> : (
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
        <TableHeader><TableRow><TableHead className="w-28">Date</TableHead><TableHead>Set</TableHead><TableHead className="w-20 text-right">Score</TableHead><TableHead className="hidden w-32 sm:table-cell">Pending</TableHead></TableRow></TableHeader>
        <TableBody>
          {attempts.isPending && <TableLoading colSpan={4} />}
          {!attempts.isPending && !attempts.items?.length && <TableEmpty colSpan={4}>Finished practice appears here.</TableEmpty>}
          {attempts.items?.map(a => (
            <TableRow key={a.id} onClick={() => navigate(`/attempts/${a.id}`)}>
              <TableCell className="text-muted-foreground tabular text-sm whitespace-nowrap">{formatDate(a.completedAt)}</TableCell>
              <TableCell className="max-w-0"><Link to={`/attempts/${a.id}`} onClick={e => e.stopPropagation()} className="block truncate font-medium hover:underline">{a.title}</Link>{a.exam && <span className="text-muted-foreground text-sm">Exam rehearsal</span>}</TableCell>
              <TableCell className="tabular text-right">{a.marksAvailable ? `${a.marksAwarded}/${a.marksAvailable}` : '—'}</TableCell>
              <TableCell className="hidden sm:table-cell">{a.pending > 0 ? <Badge>{a.pending} awaiting feedback</Badge> : <span className="text-muted-foreground text-sm">None</span>}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {attempts.hasNextPage && <Button variant="secondary" className="self-start" loading={attempts.isFetchingNextPage} onClick={() => void attempts.fetchNextPage()}>Load more</Button>}
    </div>
  );
}

/** Build a custom set: filters with a live count of matching questions. */
function BuildSheet({ courseId, bank, open, onOpenChange, initial, planned }: { courseId: string; bank: VersionedQuestion[] | undefined; open: boolean; onOpenChange: (open: boolean) => void; initial: Filters; planned: string | null }) {
  const navigate = useNavigate();
  const { preferences } = useAccount();
  const materials = useApiAll<Material>(open ? `/v1/courses/${courseId}/materials?limit=50&archived=all` : null, 'materials');
  const [filters, setFilters] = useState<Filters>(initial);
  const [name, setName] = useState('');
  const [count, setCount] = useState<number | null>(preferences.values.questionCount);
  const [feedback, setFeedback] = useState(preferences.values.feedback);
  const [hints, setHints] = useState(preferences.values.hints);
  const [body, setBody] = useState<unknown>(null);
  const save = useSave();
  const allow = useUnsentGuard(open && !!name || save.pending);
  const pool = bank?.filter(q => matches(q, filters)) ?? [];
  const topics = [...new Map(bank?.flatMap(q => q.topicId ? [[q.topicId, q.topicLabel ?? 'Topic'] as const] : []) ?? []).entries()].map(([value, label]) => ({ value, label }));
  const sources = [...new Set(bank?.flatMap(q => q.source ? [q.source.materialId] : []) ?? [])].map(value => ({ value, label: materials.data?.find(m => m.id === value)?.title ?? 'Saved material' }));
  const set = (patch: Partial<Filters>) => { setFilters(f => ({ ...f, ...patch })); setBody(null); save.discard(); };
  const submit = () => {
    const parsed = body ? { success: true as const, data: body } : createSetInput.safeParse({ id: crypto.randomUUID(), name, questionIds: selectQuestions(pool, {}, count ?? 1).map(q => q.id), feedback, hintsAllowed: hints });
    if (!parsed.success) return;
    setBody(parsed.data);
    save.run<LearningSet>({ path: `/v1/courses/${courseId}/sets`, body: parsed.data }, {
      id: 'build-set', invalidate: [keys.course(courseId).sets, ...activityKeys],
      onSuccess: saved => { allow(); setBody(null); setName(''); onOpenChange(false); navigate(`/sets/${saved.id}${planned ? `?plannedSessionId=${planned}` : ''}`); },
    });
  };
  return (
    <Sheet open={open} onOpenChange={next => { if (!save.busy) onOpenChange(next); }}>
      <SheetContent size="lg">
        <SheetHeader>
          <SheetTitle>Build a custom set</SheetTitle>
          <SheetDescription>Choose questions from this course's bank. Saved sets keep the same questions every time.</SheetDescription>
        </SheetHeader>
        <SheetBody>
          <fieldset disabled={save.busy || !!body} className="flex flex-col gap-base">
            <div className="grid gap-base sm:grid-cols-2">
              <Field label="Topic"><Combobox value={filters.topic} onValueChange={topic => set({ topic })} placeholder="All topics" options={[{ value: '', label: 'All topics' }, ...topics]} /></Field>
              <Field label="Format"><Select value={filters.format} onValueChange={format => set({ format })} options={[{ value: '', label: 'All formats' }, ...formats.map(f => ({ value: f, label: FORMAT_LABEL[f as QuestionFormat] }))]} /></Field>
              <Field label="Source material"><Combobox value={filters.material} onValueChange={material => set({ material, versionId: '' })} placeholder="All materials" options={[{ value: '', label: 'All materials' }, ...sources]} /></Field>
              <Field label="Difficulty">
                <SegmentedControl aria-label="Difficulty" value={filters.difficulty || 'all'} onValueChange={d => set({ difficulty: d === 'all' ? '' : d })}
                  options={[{ value: 'all', label: 'All' }, ...(['recall', 'reasoning', 'stretch'] as Difficulty[]).map(d => ({ value: d, label: DIFFICULTY_LABEL[d] }))]} />
              </Field>
            </div>
            {filters.versionId && <p className="text-muted-foreground text-sm">Only questions from the version of the material you were reading. <button type="button" className="underline" onClick={() => set({ versionId: '' })}>Include all versions</button></p>}
            <p className="text-base" aria-live="polite">{bank ? <><span className="tabular font-semibold">{pool.length}</span> matching {pool.length === 1 ? 'question' : 'questions'}</> : 'Counting questions'}</p>
            <div className="grid gap-base border-t pt-base sm:grid-cols-2">
              <Field label="Set name" required><Input maxLength={200} value={name} onChange={e => setName(e.target.value)} placeholder="Week 3 review" /></Field>
              <Field label="Questions" description={pool.length ? `Up to ${Math.min(50, pool.length)}.` : undefined}><NumberField value={count} onValueChange={setCount} min={1} max={Math.max(1, Math.min(50, pool.length))} /></Field>
            </div>
            <Field label="Feedback">
              <RadioCards aria-label="Feedback" value={feedback} onValueChange={setFeedback} options={[{ value: 'immediate', label: 'After each answer', description: 'Check as you go.' }, { value: 'end', label: 'At the end', description: 'Answer everything first.' }]} />
            </Field>
            <Field layout="row" label="Allow hints" description="Hinted answers count as assisted work."><Switch checked={hints} onCheckedChange={setHints} /></Field>
          </fieldset>
          {save.error && <FieldError>{save.error}</FieldError>}
        </SheetBody>
        <SheetFooter>
          {body && !save.busy ? <Button variant="ghost" onClick={() => { setBody(null); save.discard(); }}>Edit again</Button> : null}
          <Button variant="secondary" disabled={save.busy} onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button loading={save.busy} disabled={!name.trim() || !pool.length || !count} onClick={submit}>{save.status === 'failed' ? 'Retry' : 'Save set'}</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

/**
 * Generate a practice set from materials or a topic. Questions are written from what Rawi read in
 * the material, checked against their source, and saved as a set.
 */
function GenerateSheet({ courseId, open, onOpenChange }: { courseId: string; open: boolean; onOpenChange: (open: boolean) => void }) {
  const navigate = useNavigate();
  const materials = useApiAll<Material>(open ? `/v1/courses/${courseId}/materials?limit=50` : null, 'materials');
  const outline = useApi<{ topics: { id: string; title: string }[] }>(open ? `/v1/courses/${courseId}/topics` : null);
  const status = useApi<AiStatusView>(open ? '/v1/ai/status' : null);
  const [from, setFrom] = useState('');
  const [format, setFormat] = useState('multiple-choice');
  const [difficulty, setDifficulty] = useState('mixed');
  const [count, setCount] = useState<number | null>(5);
  const [name, setName] = useState('');
  const save = useSave();
  const options = [
    ...(outline.data?.topics ?? []).map(t => ({ value: `topic:${t.id}`, label: `Topic: ${t.title}` })),
    ...(materials.data ?? []).filter(m => m.kind !== 'syllabus' && m.status !== 'failed').map(m => ({ value: `material:${m.id}`, label: `Material: ${m.title}` })),
  ];
  const chosen = options.find(o => o.value === from);
  const submit = () => {
    if (UNCERTAIN.includes(save.code)) save.discard();
    const [kind, value] = from.split(':');
    const body = {
      // Each click is a new request. A failed one saved no set, so there is nothing to resume.
      operationId: crypto.randomUUID(), name: name.trim() || chosen?.label.replace(/^(Topic|Material): /, '') || 'Generated set', format, count: count ?? 5,
      topicIds: kind === 'topic' ? [value] : [], materialIds: kind === 'material' ? [value] : [],
      difficulties: difficulty === 'mixed' ? ['recall', 'reasoning', 'stretch'] : [difficulty],
    };
    save.run<{ setId: string }>({ path: `/v1/courses/${courseId}/generate`, body }, {
      id: 'generate', invalidate: [keys.course(courseId).sets, ...activityKeys],
      onSuccess: result => { onOpenChange(false); navigate(`/sets/${result.setId}`); },
    });
  };
  return (
    <Sheet open={open} onOpenChange={next => { if (!save.busy) onOpenChange(next); }}>
      <SheetContent size="lg">
        <SheetHeader>
          <SheetTitle>Generate questions</SheetTitle>
          <SheetDescription>Rawi writes questions from your material, checks each answer against its source, and saves them as a set.</SheetDescription>
        </SheetHeader>
        <SheetBody>
          {status.data && !status.data.available && <Notice>{status.data.reason}</Notice>}
          <fieldset disabled={save.busy} className="flex flex-col gap-base">
            <Field label="From" required><Combobox value={from} onValueChange={setFrom} placeholder="Choose a topic or material" options={options} /></Field>
            <div className="grid gap-base sm:grid-cols-2">
              <Field label="Format"><Select value={format} onValueChange={setFormat} options={(['multiple-choice', 'flashcard', 'written-recall'] as QuestionFormat[]).map(f => ({ value: f, label: FORMAT_LABEL[f] }))} /></Field>
              <Field label="Questions" description="Up to 10."><NumberField value={count} onValueChange={setCount} min={1} max={10} /></Field>
            </div>
            <Field label="Difficulty">
              <SegmentedControl aria-label="Difficulty" value={difficulty} onValueChange={setDifficulty} options={[{ value: 'mixed', label: 'Mixed' }, ...(['recall', 'reasoning', 'stretch'] as Difficulty[]).map(d => ({ value: d, label: DIFFICULTY_LABEL[d] }))]} />
            </Field>
            <Field label="Set name" optional><Input maxLength={200} value={name} onChange={e => setName(e.target.value)} placeholder={chosen?.label.replace(/^(Topic|Material): /, '') ?? 'Generated set'} /></Field>
          </fieldset>
          {save.busy && <p className="text-muted-foreground text-sm" role="status">Writing and checking questions. This takes about fifteen seconds.</p>}
          {save.error && <FieldError>{save.error}</FieldError>}
        </SheetBody>
        <SheetFooter>
          <Button variant="secondary" disabled={save.busy} onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button loading={save.busy} disabled={!from || !count || status.data?.available === false} onClick={submit}>{save.status === 'failed' ? 'Retry' : 'Generate'}</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
