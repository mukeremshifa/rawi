import { MessageBubble } from '@/features/tutor/MessageBubble';
import { useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import type { CourseDetail } from '@shared/online';
import type { OnlineTutorSession, TutorDetail } from '@shared/online-tutor';
import { STAGE_LABEL } from '@shared/tutor';
import { Page, PageHeader } from '@/components/layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useLearningWrite, useOnlineRecord, useUnsentGuard } from './learning-hooks';
export function OnlineTutorLibrary() {
  const { id = '' } = useParams(); const [params] = useSearchParams(); const nav = useNavigate(); const op = useLearningWrite();
  const [cursor, setCursor] = useState(''); const rows = useOnlineRecord<{ sessions: OnlineTutorSession[]; nextCursor: string | null }>(`/v1/courses/${id}/tutor${cursor ? `?cursor=${cursor}` : ''}`);
  const outline = useOnlineRecord<CourseDetail>(`/v1/courses/${id}/topics`);
  const [title, setTitle] = useState(''), [topicId, setTopicId] = useState(params.get('topicId') ?? ''), [query, setQuery] = useState(''), [archived, setArchived] = useState(false);
  const pending = useRef<unknown>(null);
  const allowNavigation = useUnsentGuard(!!title || !!pending.current);
  return <Page className="py-8" width="prose"><PageHeader title="Tutor" description="Save a session and your questions. Tutor replies are not connected online yet." actions={<Link to={`/course/${id}`}>Course</Link>} />{[rows.error, outline.error, op.error].filter(Boolean).map(e => <p role="alert" key={e}>{e}</p>)}
    <Input aria-label="Search tutor sessions" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search this page" /><label><input type="checkbox" checked={archived} onChange={e => setArchived(e.target.checked)} /> Show archived sessions</label>
    {rows.value?.sessions.filter(s => s.archived === archived && s.title.toLowerCase().includes(query.toLowerCase())).map(s => <p className="py-3 border-b" key={s.id}><Link className="underline" to={`/tutor/${s.id}`}>{s.title}</Link> · {s.topicLabel}</p>)}{rows.value?.nextCursor && <Button variant="outline" onClick={() => setCursor(rows.value!.nextCursor!)}>Next page</Button>}
    <section className="space-y-4 border-t pt-6 mt-6"><h2 className="text-xl font-semibold">New session</h2><fieldset disabled={op.busy || !!pending.current} className="space-y-3"><label className="block">Title<Input value={title} onChange={e => setTitle(e.target.value)} maxLength={200} /></label><label className="block">Topic<Select value={topicId} onChange={e => setTopicId(e.target.value)}><option value="">Choose a topic</option>{params.get('attemptId') && topicId && !outline.value?.topics.some(t => t.id === topicId) && <option value={topicId}>Historical topic from your saved answer</option>}{outline.value?.topics.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}</Select></label></fieldset>
      {params.get('passageId') && <p>This session will retain the exact source passage.</p>}{params.get('attemptId') && <p>This session will use the saved answer and feedback from your attempt.</p>}
      <Button disabled={op.busy || !title.trim() || !topicId} onClick={() => { pending.current ??= { id: crypto.randomUUID(), title, topicId, ...(params.get('plannedSessionId') ? { plannedSessionId: params.get('plannedSessionId') } : {}), ...(params.get('passageId') ? { source: { materialId: params.get('materialId'), versionId: params.get('versionId'), passageId: params.get('passageId') } } : {}), ...(params.get('attemptId') ? { review: { attemptId: params.get('attemptId'), questionId: params.get('questionId') } } : {}) }; void op.run<TutorDetail>(`/v1/courses/${id}/tutor`, pending.current, 'POST', d => { pending.current = null; setTitle(''); allowNavigation(); nav(`/tutor/${d.session.id}`); }); }}>{pending.current ? 'Retry creating session' : 'Create session'}</Button>
    </section></Page>;
}
export function OnlineTutor() {
  const { id = '' } = useParams(); const data = useOnlineRecord<TutorDetail>(`/v1/tutor/${id}`); const op = useLearningWrite();
  const [action, setAction] = useState('message');
  const [text, setText] = useState(''), [title, setTitle] = useState<string | null>(null), [review, setReview] = useState<TutorDetail | null>(null);
  const pending = useRef<{ path: string; body: unknown; method: string } | null>(null);
  useUnsentGuard(!!text || !!pending.current || title !== null && title !== data.value?.session.title);
  const row = data.value?.session;
  function send(path: string, body: unknown, method: string) {

    pending.current ??= { path, body, method }; const write = pending.current;
    void op.run<TutorDetail>(write.path, write.body, write.method, value => { if (pending.current?.method === 'POST') setText(''); pending.current = null; setTitle(null); data.setValue(value); });
  }
  return <Page className="py-8" width="prose"><PageHeader title={row?.title ?? 'Tutor session'} description={row ? `${row.topicLabel} · ${STAGE_LABEL[row.stage]}` : ''} />{data.error && <p role="alert">{data.error}</p>}{op.error && <p role="alert">{op.error}</p>}
    {row && <div className="space-y-5"><Link className="underline" to={`/course/${row.courseId}/tutor`}>Session library</Link><p role="status">{op.busy ? 'Saving…' : data.value!.execution.reason}</p>
      {row.sampleDataset && <p>Sample conversation. Replies were authored for this development workspace.</p>}{row.imported && <p>Imported tutor history. Model and grounding labels are preserved from the local record.</p>}{row.endedAt && <p>Session ended {new Date(row.endedAt).toLocaleString()}.</p>}
      {row.source && <Link className="underline" to={`/materials/${row.source.materialId}/versions/${row.source.versionId}/passages/${row.source.passageId}`}>Open exact source passage</Link>}
      {row.review && <details><summary>Saved answer under review</summary><p>{row.review.prompt}</p><pre className="whitespace-pre-wrap">{row.review.response}</pre><p>{row.review.feedback}</p><p>{row.review.pending ? 'Awaiting feedback' : `${row.review.marksAwarded}/${row.review.marksAvailable} marks`}{row.review.usedHint ? ' · Hint used' : ''}</p></details>}
      {data.value!.messages.map(m => <article className="space-y-2" key={m.id}><MessageBubble message={{ id: m.id, role: m.role, text: m.text, stage: m.provenance?.stage ?? row.stage, model: m.provenance?.model, grounding: m.provenance?.grounding, citations: m.provenance?.citations, droppedCitations: m.provenance?.droppedCitations, status: m.state === 'interrupted' ? 'interrupted' : m.provenance?.imported && !m.provenance.model ? undefined : 'complete' }} renderSource={source => { const exact = m.provenance?.citations.find(s => s.passageId === source.passageId); return exact ? <Link className="underline" to={`/materials/${exact.materialId}/versions/${exact.versionId}/passages/${exact.passageId}`}>Open cited passage</Link> : null; }} /><p className="text-xs text-muted-foreground">{m.provenance?.model} · {m.state === 'blocked' ? 'Saved. Reply unavailable.' : m.state}</p>{m.role === 'student' && !row.imported && !m.provenance?.sampleDataset && <Link className="underline text-sm" to={`/ai/${m.operationId}`}>Saved reply request</Link>}</article>)}
      {data.value!.nextCursor !== null && <Button variant="outline" disabled={op.busy} onClick={() => void op.run<TutorDetail>(`/v1/tutor/${id}?cursor=${data.value!.nextCursor}`, undefined, 'GET', page => data.setValue({ ...page, messages: [...data.value!.messages, ...page.messages] }))}>More messages</Button>}
      {data.value!.summary && <section className="rounded border p-4 space-y-3"><h2 className="font-semibold">Session summary</h2><p>Stage reached: {STAGE_LABEL[data.value!.summary.stageReached]}.</p>{data.value!.summary.covered.map(line => <p key={line}>{line}</p>)}<p>{row.completedLearning ? 'Completed tutor study. This remains assisted activity.' : 'This session does not count as completed learning.'}</p><Link className="underline" to={`/course/${row.courseId}/practice?topicId=${row.topicId}`}>Practise this topic</Link></section>}
      {!row.endedAt && <Button variant="outline" disabled={op.busy || !!pending.current || !!text || title !== null && title !== row.title} onClick={() => send(`/v1/tutor/${id}/end`, { operationId: crypto.randomUUID(), expectedRevision: row.revision }, 'POST')}>End session and view summary</Button>}
      <label className="block">How to help<Select value={action} disabled={op.busy || !!pending.current} onChange={e => setAction(e.target.value)}>{[['message', 'Respond to my question'], ['explain', 'Explain'], ['example', 'Give an example'], ['hint', 'Give a hint'], ['check', 'Check my understanding'], ['simpler', 'Make it simpler']].map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select></label><label className="block">Your question<Textarea aria-label="Your question" className="min-h-32" value={text} maxLength={4000} disabled={op.busy || !!pending.current || row.archived || !!row.endedAt} onChange={e => setText(e.target.value)} /></label>
      <Button disabled={op.busy || row.archived || !!row.endedAt || (!text.trim() && !pending.current)} onClick={() => send(`/v1/tutor/${id}/messages`, { operationId: crypto.randomUUID(), expectedRevision: row.revision, text, action }, 'POST')}>{pending.current ? 'Retry saved request' : 'Save question'}</Button>
      {(op.code === 'revision_conflict') && <Button variant="outline" onClick={() => void op.run<TutorDetail>(`/v1/tutor/${id}`, undefined, 'GET', setReview)}>Review latest session</Button>}{review && <div className="border p-4"><p>Latest saved revision {review.session.revision}. Your unsent question remains above.</p>{review.messages.map(m => <p key={m.id}>{m.text}</p>)}<Button onClick={() => { pending.current = null; data.setValue(review); setReview(null); }}>Keep my draft and use this revision</Button></div>}
      <fieldset className="border-t pt-5 space-y-3" disabled={op.busy || !!pending.current}><label className="block">Session name<Input value={title ?? row.title} onChange={e => setTitle(e.target.value)} /></label><Button variant="outline" onClick={() => send(`/v1/tutor/${id}`, { operationId: crypto.randomUUID(), expectedRevision: row.revision, title: title ?? row.title, archived: row.archived }, 'PATCH')}>Save name</Button><Button variant="outline" onClick={() => send(`/v1/tutor/${id}`, { operationId: crypto.randomUUID(), expectedRevision: row.revision, title: row.title, archived: !row.archived }, 'PATCH')}>{row.archived ? 'Restore session' : 'Archive session'}</Button></fieldset>
    </div>}
  </Page>;
}
