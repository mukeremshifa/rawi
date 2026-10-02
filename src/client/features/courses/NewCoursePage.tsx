import { useDraftState } from '@/store/drafts';
import { useLocation } from 'react-router-dom';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeftIcon } from 'lucide-react';
import { toast } from '@/lib/toast';

import type { Course, CourseAccent } from '@shared/types.ts';

import { Page, PageHeader, Section } from '@/components/layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { COURSE_ACCENT } from '@/components/domain';
import { useStore } from '@/store/store';
import { useCourses } from '@/store/selectors';
import { newId } from '@/lib/id';
import { cn } from '@/lib/utils';

const ACCENTS: CourseAccent[] = ['indigo', 'amber', 'teal', 'rose', 'violet'];

/**
 * Adding a course.
 *
 * ── Deliberately small ────────────────────────────────────────────────────
 *
 * Name, description, goal, colour. No topics, no exam date, no study minutes —
 * each of those now belongs to the object that owns it: topics to the syllabus
 * screen, dates to planned assessments, availability to the planner. A form
 * that asked for all of them here would be the old single-course setup screen
 * wearing a new title, and would give a student four places to change a date.
 *
 * The next step is offered rather than forced: creating a course lands on its
 * syllabus screen, because an outline is what makes everything else possible,
 * but nothing is created there without review.
 */
export function NewCoursePage() {
  const draftLocation = useLocation();
  const draftPrefix = `form:${draftLocation.pathname}${draftLocation.search}:`;
  const navigate = useNavigate();
  const { dispatch } = useStore();
  const courses = useCourses();

  const used = new Set(courses.map((c) => c.accent));
  const suggested = ACCENTS.find((a) => !used.has(a)) ?? 'indigo';

  const [name, setName] = useDraftState(draftPrefix + "name", '');
  const [description, setDescription] = useDraftState(draftPrefix + "description", '');
  const [goal, setGoal] = useDraftState(draftPrefix + "goal", '');
  const [accent, setAccent] = useDraftState<CourseAccent>(draftPrefix + "accent", suggested);

  const nameError = !name.trim() ? 'Give the course a name.' : null;

  const create = () => {
    if (nameError) return;
    const course: Course = {
      id: newId('course'),
      name: name.trim(),
      description: description.trim(),
      goal: goal.trim(),
      accent,
      createdAt: new Date().toISOString(),
    };
    dispatch({ type: 'clear-draft', prefix: draftPrefix });
    dispatch({ type: 'create-course', course, topics: [] });
    toast.success('Course added', { description: 'Set up its topics next.' });
    navigate(`/course/${course.id}/syllabus`, { replace: true });
  };

  return (
    <Page width="prose" className="pb-page">
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2">
          <Link to="/courses">
            <ArrowLeftIcon />
            Courses
          </Link>
        </Button>
      </div>

      <PageHeader
        title="Add a course"
        description="Just enough to create it. Topics, assessments and study time each have their own place."
      />

      <Section title="The course">
        <div className="flex flex-col gap-base">
          <div className="flex flex-col gap-tight">
            <Label htmlFor="course-name">
              Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="course-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Introduction to Macroeconomics"
              aria-invalid={!!nameError}
            />
          </div>

          <div className="flex flex-col gap-tight">
            <Label htmlFor="course-description">What is it?</Label>
            <Textarea
              id="course-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="A first-year survey, assessed by two problem sets and a final."
            />
          </div>

          <div className="flex flex-col gap-tight">
            <Label htmlFor="course-goal">What do you want out of it?</Label>
            <Textarea
              id="course-goal"
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              rows={2}
              placeholder="Be able to explain the model rather than just apply it."
            />
            <p className="text-muted-foreground text-xs leading-relaxed">
              In your own words. It is shown back to you on the course overview, and it is
              not used to generate anything.
            </p>
          </div>

          <div className="flex flex-col gap-tight">
            <Label>Colour</Label>
            <div className="flex flex-wrap gap-tight">
              {ACCENTS.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setAccent(option)}
                  aria-pressed={accent === option}
                  aria-label={`Use the ${option} accent`}
                  className={cn(
                    'focus-visible:ring-ring flex items-center gap-tight rounded-md border px-snug py-1.5 text-sm outline-none transition-colors focus-visible:ring-2',
                    accent === option ? 'border-primary bg-primary/5' : 'hover:bg-accent/50',
                  )}
                >
                  <span
                    className={cn('size-3 rounded-full', COURSE_ACCENT[option].dot)}
                    aria-hidden
                  />
                  <span className="capitalize">{option}</span>
                  {used.has(option) && (
                    <span className="text-muted-foreground text-xs">(in use)</span>
                  )}
                </button>
              ))}
            </div>
            <p className="text-muted-foreground text-xs leading-relaxed">
              Used to tell your courses apart in the planner and in your history. The
              course name is always shown alongside it, so the colour is never the only
              way to tell.
            </p>
          </div>
        </div>
      </Section>

      <Alert>
        <AlertTitle>What happens next</AlertTitle>
        <AlertDescription>
          You will land on the syllabus screen, where you can paste a syllabus, read a
          .txt or .md file, or build a week-by-week outline yourself. Nothing is created
          until you review it and confirm.
        </AlertDescription>
      </Alert>

      <div className="flex flex-wrap items-center gap-tight">
        <Button onClick={create} disabled={!!nameError}>
          Create course
        </Button>
        <Button variant="ghost" asChild>
          <Link to="/courses">Cancel</Link>
        </Button>
      </div>
    </Page>
  );
}
