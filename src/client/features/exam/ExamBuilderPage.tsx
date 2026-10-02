import { useDraftState } from '@/store/drafts';
import { useLocation } from 'react-router-dom';
import { useMemo } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  AlertTriangleIcon,
  ArrowLeftIcon,
  PlayIcon,
  PlusIcon,
  SaveIcon,
  Trash2Icon,
} from 'lucide-react';
import { toast } from '@/lib/toast';

import type {
  BookMode,
  ExamConfig,
  ExamSection,
  NavigationMode,
  QuestionFormat,
  TimingMode,
} from '@shared/types.ts';

import { Page, PageHeader, Section } from '@/components/layout';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { FORMAT_LABEL } from '@/components/domain';
import { useAppState, useStore } from '@/store/store';
import { useCourse, useCoursePath } from '@/store/course-context';
import { selectQuestions, useMaterials, useQuestions, useTopics } from '@/store/selectors';
import { newId } from '@/lib/id';
import { buildRun, validateConfig } from './engine';

/**
 * The exam builder.
 *
 * ── Validation is the feature, not a chore ────────────────────────────────
 *
 * The brief requires that incompatible combinations and impossible question
 * counts be prevented or explained. That is the hardest part of this screen and
 * the most valuable: a builder that lets you ask for eight essays when four
 * exist produces a broken paper, and one that silently trims to four without
 * saying so produces a confused student.
 *
 * So `validateConfig` returns *explained* problems, and this page renders them
 * as they appear rather than at submit time. A section asking for more
 * questions than exist shows the shortfall on the section itself, next to the
 * control that caused it.
 *
 * ── Why sections carry their own format and topic filters ─────────────────
 *
 * Because that is what makes a mixed paper possible: Section A short answers
 * across everything, Section B two essays on historiography. A paper-level
 * filter could not express it.
 */

const ALL_FORMATS: QuestionFormat[] = [
  'multiple-choice',
  'multiple-select',
  'matching',
  'ordering',
  'fill-blank',
  'flashcard',
  'written-recall',
  'source-analysis',
  'essay',
];

function blankSection(index: number): ExamSection {
  return {
    id: newId('sec'),
    title: `Section ${String.fromCharCode(65 + index)}`,
    instructions: 'Answer all questions in this section.',
    formats: ['multiple-choice', 'multiple-select', 'fill-blank'],
    topicIds: [],
    count: 4,
    minutes: 20,
  };
}

export function ExamBuilderPage() {
  const draftLocation = useLocation();
  const draftPrefix = `form:${draftLocation.pathname}${draftLocation.search}:`;
  const { configId } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { dispatch } = useStore();
  const course = useCourse();
  const path = useCoursePath();
  const state = useAppState();
  const topics = useTopics();
  const materials = useMaterials();
  const pool = useQuestions();

  /* Planner context, when a session sent the student here to build and sit a
     rehearsal. Carried onto the run so completing it completes that session. */
  const sessionId = params.get('session') ?? undefined;
  const assessmentParam = params.get('assessment') ?? undefined;

  const existing = configId
    ? state.examConfigs.find((c) => c.id === configId && c.courseId === course.id)
    : undefined;

  const [name, setName] = useDraftState(draftPrefix + "name",
    existing ? (existing.preset ? `${existing.name} (copy)` : existing.name) : 'My exam',
  );
  const [sections, setSections] = useDraftState<ExamSection[]>(draftPrefix + "sections",
    existing ? existing.sections.map((s) => ({ ...s, id: newId('sec') })) : [blankSection(0)],
  );
  const [timing, setTiming] = useDraftState<TimingMode>(draftPrefix + "timing", existing?.timing ?? 'overall');
  const [totalMinutes, setTotalMinutes] = useDraftState(draftPrefix + "totalMinutes", existing?.totalMinutes ?? state.availability.sessionMinutes);
  const [extraTimePercent, setExtraTime] = useDraftState(draftPrefix + "extraTimePercent", existing?.extraTimePercent ?? 0);
  const [book, setBook] = useDraftState<BookMode>(draftPrefix + "book", existing?.book ?? 'closed');
  const [allowedMaterialIds, setAllowed] = useDraftState<string[]>(draftPrefix + "allowedMaterialIds",
    existing?.allowedMaterialIds ?? [],
  );
  const [navigation, setNavigation] = useDraftState<NavigationMode>(draftPrefix + "navigation",
    existing?.navigation ?? 'free',
  );
  const [flaggingEnabled, setFlagging] = useDraftState(draftPrefix + "flaggingEnabled", existing?.flaggingEnabled ?? true);
  const [lockSectionsOnFinish, setLockSections] = useDraftState(draftPrefix + "lockSectionsOnFinish",
    existing?.lockSectionsOnFinish ?? false,
  );

  const config: ExamConfig = useMemo(
    () => ({
      id: existing && !existing.preset ? existing.id : newId('exam'),
      courseId: course.id,
      name: name.trim() || 'Untitled exam',
      sections,
      timing,
      totalMinutes,
      extraTimePercent,
      book,
      allowedMaterialIds,
      navigation,
      flaggingEnabled,
      lockSectionsOnFinish,
      savedAt: new Date().toISOString(),
    }),
    [
      existing,
      name,
      sections,
      timing,
      totalMinutes,
      extraTimePercent,
      book,
      allowedMaterialIds,
      navigation,
      flaggingEnabled,
      lockSectionsOnFinish,
    ],
  );

  const validation = useMemo(() => validateConfig(config, pool), [config, pool]);

  const updateSection = (id: string, patch: Partial<ExamSection>) =>
    setSections((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));

  const totalMarks = useMemo(() => {
    let marks = 0;
    for (const section of sections) {
      const chosen = selectQuestions(
        pool,
        { formats: section.formats, ...(section.topicIds.length ? { topicIds: section.topicIds } : {}) },
        section.count,
      );
      marks += chosen.reduce((sum, q) => sum + q.marks, 0);
    }
    return marks;
  }, [sections, pool]);

  const save = () => {
    dispatch({ type: 'clear-draft', prefix: draftPrefix });
    dispatch({ type: 'save-exam-config', config });
    toast.success('Exam saved', { description: 'Available from the Exams page.' });
    navigate(path('/exams'));
  };

  const start = () => {
    const run = buildRun(config, pool, {
      ...(sessionId ? { plannedSessionId: sessionId } : {}),
      ...(assessmentParam ? { assessmentId: assessmentParam } : {}),
    });
    if (!run) {
      toast.error('Cannot start', {
        description: 'No questions match this configuration.',
      });
      return;
    }
    dispatch({ type: 'clear-draft', prefix: draftPrefix });
    if (state.activeExam) { toast.error('An exam is already open. Resume or abandon it first.'); return; }
    dispatch({ type: 'save-exam-config', config });
    dispatch({ type: 'set-active-exam', run });
    navigate(path('/exams/run'));
  };

  return (
    <Page width="prose" className="pb-page">
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2">
          <Link to={path('/exams')}>
            <ArrowLeftIcon />
            Exams
          </Link>
        </Button>
      </div>

      <PageHeader
        title={existing ? `Based on “${existing.name}”` : 'Build an exam'}
        description="Every setting here changes how the paper behaves while you sit it."
      />

      <Section title="Name">
        <div className="flex flex-col gap-tight">
          <Label htmlFor="exam-name" className="sr-only">
            Exam name
          </Label>
          <Input
            id="exam-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Mock paper, week 9"
          />
        </div>
      </Section>

      <Section
        title="Sections"
        description="Each section has its own formats, topics and question count."
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSections((prev) => [...prev, blankSection(prev.length)])}
          >
            <PlusIcon />
            Add section
          </Button>
        }
      >
        <div className="flex flex-col gap-base">
          {sections.map((section, index) => {
            const problem = validation.sectionProblems[section.id];
            const availableCount = selectQuestions(pool, {
              formats: section.formats,
              ...(section.topicIds.length ? { topicIds: section.topicIds } : {}),
            }).length;

            return (
              <Card key={section.id} className={problem ? 'border-destructive/50' : undefined}>
                <CardContent className="flex flex-col gap-base">
                  <div className="flex items-start gap-tight">
                    <div className="flex min-w-0 flex-1 flex-col gap-tight">
                      <Label htmlFor={`sec-title-${section.id}`}>Section title</Label>
                      <Input
                        id={`sec-title-${section.id}`}
                        value={section.title}
                        onChange={(e) =>
                          updateSection(section.id, { title: e.target.value })
                        }
                      />
                    </div>
                    {sections.length > 1 && (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="mt-6"
                        aria-label={`Remove ${section.title}`}
                        onClick={() =>
                          setSections((prev) => prev.filter((s) => s.id !== section.id))
                        }
                      >
                        <Trash2Icon />
                      </Button>
                    )}
                  </div>

                  <div className="flex flex-col gap-tight">
                    <Label htmlFor={`sec-inst-${section.id}`}>Instructions</Label>
                    <Textarea
                      id={`sec-inst-${section.id}`}
                      rows={2}
                      value={section.instructions}
                      onChange={(e) =>
                        updateSection(section.id, { instructions: e.target.value })
                      }
                    />
                  </div>

                  <fieldset className="flex flex-col gap-tight">
                    <legend className="mb-tight text-sm font-medium">
                      Question formats
                    </legend>
                    <div className="flex flex-wrap gap-tight">
                      {ALL_FORMATS.map((format) => (
                        <label
                          key={format}
                          className="flex items-center gap-tight rounded-md border px-snug py-1 text-xs"
                        >
                          <Checkbox
                            checked={section.formats.includes(format)}
                            onCheckedChange={(checked) =>
                              updateSection(section.id, {
                                formats: checked
                                  ? [...section.formats, format]
                                  : section.formats.filter((f) => f !== format),
                              })
                            }
                          />
                          {FORMAT_LABEL[format]}
                        </label>
                      ))}
                    </div>
                  </fieldset>

                  <fieldset className="flex flex-col gap-tight">
                    <legend className="mb-tight text-sm font-medium">
                      Topics{' '}
                      <span className="text-muted-foreground font-normal">
                        (none selected means all)
                      </span>
                    </legend>
                    <div className="flex flex-wrap gap-tight">
                      {topics.map((topic) => (
                        <label
                          key={topic.id}
                          className="flex items-center gap-tight rounded-md border px-snug py-1 text-xs"
                        >
                          <Checkbox
                            checked={section.topicIds.includes(topic.id)}
                            onCheckedChange={(checked) =>
                              updateSection(section.id, {
                                topicIds: checked
                                  ? [...section.topicIds, topic.id]
                                  : section.topicIds.filter((t) => t !== topic.id),
                              })
                            }
                          />
                          {topic.title}
                        </label>
                      ))}
                    </div>
                  </fieldset>

                  <div className="grid gap-base sm:grid-cols-2">
                    <div className="flex flex-col gap-tight">
                      <Label htmlFor={`sec-count-${section.id}`}>
                        Number of questions
                      </Label>
                      <div className="flex items-center gap-snug">
                        <Input
                          id={`sec-count-${section.id}`}
                          type="number"
                          min={1}
                          value={section.count}
                          onChange={(e) =>
                            updateSection(section.id, {
                              count: Math.max(1, Number(e.target.value) || 1),
                            })
                          }
                          className="w-24 font-mono tabular-nums"
                        />
                        <span className="text-muted-foreground text-xs">
                          {availableCount} available
                        </span>
                      </div>
                    </div>

                    {timing === 'per-section' && (
                      <div className="flex flex-col gap-tight">
                        <Label htmlFor={`sec-mins-${section.id}`}>
                          Minutes for this section
                        </Label>
                        <Input
                          id={`sec-mins-${section.id}`}
                          type="number"
                          min={1}
                          value={section.minutes}
                          onChange={(e) =>
                            updateSection(section.id, {
                              minutes: Math.max(1, Number(e.target.value) || 1),
                            })
                          }
                          className="w-24 font-mono tabular-nums"
                        />
                      </div>
                    )}
                  </div>

                  {problem && (
                    <Alert variant="destructive">
                      <AlertTriangleIcon />
                      <AlertDescription>{problem}</AlertDescription>
                    </Alert>
                  )}

                  <span className="text-muted-foreground text-xs">
                    Section {index + 1} of {sections.length}
                  </span>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </Section>

      <Section title="Timing">
        <div className="flex flex-col gap-base">
          <div className="flex flex-col gap-tight">
            <Label htmlFor="exam-timing">How it is timed</Label>
            <Select
              id="exam-timing"
              value={timing}
              onChange={(e) => setTiming(e.target.value as TimingMode)}
            >
              <option value="overall">One timer for the whole paper</option>
              <option value="per-section">A timer per section</option>
              <option value="untimed">Untimed rehearsal</option>
            </Select>
            <p className="text-muted-foreground text-xs">
              {timing === 'per-section'
                ? 'When a section’s time runs out it is submitted and you move to the next. You cannot return to it.'
                : timing === 'overall'
                  ? 'When the paper’s time runs out everything is submitted as it stands.'
                  : 'No timer. Useful for rehearsing structure rather than speed.'}
            </p>
          </div>

          {timing === 'overall' && (
            <div className="flex flex-col gap-tight">
              <Label htmlFor="exam-minutes">Total minutes</Label>
              <Input
                id="exam-minutes"
                type="number"
                min={1}
                value={totalMinutes}
                onChange={(e) =>
                  setTotalMinutes(Math.max(1, Number(e.target.value) || 1))
                }
                className="w-28 font-mono tabular-nums"
              />
              <p className="text-muted-foreground text-xs">
                Set this to 1 or 2 to check the expiry behaviour quickly.
              </p>
            </div>
          )}

          {timing !== 'untimed' && (
            <div className="flex flex-col gap-tight">
              <Label htmlFor="exam-extra">Extra time allowance</Label>
              <Select
                id="exam-extra"
                value={String(extraTimePercent)}
                onChange={(e) => setExtraTime(Number(e.target.value))}
              >
                {[0, 10, 25, 50, 100].map((percent) => (
                  <option key={percent} value={percent}>
                    {percent === 0 ? 'None' : `+${percent}%`}
                  </option>
                ))}
              </Select>
              {extraTimePercent > 0 && (
                <p className="text-muted-foreground text-xs">
                  Whichever timer is running gets {extraTimePercent}% longer.
                </p>
              )}
            </div>
          )}
        </div>
      </Section>

      <Section title="Resources">
        <div className="flex flex-col gap-base">
          <div className="flex flex-col gap-tight">
            <Label htmlFor="exam-book">Open or closed book</Label>
            <Select
              id="exam-book"
              value={book}
              onChange={(e) => setBook(e.target.value as BookMode)}
            >
              <option value="closed">Closed book, no materials</option>
              <option value="open">Open book, chosen materials available</option>
            </Select>
          </div>

          {book === 'open' && materials.length > 0 && (
            <fieldset className="flex flex-col gap-tight">
              <legend className="mb-tight text-sm font-medium">
                Materials you may consult
              </legend>
              <div className="flex flex-wrap gap-tight">
                {materials.map((material) => (
                  <label
                    key={material.id}
                    className="flex items-center gap-tight rounded-md border px-snug py-1 text-xs"
                  >
                    <Checkbox
                      checked={allowedMaterialIds.includes(material.id)}
                      onCheckedChange={(checked) =>
                        setAllowed((prev) =>
                          checked
                            ? [...prev, material.id]
                            : prev.filter((id) => id !== material.id),
                        )
                      }
                    />
                    <span className="max-w-40 truncate">{material.title}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          )}

          {/*
            There is no tutor-assistance setting any more. An exam offers no
            hints, no explanations and no correctness indicators, which is what
            makes its results independent evidence, so it is the absence of a
            capability rather than a switch that happens to be off. Assisted
            practice with hints is still available, and it lives in Practice, where
            it is recorded as practice.
          */}
          <Alert>
            <AlertTitle>What these restrictions actually do</AlertTitle>
            <AlertDescription>
              They control what this prototype shows you inside the exam screen.
              Nothing is marked and no feedback appears until you submit the whole
              paper. There is no proctoring, no browser lockdown and nothing stopping
              you opening your notes in another tab. It is a rehearsal, not a
              secured assessment.
            </AlertDescription>
          </Alert>
        </div>
      </Section>

      <Section title="Navigation and submission">
        <div className="flex flex-col gap-base">
          <div className="flex flex-col gap-tight">
            <Label htmlFor="exam-nav">Moving between questions</Label>
            <Select
              id="exam-nav"
              value={navigation}
              onChange={(e) => setNavigation(e.target.value as NavigationMode)}
            >
              <option value="free">Free: jump to any question, go back</option>
              <option value="sequential">
                Sequential: forward only, no backtracking
              </option>
            </Select>
          </div>

          <label className="flex items-start gap-snug rounded-lg border p-snug">
            <Checkbox
              className="mt-0.5"
              checked={flaggingEnabled}
              onCheckedChange={(checked) => setFlagging(!!checked)}
            />
            <div className="flex flex-col gap-hairline">
              <span className="text-sm font-medium">Allow flagging</span>
              <span className="text-muted-foreground text-xs leading-relaxed">
                Mark a question to come back to. Flags are shown in the question
                map and listed before you submit.
              </span>
            </div>
          </label>

          <label className="flex items-start gap-snug rounded-lg border p-snug">
            <Checkbox
              className="mt-0.5"
              checked={lockSectionsOnFinish}
              onCheckedChange={(checked) => setLockSections(!!checked)}
            />
            <div className="flex flex-col gap-hairline">
              <span className="text-sm font-medium">
                Finishing a section locks its answers
              </span>
              <span className="text-muted-foreground text-xs leading-relaxed">
                With this on, pressing “Finish section” fixes that section’s answers
                so you can still read them but not change them, and you are asked to
                confirm before it happens. With it off, every section stays open
                until you submit the paper. Either way, nothing is marked until the
                whole paper is submitted.
              </span>
            </div>
          </label>

          {/*
            The combination worth naming. Free navigation and locking are not
            contradictory, because you move freely until you choose to finish something
            but the interaction is where a student is most likely to lose work
            they thought was safe, so it is spelled out rather than left implied.
          */}
          {lockSectionsOnFinish && navigation === 'free' && (
            <p className="text-muted-foreground text-xs leading-relaxed">
              You can still move between sections freely. Locking only happens when
              you press “Finish section”, and you will be warned first.
            </p>
          )}

          {timing === 'per-section' && (
            <p className="text-muted-foreground text-xs leading-relaxed">
              With per-section timing, each section’s clock starts when you first
              open it and keeps running whether or not you are looking at it. When it
              expires that section locks, and returning to it later does not restart it,
              and reloading the page does not grant more time.
            </p>
          )}

          <div className="flex flex-col gap-tight">
            <Label>Feedback</Label>
            <p className="text-muted-foreground text-xs leading-relaxed">
              Marks, rubrics, explanations and topic gaps are released after the whole
              paper is submitted, always, and not configurably. Releasing them
              section by section would mean answering later questions already knowing
              how the earlier ones went, which is not what an exam measures.
            </p>
          </div>
        </div>
      </Section>

      {validation.problems.length > 0 && (
        <Alert variant="destructive">
          <AlertTriangleIcon />
          <AlertTitle>This configuration will not work</AlertTitle>
          <AlertDescription>
            <ul className="mt-tight flex list-disc flex-col gap-hairline pl-4">
              {validation.problems.map((problem) => (
                <li key={problem}>{problem}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {validation.warnings.length > 0 && (
        <Alert>
          <AlertTriangleIcon />
          <AlertTitle>Worth knowing</AlertTitle>
          <AlertDescription>
            <ul className="mt-tight flex list-disc flex-col gap-hairline pl-4">
              {validation.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      <Card className="bg-muted/30">
        <CardContent className="flex flex-wrap items-center gap-snug text-sm">
          <Badge variant="secondary" className="font-mono tabular-nums">
            {sections.length} {sections.length === 1 ? 'section' : 'sections'}
          </Badge>
          <Badge variant="secondary" className="font-mono tabular-nums">
            {sections.reduce((sum, s) => sum + s.count, 0)} questions
          </Badge>
          <Badge variant="secondary" className="font-mono tabular-nums">
            {totalMarks} marks
          </Badge>
          <Separator orientation="vertical" className="h-4" />
          <span className="text-muted-foreground text-xs">
            {timing === 'untimed'
              ? 'Untimed'
              : timing === 'overall'
                ? `${Math.round(totalMinutes * (1 + extraTimePercent / 100))} minutes total`
                : `${Math.round(sections.reduce((sum, s) => sum + s.minutes, 0) * (1 + extraTimePercent / 100))} minutes across sections`}
            {' · '}
            {book === 'open' ? 'open book' : 'closed book'}
            {' · '}
            {navigation === 'free' ? 'free navigation' : 'sequential'}
          </span>
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-tight">
        <Button onClick={start} disabled={validation.problems.length > 0}>
          <PlayIcon />
          Start this exam
        </Button>
        <Button
          variant="outline"
          onClick={save}
          disabled={!name.trim()}
        >
          <SaveIcon />
          Save without starting
        </Button>
      </div>
    </Page>
  );
}
