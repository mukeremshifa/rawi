import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeftIcon, ArrowRightIcon, FlagIcon, GridIcon, LightbulbIcon, XIcon } from 'lucide-react';
import type { z } from 'zod';
import { sameAnswer, type LearningRun, type runWriteInput } from '@shared/contracts/learning';
import { locate, sectionLocked } from '@shared/domain/exam';
import type { AnswerValue } from '@shared/domain/types';

import { formatClock } from '@/components/domain';
import { ErrorState, PageLoading, SaveIndicator } from '@/components/states';
import { useConfirm } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Kbd } from '@/components/ui/kbd';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Progress } from '@/components/ui/progress';
import { Hint } from '@/components/ui/tooltip';
import { QuestionFeedback } from '@/features/practice/QuestionFeedback';
import { QuestionView } from '@/features/practice/QuestionView';
import { useAccount } from '@/lib/account';
import { request } from '@/lib/api';
import { useApi, useSave } from '@/lib/data';
import { useUnsentGuard } from '@/lib/hooks';
import { activityKeys } from '@/lib/query';
import { usePageMeta } from '@/lib/shell';
import { cn } from '@/lib/utils';

type Write = { path: string; method: string; body: { operationId: string } & Record<string, unknown> };
const answered = (a: AnswerValue | undefined) => !!a && a.kind !== 'none' && !((a.kind === 'text' || a.kind === 'self-check') && !a.text.trim()) && !(a.kind === 'number' && !a.value.trim()) && !(a.kind === 'choice' && !a.indices.length);

/**
 * The runner, for practice and exam rehearsals. Focus mode: exit, progress,
 * save state and (in exams) the timer and navigator are the only chrome.
 * Answers autosave a second after a change. Unsaved answers stay on the page
 * if a save fails, and a failed request is retried exactly as sent. Exams
 * show no feedback until the whole paper is submitted.
 */
export function Run() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const { user } = useAccount();
  const record = useApi<LearningRun>(`/v1/runs/${id}`);
  const save = useSave();
  const [drafts, setDrafts] = useState<Record<string, AnswerValue>>({});
  const [review, setReview] = useState<LearningRun | null>(null);
  const [dropped, setDropped] = useState(false);
  const [clock, setClock] = useState(0);
  const pending = useRef<Write | null>(null);
  const clockBase = useRef({ server: Date.now(), mono: performance.now() });
  const latestDrafts = useRef(drafts); latestDrafts.current = drafts;
  const run = record.data, item = run?.items[run.position], exam = run?.exam;
  const dirty = Object.keys(drafts).length > 0;
  const blocked = save.busy || !!pending.current;
  const allow = useUnsentGuard(dirty || !!pending.current);
  usePageMeta({ focus: true, courseId: run?.courseId });

  useEffect(() => { if (run?.serverNow) clockBase.current = { server: Date.parse(run.serverNow), mono: performance.now() }; }, [run?.serverNow]);
  useEffect(() => { if (!exam || run?.state !== 'active') return; const t = setInterval(() => setClock(clockBase.current.server + performance.now() - clockBase.current.mono), 1000); return () => clearInterval(t); }, [run?.id, run?.state, !!exam]);
  // Exams re-read the run so section locks and expiry from the server apply. Practice re-reads it
  // while questions are still being written, so each joins the set as it passes its checks.
  const writing = !!run && run.pendingItems > 0;
  useEffect(() => {
    if ((!exam && !writing) || run?.state !== 'active' || save.busy || pending.current) return;
    const abort = new AbortController();
    const t = setInterval(() => { void request<LearningRun>(`/v1/runs/${id}`, user.id, undefined, 'GET', abort.signal).then(record.setData).catch(() => {}); }, exam ? 5000 : 2500);
    return () => { clearInterval(t); abort.abort(); };
  }, [run?.id, run?.state, save.busy, !!exam, writing]);

  function accept(saved: LearningRun) {
    // Answers can change while a save is in flight. Those stay as drafts for the next autosave.
    const sent = (pending.current?.body as { answers?: { itemId: string; response: AnswerValue }[] } | undefined)?.answers ?? [];
    const remaining = Object.fromEntries(Object.entries(latestDrafts.current).filter(([key, value]) => !sameAnswer(saved.items.find(i => i.id === key)?.response, value)));
    setDropped(sent.some(a => remaining[a.itemId] && sameAnswer(remaining[a.itemId], a.response)));
    pending.current = null; setDrafts(remaining); record.setData(saved);
    if (saved.attemptId && !Object.keys(remaining).length) { allow(); navigate(`/attempts/${saved.attemptId}`, { replace: true }); }
  }
  function send(write: Write, submit = false) {
    pending.current ??= write;
    const task = pending.current;
    save.run<LearningRun>(task, { id: task.body.operationId, onSuccess: accept, invalidate: submit ? activityKeys : undefined });
  }
  function saveAnswers(submit = false, position = run?.position ?? 0) {
    if (!run) return;
    const body: z.infer<typeof runWriteInput> = { operationId: crypto.randomUUID(), expectedRevision: run.revision, position, answers: Object.entries(drafts).map(([itemId, response]) => ({ itemId, response })) };
    send({ path: `/v1/runs/${id}/${submit ? 'submit' : 'answers'}`, method: submit ? 'POST' : 'PUT', body }, submit);
  }
  const transition = (action: 'check' | 'reveal' | 'hint') => { if (run && item) send({ path: `/v1/runs/${id}/transition`, method: 'POST', body: { operationId: crypto.randomUUID(), expectedRevision: run.revision, itemId: item.id, action } }); };
  // Checking an answer that has not saved yet saves it first, then checks.
  const [queued, setQueued] = useState<'check' | 'reveal' | null>(null);
  const act = (action: 'check' | 'reveal') => { if (!dirty) { transition(action); return; } setQueued(action); if (!blocked) saveAnswers(); };
  useEffect(() => { if (queued && !dirty && !blocked) { setQueued(null); transition(queued); } }, [queued, dirty, save.busy]);
  useEffect(() => { if (save.status === 'failed') setQueued(null); }, [save.status]);
  const examAction = (action: 'navigate' | 'finish-section' | 'flag', position = run?.position ?? 0) => { if (run) send({ path: `/v1/runs/${id}/exam-transition`, method: 'POST', body: { operationId: crypto.randomUUID(), expectedRevision: run.revision, action, position } }); };
  // Autosave a second after the last change.
  useEffect(() => {
    if (!dirty || run?.state !== 'active' || save.busy || pending.current || save.status === 'failed') return;
    const t = setTimeout(() => saveAnswers(), 1000);
    return () => clearTimeout(t);
  }, [drafts, save.busy, run?.revision]);

  const now = clock || (run?.serverNow ? Date.parse(run.serverNow) : Date.now());
  const runtime = exam ? { ...exam, answers: {} } : null;
  const loc = runtime && item ? locate(runtime, item.question.id) : null;
  const locked = !!(runtime && loc && sectionLocked(runtime, loc.sectionIndex, now));
  const deadlines = exam ? [run?.deadlineAt, exam.configSnapshot.timing === 'overall' ? exam.deadlineAt : exam.sectionDeadlines[exam.configSnapshot.sections[exam.currentSectionIndex]!.id]].filter((d): d is string => !!d) : [];
  const remaining = deadlines.length ? Math.max(0, Math.min(...deadlines.map(d => Date.parse(d))) - now) : null;
  const responseOf = (i: NonNullable<typeof item>) => drafts[i.id] ?? i.response;
  const unanswered = run?.items.map((i, n) => answered(responseOf(i)) ? null : n + 1).filter((n): n is number => n !== null) ?? [];
  const sequential = exam?.configSnapshot.navigation === 'sequential';
  const canBack = !!run && run.position > 0 && !blocked && !(exam && (dirty || sequential));
  const canNext = !!run && run.position + 1 < run.items.length && !blocked && !(exam && dirty);
  const go = (position: number) => exam ? examAction('navigate', position) : saveAnswers(false, position);
  const selfMarked = item?.question.format === 'flashcard' || item?.question.format === 'self-check';
  const canCheck = !!item && run?.feedback === 'immediate' && !exam && !selfMarked && !item.checked;
  const canReveal = !!item && item.question.format === 'self-check' && !item.revealed && !exam;
  const submit = async () => {
    if (!run) return;
    const ok = await confirm({
      title: exam ? 'Submit the whole paper?' : 'Finish this practice?',
      description: <div className="flex flex-col gap-2">
        {unanswered.length ? <p>{unanswered.length === 1 ? 'Question' : 'Questions'} {unanswered.join(', ')} {unanswered.length === 1 ? 'has' : 'have'} no answer.</p> : <p>Every question has an answer.</p>}
        <p>{exam ? 'Feedback appears once the paper is submitted. You cannot change answers after this.' : 'You can review every answer afterwards.'}</p>
      </div>,
      confirmLabel: exam ? 'Submit paper' : 'Finish',
      cancelLabel: 'Keep working',
    });
    if (ok) saveAnswers(true);
  };

  // 1 to 9 choose an option or rating. Enter checks, then moves on.
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (e.metaKey || e.ctrlKey || e.altKey || target.closest('input, textarea, [role=dialog], [role=listbox], [contenteditable]')) return;
      if (/^[1-9]$/.test(e.key)) {
        const buttons = document.querySelectorAll<HTMLButtonElement>('main [data-choices] > button');
        buttons[Number(e.key) - 1]?.click();
      } else if (e.key === 'Enter' && !target.closest('button, a')) {
        e.preventDefault();
        if (canCheck && item && answered(responseOf(item))) { if (!queued && !(blocked && !dirty)) act('check'); }
        else if (canNext) go(run!.position + 1);
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  });

  if (record.isPending) return <div className="mx-auto max-w-2xl px-4 py-16"><PageLoading label="Opening practice" /></div>;
  if (record.error) return <div className="mx-auto max-w-2xl px-4 py-16"><ErrorState error={record.error} onRetry={() => void record.refetch()} /></div>;
  const r = record.data;
  const exitTo = `/course/${r.courseId}/practice`;
  if (r.state === 'active' && !item && r.pendingItems > 0) {
    return <div className="mx-auto max-w-2xl px-4 py-16"><PageLoading label={`Writing ${r.pendingItems === 1 ? 'a question' : `${r.pendingItems} questions`} for this scope and checking ${r.pendingItems === 1 ? 'it' : 'them'} against your material`} /></div>;
  }
  if (r.state !== 'active' || !item) {
    return (
      <div className="mx-auto flex max-w-2xl flex-col items-start gap-snug px-4 py-16">
        <h1 className="font-serif text-2xl font-medium">This practice is finished</h1>
        <div className="flex gap-tight">{r.attemptId && <Button asChild><Link to={`/attempts/${r.attemptId}`}>See results</Link></Button>}<Button asChild variant="secondary"><Link to={exitTo}>Back to practice</Link></Button></div>
      </div>
    );
  }
  const section = exam?.configSnapshot.sections[exam.currentSectionIndex];
  const flagged = exam?.flagged.includes(item.question.id);
  const revisitable = !exam && !r.flashcardReview && r.position === r.items.length - 1 && r.items.some(i => i.response.kind === 'self-rating' && ['again', 'hard'].includes(i.response.rating));
  return (
    <div className="flex min-h-full flex-col">
      <header className="bg-background/95 sticky top-0 z-20 border-b backdrop-blur">
        <div className="mx-auto flex h-12 max-w-3xl items-center gap-snug px-3 sm:px-4">
          <Hint label="Exit"><Button asChild variant="ghost" size="icon" aria-label="Exit to practice"><Link to={exitTo}><XIcon /></Link></Button></Hint>
          <span className="min-w-0 flex-1 truncate text-sm font-medium">{r.flashcardReview ? 'Second pass' : r.title}</span>
          <SaveIndicator status={save.status} dirty={dirty} error={save.conflict ? 'Saved elsewhere.' : save.error} onRetry={save.conflict ? undefined : () => { if (pending.current) send(pending.current); }} className="hidden sm:inline-flex" />
          {exam && <span className={cn('tabular rounded-md border px-2 py-0.5 text-sm', remaining !== null && remaining < 5 * 60_000 ? 'text-danger-text border-danger/40 font-medium' : 'text-muted-foreground')} aria-label="Time remaining">{remaining === null ? 'Untimed' : formatClock(remaining)}</span>}
          <span className="text-muted-foreground tabular text-sm whitespace-nowrap">{r.position + 1} of {r.items.length}</span>
        </div>
        <Progress value={((r.position + 1) / r.items.length) * 100} className="h-0.5 rounded-none" aria-label="Progress through questions" />
      </header>

      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-gutter px-4 py-8 sm:py-12">
        {exam && section && (
          <div className="text-muted-foreground flex flex-col gap-0.5 text-sm">
            <span className="text-foreground font-medium">{section.title}</span>
            {section.instructions && <span>{section.instructions}</span>}
            {locked && <span className="text-warning-text">This section is closed. Its answers can no longer change.</span>}
            {exam.materialVersions.length > 0 && <span>Open book: {exam.materialVersions.map((m, i) => <span key={m.materialId}>{i > 0 && ', '}<Link className="text-primary-text underline underline-offset-2" target="_blank" to={`/materials/${m.materialId}/versions/${m.versionId}`}>{m.title}</Link></span>)}</span>}
          </div>
        )}
        {r.flashcardReview && r.position === 0 && <p className="text-muted-foreground text-sm">A second look at the cards you found hard. Your first ratings are kept.</p>}
        {r.pendingItems > 0 && <p className="text-muted-foreground flex items-center gap-2 text-sm" role="status"><span className="bg-primary size-1.5 animate-pulse rounded-full" aria-hidden />{r.pendingItems === 1 ? 'One more question is being written. It joins this set once it passes its checks.' : `${r.pendingItems} more questions are being written. Each joins this set once it passes its checks.`}</p>}
        {r.pendingNote && r.position + 1 === r.items.length && <p className="text-muted-foreground text-sm">{r.pendingNote}</p>}
        {item.question.format === 'flashcard' && !item.revealed ? (
          <div className="flex flex-col gap-gutter">
            <div className="font-serif text-lg leading-snug">{item.question.prompt}</div>
            <Button size="lg" className="self-start" loading={save.busy} disabled={dirty || blocked} onClick={() => transition('reveal')}>Reveal the answer</Button>
          </div>
        ) : (
          <QuestionView key={item.id} question={item.question} revealed={item.revealed} answer={responseOf(item)}
            onChange={answer => { setDrafts(old => ({ ...old, [item.id]: answer })); setDropped(false); }}
            readOnly={item.checked || locked || (blocked && (!!exam || !pending.current?.path.endsWith('/answers')))} />
        )}
        {item.hinted && <div className="bg-warning-subtle text-warning-text flex items-start gap-tight rounded-md px-3 py-2.5 text-base"><LightbulbIcon className="mt-0.5 size-4 shrink-0" aria-hidden /><span><span className="font-medium">Hint. </span>{item.question.explanation.split(/(?<=\.)\s+/)[0]}</span></div>}
        {item.feedback && <div className="border-t pt-gutter"><QuestionFeedback question={{ ...item.question, source: undefined }} attempt={item.feedback} /></div>}
        {dropped && <p role="alert" className="text-warning-text text-sm">Some answers changed while saving. They are still on this page and will save next.</p>}
        {save.error && !save.conflict && <p role="alert" className="text-danger-text text-sm sm:hidden">Not saved. {save.error}</p>}
        {save.conflict && (
          <div className="bg-warning-subtle text-warning-text flex flex-wrap items-center gap-snug rounded-md px-3 py-2 text-sm">
            <span className="flex-1">This run was saved from another tab. Your unsent answers are kept here.</span>
            <Button size="sm" variant="secondary" onClick={() => void request<LearningRun>(`/v1/runs/${id}`, user.id).then(setReview)}>Review saved answers</Button>
          </div>
        )}
      </main>

      <footer className="bg-background/95 sticky bottom-0 z-20 border-t backdrop-blur">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-tight px-3 py-2.5 sm:px-4">
          <Button variant="ghost" disabled={!canBack} onClick={() => go(r.position - 1)}><ArrowLeftIcon />Previous</Button>
          {exam && <ExamNavigator run={r} drafts={drafts} disabled={dirty || blocked} onGo={position => examAction('navigate', position)} />}
          {exam?.configSnapshot.flaggingEnabled && <Hint label={flagged ? 'Remove flag' : 'Flag for later'}><Button variant="ghost" size="icon" aria-pressed={flagged} aria-label={flagged ? 'Remove flag' : 'Flag this question'} disabled={dirty || blocked} onClick={() => examAction('flag')}><FlagIcon className={cn(flagged && 'fill-current text-primary-text')} /></Button></Hint>}
          {r.hintsAllowed && !item.hinted && !item.checked && !selfMarked && !exam && <Button variant="ghost" disabled={dirty || blocked} onClick={() => transition('hint')}><LightbulbIcon />Hint</Button>}
          <div className="ml-auto flex items-center gap-tight">
            {r.position + 1 < r.items.length && <Button variant="ghost" disabled={blocked} onClick={() => void submit()}>{exam ? 'Submit paper' : 'Finish'}</Button>}
            {exam && <Button variant="secondary" disabled={dirty || blocked} onClick={() => examAction('finish-section')}>Finish section</Button>}
            {revisitable && <Button variant="secondary" disabled={dirty || blocked} onClick={() => send({ path: `/v1/runs/${id}/revisit`, method: 'POST', body: { operationId: crypto.randomUUID(), expectedRevision: r.revision } })}>Revisit hard cards</Button>}
            {canReveal && <Button loading={save.busy || !!queued} disabled={!!queued || (blocked && !dirty) || !answered(responseOf(item))} onClick={() => act('reveal')}>Show model answer</Button>}
            {canCheck && <Button loading={save.busy || !!queued} disabled={!!queued || (blocked && !dirty) || !answered(responseOf(item))} onClick={() => act('check')}>Check answer<Kbd className="bg-primary-foreground/20 text-primary-foreground hidden border-transparent sm:inline-flex">Enter</Kbd></Button>}
            {r.position + 1 < r.items.length
              ? <Button variant={canCheck || canReveal ? 'secondary' : 'primary'} disabled={!canNext} onClick={() => go(r.position + 1)}>Next<ArrowRightIcon /></Button>
              : <Button variant={canCheck || canReveal ? 'secondary' : 'primary'} loading={save.busy && pending.current?.path.endsWith('/submit')} disabled={blocked} onClick={() => void submit()}>{exam ? 'Submit paper' : 'Finish'}</Button>}
          </div>
        </div>
      </footer>

      <Dialog open={!!review} onOpenChange={open => { if (!open) setReview(null); }}>
        {review && (
          <DialogContent size="lg">
            <DialogHeader><DialogTitle>Saved answers</DialogTitle><DialogDescription>The latest saved version of this run. Checked answers cannot be overwritten.</DialogDescription></DialogHeader>
            <DialogBody>
              <ol className="flex flex-col gap-snug">
                {review.items.map((i, n) => <li key={i.id} className="text-base"><span className="text-muted-foreground tabular mr-2">{n + 1}</span>{i.question.prompt}<span className="text-muted-foreground block pl-6 text-sm">{answered(i.response) ? 'Answered' : 'No answer saved'}</span></li>)}
              </ol>
            </DialogBody>
            <DialogFooter>
              <Button onClick={() => { record.setData(review); setReview(null); pending.current = null; save.discard(); }}>Keep my unsent answers</Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}

/** The exam question grid: answered, flagged and current, at a glance. */
function ExamNavigator({ run, drafts, disabled, onGo }: { run: LearningRun; drafts: Record<string, AnswerValue>; disabled: boolean; onGo: (position: number) => void }) {
  const exam = run.exam!;
  const [open, setOpen] = useState(false);
  const sequential = exam.configSnapshot.navigation === 'sequential';
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild><Button variant="ghost"><GridIcon />Questions</Button></PopoverTrigger>
      <PopoverContent side="top" className="w-72">
        <p className="mb-2 text-sm font-medium">Questions</p>
        <div className="grid grid-cols-6 gap-1.5" aria-label="Exam question navigation">
          {run.items.map((q, position) => {
            const done = answered(drafts[q.id] ?? q.response), flag = exam.flagged.includes(q.question.id), current = position === run.position;
            return (
              <button key={q.id} type="button" aria-current={current ? 'step' : undefined}
                aria-label={`Question ${position + 1}${flag ? ', flagged' : ''}${done ? ', answered' : ', unanswered'}`}
                disabled={disabled || current || (sequential && (position < run.position || position > run.position + 1))}
                onClick={() => { setOpen(false); onGo(position); }}
                className={cn('tabular relative flex h-9 items-center justify-center rounded-md border text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default',
                  current ? 'border-primary bg-primary text-primary-foreground' : done ? 'bg-selected font-medium' : 'bg-card', !current && 'hover:bg-accent disabled:opacity-50')}>
                {position + 1}
                {flag && <FlagIcon className="absolute -top-1 -right-1 size-3 fill-current text-primary-text" aria-hidden />}
              </button>
            );
          })}
        </div>
        <p className="text-muted-foreground mt-2 text-xs">Shaded: answered. Flag: marked for later.{sequential ? ' This paper moves in order.' : ''}</p>
      </PopoverContent>
    </Popover>
  );
}
