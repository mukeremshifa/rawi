import { useEffect, useRef, useState, type DragEvent, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import {
  ArchiveIcon, ArchiveRestoreIcon, ArrowDownIcon, ArrowRightIcon, ArrowUpIcon, BookOpenIcon, CombineIcon, FileTextIcon, MoreHorizontalIcon,
  PencilIcon, PlusIcon, RotateCwIcon, SettingsIcon, Trash2Icon, UploadIcon,
} from 'lucide-react';
import type { Course } from '@shared/contracts/workspace';
import type { CorrectionResult, OutlineCorrection, OutlineTopic, OutlineView } from '@shared/contracts/outline';

import { DueLabel, MODE_LABEL, VERSION_STATUS_LABEL, formatRelative } from '@/components/domain';
import { Page, PageHeader, Section } from '@/components/layout';
import { ErrorState, LoadingState, PageLoading } from '@/components/states';
import { useConfirm } from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Combobox } from '@/components/ui/combobox';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger, RowActions } from '@/components/ui/dropdown-menu';
import { Field, FieldError } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { ShortList, TopicReadiness, type ProgressData } from '@/features/progress/parts';
import { QueueRow, unsettled, useUploadQueue } from '@/features/materials/queue';
import { ACCEPT, MAX_BATCH, checkFile, dragHasFiles, hashFile, titleFromName } from '@/features/materials/upload';
import { useApi, useSave } from '@/lib/data';
import { keys } from '@/lib/query';
import { cn } from '@/lib/utils';

type Change = OutlineCorrection extends infer C ? C extends unknown ? Omit<C, 'operationId' | 'expectedRevision'> : never : never;
const JOB_LINE = { read_syllabus: 'Reading the syllabus', assign_topics: 'Sorting sections into topics' } as const;
const placeLink = (p: { materialId: string; versionId: string; blockId: string | null }) => `/materials/${p.materialId}/versions/${p.versionId}${p.blockId ? `#block-${p.blockId}` : ''}`;

/** Course page: the syllabus, the outline it produced, the materials, and readiness by topic. */
export function CourseOverview() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const queue = useUploadQueue();
  const data = useApi<ProgressData>('/v1/progress');
  const course = useApi<{ course: Course }>(`/v1/courses/${id}/topics`);
  const incoming = queue.items.filter(i => i.courseId === id && unsettled(i));
  const [polling, setPolling] = useState(false);
  const outline = useApi<OutlineView>(`/v1/courses/${id}/outline`, { refetchInterval: polling ? 3000 : undefined, refetchIntervalInBackground: true });
  const view = outline.data;
  const syllabusConverting = view?.syllabus?.version?.status === 'pending' || view?.syllabus?.version?.status === 'processing';
  useEffect(() => { setPolling(!!view?.pending || syllabusConverting || incoming.length > 0); }, [view?.pending, syllabusConverting, incoming.length]);
  // A file that just became readable may have queued an outline job, so read the outline again.
  const readyFiles = queue.items.filter(i => i.courseId === id && i.stage === 'ready').map(i => i.id).join(',');
  useEffect(() => { if (readyFiles) void outline.refetch(); }, [readyFiles]); // eslint-disable-line react-hooks/exhaustive-deps
  // One toast when a job finishes outlining the course while this page is open, like the upload toasts.
  const opened = useRef(new Date().toISOString());
  const seen = useRef<{ latest: string | null } | null>(null);
  useEffect(() => {
    if (!view) return;
    const before = seen.current;
    if (before && !view.pending && view.latest && view.latest.id !== before.latest && view.latest.finishedAt >= opened.current) {
      if (view.latest.failure) toast.error('The outline could not be updated', { description: view.latest.failure });
      else if (view.latest.result?.topics) toast.success(`Outline ready, ${view.topics.length} ${view.topics.length === 1 ? 'topic' : 'topics'}`);
      void data.refetch(); void course.refetch();
    }
    if (!view.pending) seen.current = { latest: view.latest?.id ?? null };
    else seen.current ??= { latest: null };
  }, [view, data, course]);
  const save = useSave();
  if (data.isPending || course.isPending) return <Page><PageLoading label="Loading course" /></Page>;
  if (course.error || data.error) return <Page><ErrorState error={course.error ?? data.error} onRetry={() => { void course.refetch(); void data.refetch(); }} /></Page>;
  const row = data.data, info = course.data.course;
  const run = row.runs.find(r => r.courseId === id);
  const topics = row.topics.filter(t => t.courseId === id);
  const recent = row.attempts.filter(a => a.courseId === id && a.completedAt).sort((a, b) => b.completedAt!.localeCompare(a.completedAt!)).slice(0, 5);
  const archive = async () => {
    if (!info.archived && !await confirm({ title: `Archive ${info.name}?`, description: 'It leaves your active courses. Everything in it is kept, and you can restore it any time.', confirmLabel: 'Archive course' })) return;
    save.run<Course>({ path: `/v1/courses/${id}`, method: 'PATCH', body: { operationId: crypto.randomUUID(), archived: !info.archived, expectedRevision: info.revision } },
      { id: `archive:${info.revision}`, invalidate: [keys.courses.all, keys.progress], onSuccess: saved => { course.setData({ ...course.data, course: saved }); toast.success(saved.archived ? 'Course archived' : 'Course restored'); } });
  };
  return (
    <Page>
      <PageHeader display title={info.name} description={info.description || undefined}
        actions={<>
          {info.archived && <Badge>Archived</Badge>}
          <DropdownMenu>
            <DropdownMenuTrigger asChild><Button variant="secondary" size="icon" aria-label="Course options"><MoreHorizontalIcon /></Button></DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onSelect={() => navigate(`/course/${id}/settings`)}><SettingsIcon />Course settings</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem disabled={save.busy} onSelect={() => void archive()}>{info.archived ? <><ArchiveRestoreIcon />Restore course</> : <><ArchiveIcon />Archive course</>}</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          {run
            ? <Button asChild size="lg"><Link to={`/runs/${run.id}`}>Continue<ArrowRightIcon /></Link></Button>
            : topics.length > 0 && <Button asChild size="lg"><Link to={`/course/${id}/practice`}>Start practice</Link></Button>}
        </>} />
      {save.error && <ErrorState title="The course was not updated" detail={save.error} onRetry={save.retry} />}
      {outline.error ? <ErrorState error={outline.error} onRetry={() => void outline.refetch()} /> : !view ? <LoadingState lines={4} label="Loading the outline" /> : (
        <>
          <div className="grid gap-base md:grid-cols-2">
            <SyllabusSlot view={view} onChanged={() => void outline.refetch()} onView={outline.setData} />
            <MaterialsTarget courseId={id} />
          </div>
          <OutlineSection view={view} onView={next => { outline.setData(next); void data.refetch(); }} />
        </>
      )}
      {topics.length > 0 && (
        <Section title="Topic readiness" description={`${row.evidence.filter(e => e.courseId === id && (e.level === 'independent-once' || e.level === 'retained')).length} of ${topics.length} topics answered unaided`}>
          <TopicReadiness row={row} courseId={id} />
        </Section>
      )}
      <div className="grid gap-section lg:grid-cols-3">
        <Section title="Due for review">
          <ShortList empty="Nothing due."
            items={row.due.filter(d => d.courseId === id).slice(0, 6).map(d => ({ key: d.topicId, to: `/course/${id}/practice?topicId=${d.topicId}`, title: row.topics.find(t => t.id === d.topicId)?.title ?? 'Topic', meta: `${d.daysSince} days since you studied it` }))} />
        </Section>
        <Section title="Upcoming assessments">
          <ShortList empty="None planned."
            items={row.assessments.filter(a => a.courseId === id).sort((a, b) => a.date.localeCompare(b.date)).map(a => ({ key: a.id, to: '/planner', title: a.title, trailing: <DueLabel date={a.date} /> }))} />
        </Section>
        <Section title="Recent activity">
          <ShortList empty="No finished practice yet."
            items={recent.map(a => ({ key: a.id, to: `/attempts/${a.id}`, title: a.title, meta: `${MODE_LABEL[a.mode]} · ${formatRelative(a.completedAt!)}`, trailing: a.marksAvailable ? <span className="tabular text-muted-foreground text-sm">{a.marksAwarded}/{a.marksAvailable}</span> : undefined }))} />
        </Section>
      </div>
    </Page>
  );
}

/** A drop target that also works from the keyboard, through its button. */
function DropTarget({ title, hint, multiple, onFiles, children, busy }: { title: string; hint: string; multiple: boolean; onFiles: (files: File[]) => void; children?: ReactNode; busy?: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const drop = (e: DragEvent) => { if (!dragHasFiles(e)) return; e.preventDefault(); e.stopPropagation(); setOver(false); onFiles(Array.from(e.dataTransfer.files)); };
  return (
    <section aria-label={title} onDragOver={e => { if (dragHasFiles(e)) { e.preventDefault(); setOver(true); } }} onDragLeave={() => setOver(false)} onDrop={drop}
      className={cn('flex flex-col gap-snug rounded-lg border border-dashed p-4 transition-colors', over ? 'border-primary bg-primary-subtle' : 'bg-surface')}>
      <div className="flex items-center gap-2">
        <h2 className="text-md flex-1 font-semibold">{title}</h2>
        <Button variant="secondary" size="sm" loading={busy} onClick={() => input.current?.click()}><UploadIcon />{over ? 'Drop to add' : multiple ? 'Choose files' : 'Choose a file'}</Button>
        <input ref={input} type="file" multiple={multiple} className="sr-only" tabIndex={-1} aria-hidden accept={ACCEPT}
          onChange={e => { onFiles(Array.from(e.target.files ?? [])); e.target.value = ''; }} />
      </div>
      <p className="text-muted-foreground text-sm">{hint}</p>
      {children}
    </section>
  );
}

/** Queue files from a drop, flagging any that cannot be uploaded. */
function useQueueFiles(courseId: string) {
  const queue = useUploadQueue();
  const [problem, setProblem] = useState('');
  const [hashing, setHashing] = useState(false);
  const add = async (files: File[], kind: 'syllabus' | 'material', material?: OutlineView['syllabus']) => {
    const chosen = kind === 'syllabus' ? files.slice(0, 1) : files.slice(0, MAX_BATCH);
    const accepted = chosen.flatMap(file => { const checked = checkFile(file); return 'reason' in checked ? [] : [{ file, type: checked.type }]; });
    const refused = chosen.filter(f => !accepted.some(a => a.file === f));
    setProblem(refused.length ? `${refused.map(f => f.name).join(', ')}: use PDF, Word, PowerPoint, Markdown or text within the size limit.` : kind === 'syllabus' && files.length > 1 ? 'The syllabus is one file. The first one was used.' : '');
    if (!accepted.length) return;
    setHashing(true);
    try {
      queue.enqueue(await Promise.all(accepted.map(async ({ file, type }) => ({
        courseId, file, type, checksum: await hashFile(file),
        title: material?.material.title ?? titleFromName(file.name),
        kind: kind === 'syllabus' ? 'syllabus' as const : type === 'pptx' ? 'slides' as const : 'reading' as const,
        ...(material ? { material: material.material } : {}),
      }))));
    } finally { setHashing(false); }
  };
  return { add, problem, hashing };
}

/** The syllabus slot: a drop zone when empty, its conversion status, then the ready syllabus. */
function SyllabusSlot({ view, onChanged, onView }: { view: OutlineView; onChanged: () => void; onView: (view: OutlineView) => void }) {
  const queue = useUploadQueue();
  const files = useQueueFiles(view.course.id);
  const read = useSave();
  const syllabus = view.syllabus;
  const moving = queue.items.filter(i => i.courseId === view.course.id && i.kind === 'syllabus' && unsettled(i));
  useEffect(() => { if (moving.some(i => i.stage === 'converting')) onChanged(); }, [moving.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const v = syllabus?.version;
  const fallback = view.latest?.kind === 'read_syllabus' && view.latest.result?.provider === 'rules' && (view.latest.result.fallback === 'budget' || view.latest.result.fallback === 'failed');
  const readAgain = () => read.run<OutlineView>({ path: `/v1/courses/${view.course.id}/outline/read`, body: {} }, { id: `read:${view.latest?.id}`, onSuccess: onView });
  return (
    <DropTarget title="Syllabus" multiple={false} busy={files.hashing} onFiles={f => void files.add(f, 'syllabus', syllabus)}
      hint={syllabus ? 'A new file becomes a new version of the syllabus. Rawi reads it again and keeps the topics you changed.' : 'Rawi reads it for the topics, weeks and assessments. PDF, Word or text.'}>
      {moving.map(item => <QueueRow key={item.id} item={item} />)}
      {syllabus && !moving.length && (
        <div className="flex flex-wrap items-center gap-x-snug gap-y-1">
          <FileTextIcon className="text-muted-foreground size-4 shrink-0" aria-hidden />
          <Link to={`/materials/${syllabus.material.id}`} className="min-w-0 truncate text-base font-medium hover:underline">{syllabus.material.title}</Link>
          {v && <span className="text-muted-foreground text-sm">Version {v.number}{v.status !== 'ready' ? `, ${VERSION_STATUS_LABEL[v.status].toLowerCase()}` : ''}</span>}
          {(v?.status === 'pending' || v?.status === 'processing') && <span className="bg-primary size-2 animate-pulse rounded-full" aria-hidden />}
        </div>
      )}
      {v?.status === 'failed' && <p className="text-danger-text text-sm">{v.failure ?? 'The syllabus could not be converted.'} <Link className="underline" to={`/materials/${syllabus!.material.id}`}>Open it</Link> to try again.</p>}
      {fallback && !view.pending && (
        <div className="flex flex-wrap items-center gap-snug">
          <Button size="sm" variant="secondary" loading={read.busy} onClick={readAgain}><RotateCwIcon />Read again</Button>
        </div>
      )}
      {(files.problem || read.error) && <FieldError>{files.problem || read.error}</FieldError>}
    </DropTarget>
  );
}

function MaterialsTarget({ courseId }: { courseId: string }) {
  const queue = useUploadQueue();
  const files = useQueueFiles(courseId);
  const moving = queue.items.filter(i => i.courseId === courseId && i.kind !== 'syllabus' && !i.material && unsettled(i));
  return (
    <DropTarget title="Materials" multiple busy={files.hashing} onFiles={f => void files.add(f, 'material')}
      hint="Readings, notes and slides. Each one is linked to the outline once it is readable.">
      {moving.length > 0 && <ul className="flex flex-col gap-snug">{moving.map(item => <li key={item.id}><QueueRow item={item} /></li>)}</ul>}
      <Link to={`/course/${courseId}/materials`} className="text-primary-text inline-flex items-center gap-1 self-start text-sm hover:underline"><BookOpenIcon className="size-3.5" aria-hidden />Open the library</Link>
      {files.problem && <FieldError>{files.problem}</FieldError>}
    </DropTarget>
  );
}

/**
 * The outline, grouped by week or unit. Corrections apply in place: rename,
 * merge, remove, add and reorder, each with one toast and Undo.
 */
function OutlineSection({ view, onView }: { view: OutlineView; onView: (view: OutlineView) => void }) {
  const save = useSave();
  const [renaming, setRenaming] = useState<string | null>(null);
  const [merging, setMerging] = useState<OutlineTopic | null>(null);
  const [adding, setAdding] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const courseId = view.course.id;
  const invalidate = [keys.progress, keys.planner, keys.course(courseId).topics, keys.course(courseId).materials];
  const undo = (changeId: string) => save.run<CorrectionResult>({ path: `/v1/courses/${courseId}/outline/undo`, body: { operationId: crypto.randomUUID(), changeId } }, {
    id: `undo:${changeId}`, invalidate, onSuccess: result => { onView(result.outline); toast.success('Undone'); },
  });
  const correct = (change: Change, done?: () => void) => save.run<CorrectionResult>({
    path: `/v1/courses/${courseId}/outline/corrections`, body: { ...change, operationId: crypto.randomUUID(), expectedRevision: view.course.outlineRevision },
  }, {
    id: `correct:${view.course.outlineRevision}:${JSON.stringify(change)}`, invalidate,
    onSuccess: result => { onView(result.outline); done?.(); toast.success(result.message, { action: { label: 'Undo', onClick: () => undo(result.changeId) } }); },
  });
  const status = view.pending ? JOB_LINE[view.pending] : null;
  const note = view.latest?.result?.provider === 'rules' && view.topics.length > 0 && !view.pending
    ? view.latest.result.fallback === 'unconfigured' ? 'Outlined from headings.' : 'Outlined from headings. A closer reading is available when AI budget allows.' : null;
  const empty = !view.topics.length;
  return (
    <Section title="Outline" description={empty ? undefined : `${view.topics.length} ${view.topics.length === 1 ? 'topic' : 'topics'}`}
      actions={!empty && <Button variant="ghost" size="sm" disabled={save.busy} onClick={() => setAdding(true)}><PlusIcon />Add topic</Button>}>
      {status && <p className="text-muted-foreground flex items-center gap-2 text-base" role="status"><span className="bg-primary size-2 animate-pulse rounded-full" aria-hidden />{status}</p>}
      {note && <p className="text-muted-foreground text-sm">{note}</p>}
      {save.error && <ErrorState title={save.conflict ? 'The outline changed elsewhere' : 'The outline was not changed'} detail={save.conflict ? 'It has been reloaded. Try the change again.' : save.error} onRetry={save.conflict ? undefined : save.retry} />}
      {empty && !status && (
        view.syllabus || view.readyMaterials >= 2
          ? <p className="text-muted-foreground text-base">No topics yet.</p>
          : <p className="text-muted-foreground text-base">Rawi outlines the course from its syllabus, or from your materials once it has read them.</p>
      )}
      {!empty && (
        <ol className="border-y">
          {view.topics.map((topic, index) => {
            const newModule = index === 0 || view.topics[index - 1]!.module !== topic.module;
            const expanded = open === topic.id;
            return (
              <li key={topic.id} className={cn(newModule && index > 0 && 'border-t')}>
                {newModule && topic.module && <p className="text-muted-foreground pt-3 pb-1 text-xs font-medium tracking-wide uppercase">{topic.module}</p>}
                <div className="flex items-start gap-snug py-2">
                  <span className="text-muted-foreground tabular w-5 shrink-0 pt-0.5 text-right text-sm">{index + 1}</span>
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    {renaming === topic.id
                      ? <RenameField topic={topic} busy={save.busy} onCancel={() => setRenaming(null)} onSave={title => correct({ action: 'rename', topicId: topic.id, title }, () => setRenaming(null))} />
                      : <span className="text-base font-medium">{topic.title}</span>}
                    {topic.summary && <span className="text-muted-foreground text-sm">{topic.summary}</span>}
                    {topic.buildsOn.length > 0 && <span className="text-muted-foreground text-sm">Builds on {topic.buildsOn.map(id => view.topics.find(t => t.id === id)?.title).filter(Boolean).join(', ')}</span>}
                    <span className="text-muted-foreground flex flex-wrap gap-x-snug text-sm">
                      {topic.source && <Link className="hover:underline" to={placeLink({ ...topic.source, blockId: topic.source.blockIds[0] ?? null })}>{sourceLabel(topic)}</Link>}
                      {topic.places.length > 0 && (
                        <button type="button" className="hover:underline" aria-expanded={expanded} onClick={() => setOpen(expanded ? null : topic.id)}>
                          Where to read: {topic.places.length} {topic.places.length === 1 ? 'section' : 'sections'}
                        </button>
                      )}
                    </span>
                    {expanded && (
                      <ul className="mt-1 flex flex-col gap-0.5 border-l pl-3 text-sm">
                        {topic.places.map(p => <li key={`${p.materialId}:${p.sectionKey}`}><Link className="hover:underline" to={placeLink(p)}>{p.heading ? `${p.heading}, ` : ''}<span className="text-muted-foreground">{p.materialTitle}{p.depth === 'introduces' ? ', introduced here' : p.depth === 'mentions' ? ', mentioned' : ''}</span></Link></li>)}
                      </ul>
                    )}
                  </div>
                  <RowActions label={`Change ${topic.title}`}>
                    <DropdownMenuItem onSelect={() => setRenaming(topic.id)}><PencilIcon />Rename</DropdownMenuItem>
                    <DropdownMenuItem disabled={index === 0} onSelect={() => correct({ action: 'move', topicId: topic.id, step: -1 })}><ArrowUpIcon />Move up</DropdownMenuItem>
                    <DropdownMenuItem disabled={index === view.topics.length - 1} onSelect={() => correct({ action: 'move', topicId: topic.id, step: 1 })}><ArrowDownIcon />Move down</DropdownMenuItem>
                    <DropdownMenuItem disabled={view.topics.length < 2} onSelect={() => setMerging(topic)}><CombineIcon />Merge into another topic</DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem destructive onSelect={() => correct({ action: 'remove', topicId: topic.id })}><Trash2Icon />Remove</DropdownMenuItem>
                  </RowActions>
                </div>
              </li>
            );
          })}
        </ol>
      )}
      {adding && <AddTopic view={view} busy={save.busy} onCancel={() => setAdding(false)} onAdd={(title, module) => correct({ action: 'add', title, module, afterId: view.topics.at(-1)?.id ?? null }, () => setAdding(false))} />}
      <MergeDialog topic={merging} topics={view.topics} busy={save.busy} onClose={() => setMerging(null)} onMerge={targetId => correct({ action: 'merge', topicId: merging!.id, targetId }, () => setMerging(null))} />
    </Section>
  );
}

/** "Syllabus, week 3" or the material a drafted topic came from. */
function sourceLabel(topic: OutlineTopic) {
  if (topic.origin === 'syllabus') return topic.module ? `Syllabus, ${topic.module.charAt(0).toLowerCase()}${topic.module.slice(1)}` : 'Syllabus';
  return topic.sourceTitle ?? 'Source';
}

function RenameField({ topic, busy, onSave, onCancel }: { topic: OutlineTopic; busy: boolean; onSave: (title: string) => void; onCancel: () => void }) {
  const [title, setTitle] = useState(topic.title);
  // The menu returns focus to its button as it closes, so focus the field after that.
  const field = useRef<HTMLInputElement>(null);
  useEffect(() => { const timer = setTimeout(() => field.current?.select(), 50); return () => clearTimeout(timer); }, []);
  return (
    <form className="flex flex-wrap items-center gap-tight" onSubmit={e => { e.preventDefault(); if (title.trim() && title.trim() !== topic.title) onSave(title.trim()); else onCancel(); }}>
      <Input ref={field} className="h-8 w-80 max-w-full" maxLength={200} value={title} aria-label={`New name for ${topic.title}`} onChange={e => setTitle(e.target.value)} onKeyDown={e => { if (e.key === 'Escape') onCancel(); }} />
      <Button type="submit" size="sm" loading={busy} disabled={!title.trim()}>Save</Button>
      <Button type="button" size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>
    </form>
  );
}

function AddTopic({ view, busy, onAdd, onCancel }: { view: OutlineView; busy: boolean; onAdd: (title: string, module: string) => void; onCancel: () => void }) {
  const [title, setTitle] = useState('');
  const [module, setModule] = useState(view.topics.at(-1)?.module ?? '');
  return (
    <form className="flex flex-wrap items-end gap-snug" onSubmit={e => { e.preventDefault(); if (title.trim()) onAdd(title.trim(), module.trim()); }} onKeyDown={e => { if (e.key === 'Escape') onCancel(); }}>
      <Field label="New topic" className="w-80 max-w-full"><Input autoFocus maxLength={200} value={title} onChange={e => setTitle(e.target.value)} /></Field>
      <Field label="Week or unit" optional className="w-40"><Input maxLength={200} value={module} onChange={e => setModule(e.target.value)} placeholder="Week 3" /></Field>
      <Button type="submit" loading={busy} disabled={!title.trim()}>Add topic</Button>
      <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
    </form>
  );
}

function MergeDialog({ topic, topics, busy, onMerge, onClose }: { topic: OutlineTopic | null; topics: OutlineTopic[]; busy: boolean; onMerge: (targetId: string) => void; onClose: () => void }) {
  const [target, setTarget] = useState('');
  useEffect(() => setTarget(''), [topic]);
  return (
    <Dialog open={!!topic} onOpenChange={next => { if (!next && !busy) onClose(); }}>
      {topic && (
        <DialogContent>
          <form onSubmit={e => { e.preventDefault(); if (target) onMerge(target); }}>
            <DialogHeader>
              <DialogTitle>Merge {topic.title}</DialogTitle>
              <DialogDescription>Its sections, questions, tutor sessions, planned study and assessment coverage move to the topic you choose.</DialogDescription>
            </DialogHeader>
            <DialogBody>
              <Field label="Merge into" required><Combobox value={target} onValueChange={setTarget} placeholder="Choose a topic" options={topics.filter(t => t.id !== topic.id).map(t => ({ value: t.id, label: t.title, hint: t.module || undefined }))} /></Field>
            </DialogBody>
            <DialogFooter>
              <Button type="button" variant="secondary" disabled={busy} onClick={onClose}>Cancel</Button>
              <Button type="submit" loading={busy} disabled={!target}>Merge</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      )}
    </Dialog>
  );
}


