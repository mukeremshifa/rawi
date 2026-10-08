import { useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { viewOperation } from '../../../server/backend/ai';
import type { CourseDetail } from '@shared/online';
import type { OnlineMaterial } from '@shared/materials';
import { Page, PageHeader } from '@/components/layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { useOnlineRecord, useOnlineCollection, useLearningWrite, useUnsentGuard } from './learning-hooks';
type Operation = Awaited<ReturnType<typeof viewOperation>>;
export function OnlineAiOperation() {
  const op = useLearningWrite(); const stopId = useRef(crypto.randomUUID());
  const { id = '' } = useParams(); const data = useOnlineRecord<Operation>(`/v1/ai/operations/${id}`);
  return <Page className="py-8" width="prose"><PageHeader title="Saved AI request" description="Reload reads the saved operation. It does not send another provider request." />{data.error && <p role="alert">{data.error}</p>}{data.value && <div className="space-y-4">{op.error && <p role="alert">{op.error}</p>}<p>{data.value.task} · {data.value.state}</p><p role="status">{data.value.reason}</p>{data.value.executions.map(e => <article key={e.id}><p>{e.state}</p><p className="whitespace-pre-wrap">{e.partial}</p></article>)}{!['complete', 'cancelled'].includes(data.value.state) && <Button disabled={op.busy} onClick={() => void op.run<Operation>(`/v1/ai/operations/${id}/cancel`, { operationId: stopId.current }, 'POST', data.setValue)}>Stop this request</Button>}<Button variant="outline" onClick={data.refresh}>Refresh saved status</Button></div>}</Page>;
}
export function RequestFeedback({ attemptId, questionId }: { attemptId: string; questionId: string }) {
  const op = useLearningWrite(); const id = useRef(crypto.randomUUID()); const [saved, setSaved] = useState<Operation | null>(null);
  return <div>{op.error && <p role="alert">{op.error}</p>}{saved ? <><p>{saved.reason}</p><Link className="underline" to={`/ai/${saved.id}`}>Open saved feedback request</Link></> : <Button variant="outline" disabled={op.busy} onClick={() => void op.run<Operation>(`/v1/attempts/${attemptId}/feedback`, { operationId: id.current, questionId }, 'POST', setSaved)}>Request written feedback</Button>}</div>;
}
export function OnlineGeneration({ courseId }: { courseId: string }) {
  const outline = useOnlineRecord<CourseDetail>(`/v1/courses/${courseId}/topics`);
  const materials = useOnlineCollection<OnlineMaterial>(`/v1/courses/${courseId}/materials?limit=50`, 'materials');
  const [name, setName] = useState(''), [format, setFormat] = useState('flashcard'), [count, setCount] = useState(5), [topics, setTopics] = useState<string[]>([]), [selected, setSelected] = useState<string[]>([]);
  const op = useLearningWrite(), nav = useNavigate(); const pending = useRef<unknown>(null);
  const allowNavigation = useUnsentGuard(!!name || !!pending.current);
  return <section className="border-t py-5 space-y-3"><h2 className="text-xl font-semibold">Generate from material</h2><p>Hosted replies are unavailable. You can save a grounded request and reopen its status. No questions are created until validated provider output is available.</p>{[outline.error, materials.error, op.error].filter(Boolean).map(e => <p role="alert" key={e}>{e}</p>)}<fieldset disabled={op.busy || !!pending.current} className="space-y-3"><label className="block">Generated set name<Input maxLength={200} value={name} onChange={e => setName(e.target.value)} /></label><label className="block">Generated format<Select value={format} onChange={e => setFormat(e.target.value)}>{['flashcard', 'multiple-choice', 'written-recall'].map(f => <option key={f}>{f}</option>)}</Select></label><label className="block">Number of generated questions<Input type="number" min={1} max={10} value={count} onChange={e => setCount(Number(e.target.value))} /></label><h3>Topics</h3>{outline.value?.topics.map(t => <label className="block" key={t.id}><input type="checkbox" checked={topics.includes(t.id)} onChange={e => setTopics(e.target.checked ? [...topics, t.id] : topics.filter(id => id !== t.id))} /> {t.title}</label>)}<h3>Materials</h3>{materials.value?.map(m => <label className="block" key={m.id}><input type="checkbox" checked={selected.includes(m.id)} onChange={e => setSelected(e.target.checked ? [...selected, m.id] : selected.filter(id => id !== m.id))} /> {m.title}</label>)}</fieldset><Button disabled={op.busy || !name.trim() || !topics.length || !selected.length || count < 1 || count > 10} onClick={() => { pending.current ??= { operationId: crypto.randomUUID(), name, format, count, topicIds: topics, materialIds: selected, difficulties: ['recall', 'reasoning', 'stretch'] }; void op.run<Operation>(`/v1/courses/${courseId}/generate`, pending.current, 'POST', saved => { pending.current = null; setName(''); allowNavigation(); nav(`/ai/${saved.id}`); }); }}>{op.busy ? 'Saving…' : pending.current ? 'Retry saved request' : 'Save generation request'}</Button></section>;
}
