import { useCallback, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { FileIcon, UploadIcon, XIcon } from 'lucide-react';
import { fileTypes } from '@shared/contracts/constants';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAccount } from '@/lib/account';
import { request } from '@/lib/api';
import { cn } from '@/lib/utils';
import type { FileType, QueueInput } from '@/features/materials/queue';

export const MAX_BATCH = 10;
const MB = 1048576;
export const ACCEPT = fileTypes.map(t => `.${t}`).join(',');
export const UPLOAD_HINT =
  'PDF, Word, PowerPoint, Markdown or text, up to 25 MB, or 1 MB for text. Documents are converted into a readable page, and the original stays downloadable.';

/** The file type, or a short reason it cannot be uploaded. */
export function checkFile(file: File): { type: FileType } | { reason: string } {
  const type = file.name.split('.').pop()?.toLowerCase();
  if (!type || !fileTypes.includes(type as FileType) || !file.name.includes('.'))
    return { reason: 'Not a supported type. Use PDF, DOCX, PPTX, Markdown or text.' };
  if (file.size === 0) return { reason: 'The file is empty.' };
  if ((type === 'md' || type === 'txt') && file.size > MB) return { reason: 'Text files can be up to 1 MB.' };
  if (file.size > 25 * MB) return { reason: 'Files can be up to 25 MB.' };
  return { type: type as FileType };
}

/** A readable title from a filename: no extension, spaces for underscores and hyphens, the learner's casing kept. */
export function titleFromName(name: string) {
  const title = name
    .replace(/\.[^.]+$/, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200)
    .trim();
  return title || name.slice(0, 200);
}

export async function hashFile(file: File) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', await file.arrayBuffer())), n =>
    n.toString(16).padStart(2, '0'),
  ).join('');
}

export const formatSize = (bytes: number) =>
  bytes < MB ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / MB).toFixed(1)} MB`;

export interface Staged {
  id: string;
  file: File;
  type: FileType;
  title: string;
  checksum?: string;
  /** The material that already has this exact file, until the learner decides. */
  duplicate?: { materialId: string; title: string };
}
export interface Rejected {
  name: string;
  reason: string;
}

/**
 * Files chosen or dropped but not yet sent. Each is checked, hashed, and
 * compared with the originals already in the course, so a duplicate can be
 * skipped before any bytes move.
 */
export function useStaging(courseId: string) {
  const { user } = useAccount();
  const [staged, setStaged] = useState<Staged[]>([]);
  const [rejected, setRejected] = useState<Rejected[]>([]);
  const count = useRef(0);
  count.current = staged.length;

  const add = useCallback(
    (files: File[]) => {
      const accepted: Staged[] = [],
        refused: Rejected[] = [];
      for (const file of files) {
        const checked = checkFile(file);
        if ('reason' in checked) refused.push({ name: file.name, reason: checked.reason });
        else if (count.current + accepted.length >= MAX_BATCH)
          refused.push({ name: file.name, reason: `Up to ${MAX_BATCH} files can be added at a time.` });
        else accepted.push({ id: crypto.randomUUID(), file, type: checked.type, title: titleFromName(file.name) });
      }
      setRejected(refused);
      if (!accepted.length) return;
      count.current += accepted.length;
      setStaged(list => [...list, ...accepted]);
      void (async () => {
        const hashed = await Promise.all(accepted.map(async s => ({ id: s.id, checksum: await hashFile(s.file) })));
        let originals: { checksum: string; materialId: string; title: string }[] = [];
        try {
          originals = (
            await request<{ originals: typeof originals }>(
              `/v1/courses/${courseId}/originals?checksums=${hashed.map(h => h.checksum).join(',')}`,
              user.id,
            )
          ).originals;
        } catch {
          /* Without the check, the files upload as usual. */
        }
        setStaged(list => {
          const seen = new Set(list.filter(s => s.checksum).map(s => s.checksum));
          const repeats: Rejected[] = [];
          const next = list.flatMap(s => {
            const hash = hashed.find(h => h.id === s.id);
            if (!hash) return [s];
            if (seen.has(hash.checksum)) {
              repeats.push({ name: s.file.name, reason: 'Already added above.' });
              return [];
            }
            seen.add(hash.checksum);
            const match = originals.find(o => o.checksum === hash.checksum);
            return [
              {
                ...s,
                checksum: hash.checksum,
                duplicate: match ? { materialId: match.materialId, title: match.title } : undefined,
              },
            ];
          });
          if (repeats.length) setRejected(r => [...r, ...repeats]);
          return next;
        });
      })();
    },
    [courseId, user.id],
  );

  const update = (id: string, patch: Partial<Staged>) =>
    setStaged(list => list.map(s => (s.id === id ? { ...s, ...patch } : s)));
  const remove = (id: string) => setStaged(list => list.filter(s => s.id !== id));
  const clear = () => {
    setStaged([]);
    setRejected([]);
  };
  const checking = staged.some(s => !s.checksum);
  const ready = staged.filter(s => s.checksum && !s.duplicate);
  /** Queue entries for every checked file that is not an undecided duplicate. */
  const take = (): QueueInput[] =>
    ready.map(s => ({
      courseId,
      file: s.file,
      type: s.type,
      checksum: s.checksum!,
      title: s.title.trim() || titleFromName(s.file.name),
      kind: s.type === 'pptx' ? 'slides' : 'reading',
    }));
  return { staged, rejected, add, update, remove, clear, checking, ready, take };
}

/** Files from a drag, or none when the drag carries something else. */
export const dragHasFiles = (e: DragEvent | React.DragEvent) =>
  !!e.dataTransfer && Array.from(e.dataTransfer.types).includes('Files');

/** The drop zone, with a button that does the same for keyboard and screen reader users. */
export function DropZone({
  onFiles,
  dragging,
  compact,
}: {
  onFiles: (files: File[]) => void;
  dragging?: boolean;
  compact?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <div
      className={cn(
        'flex flex-col items-center gap-snug rounded-lg border border-dashed text-center transition-colors',
        compact ? 'p-4' : 'px-4 py-8',
        dragging ? 'border-primary bg-primary-subtle' : 'bg-surface',
      )}
    >
      {!compact && <UploadIcon className="text-muted-foreground size-6" aria-hidden />}
      <p className="text-base">{dragging ? 'Drop to add these files' : 'Drag files here, or'}</p>
      <Button type="button" variant="secondary" onClick={() => input.current?.click()}>
        <UploadIcon />
        Choose files
      </Button>
      <input
        ref={input}
        type="file"
        multiple
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        accept={ACCEPT}
        onChange={e => {
          onFiles(Array.from(e.target.files ?? []));
          e.target.value = '';
        }}
      />
      <p className="text-muted-foreground max-w-prose text-sm">
        Up to {MAX_BATCH} files at a time. {UPLOAD_HINT}
      </p>
    </div>
  );
}

/** A staged file: its editable title, size, and the duplicate decision when there is one. */
export function StagedRow({
  item,
  onTitle,
  onRemove,
  onKeep,
}: {
  item: Staged;
  onTitle: (title: string) => void;
  onRemove: () => void;
  onKeep: () => void;
}) {
  return (
    <li className="flex flex-col gap-1.5 py-2.5">
      <div className="flex items-center gap-snug">
        <FileIcon className="text-muted-foreground size-4 shrink-0" aria-hidden />
        <Input
          className="h-8 flex-1"
          maxLength={200}
          value={item.title}
          aria-label={`Title for ${item.file.name}`}
          onChange={e => onTitle(e.target.value)}
        />
        <Button variant="ghost" size="icon-sm" aria-label={`Remove ${item.file.name}`} onClick={onRemove}>
          <XIcon />
        </Button>
      </div>
      <p className="text-muted-foreground pl-6 text-sm">
        <span className="break-all">{item.file.name}</span> ·{' '}
        <span className="tabular">{formatSize(item.file.size)}</span>
        {!item.checksum && ' · Checking'}
      </p>
      {item.duplicate && (
        <div className="bg-warning-subtle text-warning-text ml-6 flex flex-wrap items-center gap-x-snug gap-y-1 rounded-md px-2.5 py-1.5 text-sm">
          <span className="flex-1">
            Already in this course as{' '}
            <Link className="font-medium underline" to={`/materials/${item.duplicate.materialId}`}>
              {item.duplicate.title}
            </Link>
            .
          </span>
          <span className="flex gap-1">
            <Button size="sm" variant="ghost" onClick={onRemove}>
              Skip
            </Button>
            <Button size="sm" variant="secondary" onClick={onKeep}>
              Upload anyway
            </Button>
          </span>
        </div>
      )}
    </li>
  );
}
