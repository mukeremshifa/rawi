import { useLocation } from 'react-router-dom';
import { BookOpenIcon, CalendarDaysIcon, ClipboardListIcon, GraduationCapIcon, HomeIcon, LayersIcon, LayoutDashboardIcon, ListTreeIcon, MessageSquareIcon, TrendingUpIcon, SearchIcon, BellIcon, SettingsIcon, DownloadIcon } from 'lucide-react';
import { NavGroup, type NavItem } from '@/features/shell/Navigation';
export function OnlineNavigation() {
  const { pathname } = useLocation(); const course = /^\/online\/course\/([^/]+)/.exec(pathname)?.[1];
  const item = (to: string, label: string, icon: NavItem['icon'], end = false): NavItem => ({ to, label, icon, match: to, end });
  const global = [item('/online', 'Home', HomeIcon, true), item('/online/courses', 'Courses', LayersIcon), item('/online/planner', 'Planner', CalendarDaysIcon), item('/online/progress', 'Progress & history', TrendingUpIcon), item('/online/search', 'Search', SearchIcon), item('/online/notifications', 'Reminders', BellIcon), item('/online/settings', 'Settings', SettingsIcon), item('/online/data', 'Workspace data', DownloadIcon)];
  const base = `/online/course/${course}`;
  return <nav aria-label="Workspace navigation" className="space-y-5 p-4"><NavGroup items={global} />{course && <div className="border-t pt-4"><p className="px-2 pb-2 text-xs text-muted-foreground">In this course</p><NavGroup items={[item(`${base}/overview`, 'Overview', LayoutDashboardIcon), item(base, 'Syllabus & topics', ListTreeIcon, true), item(`${base}/materials`, 'Materials', BookOpenIcon), item(`${base}/tutor`, 'Tutor', MessageSquareIcon), item(`${base}/practice`, 'Practice', ClipboardListIcon), item(`${base}/exams`, 'Exams', GraduationCapIcon), item(`${base}/progress`, 'Progress', TrendingUpIcon)]} /></div>}</nav>;
}
