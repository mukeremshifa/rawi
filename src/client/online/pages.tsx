import { useUnsentGuard } from './learning-hooks';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { z } from 'zod';
import { accents, courseFields, coursePatch, createCourseInput, replaceOutlineInput, preferencesPatch, type CourseDetail, type CoursePage, type CreateCourseInput, type OnlineCourse, type OnlinePreferences, type TopicInput } from '@shared/online';
import { readSyllabus } from '@shared/syllabus';
import { Page, PageHeader } from '@/components/layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select } from '@/components/ui/select';
import { useAccount } from './OnlineApp';
import { errorMessage, OnlineError, request } from './api';

type Fields = z.infer<typeof courseFields>;
function Field({ title, children }: { title: string; children: ReactNode }) {
  return <label className="flex flex-col gap-2 text-sm font-medium">{title}{children}</label>;
}
function CourseFields({ value, onChange }: { value: Fields; onChange: (v: Fields) => void }) {
  return <div className="grid gap-4">
    <Field title="Course name"><Input required maxLength={200} value={value.name} onChange={e => onChange({ ...value, name: e.target.value })} /></Field>
    <Field title="Description"><Textarea maxLength={4000} value={value.description} onChange={e => onChange({ ...value, description: e.target.value })} /></Field>
    <Field title="Your goal"><Textarea maxLength={4000} value={value.goal} onChange={e => onChange({ ...value, goal: e.target.value })} /></Field>
    <Field title="Colour"><Select value={value.accent} onChange={e => onChange({ ...value, accent: e.target.value as Fields['accent'] })}>{accents.map(a => <option key={a}>{a}</option>)}</Select></Field>
  </div>;
}
function courseValues(course: Fields): Fields { return { name: course.name, description: course.description, goal: course.goal, accent: course.accent }; }
function useSaveState() {
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState<unknown>(null);
  const lock = useRef(false);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const run = async (operation: () => Promise<void>) => {
    if (lock.current) return;
    lock.current = true; setSaving(true); setMessage(''); setError(null);
    try { await operation(); if (alive.current) setMessage('Saved to your account.'); }
    catch (e) { if (alive.current) setError(e); }
    finally { lock.current = false; if (alive.current) setSaving(false); }
  };
  return { saving, message, error, run, clear: () => { setMessage('Unsaved changes'); setError(null); } };
}
function SaveStatus({ state, onReview }: { state: ReturnType<typeof useSaveState>; onReview?: () => void }) {
  const conflict = state.error instanceof OnlineError && state.error.code === 'revision_conflict';
  return <div aria-live="polite" className="space-y-2">
    <p role="status">{state.saving ? 'Saving…' : state.message}</p>
    {!!state.error && <p role="alert" className="text-destructive">{errorMessage(state.error)}{state.error instanceof OnlineError && state.error.requestId ? ` Reference: ${state.error.requestId}` : ''}</p>}
    {conflict && onReview && <Button variant="outline" onClick={onReview}>Load latest version for review</Button>}
  </div>;
}
export function CourseLibrary() {
  const [filter, setFilter] = useState('false');
  return <Page className="py-8"><PageHeader title="Your courses" description="Courses saved to your personal account." actions={<Button asChild><Link to="/courses/new">Add a course</Link></Button>} />
    <Field title="Course status"><Select value={filter} onChange={e => setFilter(e.target.value)}><option value="false">Active</option><option value="true">Archived</option><option value="all">Active and archived</option></Select></Field>
    <CourseList key={filter} filter={filter} />
  </Page>;
}
function CourseList({ filter }: { filter: string }) {
  const { user } = useAccount();
  const [page, setPage] = useState<CoursePage | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const alive = useRef(true);
  const load = async (cursor?: string, signal?: AbortSignal) => {
    setLoading(true); setError('');
    try {
      const next = await request<CoursePage>(`/v1/courses?archived=${filter}${cursor ? `&cursor=${cursor}` : ''}`, user.id, undefined, 'GET', signal);
      if (alive.current && !signal?.aborted) setPage(previous => ({ ...next, courses: cursor ? [...(previous?.courses ?? []), ...next.courses] : next.courses }));
    } catch (e) { if (alive.current && !signal?.aborted) setError(errorMessage(e)); }
    finally { if (alive.current && !signal?.aborted) setLoading(false); }
  };
  useEffect(() => {
    alive.current = true;
    const controller = new AbortController(); void load(undefined, controller.signal);
    return () => { alive.current = false; controller.abort(); };
  }, [filter, user.id]);
  return <div className="grid gap-4">
    {loading && <p role="status">Loading courses…</p>}
    {error && <div role="alert"><p>{error}</p><Button variant="outline" onClick={() => void load(page?.nextCursor ?? undefined)}>Retry loading</Button></div>}
    {page?.courses.map(course => <article className="rounded-lg border p-5 space-y-2" key={course.id}><h2 className="font-semibold text-lg"><Link className="underline" to={`/course/${course.id}`}>{course.name}</Link></h2><p>{course.description}</p><p className="text-muted-foreground text-sm">{course.archived ? 'Archived' : 'Active'}</p></article>)}
    {page?.courses.length === 0 && <p>No courses match this view. Add a course to begin.</p>}
    {page?.nextCursor && <Button variant="outline" disabled={loading} onClick={() => void load(page.nextCursor!)}>Load more courses</Button>}
  </div>;
}
export function NewOnlineCourse() {
  const { user } = useAccount(); const navigate = useNavigate();
  const [id] = useState(() => crypto.randomUUID());
  const [fields, setFields] = useState<Fields>({ name: '', description: '', goal: '', accent: 'indigo' });
  const [submitted, setSubmitted] = useState<CreateCourseInput | null>(null);
  const allowNavigation = useUnsentGuard(!!fields.name || !!fields.description || !!fields.goal || !!submitted);
  const save = useSaveState();
  const create = () => save.run(async () => {
    const parsed = createCourseInput.safeParse(submitted ?? { ...fields, id, topics: [] });
    if (!parsed.success) throw new Error('Enter a course name and check the field lengths.');
    setSubmitted(parsed.data);
    const result = await request<CourseDetail>('/v1/courses', user.id, parsed.data, 'POST');
    allowNavigation(); navigate(`/course/${result.course.id}/syllabus`, { replace: true });
  });
  return <Page className="py-8" width="prose"><PageHeader title="Add a course" description="After saving, build its topic outline." />
    <form className="space-y-5" onSubmit={e => { e.preventDefault(); void create(); }}><fieldset disabled={save.saving || !!submitted}><CourseFields value={fields} onChange={v => { setFields(v); save.clear(); }} /></fieldset>
      <Button disabled={save.saving}>{submitted ? 'Retry the same creation' : 'Create course'}</Button>
    </form>
    {submitted && !save.saving && <p>Your creation details are kept unchanged for a safe retry. <Link className="underline" to={`/course/${id}`}>Check whether this course was saved</Link> before starting another.</p>}
    <SaveStatus state={save} />
  </Page>;
}
export function CourseEditor() {
  const { id } = useParams(); const { user } = useAccount();
  const [detail, setDetail] = useState<CourseDetail | null>(null);
  const [error, setError] = useState(''); const [retry, setRetry] = useState(0);
  useEffect(() => {
    const abort = new AbortController(); setDetail(null); setError('');
    void request<CourseDetail>(`/v1/courses/${id}/topics`, user.id, undefined, 'GET', abort.signal).then(setDetail).catch(e => { if (!abort.signal.aborted) setError(errorMessage(e)); });
    return () => abort.abort();
  }, [id, user.id, retry]);
  if (error) return <Page className="py-8"><p role="alert">{error}</p><Button onClick={() => setRetry(n => n + 1)}>Retry loading</Button><Link to="/courses">Back to courses</Link></Page>;
  if (!detail) return <Page className="py-8"><p role="status">Loading course and outline…</p></Page>;
  return <LoadedCourse initial={detail} />;
}
function LoadedCourse({ initial }: { initial: CourseDetail }) {
  const { user } = useAccount();
  const [base, setBase] = useState(initial);
  const metadata = useRef<z.infer<typeof coursePatch> | null>(null), outlineRequest = useRef<z.infer<typeof replaceOutlineInput> | null>(null);
  const [fields, setFields] = useState(courseValues(initial.course));
  const [topics, setTopics] = useState<TopicInput[]>(initial.topics.map(topicValues));
  useUnsentGuard(JSON.stringify(fields) !== JSON.stringify(courseValues(base.course)) || JSON.stringify(topics) !== JSON.stringify(base.topics.map(topicValues)));
  const [review, setReview] = useState<CourseDetail | null>(null);
  const [reviewError, setReviewError] = useState('');
  const save = useSaveState();
  const conflicted = save.error instanceof OnlineError && save.error.code === 'revision_conflict';
  const update = (archived?: boolean) => save.run(async () => {
    const parsed = courseFields.safeParse(fields);
    if (!parsed.success) throw new Error('Enter a course name and check the field lengths.');
    metadata.current ??= { ...parsed.data, operationId: crypto.randomUUID(), ...(archived === undefined ? {} : { archived }), expectedRevision: base.course.revision };
    const course = await request<OnlineCourse>(`/v1/courses/${base.course.id}`, user.id, metadata.current, 'PATCH'); metadata.current = null;
    setBase(previous => ({ ...previous, course })); setFields(courseValues(course));
  });
  const saveOutline = () => save.run(async () => {
    const parsed = replaceOutlineInput.safeParse(outlineRequest.current ?? { operationId: crypto.randomUUID(), topics, expectedRevision: base.course.revision });
    if (!parsed.success) throw new Error('Every topic needs a title and valid links to other topics in this course.');
    outlineRequest.current = parsed.data;
    const result = await request<CourseDetail>(`/v1/courses/${base.course.id}/topics`, user.id, parsed.data, 'PUT'); outlineRequest.current = null;
    setBase(result); setTopics(result.topics.map(topicValues));
  });
  const loadReview = async () => {
    setReviewError('');
    try { setReview(await request<CourseDetail>(`/v1/courses/${base.course.id}/topics`, user.id)); }
    catch (e) { setReviewError(errorMessage(e)); }
  };
  const dirty = () => { if (!conflicted) save.clear(); };
  return <Page className="py-8" width="prose"><PageHeader title={base.course.name} description={base.course.archived ? 'Archived course. Restore it to your active library.' : 'Course settings and topic outline'} actions={<Button variant="outline" asChild><Link to="/courses">All courses</Link></Button>} />
    <form className="space-y-4" onSubmit={e => { e.preventDefault(); void update(); }}><fieldset disabled={save.saving || !!metadata.current}><CourseFields value={fields} onChange={v => { setFields(v); dirty(); }} /></fieldset>
      <div className="flex flex-wrap gap-3"><Button disabled={save.saving || conflicted}>Save course details</Button><Button type="button" variant="outline" disabled={save.saving || conflicted} onClick={() => void update(!base.course.archived)}>{base.course.archived ? 'Restore course' : 'Archive course'}</Button></div>
    </form>
    <section className="space-y-4 border-t pt-6"><h2 className="text-xl font-semibold">Topic outline</h2><p className="text-muted-foreground text-sm">Edit and reorder topics, then save the outline. Removing a topic removes its links. Course deletion is not available.</p>
      <fieldset disabled={save.saving || !!outlineRequest.current}><OutlineEditor topics={topics} onChange={value => { setTopics(value); dirty(); }} /></fieldset>
      <Button disabled={save.saving || conflicted} onClick={() => void saveOutline()}>Save outline</Button>
    </section>
    <SaveStatus state={save} onReview={() => void loadReview()} />
    {reviewError && <p role="alert">{reviewError}</p>}
    {review && <section className="rounded border p-4 space-y-4"><h2 className="font-semibold">Review the latest saved version</h2><p>Your unsent edits remain in the fields above. Compare them with this saved version before choosing.</p><CourseReview detail={review} />
      <div className="flex flex-wrap gap-3"><Button variant="outline" onClick={() => { metadata.current = null; outlineRequest.current = null; setBase(review); setFields(courseValues(review.course)); setTopics(review.topics.map(topicValues)); setReview(null); save.clear(); }}>Use latest version</Button><Button onClick={() => { metadata.current = null; outlineRequest.current = null; setBase(review); setReview(null); save.clear(); }}>Keep my edits for another save</Button></div>
    </section>}
    <nav className="flex flex-wrap gap-4 border-t pt-6">{['materials', 'tutor', 'practice', 'exams', 'progress'].map(area => <Link className="underline" key={area} to={`/course/${base.course.id}/${area}`}>{area[0]!.toUpperCase() + area.slice(1)}</Link>)}</nav>
  </Page>;
}
function topicValues(t: TopicInput): TopicInput { return { id: t.id, title: t.title, summary: t.summary, priority: t.priority, module: t.module, order: t.order, relatedTopicIds: [...t.relatedTopicIds] }; }
function CourseReview({ detail }: { detail: CourseDetail }) {
  return <div className="space-y-2"><h3>{detail.course.name}</h3><p>{detail.course.description}</p><p>Goal: {detail.course.goal || 'None'}</p><p>Colour: {detail.course.accent}. {detail.course.archived ? 'Archived' : 'Active'}.</p>
    <ol className="list-decimal pl-5">{detail.topics.map(t => <li key={t.id}>{t.title} ({t.module || 'No module'}, {t.priority})<p>{t.summary}</p><p>Related topics: {t.relatedTopicIds.map(id => detail.topics.find(other => other.id === id)?.title).join(', ') || 'None'}</p></li>)}</ol>
  </div>;
}
function OutlineEditor({ topics, onChange }: { topics: TopicInput[]; onChange: (topics: TopicInput[]) => void }) {
  const [pasted, setPasted] = useState(''); const [notice, setNotice] = useState('');
  useUnsentGuard(!!pasted);
  const ordered = (next: TopicInput[]) => onChange(next.map((topic, order) => ({ ...topic, order })));
  const edit = (id: string, patch: Partial<TopicInput>) => onChange(topics.map(t => t.id === id ? { ...t, ...patch } : t));
  const append = () => {
    const reading = readSyllabus(pasted);
    if (reading.topics.length + topics.length > 200) { setNotice('An outline can contain up to 200 topics.'); return; }
    ordered([...topics, ...reading.topics.map(t => ({ id: crypto.randomUUID(), title: t.title, summary: t.summary, module: t.module ?? '', priority: 'normal' as const, order: 0, relatedTopicIds: [] }))]);
    setPasted(''); setNotice(`${reading.summary} Review the added topics before saving.`);
  };
  const move = (index: number, step: number) => { const next = [...topics]; [next[index], next[index + step]] = [next[index + step]!, next[index]!]; ordered(next); };
  return <div className="space-y-4">
    <details className="rounded border p-4"><summary>Read a pasted syllabus or text file</summary><div className="pt-4 space-y-3"><Field title="Syllabus text"><Textarea value={pasted} maxLength={100000} onChange={e => setPasted(e.target.value)} /></Field>
      <Field title="Text or Markdown file"><Input type="file" accept=".txt,.md,text/plain,text/markdown" onChange={async e => {
        const file = e.target.files?.[0]; if (!file) return;
        if (!/\.(txt|md)$/i.test(file.name) || file.size > 100000) { setNotice('Choose a text or Markdown file smaller than 100 KB.'); return; }
        try { setPasted(await file.text()); setNotice('File read. Review the text, then add proposed topics.'); } catch { setNotice('This file could not be read.'); }
      }} /></Field><Button type="button" variant="outline" onClick={append}>Add proposed topics for review</Button><p role="status">{notice}</p></div></details>
    {topics.map((topic, index) => <fieldset key={topic.id} className="rounded-lg border p-4 space-y-3"><legend className="px-2">Topic {index + 1}</legend>
      <Field title="Topic title"><Input maxLength={200} value={topic.title} onChange={e => edit(topic.id, { title: e.target.value })} /></Field>
      <Field title="Summary"><Textarea maxLength={4000} value={topic.summary} onChange={e => edit(topic.id, { summary: e.target.value })} /></Field>
      <Field title="Module or week"><Input maxLength={200} value={topic.module} onChange={e => edit(topic.id, { module: e.target.value })} /></Field>
      <Field title="Priority"><Select value={topic.priority} onChange={e => edit(topic.id, { priority: e.target.value as TopicInput['priority'] })}>{['low', 'normal', 'high'].map(p => <option key={p}>{p}</option>)}</Select></Field>
      {topics.length > 1 && <fieldset><legend className="text-sm font-medium">Related topics</legend>{topics.filter(t => t.id !== topic.id).map(other => <label className="flex gap-2 py-1 text-sm" key={other.id}><input type="checkbox" checked={topic.relatedTopicIds.includes(other.id)} onChange={e => edit(topic.id, { relatedTopicIds: e.target.checked ? [...topic.relatedTopicIds, other.id] : topic.relatedTopicIds.filter(id => id !== other.id) })} />{other.title || 'Untitled topic'}</label>)}</fieldset>}
      <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" disabled={index === 0} onClick={() => move(index, -1)}>Move up</Button><Button type="button" variant="outline" disabled={index === topics.length - 1} onClick={() => move(index, 1)}>Move down</Button><Button type="button" variant="outline" onClick={() => ordered(topics.filter(t => t.id !== topic.id).map(t => ({ ...t, relatedTopicIds: t.relatedTopicIds.filter(id => id !== topic.id) })))}>Remove topic</Button></div>
    </fieldset>)}
    <Button type="button" variant="outline" disabled={topics.length >= 200} onClick={() => ordered([...topics, { id: crypto.randomUUID(), title: '', summary: '', module: '', priority: 'normal', order: topics.length, relatedTopicIds: [] }])}>Add topic</Button>
  </div>;
}
export function PreferencesEditor({ onSaved }: { onSaved: (value: OnlinePreferences) => void }) {
  const account = useAccount();
  const pending = useRef<z.infer<typeof preferencesPatch> | null>(null);
  const [base, setBase] = useState(account.preferences);
  const [values, setValues] = useState(base.values); const [zone, setZone] = useState(base.timezone);
  useUnsentGuard(zone !== base.timezone || JSON.stringify(values) !== JSON.stringify(base.values));
  const [review, setReview] = useState<OnlinePreferences | null>(null); const [reviewError, setReviewError] = useState('');
  const save = useSaveState();
  const conflicted = save.error instanceof OnlineError && save.error.code === 'revision_conflict';
  const patch = (next: Partial<typeof values>) => { setValues(v => ({ ...v, ...next })); if (!conflicted) save.clear(); };
  const submit = () => save.run(async () => {
    const parsed = preferencesPatch.safeParse(pending.current ?? { ...values, timezone: zone, expectedRevision: base.revision, operationId: crypto.randomUUID() });
    if (!parsed.success) throw new Error('Check the workspace name, question count and IANA timezone.');
    pending.current = parsed.data;
    const saved = await request<OnlinePreferences>('/v1/preferences', account.user.id, parsed.data, 'PATCH');
    pending.current = null; setBase(saved); setValues(saved.values); setZone(saved.timezone); onSaved(saved);
  });
  const loadReview = async () => {
    setReviewError('');
    try { setReview(await request<OnlinePreferences>('/v1/preferences', account.user.id)); }
    catch (e) { setReviewError(errorMessage(e)); }
  };
  return <Page className="py-8" width="prose"><PageHeader title="Online preferences" description="These preferences belong to this account. Local workspace preferences stay separate." />
    <form className="space-y-4" onSubmit={e => { e.preventDefault(); void submit(); }}><fieldset disabled={save.saving || !!pending.current} className="space-y-4">
      <Field title="Display name"><Input maxLength={80} value={values.displayName} onChange={e => patch({ displayName: e.target.value })} /></Field>
      <Field title="Workspace name"><Input maxLength={80} required value={values.workspaceName} onChange={e => patch({ workspaceName: e.target.value })} /></Field>
      <Field title="Timezone"><Input value={zone} placeholder="Asia/Dubai" onChange={e => { setZone(e.target.value); if (!conflicted) save.clear(); }} /></Field>
      <Field title="Accent"><Select value={values.accent} onChange={e => patch({ accent: e.target.value as typeof values.accent })}>{accents.map(a => <option key={a}>{a}</option>)}</Select></Field>
      <Field title="Default question count"><Input type="number" min={1} max={30} value={values.questionCount} onChange={e => patch({ questionCount: Number(e.target.value) })} /></Field>
      <label className="flex gap-2"><input type="checkbox" checked={values.hints} onChange={e => patch({ hints: e.target.checked })} />Allow hints</label>
      <Field title="Feedback"><Select value={values.feedback} onChange={e => patch({ feedback: e.target.value as typeof values.feedback })}><option value="immediate">After each answer</option><option value="end">At the end</option></Select></Field>
      <Field title="Theme"><Select value={values.theme} onChange={e => patch({ theme: e.target.value as typeof values.theme })}>{['system', 'light', 'dark'].map(v => <option key={v}>{v}</option>)}</Select></Field>
      <Field title="Reading size"><Select value={values.readingSize} onChange={e => patch({ readingSize: e.target.value as typeof values.readingSize })}>{['normal', 'large', 'larger'].map(v => <option key={v}>{v}</option>)}</Select></Field>
      <Field title="Motion"><Select value={values.motion} onChange={e => patch({ motion: e.target.value as typeof values.motion })}>{['system', 'reduced', 'full'].map(v => <option key={v}>{v}</option>)}</Select></Field>
      <fieldset className="space-y-2"><legend>Reminder preferences</legend>{(['assessments', 'study', 'review'] as const).map(key => <label className="flex gap-2" key={key}><input type="checkbox" checked={values.reminders[key]} onChange={e => patch({ reminders: { ...values.reminders, [key]: e.target.checked } })} />{key}</label>)}
        <Field title="Days ahead"><Select value={values.reminders.days} onChange={e => patch({ reminders: { ...values.reminders, days: Number(e.target.value) as 0 | 1 | 3 | 7 } })}>{[0, 1, 3, 7].map(v => <option key={v}>{v}</option>)}</Select></Field>
      </fieldset><p className="text-sm text-muted-foreground">Study defaults and in-app reminders use these preferences. Appearance applies after saving.</p>
    </fieldset><Button disabled={save.saving || conflicted}>Save preferences</Button></form>
    <SaveStatus state={save} onReview={() => void loadReview()} />{reviewError && <p role="alert">{reviewError}</p>}
    {review && <section className="rounded border p-4 space-y-4"><h2 className="font-semibold">Latest saved preferences</h2><p>Your unsent preferences remain above.</p><dl className="space-y-1">{Object.entries({ 'Display name': review.values.displayName, Workspace: review.values.workspaceName, Timezone: review.timezone, Accent: review.values.accent, Questions: review.values.questionCount, Hints: review.values.hints ? 'On' : 'Off', Feedback: review.values.feedback, Theme: review.values.theme, 'Reading size': review.values.readingSize, Motion: review.values.motion, 'Assessment reminders': review.values.reminders.assessments ? 'On' : 'Off', 'Study reminders': review.values.reminders.study ? 'On' : 'Off', 'Review reminders': review.values.reminders.review ? 'On' : 'Off', 'Days ahead': review.values.reminders.days }).map(([k, v]) => <div key={k}><dt className="inline font-medium">{k}: </dt><dd className="inline">{v || 'None'}</dd></div>)}</dl>
      <div className="flex gap-3"><Button variant="outline" onClick={() => { pending.current = null; setBase(review); setValues(review.values); setZone(review.timezone); onSaved(review); setReview(null); save.clear(); }}>Use latest version</Button><Button onClick={() => { pending.current = null; setBase(review); setReview(null); save.clear(); }}>Keep my edits for another save</Button></div>
    </section>}
  </Page>;
}
