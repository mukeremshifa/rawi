import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { AlertTriangleIcon, ArrowLeftIcon, PlayIcon, SaveIcon } from 'lucide-react';
import { toast } from 'sonner';

import type {
  ActivityType,
  Attempt,
  Difficulty,
  FeedbackTiming,
  PracticeConfig,
  QuestionFormat,
} from '@shared/types.ts';

import { Page, PageHeader, Section } from '@/components/layout';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { DIFFICULTY_BLURB, DIFFICULTY_LABEL } from '@/components/domain';
import { useStore } from '@/store/store';
import {
  selectQuestions,
  useMaterials,
  useQuestions,
  useTopics,
} from '@/store/selectors';
import { newId } from '@/lib/id';

/**
 * The shared practice setup.
 *
 * ── Every control must change something ───────────────────────────────────
 *
 * The brief is explicit that controls must not be decorative, so this screen
 * recomputes the matching question count on every change and shows it live.
 * That is not a nicety — it is the mechanism that makes the constraint
 * *visible*: pick "stretch" on a topic with two stretch questions and the
 * length control immediately caps at two and says why.
 *
 * ── Activity type decides the formats ─────────────────────────────────────
 *
 * The activity is the primary choice and the format filter follows from it,
 * rather than asking a student to tick nine format checkboxes. "Quiz" means the
 * five objective formats; the written activities each mean one. A student who
 * wants a specific format picks the activity that contains it.
 */

const ACTIVITY_FORMATS: Record<ActivityType, QuestionFormat[]> = {
  flashcards: ['flashcard'],
  quiz: [
    'multiple-choice',
    'multiple-select',
    'matching',
    'ordering',
    'fill-blank',
  ],
  'written-recall': ['written-recall'],
  'source-analysis': ['source-analysis'],
  essay: ['essay'],
};

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
  'source-analysis': 'Identify claims, evidence, perspective and limitations in an extract.',
  essay: 'Develop a thesis, plan an answer, or write a full response.',
};

const ALL_DIFFICULTIES: Difficulty[] = ['recall', 'reasoning', 'stretch'];

export function PracticeSetupPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { dispatch } = useStore();
  const topics = useTopics();
  const materials = useMaterials();
  const pool = useQuestions();

  /* Preselection from a link — a passage action, a plan suggestion, a tutor
     hand-off, or a retry of a specific mistake. */
  const presetTopics = (params.get('topic') ?? '')
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
  const presetMaterial = params.get('material');
  const presetActivity = params.get('activity') as ActivityType | null;
  const retryAttemptId = params.get('retry');
  const retryQuestionIds = (params.get('questions') ?? '')
    .split(',')
    .map((q) => q.trim())
    .filter(Boolean);

  const [activity, setActivity] = useState<ActivityType>(
    presetActivity && presetActivity in ACTIVITY_FORMATS ? presetActivity : 'quiz',
  );
  const [topicIds, setTopicIds] = useState<string[]>(
    presetTopics.length > 0 ? presetTopics : topics.map((t) => t.id),
  );
  const [materialIds, setMaterialIds] = useState<string[]>(
    presetMaterial ? [presetMaterial] : [],
  );
  const [difficulties, setDifficulties] = useState<Difficulty[]>(ALL_DIFFICULTIES);
  const [length, setLength] = useState(6);
  const [hintsAllowed, setHintsAllowed] = useState(true);
  const [feedback, setFeedback] = useState<FeedbackTiming>('immediate');
  const [setName, setSetName] = useState('');

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

  /** Exactly the questions a Start would run, so the summary cannot disagree. */
  const chosen = useMemo(
    () =>
      retryQuestionIds.length > 0
        ? available
        : nothingSelected
          ? []
          : selectQuestions(pool, filter, effectiveLength),
    [pool, filter, effectiveLength, retryQuestionIds, available, nothingSelected],
  );

  const start = () => {
    if (chosen.length === 0) return;

    const attempt: Attempt = {
      id: newId('att'),
      kind: 'practice',
      mode: activity === 'flashcards' ? 'self-rated' : 'practice',
      title:
        retryQuestionIds.length > 0
          ? `Retry — ${ACTIVITY_LABEL[activity]}`
          : `${ACTIVITY_LABEL[activity]} — ${
              topicIds.length === topics.length
                ? 'all topics'
                : topicIds
                    .map((id) => topics.find((t) => t.id === id)?.title)
                    .filter(Boolean)
                    .join(', ')
            }`,
      topicIds: [...new Set(chosen.map((q) => q.topicId))],
      startedAt: new Date().toISOString(),
      questions: [],
      marksAwarded: 0,
      marksAvailable: chosen.reduce((sum, q) => sum + q.marks, 0),
      ...(retryAttemptId ? { remediatesAttemptId: retryAttemptId } : {}),
    };

    // The run page reads the question list and the settings from history
    // state, so a set is reproducible on back-navigation without another id in
    // the URL.
    navigate(`/practice/run/${attempt.id}`, {
      state: {
        attempt,
        questionIds: chosen.map((q) => q.id),
        hintsAllowed,
        feedback,
      },
    });
  };

  const saveSet = () => {
    const config: PracticeConfig = {
      activity,
      topicIds,
      materialIds,
      length: effectiveLength,
      difficulties,
      hintsAllowed,
      feedback,
    };
    dispatch({
      type: 'save-practice',
      set: {
        id: newId('saved'),
        name: setName.trim() || `${ACTIVITY_LABEL[activity]} set`,
        config,
        savedAt: new Date().toISOString(),
      },
    });
    setSetName('');
    toast.success('Set saved', { description: 'It will appear in Practice.' });
  };

  const written = activity !== 'flashcards' && activity !== 'quiz';

  return (
    <Page width="prose" className="pb-page">
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2">
          <Link to="/practice">
            <ArrowLeftIcon />
            Practice
          </Link>
        </Button>
      </div>

      <PageHeader
        title={retryQuestionIds.length > 0 ? 'Retry these questions' : 'Set up practice'}
        description={
          retryQuestionIds.length > 0
            ? 'The questions you got wrong, in the same formats.'
            : 'Every control here changes which questions you get.'
        }
      />

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
          <Section title="Activity">
            <div className="grid gap-tight sm:grid-cols-2">
              {(Object.keys(ACTIVITY_FORMATS) as ActivityType[]).map((type) => (
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
                  <span className="text-sm font-medium">{ACTIVITY_LABEL[type]}</span>
                  <span className="text-muted-foreground text-xs leading-relaxed">
                    {ACTIVITY_BLURB[type]}
                  </span>
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
                    <Badge variant="secondary" className="font-mono tabular-nums">
                      {count}
                    </Badge>
                  </label>
                );
              })}
            </div>
          </Section>

          {materials.length > 0 && (
            <Section
              title="Limit to materials"
              description="Optional. Only questions citing one of these will be used."
            >
              <div className="flex flex-wrap gap-tight">
                {materials.map((material) => (
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
                          checked
                            ? [...prev, level]
                            : prev.filter((d) => d !== level),
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
                    <Badge variant="secondary" className="font-mono tabular-nums">
                      {count}
                    </Badge>
                  </label>
                );
              })}
            </div>
          </Section>
        </>
      )}

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
                  max={Math.max(1, available.length)}
                  value={length}
                  onChange={(e) => setLength(Math.max(1, Number(e.target.value) || 1))}
                  className="w-24 font-mono tabular-nums"
                />
                <span className="text-muted-foreground text-sm">
                  of {available.length} available
                </span>
              </div>
              {capped && (
                <p className="text-warning-foreground flex items-start gap-tight text-xs">
                  <AlertTriangleIcon className="mt-0.5 size-3 shrink-0" aria-hidden />
                  Only {available.length} questions match these settings, so the
                  set will have {available.length}. Add topics or difficulties to
                  get more.
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
                    Hints do not reduce your marks. They are recorded, so this
                    work counts as practice rather than as independent evidence.
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
                    After each question — learn as you go
                  </option>
                  <option value="end">
                    At the end — closer to exam conditions
                  </option>
                </Select>
                {written && feedback === 'immediate' && (
                  <p className="text-muted-foreground text-xs">
                    Written answers are checked against an authored rubric by
                    keyword. Useful as a checklist, not as a grade.
                  </p>
                )}
              </div>
            </>
          )}
        </div>
      </Section>

      {available.length === 0 && (
        <Alert variant="destructive">
          <AlertTriangleIcon />
          <AlertTitle>No questions match</AlertTitle>
          <AlertDescription>
            {topicIds.length === 0
              ? 'Select at least one topic.'
              : difficulties.length === 0
                ? 'Select at least one difficulty.'
                : `There are no ${ACTIVITY_LABEL[activity].toLowerCase()} questions for these topics at these difficulties. Try a different activity, or widen the difficulty range.`}
          </AlertDescription>
        </Alert>
      )}

      <div className="flex flex-wrap items-center gap-tight">
        <Button onClick={start} disabled={available.length === 0}>
          <PlayIcon />
          Start {effectiveLength || ''}{' '}
          {effectiveLength === 1 ? 'question' : 'questions'}
        </Button>
        {retryQuestionIds.length === 0 && (
          <>
            <Separator orientation="vertical" className="h-6" />
            <Input
              value={setName}
              onChange={(e) => setSetName(e.target.value)}
              placeholder="Name this set"
              className="w-44"
              aria-label="Name for the saved set"
            />
            <Button
              variant="outline"
              onClick={saveSet}
              disabled={available.length === 0}
            >
              <SaveIcon />
              Save set
            </Button>
          </>
        )}
      </div>

      <Card className="bg-muted/30">
        <CardContent className="text-muted-foreground flex flex-col gap-hairline text-xs">
          <span className="text-foreground font-medium">What this will give you</span>
          <span>
            {effectiveLength} {ACTIVITY_LABEL[activity].toLowerCase()}{' '}
            {effectiveLength === 1 ? 'question' : 'questions'} worth{' '}
            {chosen.reduce((sum, q) => sum + q.marks, 0)} marks, across{' '}
            {new Set(chosen.map((q) => q.topicId)).size} topics. Results are
            recorded and will change your progress and today’s plan.
          </span>
        </CardContent>
      </Card>
    </Page>
  );
}
