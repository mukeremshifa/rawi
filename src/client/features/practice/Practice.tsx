import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { z } from 'zod';
import { sameAnswer, type LearningSet, type LearningRun, type LearningAttempt, type runWriteInput } from '@shared/contracts/learning';
import { sectionLocked, locate } from '@shared/domain/exam';
import { RequestFeedback } from '@/features/ai/AiOperation';
import { useAccount } from '@/lib/account';
import { request } from '@/lib/api';
import type { AnswerValue } from '@shared/domain/types';
import { Page, PageHeader } from '@/components/layout';
import { Button } from '@/components/ui/button';
import { QuestionView } from '@/features/practice/QuestionView';
import { QuestionFeedback } from '@/features/practice/QuestionFeedback';
import { useLearningWrite, useRecord, useUnsentGuard } from '@/lib/hooks';

export function Run() {
  const { id = '' } = useParams(); const nav = useNavigate(); const op = useLearningWrite();
  const record = useRecord<LearningRun>(`/v1/runs/${id}`);
  const [drafts, setDrafts] = useState<Record<string, AnswerValue>>({}), [message, setMessage] = useState(''), [review, setReview] = useState<LearningRun | null>(null);
  const pending = useRef<{ path: string; method: string; body: unknown } | null>(null);
  const { user } = useAccount();
  const [clock, setClock] = useState(0);
  const clockBase = useRef({ server: Date.now(), mono: performance.now() });
  const run = record.value, item = run?.items[run.position]; const dirty = Object.keys(drafts).length > 0;
  const latestDrafts = useRef(drafts); latestDrafts.current = drafts;

  const allowNavigation = useUnsentGuard(dirty || !!pending.current);
  useEffect(() => { if (run?.serverNow) clockBase.current = { server: Date.parse(run.serverNow), mono: performance.now() }; }, [run?.serverNow]);
  useEffect(() => { if (!run?.exam || run.state !== 'active') return; const t = setInterval(() => setClock(clockBase.current.server + performance.now() - clockBase.current.mono), 1000); return () => clearInterval(t); }, [run?.id, run?.state]);
  useEffect(() => { if (!run?.exam || run.state !== 'active' || op.busy || pending.current) return; const abort = new AbortController(); const t = setInterval(() => { void request<LearningRun>(`/v1/runs/${id}`, user.id, undefined, 'GET', abort.signal).then(record.setValue).catch(() => {}); }, 5000); return () => { clearInterval(t); abort.abort(); }; }, [run?.id, run?.state, op.busy]);
  function accept(saved: LearningRun) {
    // Answers can change while a save is in flight. Those stay as drafts for the next autosave.
    const sent = (pending.current?.body as { answers?: { itemId: string; response: AnswerValue }[] } | undefined)?.answers ?? [];
    const remaining = Object.fromEntries(Object.entries(latestDrafts.current).filter(([key, value]) => !sameAnswer(saved.items.find(i => i.id === key)?.response, value)));
    const dropped = sent.some(a => remaining[a.itemId] && sameAnswer(remaining[a.itemId], a.response));
    pending.current = null; setDrafts(remaining); record.setValue(saved);
    setMessage(dropped ? 'Some answers were not included in the saved result. Your unsaved answers remain on this page.' : Object.keys(remaining).length ? '' : 'Saved to your account.');
    if (saved.attemptId && !Object.keys(remaining).length) { allowNavigation(); nav(`/attempts/${saved.attemptId}`, { replace: true }); }
  }
  function save(submit = false, position = run?.position ?? 0) {
    if (!run) return;
    const body: z.infer<typeof runWriteInput> = { operationId: crypto.randomUUID(), expectedRevision: run.revision, position, answers: Object.entries(drafts).map(([itemId, response]) => ({ itemId, response })) };
    pending.current ??= { path: `/v1/runs/${id}/${submit ? 'submit' : 'answers'}`, method: submit ? 'POST' : 'PUT', body };
    const write = pending.current;
    void op.run<LearningRun>(write.path, write.body, write.method, accept);
  }
  useEffect(() => { if (!dirty || run?.state !== 'active' || op.busy || pending.current || op.error) return; const timer = setTimeout(() => save(), 1000); return () => clearTimeout(timer); }, [drafts, op.busy, run?.revision]);
  function transition(action: 'check' | 'reveal' | 'hint') {
    if (!run || !item) return;
    pending.current ??= { path: `/v1/runs/${id}/transition`, method: 'POST', body: { operationId: crypto.randomUUID(), expectedRevision: run.revision, itemId: item.id, action } };
    void op.run<LearningRun>(pending.current.path, pending.current.body, pending.current.method, accept);
  }
  function examAction(action: 'navigate' | 'finish-section' | 'flag', position = run?.position ?? 0) { if (!run) return; pending.current ??= { path: `/v1/runs/${id}/exam-transition`, method: 'POST', body: { operationId: crypto.randomUUID(), expectedRevision: run.revision, action, position } }; void op.run<LearningRun>(pending.current.path, pending.current.body, pending.current.method, accept); }
  const exam = run?.exam; const runtime = exam ? { ...exam, answers: {} } : null; const loc = runtime && item ? locate(runtime, item.question.id) : null; const locked = !!(runtime && loc && sectionLocked(runtime, loc.sectionIndex, clock || Date.parse(run!.serverNow!)));
  const deadlines = exam ? [run?.deadlineAt, exam.configSnapshot.timing === 'overall' ? exam.deadlineAt : exam.sectionDeadlines[exam.configSnapshot.sections[exam.currentSectionIndex]!.id]].filter((d): d is string => !!d) : [];
  const deadline = deadlines.length ? new Date(Math.min(...deadlines.map(d => Date.parse(d)))).toISOString() : null;
  return <Page className="py-8" width="narrow"><PageHeader title={run?.flashcardReview ? 'Second pass' : run?.title ?? 'Practice run'} description="Answers autosave after a short pause. Unsent work remains on this page if saving fails." />
    {record.error && <p role="alert">{record.error}</p>}{op.error && <p role="alert">{op.error}</p>}<p role="status">{op.busy ? 'Saving…' : dirty ? 'Unsaved changes' : message}</p>
    {run?.attemptId && <Link to={`/attempts/${run.attemptId}`}>Open saved result</Link>}
    {run && item && run.state === 'active' && <div className="space-y-5">{run.flashcardReview && <p>Revisit the cards you found difficult. Both passes remain self-rated, and your first ratings are retained.</p>}<p>Question {run.position + 1} of {run.items.length}</p>{exam && <div className="border p-4 space-y-3"><h2>{exam.configSnapshot.sections[exam.currentSectionIndex]?.title}</h2><p>{exam.configSnapshot.sections[exam.currentSectionIndex]?.instructions}</p><p>{deadline ? `${Math.max(0, Math.ceil((Date.parse(deadline) - (clock || Date.parse(run.serverNow!))) / 1000))} seconds remaining` : 'Untimed'} · No feedback before whole-paper submission.</p>{locked && <p>This section is locked.</p>}<div className="flex flex-wrap gap-2" aria-label="Exam question navigation">{run.items.map((q, position) => <Button key={q.id} variant={position === run.position ? 'primary' : 'secondary'} aria-current={position === run.position ? 'step' : undefined} aria-label={`Question ${position + 1}${exam.flagged.includes(q.question.id) ? ', flagged' : ''}${q.response.kind !== 'none' ? ', answered' : ', unanswered'}`} disabled={dirty || op.busy || !!pending.current || (exam.configSnapshot.navigation === 'sequential' && (position < run.position || position > run.position + 1))} onClick={() => examAction('navigate', position)}>{position + 1}{exam.flagged.includes(q.question.id) ? ' ⚑' : ''}</Button>)}</div>{exam.materialVersions.map(m => <p key={m.materialId}><Link className="underline" target="_blank" to={`/materials/${m.materialId}/versions/${m.versionId}`}>{m.title}</Link></p>)}<Button variant="secondary" disabled={dirty || op.busy || !!pending.current} onClick={() => examAction('finish-section')}>Finish section</Button>{exam.configSnapshot.flaggingEnabled && <Button variant="secondary" disabled={dirty || op.busy || !!pending.current} onClick={() => examAction('flag')}>{exam.flagged.includes(item.question.id) ? 'Remove flag' : 'Flag question'}</Button>}</div>}
      {item.question.format === 'flashcard' && !item.revealed ? <><p>{item.question.prompt}</p><Button disabled={op.busy || dirty} onClick={() => transition('reveal')}>Reveal answer</Button></> : <QuestionView key={item.id} question={item.question} revealed={item.revealed} answer={drafts[item.id] ?? item.response} onChange={answer => { setDrafts(old => ({ ...old, [item.id]: answer })); setMessage(''); }} readOnly={item.checked || locked || ((op.busy || !!pending.current) && (!!exam || !pending.current?.path.endsWith('/answers')))} />}
      {item.hinted && <p className="rounded border p-3">Hint used: {item.question.explanation}</p>}
      {run.hintsAllowed && !item.hinted && !item.checked && item.question.format !== 'flashcard' && <Button variant="secondary" disabled={dirty || op.busy || !!pending.current} onClick={() => transition('hint')}>Show a hint</Button>}
      {run.feedback === 'immediate' && item.question.format !== 'flashcard' && !item.checked && <Button disabled={dirty || op.busy || !!pending.current} onClick={() => transition('check')}>Check saved answer</Button>}
      {item.feedback && <QuestionFeedback question={{ ...item.question, source: undefined }} attempt={item.feedback} />}
      <div className="flex flex-wrap gap-3"><Button variant="secondary" disabled={op.busy || !!pending.current || run.position === 0 || (!!exam && (dirty || exam.configSnapshot.navigation === 'sequential'))} onClick={() => exam ? examAction('navigate', run.position - 1) : save(false, run.position - 1)}>Previous</Button><Button variant="secondary" disabled={op.busy || !!pending.current || run.position + 1 === run.items.length || (!!exam && dirty)} onClick={() => exam ? examAction('navigate', run.position + 1) : save(false, run.position + 1)}>Next</Button><Button disabled={op.busy} onClick={() => save()}>{op.busy ? 'Saving…' : pending.current ? 'Retry saved request' : 'Save answers'}</Button>{!exam && !run.flashcardReview && run.position === run.items.length - 1 && run.items.some(i => i.response.kind === 'self-rating' && ['again', 'hard'].includes(i.response.rating)) && <Button disabled={dirty || op.busy || !!pending.current} onClick={() => { pending.current ??= { path: `/v1/runs/${id}/revisit`, method: 'POST', body: { operationId: crypto.randomUUID(), expectedRevision: run.revision } }; void op.run<LearningRun>(pending.current.path, pending.current.body, pending.current.method, accept); }}>Revisit difficult flashcards</Button>}<Button disabled={op.busy || !!pending.current} onClick={() => save(true)}>Submit all answers</Button></div>

      {(op.code === 'revision_conflict') && <Button variant="secondary" onClick={() => void op.run<LearningRun>(`/v1/runs/${id}`, undefined, 'GET', setReview)}>Review saved answers</Button>}
      {review && <div className="border p-4"><h2>Saved revision {review.revision}</h2>{review.items.map(i => <div key={i.id}><p>{i.question.prompt}</p><pre className="whitespace-pre-wrap">{JSON.stringify(i.response)}</pre></div>)}<p>Your unsent answers remain above. Checked answers cannot be overwritten.</p><Button onClick={() => { record.setValue(review); setReview(null); pending.current = null; }}>Keep my drafts against this revision</Button></div>}
    </div>}
  </Page>;
}
export function AttemptReview() {
  const { id = '' } = useParams(); const op = useLearningWrite(); const nav = useNavigate(); const setId = useRef(crypto.randomUUID()); const { value: a, error } = useRecord<LearningAttempt & { feedbackRevisions?: { id: string; questionId: string; revision: number; createdAt: string; grading: import("@shared/domain/types").WrittenGrading }[] }>(`/v1/attempts/${id}`);
  const missed = a?.questions.filter(q => ['incorrect', 'partial', 'skipped'].includes(q.result.outcome) || q.result.response.kind === 'self-rating' && ['again', 'hard'].includes(q.result.response.rating)).slice(0, 50) ?? [];
  return <Page className="py-8" width="narrow"><PageHeader title={a?.title ?? 'Attempt result'} description="Saved responses and marking from this attempt." />{error && <p role="alert">{error}</p>}{a && <div className="space-y-6"><Link className="underline" to={`/course/${a.courseId}/practice`}>Practice library</Link>{op.error && <p role="alert">{op.error}</p>}{missed.length > 0 && <Button disabled={op.busy} onClick={() => void op.run<LearningSet>(`/v1/courses/${a.courseId}/sets`, { id: setId.current, name: `Review: ${a.title}`.slice(0, 200), questionIds: missed.map(q => q.question.id), feedback: 'immediate', hintsAllowed: true, remediatesAttemptId: a.id }, 'POST', saved => nav(`/sets/${saved.id}`))}>Practise missed questions and difficult cards ({missed.length})</Button>}{a.sampleTimingNotice && <p role="note">{a.sampleTimingNotice}</p>}{a.sampleDataset && <p>Sample activity. Objective answers use the normal marking rules. Sample written feedback is illustrative.</p>}{a.imported && <p>{a.markingVersion === 'recovered-objective-v1' ? 'Recovered practice, marked by the server. Earlier assistance could not be verified.' : 'Imported history. Recorded grading and assistance provenance are preserved from the original export.'}</p>}{a.finish && <p>Ended {a.finish === 'expired' ? 'when time expired' : 'by manual submission'}.</p>}<p>{a.marksAvailable ? `${a.marksAwarded}/${a.marksAvailable} graded marks` : 'Not graded'} · {a.pending} pending answers</p>{a.pending > 0 && <p>Written answers are saved. Written feedback isn't available yet. Pending answers do not lower your grade.</p>}{a.questions.map(({ question, result }) => <section className="border-t pt-5 space-y-4" key={question.id}><h2>{question.prompt}</h2>{a.flashcardReview?.firstRatings[question.id] && <p>First pass: {a.flashcardReview.firstRatings[question.id]!.rating}. Final ratings remain self-rated.</p>}{result.response.kind === 'text' && question.rubric && <RequestFeedback attemptId={a.id} questionId={question.id} />}<QuestionFeedback question={{ ...question, source: undefined }} attempt={result} />{a.feedbackRevisions?.some(r => r.questionId === question.id) && <details><summary>Feedback revision history</summary>{a.feedbackRevisions.filter(r => r.questionId === question.id).map(r => <article key={r.id}><p>Revision {r.revision} · {r.grading.model} · {new Date(r.createdAt).toLocaleString()}</p><p>{r.grading.summary}</p>{r.grading.points?.map(p => <p key={p.rubricId}>{p.awarded}/{p.max}: {p.feedback}</p>)}</article>)}</details>}<Link className="underline" to={`/course/${a.courseId}/tutor?attemptId=${a.id}&questionId=${question.id}&topicId=${question.topicId}`}>Discuss this saved answer</Link>{question.source && <Link className="underline" to={`/materials/${question.source.materialId}/versions/${question.source.versionId}/passages/${question.source.passageId}`}>Read the exact source</Link>}</section>)}</div>}</Page>;
}
