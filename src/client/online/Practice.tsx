import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { z } from 'zod';
import { createSetInput, formats, type LearningSet, type LearningRun, type LearningAttempt, type VersionedQuestion, type runWriteInput } from '@shared/learning';
import { sectionLocked, locate } from '@shared/exam';
import { useAccount } from './OnlineApp';
import { request } from './api';
import type { AnswerValue } from '@shared/types';
import { Page, PageHeader } from '@/components/layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { QuestionView } from '@/features/practice/QuestionView';
import { QuestionFeedback } from '@/features/practice/QuestionFeedback';
import { useLearningWrite, useOnlineRecord, useUnsentGuard, downloadRecovery } from './learning-hooks';

export function OnlinePractice() {
  const { id = '' } = useParams(); const nav = useNavigate();
  const [archived, setArchived] = useState('false'), [cursor, setCursor] = useState(''), [query, setQuery] = useState('');
  const sets = useOnlineRecord<{ sets: LearningSet[]; nextCursor: string | null }>(`/v1/courses/${id}/sets?archived=${archived}${cursor ? `&cursor=${cursor}` : ''}`);
  const bank = useOnlineRecord<{ questions: VersionedQuestion[]; nextCursor: string | null }>(`/v1/courses/${id}/questions?limit=100`);
  const active = useOnlineRecord<{ runs: { id: string; title: string }[]; nextCursor: string | null }>(`/v1/courses/${id}/runs?limit=100`);
  const history = useOnlineRecord<{ attempts: LearningAttempt[]; nextCursor: string | null }>(`/v1/courses/${id}/attempts?limit=100`);
  const [name, setName] = useState(''), [format, setFormat] = useState('all'), [count, setCount] = useState(6), [feedback, setFeedback] = useState<'immediate' | 'end'>('immediate'), [hints, setHints] = useState(true);
  const op = useLearningWrite(); const pending = useRef<z.infer<typeof createSetInput> | null>(null);
  const pool = bank.value?.questions.filter(q => format === 'all' || q.format === format) ?? [];
  useUnsentGuard(!!pending.current || !!name);
  return <Page className="py-8" width="prose"><PageHeader title="Practice" description="Saved sets, resumable work and repeated attempts." actions={<Link to={`/online/course/${id}`}>Course</Link>} />
    {[sets.error, bank.error, active.error, history.error, op.error].filter(Boolean).map(e => <p role="alert" key={e}>{e}</p>)}
    {!sets.value && !sets.error && <p role="status">Loading practice…</p>}
    <section className="space-y-3"><h2 className="text-xl font-semibold">Continue studying</h2>{active.value?.runs.map(r => <p key={r.id}><Link className="underline" to={`/online/runs/${r.id}`}>{r.title}</Link></p>)}{active.value?.runs.length === 0 && <p>No active practice runs.</p>}</section>
    <section className="space-y-3 border-t py-5"><h2 className="text-xl font-semibold">Saved sets</h2><Input aria-label="Search sets on this page" placeholder="Search this page" value={query} onChange={e => setQuery(e.target.value)} /><Select aria-label="Set status" value={archived} onChange={e => { setArchived(e.target.value); setCursor(''); }}><option value="false">Active</option><option value="true">Archived</option><option value="all">All</option></Select>
      {sets.value?.sets.filter(s => s.name.toLowerCase().includes(query.toLowerCase())).map(s => <p key={s.id}><Link className="underline" to={`/online/sets/${s.id}`}>{s.name}</Link></p>)}{sets.value?.sets.length === 0 && <p>No saved sets in this view.</p>}{sets.value?.nextCursor && <Button onClick={() => setCursor(sets.value!.nextCursor!)}>Next page</Button>}{cursor && <Button variant="outline" onClick={() => setCursor('')}>First page</Button>}</section>
    <section className="space-y-3 border-t py-5"><h2 className="text-xl font-semibold">Build from your question bank</h2><p>Questions keep their saved content and sources. No demo questions are added automatically.</p><fieldset className="space-y-3" disabled={op.busy || !!pending.current}>
      <label className="block">Set name<Input value={name} onChange={e => setName(e.target.value)} maxLength={200} /></label>
      <label className="block">Format<Select value={format} onChange={e => setFormat(e.target.value)}><option value="all">All formats</option>{formats.map(f => <option key={f}>{f}</option>)}</Select></label>
      <label className="block">Questions<Input type="number" min={1} max={50} value={count} onChange={e => setCount(Number(e.target.value))} /></label>
      <label className="block">Feedback<Select value={feedback} onChange={e => setFeedback(e.target.value as 'immediate' | 'end')}><option value="immediate">After checking each answer</option><option value="end">At the end</option></Select></label>
      <label><input type="checkbox" checked={hints} onChange={e => setHints(e.target.checked)} /> Allow hints</label></fieldset>
      <p>{pool.length} matching questions loaded{bank.value?.nextCursor ? ', more questions are available in the bank' : ''}.</p>
      <Button disabled={op.busy || !name.trim() || !pool.length || count < 1 || count > 50} onClick={() => { pending.current ??= createSetInput.parse({ id: crypto.randomUUID(), name, questionIds: pool.slice(0, count).map(q => q.id), feedback, hintsAllowed: hints }); void op.run<LearningSet>(`/v1/courses/${id}/sets`, pending.current, 'POST', saved => { pending.current = null; nav(`/online/sets/${saved.id}`); }); }}>{op.busy ? 'Saving…' : pending.current ? 'Retry saving set' : 'Save set'}</Button>
      {!pool.length && <p>Your online bank is empty. Workspace import and material generation will provide questions when available.</p>}
      <p>Online question generation is not connected yet. Your saved practice remains available.</p>
    </section>
    <section className="space-y-3 border-t py-5"><h2 className="text-xl font-semibold">Attempt history</h2>{history.value?.attempts.map(a => <p key={a.id}><Link className="underline" to={`/online/attempts/${a.id}`}>{a.title}</Link> · {a.marksAvailable ? `${a.marksAwarded}/${a.marksAvailable} graded marks` : 'Not graded'} · {a.pending} pending</p>)}</section>
  </Page>;
}
export function OnlineSet() {
  const { id = '' } = useParams(); const nav = useNavigate(); const op = useLearningWrite();
  const record = useOnlineRecord<{ set: LearningSet; items: { id: string; question: VersionedQuestion }[] }>(`/v1/sets/${id}`);
  const [name, setName] = useState<string | null>(null); const startId = useRef(crypto.randomUUID()); const edit = useRef<unknown>(null);
  const row = record.value?.set;
  return <Page className="py-8" width="prose"><PageHeader title={row?.name ?? 'Saved practice set'} description="Every attempt uses these same saved questions." />{record.error && <p role="alert">{record.error}</p>}{op.error && <p role="alert">{op.error}</p>}
    {row && <><Link className="underline" to={`/online/course/${row.courseId}/practice`}>Practice library</Link><p>{record.value!.items.length} questions · {row.archived ? 'Archived' : 'Active'}</p>
      <Button disabled={op.busy || row.archived} onClick={() => void op.run<LearningRun>(`/v1/sets/${id}/runs`, { id: startId.current }, 'POST', run => nav(`/online/runs/${run.id}`))}>Start another attempt</Button>
      <label className="block mt-6">Name<Input value={name ?? row.name} disabled={op.busy || !!edit.current} onChange={e => setName(e.target.value)} /></label>
      <Button disabled={op.busy} onClick={() => { edit.current ??= { operationId: crypto.randomUUID(), expectedRevision: row.revision, name: name ?? row.name, archived: row.archived }; void op.run<LearningSet>(`/v1/sets/${id}`, edit.current, 'PATCH', set => { edit.current = null; record.setValue({ ...record.value!, set }); }); }}>Save name</Button>
      <Button variant="outline" disabled={op.busy || !!edit.current} onClick={() => { edit.current = { operationId: crypto.randomUUID(), expectedRevision: row.revision, name: row.name, archived: !row.archived }; void op.run<LearningSet>(`/v1/sets/${id}`, edit.current, 'PATCH', set => { edit.current = null; record.setValue({ ...record.value!, set }); }); }}>{row.archived ? 'Restore' : 'Archive'}</Button>
      {record.value!.items.map(i => <p className="border-t py-4" key={i.id}>{i.question.prompt} · {i.question.topicLabel} · {i.question.origin}</p>)}
    </>}
  </Page>;
}
export function OnlineRun() {
  const { id = '' } = useParams(); const nav = useNavigate(); const op = useLearningWrite();
  const record = useOnlineRecord<LearningRun>(`/v1/runs/${id}`);
  const [drafts, setDrafts] = useState<Record<string, AnswerValue>>({}), [message, setMessage] = useState(''), [review, setReview] = useState<LearningRun | null>(null);
  const pending = useRef<{ path: string; method: string; body: unknown } | null>(null);
  const { user } = useAccount();
  const [clock, setClock] = useState(0);
  const clockBase = useRef({ server: Date.now(), mono: performance.now() });
  const run = record.value, item = run?.items[run.position]; const dirty = Object.keys(drafts).length > 0;
  useUnsentGuard(dirty || !!pending.current);
  useEffect(() => { if (run?.serverNow) clockBase.current = { server: Date.parse(run.serverNow), mono: performance.now() }; }, [run?.serverNow]);
  useEffect(() => { if (!run?.exam || run.state !== 'active') return; const t = setInterval(() => setClock(clockBase.current.server + performance.now() - clockBase.current.mono), 1000); return () => clearInterval(t); }, [run?.id, run?.state]);
  useEffect(() => { if (!run?.exam || run.state !== 'active' || op.busy || pending.current) return; const abort = new AbortController(); const t = setInterval(() => { void request<LearningRun>(`/v1/runs/${id}`, user.id, undefined, 'GET', abort.signal).then(record.setValue).catch(() => {}); }, 5000); return () => { clearInterval(t); abort.abort(); }; }, [run?.id, run?.state, op.busy]);
  function accept(saved: LearningRun) { pending.current = null; setDrafts({}); record.setValue(saved); setMessage('Saved to your account.'); if (saved.attemptId) nav(`/online/attempts/${saved.attemptId}`, { replace: true }); }
  function save(submit = false, position = run?.position ?? 0) {
    if (!run) return;
    const body: z.infer<typeof runWriteInput> = { operationId: crypto.randomUUID(), expectedRevision: run.revision, position, answers: Object.entries(drafts).map(([itemId, response]) => ({ itemId, response })) };
    pending.current ??= { path: `/v1/runs/${id}/${submit ? 'submit' : 'answers'}`, method: submit ? 'POST' : 'PUT', body };
    void op.run<LearningRun>(pending.current.path, pending.current.body, pending.current.method, accept);
  }
  useEffect(() => { if (!dirty || op.busy || pending.current || op.error) return; const timer = setTimeout(() => save(), 1000); return () => clearTimeout(timer); }, [drafts, op.busy, run?.revision]);
  function transition(action: 'check' | 'reveal' | 'hint') {
    if (!run || !item) return;
    pending.current ??= { path: `/v1/runs/${id}/transition`, method: 'POST', body: { operationId: crypto.randomUUID(), expectedRevision: run.revision, itemId: item.id, action } };
    void op.run<LearningRun>(pending.current.path, pending.current.body, pending.current.method, accept);
  }
  function examAction(action: 'navigate' | 'finish-section' | 'flag', position = run?.position ?? 0) { if (!run) return; pending.current ??= { path: `/v1/runs/${id}/exam-transition`, method: 'POST', body: { operationId: crypto.randomUUID(), expectedRevision: run.revision, action, position } }; void op.run<LearningRun>(pending.current.path, pending.current.body, pending.current.method, accept); }
  const exam = run?.exam; const runtime = exam ? { ...exam, answers: {} } : null; const loc = runtime && item ? locate(runtime, item.question.id) : null; const locked = !!(runtime && loc && sectionLocked(runtime, loc.sectionIndex, clock || Date.parse(run!.serverNow!)));
  const deadline = exam ? (exam.configSnapshot.timing === 'overall' ? exam.deadlineAt : exam.sectionDeadlines[exam.configSnapshot.sections[exam.currentSectionIndex]!.id]) : null;
  return <Page className="py-8" width="prose"><PageHeader title={run?.title ?? 'Practice run'} description="Answers autosave after a short pause. Unsent work remains on this page if saving fails." />
    {record.error && <p role="alert">{record.error}</p>}{op.error && <p role="alert">{op.error}</p>}<p role="status">{op.busy ? 'Saving…' : dirty ? 'Unsaved changes' : message}</p>
    {run?.attemptId && <Link to={`/online/attempts/${run.attemptId}`}>Open saved result</Link>}
    {run && item && run.state === 'active' && <div className="space-y-5"><p>Question {run.position + 1} of {run.items.length}</p>{exam && <div className="border p-4 space-y-3"><h2>{exam.configSnapshot.sections[exam.currentSectionIndex]?.title}</h2><p>{exam.configSnapshot.sections[exam.currentSectionIndex]?.instructions}</p><p>{deadline ? `${Math.max(0, Math.ceil((Date.parse(deadline) - (clock || Date.parse(run.serverNow!))) / 1000))} seconds remaining` : 'Untimed'} · No feedback before whole-paper submission.</p>{locked && <p>This section is locked.</p>}{exam.materialVersions.map(m => <p key={m.materialId}><Link className="underline" target="_blank" to={`/online/materials/${m.materialId}/versions/${m.versionId}`}>{m.title}</Link></p>)}<Button variant="outline" disabled={dirty || op.busy || !!pending.current} onClick={() => examAction('finish-section')}>Finish section</Button>{exam.configSnapshot.flaggingEnabled && <Button variant="outline" disabled={dirty || op.busy || !!pending.current} onClick={() => examAction('flag')}>{exam.flagged.includes(item.question.id) ? 'Remove flag' : 'Flag question'}</Button>}</div>}
      {item.question.format === 'flashcard' && !item.revealed ? <><p>{item.question.prompt}</p><Button disabled={op.busy || dirty} onClick={() => transition('reveal')}>Reveal answer</Button></> : <QuestionView key={item.id} question={item.question} revealed={item.revealed} answer={drafts[item.id] ?? item.response} onChange={answer => { setDrafts(old => ({ ...old, [item.id]: answer })); setMessage(''); }} readOnly={op.busy || !!pending.current || item.checked || locked} />}
      {item.hinted && <p className="rounded border p-3">Hint used: {item.question.explanation}</p>}
      {run.hintsAllowed && !item.hinted && !item.checked && item.question.format !== 'flashcard' && <Button variant="outline" disabled={dirty || op.busy || !!pending.current} onClick={() => transition('hint')}>Show a hint</Button>}
      {run.feedback === 'immediate' && !item.checked && <Button disabled={dirty || op.busy || !!pending.current || (item.question.format === 'flashcard' && !item.revealed)} onClick={() => transition('check')}>Check saved answer</Button>}
      {item.feedback && <QuestionFeedback question={{ ...item.question, source: undefined }} attempt={item.feedback} />}
      <div className="flex flex-wrap gap-3"><Button variant="outline" disabled={op.busy || !!pending.current || run.position === 0 || (!!exam && (dirty || exam.configSnapshot.navigation === 'sequential'))} onClick={() => exam ? examAction('navigate', run.position - 1) : save(false, run.position - 1)}>Previous</Button><Button variant="outline" disabled={op.busy || !!pending.current || run.position + 1 === run.items.length || (!!exam && dirty)} onClick={() => exam ? examAction('navigate', run.position + 1) : save(false, run.position + 1)}>Next</Button><Button disabled={op.busy} onClick={() => save()}>{pending.current ? 'Retry saved request' : 'Save answers'}</Button><Button disabled={op.busy || !!pending.current} onClick={() => save(true)}>Submit all answers</Button></div>
      <Button variant="outline" onClick={() => downloadRecovery('rawi-unsent-answers.json', { runId: id, revision: run.revision, drafts, pending: pending.current })}>Export recovery copy</Button>
      {op.code === 'revision_conflict' && <Button variant="outline" onClick={() => void op.run<LearningRun>(`/v1/runs/${id}`, undefined, 'GET', setReview)}>Review saved answers</Button>}
      {review && <div className="border p-4"><h2>Saved revision {review.revision}</h2>{review.items.map(i => <div key={i.id}><p>{i.question.prompt}</p><pre className="whitespace-pre-wrap">{JSON.stringify(i.response)}</pre></div>)}<p>Your unsent answers remain above. Checked answers cannot be overwritten.</p><Button onClick={() => { record.setValue(review); setReview(null); pending.current = null; }}>Keep my drafts against this revision</Button></div>}
    </div>}
  </Page>;
}
export function OnlineAttempt() {
  const { id = '' } = useParams(); const { value: a, error } = useOnlineRecord<LearningAttempt>(`/v1/attempts/${id}`);
  return <Page className="py-8" width="prose"><PageHeader title={a?.title ?? 'Attempt result'} description="Saved responses and marking from this attempt." />{error && <p role="alert">{error}</p>}{a && <div className="space-y-6"><Link className="underline" to={`/online/course/${a.courseId}/practice`}>Practice library</Link>{a.finish && <p>Ended {a.finish === 'expired' ? 'when time expired' : 'by manual submission'}.</p>}<p>{a.marksAvailable ? `${a.marksAwarded}/${a.marksAvailable} graded marks` : 'Not graded'} · {a.pending} pending answers</p>{a.pending > 0 && <p>Written answers are saved. Online written feedback is not connected yet. Pending answers do not lower your grade.</p>}{a.questions.map(({ question, result }) => <section className="border-t pt-5 space-y-4" key={question.id}><h2>{question.prompt}</h2><QuestionFeedback question={{ ...question, source: undefined }} attempt={result} /><Link className="underline" to={`/online/course/${a.courseId}/tutor?attemptId=${a.id}&questionId=${question.id}&topicId=${question.topicId}`}>Discuss this saved answer</Link>{question.source && <Link className="underline" to={`/online/materials/${question.source.materialId}/versions/${question.source.versionId}/passages/${question.source.passageId}`}>Read the exact source</Link>}</section>)}</div>}</Page>;
}
