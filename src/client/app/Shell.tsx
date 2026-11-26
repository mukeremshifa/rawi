import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { MenuIcon, SearchIcon } from 'lucide-react';
import type { Course } from '@shared/contracts/workspace';

import { CommandMenu } from '@/app/CommandMenu';
import { RemindersButton } from '@/app/Reminders';
import { Sidebar } from '@/app/Sidebar';
import { UploadTray } from '@/features/materials/queue';
import { Breadcrumbs, MEDIA_DESKTOP, useMediaQuery, type Crumb } from '@/components/layout';
import { Button } from '@/components/ui/button';
import { Kbd, modKey } from '@/components/ui/kbd';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { useApi } from '@/lib/data';
import { ShellProvider, type PageMeta } from '@/lib/shell';

const SECTION: Record<string, string> = {
  syllabus: 'Syllabus',
  settings: 'Syllabus',
  materials: 'Materials',
  practice: 'Practice',
  exams: 'Exams',
  tutor: 'Tutor',
};

/** Breadcrumbs the shell can work out from the path alone. */
function routeCrumbs(pathname: string, course: Course | undefined): Crumb[] {
  const inCourse = /^\/course\/([^/]+)(?:\/([^/]+))?/.exec(pathname);
  if (inCourse) {
    const crumbs: Crumb[] = [
      { label: 'Courses', to: '/courses' },
      { label: course?.name ?? 'Course', to: `/course/${inCourse[1]}` },
    ];
    const section = inCourse[2] && SECTION[inCourse[2]];
    return section ? [...crumbs, { label: section }] : crumbs;
  }
  const top: Record<string, string> = {
    '/': 'Home',
    '/courses': 'Courses',
    '/planner': 'Planner',
    '/progress': 'Progress',
    '/history': 'Progress',
    '/search': 'Search',
    '/notifications': 'Reminders',
  };
  if (top[pathname]) return [{ label: top[pathname]! }];
  if (pathname.startsWith('/settings')) return [{ label: 'Settings' }];
  return [];
}

/**
 * The signed-in frame: sidebar (a sheet on phones), a header with
 * breadcrumbs, search and reminders, and the one scrolling main column.
 * Pages report breadcrumbs and their course through usePageMeta.
 */
export function Shell({
  children,
  onSignOut,
  signingOut,
  banner,
}: {
  children: ReactNode;
  onSignOut: () => void;
  signingOut: boolean;
  banner?: ReactNode;
}) {
  const { pathname } = useLocation();
  const desktop = useMediaQuery(MEDIA_DESKTOP);
  const [meta, setMeta] = useState<PageMeta | null>(null);
  const [navOpen, setNavOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [lastCourse, setLastCourse] = useState<string | null>(null);
  const courses = useApi<{ courses: Course[] }>('/v1/courses?archived=all&limit=100');
  const routeCourse = /^\/course\/([^/]+)/.exec(pathname)?.[1] ?? null;
  const courseId = routeCourse ?? meta?.courseId ?? lastCourse;
  const course = courses.data?.courses.find(c => c.id === courseId);
  useEffect(() => {
    if (routeCourse ?? meta?.courseId) setLastCourse(routeCourse ?? meta?.courseId ?? null);
  }, [routeCourse, meta?.courseId]);
  useEffect(() => {
    setNavOpen(false);
  }, [pathname]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCommandOpen(open => !open);
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, []);
  const report = useCallback((value: PageMeta | null) => setMeta(value), []);
  const crumbs = meta?.crumbs
    ? (meta.courseId || routeCourse) && course
      ? [{ label: 'Courses', to: '/courses' }, { label: course.name, to: `/course/${course.id}` }, ...meta.crumbs]
      : meta.crumbs
    : routeCrumbs(pathname, course);
  // The tab title names the page: its last breadcrumb, such as "Planner · Rawi".
  const here = [...crumbs]
    .reverse()
    .map(c => (typeof c.label === 'string' ? c.label : ''))
    .find(Boolean);
  useEffect(() => {
    document.title = here ? `${here} · Rawi` : 'Rawi';
    return () => {
      document.title = 'Rawi';
    };
  }, [here]);
  const sidebar = (
    <Sidebar
      courses={courses.data?.courses}
      courseId={courseId}
      onNavigate={() => setNavOpen(false)}
      onSignOut={onSignOut}
      signingOut={signingOut}
    />
  );
  const command = (
    <CommandMenu open={commandOpen} onOpenChange={setCommandOpen} courses={courses.data?.courses} courseId={courseId} />
  );

  if (meta?.focus) {
    return (
      <ShellProvider value={report}>
        <main className="bg-background min-h-0 flex-1 overflow-y-auto">
          {banner}
          {children}
        </main>
        {command}
      </ShellProvider>
    );
  }
  return (
    <ShellProvider value={report}>
      <a
        href="#main"
        className="bg-card text-foreground focus-visible:ring-ring sr-only z-50 rounded-md border px-3 py-2 text-sm shadow-raised outline-none focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus-visible:ring-2"
      >
        Skip to content
      </a>
      <div className="flex min-h-0 flex-1">
        {desktop && <aside className="bg-surface w-60 shrink-0 overflow-y-auto border-r">{sidebar}</aside>}
        {!desktop && (
          <Sheet open={navOpen} onOpenChange={setNavOpen}>
            <SheetContent side="left" size="sm" aria-describedby={undefined} className="bg-surface w-72">
              <SheetTitle className="sr-only">Navigation</SheetTitle>
              {sidebar}
            </SheetContent>
          </Sheet>
        )}
        <div className="relative flex min-w-0 flex-1 flex-col">
          <header className="flex h-12 shrink-0 items-center gap-2 border-b px-3 sm:px-4">
            {!desktop && (
              <Button variant="ghost" size="icon" aria-label="Open navigation" onClick={() => setNavOpen(true)}>
                <MenuIcon />
              </Button>
            )}
            <Breadcrumbs items={crumbs} className="min-w-0 flex-1" />
            <button
              type="button"
              onClick={() => setCommandOpen(true)}
              aria-label="Search and commands"
              className="text-muted-foreground hover:bg-accent focus-visible:ring-ring bg-card flex h-8 items-center gap-2 rounded-md border px-2.5 text-sm shadow-raised outline-none focus-visible:ring-2 sm:w-56"
            >
              <SearchIcon className="size-3.5 shrink-0" aria-hidden />
              <span className="hidden flex-1 text-left sm:inline">Search</span>
              <span className="hidden gap-0.5 sm:flex">
                <Kbd>{modKey}</Kbd>
                <Kbd>K</Kbd>
              </span>
            </button>
            <RemindersButton />
          </header>
          <main id="main" tabIndex={-1} className="min-h-0 flex-1 overflow-y-auto outline-none">
            {banner}
            {children}
          </main>
          <UploadTray className="absolute bottom-4 left-4 z-40" />
        </div>
      </div>
      {command}
    </ShellProvider>
  );
}
