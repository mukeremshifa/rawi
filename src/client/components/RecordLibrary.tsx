import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { ExamConfig, SavedPracticeSet, TutorSession } from '@shared/types.ts';
import { useStore } from '@/store/store';
import { useCourse, useCoursePath } from '@/store/course-context';
import { useDraftState } from '@/store/drafts';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { Select } from './ui/select';
import { Label } from './ui/label';
import { ConfirmDialog } from './ui/confirm-dialog';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from './ui/dialog';
import { newId } from '@/lib/id';

type Record = SavedPracticeSet | TutorSession | ExamConfig;
type Kind = 'practice' | 'tutor' | 'exam';
const titleOf = (r: Record) => 'name' in r ? r.name : r.title ?? 'Tutor session';

/** Shared organization controls, with history retained and active runs protected. */
export function RecordLibrary({ kind }: { kind: Kind }) {
  const course = useCourse(); const path = useCoursePath(); const { state, dispatch } = useStore();
  const prefix = `library:${course.id}:${kind}:`;
  const [query, setQuery] = useDraftState(prefix + 'query', '');
  const [status, setStatus] = useDraftState(prefix + 'status', 'active');
  const [topic, setTopic] = useDraftState(prefix + 'topic', 'all');
  const [activity, setActivity] = useDraftState(prefix + 'activity', 'all');
  const [sort, setSort] = useDraftState(prefix + 'sort', 'recent');
  const [limit, setLimit] = useDraftState(prefix + 'limit', 24);
  const [renaming, setRenaming] = useState<Record | null>(null); const [name, setName] = useState('');
  const [deleting, setDeleting] = useState<Record | null>(null);
  const pool: Record[] = (kind === 'practice' ? state.savedPractice : kind === 'tutor' ? state.tutorSessions : state.examConfigs).filter(r => r.courseId === course.id);
  const protectedRun = (r: Record) => kind === 'practice' ? state.practiceRuns.some(run => run.setId === r.id) : kind === 'exam' ? state.activeExam?.configId === r.id : false;
  const topicIds = (r: Record) => 'topicId' in r ? [r.topicId] : 'config' in r ? r.config.topicIds : r.sections.flatMap(s => s.topicIds);
  const dateOf = (r: Record) => 'updatedAt' in r ? r.updatedAt : r.savedAt;
  const matches = pool.filter(r => {
    if (status === 'archived' ? !r.archived : r.archived) return false;
    if (kind === 'tutor' && 'messages' in r && status === 'completed' && !r.endedAt) return false;
    if (kind === 'tutor' && 'messages' in r && status === 'active' && r.endedAt) return false;
    if (topic !== 'all' && !topicIds(r).includes(topic)) return false;
    if (activity !== 'all' && 'config' in r && r.config.activity !== activity) return false;
    const title = titleOf(r); const message = 'messages' in r ? r.messages.map(m => m.text).join(' ') : '';
    const labels = topicIds(r).map(id => state.topics.find(t => t.id === id)?.title ?? '').join(' ');
    return `${title} ${message} ${labels}`.toLowerCase().includes(query.trim().toLowerCase());
  }).sort((a, b) => sort === 'name' ? titleOf(a).localeCompare(titleOf(b)) : dateOf(b).localeCompare(dateOf(a)) || a.id.localeCompare(b.id));
  const save = (r: Record) => {
    if (kind === 'tutor') dispatch({ type: 'upsert-tutor-session', session: r as TutorSession });
    if (kind === 'practice') dispatch({ type: 'save-practice', set: r as SavedPracticeSet });
    if (kind === 'exam') dispatch({ type: 'save-exam-config', config: r as ExamConfig });
  };
  const openPath = (r: Record) => kind === 'practice' ? `/practice/set/${r.id}` : kind === 'tutor' ? `/tutor/${r.id}` : `/exams/build/${r.id}`;
  return <section className="flex flex-col gap-3" aria-label={`Manage ${kind} library`}>
    <h2 className="text-lg font-semibold">{kind === 'tutor' ? 'Your tutor sessions' : kind === 'practice' ? 'Saved practice library' : 'Rehearsal configuration library'}</h2>
    <Input aria-label={`Search ${kind} records`} value={query} onChange={e => { setQuery(e.target.value); setLimit(24); }} placeholder={kind === 'tutor' ? 'Search titles, topics and messages' : 'Search names and topics'} />
    <div className="flex flex-wrap gap-2"><Select aria-label="Record status" value={status} onChange={e => { setStatus(e.target.value); setLimit(24); }}><option value="active">{kind === 'tutor' ? 'Active' : 'Saved'}</option>{kind === 'tutor' && <option value="completed">Completed</option>}<option value="archived">Archived</option>{kind === 'tutor' && <option value="all">All unarchived</option>}</Select><Select aria-label="Filter topic" value={topic} onChange={e => setTopic(e.target.value)}><option value="all">All topics</option>{state.topics.filter(t => t.courseId === course.id).map(t => <option key={t.id} value={t.id}>{t.title}</option>)}</Select>{kind === 'practice' && <Select aria-label="Filter activity" value={activity} onChange={e => setActivity(e.target.value)}><option value="all">All activities</option>{['flashcards', 'quiz', 'written-recall', 'source-analysis', 'essay'].map(a => <option key={a}>{a}</option>)}</Select>}<Select aria-label="Sort records" value={sort} onChange={e => setSort(e.target.value)}><option value="recent">Recent</option><option value="name">Name</option></Select><Button variant="ghost" onClick={() => { setQuery(''); setStatus('active'); setTopic('all'); setActivity('all'); setLimit(24); }}>Clear filters</Button></div>
    <p className="text-muted-foreground text-sm">{matches.length} matching of {pool.length} records</p>
    {!matches.length && <p className="text-muted-foreground">{pool.length ? 'No records match these filters. Clear filters or view archived records.' : `No saved ${kind} records yet. Start an activity to create one.`}</p>}
    <ul className="flex flex-col gap-2">{matches.slice(0, limit).map(r => {
      const run = kind === 'practice' ? state.practiceRuns.find(run => run.setId === r.id) : undefined;
      const isPreset = 'preset' in r && r.preset;
      return <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 rounded border p-4"><div className="min-w-0 flex-1"><Link className="font-medium underline break-words" to={path(openPath(r))}>{titleOf(r)}</Link><p className="text-muted-foreground text-xs">{r.archived ? 'Archived' : 'messages' in r ? r.endedAt ? 'Completed' : 'Active' : isPreset ? 'Preset' : 'Saved'} · {topicIds(r).map(id => state.topics.find(t => t.id === id)?.title ?? 'Removed topic').join(', ')}</p>{protectedRun(r) && <p className="text-muted-foreground text-xs">Finish or abandon the active run before deleting or changing its configuration.</p>}</div><div className="flex flex-wrap gap-2">
        {run && <Button size="sm" asChild><Link to={path(`/practice/run/${run.id}`)}>Resume</Link></Button>}
        <Button size="sm" variant="outline" asChild><Link to={path(openPath(r))}>{kind === 'exam' ? 'Edit' : 'Open'}</Link></Button>
        {!isPreset && <><Button size="sm" variant="ghost" onClick={() => { setRenaming(r); setName(titleOf(r)); }}>Rename</Button><Button size="sm" variant="ghost" onClick={() => save({ ...r, archived: !r.archived })}>{r.archived ? 'Restore' : 'Archive'}</Button></>}
        {kind === 'exam' && <Button size="sm" variant="ghost" onClick={() => save({ ...r as ExamConfig, id: newId('exam'), name: `${titleOf(r)} (copy)`, preset: false, archived: false, savedAt: new Date().toISOString() })}>Duplicate</Button>}
        {kind !== 'tutor' && !isPreset && <Button size="sm" variant="ghost" disabled={!!protectedRun(r)} onClick={() => setDeleting(r)}>Delete</Button>}
      </div></li>;
    })}</ul>{matches.length > limit && <Button variant="outline" className="self-start" onClick={() => setLimit(v => v + 24)}>Load more ({matches.length - limit} remaining)</Button>}
    <Dialog open={!!renaming} onOpenChange={v => !v && setRenaming(null)}><DialogContent><DialogHeader><DialogTitle>Rename {renaming && titleOf(renaming)}</DialogTitle><DialogDescription>Answers, messages, source links and completion dates stay as recorded.</DialogDescription></DialogHeader><Label htmlFor="record-name">Name</Label><Input id="record-name" value={name} onChange={e => setName(e.target.value)} /><DialogFooter><Button variant="outline" onClick={() => setRenaming(null)}>Cancel</Button><Button disabled={!name.trim()} onClick={() => { if (renaming) save('name' in renaming ? { ...renaming, name: name.trim() } : { ...renaming, title: name.trim() }); setRenaming(null); }}>Save name</Button></DialogFooter></DialogContent></Dialog>
    <ConfirmDialog open={!!deleting} onOpenChange={v => !v && setDeleting(null)} title={`Delete “${deleting ? titleOf(deleting) : ''}”?`} description="The saved record is removed. Completed answers, results and feedback are retained. Scheduled sessions keep their targets and will offer repair if the target is unavailable." onConfirm={() => { if (deleting && !protectedRun(deleting)) dispatch(kind === 'practice' ? { type: 'remove-practice', setId: deleting.id } : { type: 'remove-exam-config', configId: deleting.id }); setDeleting(null); }} />
  </section>;
}
