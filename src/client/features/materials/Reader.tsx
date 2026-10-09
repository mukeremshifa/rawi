import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import {
  ArchiveIcon, ArchiveRestoreIcon, ClipboardListIcon, DownloadIcon, LinkIcon, MessageSquareIcon, MoreHorizontalIcon,
  PanelRightIcon, RotateCwIcon, UploadIcon,
} from 'lucide-react';
import type { z } from 'zod';
import { materialFields, type Material, type MaterialVersion } from '@shared/contracts/materials';
import type { DocumentBlock } from '@shared/contracts/document';
import type { CourseDetail } from '@shared/contracts/workspace';
import { spansText } from '@shared/domain/document-text';

import { InlineText } from '@/components/InlineText';
import { MATERIAL_KIND_LABEL, VERSION_ORIGIN_LABEL, VERSION_STATUS_LABEL, formatDate } from '@/components/domain';
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
import { DocumentBlocks, pageLabel } from '@/features/materials/DocumentView';
import { PHASE_LABEL, UPLOAD_HINT, useUpload } from '@/features/materials/upload';
import { useAccount } from '@/lib/account';
import { errorMessage, request } from '@/lib/api';
import { useApi, useApiPages, useSave } from '@/lib/data';
import { useUnsentGuard } from '@/lib/hooks';
import { keys } from '@/lib/query';
import { usePageMeta } from '@/lib/shell';

type Fields = z.infer<typeof materialFields>;
const KINDS = (['reading', 'slides', 'other'] as const).map(value => ({ value, label: MATERIAL_KIND_LABEL[value] }));
export const assetPath = (materialId: string, versionId: string) => (assetId: string) => `/api/v1/materials/${materialId}/versions/${versionId}/assets/${assetId}`;
export const blockPath = (materialId: string, versionId: string, blockId?: string) => `/materials/${materialId}/versions/${versionId}${blockId ? `#block-${blockId}` : ''}`;

/** A heading cites its whole section, up to the next heading at its level or above. Other blocks cite themselves. */
function citedBlocks(blocks: DocumentBlock[], block: DocumentBlock) {
  if (block.type !== 'heading') return [block.id];
  const start = blocks.indexOf(block), ids = [block.id];
  for (const next of blocks.slice(start + 1)) {
    if ((next.type === 'heading' && next.content.level <= block.content.level) || ids.length >= 50) break;
    ids.push(next.id);
  }
  return ids;
}

/**
 * The reader: a clean editorial page rendered from the converted document.
 * Serif text at the reading-size preference and a measure of about 68
 * characters, section anchors, quiet source page labels, and a short table
 * of contents. Nothing here is editable. Versions and details live in a side
 * sheet, and the original stays downloadable.
 */
export function MaterialReader() {
  const { materialId = '', versionId } = useParams();
  const { hash } = useLocation();
  const { user } = useAccount();
  const material = useApi<Material>(`/v1/materials/${materialId}`);
  const m = material.data;
  const selected = versionId ?? m?.currentVersionId ?? null;
  const [polling, setPolling] = useState(false);
  const version = useApi<MaterialVersion>(selected ? `/v1/materials/${materialId}/versions/${selected}` : null, { refetchInterval: polling ? 3000 : undefined });
  const v = version.data;
  useEffect(() => { setPolling(v?.status === 'pending' || v?.status === 'processing'); }, [v?.status]);
  const usable = v?.status === 'ready' || v?.status === 'partial';
  const pages = useApiPages<DocumentBlock, 'blocks'>(usable ? `/v1/materials/${materialId}/versions/${v.id}/blocks?limit=500` : null, 'blocks');
  // The whole document loads page by page, so contents and deep links see every block.
  useEffect(() => { if (pages.hasNextPage && !pages.isFetchingNextPage && !pages.error) void pages.fetchNextPage(); }, [pages]);
  const blocks = useMemo(() => pages.items ?? [], [pages.items]);
  const target = /^#block-([0-9a-f-]{36})$/.exec(hash)?.[1] ?? null;
  const [highlight, setHighlight] = useState<string | null>(null);
  useEffect(() => {
    if (!target || !blocks.some(b => b.id === target)) return;
    document.getElementById(`block-${target}`)?.scrollIntoView({ block: 'center' });
    setHighlight(target);
    const timer = setTimeout(() => setHighlight(null), 4000);
    return () => clearTimeout(timer);
  }, [target, blocks]);
  const [panel, setPanel] = useState<null | 'versions' | 'edit'>(null);
  const retry = useSave();
  usePageMeta({ courseId: m?.courseId, crumbs: m ? [{ label: 'Materials', to: `/course/${m.courseId}/materials` }, { label: m.title }] : undefined });

  if (material.isPending) return <Page width="narrow"><PageLoading label="Opening material" /></Page>;
  if (material.error) return <Page width="narrow"><ErrorState error={material.error} onRetry={() => void material.refetch()} /></Page>;
  const row = material.data;
  const download = async () => {
    if (!v) return;
    try {
      const result = await request<{ available: boolean; url?: string; message?: string }>(`/v1/materials/${materialId}/versions/${v.id}/download`, user.id, {}, 'POST');
      if (!result.available || !result.url) { toast(result.message ?? 'There is no original file for this version.'); return; }
      const link = document.createElement('a'); link.href = result.url; link.rel = 'noreferrer'; link.referrerPolicy = 'no-referrer'; link.click();
    } catch (e) { toast.error(errorMessage(e)); }
  };
  const reconvert = () => v && retry.run<MaterialVersion>({ path: `/v1/materials/${materialId}/versions/${v.id}/convert`, body: {} }, {
    id: `convert:${v.id}`, invalidate: [keys.course(row.courseId).materials], onSuccess: next => { version.setData(next); setPolling(true); },
  });
  const originalButton = v?.sourceObjectId ? <Button variant="secondary" size="sm" onClick={() => void download()}><DownloadIcon />Download original</Button> : undefined;
  const pagesText = v ? [...new Set([...v.failedPages, ...v.warnings.flatMap(w => w.code === 'dropped_content' && w.page ? [w.page] : [])])].sort((a, b) => a - b).map(p => pageLabel(v.pagination, p) || `Page ${p}`).join(', ') : '';
  const contents = blocks.filter(b => b.type === 'heading' && b.content.level <= 2);
  const topicId = row.topicIds[0] ?? '';
  return (
    <article className="px-4 pt-8 pb-24 sm:px-gutter">
      <header className="ui-reading mx-auto flex flex-col gap-3">
        <div className="text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
          <span>{MATERIAL_KIND_LABEL[row.kind]}</span>
          {v && <><span aria-hidden>·</span><span>Version {v.number}</span><span aria-hidden>·</span><span>{formatDate(v.createdAt)}</span></>}
          {versionId && versionId !== row.currentVersionId && <Badge variant="warning">Earlier version</Badge>}
          {row.archived && <Badge>Archived</Badge>}
        </div>
        <h1 className="font-serif text-2xl leading-tight font-medium tracking-tight text-balance sm:text-[2.25rem] sm:leading-[1.15]">{row.title}</h1>
        {row.attribution && <p className="text-muted-foreground font-serif text-md"><InlineText text={row.attribution} /></p>}
        <div className="flex flex-wrap items-center gap-tight pt-1">
          <Button asChild variant="secondary" size="sm"><Link to={`/course/${row.courseId}/practice?materialId=${materialId}${v ? `&versionId=${v.id}` : ''}`}><ClipboardListIcon />Practise</Link></Button>
          <Button variant="ghost" size="sm" onClick={() => setPanel('versions')}><PanelRightIcon />Details</Button>
          {v?.sourceObjectId && <Hint label="Download original"><Button variant="ghost" size="icon-sm" aria-label="Download original" onClick={() => void download()}><DownloadIcon /></Button></Hint>}
        </div>
        {versionId && versionId !== row.currentVersionId && <Notice action={<Button asChild variant="link" size="sm"><Link to={`/materials/${materialId}`}>Read the current version</Link></Button>}>You are reading an earlier version.</Notice>}
        {contents.length >= 3 && (
          <details className="text-base">
            <summary className="text-muted-foreground cursor-pointer text-sm font-medium">Contents</summary>
            <ol className="mt-2 flex flex-col gap-1 border-l pl-3">
              {contents.map(h => h.type === 'heading' && (
                <li key={h.id} className={h.content.level === 2 ? 'pl-3' : undefined}><a className="hover:text-primary-text hover:underline" href={`#block-${h.id}`}>{spansText(h.content.spans)}</a></li>
              ))}
            </ol>
          </details>
        )}
      </header>

      <div className="ui-reading mx-auto mt-section flex flex-col gap-gutter">
        {version.isPending && selected && <LoadingState lines={8} label="Loading text" />}
        {version.error && <ErrorState error={version.error} onRetry={() => void version.refetch()} />}
        {!selected && <Notice>This material has no saved version yet.</Notice>}
        {(v?.status === 'pending' || v?.status === 'processing') && (
          <Notice action={originalButton}>
            <span className="inline-flex items-center gap-2"><span className="bg-primary size-2 animate-pulse rounded-full" aria-hidden />Converting this document. It appears here when it is ready, and you can leave this page meanwhile.</span>
          </Notice>
        )}
        {v?.status === 'failed' && (
          <Notice action={<span className="flex gap-tight">{v.retryable && <Button size="sm" loading={retry.busy} onClick={reconvert}><RotateCwIcon />Try again</Button>}{originalButton}</span>}>
            {v.failure ?? 'This document could not be converted.'}{retry.error && <span className="text-danger-text block">{retry.error}</span>}
          </Notice>
        )}
        {v?.status === 'partial' && (
          <Notice action={originalButton}>
            {pagesText ? `Some content could not be converted, from ${pagesText}.` : 'Part of this document could not be converted.'} The rest is below. The original has everything.
          </Notice>
        )}
        {usable && pages.isPending && <LoadingState lines={8} label="Loading text" />}
        {pages.error && <ErrorState error={pages.error} onRetry={() => void pages.refetch()} />}
        {usable && !pages.isPending && !blocks.length && <Notice>No readable text was found in this version.</Notice>}
        {v && blocks.length > 0 && (
          <DocumentBlocks blocks={blocks} pagination={v.pagination} assetUrl={assetPath(materialId, v.id)} highlight={highlight}
            aside={block => (
              <div className="absolute top-0 -right-1 opacity-100 transition-opacity sm:-right-11 sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100">
                <BlockActions tutor={`/course/${row.courseId}/tutor?materialId=${materialId}&versionId=${v.id}&blockIds=${citedBlocks(blocks, block).join(',')}&topicId=${topicId}`}
                  link={blockPath(materialId, v.id, block.id)} section={block.type === 'heading'} />
              </div>
            )} />
        )}
        {usable && blocks.length > 0 && !pages.hasNextPage && (
          <footer className="text-muted-foreground flex flex-col gap-1 border-t pt-gutter text-sm">
            <span>End of {row.title}.</span>
            {row.attribution && <span className="font-serif"><InlineText text={row.attribution} /></span>}
          </footer>
        )}
      </div>

      <MaterialSheet material={row} version={v} panel={panel} onPanel={setPanel} onChanged={next => material.setData(next)} reload={() => { void material.refetch(); void version.refetch(); }} />
    </article>
  );
}

function BlockActions({ tutor, link, section }: { tutor: string; link: string; section: boolean }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild><Button variant="ghost" size="icon-sm" aria-label={section ? 'Section actions' : 'Block actions'}><MoreHorizontalIcon /></Button></DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem asChild><Link to={tutor}><MessageSquareIcon />{section ? 'Discuss this section with the tutor' : 'Discuss this with the tutor'}</Link></DropdownMenuItem>
        <DropdownMenuItem onSelect={() => { void navigator.clipboard?.writeText(new URL(link, location.origin).href).then(() => toast.success('Link copied'), () => toast(link)); }}><LinkIcon />Copy link</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
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
      <p className="text-muted-foreground text-base">Every version keeps its converted text, so citations keep pointing at the exact blocks.</p>
      <ol className="divide-y border-y">
        {versions.items?.map(v => (
          <li key={v.id}>
            <Link to={v.id === material.currentVersionId ? `/materials/${material.id}` : `/materials/${material.id}/versions/${v.id}`} onClick={onNavigate}
              className="hover:bg-surface flex items-center gap-snug py-2.5 outline-none focus-visible:bg-surface">
              <span className="tabular w-10 text-sm font-medium">v{v.number}</span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="text-base">{VERSION_ORIGIN_LABEL[v.origin]}{v.status !== 'ready' ? `, ${VERSION_STATUS_LABEL[v.status].toLowerCase()}` : ''}</span>
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
