import { useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useParams } from 'react-router-dom';
import {
  BookOpenIcon,
  CalendarDaysIcon,
  ChevronLeftIcon,
  ChevronsUpDownIcon,
  ClipboardListIcon,
  GraduationCapIcon,
  HomeIcon,
  LayersIcon,
  LayoutDashboardIcon,
  ListTreeIcon,
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { MEDIA_WIDE, useMediaQuery } from '@/components/layout';
import { CourseDot, DueChip } from '@/components/domain';
import { useAppState } from '@/store/store';
import {
  useActiveCourses,
  useAllReviews,
  useCourseById,
  useUpcomingAssessments,
} from '@/store/selectors';
import { cn } from '@/lib/utils';

/**
 * The shell: student-wide navigation above, course navigation inside.
 *
 * ── Why two levels and not one flat list ──────────────────────────────────
 *
 * Rawi now holds several courses, and the four student-wide destinations —
 * Home, Courses, Planner, History — are about the student's week rather than
 * about any subject. Flattening them into one list with the course's six
 * sections would make "Planner" and "Practice" look like peers, which they are
 * not: one spans every course and the other is scoped to whichever course you
 * happen to be inside.
 *
 * So the rail has a global group, and — only when you are inside a course — a
 * second group under a header naming that course. The header is not decoration:
 * it is the answer to "whose practice is this", which a student who has just
 * switched courses genuinely needs.
 *
 * ── The desktop/mobile split ──────────────────────────────────────────────
 *
 * A fixed rail on desktop, a sheet on mobile — and `useMediaQuery` rather than
 * `hidden md:flex`, because the two must not both be mounted. CSS hiding would
 * leave two copies of the nav in the accessibility tree and announce every link
 * twice to a screen reader.
 *
 * ── Scrolling ─────────────────────────────────────────────────────────────
 *
 * This component owns the app's single vertical scroll, on its `<main>`. The
 * document itself cannot scroll (see `globals.css`), which is what stopped the
 * doubled desktop scrollbar. A screen that genuinely needs a second scroller —
 * a reading pane beside a conversation — sets it up inside `<main>` and takes
 * `h-full`, which is the case the rule is written to permit.
 */

interface NavItem {
  to: string;
  label: string;
  icon: typeof LayoutDashboardIcon;
  /** Matches nested routes, so /materials/x keeps Materials highlighted. */
  match: string;
  end?: boolean;
}

const GLOBAL_NAV: NavItem[] = [
  { to: '/', label: 'Home', icon: HomeIcon, match: '/', end: true },
  { to: '/courses', label: 'Courses', icon: LayersIcon, match: '/courses' },
  { to: '/planner', label: 'Planner', icon: CalendarDaysIcon, match: '/planner' },
  { to: '/history', label: 'Progress & history', icon: TrendingUpIcon, match: '/history' },
];

function courseNav(courseId: string): NavItem[] {
  const base = `/course/${courseId}`;
  return [
    { to: base, label: 'Overview', icon: LayoutDashboardIcon, match: base, end: true },
    {
      to: `${base}/syllabus`,
      label: 'Syllabus & topics',
      icon: ListTreeIcon,
      match: `${base}/syllabus`,
    },
    {
      to: `${base}/materials`,
      label: 'Materials',
      icon: BookOpenIcon,
      match: `${base}/materials`,
    },
    { to: `${base}/tutor`, label: 'Tutor', icon: MessageSquareIcon, match: `${base}/tutor` },
    {
      to: `${base}/practice`,
      label: 'Practice',
      icon: ClipboardListIcon,
      match: `${base}/practice`,
    },
    {
      to: `${base}/exams`,
      label: 'Exams',
      icon: GraduationCapIcon,
      match: `${base}/exams`,
    },
    {
      to: `${base}/progress`,
      label: 'Progress',
      icon: TrendingUpIcon,
      match: `${base}/progress`,
    },
  ];
}

function isActive(pathname: string, item: NavItem): boolean {
  if (item.end) return pathname === item.match;
  return pathname === item.match || pathname.startsWith(`${item.match}/`);
}

function NavGroup({
  items,
  onNavigate,
  badges,
}: {
  items: NavItem[];
  onNavigate?: () => void;
  badges?: Record<string, number>;
}) {
  const { pathname } = useLocation();

  return (
    <div className="flex flex-col gap-hairline">
      {items.map((item) => {
        const active = isActive(pathname, item);
        const Icon = item.icon;
        const badge = badges?.[item.to];
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
            <span className="flex-1 truncate">{item.label}</span>
            {badge !== undefined && badge > 0 && (
              <Badge variant="secondary" className="font-mono tabular-nums">
                {badge}
              </Badge>
            )}
          </NavLink>
        );
      })}
    </div>
  );
}

/** The switcher, so changing course never means going back to a list first. */
function CourseSwitcher({
  currentId,
  onNavigate,
}: {
  currentId: string | undefined;
  onNavigate?: () => void;
}) {
  const courses = useActiveCourses();
  const current = useCourseById(currentId);

  if (courses.length === 0) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="hover:bg-accent focus-visible:ring-ring mx-tight flex items-center gap-snug rounded-md border px-snug py-2 text-left outline-none transition-colors focus-visible:ring-2"
        >
          {current && <CourseDot accent={current.accent} />}
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">
              {current?.name ?? 'All courses'}
            </span>
            <span className="text-muted-foreground block text-xs">
              {current ? 'Switch course' : `${courses.length} courses`}
            </span>
          </span>
          <ChevronsUpDownIcon className="text-muted-foreground size-3.5 shrink-0" aria-hidden />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel>Your courses</DropdownMenuLabel>
        {courses.map((course) => (
          <DropdownMenuItem key={course.id} asChild>
            <Link to={`/course/${course.id}`} onClick={onNavigate}>
              <CourseDot accent={course.accent} />
              <span className="truncate">{course.name}</span>
            </Link>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to="/courses" onClick={onNavigate}>
            <LayersIcon />
            All courses
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** The next deadline, wherever it is. The one fact worth carrying everywhere. */
function NextDeadline() {
  const upcoming = useUpcomingAssessments(1);
  const next = upcoming[0];
  const course = useCourseById(next?.courseId);
  if (!next || !course) return null;

  return (
    <Link
      to={`/course/${next.courseId}/exams`}
      className="hover:bg-accent focus-visible:ring-ring mx-tight flex flex-col gap-hairline rounded-md border p-snug outline-none transition-colors focus-visible:ring-2"
    >
      <span className="flex items-center justify-between gap-tight">
        <span className="text-muted-foreground text-xs">Next up</span>
        <DueChip date={next.date} />
      </span>
      <span className="truncate text-sm">{next.title}</span>
      <span className="text-muted-foreground flex items-center gap-1 truncate text-xs">
        <CourseDot accent={course.accent} />
        {course.name}
      </span>
    </Link>
  );
}

function RailContent({ onNavigate }: { onNavigate?: () => void }) {
  const { courseId } = useParams<{ courseId: string }>();
  const course = useCourseById(courseId);
  const reviews = useAllReviews();

  return (
    <div className="flex flex-col gap-base py-tight">
      <CourseSwitcher currentId={courseId} onNavigate={onNavigate} />
      <NextDeadline />

      <nav className="flex flex-col gap-base px-tight" aria-label="Main">
        <NavGroup
          items={GLOBAL_NAV}
          onNavigate={onNavigate}
          badges={{ '/planner': reviews.length }}
        />

        {course && (
          <div className="flex flex-col gap-tight">
            <div className="flex items-center gap-tight px-snug">
              <CourseDot accent={course.accent} />
              <span className="text-muted-foreground truncate text-xs font-medium tracking-wide uppercase">
                {course.name}
              </span>
            </div>
            <NavGroup items={courseNav(course.id)} onNavigate={onNavigate} />
          </div>
        )}
      </nav>
    </div>
  );
}

export function AppShell() {
  const wide = useMediaQuery(MEDIA_WIDE);
  const [open, setOpen] = useState(false);
  const { courseId } = useParams<{ courseId: string }>();
  const course = useCourseById(courseId);
  const { activeCourseId } = useAppState();

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
            <SheetContent side="left" className="w-72 p-0">
              <SheetHeader className="border-b">
                <SheetTitle>
                  <Logo />
                </SheetTitle>
              </SheetHeader>
              <div className="flex flex-col overflow-y-auto">
                <RailContent onNavigate={() => setOpen(false)} />
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

        {/*
          On mobile the rail is behind a button, so the header carries the one
          piece of context the student would otherwise have to open it to see:
          which course they are in, and the way back out of it.
        */}
        {!wide && course && (
          <>
            <ChevronLeftIcon className="text-muted-foreground size-4" aria-hidden />
            <span className="flex min-w-0 items-center gap-1.5">
              <CourseDot accent={course.accent} />
              <span className="truncate text-sm font-medium">{course.name}</span>
            </span>
          </>
        )}

        <div className="flex-1" />

        {/* Getting back into the course you were in, from a global screen. */}
        {wide && !course && activeCourseId && (
          <Button variant="ghost" size="sm" asChild>
            <Link to={`/course/${activeCourseId}`}>Back to your course</Link>
          </Button>
        )}

        <ThemeToggle />
      </header>

      <div className="flex min-h-0 flex-1">
        {wide && (
          <aside className="flex w-60 shrink-0 flex-col overflow-y-auto border-r">
            <RailContent />
          </aside>
        )}
        <main className="min-w-0 flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
