import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CheckIcon, ChevronDownIcon, ChevronUpIcon, FileIcon, RotateCwIcon, TriangleAlertIcon, XIcon } from 'lucide-react';
import { fileTypes, uploadInput, type Material, type MaterialVersion, type UploadState, type UploadTicket } from '@shared/contracts/materials';

import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { useAccount } from '@/lib/account';
import { errorMessage, request, RequestError } from '@/lib/api';
import { keys } from '@/lib/query';
import { cn } from '@/lib/utils';

export type FileType = typeof fileTypes[number];
export type Stage = 'waiting' | 'preparing' | 'uploading' | 'saving' | 'converting' | 'ready' | 'failed';
export type NewVersionOf = Pick<Material, 'id' | 'revision' | 'title' | 'kind' | 'attribution' | 'topicIds'>;
export interface QueueItem {
  id: string; courseId: string; file: File; type: FileType; checksum: string;
  title: string; kind: Material['kind']; topicIds: string[];
  /** Set when the file is a new version of an existing material. */
  material?: NewVersionOf;
  stage: Stage; progress: number; error?: string;
  /** A failed transfer that Retry can send again from the file still in memory. */
  retryable?: boolean;
  requestId: string; materialId?: string; versionId?: string;
}
export type QueueInput = Pick<QueueItem, 'courseId' | 'file' | 'type' | 'checksum' | 'title' | 'kind' | 'topicIds' | 'material'>;

const PARALLEL = 3;
const TRANSFERRING = new Set<Stage>(['waiting', 'preparing', 'uploading', 'saving']);
const ACTIVE = new Set<Stage>(['preparing', 'uploading', 'saving']);
export const unsettled = (item: QueueItem) => TRANSFERRING.has(item.stage) || item.stage === 'converting';

// Errors where sending the same request again cannot help.
const FINAL = new Set(['invalid_file', 'invalid_text', 'file_limit', 'invalid_input', 'revision_conflict', 'not_found', 'create_conflict', 'account_changed', 'unauthenticated']);

export const STAGE_LABEL: Record<Stage, string> = {
  waiting: 'Waiting', preparing: 'Preparing', uploading: 'Uploading', saving: 'Saving', converting: 'Converting', ready: 'Ready', failed: 'Not uploaded',
};
export function stageText(item: QueueItem) {
  if (item.stage === 'uploading') return `Uploading ${item.progress}%`;
  if (item.stage === 'failed') return item.error ?? STAGE_LABEL.failed;
  return STAGE_LABEL[item.stage];
}

function send(url: string, headers: Record<string, string>, file: File, onProgress: (percent: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url); xhr.withCredentials = false; xhr.timeout = 10 * 60000;
    for (const [key, value] of Object.entries(headers)) xhr.setRequestHeader(key, value);
    xhr.upload.onprogress = e => { if (e.lengthComputable) onProgress(Math.round(e.loaded / e.total * 100)); };
    xhr.onload = () => xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error('The file did not reach storage.'));
    xhr.onerror = () => reject(new Error('Storage could not be reached. Check your connection.'));
    xhr.ontimeout = () => reject(new Error('The upload timed out.'));
    xhr.send(file);
  });
}
const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const firstSentence = (text: string) => /^.*?[.!?](?=\s|$)/.exec(text)?.[0] ?? text;

interface Queue {
  items: QueueItem[];
  enqueue: (inputs: QueueInput[]) => void;
  retry: (id: string) => void;
  remove: (id: string) => void;
}
const QueueContext = createContext<Queue | null>(null);
export function useUploadQueue() {
  const value = useContext(QueueContext);
  if (!value) throw new Error('The upload queue is missing');
  return value;
}

/**
 * The upload queue for the signed-in account. It sits above the routes, so
 * uploads keep going while the learner moves between pages, but it lives in
 * memory only: a reload or a closed tab loses whatever has not reached
 * storage, and the server lets those tickets expire. Each file asks for its
 * own ticket just before its transfer, at most three at a time.
 */
export function UploadQueueProvider({ children }: { children: ReactNode }) {
  const { user } = useAccount();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [items, setItems] = useState<QueueItem[]>([]);
  const launched = useRef(new Set<string>());
  const update = useCallback((id: string, patch: Partial<QueueItem>) => setItems(list => list.map(i => i.id === id ? { ...i, ...patch } : i)), []);

  const announce = useCallback((item: QueueItem, version: Pick<MaterialVersion, 'status' | 'failure'>) => {
    const name = item.material ? `The new version of ${item.material.title}` : item.title;
    const open = { label: 'Open', onClick: () => navigate(`/materials/${item.materialId}`) };
    if (version.status === 'failed') toast.error(`${name} could not be converted`, { description: firstSentence(version.failure ?? 'Open it to try again.'), action: open });
    else toast.success(`${name} is ready`, { action: open });
  }, [navigate]);

  const refresh = useCallback((courseId: string, materialId?: string) => {
    void qc.invalidateQueries({ queryKey: keys.course(courseId).materials });
    if (materialId) void qc.invalidateQueries({ queryKey: keys.material(materialId) });
  }, [qc]);

  const transfer = useCallback(async (item: QueueItem) => {
    const { id, courseId, file, material } = item;
    update(id, { stage: 'preparing', progress: 0, error: undefined, retryable: undefined });
    try {
      const body = (requestId: string) => uploadInput.parse({
        title: item.title, kind: item.kind, attribution: material?.attribution ?? '', topicIds: item.topicIds, requestId,
        materialId: material?.id, expectedRevision: material?.revision, fileName: file.name, size: file.size, type: item.type, checksum: item.checksum,
      });
      let ticket = await request<UploadTicket>(`/v1/courses/${courseId}/uploads`, user.id, body(item.requestId), 'POST');
      if (ticket.upload.state === 'failed') {
        // An earlier attempt expired. The file is still here, so start a fresh request.
        const requestId = crypto.randomUUID();
        update(id, { requestId });
        ticket = await request<UploadTicket>(`/v1/courses/${courseId}/uploads`, user.id, body(requestId), 'POST');
      }
      let upload: UploadState = ticket.upload;
      if (upload.state === 'pending') {
        if (!ticket.url || !ticket.headers) throw new Error(upload.failure ?? 'The upload could not start.');
        update(id, { stage: 'uploading' });
        await send(ticket.url, ticket.headers, file, progress => update(id, { progress }));
        update(id, { stage: 'saving' });
        // A finalize that fails for a passing reason is tried twice more before Retry shows.
        for (let attempt = 1; ; attempt++) {
          try { upload = await request<UploadState>(`/v1/uploads/${upload.id}/finalize`, user.id, {}, 'POST'); break; }
          catch (e) { if (attempt >= 3 || (e instanceof RequestError && FINAL.has(e.code))) throw e; await pause(attempt * 2000); }
        }
      }
      if (upload.state !== 'ready' || !upload.resultVersionId) throw new RequestError('upload_failed', upload.failure ?? 'The upload did not finish.');
      refresh(courseId, upload.materialId);
      const done = { ...item, materialId: upload.materialId, versionId: upload.resultVersionId };
      if (item.type === 'md' || item.type === 'txt') { update(id, { ...done, stage: 'ready', progress: 100 }); announce(done, { status: 'ready', failure: null }); }
      else update(id, { ...done, stage: 'converting', progress: 100 });
    } catch (e) {
      update(id, { stage: 'failed', error: errorMessage(e), retryable: !(e instanceof RequestError && FINAL.has(e.code)) });
    }
  }, [user.id, update, refresh, announce]);

  // Start waiting files while fewer than three are moving.
  useEffect(() => {
    const busy = items.filter(i => ACTIVE.has(i.stage)).length;
    const next = items.filter(i => i.stage === 'waiting' && !launched.current.has(i.id)).slice(0, Math.max(0, PARALLEL - busy));
    for (const item of next) { launched.current.add(item.id); void transfer(item); }
  }, [items, transfer]);

  // Converting files are watched through their version, which also advances the conversion.
  const converting = items.filter(i => i.stage === 'converting');
  const watched = converting.map(i => i.id).join(',');
  useEffect(() => {
    if (!watched) return;
    let stopped = false;
    const check = async () => {
      for (const item of converting) {
        try {
          const version = await request<MaterialVersion>(`/v1/materials/${item.materialId}/versions/${item.versionId}`, user.id);
          if (stopped || version.status === 'pending' || version.status === 'processing') continue;
          update(item.id, version.status === 'failed' ? { stage: 'failed', error: firstSentence(version.failure ?? 'The document could not be converted.'), retryable: false } : { stage: 'ready' });
          refresh(item.courseId, item.materialId);
          announce(item, version);
        } catch { /* The next check tries again. */ }
      }
    };
    let timer = setTimeout(function tick() { void check().then(() => { if (!stopped) timer = setTimeout(tick, 3000); }); }, 3000);
    return () => { stopped = true; clearTimeout(timer); };
    // The watched ids stand in for the converting list.
  }, [watched, user.id, update, refresh, announce]);

  // Only bytes still on their way are lost by leaving, so only they warn.
  const transferring = items.some(i => TRANSFERRING.has(i.stage));
  useEffect(() => {
    if (!transferring) return;
    const unload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', unload);
    return () => window.removeEventListener('beforeunload', unload);
  }, [transferring]);

  // Finished files leave a few seconds after everything settles. Failed transfers stay for Retry.
  const settled = items.length > 0 && !items.some(unsettled);
  useEffect(() => {
    if (!settled) return;
    const timer = setTimeout(() => setItems(list => list.filter(i => i.stage === 'failed' && i.retryable)), 5000);
    return () => clearTimeout(timer);
  }, [settled]);

  const value = useMemo<Queue>(() => ({
    items,
    enqueue: inputs => setItems(list => [...list, ...inputs.map(input => ({ ...input, id: crypto.randomUUID(), requestId: crypto.randomUUID(), stage: 'waiting' as const, progress: 0 }))]),
    retry: id => { launched.current.delete(id); update(id, { stage: 'waiting', error: undefined, retryable: undefined, progress: 0 }); },
    remove: id => setItems(list => list.filter(i => i.id !== id || !(i.stage === 'waiting' || i.stage === 'failed'))),
  }), [items, update]);
  return <QueueContext.Provider value={value}>{children}</QueueContext.Provider>;
}

/** One queued file: its name, state and progress, with Retry or Remove where they apply. */
export function QueueRow({ item, className }: { item: QueueItem; className?: string }) {
  const { retry, remove } = useUploadQueue();
  const failed = item.stage === 'failed';
  return (
    <div className={cn('flex items-start gap-snug', className)}>
      {failed ? <TriangleAlertIcon className="text-danger-text mt-0.5 size-4 shrink-0" aria-hidden />
        : item.stage === 'ready' ? <CheckIcon className="text-success mt-0.5 size-4 shrink-0" aria-hidden />
          : <FileIcon className="text-muted-foreground mt-0.5 size-4 shrink-0" aria-hidden />}
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-baseline gap-2">
          {item.materialId && item.stage !== 'converting' ? <Link to={`/materials/${item.materialId}`} className="truncate text-base font-medium hover:underline">{item.title}</Link>
            : <span className="truncate text-base font-medium">{item.title}</span>}
          <span className={cn('tabular shrink-0 text-sm', failed ? 'text-danger-text' : 'text-muted-foreground')}>{failed ? STAGE_LABEL.failed : stageText(item)}</span>
        </div>
        {(item.stage === 'uploading' || item.stage === 'preparing' || item.stage === 'saving' || item.stage === 'converting') &&
          <Progress value={item.stage === 'uploading' ? item.progress : null} aria-label={`${item.title}: ${stageText(item)}`} />}
        {failed && item.error && <p className="text-muted-foreground text-sm">{item.error}</p>}
      </div>
      {failed && item.retryable && <Button variant="ghost" size="sm" onClick={() => retry(item.id)}><RotateCwIcon />Retry</Button>}
      {(item.stage === 'waiting' || failed) && <Button variant="ghost" size="icon-sm" aria-label={`Remove ${item.title}`} onClick={() => remove(item.id)}><XIcon /></Button>}
    </div>
  );
}

/** A one-line summary of the queue, such as "Uploading 2 of 3". */
export function queueSummary(items: QueueItem[]) {
  const moving = items.filter(i => TRANSFERRING.has(i.stage)).length;
  const converting = items.filter(i => i.stage === 'converting').length;
  const failed = items.filter(i => i.stage === 'failed').length;
  if (moving) return `Uploading ${Math.min(items.length, items.length - moving + 1)} of ${items.length}`;
  if (converting) return converting === 1 ? 'Converting 1 file' : `Converting ${converting} files`;
  if (failed) return failed === 1 ? '1 file not uploaded' : `${failed} files not uploaded`;
  return items.length === 1 ? '1 file ready' : `${items.length} files ready`;
}

/**
 * The upload tray: a small panel in the corner of the shell while files are
 * moving. It collapses to one line and leaves once everything settles.
 * Changes are announced politely.
 */
export function UploadTray({ className }: { className?: string }) {
  const { items } = useUploadQueue();
  const [open, setOpen] = useState(true);
  if (!items.length) return null;
  const summary = queueSummary(items);
  const moving = items.some(unsettled);
  return (
    <section aria-label="Uploads" className={cn('bg-popover text-popover-foreground w-[min(22rem,calc(100vw-2rem))] rounded-lg border shadow-raised', className)}>
      <div className="flex items-center gap-2 py-1.5 pr-1.5 pl-3">
        {moving ? <span className="bg-primary size-2 shrink-0 animate-pulse rounded-full" aria-hidden />
          : items.some(i => i.stage === 'failed') ? <TriangleAlertIcon className="text-danger-text size-4 shrink-0" aria-hidden />
            : <CheckIcon className="text-success size-4 shrink-0" aria-hidden />}
        <p className="flex-1 truncate text-sm font-medium" role="status" aria-live="polite">{summary}</p>
        <Button variant="ghost" size="icon-sm" aria-expanded={open} aria-label={open ? 'Hide upload details' : 'Show upload details'} onClick={() => setOpen(!open)}>{open ? <ChevronDownIcon /> : <ChevronUpIcon />}</Button>
      </div>
      {open && (
        <ul className="flex max-h-72 flex-col gap-snug overflow-y-auto border-t px-3 py-2.5">
          {items.map(item => <li key={item.id}><QueueRow item={item} /></li>)}
        </ul>
      )}
    </section>
  );
}
