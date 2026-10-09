import { useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowDownIcon, ArrowUpIcon, ChevronRightIcon, FileUpIcon, PlusIcon, Trash2Icon } from 'lucide-react';
import { courseFields, replaceOutlineInput, type Course, type CourseDetail, type TopicInput } from '@shared/contracts/workspace';
import { readSyllabus } from '@shared/domain/syllabus';

import { PRIORITY_LABEL } from '@/components/domain';
import { Page, PageHeader, SectionHeader } from '@/components/layout';
import { ErrorState, PageLoading, SaveIndicator } from '@/components/states';
import { useConfirm } from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Combobox } from '@/components/ui/combobox';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenuItem, DropdownMenuSeparator, RowActions } from '@/components/ui/dropdown-menu';
import { Field, FieldError } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { useAccount } from '@/lib/account';
import { errorMessage, request } from '@/lib/api';
import { useApi, useSave } from '@/lib/data';
import { useUnsentGuard } from '@/lib/hooks';
import { keys } from '@/lib/query';
import { cn } from '@/lib/utils';

type Fields = { name: string; description: string; goal: string };
const fieldsOf = (c: Course): Fields => ({ name: c.name, description: c.description, goal: c.goal });
const topicOf = (t: TopicInput): TopicInput => ({ id: t.id, title: t.title, summary: t.summary, priority: t.priority, module: t.module, order: t.order, relatedTopicIds: [...t.relatedTopicIds] });

/** Syllabus: the course outline and the course's own settings, as two tabs. */
export function CourseEditor() {
  const { id = '' } = useParams();
  const detail = useApi<CourseDetail>(`/v1/courses/${id}/topics`);
  if (detail.isPending) return <Page width="narrow"><PageLoading label="Loading syllabus" /></Page>;
  if (detail.error) return <Page width="narrow"><ErrorState error={detail.error} onRetry={() => void detail.refetch()} /></Page>;
  return <LoadedEditor key={id} initial={detail.data} onSaved={detail.setData} />;
}

function LoadedEditor({ initial, onSaved }: { initial: CourseDetail; onSaved: (detail: CourseDetail) => void }) {
  const { user } = useAccount();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const tab = useLocation().pathname.endsWith('/settings') ? 'settings' : 'outline';
  const [base, setBase] = useState(initial);
  const [fields, setFields] = useState(fieldsOf(initial.course));
  const [topics, setTopics] = useState(initial.topics.map(topicOf));
  const [review, setReview] = useState<CourseDetail | null>(null);
  const [reviewError, setReviewError] = useState('');
  const [importing, setImporting] = useState(false);
  const [invalid, setInvalid] = useState('');
  const outlineSave = useSave(), metaSave = useSave();
  const outlineDirty = JSON.stringify(topics) !== JSON.stringify(base.topics.map(topicOf));
  const fieldsDirty = JSON.stringify(fields) !== JSON.stringify(fieldsOf(base.course));
  useUnsentGuard(outlineDirty || fieldsDirty || outlineSave.pending || metaSave.pending);
  const accept = (next: CourseDetail) => { setBase(next); onSaved(next); };

  const saveOutline = () => {
    const parsed = replaceOutlineInput.safeParse({ operationId: crypto.randomUUID(), topics: topics.map((t, order) => ({ ...t, order })), expectedRevision: base.course.revision });
    if (!parsed.success) { setInvalid('Every topic needs a title of up to 200 characters.'); return; }
    setInvalid('');
    outlineSave.run<CourseDetail>({ path: `/v1/courses/${base.course.id}/topics`, method: 'PUT', body: parsed.data }, {
      id: `outline:${base.course.revision}`, invalidate: [keys.progress],
      onSuccess: result => { accept(result); setTopics(result.topics.map(topicOf)); },
    });
  };
  const saveFields = (archived?: boolean) => {
    const parsed = courseFields.safeParse(fields);
    if (!parsed.success) { setInvalid('Enter a course name and check the field lengths.'); return; }
    setInvalid('');
    metaSave.run<Course>({ path: `/v1/courses/${base.course.id}`, method: 'PATCH', body: { ...parsed.data, operationId: crypto.randomUUID(), ...(archived === undefined ? {} : { archived }), expectedRevision: base.course.revision } }, {
      id: `course:${base.course.revision}:${archived}`, invalidate: [keys.courses.all, keys.progress],
      onSuccess: course => { accept({ ...base, course }); setFields(fieldsOf(course)); if (archived !== undefined) toast.success(course.archived ? 'Course archived' : 'Course restored'); },
    });
  };
  const loadReview = async () => {
    setReviewError('');
    try { setReview(await request<CourseDetail>(`/v1/courses/${base.course.id}/topics`, user.id)); } catch (e) { setReviewError(errorMessage(e)); }
  };
  const conflict = outlineSave.conflict || metaSave.conflict;

  return (
    <Page width="narrow">
      <PageHeader title={base.course.name} actions={base.course.archived ? <Badge>Archived</Badge> : undefined} />
      <Tabs value={tab} onValueChange={value => navigate(`/course/${base.course.id}/${value === 'settings' ? 'settings' : 'syllabus'}`, { replace: true })}>
        <TabsList>
          <TabsTrigger value="outline">Outline{outlineDirty && <span className="bg-primary size-1.5 rounded-full" aria-label="Unsaved changes" />}</TabsTrigger>
          <TabsTrigger value="settings">Settings{fieldsDirty && <span className="bg-primary size-1.5 rounded-full" aria-label="Unsaved changes" />}</TabsTrigger>
        </TabsList>
        {conflict && (
          <div className="bg-warning-subtle text-warning-text mt-base flex flex-wrap items-center gap-snug rounded-md px-3 py-2 text-sm">
            <span className="flex-1">This course changed in another tab. Your edits are kept here.</span>
            <Button size="sm" variant="secondary" onClick={() => void loadReview()}>Review latest</Button>
          </div>
        )}
        {reviewError && <FieldError className="mt-tight">{reviewError}</FieldError>}

        <TabsContent value="outline" className="flex flex-col gap-base">
          <div className="flex flex-wrap items-center gap-tight">
            <Button variant="secondary" onClick={() => setImporting(true)}><FileUpIcon />Import from syllabus</Button>
            <Button variant="secondary" disabled={topics.length >= 200} onClick={() => setTopics([...topics, { id: crypto.randomUUID(), title: '', summary: '', module: topics.at(-1)?.module ?? '', priority: 'normal', order: topics.length, relatedTopicIds: [] }])}><PlusIcon />Add topic</Button>
            <div className="ml-auto flex items-center gap-snug">
              <SaveIndicator status={outlineSave.status} dirty={outlineDirty} error={outlineSave.conflict ? undefined : outlineSave.error} onRetry={outlineSave.conflict ? undefined : outlineSave.retry} />
              <Button loading={outlineSave.busy} disabled={(!outlineDirty && !outlineSave.pending) || outlineSave.conflict} onClick={saveOutline}>Save outline</Button>
            </div>
          </div>
          {invalid && tab === 'outline' && <FieldError>{invalid}</FieldError>}
          <OutlineEditor topics={topics} onChange={setTopics} disabled={outlineSave.busy} />
        </TabsContent>

        <TabsContent value="settings">
          <form className="flex flex-col gap-section" onSubmit={e => { e.preventDefault(); saveFields(); }}>
            <section className="flex flex-col gap-1">
              <div className="divide-y border-y">
                <Field layout="row" label="Course name" required><Input maxLength={200} value={fields.name} onChange={e => setFields({ ...fields, name: e.target.value })} /></Field>
                <Field layout="row" label="Description" optional description="A sentence about the course itself."><Textarea maxLength={4000} value={fields.description} onChange={e => setFields({ ...fields, description: e.target.value })} /></Field>
                <Field layout="row" label="Your goal" optional description="Shown at the top of the course overview."><Textarea maxLength={4000} value={fields.goal} onChange={e => setFields({ ...fields, goal: e.target.value })} /></Field>
              </div>
              {invalid && tab === 'settings' && <FieldError className="pt-2">{invalid}</FieldError>}
              <div className="flex flex-wrap items-center justify-end gap-snug pt-3">
                <SaveIndicator status={metaSave.status} dirty={fieldsDirty} error={metaSave.conflict ? undefined : metaSave.error} onRetry={metaSave.conflict ? undefined : metaSave.retry} />
                <Button type="submit" loading={metaSave.busy} disabled={(!fieldsDirty && !metaSave.pending) || metaSave.conflict}>Save changes</Button>
              </div>
            </section>
            <section className="flex flex-col gap-snug">
              <SectionHeader title={base.course.archived ? 'Restore course' : 'Archive course'} description={base.course.archived ? 'Return it to your active courses.' : 'Remove it from your active courses. Everything in it is kept, and you can restore it any time.'} />
              <Button type="button" variant="secondary" className="self-start" disabled={metaSave.busy || fieldsDirty || conflict}
                onClick={async () => { if (base.course.archived || await confirm({ title: `Archive ${base.course.name}?`, description: 'It leaves your active courses. Nothing is deleted.', confirmLabel: 'Archive course' })) saveFields(!base.course.archived); }}>
                {base.course.archived ? 'Restore course' : 'Archive course'}
              </Button>
              {fieldsDirty && <p className="text-muted-foreground text-sm">Save or undo your changes first.</p>}
            </section>
          </form>
        </TabsContent>
      </Tabs>

      <ImportDialog open={importing} onOpenChange={setImporting} existing={topics.length}
        onApply={(found, mode) => setTopics(mode === 'replace' ? found : [...topics, ...found])} />

      <Dialog open={!!review} onOpenChange={open => { if (!open) setReview(null); }}>
        {review && (
          <DialogContent size="lg">
            <DialogHeader>
              <DialogTitle>Latest saved version</DialogTitle>
              <DialogDescription>Compare it with your edits, then choose which to keep.</DialogDescription>
            </DialogHeader>
            <DialogBody>
              <p className="font-medium">{review.course.name}</p>
              {review.course.goal && <p className="text-muted-foreground">{review.course.goal}</p>}
              <ol className="list-decimal pl-5 text-base">{review.topics.map(t => <li key={t.id}>{t.title}{t.module && <span className="text-muted-foreground"> · {t.module}</span>}</li>)}</ol>
            </DialogBody>
            <DialogFooter>
              <Button variant="secondary" onClick={() => { outlineSave.discard(); metaSave.discard(); accept(review); setFields(fieldsOf(review.course)); setTopics(review.topics.map(topicOf)); setReview(null); }}>Use the saved version</Button>
              <Button onClick={() => { outlineSave.discard(); metaSave.discard(); accept(review); setReview(null); }}>Keep my edits</Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    </Page>
  );
}

/**
 * The outline: topics in order, grouped by module. Titles edit in place,
 * priority is a segmented control, and details (module, summary, related
 * topics) open under a topic.
 */
function OutlineEditor({ topics, onChange, disabled }: { topics: TopicInput[]; onChange: (topics: TopicInput[]) => void; disabled: boolean }) {
  const [open, setOpen] = useState<string | null>(null);
  const edit = (id: string, patch: Partial<TopicInput>) => onChange(topics.map(t => t.id === id ? { ...t, ...patch } : t));
  const move = (index: number, step: number) => { const next = [...topics]; [next[index], next[index + step]] = [next[index + step]!, next[index]!]; onChange(next); };
  const remove = (id: string) => onChange(topics.filter(t => t.id !== id).map(t => ({ ...t, relatedTopicIds: t.relatedTopicIds.filter(r => r !== id) })));
  if (!topics.length) {
    return <p className="text-muted-foreground border-y py-8 text-center text-base">No topics yet. Import them from a syllabus, or add them one at a time.</p>;
  }
  return (
    <ol className="border-y">
      {topics.map((topic, index) => {
        const newModule = index === 0 || topics[index - 1]!.module !== topic.module;
        const expanded = open === topic.id;
        return (
          <li key={topic.id} className={cn(newModule && index > 0 && 'border-t')}>
            {newModule && <p className="text-muted-foreground pt-3 pb-1 text-xs font-medium tracking-wide uppercase">{topic.module || 'No module'}</p>}
            <div className="group flex items-center gap-1.5 py-1">
              <Button variant="ghost" size="icon-sm" aria-expanded={expanded} aria-label={`${expanded ? 'Hide' : 'Show'} details for ${topic.title || 'untitled topic'}`} onClick={() => setOpen(expanded ? null : topic.id)}>
                <ChevronRightIcon className={cn('transition-transform', expanded && 'rotate-90')} />
              </Button>
              <span className="text-muted-foreground tabular w-5 shrink-0 text-right text-sm">{index + 1}</span>
              <Input aria-label={`Topic ${index + 1} title`} value={topic.title} maxLength={200} disabled={disabled} placeholder="Topic title"
                onChange={e => edit(topic.id, { title: e.target.value })}
                className={cn('h-8 flex-1 border-transparent bg-transparent shadow-none hover:border-input focus-visible:bg-card', !topic.title && 'border-danger')} />
              <SegmentedControl size="sm" aria-label={`Priority of ${topic.title || 'topic'}`} value={topic.priority} onValueChange={priority => edit(topic.id, { priority })}
                className="hidden sm:inline-flex" options={(['low', 'normal', 'high'] as const).map(value => ({ value, label: PRIORITY_LABEL[value] }))} />
              <RowActions label={`Actions for ${topic.title || 'topic'}`}>
                <DropdownMenuItem disabled={index === 0} onSelect={() => move(index, -1)}><ArrowUpIcon />Move up</DropdownMenuItem>
                <DropdownMenuItem disabled={index === topics.length - 1} onSelect={() => move(index, 1)}><ArrowDownIcon />Move down</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem destructive onSelect={() => remove(topic.id)}><Trash2Icon />Remove topic</DropdownMenuItem>
              </RowActions>
            </div>
            {expanded && (
              <div className="bg-surface mb-2 ml-9 grid gap-base rounded-md border p-3 sm:grid-cols-2">
                <Field label="Priority" className="sm:hidden">
                  <SegmentedControl aria-label="Priority" value={topic.priority} onValueChange={priority => edit(topic.id, { priority })} options={(['low', 'normal', 'high'] as const).map(value => ({ value, label: PRIORITY_LABEL[value] }))} />
                </Field>
                <Field label="Module or week" optional><Input maxLength={200} value={topic.module} onChange={e => edit(topic.id, { module: e.target.value })} placeholder="Week 3" /></Field>
                <Field label="Related topics" optional>
                  <Combobox multiple value={topic.relatedTopicIds} onValueChange={ids => edit(topic.id, { relatedTopicIds: ids })} placeholder="None"
                    options={topics.filter(t => t.id !== topic.id).map(t => ({ value: t.id, label: t.title || 'Untitled topic' }))} />
                </Field>
                <Field label="Summary" optional className="sm:col-span-2"><Textarea maxLength={4000} value={topic.summary} onChange={e => edit(topic.id, { summary: e.target.value })} /></Field>
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}

/** Import from syllabus: paste or open a text file, preview the topics, then add or replace. */
function ImportDialog({ open, onOpenChange, existing, onApply }: { open: boolean; onOpenChange: (open: boolean) => void; existing: number; onApply: (topics: TopicInput[], mode: 'add' | 'replace') => void }) {
  const [text, setText] = useState('');
  const [problem, setProblem] = useState('');
  useUnsentGuard(open && !!text);
  const reading = useMemo(() => text.trim() ? readSyllabus(text) : null, [text]);
  const found = useMemo<TopicInput[]>(() => reading?.topics.map((t, order) => ({ id: crypto.randomUUID(), title: t.title, summary: t.summary, module: t.module ?? '', priority: 'normal' as const, order, relatedTopicIds: [] })) ?? [], [reading]);
  const apply = (mode: 'add' | 'replace') => {
    if ((mode === 'add' ? existing : 0) + found.length > 200) { setProblem('An outline can hold up to 200 topics.'); return; }
    onApply(found, mode); setText(''); setProblem(''); onOpenChange(false);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>Import from syllabus</DialogTitle>
          <DialogDescription>Paste the outline or open a text file. Check the topics before adding them.</DialogDescription>
        </DialogHeader>
        <DialogBody>
          <Field label="Syllabus text">
            <Textarea className="max-h-64 min-h-32" maxLength={100000} value={text} onChange={e => setText(e.target.value)} placeholder="Week 1: Introduction" />
          </Field>
          <div className="flex items-center gap-snug">
            <Button asChild variant="secondary" size="sm">
              <label className="cursor-pointer">
                <FileUpIcon />Open a text file
                <input type="file" accept=".txt,.md,text/plain,text/markdown" className="sr-only" onChange={async e => {
                  const file = e.target.files?.[0]; e.target.value = '';
                  if (!file) return;
                  if (!/\.(txt|md)$/i.test(file.name) || file.size > 100000) { setProblem('Choose a .txt or .md file under 100 KB.'); return; }
                  try { setText(await file.text()); setProblem(''); } catch { setProblem('This file could not be read.'); }
                }} />
              </label>
            </Button>
            <span className="text-muted-foreground text-sm">.txt or .md, up to 100 KB</span>
          </div>
          {problem && <FieldError>{problem}</FieldError>}
          {reading && (
            <div className="flex flex-col gap-1.5">
              <p className="text-sm font-medium">{found.length ? `${found.length} topics found` : 'No topics found in this text.'}</p>
              {found.length > 0 && (
                <ol className="max-h-56 divide-y overflow-y-auto rounded-md border text-base">
                  {found.map((t, i) => (
                    <li key={t.id} className="flex gap-snug px-3 py-1.5">
                      <span className="text-muted-foreground tabular w-5 text-right text-sm">{i + 1}</span>
                      <span className="min-w-0 flex-1 truncate">{t.title}</span>
                      {t.module && <span className="text-muted-foreground shrink-0 text-sm">{t.module}</span>}
                    </li>
                  ))}
                </ol>
              )}
            </div>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button>
          {existing > 0 && <Button variant="secondary" disabled={!found.length} onClick={() => apply('replace')}>Replace outline</Button>}
          <Button disabled={!found.length} onClick={() => apply('add')}>{existing ? 'Add to outline' : 'Use these topics'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
