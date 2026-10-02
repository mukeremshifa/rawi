import { useDraftState } from '@/store/drafts';
import { useLocation } from 'react-router-dom';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { AlertTriangleIcon, ArrowLeftIcon, SparklesIcon } from 'lucide-react';
import { toast } from '@/lib/toast';

import type {
  ActivityType,
  Difficulty,
  FeedbackTiming,
  PracticeConfig,
  Question,
  QuestionFormat,
  SavedPracticeSet,
} from '@shared/types.ts';
import { AI_LIMITS, type GeneratedFormat, type GeneratedQuestion } from '@shared/ai.ts';
import { isUsableMaterial, selectPassages, toAiTopic } from '@shared/ai-context.ts';

import { Page, PageHeader, Section } from '@/components/layout';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { DIFFICULTY_BLURB, DIFFICULTY_LABEL } from '@/components/domain';
import { useStore } from '@/store/store';
import { useCourse, useCoursePath } from '@/store/course-context';
import {
  ACTIVITY_FORMATS,
  selectQuestions,
  useMaterials,
  useQuestions,
  useTopics,
} from '@/store/selectors';
import { newId } from '@/lib/id';
import { AiRequestError, generateQuestions, useAiStatus } from '@/lib/ai';

/**
 * Setting up and generating a practice set.
 *
 * ── The flow, and why Save is gone ────────────────────────────────────────
 *
 * Title → settings → **Generate** → a saved set you are taken to. There is no
 * separate Save button, because the previous Start/Save split asked the student
 * to understand a distinction that did nothing for them: a set they had
 * "started" but not "saved" vanished when they navigated away, and a set they
 * had saved was a configuration rather than the questions they had just seen.
 *
 * Generation now produces a durable, named object with resolved content, and
 * that is the only thing it produces. Starting an attempt is a separate action
 * taken *on* the set, which is what makes "another attempt at the same set"
 * meaningful.
 *
 * ── Why generation cannot run twice ───────────────────────────────────────
 *
 * `generating` is a ref set synchronously, not state. A second click in the
 * same tick — a double-press, an impatient double-tap — sees the ref already
 * true and returns. State would not have updated yet at that point, which is
 * precisely the window in which duplicates are created.
 *
 * ── Two sources of questions ─────────────────────────────────────────────
 *
 * A set is drawn either from the course's question bank or written by the
 * model from the course's readable material. Generated questions are checked
 * twice, by the server and again here for course ownership and source ids,
 * then saved together with the set in one store action. After that they are
 * ordinary saved questions: opening the set or starting another attempt uses
 * them as stored and never generates again.
 *
 * ── Every control must change something ───────────────────────────────────
 *
 * The screen recomputes the matching question count on every change and shows
 * it live. That is the mechanism that makes the constraint *visible*: pick
 * "stretch" on a topic with two stretch questions and the length control caps
 * at two and says why.
 */

const ACTIVITY_LABEL: Record<ActivityType, string> = {
  flashcards: 'Flashcards',
  quiz: 'Quiz',
  'written-recall': 'Written recall',
  'source-analysis': 'Source analysis',
  essay: 'Essay practice',
};

const ACTIVITY_BLURB: Record<ActivityType, string> = {
  flashcards: 'Reveal, rate your own recall, and come back to the hard ones.',
  quiz: 'Multiple choice and select, matching, ordering and fill-in-the-blank.',
  'written-recall': 'Explain an idea or summarise an argument from memory.',
  'source-analysis':
    'Identify claims, evidence, perspective and limitations in an extract.',
  essay: 'Develop a thesis, plan an answer, or write a full response.',
};

const ALL_DIFFICULTIES: Difficulty[] = ['recall', 'reasoning', 'stretch'];

/** The activities the model can write, and the format each one produces. */
const AI_FORMAT: Partial<Record<ActivityType, GeneratedFormat>> = {
  flashcards: 'flashcard',
  quiz: 'multiple-choice',
  'written-recall': 'written-recall',
};

/**
 * Turns validated output into saved questions. Anything that names a topic
 * outside the selection or a passage that was not sent is dropped here,
 * whatever the server said, because this is the last check before storage.
 */
function toQuestions(
  generated: GeneratedQuestion[],
  params: {
    courseId: string;
    format: GeneratedFormat;
    topicIds: Set<string>;
    passages: Map<string, { materialId: string }>;
    model: string;
  },
): Question[] {
  const now = new Date().toISOString();
  const out: Question[] = [];
  for (const g of generated) {
    const passage = params.passages.get(g.sourcePassageId);
    if (!passage || !params.topicIds.has(g.topicId)) continue;
    const id = newId('q-gen');
    const base = {
      id,
      courseId: params.courseId,
      format: params.format as QuestionFormat,
      topicId: g.topicId,
      difficulty: g.difficulty,
      prompt: g.prompt,
      answer: g.answer,
      explanation: g.explanation,
      source: { materialId: passage.materialId, passageId: g.sourcePassageId },
      provenance: {
        kind: 'generated' as const,
        model: params.model,
        generatedAt: now,
        materialIds: [passage.materialId],
      },
    };
    if (params.format === 'multiple-choice') {
      const options = g.options ?? [];
      const index = g.correctIndex ?? -1;
      if (options.length < 2 || index < 0 || index >= options.length) continue;
      out.push({ ...base, marks: 1, options, correctIndices: [index] });
    } else if (params.format === 'written-recall') {
      const rubric = (g.rubric ?? []).map((r, i) => ({
        id: `${id}-r${i + 1}`,
        label: r.label,
        marks: r.marks,
        keywords: [],
        missedAdvice: r.missedAdvice,
      }));
      const marks = rubric.reduce((sum, r) => sum + r.marks, 0);
      if (rubric.length === 0 || marks <= 0) continue;
      out.push({ ...base, marks, rubric });
    } else {
      out.push({ ...base, marks: 1 });
    }
  }
  return out;
}

export function PracticeSetupPage() {
  const draftLocation = useLocation();
  const draftPrefix = `form:${draftLocation.pathname}${draftLocation.search}:`;
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { state, dispatch } = useStore();
  const course = useCourse();
  const path = useCoursePath();
  const topics = useTopics();
  const materials = useMaterials();
  const pool = useQuestions();

  /* Preselection from a link — a passage action, a plan suggestion, a planner
     session, a tutor hand-off, or a retry of a specific mistake. */
  const presetTopics = (params.get('topic') ?? '')
    .split(',')
    .map((t) => t.trim())
    .filter(id => topics.some(t => t.id === id));
  const presetMaterial = params.get('material');
  const presetActivity = params.get('activity') as ActivityType | null;
  const retryAttemptId = params.get('retry');
  const sessionId = params.get('session') ?? undefined;
  const retryQuestionIds = (state.attempts.some(a => a.id === retryAttemptId && a.courseId === course.id) ? params.get('questions') ?? '' : '')
    .split(',')
    .map((q) => q.trim())
    .filter(Boolean);

  const [activity, setActivity] = useDraftState<ActivityType>(draftPrefix + "activity",
    presetActivity && presetActivity in ACTIVITY_FORMATS ? presetActivity : 'quiz',
  );
  const [topicIds, setTopicIds] = useDraftState<string[]>(draftPrefix + "topicIds",
    presetTopics.length > 0 ? presetTopics : topics.map((t) => t.id),
  );
  const [materialIds, setMaterialIds] = useDraftState<string[]>(draftPrefix + "materialIds",
    presetMaterial ? [presetMaterial] : [],
  );
  const [difficulties, setDifficulties] = useDraftState<Difficulty[]>(draftPrefix + "difficulties", ALL_DIFFICULTIES);
  const [length, setLength] = useDraftState(draftPrefix + "length", state.preferences.questionCount);
  const [hintsAllowed, setHintsAllowed] = useDraftState(draftPrefix + "hintsAllowed", state.preferences.hints);
  const [feedback, setFeedback] = useDraftState<FeedbackTiming>(draftPrefix + "feedback", state.preferences.feedback);
  const [title, setTitle] = useDraftState(draftPrefix + "title", '');
  const [titleTouched, setTitleTouched] = useState(false);
  const [generating, setGenerating] = useState(false);
  const generatingRef = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; aiController.current?.abort(); }; }, []);
  const aiController = useRef<AbortController | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const { unavailable } = useAiStatus();

  /* Until the student picks a source, the bank is used when it has questions
     for the chosen activity and topics, and otherwise, where there is
     readable material, the model writes them. */
  const usableMaterials = useMemo(() => materials.filter(isUsableMaterial), [materials]);
  const [sourceChoice, setSource] = useDraftState<'bank' | 'ai' | null>(draftPrefix + "sourceChoice", params.get('source') === 'bank' ? 'bank' : null);
  const bankHasMatches = useMemo(
    () =>
      selectQuestions(pool, {
        topicIds: topicIds.length > 0 ? topicIds : topics.map((t) => t.id),
        formats: ACTIVITY_FORMATS[activity],
      }).length > 0,
    [pool, topicIds, topics, activity],
  );
  const source: 'bank' | 'ai' =
    sourceChoice ??
    (!bankHasMatches && usableMaterials.length > 0 && AI_FORMAT[activity] ? 'ai' : 'bank');
  const ai = source === 'ai' && retryQuestionIds.length === 0;
  const aiLength = Math.min(Math.max(1, length), AI_LIMITS.maxQuestionsPerRequest);

  /** The passages a generation would send, chosen by topic and selection. */
  const aiPassages = useMemo(() => {
    if (!ai || topicIds.length === 0) return [];
    const selectedTopics = topics.filter((t) => topicIds.includes(t.id));
    const scope =
      materialIds.length > 0
        ? usableMaterials.filter((m) => materialIds.includes(m.id))
        : usableMaterials;
    return selectPassages({
      courseId: course.id,
      materials: scope,
      topicIds,
      query: selectedTopics.map((t) => `${t.title} ${t.summary}`).join(' '),
      maxPassages: 16,
      maxChars: 24000,
    });
  }, [ai, topicIds, topics, materialIds, usableMaterials, course.id]);

  const filter = useMemo(
    () => ({
      topicIds,
      formats: ACTIVITY_FORMATS[activity],
      difficulties,
      ...(materialIds.length > 0 ? { materialIds } : {}),
    }),
    [topicIds, activity, difficulties, materialIds],
  );

  /*
   * `selectQuestions` treats an empty topic list as "no topic filter", which is
   * what exam sections want — a section with no topics selected draws from the
   * whole course. Here it means the opposite: the student has deselected
   * everything and has chosen nothing. Resolving that difference at the call
   * site keeps the shared selector's convention intact while letting this
   * screen say "select at least one topic" instead of silently offering all of
   * them.
   */
  const nothingSelected = topicIds.length === 0 || difficulties.length === 0;

  const available = useMemo(
    () =>
      retryQuestionIds.length > 0
        ? pool.filter((q) => retryQuestionIds.includes(q.id))
        : nothingSelected
          ? []
          : selectQuestions(pool, filter),
    [pool, filter, retryQuestionIds, nothingSelected],
  );

  const effectiveLength = Math.min(length, available.length);
  const capped = length > available.length && available.length > 0;

  /** Exactly the questions a Generate would resolve, so the summary agrees. */
  const chosen = useMemo(
    () =>
      retryQuestionIds.length > 0
        ? available
        : nothingSelected
          ? []
          : selectQuestions(pool, filter, effectiveLength),
    [pool, filter, effectiveLength, retryQuestionIds, available, nothingSelected],
  );

  const trimmedTitle = title.trim();
  const titleError = !trimmedTitle
    ? 'Give this set a name, so you can find it again.'
    : null;
  const canGenerate = ai
    ? aiPassages.length > 0 &&
      topicIds.length > 0 &&
      difficulties.length > 0 &&
      !!AI_FORMAT[activity] &&
      !titleError &&
      !generating &&
      !unavailable
    : chosen.length > 0 && !titleError && !generating;

  /**
   * Asks the model for questions, validates them again, and saves the set
   * with its questions in one action. A failure or a cancel saves nothing and
   * leaves every setting as it was, so trying again is one click.
   */
  const generateWithAi = async () => {
    const format = AI_FORMAT[activity];
    if (!format || generatingRef.current) return;
    if (!trimmedTitle) {
      setTitleTouched(true);
      return;
    }
    generatingRef.current = true;
    setGenerating(true);
    setAiError(null);
    const controller = new AbortController();
    aiController.current = controller;
    const selectedTopics = topics.filter(
      (t) => topicIds.includes(t.id) && t.courseId === course.id,
    );
    try {
      const response = await generateQuestions(
        {
          courseId: course.id,
          courseName: course.name,
          format,
          count: aiLength,
          difficulties,
          topics: selectedTopics.map(toAiTopic),
          passages: aiPassages,
        },
        controller.signal,
      );
      const questions = toQuestions(response.questions, {
        courseId: course.id,
        format,
        topicIds: new Set(selectedTopics.map((t) => t.id)),
        passages: new Map(aiPassages.map((p) => [p.id, { materialId: p.materialId }])),
        model: response.usage.model,
      });
      if (questions.length === 0) {
        throw new AiRequestError(
          'invalid-output',
          'None of the generated questions passed the checks, so nothing was saved. Try again.',
        );
      }
      const set: SavedPracticeSet = {
        id: newId('set'),
        courseId: course.id,
        name: trimmedTitle,
      fromTutorId: state.tutorSessions.find(s => s.id === params.get('from') && s.courseId === course.id)?.id,
      fromAttemptId: retryAttemptId ?? undefined,

        config: {
          activity,
          topicIds,
          materialIds,
          length: questions.length,
          difficulties,
          hintsAllowed,
          feedback,
        },
        questionIds: questions.map((q) => q.id),
        savedAt: new Date().toISOString(),
      };
      if (!mounted.current || controller.signal.aborted) return;
      dispatch({ type: 'clear-draft', prefix: draftPrefix });
      dispatch({ type: 'save-generated-set', questions, set });
      toast.success('Set generated', {
        description: `${questions.length} ${
          questions.length === 1 ? 'question' : 'questions'
        } written by ${response.usage.model}, saved as “${set.name}”.${
          questions.length < aiLength
            ? ` ${aiLength - questions.length} did not pass the checks and were left out.`
            : ''
        }`,
      });
      navigate(
        `${path(`/practice/set/${set.id}`)}${sessionId ? `?session=${sessionId}` : ''}`,
        { replace: true },
      );
    } catch (error) {
      setAiError(
        error instanceof AiRequestError
          ? error.code === 'cancelled'
            ? 'Generation was cancelled. Nothing was saved.'
            : `${error.message}`
          : 'Generation failed. Nothing was saved.',
      );
      generatingRef.current = false;
      setGenerating(false);
    } finally {
      aiController.current = null;
    }
  };

  /**
   * Generates the set, saves it once, and opens it.
   *
   * The delay is cosmetic and the copy says so — it is there because a
   * generation that completes in zero milliseconds reads as though nothing
   * happened. What it must not do is claim success without content, so the
   * empty case is checked before anything is written.
   */
  const generate = () => {
    if (ai) {
      void generateWithAi();
      return;
    }
    if (generatingRef.current) return;
    if (!trimmedTitle) {
      setTitleTouched(true);
      return;
    }
    if (chosen.length === 0) return;

    generatingRef.current = true;
    setGenerating(true);

    const config: PracticeConfig = {
      activity,
      topicIds,
      materialIds,
      length: chosen.length,
      difficulties,
      hintsAllowed,
      feedback,
    };

    const set: SavedPracticeSet = {
      id: newId('set'),
      courseId: course.id,
      name: trimmedTitle,
      fromTutorId: state.tutorSessions.find(s => s.id === params.get('from') && s.courseId === course.id)?.id,
      fromAttemptId: state.attempts.find(a => a.id === retryAttemptId && a.courseId === course.id)?.id,
      config,
      questionIds: chosen.map((q) => q.id),
      savedAt: new Date().toISOString(),
    };

    (() => {
      dispatch({ type: 'clear-draft', prefix: draftPrefix });
      dispatch({ type: 'save-practice', set });
      toast.success('Set generated', {
        description: `${set.questionIds.length} ${
          set.questionIds.length === 1 ? 'question' : 'questions'
        }, saved as “${set.name}”.`,
      });
      navigate(
        `${path(`/practice/set/${set.id}`)}${
          retryAttemptId || sessionId ? `?${new URLSearchParams({ ...(retryAttemptId ? { retry: retryAttemptId } : {}), ...(sessionId ? { session: sessionId } : {}) }).toString()}` : ''
        }`,
        { replace: true },
      );
    })();
  };

  const written = activity !== 'flashcards' && activity !== 'quiz';

  return (
    <Page width="prose" className="pb-page">
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2">
          <Link to={path('/practice')}>
            <ArrowLeftIcon />
            Practice
          </Link>
        </Button>
      </div>

      {params.get('from') && state.tutorSessions.some(s => s.id === params.get('from') && s.courseId === course.id) && <Alert><AlertTitle>Practice from your tutor session</AlertTitle><AlertDescription><Link className="underline" to={path(`/tutor/${params.get('from')}`)}>Return to the originating conversation</Link>. This set retains that link.</AlertDescription></Alert>}
      <PageHeader
        title={retryQuestionIds.length > 0 ? 'Retry these questions' : 'New practice set'}
        description={
          retryQuestionIds.length > 0
            ? 'The questions you got wrong, in the same formats. Generating saves them as a set you can come back to.'
            : 'Name it, choose what it draws on, and generate. The set is saved automatically.'
        }
      />

      <Section title="Name">
        <div className="flex flex-col gap-tight">
          <Label htmlFor="practice-title">
            Set name <span className="text-destructive">*</span>
          </Label>
          <Input
            id="practice-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => setTitleTouched(true)}
            placeholder="Week 3 problem set"
            aria-invalid={titleTouched && !!titleError}
            aria-describedby={titleError ? 'practice-title-error' : undefined}
          />
          {titleTouched && titleError && (
            <p id="practice-title-error" className="text-destructive text-xs">
              {titleError}
            </p>
          )}
        </div>
      </Section>

      {retryQuestionIds.length > 0 ? (
        <Alert>
          <AlertTitle>{available.length} questions to retry</AlertTitle>
          <AlertDescription>
            Drawn from the attempt you came from. Hints are on and feedback is
            immediate, because this is remediation rather than assessment.
          </AlertDescription>
        </Alert>
      ) : (
        <>
          <Section
            title="Questions from"
            description={
              ai
                ? 'The model writes new questions from this course’s readable material. They are checked and saved with the set, so later attempts reuse them.'
                : 'Questions already in this course’s bank.'
            }
          >
            <div className="grid gap-tight sm:grid-cols-2">
              {(
                [
                  ['bank', 'Question bank', `${pool.length} questions in this course.`],
                  [
                    'ai',
                    'Generate from my materials',
                    usableMaterials.length > 0
                      ? `AI written, from ${usableMaterials.length} readable ${usableMaterials.length === 1 ? 'material' : 'materials'}.`
                      : 'Needs a readable material in this course first.',
                  ],
                ] as const
              ).map(([value, label, blurb]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => {
                    setSource(value);
                  }}
                  disabled={value === 'ai' && usableMaterials.length === 0}
                  aria-pressed={source === value}
                  className={`focus-visible:ring-ring flex flex-col gap-hairline rounded-lg border p-snug text-left outline-none transition-colors focus-visible:ring-2 disabled:opacity-50 ${
                    source === value ? 'border-primary bg-primary/5' : 'hover:bg-accent/50'
                  }`}
                >
                  <span className="text-sm font-medium">{label}</span>
                  <span className="text-muted-foreground text-xs leading-relaxed">{blurb}</span>
                </button>
              ))}
            </div>
          </Section>

          <Section title="Activity">
            <div className="grid gap-tight sm:grid-cols-2">
              {(Object.keys(ACTIVITY_FORMATS) as ActivityType[])
                .map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setActivity(type)}
                  aria-pressed={activity === type}
                  className={`focus-visible:ring-ring flex flex-col gap-hairline rounded-lg border p-snug text-left outline-none transition-colors focus-visible:ring-2 ${
                    activity === type
                      ? 'border-primary bg-primary/5'
                      : 'hover:bg-accent/50'
                  }`}
                >
                  <span className="text-sm font-medium">
                    {ai && type === 'quiz' ? 'Multiple choice' : ACTIVITY_LABEL[type]}
                  </span>
                  <span className="text-muted-foreground text-xs leading-relaxed">
                    {ai && type === 'quiz'
                      ? 'One correct option each, checked exactly.'
                      : ACTIVITY_BLURB[type]}
                  </span>
                  {ai && !AI_FORMAT[type] && <span className="text-xs text-muted-foreground">Question bank only</span>}
                </button>
              ))}
            </div>
          </Section>

          <Section
            title="Topics"
            actions={
              <div className="flex gap-tight">
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={() => setTopicIds(topics.map((t) => t.id))}
                >
                  All
                </Button>
                <Button variant="ghost" size="xs" onClick={() => setTopicIds([])}>
                  None
                </Button>
              </div>
            }
          >
            <div className="flex flex-wrap gap-tight">
              {topics.map((topic) => {
                const count = selectQuestions(pool, {
                  topicIds: [topic.id],
                  formats: ACTIVITY_FORMATS[activity],
                  difficulties,
                }).length;
                return (
                  <label
                    key={topic.id}
                    className={`flex items-center gap-tight rounded-md border px-snug py-1.5 text-sm ${
                      count === 0 ? 'opacity-50' : ''
                    }`}
                  >
                    <Checkbox
                      checked={topicIds.includes(topic.id)}
                      onCheckedChange={(checked) =>
                        setTopicIds((prev) =>
                          checked
                            ? [...prev, topic.id]
                            : prev.filter((id) => id !== topic.id),
                        )
                      }
                    />
                    {topic.title}
                    {!ai && (
                      <Badge variant="secondary" className="font-mono tabular-nums">
                        {count}
                      </Badge>
                    )}
                  </label>
                );
              })}
            </div>
            {!ai &&
              topics.some((t) => selectQuestions(pool, { topicIds: [t.id] }).length === 0) && (
                <p className="text-muted-foreground text-xs leading-relaxed">
                  Topics showing zero have no questions in the bank. Choose Generate from
                  my materials to have questions written for them.
                </p>
              )}
          </Section>

          {materials.length > 0 && (
            <Section
              title={ai ? 'Generate from' : 'Limit to materials'}
              description={
                ai
                  ? 'Optional. Leave all unticked to use every readable material that relates to the topics.'
                  : 'Optional. Only questions citing one of these will be used.'
              }
            >
              <div className="flex flex-wrap gap-tight">
                {(ai ? usableMaterials : materials).map((material) => (
                  <label
                    key={material.id}
                    className="flex items-center gap-tight rounded-md border px-snug py-1.5 text-sm"
                  >
                    <Checkbox
                      checked={materialIds.includes(material.id)}
                      onCheckedChange={(checked) =>
                        setMaterialIds((prev) =>
                          checked
                            ? [...prev, material.id]
                            : prev.filter((id) => id !== material.id),
                        )
                      }
                    />
                    <span className="max-w-48 truncate">{material.title}</span>
                  </label>
                ))}
              </div>
            </Section>
          )}

          <Section title="Difficulty">
            <div className="flex flex-col gap-tight">
              {ALL_DIFFICULTIES.map((level) => {
                const count = selectQuestions(pool, {
                  topicIds,
                  formats: ACTIVITY_FORMATS[activity],
                  difficulties: [level],
                }).length;
                return (
                  <label
                    key={level}
                    className="flex items-start gap-snug rounded-lg border p-snug"
                  >
                    <Checkbox
                      className="mt-0.5"
                      checked={difficulties.includes(level)}
                      onCheckedChange={(checked) =>
                        setDifficulties((prev) =>
                          checked ? [...prev, level] : prev.filter((d) => d !== level),
                        )
                      }
                    />
                    <div className="flex flex-1 flex-col gap-hairline">
                      <span className="text-sm font-medium">
                        {DIFFICULTY_LABEL[level]}
                      </span>
                      <span className="text-muted-foreground text-xs leading-relaxed">
                        {DIFFICULTY_BLURB[level]}
                      </span>
                    </div>
                    {!ai && (
                      <Badge variant="secondary" className="font-mono tabular-nums">
                        {count}
                      </Badge>
                    )}
                  </label>
                );
              })}
            </div>
          </Section>
        </>
      )}

      {ai && !AI_FORMAT[activity] && <Alert><AlertTitle>AI generation does not support this activity</AlertTitle><AlertDescription>Generation supports flashcards, multiple choice and written recall. Choose Question bank to keep this activity, or select a supported format.</AlertDescription></Alert>}
      <Section title="Session">
        <div className="flex flex-col gap-base">
          {retryQuestionIds.length === 0 && (
            <div className="flex flex-col gap-tight">
              <Label htmlFor="practice-length">Number of questions</Label>
              <div className="flex items-center gap-snug">
                <Input
                  id="practice-length"
                  type="number"
                  min={1}
                  max={ai ? AI_LIMITS.maxQuestionsPerRequest : Math.max(1, available.length)}
                  value={length}
                  onChange={(e) => setLength(Math.max(1, Number(e.target.value) || 1))}
                  className="w-24 font-mono tabular-nums"
                />
                <span className="text-muted-foreground text-sm">
                  {ai
                    ? `up to ${AI_LIMITS.maxQuestionsPerRequest} per set`
                    : `of ${available.length} available`}
                </span>
              </div>
              {!ai && capped && (
                <p className="text-warning-text flex items-start gap-tight text-xs">
                  <AlertTriangleIcon className="mt-0.5 size-3 shrink-0" aria-hidden />
                  Only {available.length} questions match these settings, so the set
                  will have {available.length}. Add topics or difficulties to get more.
                </p>
              )}
            </div>
          )}

          {activity !== 'flashcards' && (
            <>
              <label className="flex items-start gap-snug rounded-lg border p-snug">
                <Checkbox
                  className="mt-0.5"
                  checked={hintsAllowed}
                  onCheckedChange={(checked) => setHintsAllowed(!!checked)}
                />
                <div className="flex flex-col gap-hairline">
                  <span className="text-sm font-medium">Allow hints</span>
                  <span className="text-muted-foreground text-xs leading-relaxed">
                    Hints do not reduce your marks. They are recorded, so this work
                    counts as practice rather than as independent evidence.
                  </span>
                </div>
              </label>

              <div className="flex flex-col gap-tight">
                <Label htmlFor="practice-feedback">Feedback</Label>
                <Select
                  id="practice-feedback"
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value as FeedbackTiming)}
                >
                  <option value="immediate">
                    After each question, to learn as you go
                  </option>
                  <option value="end">At the end, closer to exam conditions</option>
                </Select>
                {written && (
                  <p className="text-muted-foreground text-xs">
                    Written answers get AI feedback against their rubric. It reads for
                    meaning, and it is guidance rather than an official grade.
                  </p>
                )}
              </div>
            </>
          )}
        </div>
      </Section>

      {ai && unavailable && (
        <Alert variant="destructive">
          <AlertTriangleIcon />
          <AlertTitle>AI generation is not available</AlertTitle>
          <AlertDescription>{unavailable}</AlertDescription>
        </Alert>
      )}

      {ai && topicIds.length > 0 && aiPassages.length === 0 && (
        <Alert variant="destructive">
          <AlertTriangleIcon />
          <AlertTitle>No readable material for these topics</AlertTitle>
          <AlertDescription>
            Nothing in this course’s readable material relates to the selected topics.
            Link a reading to a topic, or add one, and try again. Files Rawi could not
            read are not used.
          </AlertDescription>
        </Alert>
      )}

      {aiError && (
        <Alert variant="destructive">
          <AlertTriangleIcon />
          <AlertTitle>No set was created</AlertTitle>
          <AlertDescription>{aiError}</AlertDescription>
        </Alert>
      )}

      {!ai && available.length === 0 && (
        <Alert variant="destructive">
          <AlertTriangleIcon />
          <AlertTitle>Nothing to generate from</AlertTitle>
          <AlertDescription>
            {topicIds.length === 0
              ? 'Select at least one topic.'
              : difficulties.length === 0
                ? 'Select at least one difficulty.'
                : `There are no ${ACTIVITY_LABEL[activity].toLowerCase()} questions in the bank for these topics at these difficulties. ${
                    usableMaterials.length > 0 && AI_FORMAT[activity]
                      ? 'Choose Generate from my materials above to have them written, or try a different activity.'
                      : 'Try a different activity, or widen the difficulty range.'
                  } No set will be created until there is something to put in it.`}
          </AlertDescription>
        </Alert>
      )}

      <div className="flex flex-wrap items-center gap-tight">
        <Button onClick={generate} disabled={!canGenerate}>
          <SparklesIcon />
          {generating
            ? 'Generating…'
            : `Generate ${(ai ? aiLength : effectiveLength) || ''} ${
                (ai ? aiLength : effectiveLength) === 1 ? 'question' : 'questions'
              }`}
        </Button>
        {generating && ai && (
          <Button variant="outline" onClick={() => aiController.current?.abort()}>
            Cancel
          </Button>
        )}
        {generating && (
          <span className="text-muted-foreground text-xs">
            {ai
              ? `Writing questions from ${aiPassages.length} ${aiPassages.length === 1 ? 'passage' : 'passages'}. This usually takes a few seconds.`
              : 'Selecting from the question bank.'}
          </span>
        )}
      </div>

      <Card className="bg-muted/30">
        <CardContent className="text-muted-foreground flex flex-col gap-hairline text-xs">
          <span className="text-foreground font-medium">What this will give you</span>
          {ai && !AI_FORMAT[activity] ? <span>This activity needs matching questions from the question bank. No AI set will be created.</span> : ai ? (
            <span>
              Up to {aiLength} new {ACTIVITY_LABEL[activity].toLowerCase()} questions written
              from {aiPassages.length} {aiPassages.length === 1 ? 'passage' : 'passages'} of your
              material, each checked and linked to its source, saved as a set you can attempt
              more than once. Questions that fail the checks are left out rather than saved.
            </span>
          ) : (
          <span>
            {effectiveLength} {ACTIVITY_LABEL[activity].toLowerCase()}{' '}
            {effectiveLength === 1 ? 'question' : 'questions'} worth{' '}
            {chosen.reduce((sum, q) => sum + q.marks, 0)} marks, across{' '}
            {new Set(chosen.map((q) => q.topicId)).size} topics, saved as a set you can
            attempt more than once. Results are recorded and will change your progress
            and today’s plan.
          </span>
          )}
        </CardContent>
      </Card>
    </Page>
  );
}
