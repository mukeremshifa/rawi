import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ArchiveIcon, ArchiveRestoreIcon, BookOpenIcon, FileIcon, PlusIcon, UploadIcon } from 'lucide-react';
import type { z } from 'zod';
import { createMaterialInput, materialFields, type Material } from '@shared/contracts/materials';
import type { CourseDetail } from '@shared/contracts/workspace';

import { MATERIAL_KIND_LABEL, VERSION_STATUS_LABEL, formatRelative } from '@/components/domain';
import { Page, PageHeader, Toolbar } from '@/components/layout';
import { EmptyState, ErrorState } from '@/components/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DropdownMenuItem, RowActions } from '@/components/ui/dropdown-menu';
import { Field, FieldError } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { Select } from '@/components/ui/select';
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Table, TableBody, TableCell, TableEmpty, TableHead, TableHeader, TableLoading, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { QueueRow, unsettled, useUploadQueue, type QueueItem } from '@/features/materials/queue';
import { DropZone, StagedRow, dragHasFiles, useStaging } from '@/features/materials/upload';
import { useApi, useApiPages, useSave } from '@/lib/data';
import { useUnsentGuard } from '@/lib/hooks';
import { keys } from '@/lib/query';

type Fields = z.infer<typeof materialFields>;
type Staging = ReturnType<typeof useStaging>;
const KINDS = (['reading', 'slides', 'other'] as const).map(value => ({ value, label: MATERIAL_KIND_LABEL[value] }));
const converting = (m: Material) => m.status === 'pending' || m.status === 'processing';

/** Whether files are being dragged anywhere over the window. */
function useFileDrag(onDrop: (files: File[]) => void) {
  const [dragging, setDragging] = useState(false);
  const depth = useRef(0);
  const drop = useRef(onDrop);
  drop.current = onDrop;
  useEffect(() => {
    const enter = (e: DragEvent) => { if (!dragHasFiles(e)) return; e.preventDefault(); depth.current++; setDragging(true); };
    const over = (e: DragEvent) => { if (!dragHasFiles(e)) return; e.preventDefault(); if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'; };
    const leave = (e: DragEvent) => { if (!dragHasFiles(e)) return; depth.current = Math.max(0, depth.current - 1); if (!depth.current) setDragging(false); };
    const done = (e: DragEvent) => {
      if (!dragHasFiles(e)) return;
      e.preventDefault(); depth.current = 0; setDragging(false);
      const files = Array.from(e.dataTransfer?.files ?? []);
      if (files.length) drop.current(files);
    };
    window.addEventListener('dragenter', enter); window.addEventListener('dragover', over); window.addEventListener('dragleave', leave); window.addEventListener('drop', done);
    return () => { window.removeEventListener('dragenter', enter); window.removeEventListener('dragover', over); window.removeEventListener('dragleave', leave); window.removeEventListener('drop', done); };
  }, []);
  return dragging;
}

/** Materials: a table of the course's documents, with Add material in a sheet. Files can be dropped anywhere on the page. */
export function Materials() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [status, setStatus] = useState<'false' | 'true'>('false');
  const [topic, setTopic] = useState('');
  const [poll, setPoll] = useState(false);
  const outline = useApi<CourseDetail>(`/v1/courses/${id}/topics`);
  const pages = useApiPages<Material, 'materials'>(`/v1/courses/${id}/materials?archived=${status}${topic ? `&topicId=${topic}` : ''}&limit=50`, 'materials', { refetchInterval: poll ? 4000 : false });
  // Poll only while something in the list is still converting.
  useEffect(() => { setPoll(!!pages.items?.some(converting)); }, [pages.items]);
  const queue = useUploadQueue();
  const staging = useStaging(id);
  const save = useSave();
  const adding = params.get('add') === '1';
  const setAdding = (open: boolean) => { const next = new URLSearchParams(params); if (open) next.set('add', '1'); else next.delete('add'); setParams(next, { replace: true }); };
  const dragging = useFileDrag(files => { staging.add(files); if (!adding) setAdding(true); });
  const topics = outline.data?.topics ?? [];
  const topicName = (ids: string[]) => ids.length === 0 ? '' : ids.length === 1 ? topics.find(t => t.id === ids[0])?.title ?? '' : `${topics.find(t => t.id === ids[0])?.title ?? 'Topic'} and ${ids.length - 1} more`;
  const archive = (m: Material) => save.run<Material>({ path: `/v1/materials/${m.id}`, method: 'PATCH', body: { archived: !m.archived, expectedRevision: m.revision } },
    { id: `archive:${m.id}:${m.revision}`, invalidate: [keys.course(id).materials, keys.material(m.id)], onSuccess: saved => toast.success(saved.archived ? 'Material archived' : 'Material restored') });
  // New files from the queue show at the top until the list itself has them.
  const listed = new Set(pages.items?.map(m => m.id));
  const incoming = status === 'false' && !topic ? queue.items.filter(i => i.courseId === id && !i.material && !(i.materialId && listed.has(i.materialId))) : [];
  const empty = !pages.isPending && !pages.items?.length && !incoming.length;
  return (
    <Page>
      <PageHeader title="Materials" actions={<Button size="lg" onClick={() => setAdding(true)}><PlusIcon />Add material</Button>} />
      <div className="flex flex-col gap-snug">
        <Toolbar>
          <SegmentedControl aria-label="Material status" value={status} onValueChange={setStatus} options={[{ value: 'false', label: 'Active' }, { value: 'true', label: 'Archived' }]} />
          {topics.length > 0 && <Select aria-label="Topic" className="w-56" value={topic} onValueChange={setTopic} options={[{ value: '', label: 'All topics' }, ...topics.map(t => ({ value: t.id, label: t.title }))]} />}
        </Toolbar>
        {save.error && <ErrorState title="The material was not updated" detail={save.error} onRetry={save.retry} />}
        {pages.error ? <ErrorState error={pages.error} onRetry={() => void pages.refetch()} />
          : empty && status === 'false' && !topic ? <EmptyState title="No materials yet" description="Add readings and slides to study from, or drop files here. Practice and the tutor cite them." action={<Button onClick={() => setAdding(true)}><PlusIcon />Add material</Button>} />
            : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Title</TableHead>
                    <TableHead className="hidden w-24 sm:table-cell">Kind</TableHead>
                    <TableHead className="hidden w-52 md:table-cell">Covers</TableHead>
                    <TableHead className="hidden w-28 sm:table-cell">Updated</TableHead>
                    <TableHead className="w-10"><span className="sr-only">Actions</span></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {incoming.map(item => <IncomingRow key={item.id} item={item} />)}
                  {pages.isPending && <TableLoading colSpan={5} rows={4} />}
                  {!pages.isPending && !pages.items?.length && !incoming.length && <TableEmpty colSpan={5}>{status === 'true' ? 'No archived materials.' : 'No materials for this topic.'}</TableEmpty>}
                  {pages.items?.map(m => (
                    <TableRow key={m.id} onClick={() => navigate(`/materials/${m.id}`)}>
                      <TableCell className="max-w-0">
                        <div className="flex items-center gap-2">
                          {m.status === 'ready' || m.status === 'partial' ? <BookOpenIcon className="text-muted-foreground size-4 shrink-0" aria-hidden /> : <FileIcon className="text-muted-foreground size-4 shrink-0" aria-hidden />}
                          <Link to={`/materials/${m.id}`} onClick={e => e.stopPropagation()} className="truncate font-medium hover:underline">{m.title}</Link>
                          {m.status && m.status !== 'ready' && (
                            <Badge variant={m.status === 'failed' ? 'danger' : 'outline'} className="shrink-0">
                              {converting(m) && <span className="bg-primary size-1.5 animate-pulse rounded-full" aria-hidden />}{VERSION_STATUS_LABEL[m.status]}
                            </Badge>
                          )}
                          {(m.status === 'ready' || m.status === 'partial') && m.readiness !== 'enriched' && (
                            <Badge variant="outline" className="shrink-0" title={m.readiness === 'searchable' ? 'The tutor can search it. Summaries and facts for practice are still being read.' : 'Rawi is reading it so the tutor can search it.'}>
                              <span className="bg-primary size-1.5 animate-pulse rounded-full" aria-hidden />{m.readiness === 'searchable' ? 'Searchable' : 'Reading'}
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground hidden sm:table-cell">{MATERIAL_KIND_LABEL[m.kind]}</TableCell>
                      <TableCell className="text-muted-foreground hidden max-w-0 truncate text-sm md:table-cell">{topicName(m.topicIds) || (m.status === 'ready' || m.status === 'partial' ? 'Not in the outline' : '')}</TableCell>
                      <TableCell className="text-muted-foreground hidden text-sm sm:table-cell">{formatRelative(m.updatedAt)}</TableCell>
                      <TableCell>
                        <RowActions label={`Actions for ${m.title}`}>
                          <DropdownMenuItem onSelect={() => navigate(`/materials/${m.id}`)}><BookOpenIcon />Open</DropdownMenuItem>
                          <DropdownMenuItem disabled={save.busy} onSelect={() => archive(m)}>{m.archived ? <><ArchiveRestoreIcon />Restore</> : <><ArchiveIcon />Archive</>}</DropdownMenuItem>
                        </RowActions>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
        {pages.hasNextPage && <Button variant="secondary" className="self-start" loading={pages.isFetchingNextPage} onClick={() => void pages.fetchNextPage()}>Load more</Button>}
      </div>
      {dragging && !adding && (
        <div className="bg-background/80 pointer-events-none fixed inset-0 z-50 flex items-center justify-center p-6 backdrop-blur-sm" aria-hidden>
          <div className="border-primary bg-card flex max-w-sm flex-col items-center gap-snug rounded-xl border-2 border-dashed px-10 py-12 text-center shadow-raised">
            <UploadIcon className="text-primary size-7" />
            <p className="text-md font-semibold">Drop to add materials</p>
            <p className="text-muted-foreground text-sm">PDF, Word, PowerPoint, Markdown or text, up to 10 files.</p>
          </div>
        </div>
      )}
      <AddMaterialSheet courseId={id} open={adding} onOpenChange={setAdding} staging={staging} dragging={dragging}
        onSaved={materialId => { setAdding(false); void pages.refetch(); navigate(`/materials/${materialId}`); }} />
    </Page>
  );
}

/** A file from the queue that the list does not have yet. */
function IncomingRow({ item }: { item: QueueItem }) {
  return (
    <TableRow>
      <TableCell colSpan={5} className="max-w-0 py-2"><QueueRow item={item} /></TableCell>
    </TableRow>
  );
}

/**
 * Add material: files first, with Paste text as the second tab. Files need
 * nothing but a title, which is prefilled from the filename. Upload hands
 * them to the queue, so the sheet can close while they move.
 */
function AddMaterialSheet({ courseId, open, onOpenChange, onSaved, staging, dragging }: {
  courseId: string; open: boolean; onOpenChange: (open: boolean) => void; onSaved: (materialId: string) => void;
  staging: Staging; dragging: boolean;
}) {
  const queue = useUploadQueue();
  const [mode, setMode] = useState<'files' | 'paste'>('files');
  const [fields, setFields] = useState<Fields>({ title: '', kind: 'reading', attribution: '' });
  const [text, setText] = useState('');
  const [format, setFormat] = useState<'md' | 'txt'>('md');
  const [createId, setCreateId] = useState(() => crypto.randomUUID());
  const [submitted, setSubmitted] = useState<z.infer<typeof createMaterialInput> | null>(null);
  const [invalid, setInvalid] = useState('');
  const save = useSave();
  const allow = useUnsentGuard(!!fields.title || !!text || !!submitted || staging.staged.length > 0);
  const resetText = () => { setFields({ title: '', kind: 'reading', attribution: '' }); setText(''); setSubmitted(null); setCreateId(crypto.randomUUID()); };
  const titleOk = fields.title.trim().length > 0;
  const moving = queue.items.filter(i => i.courseId === courseId && !i.material && unsettled(i));
  useEffect(() => { if (open && staging.staged.length) setMode('files'); }, [open, staging.staged.length]);

  const submitText = () => {
    const parsed = createMaterialInput.safeParse(submitted ?? { ...fields, id: createId, text, format });
    if (!parsed.success) { setInvalid(!titleOk ? 'Enter a title.' : !text.trim() ? 'Paste the text to save.' : 'Check the title and text length.'); return; }
    setInvalid(''); setSubmitted(parsed.data);
    save.run<Material>({ path: `/v1/courses/${courseId}/materials`, body: parsed.data }, {
      id: `material:${parsed.data.id}`, invalidate: [keys.course(courseId).materials],
      onSuccess: saved => { allow(); resetText(); onSaved(saved.id); },
    });
  };
  const upload = () => {
    queue.enqueue(staging.take());
    staging.clear();
  };
  const count = staging.ready.length;
  const undecided = staging.staged.filter(s => s.duplicate).length;
  return (
    <Sheet open={open} onOpenChange={next => { if (!save.busy) onOpenChange(next); }}>
      <SheetContent size="lg">
        <SheetHeader>
          <SheetTitle>Add material</SheetTitle>
          <SheetDescription>Readings, slides or other course documents.</SheetDescription>
        </SheetHeader>
        <SheetBody>
          <Tabs value={mode} onValueChange={v => { setMode(v as typeof mode); setInvalid(''); }}>
            <TabsList><TabsTrigger value="files">Files</TabsTrigger><TabsTrigger value="paste" disabled={!!submitted && save.busy}>Paste text</TabsTrigger></TabsList>
            <TabsContent value="files" className="flex flex-col gap-base">
              <DropZone onFiles={staging.add} dragging={dragging} compact={staging.staged.length > 0 || moving.length > 0} />
              {staging.rejected.length > 0 && (
                <ul className="flex flex-col gap-1 text-sm" aria-live="polite">
                  {staging.rejected.map((r, i) => <li key={i}><span className="font-medium break-all">{r.name}</span>: <span className="text-danger-text">{r.reason}</span></li>)}
                </ul>
              )}
              {staging.staged.length > 0 && (
                <ul className="divide-y border-y" aria-label="Files to upload">
                  {staging.staged.map(s => (
                    <StagedRow key={s.id} item={s} onTitle={title => staging.update(s.id, { title })} onRemove={() => staging.remove(s.id)} onKeep={() => staging.update(s.id, { duplicate: undefined })} />
                  ))}
                </ul>
              )}
              {staging.staged.length > 0 && <p className="text-muted-foreground text-sm">Rawi links each file's sections to the course outline once it is readable. Kind and source can be changed later in each material's details.</p>}
              {moving.length > 0 && (
                <section className="flex flex-col gap-snug" aria-label="Uploading">
                  <h3 className="text-sm font-medium">Uploading</h3>
                  <ul className="flex flex-col gap-snug">{moving.map(item => <li key={item.id}><QueueRow item={item} /></li>)}</ul>
                  <p className="text-muted-foreground text-sm">You can close this panel. Uploads continue while this tab stays open.</p>
                </section>
              )}
            </TabsContent>
            <TabsContent value="paste" className="flex flex-col gap-base">
              <fieldset disabled={!!submitted} className="flex flex-col gap-base">
                <Field label="Title" required><Input maxLength={200} value={fields.title} onChange={e => setFields({ ...fields, title: e.target.value })} /></Field>
                <Field label="Kind"><Select value={fields.kind} onValueChange={kind => setFields({ ...fields, kind: kind as Fields['kind'] })} options={KINDS} /></Field>
                <Field label="Source" optional description="Author and title, so citations can name it."><Input maxLength={4000} value={fields.attribution} onChange={e => setFields({ ...fields, attribution: e.target.value })} /></Field>
                <SegmentedControl aria-label="Text format" size="sm" value={format} onValueChange={setFormat} options={[{ value: 'md', label: 'Markdown' }, { value: 'txt', label: 'Plain text' }]} />
                <Field label="Text"><Textarea className="max-h-[45vh] min-h-56 font-serif text-md" value={text} onChange={e => setText(e.target.value)} /></Field>
              </fieldset>
              {invalid && <FieldError>{invalid}</FieldError>}
              {save.error && <FieldError>{save.error} Retry sends the same request, so it cannot save twice.</FieldError>}
            </TabsContent>
          </Tabs>
        </SheetBody>
        <SheetFooter>
          {mode === 'files' && undecided > 0 && <p className="text-muted-foreground mr-auto text-sm">{undecided === 1 ? 'Decide on the file already in this course.' : `Decide on the ${undecided} files already in this course.`}</p>}
          {mode === 'paste' && submitted && !save.busy && <Button variant="ghost" onClick={() => { save.discard(); setSubmitted(null); setCreateId(crypto.randomUUID()); }}>Edit again</Button>}
          <Button variant="secondary" disabled={save.busy} onClick={() => onOpenChange(false)}>{mode === 'files' && moving.length ? 'Close' : 'Cancel'}</Button>
          {mode === 'paste'
            ? <Button loading={save.busy} onClick={submitText}>{save.status === 'failed' ? 'Retry' : 'Add material'}</Button>
            : <Button disabled={!count || staging.checking || undecided > 0} loading={staging.checking} onClick={upload}>{count > 1 ? `Upload ${count} files` : 'Upload'}</Button>}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
