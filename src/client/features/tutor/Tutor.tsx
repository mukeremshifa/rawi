import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ArchiveIcon, ArchiveRestoreIcon, ArrowRightIcon, ArrowUpIcon, BookOpenIcon, CheckCircleIcon, ListChecksIcon, MoreHorizontalIcon, PencilIcon, PlusIcon, SearchIcon } from 'lucide-react';
import type { CourseDetail } from '@shared/contracts/workspace';
import type { BlockPage } from '@shared/contracts/document';
import type { NextMove, TutorDetail, TutorMessage, TutorSession } from '@shared/contracts/tutor';
import type { LearningRun } from '@shared/contracts/learning';
import type { AnswerValue } from '@shared/domain/types';
import { STAGE_LABEL } from '@shared/domain/tutor';

import { formatDueDate, formatRelative } from '@/components/domain';
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
import { QuestionFeedback } from '@/features/practice/QuestionFeedback';
import { QuestionView } from '@/features/practice/QuestionView';
import { DocumentBlocks } from '@/features/materials/DocumentView';
import { assetPath, blockPath } from '@/features/materials/Reader';
import { useAccount } from '@/lib/account';
import { errorMessage, request, streamEvents } from '@/lib/api';
import type { AiStatusView, ReplyEvent } from '../../../server/api-types';
import type { ScopeView } from '@shared/contracts/outline';
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
  const ai = useApi<AiStatusView>('/v1/ai/status');
  const fromContext = !!(params.get('blockIds') || params.get('attemptId'));
  // A link that names a topic, such as a suggestion on the home page, opens the new session form on it.
  const [creating, setCreating] = useState(fromContext || !!params.get('topicId'));
  const rows = sessions.items?.filter(s => s.archived === (status === 'archived') && s.title.toLowerCase().includes(query.trim().toLowerCase())) ?? [];
  return (
    <Page>
      <PageHeader title="Tutor" actions={<Button size="lg" onClick={() => setCreating(true)}><PlusIcon />New session</Button>} />
      {ai.data && !ai.data.available && <Notice>{ai.data.reason} Sessions keep your questions and sources so you can pick them up later.</Notice>}
      <div className="flex flex-col gap-snug">
        <Toolbar>
          <div className="relative w-64 max-w-full">
            <SearchIcon className="text-muted-foreground absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2" aria-hidden />
            <Input aria-label="Search sessions" placeholder="Search sessions" className="pl-8" value={query} onChange={e => setQuery(e.target.value)} />
          </div>
          <SegmentedControl aria-label="Session status" value={status} onValueChange={setStatus} options={[{ value: 'active', label: 'Active' }, { value: 'archived', label: 'Archived' }]} />
        </Toolbar>
        {sessions.error ? <ErrorState error={sessions.error} onRetry={() => void sessions.refetch()} /> : sessions.isPending ? <ListLoading rows={3} /> : !rows.length ? (
          <EmptyState compact title={query ? 'No sessions match your search' : status === 'archived' ? 'No archived sessions' : 'No sessions yet'} description={!query && status === 'active' ? 'Start a session on a topic, a section of a material or an answer you want to understand.' : undefined} />
        ) : (
          <List>
            {rows.map(s => <ListRow key={s.id} to={`/tutor/${s.id}`} title={s.title} meta={`${s.topicLabel ?? 'Not in the outline'} · ${STAGE_LABEL[s.stage]}${s.endedAt ? ' · Ended' : ''}`} trailing={formatRelative(s.updatedAt)} />)}
          </List>
        )}
        {sessions.hasNextPage && <Button variant="secondary" className="self-start" loading={sessions.isFetchingNextPage} onClick={() => void sessions.fetchNextPage()}>Load more</Button>}
      </div>
      <TutorNotes courseId={id} />
      <NewSessionDialog courseId={id} open={creating} onOpenChange={setCreating} />
    </Page>
  );
}

/**
 * What the tutor remembers about the student in this course, written from sessions as they end
 * and read at the start of every session. Shown in full, and the student can clear it.
 */
function TutorNotes({ courseId }: { courseId: string }) {
  const { user } = useAccount();
  const confirm = useConfirm();
  const notes = useApi<{ notes: string | null; updatedAt: string | null }>(`/v1/courses/${courseId}/tutor/notes`);
  const [clearing, setClearing] = useState(false);
  if (!notes.data) return null;
  const clear = async () => {
    if (!await confirm({ title: 'Forget these notes?', description: 'The tutor starts the next session without them. New notes are written as later sessions end.', confirmLabel: 'Forget notes' })) return;
    setClearing(true);
    try { notes.setData(await request(`/v1/courses/${courseId}/tutor/notes/clear`, user.id, { operationId: crypto.randomUUID() }, 'POST')); }
    catch (e) { toast.error(errorMessage(e)); }
    finally { setClearing(false); }
  };
  return (
    <section aria-labelledby="tutor-notes" className="bg-surface flex flex-col gap-tight rounded-lg border px-4 py-3">
      <div className="flex items-center justify-between gap-snug">
        <h2 id="tutor-notes" className="text-base font-medium">What the tutor remembers</h2>
        {notes.data.notes && <Button variant="ghost" size="sm" loading={clearing} onClick={() => void clear()}>Forget</Button>}
      </div>
      {notes.data.notes
        ? <><p className="font-serif text-base whitespace-pre-wrap">{notes.data.notes}</p>{notes.data.updatedAt && <p className="text-muted-foreground text-sm">Updated: {formatRelative(notes.data.updatedAt)}</p>}</>
        : <p className="text-muted-foreground text-sm">Nothing yet. When a session ends, the tutor keeps a few notes on what you understood and what to come back to, and reads them at the start of the next one.</p>}
    </section>
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
  const options = [...(historical ? [{ value: topicId, label: 'Topic from your saved answer' }] : []), { value: 'course', label: 'Whole course' }, ...(outline.data?.topics.map(t => ({ value: t.id, label: t.title })) ?? [])];
  const { user } = useAccount();
  const [scopeError, setScopeError] = useState('');
  // A session from a section or a saved answer needs no topic: it takes the section's, if there is one.
  const fromSource = !!(params.get('blockIds') || params.get('attemptId'));
  const create = async () => {
    // A session on the whole course works on the course scope, made on first use.
    let scopeId = params.get('scopeId');
    if (!body.current && topicId === 'course') {
      try { scopeId = (await request<ScopeView>(`/v1/courses/${courseId}/scopes`, user.id, { kind: 'course' }, 'POST')).id; setScopeError(''); }
      catch (e) { setScopeError(errorMessage(e)); return; }
    }
    body.current ??= {
      id: crypto.randomUUID(), title, ...(topicId && topicId !== 'course' ? { topicId } : {}), ...(scopeId ? { scopeId } : {}),
      ...(params.get('plannedSessionId') ? { plannedSessionId: params.get('plannedSessionId') } : {}),
      ...(params.get('blockIds') ? { source: { materialId: params.get('materialId'), versionId: params.get('versionId'), blockIds: params.get('blockIds')!.split(',') } } : {}),
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
        <form onSubmit={e => { e.preventDefault(); void create(); }}>
          <DialogHeader>
            <DialogTitle>New tutor session</DialogTitle>
            <DialogDescription>{params.get('blockIds') ? 'The session keeps the exact text you came from.' : params.get('attemptId') ? 'The session keeps your saved answer and its feedback.' : 'Pick the topic you want to work on.'}</DialogDescription>
          </DialogHeader>
          <DialogBody>
            <Field label="Title" required={!fromSource} optional={fromSource} description={fromSource ? 'Leave it empty to name the session after the section.' : undefined}><Input autoFocus maxLength={200} value={title} disabled={!!body.current} onChange={e => setTitle(e.target.value)} placeholder="Why the encomienda was not a land grant" /></Field>
            <Field label="Topic" required={!fromSource} optional={fromSource} description={fromSource ? 'Taken from the section when it is in the outline.' : undefined}><Combobox value={topicId} onValueChange={setTopicId} disabled={!!body.current} placeholder={fromSource ? 'From the section' : 'Choose a topic'} options={options} /></Field>
            {(save.error || scopeError) && <FieldError>{save.error || scopeError}</FieldError>}
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="secondary" disabled={save.busy} onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" loading={save.busy} disabled={!fromSource && (!title.trim() || !topicId)}>{save.status === 'failed' ? 'Retry' : 'Start session'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

type Write = { path: string; method: string; body: { operationId: string } & Record<string, unknown> };

/**
 * A tutor session: a chat column at reading measure. Citations open the
 * exact cited blocks in a side panel, where the session summary also lives.
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
  const status = useApi<AiStatusView>('/v1/ai/status');
  // The reply streams in after the question is saved. A reload resumes by reading the saved session.
  const [live, setLive] = useState<{ op: string; text: string; error?: string; stopping?: boolean } | null>(null);
  const started = useRef<string | null>(null);
  const pendingReply = data.data?.pendingReply ?? null;
  useEffect(() => {
    if (!pendingReply || started.current === pendingReply) return;
    started.current = pendingReply;
    setLive({ op: pendingReply, text: '' });
    void streamEvents<ReplyEvent>(`/v1/tutor/${id}/reply`, user.id, { operationId: pendingReply }, event => {
      if (event.type === 'delta') setLive(prior => prior && { ...prior, text: prior.text + event.text });
      else if (event.type === 'error') setLive(prior => prior && { ...prior, error: event.message });
    }).catch(e => setLive(prior => prior && { ...prior, error: String(e instanceof Error ? e.message : e) }))
      .finally(() => void data.refetch().then(() => setLive(prior => prior?.error ? prior : null)));
  }, [pendingReply]); // eslint-disable-line react-hooks/exhaustive-deps
  const row = data.data?.session;
  useUnsentGuard(!!text || !!pending.current || renaming !== null);
  usePageMeta({ courseId: row?.courseId, crumbs: row ? [{ label: 'Tutor', to: `/course/${row.courseId}/tutor` }, { label: row.title }] : undefined });
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [data.data?.messages.length, live?.text.length]);
  const send = (write: Write, after?: () => void) => {
    pending.current ??= write;
    const task = pending.current;
    save.run<TutorDetail>(task, { id: task.body.operationId, invalidate: activityKeys, onSuccess: value => { pending.current = null; data.setData(value); after?.(); } });
  };
  // Asking saves the question and streams the reply in one request. A failure before the question
  // is saved keeps it here with the same id, so a retry never sends it twice.
  const [asking, setAsking] = useState(false), [askError, setAskError] = useState('');
  const ask = (write: Write) => {
    pending.current ??= write;
    const task = pending.current;
    let saved = false;
    setAsking(true); setAskError('');
    started.current = task.body.operationId;
    setLive({ op: task.body.operationId, text: '' });
    void streamEvents<ReplyEvent>(task.path, user.id, task.body, event => {
      if (event.type === 'saved') {
        // The saved question and session arrive first. The page already holds the rest of the transcript.
        const light = event.detail as Pick<TutorDetail, 'session' | 'pendingReply'> & { message: TutorDetail['messages'][number] };
        saved = true; pending.current = null; setText(''); setAsking(false);
        data.setData({ ...data.data!, session: light.session, messages: [...data.data!.messages, light.message], pendingReply: light.pendingReply });
      }
      else if (event.type === 'delta') setLive(prior => prior && { ...prior, text: prior.text + event.text });
      else if (event.type === 'error') setLive(prior => prior && { ...prior, error: event.message });
    }).catch(e => {
      if (saved) setLive(prior => prior && { ...prior, error: errorMessage(e) });
      else { started.current = null; setLive(null); setAskError(errorMessage(e)); }
    }).finally(() => { setAsking(false); if (saved) void data.refetch().then(() => setLive(prior => prior?.error ? prior : null)); });
  };
  const busy = asking || save.busy || !!pending.current || !!pendingReply || !!live;
  const quick = (text: string, action: string, focus?: { materialId: string; key: string }) => { if (!busy && data.data) ask({ path: `/v1/tutor/${id}/ask`, method: 'POST', body: { operationId: crypto.randomUUID(), expectedRevision: data.data.session.revision, text, action, ...(focus ? { focus } : {}) } }); };
  const endSession = () => { if (data.data) send({ path: `/v1/tutor/${id}/end`, method: 'POST', body: { operationId: crypto.randomUUID(), expectedRevision: data.data.session.revision } }, () => setPanel({ kind: 'summary' })); };
  const take = (move: NextMove) => { if ('end' in move) endSession(); else quick(move.text, move.action, move.focus); };
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
            <p className="text-muted-foreground text-sm">{s.topicLabel ?? 'Not in the outline'} · {STAGE_LABEL[s.stage]}{s.endedAt ? ` · Ended ${formatRelative(s.endedAt)}` : ''}{s.archived ? ' · Archived' : ''}</p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {d.summary && <Button variant="secondary" size="sm" onClick={() => setPanel({ kind: 'summary' })}>Summary</Button>}
            <DropdownMenu>
              <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label="Session options"><MoreHorizontalIcon /></Button></DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem onSelect={() => setRenaming(s.title)}><PencilIcon />Rename</DropdownMenuItem>
                {!s.endedAt && <DropdownMenuItem disabled={!!text || save.busy} onSelect={async () => { if (await confirm({ title: 'End this session?', description: 'You will see a summary. Start a new session to continue later.', confirmLabel: 'End session' })) endSession(); }}><CheckCircleIcon />End session</DropdownMenuItem>}
                <DropdownMenuSeparator />
                <DropdownMenuItem disabled={save.busy} onSelect={() => meta({ archived: !s.archived })}>{s.archived ? <><ArchiveRestoreIcon />Restore</> : <><ArchiveIcon />Archive</>}</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        {status.data && !status.data.available && <Notice>{status.data.reason}</Notice>}
        {s.source && <Link className="text-primary-text inline-flex items-center gap-1.5 text-sm underline-offset-2 hover:underline" to={blockPath(s.source.materialId, s.source.versionId, s.source.blockIds[0])}><BookOpenIcon className="size-3.5" />The text this session is about</Link>}
        {s.review && (
          <details className="bg-surface rounded-lg border px-4 py-3">
            <summary className="cursor-pointer text-base font-medium">The answer you're reviewing</summary>
            <div className="mt-3 flex flex-col gap-2 text-base">
              <p className="font-serif">{s.review.prompt}</p>
              <div className="rounded-md border bg-card px-3 py-2 font-serif whitespace-pre-wrap">{s.review.response}</div>
              {s.review.feedback && <p className="text-muted-foreground">{s.review.feedback}</p>}
              <p className="text-muted-foreground text-sm">{`${s.review.marksAwarded} of ${s.review.marksAvailable} marks`}{s.review.usedHint ? ' · Hint used' : ''}</p>
            </div>
          </details>
        )}

        <ol className="flex flex-col gap-section" aria-label="Conversation">
          {d.messages.length === 0 && <li className="text-muted-foreground text-base">Ask your first question below.</li>}
          {d.messages.map(m => {
            const tutor = m.role === 'tutor';
            const citations = m.provenance?.citations ?? [];
            const body = tutor ? renderCitations(m.text, citations.length) : m.text;
            return (
              <li key={m.id} className="flex flex-col gap-1.5">
                <span className="text-muted-foreground text-sm font-medium">{tutor ? (m.provenance?.model && m.provenance.model !== 'none' ? m.provenance.model : 'Tutor') : 'You'}</span>
                <div className={cn(tutor ? 'font-serif' : 'bg-surface rounded-lg border px-4 py-3')}>
                  <Prose text={body} size={tutor ? 'reading' : 'compact'} onCitation={citations.length ? n => { if (citations[n - 1]) setPanel({ kind: 'source', message: m, index: n - 1 }); } : undefined} />
                </div>
                {m.provenance?.check && <CheckCard runId={m.provenance.check.runId} itemId={m.provenance.check.itemId} closed={closed} onChecked={() => void data.refetch()} />}
                {tutor && (
                  <div className="text-muted-foreground flex flex-wrap gap-x-3 gap-y-1 text-sm">
                    {m.provenance?.grounding && <span>{GROUNDING_LABEL[m.provenance.grounding]}</span>}
                    {m.provenance?.outsideScope && <span>From outside what you are working on</span>}
                    {citations.length > 0 && <button type="button" className="hover:text-foreground underline-offset-2 hover:underline" onClick={() => setPanel({ kind: 'source', message: m, index: 0 })}>{m.provenance?.attachedSources === citations.length ? (citations.length === 1 ? 'Where this may come from' : `${citations.length} places this may come from`) : citations.length === 1 ? '1 source' : `${citations.length} sources`}</button>}
                    {m.state === 'interrupted' && <span className="text-warning-text">This reply was cut off and is incomplete.</span>}
                    {m.state === 'cancelled' && <span>You stopped this reply.</span>}
                    {!!m.provenance?.droppedCitations && <span>{m.provenance.droppedCitations === 1 ? 'One citation did not match your materials and was removed.' : `${m.provenance.droppedCitations} citations did not match your materials and were removed.`}</span>}
                  </div>
                )}
                {!tutor && m.state === 'failed' && <span className="text-danger-text text-sm">{m.failure ?? 'No reply was written for this question.'}</span>}
              </li>
            );
          })}
          {live && (
            <li className="flex flex-col gap-1.5" aria-live="polite">
              <span className="text-muted-foreground text-sm font-medium">Tutor</span>
              {live.text && <div className="font-serif"><Prose text={live.text.replace(/\[\[[^\]]*\]\]/g, '').replace(/\[\[[^\]]*$|\[$/, '')} size="reading" /></div>}
              {!live.text && !live.error && <span className="text-muted-foreground text-base">Reading your materials…</span>}
              {live.error && <span className="text-danger-text text-sm">{live.error}</span>}
              {!live.error && <Button variant="secondary" size="sm" className="self-start" loading={live.stopping} onClick={() => { setLive(prior => prior && { ...prior, stopping: true }); void request(`/v1/ai/operations/${live.op}/cancel`, user.id, { operationId: crypto.randomUUID() }, 'POST').catch(e => toast.error(String(e instanceof Error ? e.message : e))); }}>Stop</Button>}
            </li>
          )}
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
        <form className="ui-reading mx-auto flex flex-col gap-tight px-4 py-3" onSubmit={e => { e.preventDefault(); if (!asking && (text.trim() || pending.current)) ask({ path: `/v1/tutor/${id}/ask`, method: 'POST', body: { operationId: crypto.randomUUID(), expectedRevision: s.revision, text, action } }); }}>
          {!closed && d.next && !busy && (
            <Button type="button" variant="secondary" className="self-start" disabled={!!text.trim()} onClick={() => take(d.next!)}>{d.next.label}<ArrowRightIcon /></Button>
          )}
          {closed ? <p className="text-muted-foreground text-sm">{s.archived ? 'Restore this session to add questions.' : 'This session has ended. Start a new one to keep going.'}</p> : <>
            <Textarea aria-label="Your question" className="max-h-48 min-h-16 bg-card" maxLength={4000} value={text} disabled={asking || save.busy || !!pending.current || !!pendingReply || !!live} placeholder="Ask about this topic"
              onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) e.currentTarget.form?.requestSubmit(); }} />
            <div className="flex items-center gap-tight">
              <Select aria-label="How to help" size="sm" className="w-52" value={action} onValueChange={setAction} disabled={busy} options={ACTIONS} />
              <Button type="button" variant="secondary" size="sm" disabled={busy} onClick={() => quick('Ask me a question.', 'check')}><ListChecksIcon />Ask me a question</Button>
              {(askError || save.error && !save.conflict) && <span className="text-danger-text min-w-0 flex-1 truncate text-sm" title={askError || save.error}>Not sent. {askError || save.error}</span>}
              <Button type="submit" className="ml-auto" loading={asking} disabled={(!text.trim() && !pending.current) || !!live && !asking}>{pending.current && !asking ? 'Retry' : <><ArrowUpIcon />Send</>}</Button>
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
                <p className="text-muted-foreground text-sm">Reached: {STAGE_LABEL[d.summary.stageReached]}{d.nextReview ? ` · Next review: ${formatDueDate(d.nextReview)}` : ''}</p>
                <ul className="flex list-disc flex-col gap-1.5 pl-5 font-serif text-md">{d.summary.covered.map(line => <li key={line}>{line}</li>)}</ul>
                <p className="text-muted-foreground text-sm">{s.completedLearning ? 'Counts as tutored study, which is assisted work.' : 'This session does not count as completed study.'}</p>
                {s.scopeId
                  ? <Button asChild className="self-start"><Link to={`/course/${s.courseId}/practice?scopeId=${s.scopeId}`}>Practise this</Link></Button>
                  : s.source && <Button asChild className="self-start"><Link to={`/course/${s.courseId}/practice?materialId=${s.source.materialId}`}>Practise this material</Link></Button>}
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

/**
 * A question the tutor posed from the bank. It is answered and checked here like a practice
 * question: code marks it, the result counts in learner state, and the tutor's next reply sees it.
 */
function CheckCard({ runId, itemId, closed, onChecked }: { runId: string; itemId: string; closed: boolean; onChecked: () => void }) {
  const { user } = useAccount();
  const run = useApi<LearningRun>(`/v1/runs/${runId}`);
  const [draft, setDraft] = useState<AnswerValue>();
  const [checking, setChecking] = useState(false), [error, setError] = useState('');
  if (run.isPending) return <LoadingState lines={3} label="Loading question" />;
  if (run.error) return <ErrorState error={run.error} onRetry={() => void run.refetch()} />;
  const r = run.data, position = r.items.findIndex(i => i.id === itemId), item = r.items[position];
  if (!item) return null;
  const answer = draft ?? item.response;
  // The answer is saved, then checked, each against the run's latest revision.
  const check = async () => {
    setChecking(true); setError('');
    try {
      const saved = await request<LearningRun>(`/v1/runs/${runId}/answers`, user.id, { operationId: crypto.randomUUID(), expectedRevision: r.revision, position, answers: [{ itemId, response: answer }] }, 'PUT');
      run.setData(await request<LearningRun>(`/v1/runs/${runId}/transition`, user.id, { operationId: crypto.randomUUID(), expectedRevision: saved.revision, itemId, action: 'check' }, 'POST'));
      setDraft(undefined); onChecked();
    } catch (e) { setError(errorMessage(e)); void run.refetch(); }
    finally { setChecking(false); }
  };
  return (
    <div className="bg-card flex flex-col gap-gutter rounded-lg border px-4 py-4">
      <QuestionView question={item.question} answer={answer} onChange={setDraft} readOnly={item.checked || closed || checking} />
      {item.feedback ? <div className="border-t pt-gutter"><QuestionFeedback question={{ ...item.question, source: undefined }} attempt={item.feedback} /></div> : !closed && (
        <div className="flex flex-wrap items-center gap-tight">
          <Button loading={checking} disabled={!answer || answer.kind === 'none'} onClick={() => void check()}>Check answer</Button>
          {error && <span className="text-danger-text text-sm">Not checked. {error}</span>}
        </div>
      )}
    </div>
  );
}

/** The cited blocks, read beside the conversation in the same renderer as the reader. */
function SourcePanel({ message, index, onIndex }: { message: TutorMessage; index: number; onIndex: (i: number) => void }) {
  const citations = useMemo(() => message.provenance?.citations ?? [], [message]);
  const c = citations[index];
  const cited = useApi<BlockPage>(c ? `/v1/materials/${c.materialId}/versions/${c.versionId}/blocks?ids=${c.blockIds.join(',')}` : null);
  const version = useApi<{ pagination: 'source' | 'slides' | 'converted' | 'none' }>(c ? `/v1/materials/${c.materialId}/versions/${c.versionId}` : null);
  return (
    <>
      <SheetHeader><SheetTitle>Source {index + 1}{citations.length > 1 ? ` of ${citations.length}` : ''}</SheetTitle></SheetHeader>
      <SheetBody>
        {citations.length > 1 && (
          <div className="flex gap-1">{citations.map((_, i) => <Button key={i} size="sm" variant={i === index ? 'primary' : 'secondary'} aria-pressed={i === index} onClick={() => onIndex(i)}>{i + 1}</Button>)}</div>
        )}
        {cited.isPending ? <LoadingState lines={6} label="Loading source" /> : cited.error ? <ErrorState error={cited.error} onRetry={() => void cited.refetch()} /> : c && (
          <DocumentBlocks blocks={cited.data.blocks} pagination={version.data?.pagination ?? 'none'} assetUrl={assetPath(c.materialId, c.versionId)} />
        )}
        {c && <Button asChild variant="secondary" className="self-start"><Link to={blockPath(c.materialId, c.versionId, c.blockIds[0])}><BookOpenIcon />Open in the reader</Link></Button>}
        <Badge variant="outline" className="self-start">Exact version cited</Badge>
      </SheetBody>
    </>
  );
}
