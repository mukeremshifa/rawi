import { useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  BookOpenIcon,
  ClipboardListIcon,
  GraduationCapIcon,
  LayoutDashboardIcon,
  MenuIcon,
  MessageSquareIcon,
  TrendingUpIcon,
} from 'lucide-react';

import { Logo } from '@/components/Logo';
import { ThemeToggle } from '@/components/ThemeToggle';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { MEDIA_WIDE, useMediaQuery } from '@/components/layout';
import { useAppState } from '@/store/store';
import { useReviews } from '@/store/selectors';
import { daysUntilExam } from '@shared/progress.ts';
import { cn } from '@/lib/utils';

/**
 * The course shell: one navigation, one header, every screen inside it.
 *
 * ── The desktop/mobile split ──────────────────────────────────────────────
 *
 * A fixed rail on desktop, a sheet on mobile — and `useMediaQuery` rather than
 * `hidden md:flex`, because the two must not both be mounted. CSS hiding would
 * leave two copies of the nav in the accessibility tree and announce every link
 * twice to a screen reader. That is the narrow case the hook's own note says it
 * exists for.
 *
 * ── Why the nav carries live counts ───────────────────────────────────────
 *
 * The review badge and the exam countdown are the two pieces of state a student
 * needs without navigating to find them. Putting them in the shell is what lets
 * the rest of the app stop repeating them on every screen.
 */

interface NavItem {
  to: string;
  label: string;
  icon: typeof LayoutDashboardIcon;
  /** Matches nested routes, so /materials/x keeps Materials highlighted. */
  match: string;
}

const NAV: NavItem[] = [
  { to: '/', label: 'Overview', icon: LayoutDashboardIcon, match: '/' },
  { to: '/materials', label: 'Materials', icon: BookOpenIcon, match: '/materials' },
  { to: '/tutor', label: 'Tutor', icon: MessageSquareIcon, match: '/tutor' },
  { to: '/practice', label: 'Practice', icon: ClipboardListIcon, match: '/practice' },
  { to: '/exams', label: 'Exams', icon: GraduationCapIcon, match: '/exams' },
  { to: '/progress', label: 'Progress', icon: TrendingUpIcon, match: '/progress' },
];

function isActive(pathname: string, match: string): boolean {
  if (match === '/') return pathname === '/';
  return pathname === match || pathname.startsWith(`${match}/`);
}

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const { pathname } = useLocation();
  const reviews = useReviews();

  return (
    <nav className="flex flex-col gap-hairline p-tight" aria-label="Main">
      {NAV.map((item) => {
        const active = isActive(pathname, item.match);
        const Icon = item.icon;
        return (
          <NavLink
            key={item.to}
            to={item.to}
            onClick={onNavigate}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex items-center gap-snug rounded-md px-snug py-2 text-sm transition-colors',
              'focus-visible:ring-ring outline-none focus-visible:ring-2',
              active
                ? 'bg-secondary text-secondary-foreground font-medium'
                : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
            )}
          >
            <Icon className="size-4 shrink-0" aria-hidden />
            <span className="flex-1">{item.label}</span>
            {item.to === '/practice' && reviews.length > 0 && (
              <Badge variant="secondary" className="font-mono tabular-nums">
                {reviews.length}
              </Badge>
            )}
          </NavLink>
        );
      })}
    </nav>
  );
}

function ExamCountdown() {
  const { course } = useAppState();
  if (!course) return null;
  const days = daysUntilExam(course);

  return (
    <Link
      to="/setup"
      className="hover:bg-accent focus-visible:ring-ring mx-tight mb-tight flex flex-col gap-hairline rounded-md border p-snug outline-none transition-colors focus-visible:ring-2"
    >
      <span className="text-muted-foreground text-xs">Exam</span>
      <span className="font-mono text-sm tabular-nums">
        {days === 0 ? 'Today' : `${days} day${days === 1 ? '' : 's'}`}
      </span>
      <span className="text-muted-foreground truncate text-xs">{course.name}</span>
    </Link>
  );
}

export function AppShell() {
  const wide = useMediaQuery(MEDIA_WIDE);
  const [open, setOpen] = useState(false);

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <header className="flex h-14 shrink-0 items-center gap-snug border-b px-gutter">
        {!wide && (
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label="Open navigation">
                <MenuIcon />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-64 p-0">
              <SheetHeader className="border-b">
                <SheetTitle>
                  <Logo />
                </SheetTitle>
              </SheetHeader>
              <div className="flex flex-col overflow-y-auto">
                <ExamCountdown />
                <NavLinks onNavigate={() => setOpen(false)} />
              </div>
            </SheetContent>
          </Sheet>
        )}

        <Link
          to="/"
          className="focus-visible:ring-ring rounded outline-none focus-visible:ring-2"
        >
          <Logo />
        </Link>

        <div className="flex-1" />
        <ThemeToggle />
      </header>

      <div className="flex min-h-0 flex-1">
        {wide && (
          <aside className="flex w-56 shrink-0 flex-col overflow-y-auto border-r py-tight">
            <ExamCountdown />
            <NavLinks />
          </aside>
        )}
        <main className="min-w-0 flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
