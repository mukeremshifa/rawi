import { Link } from 'react-router-dom';
import {
  ArrowRightIcon,
  BookOpenIcon,
  LayersIcon,
  PlusIcon,
  RotateCcwIcon,
} from 'lucide-react';
import { useState } from 'react';

import { Page, PageHeader, Section } from '@/components/layout';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { EmptyState } from '@/components/states';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { DueChip, formatRelative } from '@/components/domain';
import { useAppState, useStore } from '@/store/store';
import {
  useAllAssessments,
  useAllAttempts,
  useAllMaterials,
  useAllTopics,
  useCourses,
} from '@/store/selectors';
import { deriveEvidence, upcomingAssessments } from '@shared/progress.ts';
import { CarriedForwardNotice, RestoreNotice } from './RestoreNotice';

/**
 * Every course, with enough status to choose between them.
 *
 * ── What "concise status" means here ──────────────────────────────────────
 *
 * Four numbers per course: topics, materials, the next deadline, and how much
 * of the outline has independent evidence behind it. Not a mastery percentage —
 * the evidence ladder deliberately refuses to produce one — but a count of
 * topics at each level, which is a claim the attempt log can actually support.
 *
 * The temptation on a screen like this is a progress bar per course. A bar
 * implies a denominator that means something, and "topics with unaided answers
 * ÷ topics" is not progress through a course; it is progress through the
 * questions this prototype happens to have authored.
 */
export function CoursesPage() {
  const courses = useCourses();
  const topics = useAllTopics();
  const materials = useAllMaterials();
  const attempts = useAllAttempts();
  const assessments = useAllAssessments();
  const { seeded } = useAppState();
  const { resetDemo } = useStore();
  const [confirmReset, setConfirmReset] = useState(false);

  const active = courses.filter((c) => !c.archived);
  const archived = courses.filter((c) => c.archived);

  return (
    <Page className="py-page">
      <RestoreNotice />
      <CarriedForwardNotice />

      <PageHeader
        title="Your courses"
        description="Each course keeps its own materials, topics, practice and history. Planning happens across all of them."
        actions={
          <Button asChild>
            <Link to="/courses/new">
              <PlusIcon />
              Add a course
            </Link>
          </Button>
        }
      />

      {active.length === 0 ? (
        <EmptyState
          icon={<LayersIcon />}
          title="No courses yet"
          description="Add one and Rawi can plan around its topics and deadlines."
          action={
            <Button asChild>
              <Link to="/courses/new">
                <PlusIcon />
                Add a course
              </Link>
            </Button>
          }
        />
      ) : (
        <div className="grid gap-base lg:grid-cols-2">
          {active.map((course) => {
            const courseTopics = topics.filter((t) => t.courseId === course.id);
            const courseMaterials = materials.filter((m) => m.courseId === course.id);
            const courseAttempts = attempts.filter((a) => a.courseId === course.id);
            const next = upcomingAssessments(
              assessments.filter((a) => a.courseId === course.id),
            )[0];

            const levels = courseTopics.map(
              (t) => deriveEvidence(t.id, courseAttempts).level,
            );
            const unaided = levels.filter(
              (l) => l === 'independent-once' || l === 'retained',
            ).length;
            const untouched = levels.filter((l) => l === 'not-checked').length;

            const lastWorked = courseAttempts
              .filter((a) => a.completedAt)
              .sort((a, b) => (a.completedAt! < b.completedAt! ? 1 : -1))[0];

            return (
              <Card
                key={course.id}
                className="border-l-4"
                style={{ borderLeftColor: `var(--accent-${course.accent})` }}
              >
                <CardContent className="flex flex-col gap-base">
                  <div className="flex flex-col gap-hairline">
                    <Link
                      to={`/course/${course.id}`}
                      className="focus-visible:ring-ring rounded font-serif text-xl outline-none hover:underline focus-visible:ring-2"
                    >
                      {course.name}
                    </Link>
                    {course.description && (
                      <p className="text-muted-foreground line-clamp-2 text-sm leading-relaxed">
                        {course.description}
                      </p>
                    )}
                  </div>

                  <div className="text-muted-foreground flex flex-wrap items-center gap-tight text-xs">
                    <span className="font-mono tabular-nums">
                      {courseTopics.length} topics
                    </span>
                    <Separator orientation="vertical" className="h-3" />
                    <span className="font-mono tabular-nums">
                      {courseMaterials.length} materials
                    </span>
                    <Separator orientation="vertical" className="h-3" />
                    <span className="font-mono tabular-nums">
                      {courseAttempts.filter((a) => a.completedAt).length} attempts
                    </span>
                    {lastWorked?.completedAt && (
                      <>
                        <Separator orientation="vertical" className="h-3" />
                        <span>Last worked {formatRelative(lastWorked.completedAt)}</span>
                      </>
                    )}
                  </div>

                  {courseTopics.length > 0 && (
                    <p className="text-muted-foreground text-xs leading-relaxed">
                      {unaided > 0
                        ? `${unaided} of ${courseTopics.length} topics have at least one unaided answer behind them`
                        : 'No topic has an unaided answer behind it yet'}
                      {untouched > 0 && `, and ${untouched} have not been checked at all`}.
                    </p>
                  )}

                  {next ? (
                    <Link
                      to={`/course/${course.id}/exams/assessment/${next.id}`}
                      className="hover:bg-accent/50 focus-visible:ring-ring flex items-center gap-snug rounded-md border p-snug outline-none transition-colors focus-visible:ring-2"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="text-muted-foreground block text-xs">
                          Next assessment
                        </span>
                        <span className="block truncate text-sm">{next.title}</span>
                      </span>
                      <DueChip date={next.date} />
                    </Link>
                  ) : (
                    <p className="text-muted-foreground text-xs">
                      No assessments recorded for this course.
                    </p>
                  )}

                  <div className="flex flex-wrap items-center gap-tight">
                    <Button size="sm" asChild>
                      <Link to={`/course/${course.id}`}>
                        Open
                        <ArrowRightIcon />
                      </Link>
                    </Button>
                    <Button size="sm" variant="outline" asChild>
                      <Link to={`/course/${course.id}/syllabus`}>
                        <BookOpenIcon />
                        Syllabus
                      </Link>
                    </Button>
                    <Button size="sm" variant="ghost" asChild>
                      <Link to={`/course/${course.id}/settings`}>Settings</Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {archived.length > 0 && (
        <Section
          title="Archived"
          description="Kept in full, with their history, but left out of planning."
        >
          <div className="flex flex-col gap-tight">
            {archived.map((course) => (
              <Link
                key={course.id}
                to={`/course/${course.id}`}
                className="hover:bg-accent/50 focus-visible:ring-ring flex items-center gap-snug rounded-lg border p-snug outline-none transition-colors focus-visible:ring-2"
              >
                <span className="min-w-0 flex-1 truncate text-sm">{course.name}</span>
                <Badge variant="outline" className="font-normal">
                  Archived
                </Badge>
              </Link>
            ))}
          </div>
        </Section>
      )}

      {/*
        Reset is here rather than on every screen, and it says exactly what it
        takes: everything, in every course. The brief requires the action stay
        available with a clear scope, which means naming the scope.
      */}
      <Section title="Sample data">
        <Card className="bg-muted/30">
          <CardContent className="flex flex-wrap items-center gap-base">
            <p className="text-muted-foreground min-w-48 flex-1 text-xs leading-relaxed">
              {seeded
                ? 'You are looking at the two sample courses, their authored readings, question banks and seeded history. Everything is fictional and stored only in this browser.'
                : 'Your own courses are stored in this browser. Resetting replaces everything, meaning every course, material, attempt, planner session and assessment, with the two sample courses.'}
            </p>
            <Button variant="outline" size="sm" onClick={() => setConfirmReset(true)}>
              <RotateCcwIcon />
              Reset demo
            </Button>
          </CardContent>
        </Card>
      </Section>

      <ConfirmDialog
        open={confirmReset}
        onOpenChange={setConfirmReset}
        title="Reset everything?"
        description={`This clears all ${courses.length} ${
          courses.length === 1 ? 'course' : 'courses'
        } and everything in them, including materials, notes, practice sets, attempts, planner sessions, availability and assessments, and restores the two sample courses. It cannot be undone.`}
        confirmLabel="Reset to the sample courses"
        onConfirm={() => {
          setConfirmReset(false);
          resetDemo();
        }}
      />
    </Page>
  );
}
