import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  BookOpenIcon, CalendarDaysIcon, CheckIcon, ChevronsUpDownIcon, ClipboardListIcon, GraduationCapIcon, HomeIcon, LayersIcon,
  LayoutDashboardIcon, ListTreeIcon, LogOutIcon, MessageSquareIcon, PlusIcon, SettingsIcon, TrendingUpIcon,
} from 'lucide-react';
import type { Course } from '@shared/contracts/workspace';

import { Avatar } from '@/components/ui/avatar';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAccount } from '@/lib/account';
import { cn } from '@/lib/utils';

type Item = { to: string; label: string; icon: typeof HomeIcon; end?: boolean; match?: RegExp };

function NavItem({ item, onNavigate }: { item: Item; onNavigate?: () => void }) {
  const { pathname } = useLocation();
  const active = item.match ? item.match.test(pathname) : item.end ? pathname === item.to : pathname === item.to || pathname.startsWith(`${item.to}/`);
  const Icon = item.icon;
  return (
    <NavLink to={item.to} onClick={onNavigate} aria-current={active ? 'page' : undefined}
      className={cn('flex h-8 items-center gap-2.5 rounded-md px-2 text-base outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring',
        active ? 'bg-selected text-foreground font-medium' : 'text-muted-foreground hover:bg-accent hover:text-foreground')}>
      <Icon className={cn('size-4 shrink-0', active && 'text-primary-text')} aria-hidden />
      <span className="truncate">{item.label}</span>
    </NavLink>
  );
}

/**
 * The workspace sidebar: account menu, global navigation, then a course
 * switcher and the current course's sections.
 */
export function Sidebar({ courses, courseId, onNavigate, onSignOut, signingOut }: {
  courses: Course[] | undefined;
  courseId: string | null;
  onNavigate?: () => void;
  onSignOut: () => void;
  signingOut: boolean;
}) {
  const me = useAccount();
  const navigate = useNavigate();
  const course = courses?.find(c => c.id === courseId);
  const active = courses?.filter(c => !c.archived) ?? [];
  const base = `/course/${courseId}`;
  const global: Item[] = [
    { to: '/', label: 'Home', icon: HomeIcon, end: true },
    { to: '/courses', label: 'Courses', icon: LayersIcon, match: /^\/courses(\/|$)/ },
    { to: '/planner', label: 'Planner', icon: CalendarDaysIcon },
    { to: '/progress', label: 'Progress', icon: TrendingUpIcon, match: /^\/(progress|history)(\/|$)/ },
  ];
  const sections: Item[] = courseId ? [
    { to: base, label: 'Overview', icon: LayoutDashboardIcon, match: new RegExp(`^${base}(/overview|/progress.*)?$`) },
    { to: `${base}/syllabus`, label: 'Syllabus', icon: ListTreeIcon, match: new RegExp(`^${base}/(syllabus|settings)$`) },
    { to: `${base}/materials`, label: 'Materials', icon: BookOpenIcon },
    { to: `${base}/practice`, label: 'Practice', icon: ClipboardListIcon },
    { to: `${base}/exams`, label: 'Exams', icon: GraduationCapIcon },
    { to: `${base}/tutor`, label: 'Tutor', icon: MessageSquareIcon },
  ] : [];
  return (
    <nav aria-label="Workspace" className="flex h-full flex-col gap-4 p-3">
      <DropdownMenu>
        <DropdownMenuTrigger className="hover:bg-accent focus-visible:ring-ring flex h-9 w-full items-center gap-2 rounded-md px-1.5 text-left outline-none focus-visible:ring-2">
          <Avatar name={me.user.name || me.user.email} src={me.user.image} />
          <span className="min-w-0 flex-1 truncate text-base font-medium">{me.preferences.values.workspaceName}</span>
          <ChevronsUpDownIcon className="text-muted-foreground size-3.5 shrink-0" aria-hidden />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-64">
          <DropdownMenuLabel className="flex flex-col gap-0.5 font-normal">
            <span className="text-foreground truncate text-base font-medium">{me.user.name || 'Your account'}</span>
            <span className="truncate">{me.user.email}</span>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => { onNavigate?.(); navigate('/settings'); }}><SettingsIcon />Settings</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem disabled={signingOut} onSelect={onSignOut}><LogOutIcon />{signingOut ? 'Signing out' : 'Sign out'}</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <div className="flex flex-col gap-0.5">{global.map(item => <NavItem key={item.to} item={item} onNavigate={onNavigate} />)}</div>

      <div className="flex flex-col gap-1">
        <DropdownMenu>
          <DropdownMenuTrigger className="text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-ring flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-sm outline-none focus-visible:ring-2">
            <span className="min-w-0 flex-1 truncate">{course ? <span className="text-foreground font-medium">{course.name}</span> : 'Choose a course'}</span>
            <ChevronsUpDownIcon className="size-3.5 shrink-0" aria-hidden />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-64">
            <DropdownMenuLabel>Courses</DropdownMenuLabel>
            {active.map(c => (
              <DropdownMenuItem key={c.id} onSelect={() => { onNavigate?.(); navigate(`/course/${c.id}`); }}>
                <span className="min-w-0 flex-1 truncate">{c.name}</span>
                {c.id === courseId && <CheckIcon className="text-foreground!" />}
              </DropdownMenuItem>
            ))}
            {courses && !active.length && <DropdownMenuItem disabled>No active courses</DropdownMenuItem>}
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => { onNavigate?.(); navigate('/courses?new=1'); }}><PlusIcon />New course</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => { onNavigate?.(); navigate('/courses'); }}><LayersIcon />All courses</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        {course && <div className="flex flex-col gap-0.5">{sections.map(item => <NavItem key={item.to} item={item} onNavigate={onNavigate} />)}</div>}
        {!courseId && <Link to="/courses" onClick={onNavigate} className="text-muted-foreground hover:text-foreground px-2 py-1 text-sm">Open a course to see its sections.</Link>}
      </div>
    </nav>
  );
}
