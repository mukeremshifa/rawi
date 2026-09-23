import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  ArrowLeftIcon,
  CheckIcon,
  PencilIcon,
  PlayIcon,
  RotateCcwIcon,
  Trash2Icon,
} from 'lucide-react';
import { toast } from 'sonner';

import type { PracticeAttemptState, SavedPracticeSet } from '@shared/types.ts';

import { Page, PageHeader, Section } from '@/components/layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { FORMAT_LABEL, OutcomeBadge, relativeDay } from '@/components/domain';
import { useStore } from '@/store/store';
import { useCourse, useCoursePath } from '@/store/course-context';
import {
  resolveSetQuestions,
  useAllSessions,
  useAttempts,
  useOpenRunForSet,
  usePracticeSet,
  useQuestionMap,
  useQuestions,
  useTopicMap,
} from '@/store/selectors';
import { newId } from '@/lib/id';

/**
 * One saved practice set: what is in it, what you have scored on it, and the
 * two ways in — resume an unfinished attempt, or start another one.
 *
 * ── Why this screen exists at all ─────────────────────────────────────────
 *
 * The previous build went straight from setup into a running set, which made
 * the set itself invisible: there was nowhere to see what a set contained,
 * nowhere to rename it, and no way to compare two attempts at the same
 * questions. Generation now lands here instead, which gives the saved object
 * somewhere to be.
 *
 * ── Resume versus start ───────────────────────────────────────────────────
 *
 * At most one unfinished run exists per set, and it is the thing a Resume
 * button opens. "Start another attempt" is deliberately separate and asks
 * before discarding work in progress, because the two actions differ in
 * exactly the way that matters: one preserves answers and one throws them away.
 */
export function PracticeSetPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { dispatch } = useStore();
  const course = useCourse();
  const path = useCoursePath();
  const questionMap = useQuestionMap();
  const topicMap = useTopicMap();
  const attempts = useAttempts();

  const { setId } = useParams<{ setId: string }>();
  const set = usePracticeSet(setId);
  const openRun = useOpenRunForSet(set?.id);
  const allSessions = useAllSessions();

  /*
   * The planner session this page was opened from, validated before use.
   *
   * A `?session=` that survives in the address bar, a bookmark, or a back
   * button is stale navigation state rather than a live link. Accepting it
   * blindly would let an unrelated new attempt complete a planned session,
   * possibly in another course. So the id has to name a session that still
   * exists, belongs to this course and is still outstanding.
   */
  const sessionParam = params.get('session') ?? undefined;
  const sessionId = sessionParam
    ? allSessions.find(
        (s) =>
          s.id === sessionParam &&
          s.courseId === course.id &&
          s.status === 'planned',
      )?.id
    : undefined;

  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState('');
  const [confirmRestart, setConfirmRestart] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (!set) return <Navigate to={path('/practice')} replace />;
  if (set.courseId !== course.id) {
    return <Navigate to={`/course/${set.courseId}/practice/set/${set.id}`} replace />;
  }

  const questions = set.questionIds
    .map((id) => questionMap.get(id))
    .filter((q): q is NonNullable<typeof q> => !!q);

  const missing = set.questionIds.length - questions.length;

  /* A set that stored settings but no content. See `RecoverEmptySet`. */
  const needsRecovery = set.questionIds.length === 0;

  const previous = attempts
    .filter((a) => a.practiceSetId === set.id && a.completedAt)
    .sort((a, b) => (a.completedAt! < b.completedAt! ? 1 : -1));

  /** Creates a fresh run and opens it. */
  const start = () => {
    if (questions.length === 0) return;
    const run: PracticeAttemptState = {
      id: newId('run'),
      courseId: course.id,
      setId: set.id,
      questionIds: questions.map((q) => q.id),
      answers: {},
      checkedIds: [],
      hintedIds: [],
      index: 0,
      revisitIds: [],
      secondPass: false,
      hintsAllowed: set.config.hintsAllowed,
      feedback: set.config.feedback,
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      ...(sessionId ? { plannedSessionId: sessionId } : {}),
    };
    // Replacing an open run is what "start another attempt" means; the confirm
    // dialog has already been through if there was one.
    if (openRun) dispatch({ type: 'remove-practice-run', runId: openRun.id });
    dispatch({ type: 'upsert-practice-run', run });
    navigate(path(`/practice/run/${run.id}`));
  };

  const rename = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    dispatch({ type: 'save-practice', set: { ...set, name: trimmed } });
    setRenaming(false);
    toast.success('Set renamed');
  };

  const answeredInRun = openRun
    ? Object.values(openRun.answers).filter((a) => a.kind !== 'none').length
    : 0;

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

      <PageHeader
        title={
          renaming ? (
            <span className="flex flex-wrap items-center gap-tight">
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="max-w-xs text-base"
                aria-label="Set name"
                autoFocus
              />
              <Button size="sm" onClick={rename} disabled={!name.trim()}>
                <CheckIcon />
                Save
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setRenaming(false)}>
                Cancel
              </Button>
            </span>
          ) : (
            set.name
          )
        }
        description={`${questions.length} ${
          questions.length === 1 ? 'question' : 'questions'
        } · ${set.config.activity.replace('-', ' ')} · saved ${relativeDay(set.savedAt)}`}
        actions={
          !renaming && (
            <div className="flex items-center gap-tight">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setName(set.name);
                  setRenaming(true);
                }}
              >
                <PencilIcon />
                Rename
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setConfirmDelete(true)}
                className="text-destructive"
              >
                <Trash2Icon />
                Delete
              </Button>
            </div>
          )
        }
      />

      {missing > 0 && (
        <Alert>
          <AlertTitle>
            {missing} {missing === 1 ? 'question is' : 'questions are'} no longer
            available
          </AlertTitle>
          <AlertDescription>
            They were in this set when it was generated and are not in the question
            bank now. The set runs with the {questions.length} that remain.
          </AlertDescription>
        </Alert>
      )}

      {needsRecovery && <RecoverEmptySet set={set} />}

      {openRun && (
        <Alert>
          <AlertTitle>You have an attempt in progress</AlertTitle>
          <AlertDescription>
            <span className="flex flex-col gap-snug">
              <span>
                {answeredInRun} of {openRun.questionIds.length} answered, last worked on{' '}
                {relativeDay(openRun.updatedAt)}. Your answers, position and any written
                text are saved.
              </span>
              <span className="flex flex-wrap gap-tight">
                <Button size="sm" asChild>
                  <Link to={path(`/practice/run/${openRun.id}`)}>
                    <PlayIcon />
                    Resume
                  </Link>
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setConfirmRestart(true)}
                >
                  <RotateCcwIcon />
                  Start again
                </Button>
              </span>
            </span>
          </AlertDescription>
        </Alert>
      )}

      {!openRun && !needsRecovery && (
        <div className="flex flex-wrap items-center gap-tight">
          <Button onClick={start} disabled={questions.length === 0}>
            <PlayIcon />
            {previous.length > 0 ? 'Start another attempt' : 'Start'}
          </Button>
          {previous.length > 0 && (
            <span className="text-muted-foreground text-xs">
              Earlier attempts are kept.
            </span>
          )}
        </div>
      )}

      {previous.length > 0 && (
        <Section
          title={`Attempts (${previous.length})`}
          description="Each attempt is recorded separately, so you can see whether a second run went better."
        >
          <div className="flex flex-col gap-tight">
            {previous.map((attempt) => (
              <Link
                key={attempt.id}
                to={path(`/practice/results/${attempt.id}`)}
                className="hover:bg-accent/50 focus-visible:ring-ring flex flex-wrap items-center gap-snug rounded-lg border p-snug outline-none transition-colors focus-visible:ring-2"
              >
                <span className="text-sm">{relativeDay(attempt.completedAt!)}</span>
                <Separator orientation="vertical" className="h-3" />
                <span className="font-mono text-sm tabular-nums">
                  {attempt.marksAwarded} / {attempt.marksAvailable}
                </span>
                <div className="flex-1" />
                <Badge variant="secondary" className="font-normal">
                  {attempt.mode === 'self-rated' ? 'Self-rated' : 'Practice'}
                </Badge>
              </Link>
            ))}
          </div>
        </Section>
      )}

      <Section
        title="What is in this set"
        description="Resolved when the set was generated, so every attempt gets the same questions."
      >
        <div className="flex flex-col gap-tight">
          {questions.map((question, i) => {
            const lastOutcome = previous[0]?.questions.find(
              (q) => q.questionId === question.id,
            );
            return (
              <Card key={question.id}>
                <CardContent className="flex flex-col gap-tight">
                  <div className="flex flex-wrap items-center gap-tight">
                    <span className="text-muted-foreground font-mono text-xs tabular-nums">
                      {i + 1}
                    </span>
                    <span className="text-muted-foreground text-xs">
                      {FORMAT_LABEL[question.format]}
                    </span>
                    <Separator orientation="vertical" className="h-3" />
                    <span className="text-muted-foreground text-xs">
                      {topicMap.get(question.topicId)?.title}
                    </span>
                    <div className="flex-1" />
                    {lastOutcome && <OutcomeBadge outcome={lastOutcome.outcome} />}
                  </div>
                  <p className="text-sm leading-relaxed">{question.prompt}</p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </Section>

      <ConfirmDialog
        open={confirmRestart}
        onOpenChange={setConfirmRestart}
        title="Start again?"
        description={`Your attempt in progress has ${answeredInRun} ${
          answeredInRun === 1 ? 'answer' : 'answers'
        } in it. Starting again discards them and begins a fresh attempt at the same questions.`}
        confirmLabel="Discard and start again"

        onConfirm={() => {
          setConfirmRestart(false);
          start();
        }}
      />

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`Delete “${set.name}”?`}
        description={
          previous.length > 0
            ? `The set and any attempt in progress are removed. The ${previous.length} completed ${
                previous.length === 1 ? 'attempt' : 'attempts'
              } stay in your history and keep counting toward progress.`
            : 'The set and any attempt in progress are removed.'
        }
        confirmLabel="Delete set"

        onConfirm={() => {
          dispatch({ type: 'remove-practice', setId: set.id });
          toast.success('Set deleted');
          navigate(path('/practice'), { replace: true });
        }}
      />
    </Page>
  );
}

/**
 * Repairs a saved set that stored its settings but not its questions.
 *
 * ── Where these sets come from ────────────────────────────────────────────
 *
 * Two places. The version-one store saved a set as a *configuration*, and the
 * upgrade to version two carried that forward honestly but incompletely: it
 * wrote an empty `questionIds`, intending the content to resolve on the next
 * attempt, and nothing ever resolved it. The seeded "Comparison drill" has the
 * same shape for the same reason. The result either way is a set whose Start
 * button is disabled and which never explains why.
 *
 * ── Why recovery is explicit and persisted ────────────────────────────────
 *
 * Resolving on every render would be simpler and wrong: a set is supposed to
 * *be* its questions, so that two attempts at it are comparable. A set whose
 * content is recomputed each time it loads is a different paper whenever the
 * pool changes. So this resolves once and writes the result back, after which
 * the set behaves exactly like one generated today. Repeating the recovery is
 * therefore a no-op rather than a second set, and reloading changes nothing.
 *
 * The set's identity, title, settings and attempt history are untouched
 * throughout: only `questionIds` is filled in.
 */
function RecoverEmptySet({ set }: { set: SavedPracticeSet }) {
  const { dispatch } = useStore();
  const path = useCoursePath();
  /* This course's pool only. A history set must not recover into statistics
     questions because both courses happen to have a "testing" topic. */
  const pool = useQuestions();
  const recovered = useRef(false);

  const resolved = resolveSetQuestions(set, pool);

  /*
   * Recovery runs automatically, once, when there is something to recover.
   *
   * The student did not break this and should not have to press a button to
   * un-break it. When nothing matches there is nothing to do automatically,
   * and the panel below explains that instead.
   */
  useEffect(() => {
    if (recovered.current) return;
    if (resolved.length === 0) return;
    recovered.current = true;
    dispatch({
      type: 'save-practice',
      set: { ...set, questionIds: resolved.map((q) => q.id) },
    });
  }, [dispatch, set, resolved]);

  if (resolved.length > 0) {
    return (
      <Alert>
        <AlertTitle>This set has been restored</AlertTitle>
        <AlertDescription>
          It was saved with its settings but without its questions, which is how
          sets were stored in an earlier version. Its {resolved.length}{' '}
          {resolved.length === 1 ? 'question has' : 'questions have'} been resolved
          from those settings and saved, so it now behaves like any other set. Its
          name, settings and earlier results are unchanged.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <Alert>
      <AlertTitle>This set has no questions to run</AlertTitle>
      <AlertDescription>
        <span className="flex flex-col gap-snug">
          <span>
            It was saved with its settings but without its questions, and nothing
            in this course's question bank now matches those settings:{' '}
            {set.config.activity.replace('-', ' ')} questions on{' '}
            {set.config.topicIds.length === 0
              ? 'any topic'
              : `${set.config.topicIds.length} ${
                  set.config.topicIds.length === 1 ? 'topic' : 'topics'
                }`}
            {set.config.difficulties.length > 0 &&
              ` at ${set.config.difficulties.join(' or ')} difficulty`}
            . The topics or questions it drew on have probably been removed since.
          </span>
          <span>
            The set and its attempt history are kept. Build a replacement with
            different settings, and this record stays where it is.
          </span>
          <span className="flex flex-wrap gap-tight">
            <Button size="sm" asChild>
              <Link
                to={path(
                  `/practice/new?activity=${set.config.activity}${
                    set.config.topicIds.length
                      ? `&topic=${set.config.topicIds.join(',')}`
                      : ''
                  }`,
                )}
              >
                Build a new set from these settings
              </Link>
            </Button>
          </span>
        </span>
      </AlertDescription>
    </Alert>
  );
}
