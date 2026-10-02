import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BellIcon } from 'lucide-react';
import { useStore } from '@/store/store';
import { useAllReviews } from '@/store/selectors';
import { localISO } from '@shared/planner.ts';
import { Page, PageHeader } from '@/components/layout';
import { Button } from '@/components/ui/button';

export function useReminders() {
  const { state } = useStore(); const reviews = useAllReviews();
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const tick = () => setNow(new Date()); const timer = setInterval(tick, 60000);
    window.addEventListener('focus', tick); document.addEventListener('visibilitychange', tick);
    return () => { clearInterval(timer); window.removeEventListener('focus', tick); document.removeEventListener('visibilitychange', tick); };
  }, []);
  const today = localISO(now); const horizon = new Date(now); horizon.setDate(horizon.getDate() + state.preferences.reminders.days);
  const last = localISO(horizon); const prefs = state.preferences.reminders;
  const active = new Set(state.courses.filter(c => !c.archived).map(c => c.id));
  const rows: { id: string; occurrence: string; title: string; date: string; to: string; category: string }[] = [];
  if (prefs.assessments) state.assessments.filter(a => active.has(a.courseId) && a.date >= today && a.date <= last).forEach(a => rows.push({ id: `assessment:${a.id}`, occurrence: `${a.date}:${a.time ?? ''}`, title: a.title, date: a.date, to: `/course/${a.courseId}/exams/assessment/${a.id}`, category: 'Assessment' }));
  if (prefs.study) state.sessions.filter(s => active.has(s.courseId) && s.status === 'planned' && s.date >= today && s.date <= last).forEach(s => rows.push({ id: `study:${s.id}`, occurrence: `${s.date}:${s.startMinutes}`, title: s.title, date: s.date, to: `/planner?session=${s.id}`, category: 'Planned study' }));
  if (prefs.review) reviews.filter(r => active.has(r.courseId)).forEach(r => rows.push({ id: `review:${r.topicId}`, occurrence: r.lastAttemptId ?? 'first-review', title: state.topics.find(t => t.id === r.topicId)?.title ?? 'Topic review', date: today, to: `/course/${r.courseId}/practice/new?topic=${r.topicId}`, category: 'Due review' }));
  return rows.map(r => ({ ...r, key: `${r.id}:${r.occurrence}`, status: state.reminderState[`${r.id}:${r.occurrence}`] })).filter(r => r.status !== 'dismissed').sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
}

export function NotificationEntry() {
  const rows = useReminders(); const count = rows.filter(r => !r.status).length;
  return <Button variant="ghost" size="sm" asChild><Link to="/notifications" aria-label={`Notifications, ${count} unread`}><BellIcon /><span className="hidden sm:inline">{count ? `${count} unread` : 'Reminders'}</span></Link></Button>;
}

export function NotificationsPage() {
  const { dispatch } = useStore(); const rows = useReminders();
  return <Page><PageHeader title="In-app reminders" description="Upcoming work and due review while Rawi is open. Dismissing a reminder keeps the underlying work." actions={<Button variant="outline" asChild><Link to="/settings/notifications">Reminder preferences</Link></Button>} />
    {!rows.length && <p>No reminders right now. Your enabled categories and timing determine what appears here.</p>}
    <ul className="flex flex-col gap-3">{rows.map(r => <li key={r.key} className="flex flex-wrap items-center justify-between gap-3 rounded border p-4"><div className="min-w-0"><p className="text-muted-foreground text-xs">{r.category} · {r.date} · {r.status === 'read' ? 'Read' : 'Unread'}</p><Link className="font-medium underline break-words" to={r.to} onClick={() => dispatch({ type: 'reminder', key: r.key, value: 'read' })}>{r.title}</Link></div><div className="flex gap-2">{!r.status && <Button variant="outline" size="sm" onClick={() => dispatch({ type: 'reminder', key: r.key, value: 'read' })}>Mark read</Button>}<Button variant="ghost" size="sm" onClick={() => dispatch({ type: 'reminder', key: r.key, value: 'dismissed' })}>Dismiss</Button></div></li>)}</ul>
  </Page>;
}
