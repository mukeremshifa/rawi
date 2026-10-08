import { useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ArchiveIcon, ArchiveRestoreIcon, MoreHorizontalIcon, PencilIcon, PlayIcon } from 'lucide-react';
import type { LearningRun, LearningSet, VersionedQuestion } from '@shared/contracts/learning';

import { DIFFICULTY_LABEL, FORMAT_LABEL } from '@/components/domain';
import { Page, PageHeader, Section } from '@/components/layout';
import { ErrorState, PageLoading } from '@/components/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Field, FieldError } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { useApi, useSave } from '@/lib/data';
import { useUnsentGuard } from '@/lib/hooks';
import { activityKeys, keys } from '@/lib/query';
import { usePageMeta } from '@/lib/shell';

type SetRecord = { set: LearningSet; items: { id: string; question: VersionedQuestion }[] };

/** A saved set: its questions, a summary of its settings, and Start. */
export function PracticeSet() {
  const { id = '' } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const planned = params.get('plannedSessionId');
  const record = useApi<SetRecord>(`/v1/sets/${id}`);
  const start = useSave(), edit = useSave();
  const startId = useRef(crypto.randomUUID());
  const [renaming, setRenaming] = useState<string | null>(null);
  useUnsentGuard(renaming !== null && renaming !== record.data?.set.name || edit.pending);
  usePageMeta({ courseId: record.data?.set.courseId, crumbs: record.data ? [{ label: 'Practice', to: `/course/${record.data.set.courseId}/practice` }, { label: record.data.set.name }] : undefined });
  if (record.isPending) return <Page width="narrow"><PageLoading label="Loading set" /></Page>;
  if (record.error) return <Page width="narrow"><ErrorState error={record.error} onRetry={() => void record.refetch()} /></Page>;
  const { set, items } = record.data;
  const update = (patch: { name?: string; archived?: boolean }) => edit.run<LearningSet>(
    { path: `/v1/sets/${id}`, method: 'PATCH', body: { operationId: crypto.randomUUID(), expectedRevision: set.revision, name: patch.name ?? set.name, archived: patch.archived ?? set.archived } },
    { id: `set:${set.revision}:${patch.name ?? ''}:${patch.archived ?? ''}`, invalidate: [keys.course(set.courseId).sets],
      onSuccess: saved => { record.setData({ ...record.data, set: saved }); setRenaming(null); if (patch.archived !== undefined) toast.success(saved.archived ? 'Set archived' : 'Set restored'); } });
  return (
    <Page width="narrow">
      <PageHeader title={set.name}
        description={`${items.length} questions · ${set.feedback === 'immediate' ? 'Feedback after each answer' : 'Feedback at the end'}${set.hintsAllowed ? ' · Hints allowed' : ''}`}
        actions={<>
          {set.archived && <Badge>Archived</Badge>}
          <DropdownMenu>
            <DropdownMenuTrigger asChild><Button variant="secondary" size="icon" aria-label="Set options"><MoreHorizontalIcon /></Button></DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onSelect={() => setRenaming(set.name)}><PencilIcon />Rename</DropdownMenuItem>
              <DropdownMenuItem disabled={edit.busy} onSelect={() => update({ archived: !set.archived })}>{set.archived ? <><ArchiveRestoreIcon />Restore</> : <><ArchiveIcon />Archive</>}</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button size="lg" loading={start.busy} disabled={set.archived}
            onClick={() => start.run<LearningRun>({ path: `/v1/sets/${id}/runs`, body: { id: startId.current, ...(planned ? { plannedSessionId: planned } : {}) } },
              { id: `start:${startId.current}`, invalidate: [keys.course(set.courseId).runs, ...activityKeys], onSuccess: run => navigate(`/runs/${run.id}`) })}>
            <PlayIcon />{start.status === 'failed' ? 'Retry' : 'Start'}
          </Button>
        </>} />
      {start.error && <FieldError>{start.error}</FieldError>}
      {edit.error && !renaming && <ErrorState title="The set was not updated" detail={edit.conflict ? 'It changed in another tab. Reload to see the latest version.' : edit.error} onRetry={edit.conflict ? () => { edit.discard(); void record.refetch(); } : edit.retry} retryLabel={edit.conflict ? 'Reload' : 'Try again'} />}
      <Section title="Questions">
        <ol className="divide-y border-y">
          {items.map((item, i) => (
            <li key={item.id} className="flex gap-snug py-3">
              <span className="text-muted-foreground tabular w-6 shrink-0 text-right text-sm">{i + 1}</span>
              <div className="flex min-w-0 flex-col gap-1">
                <p className="text-base">{item.question.prompt}</p>
                <p className="text-muted-foreground text-sm">{item.question.topicLabel} · {FORMAT_LABEL[item.question.format]} · {DIFFICULTY_LABEL[item.question.difficulty]}</p>
              </div>
            </li>
          ))}
        </ol>
      </Section>
      <Dialog open={renaming !== null} onOpenChange={open => { if (!open && !edit.busy) { setRenaming(null); edit.discard(); } }}>
        <DialogContent size="sm">
          <form onSubmit={e => { e.preventDefault(); if (renaming?.trim()) update({ name: renaming.trim() }); }}>
            <DialogHeader><DialogTitle>Rename set</DialogTitle></DialogHeader>
            <DialogBody>
              <Field label="Name" required><Input autoFocus maxLength={200} value={renaming ?? ''} disabled={edit.busy || edit.pending} onChange={e => setRenaming(e.target.value)} /></Field>
              {edit.error && <FieldError>{edit.conflict ? 'This set changed in another tab. Close and reload to rename it.' : edit.error}</FieldError>}
            </DialogBody>
            <DialogFooter>
              <Button type="button" variant="secondary" disabled={edit.busy} onClick={() => { setRenaming(null); edit.discard(); }}>Cancel</Button>
              <Button type="submit" loading={edit.busy} disabled={!renaming?.trim() || edit.conflict}>{edit.status === 'failed' && !edit.conflict ? 'Retry' : 'Rename'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Page>
  );
}
