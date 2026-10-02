import { Link } from 'react-router-dom';
import { useAppState } from '@/store/store';
import { Section } from './layout';

/** All unfinished activities stay reachable, rather than only the newest one. */
export function ResumeWork() {
  const state = useAppState();
  const rows: { id: string; title: string; courseId: string; to: string }[] = [];
  state.practiceRuns.forEach(r => rows.push({ id: r.id, title: state.savedPractice.find(s => s.id === r.setId)?.name ?? 'Unfinished practice', courseId: r.courseId, to: `/course/${r.courseId}/practice/run/${r.id}` }));
  state.tutorSessions.filter(s => !s.endedAt && !s.archived).forEach(s => rows.push({ id: s.id, title: s.title ?? state.topics.find(t => t.id === s.topicId)?.title ?? 'Tutor conversation', courseId: s.courseId, to: `/course/${s.courseId}/tutor/${s.id}` }));
  if (state.activeExam) rows.unshift({ id: state.activeExam.id, title: state.activeExam.configSnapshot.name, courseId: state.activeExam.courseId, to: `/course/${state.activeExam.courseId}/exams/run` });
  if (!rows.length) return null;
  return <Section title="Unfinished work" description="Choose the activity you want to continue. Archived courses can be restored from their overview.">
    <ul className="grid gap-2 sm:grid-cols-2">{rows.map(r => {
      const course = state.courses.find(c => c.id === r.courseId);
      if (!course) return null;
      return <li key={r.id}><Link className="block rounded border p-3 hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring" to={course.archived ? `/course/${course.id}` : r.to}><span className="block break-words font-medium">{r.title}</span><span className="text-xs text-muted-foreground">{course.name}{course.archived ? ' · Archived course' : ''}</span></Link></li>;
    })}</ul>
  </Section>;
}
