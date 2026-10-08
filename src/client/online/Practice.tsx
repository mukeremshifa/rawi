import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import type { z } from 'zod';
import { createSetInput, formats, sameAnswer, type LearningSet, type LearningRun, type LearningAttempt, type VersionedQuestion, type runWriteInput } from '@shared/learning';
import { selectQuestions } from '@shared/question-selection';
import { sectionLocked, locate } from '@shared/exam';
import { OnlineGeneration, RequestFeedback } from './Ai';
import { useAccount } from './OnlineApp';
import { request } from './api';
import type { OnlineMaterial } from '@shared/materials';
import type { AnswerValue } from '@shared/types';
import { Page, PageHeader } from '@/components/layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { QuestionView } from '@/features/practice/QuestionView';
import { QuestionFeedback } from '@/features/practice/QuestionFeedback';
import { useLearningWrite, useOnlineRecord, useOnlineCollection, useUnsentGuard } from './learning-hooks';

export function OnlinePractice() {
  const { id = '' } = useParams(); const nav = useNavigate(); const [params] = useSearchParams(); const planned = params.get('plannedSessionId');
  const [archived, setArchived] = useState('false'), [cursor, setCursor] = useState(''), [query, setQuery] = useState('');
  const sets = useOnlineRecord<{ sets: LearningSet[]; nextCursor: string | null }>(`/v1/courses/${id}/sets?archived=${archived}${cursor ? `&cursor=${cursor}` : ''}`);
  const bank = useOnlineCollection<VersionedQuestion>(`/v1/courses/${id}/questions?limit=100`, 'questions');
  const [runCursor, setRunCursor] = useState(''), [historyCursor, setHistoryCursor] = useState('');
  const active = useOnlineRecord<{ runs: { id: string; title: string }[]; nextCursor: string | null }>(`/v1/courses/${id}/runs?limit=100${runCursor ? `&cursor=${runCursor}` : ''}`);
  const history = useOnlineRecord<{ attempts: LearningAttempt[]; nextCursor: string | null }>(`/v1/courses/${id}/attempts?limit=100${historyCursor ? `&cursor=${historyCursor}` : ''}`);
  const materialNames = useOnlineCollection<OnlineMaterial>(`/v1/courses/${id}/materials?limit=50&archived=all`, 'materials');
  const defaults = useAccount().preferences.values;
  const [name, setName] = useState(''), [format, setFormat] = useState('all'), [count, setCount] = useState(defaults.questionCount), [feedback, setFeedback] = useState<'immediate' | 'end'>(defaults.feedback), [hints, setHints] = useState(defaults.hints);
  const [topic, setTopic] = useState(params.get('topicId') ?? ''), [difficulty, setDifficulty] = useState(''), [material, setMaterial] = useState(params.get('materialId') ?? '');
  const op = useLearningWrite(); const pending = useRef<z.infer<typeof createSetInput> | null>(null);
  const pool = bank.value?.filter(q => (format === 'all' || q.format === format) && (!topic || q.topicId === topic) && (!difficulty || q.difficulty === difficulty) && (!material || q.source?.materialId === material) && (!params.get('versionId') || q.source?.versionId === params.get('versionId'))) ?? [];
  const allowNavigation = useUnsentGuard(!!pending.current || !!name);
  return <Page className="py-8" width="prose"><PageHeader title="Practice" description="Saved sets, resumable work and repeated attempts." actions={<Link to={`/course/${id}`}>Course</Link>} />
    {[sets.error, bank.error, materialNames.error, active.error, history.error, op.error].filter(Boolean).map(e => <p role="alert" key={e}>{e}</p>)}
    {!sets.value && !sets.error && <p role="status">Loading practice…</p>}
    <section className="space-y-3"><h2 className="text-xl font-semibold">Continue studying</h2>{active.value?.runs.map(r => <p key={r.id}><Link className="underline" to={`/runs/${r.id}`}>{r.title}</Link></p>)}{active.value?.runs.length === 0 && <p>No active practice runs.</p>}{active.value?.nextCursor && <Button onClick={() => setRunCursor(active.value!.nextCursor!)}>More active runs</Button>}{runCursor && <Button onClick={() => setRunCursor('')}>First active runs</Button>}</section>
    <section className="space-y-3 border-t py-5"><h2 className="text-xl font-semibold">Saved sets</h2><Input aria-label="Search sets on this page" placeholder="Search this page" value={query} onChange={e => setQuery(e.target.value)} /><Select aria-label="Set status" value={archived} onChange={e => { setArchived(e.target.value); setCursor(''); }}><option value="false">Active</option><option value="true">Archived</option><option value="all">All</option></Select>
      {sets.value?.sets.filter(s => s.name.toLowerCase().includes(query.toLowerCase())).map(s => <p key={s.id}><Link className="underline" to={`/sets/${s.id}${planned ? `?plannedSessionId=${planned}` : ''}`}>{s.name}</Link></p>)}{sets.value?.sets.length === 0 && <p>No saved sets in this view.</p>}{sets.value?.nextCursor && <Button onClick={() => setCursor(sets.value!.nextCursor!)}>Next page</Button>}{cursor && <Button variant="outline" onClick={() => setCursor('')}>First page</Button>}</section>
    <section className="space-y-3 border-t py-5"><h2 className="text-xl font-semibold">Build from your question bank</h2><p>Questions keep their saved content and sources. No demo questions are added automatically.</p><fieldset className="space-y-3" disabled={op.busy || !!pending.current}>
      <label className="block">Set name<Input value={name} onChange={e => setName(e.target.value)} maxLength={200} /></label>
      <label className="block">Format<Select value={format} onChange={e => setFormat(e.target.value)}><option value="all">All formats</option>{formats.map(f => <option key={f}>{f}</option>)}</Select></label>
      <label className="block">Topic<Select value={topic} onChange={e => setTopic(e.target.value)}><option value="">All topics</option>{[...new Map(bank.value?.map(q => [q.topicId, q.topicLabel]) ?? []).entries()].map(([id, label]) => <option key={id} value={id}>{label}</option>)}</Select></label>
      <label className="block">Difficulty<Select value={difficulty} onChange={e => setDifficulty(e.target.value)}><option value="">All difficulties</option>{['recall', 'reasoning', 'stretch'].map(d => <option key={d}>{d}</option>)}</Select></label>
      <label className="block">Source material<Select value={material} onChange={e => setMaterial(e.target.value)}><option value="">All materials</option>{[...new Set(bank.value?.flatMap(q => q.source ? [q.source.materialId] : []) ?? [])].map(id => <option key={id} value={id}>{materialNames.value?.find(m => m.id === id)?.title ?? 'Saved material'}</option>)}</Select></label>{params.get('versionId') && <p>Filtered to the exact material version you opened.</p>}
      <label className="block">Questions<Input type="number" min={1} max={50} value={count} onChange={e => setCount(Number(e.target.value))} /></label>
      <label className="block">Feedback<Select value={feedback} onChange={e => setFeedback(e.target.value as 'immediate' | 'end')}><option value="immediate">After checking each answer</option><option value="end">At the end</option></Select></label>
      <label><input type="checkbox" checked={hints} onChange={e => setHints(e.target.checked)} /> Allow hints</label></fieldset>
      <p>{bank.value ? `${pool.length} matching questions in the complete course bank.` : 'Loading the complete question bank…'}</p>
      <Button disabled={op.busy || !name.trim() || !pool.length || count < 1 || count > 50} onClick={() => { pending.current ??= createSetInput.parse({ id: crypto.randomUUID(), name, questionIds: selectQuestions(pool, {}, count).map(q => q.id), feedback, hintsAllowed: hints }); void op.run<LearningSet>(`/v1/courses/${id}/sets`, pending.current, 'POST', saved => { pending.current = null; setName(''); allowNavigation(); nav(`/sets/${saved.id}${planned ? `?plannedSessionId=${planned}` : ''}`); }); }}>{op.busy ? 'Saving…' : pending.current ? 'Retry saving set' : 'Save set'}</Button>
      {bank.value?.length === 0 && <p>Your online bank is empty. Question generation is not connected yet.</p>}{!!bank.value?.length && !pool.length && <p>No saved questions match these filters.</p>}
      <p>Online question generation is not connected yet. Your saved practice remains available.</p>
    </section>
    <OnlineGeneration courseId={id} />
    <section className="space-y-3 border-t py-5"><h2 className="text-xl font-semibold">Attempt history</h2>{history.value?.attempts.map(a => <p key={a.id}><Link className="underline" to={`/attempts/${a.id}`}>{a.title}</Link> · {a.marksAvailable ? `${a.marksAwarded}/${a.marksAvailable} graded marks` : 'Not graded'} · {a.pending} pending</p>)}{history.value?.nextCursor && <Button onClick={() => setHistoryCursor(history.value!.nextCursor!)}>Older history page</Button>}{historyCursor && <Button onClick={() => setHistoryCursor('')}>First history page</Button>}</section>
  </Page>;
}
export function OnlineSet() {
  const { id = '' } = useParams(); const nav = useNavigate(); const [params] = useSearchParams(); const planned = params.get('plannedSessionId'); const op = useLearningWrite();
  const record = useOnlineRecord<{ set: LearningSet; items: { id: string; question: VersionedQuestion }[] }>(`/v1/sets/${id}`);
  const [name, setName] = useState<string | null>(null); const startId = useRef(crypto.randomUUID()); const edit = useRef<unknown>(null);
  const row = record.value?.set;
  useUnsentGuard(!!edit.current || name !== null && name !== row?.name);
  const [reviewSet, setReviewSet] = useState<typeof record.value>(null);
  return <Page className="py-8" width="prose"><PageHeader title={row?.name ?? 'Saved practice set'} description="Every attempt uses these same saved questions." />{record.error && <p role="alert">{record.error}</p>}{op.error && <p role="alert">{op.error}</p>}
    {op.code === 'revision_conflict' && <Button variant="outline" onClick={() => void op.run(`/v1/sets/${id}`, undefined, 'GET', v => setReviewSet(v as typeof record.value))}>Review latest set</Button>}{reviewSet && <div className="border p-4"><p>Saved name: {reviewSet.set.name}. {reviewSet.set.archived ? 'Archived' : 'Active'}. Your draft is retained.</p><Button onClick={() => { record.setValue(reviewSet); edit.current = null; setReviewSet(null); }}>Use reviewed revision</Button></div>}
    {row && <><Link className="underline" to={`/course/${row.courseId}/practice`}>Practice library</Link><p>{record.value!.items.length} questions · {row.archived ? 'Archived' : 'Active'}</p>
      <Button disabled={op.busy || row.archived} onClick={() => void op.run<LearningRun>(`/v1/sets/${id}/runs`, { id: startId.current, ...(planned ? { plannedSessionId: planned } : {}) }, 'POST', run => nav(`/runs/${run.id}`))}>Start another attempt</Button>
      <label className="block mt-6">Name<Input value={name ?? row.name} disabled={op.busy || !!edit.current} onChange={e => setName(e.target.value)} /></label>
      <Button disabled={op.busy} onClick={() => { edit.current ??= { operationId: crypto.randomUUID(), expectedRevision: row.revision, name: name ?? row.name, archived: row.archived }; void op.run<LearningSet>(`/v1/sets/${id}`, edit.current, 'PATCH', set => { edit.current = null; setName(null); record.setValue({ ...record.value!, set }); }); }}>Save name</Button>
      <Button variant="outline" disabled={op.busy || !!edit.current} onClick={() => { edit.current = { operationId: crypto.randomUUID(), expectedRevision: row.revision, name: row.name, archived: !row.archived }; void op.run<LearningSet>(`/v1/sets/${id}`, edit.current, 'PATCH', set => { edit.current = null; setName(null); record.setValue({ ...record.value!, set }); }); }}>{row.archived ? 'Restore' : 'Archive'}</Button>
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
  return <Page className="py-8" width="prose"><PageHeader title={run?.flashcardReview ? 'Second pass' : run?.title ?? 'Practice run'} description="Answers autosave after a short pause. Unsent work remains on this page if saving fails." />
    {record.error && <p role="alert">{record.error}</p>}{op.error && <p role="alert">{op.error}</p>}<p role="status">{op.busy ? 'Saving…' : dirty ? 'Unsaved changes' : message}</p>
    {run?.attemptId && <Link to={`/attempts/${run.attemptId}`}>Open saved result</Link>}
    {run && item && run.state === 'active' && <div className="space-y-5">{run.flashcardReview && <p>Revisit the cards you found difficult. Both passes remain self-rated, and your first ratings are retained.</p>}<p>Question {run.position + 1} of {run.items.length}</p>{exam && <div className="border p-4 space-y-3"><h2>{exam.configSnapshot.sections[exam.currentSectionIndex]?.title}</h2><p>{exam.configSnapshot.sections[exam.currentSectionIndex]?.instructions}</p><p>{deadline ? `${Math.max(0, Math.ceil((Date.parse(deadline) - (clock || Date.parse(run.serverNow!))) / 1000))} seconds remaining` : 'Untimed'} · No feedback before whole-paper submission.</p>{locked && <p>This section is locked.</p>}<div className="flex flex-wrap gap-2" aria-label="Exam question navigation">{run.items.map((q, position) => <Button key={q.id} variant={position === run.position ? 'default' : 'outline'} aria-current={position === run.position ? 'step' : undefined} aria-label={`Question ${position + 1}${exam.flagged.includes(q.question.id) ? ', flagged' : ''}${q.response.kind !== 'none' ? ', answered' : ', unanswered'}`} disabled={dirty || op.busy || !!pending.current || (exam.configSnapshot.navigation === 'sequential' && (position < run.position || position > run.position + 1))} onClick={() => examAction('navigate', position)}>{position + 1}{exam.flagged.includes(q.question.id) ? ' ⚑' : ''}</Button>)}</div>{exam.materialVersions.map(m => <p key={m.materialId}><Link className="underline" target="_blank" to={`/materials/${m.materialId}/versions/${m.versionId}`}>{m.title}</Link></p>)}<Button variant="outline" disabled={dirty || op.busy || !!pending.current} onClick={() => examAction('finish-section')}>Finish section</Button>{exam.configSnapshot.flaggingEnabled && <Button variant="outline" disabled={dirty || op.busy || !!pending.current} onClick={() => examAction('flag')}>{exam.flagged.includes(item.question.id) ? 'Remove flag' : 'Flag question'}</Button>}</div>}
      {item.question.format === 'flashcard' && !item.revealed ? <><p>{item.question.prompt}</p><Button disabled={op.busy || dirty} onClick={() => transition('reveal')}>Reveal answer</Button></> : <QuestionView key={item.id} question={item.question} revealed={item.revealed} answer={drafts[item.id] ?? item.response} onChange={answer => { setDrafts(old => ({ ...old, [item.id]: answer })); setMessage(''); }} readOnly={item.checked || locked || ((op.busy || !!pending.current) && (!!exam || !pending.current?.path.endsWith('/answers')))} />}
      {item.hinted && <p className="rounded border p-3">Hint used: {item.question.explanation}</p>}
      {run.hintsAllowed && !item.hinted && !item.checked && item.question.format !== 'flashcard' && <Button variant="outline" disabled={dirty || op.busy || !!pending.current} onClick={() => transition('hint')}>Show a hint</Button>}
      {run.feedback === 'immediate' && item.question.format !== 'flashcard' && !item.checked && <Button disabled={dirty || op.busy || !!pending.current} onClick={() => transition('check')}>Check saved answer</Button>}
      {item.feedback && <QuestionFeedback question={{ ...item.question, source: undefined }} attempt={item.feedback} />}
      <div className="flex flex-wrap gap-3"><Button variant="outline" disabled={op.busy || !!pending.current || run.position === 0 || (!!exam && (dirty || exam.configSnapshot.navigation === 'sequential'))} onClick={() => exam ? examAction('navigate', run.position - 1) : save(false, run.position - 1)}>Previous</Button><Button variant="outline" disabled={op.busy || !!pending.current || run.position + 1 === run.items.length || (!!exam && dirty)} onClick={() => exam ? examAction('navigate', run.position + 1) : save(false, run.position + 1)}>Next</Button><Button disabled={op.busy} onClick={() => save()}>{op.busy ? 'Saving…' : pending.current ? 'Retry saved request' : 'Save answers'}</Button>{!exam && !run.flashcardReview && run.position === run.items.length - 1 && run.items.some(i => i.response.kind === 'self-rating' && ['again', 'hard'].includes(i.response.rating)) && <Button disabled={dirty || op.busy || !!pending.current} onClick={() => { pending.current ??= { path: `/v1/runs/${id}/revisit`, method: 'POST', body: { operationId: crypto.randomUUID(), expectedRevision: run.revision } }; void op.run<LearningRun>(pending.current.path, pending.current.body, pending.current.method, accept); }}>Revisit difficult flashcards</Button>}<Button disabled={op.busy || !!pending.current} onClick={() => save(true)}>Submit all answers</Button></div>

      {(op.code === 'revision_conflict') && <Button variant="outline" onClick={() => void op.run<LearningRun>(`/v1/runs/${id}`, undefined, 'GET', setReview)}>Review saved answers</Button>}
      {review && <div className="border p-4"><h2>Saved revision {review.revision}</h2>{review.items.map(i => <div key={i.id}><p>{i.question.prompt}</p><pre className="whitespace-pre-wrap">{JSON.stringify(i.response)}</pre></div>)}<p>Your unsent answers remain above. Checked answers cannot be overwritten.</p><Button onClick={() => { record.setValue(review); setReview(null); pending.current = null; }}>Keep my drafts against this revision</Button></div>}
    </div>}
  </Page>;
}
export function OnlineAttempt() {
  const { id = '' } = useParams(); const op = useLearningWrite(); const nav = useNavigate(); const setId = useRef(crypto.randomUUID()); const { value: a, error } = useOnlineRecord<LearningAttempt & { feedbackRevisions?: { id: string; questionId: string; revision: number; createdAt: string; grading: import("@shared/types").WrittenGrading }[] }>(`/v1/attempts/${id}`);
  const missed = a?.questions.filter(q => ['incorrect', 'partial', 'skipped'].includes(q.result.outcome) || q.result.response.kind === 'self-rating' && ['again', 'hard'].includes(q.result.response.rating)).slice(0, 50) ?? [];
  return <Page className="py-8" width="prose"><PageHeader title={a?.title ?? 'Attempt result'} description="Saved responses and marking from this attempt." />{error && <p role="alert">{error}</p>}{a && <div className="space-y-6"><Link className="underline" to={`/course/${a.courseId}/practice`}>Practice library</Link>{op.error && <p role="alert">{op.error}</p>}{missed.length > 0 && <Button disabled={op.busy} onClick={() => void op.run<LearningSet>(`/v1/courses/${a.courseId}/sets`, { id: setId.current, name: `Review: ${a.title}`.slice(0, 200), questionIds: missed.map(q => q.question.id), feedback: 'immediate', hintsAllowed: true, remediatesAttemptId: a.id }, 'POST', saved => nav(`/sets/${saved.id}`))}>Practise missed questions and difficult cards ({missed.length})</Button>}{a.sampleTimingNotice && <p role="note">{a.sampleTimingNotice}</p>}{a.sampleDataset && <p>Sample activity. Objective answers use the normal marking rules. Sample written feedback is illustrative.</p>}{a.imported && <p>{a.markingVersion === 'recovered-objective-v1' ? 'Recovered practice, marked by the server. Earlier assistance could not be verified.' : 'Imported history. Recorded grading and assistance provenance are preserved from the original export.'}</p>}{a.finish && <p>Ended {a.finish === 'expired' ? 'when time expired' : 'by manual submission'}.</p>}<p>{a.marksAvailable ? `${a.marksAwarded}/${a.marksAvailable} graded marks` : 'Not graded'} · {a.pending} pending answers</p>{a.pending > 0 && <p>Written answers are saved. Online written feedback is not connected yet. Pending answers do not lower your grade.</p>}{a.questions.map(({ question, result }) => <section className="border-t pt-5 space-y-4" key={question.id}><h2>{question.prompt}</h2>{a.flashcardReview?.firstRatings[question.id] && <p>First pass: {a.flashcardReview.firstRatings[question.id]!.rating}. Final ratings remain self-rated.</p>}{result.response.kind === 'text' && question.rubric && <RequestFeedback attemptId={a.id} questionId={question.id} />}<QuestionFeedback question={{ ...question, source: undefined }} attempt={result} />{a.feedbackRevisions?.some(r => r.questionId === question.id) && <details><summary>Feedback revision history</summary>{a.feedbackRevisions.filter(r => r.questionId === question.id).map(r => <article key={r.id}><p>Revision {r.revision} · {r.grading.model} · {new Date(r.createdAt).toLocaleString()}</p><p>{r.grading.summary}</p>{r.grading.points?.map(p => <p key={p.rubricId}>{p.awarded}/{p.max}: {p.feedback}</p>)}</article>)}</details>}<Link className="underline" to={`/course/${a.courseId}/tutor?attemptId=${a.id}&questionId=${question.id}&topicId=${question.topicId}`}>Discuss this saved answer</Link>{question.source && <Link className="underline" to={`/materials/${question.source.materialId}/versions/${question.source.versionId}/passages/${question.source.passageId}`}>Read the exact source</Link>}</section>)}</div>}</Page>;
}
