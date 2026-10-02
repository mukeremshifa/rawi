import { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react';
import { Link, Outlet, useLocation, useParams } from 'react-router-dom';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

import type { Course } from '@shared/types.ts';

import { useAppState, useStore } from './store.tsx';

/**
 * Which course the screens inside a course are about.
 *
 * ── Why the URL is the authority and the store is the memory ──────────────
 *
 * The course id lives in the path — `/course/:courseId/practice` — and this
 * provider reads it from there. The store's `activeCourseId` is written *from*
 * the URL rather than consulted by it, which is the ordering that makes deep
 * links work: opening a bookmark to another course's materials shows that
 * course, rather than showing this course's data under that course's address.
 *
 * The store's copy still earns its place. It is what the student-wide screens
 * use to offer "back to the course you were in", and what makes a fresh visit
 * to `/course` resolve to somewhere sensible. It is memory, not truth.
 *
 * ── Why a context and not a hook reading `useParams` everywhere ───────────
 *
 * A hook would work and would let any component inside a course forget to
 * handle the missing-course case. The context resolves the course once, at the
 * route boundary, and a course that does not exist never renders its children
 * at all — so every screen below can treat `useCourse()` as returning a real
 * course rather than defending against a null on every line.
 */

interface CourseContextValue {
  course: Course;
}

const CourseContext = createContext<CourseContextValue | null>(null);

/**
 * The route element for everything under `/course/:courseId`.
 *
 * An unknown id redirects to the course list rather than rendering an error
 * page: the realistic causes are a deleted course and a stale bookmark, and in
 * both cases the list is where the student was trying to get to.
 */
export function CourseScope() {
  const { courseId } = useParams<{ courseId: string }>();
  const { courses } = useAppState();
  const { dispatch } = useStore();
  const location = useLocation();

  const course = useMemo(
    () => courses.find((c) => c.id === courseId),
    [courses, courseId],
  );

  /*
   * Remembering the course is a side effect of being inside it, so it happens
   * in an effect rather than during render — dispatching while rendering would
   * be a state update during another component's render pass.
   */
  useEffect(() => {
    if (course) dispatch({ type: 'set-active-course', courseId: course.id });
  }, [course, dispatch]);

  const value = useMemo(() => (course ? { course } : null), [course]);

  if (!course || !value) return <div className="p-6"><h1 className="text-xl font-semibold">Course unavailable</h1><p>This course may have been deleted or the address may be incorrect.</p><Button asChild><Link to="/courses">Open your courses</Link></Button></div>;

  return (
    <CourseContext.Provider value={value}>
      {course.archived && <Alert><AlertTitle>{course.name} is archived</AlertTitle><AlertDescription>Your history is retained. Restore the course to continue studying.<Button variant="outline" size="sm" onClick={() => dispatch({ type: 'update-course', courseId: course.id, patch: { archived: false } })}>Restore course</Button></AlertDescription></Alert>}
      {course.archived && /\/(new|run|build)(\/|$)/.test(location.pathname) ? <div className="p-6"><h1>Restore this course to continue</h1><p>Your unfinished work is retained.</p><Button variant="outline" asChild><Link to={`/course/${course.id}`}>Course overview</Link></Button></div> : <Outlet />}
    </CourseContext.Provider>
  );
}

/** The course the current screen belongs to. Only valid inside `CourseScope`. */
export function useCourse(): Course {
  const value = useContext(CourseContext);
  if (!value) {
    throw new Error('useCourse must be used inside a /course/:courseId route');
  }
  return value.course;
}

/** The current course, or null on the student-wide screens. */
export function useCourseOrNull(): Course | null {
  return useContext(CourseContext)?.course ?? null;
}

/** Builds a path inside the current course. */
export function useCoursePath(): (path: string) => string {
  const course = useCourse();
  return useMemo(
    () => (path: string) =>
      `/course/${course.id}${path.startsWith('/') ? path : `/${path}`}`,
    [course.id],
  );
}

/** Builds a path inside an arbitrary course. */
export function coursePath(courseId: string, path = ''): string {
  return `/course/${courseId}${path && !path.startsWith('/') ? `/${path}` : path}`;
}

export function CourseProvider({
  course,
  children,
}: {
  course: Course;
  children: ReactNode;
}) {
  const value = useMemo(() => ({ course }), [course]);
  return <CourseContext.Provider value={value}>{children}</CourseContext.Provider>;
}
