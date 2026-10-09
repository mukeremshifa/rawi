import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ArchiveIcon, ArchiveRestoreIcon, BookOpenIcon, FileIcon, PlusIcon, RotateCwIcon, UploadIcon } from 'lucide-react';
import type { z } from 'zod';
import { createMaterialInput, materialFields, type Material, type UploadState } from '@shared/contracts/materials';
import type { CourseDetail } from '@shared/contracts/workspace';

import { MATERIAL_KIND_LABEL, VERSION_STATUS_LABEL, formatRelative } from '@/components/domain';
import { Page, PageHeader, Toolbar } from '@/components/layout';
import { EmptyState, ErrorState } from '@/components/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Combobox } from '@/components/ui/combobox';
import { DropdownMenuItem, RowActions } from '@/components/ui/dropdown-menu';
import { Field, FieldError } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { Select } from '@/components/ui/select';
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Table, TableBody, TableCell, TableEmpty, TableHead, TableHeader, TableLoading, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { PHASE_LABEL, UPLOAD_HINT, useUpload } from '@/features/materials/upload';
import { useApi, useApiPages, useSave } from '@/lib/data';
import { useUnsentGuard } from '@/lib/hooks';
import { keys } from '@/lib/query';

type Fields = z.infer<typeof materialFields>;
const KINDS = (['reading', 'slides', 'other'] as const).map(value => ({ value, label: MATERIAL_KIND_LABEL[value] }));

/** Materials: a table of the course's documents, with Add material in a sheet. */
export function Materials() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [status, setStatus] = useState<'false' | 'true'>('false');
  const [topic, setTopic] = useState('');
  const outline = useApi<CourseDetail>(`/v1/courses/${id}/topics`);
  const pages = useApiPages<Material, 'materials'>(`/v1/courses/${id}/materials?archived=${status}${topic ? `&topicId=${topic}` : ''}&limit=50`, 'materials');
  const uploads = useApi<{ uploads: UploadState[] }>(`/v1/courses/${id}/uploads`);
  const save = useSave();
  const adding = params.get('add') === '1';
  const setAdding = (open: boolean) => { const next = new URLSearchParams(params); if (open) next.set('add', '1'); else next.delete('add'); setParams(next, { replace: true }); };
  const topics = outline.data?.topics ?? [];
  const topicName = (ids: string[]) => ids.length === 0 ? '' : ids.length === 1 ? topics.find(t => t.id === ids[0])?.title ?? '' : `${topics.find(t => t.id === ids[0])?.title ?? 'Topic'} and ${ids.length - 1} more`;
  const archive = (m: Material) => save.run<Material>({ path: `/v1/materials/${m.id}`, method: 'PATCH', body: { archived: !m.archived, expectedRevision: m.revision } },
    { id: `archive:${m.id}:${m.revision}`, invalidate: [keys.course(id).materials, keys.material(m.id)], onSuccess: saved => toast.success(saved.archived ? 'Material archived' : 'Material restored') });
  const pending = uploads.data?.uploads.filter(u => u.state !== 'ready') ?? [];
  const empty = !pages.isPending && !pages.items?.length && !pending.length;
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
          : empty && status === 'false' && !topic ? <EmptyState title="No materials yet" description="Add readings and slides to study from. Practice and the tutor cite them." action={<Button onClick={() => setAdding(true)}><PlusIcon />Add material</Button>} />
            : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Title</TableHead>
                    <TableHead className="hidden w-24 sm:table-cell">Kind</TableHead>
                    <TableHead className="hidden w-52 md:table-cell">Topic</TableHead>
                    <TableHead className="hidden w-28 sm:table-cell">Updated</TableHead>
                    <TableHead className="w-10"><span className="sr-only">Actions</span></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {status === 'false' && pending.map(u => <PendingRow key={u.id} upload={u} onReady={ready => { void uploads.refetch(); void pages.refetch(); navigate(`/materials/${ready.materialId}`); }} />)}
                  {pages.isPending && <TableLoading colSpan={5} rows={4} />}
                  {!pages.isPending && !pages.items?.length && !pending.length && <TableEmpty colSpan={5}>{status === 'true' ? 'No archived materials.' : 'No materials for this topic.'}</TableEmpty>}
                  {pages.items?.map(m => (
                    <TableRow key={m.id} onClick={() => navigate(`/materials/${m.id}`)}>
                      <TableCell className="max-w-0">
                        <div className="flex items-center gap-2">
                          {m.status === 'ready' || m.status === 'partial' ? <BookOpenIcon className="text-muted-foreground size-4 shrink-0" aria-hidden /> : <FileIcon className="text-muted-foreground size-4 shrink-0" aria-hidden />}
                          <Link to={`/materials/${m.id}`} onClick={e => e.stopPropagation()} className="truncate font-medium hover:underline">{m.title}</Link>
                          {m.status && m.status !== 'ready' && <Badge variant={m.status === 'failed' ? 'danger' : 'outline'} className="hidden lg:inline-flex">{VERSION_STATUS_LABEL[m.status]}</Badge>}
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground hidden sm:table-cell">{MATERIAL_KIND_LABEL[m.kind]}</TableCell>
                      <TableCell className="text-muted-foreground hidden max-w-0 truncate text-sm md:table-cell">{topicName(m.topicIds) || 'None'}</TableCell>
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
      <AddMaterialSheet courseId={id} topics={topics} open={adding} onOpenChange={setAdding}
        onSaved={materialId => { setAdding(false); void pages.refetch(); void uploads.refetch(); navigate(`/materials/${materialId}`); }} />
    </Page>
  );
}

/** An upload that has not finished, shown inline as a table row. */
function PendingRow({ upload, onReady }: { upload: UploadState; onReady: (state: UploadState) => void }) {
  const [value, setValue] = useState(upload);
  const save = useSave();
  const check = (finalize: boolean) => save.run<UploadState>({ path: `/v1/uploads/${value.id}${finalize ? '/finalize' : ''}`, method: finalize ? 'POST' : 'GET', body: finalize ? {} : undefined },
    { id: `${value.id}:${finalize}:${Date.now()}`, onSuccess: next => { setValue(next); if (next.state === 'ready') onReady(next); } });
  return (
    <TableRow>
      <TableCell colSpan={4} className="max-w-0 py-2">
        <div className="flex items-center gap-2">
          <UploadIcon className="text-muted-foreground size-4 shrink-0" aria-hidden />
          <span className="truncate font-medium">{value.fileName}</span>
          <Badge variant={value.state === 'failed' ? 'danger' : 'neutral'}>{value.state === 'failed' ? 'Upload failed' : value.inProgress ? 'Saving' : 'Not finished'}</Badge>
        </div>
        <p className="text-muted-foreground mt-0.5 text-sm">
          {save.error || value.failure || `Finish before ${new Date(value.expiresAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}. If the file never arrived, add it again.`}
        </p>
      </TableCell>
      <TableCell>
        <RowActions label={`Actions for ${value.fileName}`}>
          <DropdownMenuItem disabled={save.busy} onSelect={() => check(false)}><RotateCwIcon />Check status</DropdownMenuItem>
          {value.state === 'pending' && <DropdownMenuItem disabled={save.busy} onSelect={() => check(true)}><UploadIcon />Finish upload</DropdownMenuItem>}
        </RowActions>
      </TableCell>
    </TableRow>
  );
}

/** Add material: shared details, then paste text or upload a file. */
function AddMaterialSheet({ courseId, topics, open, onOpenChange, onSaved }: {
  courseId: string; topics: { id: string; title: string }[]; open: boolean; onOpenChange: (open: boolean) => void; onSaved: (materialId: string) => void;
}) {
  const [mode, setMode] = useState<'paste' | 'upload'>('paste');
  const [fields, setFields] = useState<Fields>({ title: '', kind: 'reading', attribution: '', topicIds: [] });
  const [text, setText] = useState('');
  const [format, setFormat] = useState<'md' | 'txt'>('md');
  const [createId, setCreateId] = useState(() => crypto.randomUUID());
  const [submitted, setSubmitted] = useState<z.infer<typeof createMaterialInput> | null>(null);
  const [invalid, setInvalid] = useState('');
  const save = useSave();
  const upload = useUpload(courseId, state => { reset(); onSaved(state.materialId); });
  const allow = useUnsentGuard(open && (!!fields.title || !!text || fields.topicIds.length > 0) || !!submitted);
  const reset = () => { setFields({ title: '', kind: 'reading', attribution: '', topicIds: [] }); setText(''); setSubmitted(null); setCreateId(crypto.randomUUID()); upload.setFile(null); };
  const titleOk = fields.title.trim().length > 0;
  const submitText = () => {
    const parsed = createMaterialInput.safeParse(submitted ?? { ...fields, id: createId, text, format });
    if (!parsed.success) { setInvalid(!titleOk ? 'Enter a title.' : !text.trim() ? 'Paste the text to save.' : 'Check the title and text length.'); return; }
    setInvalid(''); setSubmitted(parsed.data);
    save.run<Material>({ path: `/v1/courses/${courseId}/materials`, body: parsed.data }, {
      id: `material:${parsed.data.id}`, invalidate: [keys.course(courseId).materials],
      onSuccess: saved => { allow(); reset(); onSaved(saved.id); },
    });
  };
  const submitFile = () => {
    const parsed = materialFields.safeParse(fields);
    if (!parsed.success || !upload.file) { setInvalid(!titleOk ? 'Enter a title.' : 'Choose a file.'); return; }
    setInvalid('');
    void upload.start(parsed.data);
  };
  const locked = !!submitted || upload.busy;
  return (
    <Sheet open={open} onOpenChange={next => { if (!save.busy && !upload.busy) onOpenChange(next); }}>
      <SheetContent size="lg">
        <SheetHeader>
          <SheetTitle>Add material</SheetTitle>
          <SheetDescription>A reading, slides or another course document.</SheetDescription>
        </SheetHeader>
        <SheetBody>
          <fieldset disabled={locked} className="flex flex-col gap-base">
            <Field label="Title" required><Input maxLength={200} value={fields.title} onChange={e => setFields({ ...fields, title: e.target.value })} autoFocus /></Field>
            <div className="grid gap-base sm:grid-cols-2">
              <Field label="Kind"><Select value={fields.kind} onValueChange={kind => setFields({ ...fields, kind: kind as Fields['kind'] })} options={KINDS} /></Field>
              <Field label="Topics" optional>
                <Combobox multiple value={fields.topicIds} onValueChange={topicIds => setFields({ ...fields, topicIds })} placeholder="None" options={topics.map(t => ({ value: t.id, label: t.title }))} />
              </Field>
            </div>
            <Field label="Source" optional description="Author and title, so citations can name it."><Input maxLength={4000} value={fields.attribution} onChange={e => setFields({ ...fields, attribution: e.target.value })} /></Field>
          </fieldset>
          <Tabs value={mode} onValueChange={v => setMode(v as typeof mode)}>
            <TabsList><TabsTrigger value="paste" disabled={upload.busy}>Paste text</TabsTrigger><TabsTrigger value="upload" disabled={!!submitted}>Upload file</TabsTrigger></TabsList>
            <TabsContent value="paste" className="flex flex-col gap-snug">
              <fieldset disabled={locked} className="flex flex-col gap-snug">
                <SegmentedControl aria-label="Text format" size="sm" value={format} onValueChange={setFormat} options={[{ value: 'md', label: 'Markdown' }, { value: 'txt', label: 'Plain text' }]} />
                <Field label="Text"><Textarea className="max-h-[45vh] min-h-56 font-serif text-md" value={text} onChange={e => setText(e.target.value)} /></Field>
              </fieldset>
            </TabsContent>
            <TabsContent value="upload" className="flex flex-col gap-snug">
              <div className="flex flex-col items-start gap-tight rounded-md border border-dashed p-4">
                <Button asChild variant="secondary" size="sm">
                  <label className={upload.busy ? 'pointer-events-none opacity-50' : 'cursor-pointer'}>
                    <UploadIcon />{upload.file ? 'Choose another file' : 'Choose a file'}
                    <input type="file" className="sr-only" accept=".txt,.md,.pdf,.docx,.pptx" disabled={upload.busy} onChange={e => upload.setFile(e.target.files?.[0] ?? null)} />
                  </label>
                </Button>
                {upload.file && <p className="text-base">{upload.file.name} <span className="text-muted-foreground tabular text-sm">· {(upload.file.size / 1048576).toFixed(1)} MB</span></p>}
                <p className="text-muted-foreground text-sm">{UPLOAD_HINT}</p>
              </div>
              {upload.phase !== 'idle' && upload.phase !== 'failed' && (
                <div className="flex flex-col gap-1">
                  <div className="flex justify-between text-sm"><span>{PHASE_LABEL[upload.phase]}</span>{upload.phase === 'uploading' && <span className="tabular text-muted-foreground">{upload.progress}%</span>}</div>
                  <Progress value={upload.phase === 'uploading' ? upload.progress : null} aria-label="Upload progress" />
                </div>
              )}
              {upload.error && <FieldError>{upload.error}</FieldError>}
            </TabsContent>
          </Tabs>
          {invalid && <FieldError>{invalid}</FieldError>}
          {save.error && <FieldError>{save.error} Retry sends the same request, so it cannot save twice.</FieldError>}
        </SheetBody>
        <SheetFooter>
          {submitted && !save.busy && <Button variant="ghost" onClick={() => { save.discard(); setSubmitted(null); setCreateId(crypto.randomUUID()); }}>Edit again</Button>}
          <Button variant="secondary" disabled={save.busy || upload.busy} onClick={() => onOpenChange(false)}>Cancel</Button>
          {mode === 'paste'
            ? <Button loading={save.busy} onClick={submitText}>{save.status === 'failed' ? 'Retry' : 'Add material'}</Button>
            : <Button loading={upload.busy} disabled={!upload.file} onClick={submitFile}>{upload.phase === 'failed' ? 'Retry upload' : 'Upload'}</Button>}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
