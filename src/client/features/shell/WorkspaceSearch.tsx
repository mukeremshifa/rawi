import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { SearchIcon } from 'lucide-react';
import { useStore } from '@/store/store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';

export function WorkspaceSearch() {
  const { state } = useStore(); const navigate = useNavigate();
  const [open, setOpen] = useState(false); const [query, setQuery] = useState('');
  const [archived, setArchived] = useState(false); const [index, setIndex] = useState(0);
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setOpen(v => !v); } };
    window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key);
  }, []);
  const rows: { id: string; group: string; title: string; course: string; text: string; to: string; archived: boolean }[] = [];
  const add = (id: string, courseId: string, group: string, title: string, text: string, to: string, recordArchived = false) => {
    const course = state.courses.find(c => c.id === courseId); if (!course) return;
    const isArchived = !!course.archived || recordArchived;
    if (isArchived && !archived) return;
    rows.push({ id, group, title, text, to, course: course.name, archived: isArchived });
  };
  state.courses.forEach(c => add(c.id, c.id, 'Courses', c.name, c.description, `/course/${c.id}`, !!c.archived));
  state.topics.forEach(t => add(t.id, t.courseId, 'Topics', t.title, t.summary, `/course/${t.courseId}/progress/topic/${t.id}`));
  state.materials.forEach(m => {
    const q = query.trim().toLowerCase(); const passage = m.passages.find(p => `${p.heading} ${p.text}`.toLowerCase().includes(q));
    add(m.id, m.courseId, 'Materials', m.title, passage?.text ?? m.passages[0]?.text ?? '', `/course/${m.courseId}/materials/${m.id}${passage ? '#' + passage.id : ''}`, !!m.archived);
  });
  state.savedPractice.forEach(s => add(s.id, s.courseId, 'Practice sets', s.name, s.config.activity, `/course/${s.courseId}/practice/set/${s.id}`, !!s.archived));
  state.tutorSessions.forEach(s => {
    const topic = state.topics.find(t => t.id === s.topicId); const q = query.trim().toLowerCase();
    const message = s.messages.find(m => m.text.toLowerCase().includes(q));
    add(s.id, s.courseId, 'Tutor sessions', s.title ?? topic?.title ?? 'Tutor session', message?.text ?? '', `/course/${s.courseId}/tutor/${s.id}${message ? '#' + message.id : ''}`, !!s.archived);
  });
  state.assessments.forEach(a => add(a.id, a.courseId, 'Assessments', a.title, `${a.date} ${a.notes ?? ''}`, `/course/${a.courseId}/exams/assessment/${a.id}`));
  const q = query.trim().toLowerCase();
  const matches = q ? rows.filter(r => `${r.title} ${r.text} ${r.course}`.toLowerCase().includes(q)) : [];
  const activeId = matches[index]?.id;
  useEffect(() => {
    if (open && activeId) document.getElementById(`search-${activeId}`)?.scrollIntoView({ block: 'nearest' });
  }, [open, activeId]);
  const excerpt = (text: string) => { const at = Math.max(0, text.toLowerCase().indexOf(q) - 40); return text.slice(at, at + 180); };
  return <><Button variant="ghost" size="sm" onClick={() => setOpen(true)} aria-label="Search workspace (Control K)"><SearchIcon /><span className="hidden sm:inline">Search</span></Button>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-h-[90dvh] sm:max-w-2xl"><DialogHeader><DialogTitle>Search workspace</DialogTitle><DialogDescription>Find courses, topics, passages, sets, tutor messages and assessments on this device.</DialogDescription></DialogHeader>
      <Input autoFocus role="combobox" aria-expanded="true" aria-autocomplete="list" placeholder="Search your workspace" aria-label="Workspace search" value={query} onChange={e => { setQuery(e.target.value); setIndex(0); }} onKeyDown={e => {
        if (e.key === 'ArrowDown') { e.preventDefault(); setIndex(i => Math.max(0, Math.min(i + 1, matches.length - 1))); }
        if (e.key === 'ArrowUp') { e.preventDefault(); setIndex(i => Math.max(0, i - 1)); }
        if (e.key === 'Enter' && matches[index]) { setOpen(false); navigate(matches[index].to); }
      }} aria-controls="workspace-matches" aria-activedescendant={matches[index] ? `search-${matches[index].id}` : undefined} />
      <label className="flex items-center gap-2 text-sm"><Checkbox checked={archived} onCheckedChange={v => { setArchived(!!v); setIndex(0); }} />Include archived records</label>
      <div id="workspace-matches" className="overflow-y-auto" role="listbox" aria-label="Search results">{!q ? <p className="p-3 text-muted-foreground">Type to search. Use arrow keys and Enter to open a result, or Tab to its link.</p> : !matches.length ? <p className="p-3 text-muted-foreground">No results. Try another word or include archived records.</p> : matches.map((r, i) => <div key={r.id}>
        {i === 0 || matches[i - 1]!.group !== r.group ? <h2 className="py-2 text-xs font-semibold uppercase">{r.group}</h2> : null}
        <Link id={`search-${r.id}`} role="option" aria-selected={i === index} to={r.to} onClick={() => setOpen(false)} className={`block rounded border p-3 mb-2 ${i === index ? 'bg-secondary' : ''}`}><span className="font-medium">{r.title}</span><span className="block text-xs text-muted-foreground">{r.course}{r.archived ? ' · Archived' : ''}</span><span className="block text-sm break-words text-muted-foreground">{excerpt(r.text)}</span></Link>
      </div>)}</div><p role="status" className="text-xs text-muted-foreground">{q && `${matches.length} results`}</p>
    </DialogContent></Dialog></>;
}
