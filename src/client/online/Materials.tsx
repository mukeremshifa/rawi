import { cloneElement, isValidElement, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import Markdown from 'react-markdown';
import type { z } from 'zod';
import { createMaterialInput, fileTypes, materialFields, uploadInput, type OnlineMaterial, type MaterialVersion, type OnlinePassage, type VersionDetail, type UploadState, type UploadTicket } from '@shared/materials';
import type { CourseDetail, OnlineTopic } from '@shared/online';
import { Page, PageHeader } from '@/components/layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select } from '@/components/ui/select';
import { useAccount } from './OnlineApp';
import { errorMessage, request } from './api';

type Fields = z.infer<typeof materialFields>;
const empty: Fields = { title: '', kind: 'reading', attribution: '', topicIds: [] };
const materialPath = (id: string) => `/online/materials/${id}`;
function Field({ title, children }: { title: string; children: ReactNode }) {
  const id = useId();
  return <div className="grid gap-2 text-sm"><label htmlFor={id}>{title}</label>{isValidElement<{ id?: string }>(children) ? cloneElement(children, { id }) : children}</div>;
}
function FieldsEditor({ value, onChange, topics }: { value: Fields; onChange: (v: Fields) => void; topics: OnlineTopic[] }) {
  return <div className="grid gap-4">
    <Field title="Title"><Input value={value.title} maxLength={200} required onChange={e => onChange({ ...value, title: e.target.value })} /></Field>
    <Field title="Kind"><Select value={value.kind} onChange={e => onChange({ ...value, kind: e.target.value as Fields['kind'] })}>{['reading', 'notes', 'slides', 'other'].map(kind => <option key={kind}>{kind}</option>)}</Select></Field>
    <Field title="Attribution"><Textarea value={value.attribution} maxLength={4000} onChange={e => onChange({ ...value, attribution: e.target.value })} /></Field>
    <fieldset className="space-y-2"><legend>Topics</legend>{topics.map(topic => <label key={topic.id} className="flex gap-2"><input type="checkbox" checked={value.topicIds.includes(topic.id)} onChange={e => onChange({ ...value, topicIds: e.target.checked ? [...value.topicIds, topic.id] : value.topicIds.filter(id => id !== topic.id) })} />{topic.title}</label>)}</fieldset>
  </div>;
}
function useOperation() {
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [error, setError] = useState('');
  const controller = useRef(new AbortController()), locked = useRef(false);
  useEffect(() => { controller.current = new AbortController(); return () => controller.current.abort(); }, []);
  const run = async (fn: (signal: AbortSignal) => Promise<void>) => {
    if (locked.current) return;
    locked.current = true; setBusy(true); setError(''); setMessage('');
    try { await fn(controller.current.signal); }
    catch (e) { if (!controller.current.signal.aborted) setError(errorMessage(e)); }
    finally { locked.current = false; if (!controller.current.signal.aborted) setBusy(false); }
  };
  return { busy, message, error, setMessage, run };
}
function Status({ op }: { op: ReturnType<typeof useOperation> }) { return <div aria-live="polite">{op.busy && <p>Working…</p>}<p role="status">{op.message}</p>{op.error && <p role="alert" className="text-destructive">{op.error}</p>}</div>; }

export function OnlineMaterials() {
  const { id = '' } = useParams(); const { user } = useAccount(); const navigate = useNavigate(); const op = useOperation();
  const [course, setCourse] = useState<CourseDetail | null>(null), [rows, setRows] = useState<OnlineMaterial[]>([]), [cursor, setCursor] = useState<string | null>(null);
  const [filter, setFilter] = useState('false'), [topic, setTopic] = useState(''), [fields, setFields] = useState<Fields>(empty), [text, setText] = useState(''), [format, setFormat] = useState<'txt' | 'md'>('md');
  const [createId, setCreateId] = useState(() => crypto.randomUUID()); const [submitted, setSubmitted] = useState<z.infer<typeof createMaterialInput> | null>(null);
  const [pending, setPending] = useState<UploadState[]>([]);
  const [loadError, setLoadError] = useState('');
  async function load(signal: AbortSignal, after?: string) {
    const page = await request<{ materials: OnlineMaterial[]; nextCursor: string | null }>(`/v1/courses/${id}/materials?archived=${filter}${topic ? `&topicId=${topic}` : ''}${after ? `&cursor=${after}` : ''}`, user.id, undefined, 'GET', signal);
    setRows(old => after ? [...old, ...page.materials] : page.materials); setCursor(page.nextCursor);
  }
  useEffect(() => { const abort = new AbortController(); setLoadError(''); void (async () => {
    setCourse(await request<CourseDetail>(`/v1/courses/${id}/topics`, user.id, undefined, 'GET', abort.signal));
    await load(abort.signal);
    const page = await request<{ uploads: UploadState[] }>(`/v1/courses/${id}/uploads`, user.id, undefined, 'GET', abort.signal); setPending(page.uploads);
  })().catch(e => { if (!abort.signal.aborted) setLoadError(errorMessage(e)); }); return () => abort.abort(); }, [id, user.id, filter, topic]);
  return <Page className="py-8" width="prose"><PageHeader title={course ? `${course.course.name}: Materials` : 'Materials'} description="Private readings and originals, with preserved version history." actions={<Link className="underline" to={`/online/course/${id}`}>Course and topics</Link>} />
    <Status op={op} />
    {loadError && <p role="alert">{loadError}</p>}
    <div className="flex gap-4"><Field title="Status"><Select value={filter} onChange={e => setFilter(e.target.value)}><option value="false">Active</option><option value="true">Archived</option><option value="all">All</option></Select></Field><Field title="Topic"><Select value={topic} onChange={e => setTopic(e.target.value)}><option value="">All topics</option>{course?.topics.map(t => <option value={t.id} key={t.id}>{t.title}</option>)}</Select></Field></div>
    <ul className="space-y-3">{rows.map(row => <li className="rounded border p-4" key={row.id}><Link className="font-semibold underline" to={materialPath(row.id)}>{row.title}</Link><p>{row.archived ? 'Archived · ' : ''}{row.contentStatus === 'readable' ? 'Readable text' : 'File stored. Text has not been extracted.'}</p></li>)}</ul>
    {!rows.length && !op.busy && <p>No materials in this view.</p>}{cursor && <Button variant="outline" disabled={op.busy} onClick={() => void op.run(signal => load(signal, cursor))}>Load more</Button>}
    <section className="border-t pt-6 space-y-4"><h2 className="text-xl font-semibold">Add material</h2>
      <fieldset disabled={op.busy || !!submitted} className="space-y-4"><FieldsEditor value={fields} onChange={setFields} topics={course?.topics ?? []} /><Field title="Text format"><Select value={format} onChange={e => setFormat(e.target.value as 'txt' | 'md')}><option value="md">Markdown</option><option value="txt">Plain text</option></Select></Field><Field title="Paste text"><Textarea className="min-h-48" value={text} onChange={e => setText(e.target.value)} /></Field></fieldset>
      <Button disabled={op.busy} onClick={() => void op.run(async signal => {
        const input = submitted ?? createMaterialInput.parse({ ...fields, id: createId, text, format }); setSubmitted(input);
        const saved = await request<OnlineMaterial>(`/v1/courses/${id}/materials`, user.id, input, 'POST', signal); navigate(materialPath(saved.id));
      })}>{submitted ? 'Retry saving text' : 'Save text'}</Button>
      {submitted && <Button variant="outline" disabled={op.busy} onClick={() => { setSubmitted(null); setCreateId(crypto.randomUUID()); }}>Edit as a new request</Button>}
      <UploadControl courseId={id} fields={fields} onSaved={saved => navigate(materialPath(saved.materialId))} />
    </section>
    {!!pending.length && <section className="border-t pt-6 space-y-4"><h2 className="text-xl font-semibold">Pending uploads</h2><p>Refresh keeps upload metadata, but not the selected file. Check status or retry finalization first. If the bytes never arrived, start a new upload by selecting the file again. Byte-level resume is not available.</p>{pending.map(upload => <PendingUpload key={upload.id} initial={upload} onSaved={saved => navigate(materialPath(saved.materialId))} />)}</section>}
  </Page>;
}
function PendingUpload({ initial, onSaved }: { initial: UploadState; onSaved: (v: UploadState) => void }) {
  const { user } = useAccount(); const [value, setValue] = useState(initial); const op = useOperation();
  return <div className="rounded border p-4 space-y-2"><p>{value.fileName}: {value.state}{value.inProgress ? ', finalization in progress' : ''}</p><p>{value.failure}</p><p>Expires {new Date(value.expiresAt).toLocaleString()}</p><Status op={op} />
    <Button variant="outline" disabled={op.busy} onClick={() => void op.run(async signal => { const next = await request<UploadState>(`/v1/uploads/${value.id}`, user.id, undefined, 'GET', signal); setValue(next); if (next.state === 'ready') onSaved(next); })}>Check status</Button>
    {value.state === 'pending' && <Button disabled={op.busy} onClick={() => void op.run(async signal => { const next = await request<UploadState>(`/v1/uploads/${value.id}/finalize`, user.id, {}, 'POST', signal); setValue(next); if (next.state === 'ready') onSaved(next); })}>Retry finalization</Button>}
  </div>;
}
function UploadControl({ courseId, fields, material, onSaved }: { courseId: string; fields: Fields; material?: OnlineMaterial; onSaved: (v: UploadState) => void }) {
  const { user } = useAccount(); const op = useOperation(); const [file, setFile] = useState<File | null>(null), [progress, setProgress] = useState(0), [pending, setPending] = useState<UploadState | null>(null);
  const submitted = useRef<z.infer<typeof uploadInput> | null>(null);
  return <div className="space-y-3 rounded border p-4"><h3 className="font-semibold">{material ? 'Replace source with a new version' : 'Or upload an original file'}</h3><p>UTF-8 .txt and .md are readable. PDF, DOCX and PPTX are stored for download only. Their text is not yet available for studying. Up to 25 MiB per file, or 1 MiB for text.</p>
    <Field title="Source file"><input type="file" accept=".txt,.md,.pdf,.docx,.pptx" disabled={op.busy} onChange={e => { setFile(e.target.files?.[0] ?? null); submitted.current = null; setPending(null); setProgress(0); }} /></Field>
    <Status op={op} />{op.busy && <progress aria-label="File upload progress" max={100} value={progress} />}
    <Button variant="outline" disabled={!file || op.busy} onClick={() => void op.run(async signal => {
      if (!file) return;
      if (file.size > 25 * 1048576) throw new Error('Choose a file up to 25 MiB.');
      const type = file.name.split('.').pop()?.toLowerCase();
      if (!fileTypes.includes(type as typeof fileTypes[number])) throw new Error('Choose TXT, Markdown, PDF, DOCX or PPTX.');
      if (!submitted.current) {
        const checksum = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', await file.arrayBuffer())), n => n.toString(16).padStart(2, '0')).join('');
        if (signal.aborted) return;
        submitted.current = uploadInput.parse({ ...fields, requestId: crypto.randomUUID(), materialId: material?.id, expectedRevision: material?.revision, fileName: file.name, size: file.size, type, checksum });
      }
      const ticket = await request<UploadTicket>(`/v1/courses/${courseId}/uploads`, user.id, submitted.current, 'POST', signal); setPending(ticket.upload);
      if (ticket.upload.state === 'ready') { onSaved(ticket.upload); return; }
      if (!ticket.url || !ticket.headers) throw new Error(ticket.upload.failure ?? 'This upload expired. Select the file again to start a new upload.');
      op.setMessage('Uploading bytes. The material is not saved yet.');
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest(); const abort = () => xhr.abort();
        xhr.open('PUT', ticket.url!); xhr.withCredentials = false; xhr.timeout = 120000;
        for (const [key, value] of Object.entries(ticket.headers!)) xhr.setRequestHeader(key, value);
        xhr.upload.onprogress = e => { if (e.lengthComputable) setProgress(Math.round(e.loaded / e.total * 100)); };
        xhr.onload = () => xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error('Storage upload failed. Retry with the same selected file.'));
        xhr.onerror = () => reject(new Error('Cannot reach private storage. Check the connection and storage CORS configuration.'));
        xhr.ontimeout = () => reject(new Error('The upload timed out. Retry with the same selected file.'));
        xhr.onabort = () => reject(new Error('Upload cancelled.'));
        xhr.onloadend = () => signal.removeEventListener('abort', abort);
        signal.addEventListener('abort', abort, { once: true }); if (signal.aborted) { reject(new Error('Upload cancelled.')); return; } xhr.send(file);
      });
      op.setMessage('Bytes uploaded. Validating and saving the material…');
      const result = await request<UploadState>(`/v1/uploads/${ticket.upload.id}/finalize`, user.id, {}, 'POST', signal); setPending(result);
      if (result.state === 'ready') { op.setMessage('Material saved.'); onSaved(result); }
      else throw new Error(result.failure ?? 'The upload is still pending. Retry finalization.');
    })}>Upload selected file</Button>
    {pending && <PendingUpload key={`${pending.id}:${pending.state}`} initial={pending} onSaved={onSaved} />}
  </div>;
}

export function OnlineMaterialReader() {
  const { materialId = '', versionId, passageId } = useParams(); const { user } = useAccount(); const op = useOperation();
  const [material, setMaterial] = useState<OnlineMaterial | null>(null), [detail, setDetail] = useState<VersionDetail | null>(null), [topics, setTopics] = useState<OnlineTopic[]>([]);
  const [versions, setVersions] = useState<MaterialVersion[]>([]), [historyCursor, setHistoryCursor] = useState<string | null>(null);
  const [fields, setFields] = useState<Fields>(empty), [text, setText] = useState(''), [format, setFormat] = useState<'txt' | 'md'>('md'), [editing, setEditing] = useState(false);
  const [review, setReview] = useState<OnlineMaterial | null>(null), [reviewText, setReviewText] = useState(''); const textRequest = useRef<{ requestId: string; expectedRevision: number; text: string; format: 'txt' | 'md' } | null>(null);
  const [loadError, setLoadError] = useState('');
  async function history(signal: AbortSignal, cursor?: string) {
    const page = await request<{ versions: MaterialVersion[]; nextCursor: string | null }>(`/v1/materials/${materialId}/versions${cursor ? `?cursor=${cursor}` : ''}`, user.id, undefined, 'GET', signal);
    setVersions(old => cursor ? [...old, ...page.versions] : page.versions); setHistoryCursor(page.nextCursor);
  }
  async function allText(id: string, signal: AbortSignal) {
    let text = '', cursor: number | null = -1;
    while (cursor !== null) { const page: VersionDetail = await request(`/v1/materials/${materialId}/versions/${id}?cursor=${cursor}`, user.id, undefined, 'GET', signal); text += page.passages.map(p => p.text).join(''); cursor = page.nextCursor; }
    return text;
  }
  async function reload(signal: AbortSignal) {
    const row = await request<OnlineMaterial>(`/v1/materials/${materialId}`, user.id, undefined, 'GET', signal); setMaterial(row); setFields({ title: row.title, kind: row.kind, attribution: row.attribution, topicIds: row.topicIds });
    const course = await request<CourseDetail>(`/v1/courses/${row.courseId}/topics`, user.id, undefined, 'GET', signal); setTopics(course.topics);
    const selected = versionId ?? row.currentVersionId;
    if (selected) {
      const page = await request<VersionDetail>(`/v1/materials/${materialId}/versions/${selected}`, user.id, undefined, 'GET', signal);
      if (passageId) { page.passages = [await request<OnlinePassage>(`/v1/materials/${materialId}/versions/${selected}/passages/${passageId}`, user.id, undefined, 'GET', signal)]; page.nextCursor = null; }
      setDetail(page);
    }
    await history(signal);
  }
  useEffect(() => { const abort = new AbortController(); void reload(abort.signal).catch(e => { if (!abort.signal.aborted) setLoadError(errorMessage(e)); }); return () => abort.abort(); }, [materialId, versionId, passageId, user.id]);
  return <Page className="py-8" width="prose"><PageHeader title={material?.title ?? 'Material'} description={material?.attribution} actions={material && <Link className="underline" to={`/online/course/${material.courseId}/materials`}>Material library</Link>} /><Status op={op} />
    {loadError && <p role="alert">{loadError}</p>}
    {material && detail && <>
      <p>{material.archived ? 'Archived · ' : ''}Version {detail.version.number} · {detail.version.origin}{versionId && <Link className="ml-3 underline" to={materialPath(materialId)}>Current version</Link>}</p>
      <div className="flex flex-wrap gap-3"><Button variant="outline" disabled={op.busy} onClick={() => void op.run(async signal => {
        const result = await request<{ available: boolean; url?: string; message?: string }>(`/v1/materials/${materialId}/versions/${detail.version.id}/download`, user.id, {}, 'POST', signal);
        if (!result.available || !result.url) { op.setMessage(result.message ?? 'No original file.'); return; }
        const link = document.createElement('a'); link.href = result.url; link.rel = 'noreferrer'; link.referrerPolicy = 'no-referrer'; link.click();
      })}>Download original</Button>
      <Button variant="outline" disabled={op.busy} onClick={() => void op.run(async signal => { const saved = await request<OnlineMaterial>(`/v1/materials/${materialId}`, user.id, { archived: !material.archived, expectedRevision: material.revision }, 'PATCH', signal); setMaterial(saved); op.setMessage(saved.archived ? 'Archived. Versions and originals remain available.' : 'Restored to the library.'); })}>{material.archived ? 'Restore' : 'Archive'}</Button></div>
      {detail.version.contentStatus !== 'readable' ? <p className="rounded border p-4">{detail.version.contentStatus === 'not_extracted' ? 'The original file is stored privately. Its text has not been extracted and is not available for studying.' : 'Text conversion failed. This content is not available for studying.'}</p> : detail.passages.map(p => <article key={p.id} className="space-y-3 border-t pt-5"><h2 className="text-lg font-semibold">{p.heading}</h2><Link className="text-sm underline" to={`${materialPath(materialId)}/versions/${detail.version.id}/passages/${p.id}`}>Link to this exact passage</Link><div className="rawi-prose whitespace-pre-wrap break-words leading-relaxed">{detail.version.format === 'md' ? <Markdown skipHtml components={{ img: () => null, a: ({ children, href }) => <a href={href && /^https?:\/\//i.test(href) ? href : undefined} rel="noreferrer noopener" target="_blank">{children}</a> }}>{p.text}</Markdown> : p.text}</div></article>)}
      {detail.nextCursor !== null && <Button variant="outline" disabled={op.busy} onClick={() => void op.run(async signal => { const page = await request<VersionDetail>(`/v1/materials/${materialId}/versions/${detail.version.id}?cursor=${detail.nextCursor}`, user.id, undefined, 'GET', signal); setDetail({ ...page, passages: [...detail.passages, ...page.passages] }); })}>Read more passages</Button>}
      <p className="text-sm text-muted-foreground">Online tutoring and practice are not available yet.</p>
      <section className="border-t pt-6 space-y-4"><h2 className="text-xl font-semibold">Version history</h2><ul>{versions.map(v => <li key={v.id}><Link className="underline" to={`${materialPath(materialId)}/versions/${v.id}`}>Version {v.number}, {new Date(v.createdAt).toLocaleString()}, {v.origin}</Link></li>)}</ul>{historyCursor && <Button variant="outline" onClick={() => void op.run(signal => history(signal, historyCursor))}>More versions</Button>}</section>
      {!versionId && <section className="border-t pt-6 space-y-4"><h2 className="text-xl font-semibold">Edit material</h2><p>Unsent changes stay on this page after errors. Reloading or navigating away discards them.</p><fieldset disabled={op.busy}><FieldsEditor value={fields} onChange={setFields} topics={topics} /></fieldset>
        <Button disabled={op.busy} onClick={() => void op.run(async signal => { const saved = await request<OnlineMaterial>(`/v1/materials/${materialId}`, user.id, { ...materialFields.parse(fields), expectedRevision: material.revision }, 'PATCH', signal); setMaterial(saved); op.setMessage('Metadata saved.'); })}>Save metadata</Button>
        {!editing && <Button variant="outline" disabled={op.busy} onClick={() => void op.run(async signal => { setText(await allText(detail.version.id, signal)); setFormat(detail.version.format === 'md' ? 'md' : 'txt'); setEditing(true); })}>Edit readable text</Button>}
        {editing && <><Field title="Text format"><Select value={format} disabled={!!textRequest.current} onChange={e => setFormat(e.target.value as 'txt' | 'md')}><option value="md">Markdown</option><option value="txt">Plain text</option></Select></Field><Field title="New version text"><Textarea className="min-h-64" disabled={op.busy || !!textRequest.current} value={text} onChange={e => setText(e.target.value)} /></Field><Button disabled={op.busy} onClick={() => void op.run(async signal => { textRequest.current ??= { requestId: crypto.randomUUID(), expectedRevision: material.revision, text, format }; await request(`/v1/materials/${materialId}/versions`, user.id, textRequest.current, 'POST', signal); textRequest.current = null; setEditing(false); await reload(signal); op.setMessage('New version saved. Earlier passages remain available.'); })}>{textRequest.current ? 'Retry saving version' : 'Save new version'}</Button><Button variant="outline" disabled={op.busy} onClick={() => { textRequest.current = null; op.setMessage('You can revise the unsent text.'); }}>Revise unsent text</Button></>}
        <Button variant="outline" disabled={op.busy} onClick={() => void op.run(async signal => { const latest = await request<OnlineMaterial>(`/v1/materials/${materialId}`, user.id, undefined, 'GET', signal); const latestText = latest.currentVersionId ? await allText(latest.currentVersionId, signal) : ''; setReview(latest); setReviewText(latestText); })}>Review latest saved material</Button>
        {review && <div className="rounded border p-4 space-y-3"><h3 className="font-semibold">Latest saved revision {review.revision}</h3><p>{review.title}</p><p>{review.attribution}</p><p>Kind: {review.kind}. {review.archived ? 'Archived' : 'Active'}. Topics: {review.topicIds.map(id => topics.find(t => t.id === id)?.title ?? id).join(', ') || 'None'}.</p><pre className="max-h-64 overflow-auto whitespace-pre-wrap">{reviewText}</pre><p>Your unsent fields remain above. Saving again will use this revision.</p><Button onClick={() => { setMaterial(review); setReview(null); textRequest.current = null; }}>Keep my edits and use this revision</Button></div>}
        <p>Replacing a source changes its content only. Save title, attribution and topic edits separately.</p>
        <UploadControl courseId={material.courseId} fields={{ title: material.title, kind: material.kind, attribution: material.attribution, topicIds: material.topicIds }} material={material} onSaved={() => void op.run(reload)} />
      </section>}
    </>}
  </Page>;
}
