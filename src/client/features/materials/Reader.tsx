import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import Markdown from 'react-markdown';
import { toast } from 'sonner';
import {
  ArchiveIcon, ArchiveRestoreIcon, ClipboardListIcon, DownloadIcon, LinkIcon, MessageSquareIcon, MoreHorizontalIcon,
  PanelRightIcon, UploadIcon,
} from 'lucide-react';
import type { z } from 'zod';
import { materialFields, type Material, type MaterialVersion, type Passage, type VersionDetail } from '@shared/contracts/materials';
import type { CourseDetail } from '@shared/contracts/workspace';

import { InlineText } from '@/components/InlineText';
import { MATERIAL_KIND_LABEL, VERSION_ORIGIN_LABEL, formatDate } from '@/components/domain';
import { Page } from '@/components/layout';
import { ErrorState, LoadingState, Notice, PageLoading, SaveIndicator } from '@/components/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Combobox } from '@/components/ui/combobox';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Field, FieldError } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Select } from '@/components/ui/select';
import { Sheet, SheetBody, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Hint } from '@/components/ui/tooltip';
import { PHASE_LABEL, UPLOAD_HINT, useUpload } from '@/features/materials/upload';
import { useAccount } from '@/lib/account';
import { errorMessage, request } from '@/lib/api';
import { useApi, useApiPages, useSave } from '@/lib/data';
import { useUnsentGuard } from '@/lib/hooks';
import { keys } from '@/lib/query';
import { usePageMeta } from '@/lib/shell';

type Fields = z.infer<typeof materialFields>;
const KINDS = (['reading', 'slides', 'other'] as const).map(value => ({ value, label: MATERIAL_KIND_LABEL[value] }));
/** Drop a leading Markdown heading that repeats the passage heading. */
const bodyOf = (p: Passage) => {
  const match = /^\s*#{1,6}\s+(.+?)\s*\n/.exec(p.text);
  return match && match[1]!.trim() === p.heading.trim() ? p.text.slice(match[0].length) : p.text;
};
/** A passage's text: Markdown without HTML or images, and links only to the web. */
export function PassageText({ passage, markdown }: { passage: Passage; markdown: boolean }) {
  return markdown
    ? <Markdown skipHtml components={{ img: () => null, h1: 'h3', h2: 'h3', a: ({ children, href }) => <a href={href && /^https?:\/\//i.test(href) ? href : undefined} rel="noreferrer noopener" target="_blank">{children}</a> }}>{bodyOf(passage)}</Markdown>
    : <div className="whitespace-pre-wrap">{bodyOf(passage)}</div>;
}
const passagePath = (m: string, v: string, p: string) => `/materials/${m}/versions/${v}/passages/${p}`;

/**
 * The reader: a calm editorial page. Serif text at the reading-size
 * preference and a measure of about 68 characters, passage anchors, and
 * per-passage actions to note, practise or link. Versions, editing and
 * notes live in a side sheet.
 */
export function MaterialReader() {
  const { materialId = '', versionId, passageId } = useParams();
  const { user } = useAccount();
  const material = useApi<Material>(`/v1/materials/${materialId}`);
  const m = material.data;
  const selected = versionId ?? m?.currentVersionId ?? null;
  const pages = useApiPages<Passage, 'passages'>(selected && !passageId ? `/v1/materials/${materialId}/versions/${selected}` : null, 'passages');
  const single = useApi<Passage>(passageId && selected ? `/v1/materials/${materialId}/versions/${selected}/passages/${passageId}` : null);
  const singleVersion = useApi<VersionDetail>(passageId && selected ? `/v1/materials/${materialId}/versions/${selected}` : null);
  const [panel, setPanel] = useState<null | 'versions' | 'edit'>(null);
  usePageMeta({ courseId: m?.courseId, crumbs: m ? [{ label: 'Materials', to: `/course/${m.courseId}/materials` }, { label: m.title }] : undefined });

  if (material.isPending) return <Page width="narrow"><PageLoading label="Opening material" /></Page>;
  if (material.error) return <Page width="narrow"><ErrorState error={material.error} onRetry={() => void material.refetch()} /></Page>;
  const row = material.data;
  const version = passageId ? singleVersion.data?.version : (pages.data?.pages[0] as unknown as VersionDetail | undefined)?.version;
  const passages = passageId ? (single.data ? [single.data] : []) : pages.items ?? [];
  const loading = passageId ? single.isPending : pages.isPending;
  const failure = passageId ? single.error ?? singleVersion.error : pages.error;
  const download = async () => {
    if (!version) return;
    try {
      const result = await request<{ available: boolean; url?: string; message?: string }>(`/v1/materials/${materialId}/versions/${version.id}/download`, user.id, {}, 'POST');
      if (!result.available || !result.url) { toast(result.message ?? 'There is no original file for this version.'); return; }
      const link = document.createElement('a'); link.href = result.url; link.rel = 'noreferrer'; link.referrerPolicy = 'no-referrer'; link.click();
    } catch (e) { toast.error(errorMessage(e)); }
  };
  return (
    <article className="px-4 pt-8 pb-24 sm:px-gutter">
      <header className="ui-reading mx-auto flex flex-col gap-3">
        <div className="text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
          <span>{MATERIAL_KIND_LABEL[row.kind]}</span>
          {version && <><span aria-hidden>·</span><span>Version {version.number}</span><span aria-hidden>·</span><span>{formatDate(version.createdAt)}</span></>}
          {versionId && versionId !== row.currentVersionId && <Badge variant="warning">Earlier version</Badge>}
          {row.archived && <Badge>Archived</Badge>}
        </div>
        <h1 className="font-serif text-2xl leading-tight font-medium tracking-tight text-balance sm:text-[2.25rem] sm:leading-[1.15]">{row.title}</h1>
        {row.attribution && <p className="text-muted-foreground font-serif text-md"><InlineText text={row.attribution} /></p>}
        <div className="flex flex-wrap items-center gap-tight pt-1">
          <Button asChild variant="secondary" size="sm"><Link to={`/course/${row.courseId}/practice?materialId=${materialId}${version ? `&versionId=${version.id}` : ''}`}><ClipboardListIcon />Practise</Link></Button>
          <Button variant="ghost" size="sm" onClick={() => setPanel('versions')}><PanelRightIcon />Details</Button>
          {version?.sourceObjectId && <Hint label="Download original"><Button variant="ghost" size="icon-sm" aria-label="Download original" onClick={() => void download()}><DownloadIcon /></Button></Hint>}
        </div>
        {versionId && versionId !== row.currentVersionId && <Notice action={<Button asChild variant="link" size="sm"><Link to={`/materials/${materialId}`}>Read the current version</Link></Button>}>You are reading an earlier version.</Notice>}
      </header>

      <div className="ui-reading mx-auto mt-section">
        {loading && <LoadingState lines={8} label="Loading text" />}
        {failure && <ErrorState error={failure} onRetry={() => { void pages.refetch(); void single.refetch(); }} />}
        {version && version.contentStatus !== 'readable' && (
          <Notice action={version.sourceObjectId ? <Button variant="secondary" size="sm" onClick={() => void download()}><DownloadIcon />Download original</Button> : undefined}>
            {version.contentStatus === 'not_extracted' ? "This file is stored, but its text isn't available for reading or study yet." : 'The text of this file could not be read.'}
          </Notice>
        )}
        {version?.contentStatus === 'readable' && passages.map(p => (
          <section key={p.id} id={`passage-${p.id}`} className="group relative scroll-mt-20 border-b border-transparent pb-gutter">
            <div className="absolute top-1 -right-1 flex gap-0.5 opacity-100 transition-opacity sm:-right-12 sm:flex-col sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100">
              <PassageActions practise={`/course/${row.courseId}/practice?materialId=${materialId}&versionId=${version.id}`}
                tutor={`/course/${row.courseId}/tutor?materialId=${materialId}&versionId=${version.id}&passageId=${p.id}&topicId=${row.topicIds[0] ?? ''}`}
                link={passagePath(materialId, version.id, p.id)} />
            </div>
            {p.heading && <h2 className="mt-section mb-3 pr-10 font-serif text-xl leading-snug font-semibold sm:pr-0">{p.heading}</h2>}
            <div className="rawi-prose font-serif">
              <PassageText passage={p} markdown={version.format === 'md'} />
            </div>
          </section>
        ))}
        {passageId && version && <p className="mt-section"><Button asChild variant="secondary"><Link to={`/materials/${materialId}${versionId !== row.currentVersionId ? `/versions/${version.id}` : ''}#passage-${passageId}`}>Read the whole material</Link></Button></p>}
        {!passageId && pages.hasNextPage && <Button variant="secondary" className="mt-gutter" loading={pages.isFetchingNextPage} onClick={() => void pages.fetchNextPage()}>Continue reading</Button>}
        {!passageId && version?.contentStatus === 'readable' && !pages.hasNextPage && !loading && (
          <footer className="text-muted-foreground mt-section flex flex-col gap-1 border-t pt-gutter text-sm">
            <span>End of {row.title}.</span>
            {row.attribution && <span className="font-serif"><InlineText text={row.attribution} /></span>}
          </footer>
        )}
      </div>

      <MaterialSheet material={row} version={version} panel={panel} onPanel={setPanel} onChanged={next => material.setData(next)} reload={() => { void material.refetch(); void pages.refetch(); }} />
    </article>
  );
}

function PassageActions({ practise, tutor, link }: { practise: string; tutor: string; link: string }) {
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild><Button variant="ghost" size="icon-sm" aria-label="Passage actions"><MoreHorizontalIcon /></Button></DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem asChild><Link to={practise}><ClipboardListIcon />Practise from this</Link></DropdownMenuItem>
          <DropdownMenuItem asChild><Link to={tutor}><MessageSquareIcon />Discuss with the tutor</Link></DropdownMenuItem>
          <DropdownMenuItem onSelect={() => { void navigator.clipboard?.writeText(new URL(link, location.origin).href).then(() => toast.success('Link copied'), () => toast(link)); }}><LinkIcon />Copy link to passage</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}

/** Versions and details, in a side sheet beside the text. */
function MaterialSheet({ material, version, panel, onPanel, onChanged, reload }: {
  material: Material; version: MaterialVersion | undefined; panel: null | 'versions' | 'edit'; onPanel: (p: null | 'versions' | 'edit') => void;
  onChanged: (m: Material) => void; reload: () => void;
}) {
  return (
    <Sheet open={!!panel} onOpenChange={open => { if (!open) onPanel(null); }}>
      <SheetContent size="lg" aria-describedby={undefined}>
        <SheetHeader><SheetTitle className="truncate">{material.title}</SheetTitle></SheetHeader>
        <Tabs value={panel ?? 'versions'} onValueChange={v => onPanel(v as 'versions')} className="flex min-h-0 flex-1 flex-col">
          <TabsList className="px-5"><TabsTrigger value="versions">Versions</TabsTrigger><TabsTrigger value="edit">Details</TabsTrigger></TabsList>
          <SheetBody>
            <TabsContent value="versions" className="pt-0"><VersionList material={material} current={version?.id} onNavigate={() => onPanel(null)} /></TabsContent>
            <TabsContent value="edit" className="pt-0"><EditPanel material={material} onChanged={onChanged} reload={reload} /></TabsContent>
          </SheetBody>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}

function VersionList({ material, current, onNavigate }: { material: Material; current?: string; onNavigate: () => void }) {
  const versions = useApiPages<MaterialVersion, 'versions'>(`/v1/materials/${material.id}/versions`, 'versions');
  if (versions.isPending) return <LoadingState lines={4} label="Loading versions" />;
  if (versions.error) return <ErrorState error={versions.error} onRetry={() => void versions.refetch()} />;
  return (
    <div className="flex flex-col gap-snug">
      <p className="text-muted-foreground text-base">Every saved version stays readable, so citations keep pointing at the exact text.</p>
      <ol className="divide-y border-y">
        {versions.items?.map(v => (
          <li key={v.id}>
            <Link to={v.id === material.currentVersionId ? `/materials/${material.id}` : `/materials/${material.id}/versions/${v.id}`} onClick={onNavigate}
              className="hover:bg-surface flex items-center gap-snug py-2.5 outline-none focus-visible:bg-surface">
              <span className="tabular w-10 text-sm font-medium">v{v.number}</span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="text-base">{VERSION_ORIGIN_LABEL[v.origin]}{v.contentStatus !== 'readable' ? ', original only' : ''}</span>
                <span className="text-muted-foreground text-sm">{new Date(v.createdAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</span>
              </span>
              {v.id === material.currentVersionId && <Badge variant="accent">Current</Badge>}
              {v.id === current && v.id !== material.currentVersionId && <Badge>Reading</Badge>}
            </Link>
          </li>
        ))}
      </ol>
      {versions.hasNextPage && <Button variant="secondary" className="self-start" loading={versions.isFetchingNextPage} onClick={() => void versions.fetchNextPage()}>Load more</Button>}
    </div>
  );
}

/**
 * Edit details, replace the original file, or archive. Each save keeps its
 * request for Retry, and a revision conflict offers the latest saved
 * material to compare. Converted text is never edited.
 */
function EditPanel({ material, onChanged, reload }: { material: Material; onChanged: (m: Material) => void; reload: () => void }) {
  const { user } = useAccount();
  const outline = useApi<CourseDetail>(`/v1/courses/${material.courseId}/topics`);
  const initial = useMemo<Fields>(() => ({ title: material.title, kind: material.kind, attribution: material.attribution, topicIds: material.topicIds }), [material]);
  const [fields, setFields] = useState<Fields>(initial);
  const base = material.revision;
  const [review, setReview] = useState<Material | null>(null);
  const [loadError, setLoadError] = useState('');
  const meta = useSave(), archive = useSave();
  const upload = useUpload(material.courseId, () => { reload(); toast.success('New version saved'); });
  const fieldsDirty = JSON.stringify({ ...fields, topicIds: [...fields.topicIds].sort() }) !== JSON.stringify({ ...initial, topicIds: [...initial.topicIds].sort() });
  useUnsentGuard(fieldsDirty || meta.pending);
  const busy = meta.busy || upload.busy || archive.busy;
  const saveFields = () => {
    const parsed = materialFields.safeParse(fields);
    if (!parsed.success) return;
    meta.run<Material>({ path: `/v1/materials/${material.id}`, method: 'PATCH', body: { ...parsed.data, expectedRevision: base } }, {
      id: `meta:${base}`, invalidate: [keys.course(material.courseId).materials],
      onSuccess: saved => onChanged(saved),
    });
  };
  const openReview = async () => {
    setLoadError('');
    try { setReview(await request<Material>(`/v1/materials/${material.id}`, user.id)); } catch (e) { setLoadError(errorMessage(e)); }
  };
  return (
    <div className="flex flex-col gap-section">
      {meta.conflict && (
        <div className="bg-warning-subtle text-warning-text flex flex-wrap items-center gap-snug rounded-md px-3 py-2 text-sm">
          <span className="flex-1">This material changed elsewhere. Your edits are kept here.</span>
          <Button size="sm" variant="secondary" onClick={() => void openReview()}>Review latest</Button>
        </div>
      )}
      {loadError && <FieldError>{loadError}</FieldError>}
      {review && (
        <div className="flex flex-col gap-snug rounded-md border p-3">
          <p className="font-medium">Latest saved: {review.title}</p>
          <p className="text-muted-foreground text-sm">{MATERIAL_KIND_LABEL[review.kind]}{review.attribution ? ` · ${review.attribution}` : ''}</p>
          <div className="flex flex-wrap gap-tight">
            <Button size="sm" onClick={() => { meta.discard(); onChanged(review); setReview(null); }}>Keep my edits, save over this</Button>
            <Button size="sm" variant="secondary" onClick={() => { meta.discard(); onChanged(review); setFields({ title: review.title, kind: review.kind, attribution: review.attribution, topicIds: review.topicIds }); setReview(null); }}>Discard my edits</Button>
          </div>
        </div>
      )}

      <form className="flex flex-col gap-base" onSubmit={e => { e.preventDefault(); saveFields(); }}>
        <h3 className="text-md font-semibold">Details</h3>
        <fieldset disabled={busy} className="flex flex-col gap-base">
          <Field label="Title" required><Input maxLength={200} value={fields.title} onChange={e => setFields({ ...fields, title: e.target.value })} /></Field>
          <div className="grid gap-base sm:grid-cols-2">
            <Field label="Kind"><Select value={fields.kind} onValueChange={kind => setFields({ ...fields, kind: kind as Fields['kind'] })} options={KINDS} /></Field>
            <Field label="Topics" optional><Combobox multiple value={fields.topicIds} onValueChange={topicIds => setFields({ ...fields, topicIds })} placeholder="None" options={outline.data?.topics.map(t => ({ value: t.id, label: t.title })) ?? []} /></Field>
          </div>
          <Field label="Source" optional><Input maxLength={4000} value={fields.attribution} onChange={e => setFields({ ...fields, attribution: e.target.value })} /></Field>
        </fieldset>
        <div className="flex items-center justify-end gap-snug">
          <SaveIndicator status={meta.status} dirty={fieldsDirty} error={meta.conflict ? undefined : meta.error} onRetry={meta.conflict ? undefined : meta.retry} />
          <Button type="submit" loading={meta.busy} disabled={(!fieldsDirty && !meta.pending) || !fields.title.trim() || meta.conflict}>Save details</Button>
        </div>
      </form>

      <section className="flex flex-col gap-snug">
        <h3 className="text-md font-semibold">Replace the file</h3>
        <p className="text-muted-foreground text-base">Uploads a new version. Title, source and topics stay as they are. {UPLOAD_HINT}</p>
        <div className="flex flex-wrap items-center gap-tight">
          <Button asChild variant="secondary" size="sm">
            <label className={busy ? 'pointer-events-none opacity-50' : 'cursor-pointer'}>
              <UploadIcon />{upload.file ? 'Choose another file' : 'Choose a file'}
              <input type="file" className="sr-only" accept=".txt,.md,.pdf,.docx,.pptx" disabled={busy} onChange={e => upload.setFile(e.target.files?.[0] ?? null)} />
            </label>
          </Button>
          {upload.file && <span className="text-base">{upload.file.name}</span>}
          {upload.file && <Button size="sm" loading={upload.busy} disabled={meta.busy}
            onClick={() => void upload.start({ title: material.title, kind: material.kind, attribution: material.attribution, topicIds: material.topicIds }, material)}>{upload.phase === 'failed' ? 'Retry upload' : 'Upload'}</Button>}
        </div>
        {upload.busy && <div className="flex flex-col gap-1"><span className="text-sm">{PHASE_LABEL[upload.phase]}</span><Progress value={upload.phase === 'uploading' ? upload.progress : null} aria-label="Upload progress" /></div>}
        {upload.error && <FieldError>{upload.error}</FieldError>}
      </section>

      <section className="flex flex-col items-start gap-snug border-t pt-gutter">
        <h3 className="text-md font-semibold">{material.archived ? 'Restore' : 'Archive'}</h3>
        <p className="text-muted-foreground text-base">{material.archived ? 'Return it to the materials list.' : 'Hide it from the materials list. Versions and originals are kept.'}</p>
        <Button variant="secondary" loading={archive.busy} disabled={busy || fieldsDirty}
          onClick={() => archive.run<Material>({ path: `/v1/materials/${material.id}`, method: 'PATCH', body: { archived: !material.archived, expectedRevision: base } }, {
            id: `archive:${base}`, invalidate: [keys.course(material.courseId).materials],
            onSuccess: saved => { onChanged(saved); toast.success(saved.archived ? 'Material archived' : 'Material restored'); },
          })}>{material.archived ? <><ArchiveRestoreIcon />Restore</> : <><ArchiveIcon />Archive</>}</Button>
        {archive.error && <FieldError>{archive.error}</FieldError>}
      </section>
    </div>
  );
}
