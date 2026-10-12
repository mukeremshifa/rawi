import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { SearchIcon } from 'lucide-react';

import { MODE_LABEL, Stat, formatDate } from '@/components/domain';
import { Page, PageHeader, Section, Toolbar } from '@/components/layout';
import { Meter } from '@/components/Meter';
import { ErrorState, PageLoading } from '@/components/states';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableEmpty, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ShortList, TopicReadiness, courseName, type ProgressData } from '@/features/progress/parts';
import { useApi } from '@/lib/data';

const KIND_OPTIONS = [
  { value: '', label: 'All activity' },
  { value: 'practice', label: MODE_LABEL.practice },
  { value: 'exam', label: MODE_LABEL.exam },
  { value: 'self-rated', label: MODE_LABEL['self-rated'] },
  { value: 'tutored', label: MODE_LABEL.tutored },
  { value: 'tutor', label: 'Tutor sessions' },
];

type HistoryRow = { id: string; to: string; at: string; title: string; courseId: string; type: string; score: string; pending?: boolean; note?: string };

/** Progress: filters, an overview, topic readiness, mistakes and history. */
export function Progress() {
  const [params, setParams] = useSearchParams();
  const course = params.get('course') ?? '', kind = params.get('kind') ?? '', topic = params.get('topic') ?? '';
  const [query, setQuery] = useState(params.get('q') ?? '');
  const [shown, setShown] = useState(30);
  const data = useApi<ProgressData>('/v1/progress');
  const sentinel = useRef<HTMLDivElement>(null);
  const set = (key: string, value: string) => { const next = new URLSearchParams(params); if (value) next.set(key, value); else next.delete(key); if (key === 'course') next.delete('topic'); setParams(next, { replace: true }); setShown(30); };
  useEffect(() => { const t = setTimeout(() => { if ((params.get('q') ?? '') !== query) set('q', query); }, 250); return () => clearTimeout(t); }, [query]); // eslint-disable-line react-hooks/exhaustive-deps
  const row = data.data;
  const history = useMemo<HistoryRow[]>(() => {
    if (!row) return [];
    const q = query.trim().toLowerCase();
    const attempts: HistoryRow[] = kind === 'tutor' ? [] : row.attempts
      .filter(a => a.completedAt && (!kind || a.mode === kind) && (!topic || a.topicIds.includes(topic)))
      .map(a => ({ id: a.id, to: `/attempts/${a.id}`, at: a.completedAt!, title: a.title, courseId: a.courseId, type: MODE_LABEL[a.mode],
        score: a.marksAvailable ? `${a.marksAwarded}/${a.marksAvailable}` : '—', note: a.assistanceRecord === 'unknown' ? 'Assistance not recorded' : undefined }));
    const tutor: HistoryRow[] = kind && kind !== 'tutor' ? [] : row.tutorActivity
      .filter(s => s.completedAt && (!topic || s.topicId === topic))
      .map(s => ({ id: s.id, to: `/tutor/${s.id}`, at: String(s.completedAt), title: s.title, courseId: s.courseId, type: 'Tutor session', score: '—' }));
    return [...attempts, ...tutor].filter(r => (!course || r.courseId === course) && (!q || r.title.toLowerCase().includes(q))).sort((a, b) => b.at.localeCompare(a.at));
  }, [row, course, kind, topic, query]);
  useEffect(() => {
    const node = sentinel.current;
    if (!node) return;
    const observer = new IntersectionObserver(entries => { if (entries[0]?.isIntersecting) setShown(n => n + 30); }, { rootMargin: '200px' });
    observer.observe(node);
    return () => observer.disconnect();
  }, [history.length > shown]);
  const header = <PageHeader title="Progress" description="Evidence by topic, recurring mistakes and everything you have finished." />;
  if (data.isPending) return <Page>{header}<PageLoading label="Loading progress" /></Page>;
  if (data.error) return <Page>{header}<ErrorState error={data.error} onRetry={() => void data.refetch()} /></Page>;
  const r = data.data;
  const archived = new Set(r.courses.filter(c => c.archived).map(c => c.id));
  const topics = r.topics.filter(t => course ? t.courseId === course : !archived.has(t.courseId));
  const solid = r.evidence.filter(e => topics.some(t => t.id === e.topicId) && (e.level === 'independent-once' || e.level === 'retained')).length;
  const topicName = topic ? r.topics.find(t => t.id === topic)?.title : null;
  return (
    <Page>
      {header}
      <Toolbar>
        <Select aria-label="Course" className="w-56" value={course} onValueChange={v => set('course', v)} options={[{ value: '', label: 'All courses' }, ...r.courses.filter(c => !c.archived || c.id === course).map(c => ({ value: c.id, label: c.name }))]} />
        <Select aria-label="Activity" className="w-44" value={kind} onValueChange={v => set('kind', v)} options={KIND_OPTIONS} />
        <div className="relative w-56 max-w-full">
          <SearchIcon className="text-muted-foreground absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2" aria-hidden />
          <Input aria-label="Search history" placeholder="Search history" className="pl-8" value={query} onChange={e => setQuery(e.target.value)} />
        </div>
        {topicName && <Badge variant="accent" className="h-7 gap-1.5 px-2 text-sm">{topicName}<button type="button" aria-label="Clear topic filter" onClick={() => set('topic', '')} className="hover:text-foreground">×</button></Badge>}
      </Toolbar>
      <div className="grid grid-cols-2 gap-gutter sm:grid-cols-4">
        <Stat value={r.streak} label="Day streak" />
        <Stat value={history.length} label="Finished activities" />
        <div className="flex flex-col gap-1.5">
          <Stat value={`${solid}/${topics.length}`} label="Topics answered unaided" />
          {topics.length > 0 && <Meter value={solid / topics.length} label="Topics answered unaided" />}
        </div>
      </div>
      <Section title="Topic readiness"><TopicReadiness row={r} courseId={course || undefined} showCourse={!course} /></Section>
      {r.unlinked.some(u => !course || u.courseId === course) && (
        <Section title="Not in the outline" description="Work from sections that are not linked to a topic, by material.">
          <ShortList empty="Nothing here."
            items={r.unlinked.filter(u => !course || u.courseId === course).map(u => ({ key: u.materialId, to: `/materials/${u.materialId}`, title: u.title, meta: courseName(r, u.courseId),
              trailing: <span className="text-muted-foreground tabular text-sm">{[u.answered ? `${u.correct} of ${u.answered} correct` : '', u.tutorSessions ? `${u.tutorSessions} tutor ${u.tutorSessions === 1 ? 'session' : 'sessions'}` : ''].filter(Boolean).join(', ')}</span> }))} />
        </Section>
      )}
      <Section title="Recurring mistakes" description="Questions you have missed more than once.">
        <ShortList empty="No repeated mistakes."
          items={r.mistakes.filter(m => !course || m.courseId === course).slice(0, 8).map(m => ({ key: m.questionId, to: `/attempts/${m.lastAttemptId}`, title: m.prompt, meta: courseName(r, m.courseId), trailing: <span className="text-muted-foreground tabular text-sm">{m.times} times</span> }))} />
      </Section>
      <Section title="History">
        <Table>
          <TableHeader>
            <TableRow><TableHead className="w-28">Date</TableHead><TableHead>Activity</TableHead><TableHead className="hidden md:table-cell">Type</TableHead><TableHead className="w-20 text-right">Score</TableHead></TableRow>
          </TableHeader>
          <TableBody>
            {history.length === 0 && <TableEmpty colSpan={4}>No finished activity matches these filters.</TableEmpty>}
            {history.slice(0, shown).map(h => (
              <TableRow key={h.id}>
                <TableCell className="text-muted-foreground tabular text-sm whitespace-nowrap">{formatDate(h.at)}</TableCell>
                <TableCell className="max-w-0">
                  <Link to={h.to} className="block truncate font-medium hover:underline">{h.title}</Link>
                  <span className="text-muted-foreground block truncate text-sm">{courseName(r, h.courseId)}{h.note ? ` · ${h.note}` : ''}<span className="md:hidden"> · {h.type}</span></span>
                </TableCell>
                <TableCell className="text-muted-foreground hidden md:table-cell">{h.type}</TableCell>
                <TableCell className="tabular text-right">{h.score}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {history.length > shown && <div ref={sentinel} className="text-muted-foreground py-2 text-center text-sm">Showing {shown} of {history.length}</div>}
      </Section>
    </Page>
  );
}
