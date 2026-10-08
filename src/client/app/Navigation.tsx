import { useLocation } from 'react-router-dom';
import { BookOpenIcon, CalendarDaysIcon, ClipboardListIcon, GraduationCapIcon, HomeIcon, LayersIcon, LayoutDashboardIcon, ListTreeIcon, MessageSquareIcon, TrendingUpIcon, SearchIcon, BellIcon } from 'lucide-react';
import { NavGroup, type NavItem } from '@/components/NavGroup';
export function Navigation() {
  const { pathname } = useLocation(); const course = /^\/course\/([^/]+)/.exec(pathname)?.[1];
  const item = (to: string, label: string, icon: NavItem['icon'], end = false): NavItem => ({ to, label, icon, match: to, end });
  const global = [item('/', 'Home', HomeIcon, true), item('/courses', 'Courses', LayersIcon), item('/planner', 'Planner', CalendarDaysIcon), item('/history', 'Progress & history', TrendingUpIcon), item('/search', 'Search', SearchIcon), item('/notifications', 'Reminders', BellIcon)];
  const base = `/course/${course}`;
  return <nav aria-label="Workspace navigation" className="space-y-5 p-4"><NavGroup items={global} />{course && <div className="border-t pt-4"><p className="px-2 pb-2 text-xs text-muted-foreground">In this course</p><NavGroup items={[item(base, 'Overview', LayoutDashboardIcon, true), item(`${base}/syllabus`, 'Syllabus & topics', ListTreeIcon), item(`${base}/materials`, 'Materials', BookOpenIcon), item(`${base}/tutor`, 'Tutor', MessageSquareIcon), item(`${base}/practice`, 'Practice', ClipboardListIcon), item(`${base}/exams`, 'Exams', GraduationCapIcon), item(`${base}/progress`, 'Progress', TrendingUpIcon)]} /></div>}</nav>;
}
