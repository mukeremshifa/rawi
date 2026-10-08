import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ArchiveIcon, ArchiveRestoreIcon, ArrowUpIcon, BookOpenIcon, CheckCircleIcon, MoreHorizontalIcon, PencilIcon, PlusIcon, SearchIcon } from 'lucide-react';
import type { CourseDetail } from '@shared/contracts/workspace';
import type { Passage } from '@shared/contracts/materials';
import type { TutorDetail, TutorMessage, TutorSession } from '@shared/contracts/tutor';
import { STAGE_LABEL } from '@shared/domain/tutor';

import { formatRelative } from '@/components/domain';
import { Page, PageHeader, Toolbar } from '@/components/layout';
import { EmptyState, ErrorState, LoadingState, Notice, PageLoading } from '@/components/states';
import { Prose } from '@/components/Prose';
import { useConfirm } from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Combobox } from '@/components/ui/combobox';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Field, FieldError } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { List, ListLoading, ListRow } from '@/components/ui/list';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { Select } from '@/components/ui/select';
import { Sheet, SheetBody, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/textarea';
import { renderCitations } from '@/features/tutor/citations';
import { PassageText } from '@/features/materials/Reader';
import { useAccount } from '@/lib/account';
import { request } from '@/lib/api';
import { useApi, useApiPages, useSave } from '@/lib/data';
import { useUnsentGuard } from '@/lib/hooks';
import { activityKeys, keys } from '@/lib/query';
import { usePageMeta } from '@/lib/shell';
import { cn } from '@/lib/utils';

const ACTIONS = [
  { value: 'message', label: 'Answer my question' },
  { value: 'explain', label: 'Explain it' },
  { value: 'example', label: 'Give an example' },
  { value: 'hint', label: 'Give me a hint' },
  { value: 'check', label: 'Check my understanding' },
  { value: 'simpler', label: 'Make it simpler' },
];
const GROUNDING_LABEL: Record<string, string> = {
  materials: 'From your materials', mixed: 'Partly beyond your materials', general: 'General explanation, not from your materials', insufficient: 'Your materials do not cover this',
};

/** Tutor sessions for a course, and New session in a dialog. */
export function TutorLibrary() {
  const { id = '' } = useParams();
  const [params] = useSearchParams();
  const [status, setStatus] = useState<'active' | 'archived'>('active');
  const [query, setQuery] = useState('');
  const sessions = useApiPages<TutorSession, 'sessions'>(`/v1/courses/${id}/tutor`, 'sessions');
  const fromContext = !!(params.get('passageId') || params.get('attemptId'));
  const [creating, setCreating] = useState(fromContext);
  const rows = sessions.items?.filter(s => s.archived === (status === 'archived') && s.title.toLowerCase().includes(query.trim().toLowerCase())) ?? [];
  return (
    <Page>
      <PageHeader title="Tutor" actions={<Button size="lg" onClick={() => setCreating(true)}><PlusIcon />New session</Button>} />
      <Notice>Tutor replies aren't available yet. Sessions keep your questions and sources so you can pick them up later.</Notice>
      <div className="flex flex-col gap-snug">
        <Toolbar>
          <div className="relative w-64 max-w-full">
            <SearchIcon className="text-muted-foreground absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2" aria-hidden />
            <Input aria-label="Search sessions" placeholder="Search sessions" className="pl-8" value={query} onChange={e => setQuery(e.target.value)} />
          </div>
          <SegmentedControl aria-label="Session status" value={status} onValueChange={setStatus} options={[{ value: 'active', label: 'Active' }, { value: 'archived', label: 'Archived' }]} />
        </Toolbar>
        {sessions.error ? <ErrorState error={sessions.error} onRetry={() => void sessions.refetch()} /> : sessions.isPending ? <ListLoading rows={3} /> : !rows.length ? (
          <EmptyState compact title={query ? 'No sessions match your search' : status === 'archived' ? 'No archived sessions' : 'No sessions yet'} description={!query && status === 'active' ? 'Start a session on a topic, a passage or an answer you want to understand.' : undefined} />
        ) : (
          <List>
            {rows.map(s => <ListRow key={s.id} to={`/tutor/${s.id}`} title={s.title} meta={`${s.topicLabel} · ${STAGE_LABEL[s.stage]}${s.endedAt ? ' · Ended' : ''}`} trailing={formatRelative(s.updatedAt)} />)}
          </List>
        )}
        {sessions.hasNextPage && <Button variant="secondary" className="self-start" loading={sessions.isFetchingNextPage} onClick={() => void sessions.fetchNextPage()}>Load more</Button>}
      </div>
      <NewSessionDialog courseId={id} open={creating} onOpenChange={setCreating} />
    </Page>
  );
}

function NewSessionDialog({ courseId, open, onOpenChange }: { courseId: string; open: boolean; onOpenChange: (open: boolean) => void }) {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const outline = useApi<CourseDetail>(`/v1/courses/${courseId}/topics`);
  const [title, setTitle] = useState('');
  const [topicId, setTopicId] = useState(params.get('topicId') ?? '');
  const body = useRef<unknown>(null);
  const save = useSave();
  const allow = useUnsentGuard(open && !!title || save.pending);
  const historical = params.get('attemptId') && topicId && outline.data && !outline.data.topics.some(t => t.id === topicId);
  const options = [...(historical ? [{ value: topicId, label: 'Topic from your saved answer' }] : []), ...(outline.data?.topics.map(t => ({ value: t.id, label: t.title })) ?? [])];
  const create = () => {
    body.current ??= {
      id: crypto.randomUUID(), title, topicId,
      ...(params.get('plannedSessionId') ? { plannedSessionId: params.get('plannedSessionId') } : {}),
      ...(params.get('passageId') ? { source: { materialId: params.get('materialId'), versionId: params.get('versionId'), passageId: params.get('passageId') } } : {}),
      ...(params.get('attemptId') ? { review: { attemptId: params.get('attemptId'), questionId: params.get('questionId') } } : {}),
    };
    save.run<TutorDetail>({ path: `/v1/courses/${courseId}/tutor`, body: body.current }, {
      id: 'new-session', invalidate: [keys.course(courseId).tutor, ...activityKeys],
      onSuccess: d => { body.current = null; allow(); navigate(`/tutor/${d.session.id}`); },
    });
  };
  return (
    <Dialog open={open} onOpenChange={next => { if (!save.busy) onOpenChange(next); }}>
      <DialogContent>
        <form onSubmit={e => { e.preventDefault(); create(); }}>
          <DialogHeader>
            <DialogTitle>New tutor session</DialogTitle>
            <DialogDescription>{params.get('passageId') ? 'The session keeps the exact passage you came from.' : params.get('attemptId') ? 'The session keeps your saved answer and its feedback.' : 'Pick the topic you want to work on.'}</DialogDescription>
          </DialogHeader>
          <DialogBody>
            <Field label="Title" required><Input autoFocus maxLength={200} value={title} disabled={!!body.current} onChange={e => setTitle(e.target.value)} placeholder="Why the encomienda was not a land grant" /></Field>
            <Field label="Topic" required><Combobox value={topicId} onValueChange={setTopicId} disabled={!!body.current} placeholder="Choose a topic" options={options} /></Field>
            {save.error && <FieldError>{save.error}</FieldError>}
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="secondary" disabled={save.busy} onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" loading={save.busy} disabled={!title.trim() || !topicId}>{save.status === 'failed' ? 'Retry' : 'Start session'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

type Write = { path: string; method: string; body: { operationId: string } & Record<string, unknown> };

/**
 * A tutor session: a chat column at reading measure. Citations open the
 * exact passage in a side panel, where the session summary also lives.
 * Unavailable replies are explained once, not on every message.
 */
export function Tutor() {
  const { id = '' } = useParams();
  const { user } = useAccount();
  const confirm = useConfirm();
  const data = useApi<TutorDetail>(`/v1/tutor/${id}`);
  const save = useSave();
  const [text, setText] = useState('');
  const [action, setAction] = useState('message');
  const [renaming, setRenaming] = useState<string | null>(null);
  const [panel, setPanel] = useState<null | { kind: 'source'; message: TutorMessage; index: number } | { kind: 'summary' }>(null);
  const [review, setReview] = useState<TutorDetail | null>(null);
  const pending = useRef<Write | null>(null);
  const end = useRef<HTMLDivElement>(null);
  const row = data.data?.session;
  useUnsentGuard(!!text || !!pending.current || renaming !== null);
  usePageMeta({ courseId: row?.courseId, crumbs: row ? [{ label: 'Tutor', to: `/course/${row.courseId}/tutor` }, { label: row.title }] : undefined });
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [data.data?.messages.length]);
  const send = (write: Write, after?: () => void) => {
    pending.current ??= write;
    const task = pending.current;
    save.run<TutorDetail>(task, { id: task.body.operationId, invalidate: activityKeys, onSuccess: value => { pending.current = null; data.setData(value); after?.(); } });
  };
  if (data.isPending) return <Page width="narrow"><PageLoading label="Opening session" /></Page>;
  if (data.error) return <Page width="narrow"><ErrorState error={data.error} onRetry={() => void data.refetch()} /></Page>;
  const d = data.data, s = d.session;
  const closed = s.archived || !!s.endedAt;
  const meta = (patch: { title?: string; archived?: boolean }) => send({ path: `/v1/tutor/${id}`, method: 'PATCH', body: { operationId: crypto.randomUUID(), expectedRevision: s.revision, title: patch.title ?? s.title, archived: patch.archived ?? s.archived } }, () => setRenaming(null));
  return (
    <div className="flex min-h-full flex-col">
      <div className="ui-reading mx-auto flex w-full flex-1 flex-col gap-gutter px-4 pt-8 pb-6">
        <header className="flex items-start justify-between gap-snug">
          <div className="flex min-w-0 flex-col gap-1">
            <h1 className="font-serif text-2xl leading-tight font-medium tracking-tight">{s.title}</h1>
            <p className="text-muted-foreground text-sm">{s.topicLabel} · {STAGE_LABEL[s.stage]}{s.endedAt ? ` · Ended ${formatRelative(s.endedAt)}` : ''}{s.archived ? ' · Archived' : ''}</p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {d.summary && <Button variant="secondary" size="sm" onClick={() => setPanel({ kind: 'summary' })}>Summary</Button>}
            <DropdownMenu>
              <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label="Session options"><MoreHorizontalIcon /></Button></DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem onSelect={() => setRenaming(s.title)}><PencilIcon />Rename</DropdownMenuItem>
                {!s.endedAt && <DropdownMenuItem disabled={!!text || save.busy} onSelect={async () => { if (await confirm({ title: 'End this session?', description: 'You will see a summary. Start a new session to continue later.', confirmLabel: 'End session' })) send({ path: `/v1/tutor/${id}/end`, method: 'POST', body: { operationId: crypto.randomUUID(), expectedRevision: s.revision } }, () => setPanel({ kind: 'summary' })); }}><CheckCircleIcon />End session</DropdownMenuItem>}
                <DropdownMenuSeparator />
                <DropdownMenuItem disabled={save.busy} onSelect={() => meta({ archived: !s.archived })}>{s.archived ? <><ArchiveRestoreIcon />Restore</> : <><ArchiveIcon />Archive</>}</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        {!d.execution.available && !s.sampleDataset && !s.imported && <Notice>{d.execution.reason}</Notice>}
        {s.sampleDataset && <p className="text-muted-foreground text-sm">A sample conversation. Its replies were written for this workspace.</p>}
        {s.imported && <p className="text-muted-foreground text-sm">Imported history, with its original model and source labels.</p>}
        {s.source && <Link className="text-primary-text inline-flex items-center gap-1.5 text-sm underline-offset-2 hover:underline" to={`/materials/${s.source.materialId}/versions/${s.source.versionId}/passages/${s.source.passageId}`}><BookOpenIcon className="size-3.5" />The passage this session is about</Link>}
        {s.review && (
          <details className="bg-surface rounded-lg border px-4 py-3">
            <summary className="cursor-pointer text-base font-medium">The answer you're reviewing</summary>
            <div className="mt-3 flex flex-col gap-2 text-base">
              <p className="font-serif">{s.review.prompt}</p>
              <div className="rounded-md border bg-card px-3 py-2 font-serif whitespace-pre-wrap">{s.review.response}</div>
              {s.review.feedback && <p className="text-muted-foreground">{s.review.feedback}</p>}
              <p className="text-muted-foreground text-sm">{s.review.pending ? 'Awaiting feedback' : `${s.review.marksAwarded} of ${s.review.marksAvailable} marks`}{s.review.usedHint ? ' · Hint used' : ''}</p>
            </div>
          </details>
        )}

        <ol className="flex flex-col gap-section" aria-label="Conversation">
          {d.messages.length === 0 && <li className="text-muted-foreground text-base">Ask your first question below.</li>}
          {d.messages.map(m => {
            const tutor = m.role === 'tutor';
            const citations = m.provenance?.citations ?? [];
            const body = tutor ? renderCitations(m.text, citations.map(c => c.passageId)) : m.text;
            return (
              <li key={m.id} className="flex flex-col gap-1.5">
                <span className="text-muted-foreground text-sm font-medium">{tutor ? m.provenance?.model ?? 'Tutor' : 'You'}</span>
                <div className={cn(tutor ? 'font-serif' : 'bg-surface rounded-lg border px-4 py-3')}>
                  <Prose text={body} size={tutor ? 'reading' : 'compact'} onCitation={citations.length ? n => { if (citations[n - 1]) setPanel({ kind: 'source', message: m, index: n - 1 }); } : undefined} />
                </div>
                {tutor && (
                  <div className="text-muted-foreground flex flex-wrap gap-x-3 gap-y-1 text-sm">
                    {m.provenance?.grounding && <span>{GROUNDING_LABEL[m.provenance.grounding]}</span>}
                    {citations.length > 0 && <button type="button" className="hover:text-foreground underline-offset-2 hover:underline" onClick={() => setPanel({ kind: 'source', message: m, index: 0 })}>{citations.length === 1 ? '1 source' : `${citations.length} sources`}</button>}
                    {m.state === 'interrupted' && <span className="text-warning-text">This reply was cut off and is incomplete.</span>}
                    {!!m.provenance?.droppedCitations && <span>{m.provenance.droppedCitations === 1 ? 'One citation did not match your materials and was removed.' : `${m.provenance.droppedCitations} citations did not match your materials and were removed.`}</span>}
                  </div>
                )}
              </li>
            );
          })}
        </ol>
        {d.nextCursor !== null && <Button variant="secondary" className="self-start" onClick={() => void request<TutorDetail>(`/v1/tutor/${id}?cursor=${d.nextCursor}`, user.id).then(page => data.setData({ ...page, messages: [...d.messages, ...page.messages] }), e => toast.error(String(e)))}>Load more messages</Button>}
        {save.conflict && (
          <div className="bg-warning-subtle text-warning-text flex flex-wrap items-center gap-snug rounded-md px-3 py-2 text-sm">
            <span className="flex-1">This session changed in another tab. Your message is kept here.</span>
            <Button size="sm" variant="secondary" onClick={() => void request<TutorDetail>(`/v1/tutor/${id}`, user.id).then(setReview)}>Review latest</Button>
          </div>
        )}
        <div ref={end} />
      </div>

      <div className="bg-background/95 sticky bottom-0 border-t backdrop-blur">
        <form className="ui-reading mx-auto flex flex-col gap-tight px-4 py-3" onSubmit={e => { e.preventDefault(); if (text.trim() || pending.current) send({ path: `/v1/tutor/${id}/messages`, method: 'POST', body: { operationId: crypto.randomUUID(), expectedRevision: s.revision, text, action } }, () => setText('')); }}>
          {closed ? <p className="text-muted-foreground text-sm">{s.archived ? 'Restore this session to add questions.' : 'This session has ended. Start a new one to keep going.'}</p> : <>
            <Textarea aria-label="Your question" className="max-h-48 min-h-16 bg-card" maxLength={4000} value={text} disabled={save.busy || !!pending.current} placeholder="Ask about this topic"
              onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) e.currentTarget.form?.requestSubmit(); }} />
            <div className="flex items-center gap-tight">
              <Select aria-label="How to help" size="sm" className="w-52" value={action} onValueChange={setAction} disabled={save.busy || !!pending.current} options={ACTIONS} />
              {save.error && !save.conflict && <span className="text-danger-text min-w-0 flex-1 truncate text-sm" title={save.error}>Not sent. {save.error}</span>}
              <Button type="submit" className="ml-auto" loading={save.busy} disabled={!text.trim() && !pending.current}>{pending.current && !save.busy ? 'Retry' : <><ArrowUpIcon />Send</>}</Button>
            </div>
          </>}
        </form>
      </div>

      <Sheet open={!!panel} onOpenChange={open => { if (!open) setPanel(null); }}>
        <SheetContent size="lg" aria-describedby={undefined}>
          {panel?.kind === 'source' && <SourcePanel message={panel.message} index={panel.index} onIndex={index => setPanel({ ...panel, index })} />}
          {panel?.kind === 'summary' && d.summary && (
            <>
              <SheetHeader><SheetTitle>Session summary</SheetTitle></SheetHeader>
              <SheetBody>
                <p className="text-muted-foreground text-sm">Reached: {STAGE_LABEL[d.summary.stageReached]}</p>
                <ul className="flex list-disc flex-col gap-1.5 pl-5 font-serif text-md">{d.summary.covered.map(line => <li key={line}>{line}</li>)}</ul>
                <p className="text-muted-foreground text-sm">{s.completedLearning ? 'Counts as tutored study, which is assisted work.' : 'This session does not count as completed study.'}</p>
                <Button asChild className="self-start"><Link to={`/course/${s.courseId}/practice?topicId=${s.topicId}`}>Practise this topic</Link></Button>
              </SheetBody>
            </>
          )}
        </SheetContent>
      </Sheet>

      <Dialog open={renaming !== null} onOpenChange={open => { if (!open && !save.busy) setRenaming(null); }}>
        <DialogContent size="sm">
          <form onSubmit={e => { e.preventDefault(); if (renaming?.trim()) meta({ title: renaming.trim() }); }}>
            <DialogHeader><DialogTitle>Rename session</DialogTitle></DialogHeader>
            <DialogBody><Field label="Title" required><Input autoFocus maxLength={200} value={renaming ?? ''} onChange={e => setRenaming(e.target.value)} /></Field></DialogBody>
            <DialogFooter><Button type="button" variant="secondary" onClick={() => setRenaming(null)}>Cancel</Button><Button type="submit" loading={save.busy} disabled={!renaming?.trim()}>Rename</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!review} onOpenChange={open => { if (!open) setReview(null); }}>
        {review && (
          <DialogContent size="lg">
            <DialogHeader><DialogTitle>Latest saved session</DialogTitle><DialogDescription>Your unsent message is still in the box below.</DialogDescription></DialogHeader>
            <DialogBody><ol className="flex flex-col gap-2 text-base">{review.messages.map(m => <li key={m.id}><span className="text-muted-foreground mr-2 text-sm">{m.role === 'tutor' ? 'Tutor' : 'You'}</span>{m.text}</li>)}</ol></DialogBody>
            <DialogFooter><Button onClick={() => { pending.current = null; save.discard(); data.setData(review); setReview(null); }}>Keep my message and continue</Button></DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}

/** The cited passage, read beside the conversation. */
function SourcePanel({ message, index, onIndex }: { message: TutorMessage; index: number; onIndex: (i: number) => void }) {
  const citations = useMemo(() => message.provenance?.citations ?? [], [message]);
  const c = citations[index];
  const passage = useApi<Passage>(c ? `/v1/materials/${c.materialId}/versions/${c.versionId}/passages/${c.passageId}` : null);
  return (
    <>
      <SheetHeader><SheetTitle>Source {index + 1}{citations.length > 1 ? ` of ${citations.length}` : ''}</SheetTitle></SheetHeader>
      <SheetBody>
        {citations.length > 1 && (
          <div className="flex gap-1">{citations.map((_, i) => <Button key={i} size="sm" variant={i === index ? 'primary' : 'secondary'} aria-pressed={i === index} onClick={() => onIndex(i)}>{i + 1}</Button>)}</div>
        )}
        {passage.isPending ? <LoadingState lines={6} label="Loading passage" /> : passage.error ? <ErrorState error={passage.error} onRetry={() => void passage.refetch()} /> : (
          <article className="flex flex-col gap-snug">
            {passage.data.heading && <h2 className="font-serif text-lg font-semibold">{passage.data.heading}</h2>}
            <div className="rawi-prose font-serif"><PassageText passage={passage.data} markdown /></div>
          </article>
        )}
        {c && <Button asChild variant="secondary" className="self-start"><Link to={`/materials/${c.materialId}/versions/${c.versionId}/passages/${c.passageId}`}><BookOpenIcon />Open in the reader</Link></Button>}
        <Badge variant="outline" className="self-start">Exact version cited</Badge>
      </SheetBody>
    </>
  );
}
