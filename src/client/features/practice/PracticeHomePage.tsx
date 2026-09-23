import { Link, useNavigate } from 'react-router-dom';
import {
  ClipboardListIcon,
  PlayIcon,
  PlusIcon,
  RotateCcwIcon,
  Trash2Icon,
} from 'lucide-react';

import type { ActivityType } from '@shared/types.ts';

import { Page, PageHeader, Section } from '@/components/layout';
import { EmptyState } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { DIFFICULTY_LABEL, formatRelative } from '@/components/domain';
import { useAppState, useStore } from '@/store/store';
import { useCoursePath } from '@/store/course-context';
import {
  useRecentAttempts,
  useRecurringMistakes,
  useReviews,
  useTopicMap,
} from '@/store/selectors';

/**
 * The practice suite's front door.
 *
 * Four routes in: a fresh set, a saved set, a review that has come due, or a
 * recurring mistake. The last is the one that matters most and it is placed
 * high on the page for that reason — a question the student has got wrong twice
 * is the single most useful thing they could spend ten minutes on, and burying
 * it under a grid of activity cards would waste it.
 */

const ACTIVITY_LABEL: Record<ActivityType, string> = {
  flashcards: 'Flashcards',
  quiz: 'Quiz',
  'written-recall': 'Written recall',
  'source-analysis': 'Source analysis',
  essay: 'Essay practice',
};

const ACTIVITIES: { type: ActivityType; blurb: string }[] = [
  {
    type: 'flashcards',
    blurb: 'Reveal, rate your recall, revisit the difficult ones.',
  },
  {
    type: 'quiz',
    blurb: 'Multiple choice and select, matching, ordering, fill-in-the-blank.',
  },
  {
    type: 'written-recall',
    blurb: 'Explain an idea or summarise an argument from memory.',
  },
  {
    type: 'source-analysis',
    blurb: 'Claims, evidence, perspective and limitations in an extract.',
  },
  {
    type: 'essay',
    blurb: 'Thesis, outline, comparison, or a full written answer.',
  },
];

export function PracticeHomePage() {
  const path = useCoursePath();
  const { savedPractice } = useAppState();
  const { dispatch } = useStore();
  const navigate = useNavigate();
  const topicMap = useTopicMap();
  const reviews = useReviews();
  const mistakes = useRecurringMistakes();
  const recent = useRecentAttempts(6).filter((a) => a.kind === 'practice');

  return (
    <Page>
      <PageHeader
        title="Practice"
        description="Choose an activity and what it draws on. Results feed your progress and today’s plan."
        actions={
          <Button asChild>
            <Link to={path('/practice/new')}>
              <PlusIcon />
              New set
            </Link>
          </Button>
        }
      />

      {mistakes.length > 0 && (
        <Section
          title="Questions you keep getting wrong"
          description="Wrong twice or more. The clearest signal in your history."
        >
          <ul className="flex flex-col gap-tight">
            {mistakes.slice(0, 3).map((mistake) => (
              <li key={mistake.questionId}>
                <Card className="border-warning/40">
                  <CardContent className="flex flex-wrap items-start justify-between gap-base">
                    <div className="flex min-w-0 flex-col gap-hairline">
                      <span className="line-clamp-2 text-sm font-medium leading-relaxed">
                        {mistake.prompt}
                      </span>
                      <span className="text-muted-foreground flex items-center gap-tight text-xs">
                        <span>{topicMap.get(mistake.topicId)?.title}</span>
                        <Separator orientation="vertical" className="h-3" />
                        <span className="font-mono tabular-nums">
                          wrong {mistake.times} times
                        </span>
                        <Separator orientation="vertical" className="h-3" />
                        <span>{formatRelative(mistake.lastAt)}</span>
                      </span>
                    </div>
                    <div className="flex shrink-0 gap-tight">
                      <Button size="sm" asChild>
                        <Link
                          to={path(`/practice/new?questions=${mistake.questionId}&retry=${mistake.lastAttemptId}`)}
                        >
                          <RotateCcwIcon />
                          Retry
                        </Link>
                      </Button>
                      <Button variant="outline" size="sm" asChild>
                        <Link
                          to={path(`/exams/results/${mistake.lastAttemptId}`)}
                        >
                          See attempt
                        </Link>
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {reviews.length > 0 && (
        <Section
          title="Due for review"
          description="Topics untouched for three days or more."
        >
          <div className="flex flex-wrap gap-tight">
            {reviews.map((review) => {
              const topic = topicMap.get(review.topicId);
              if (!topic) return null;
              return (
                <Button key={review.topicId} variant="outline" size="sm" asChild>
                  <Link
                    to={path(`/practice/new?topic=${topic.id}&activity=flashcards`)}
                  >
                    {topic.title}
                    <Badge variant="secondary" className="font-mono tabular-nums">
                      {review.daysSince}d
                    </Badge>
                  </Link>
                </Button>
              );
            })}
          </div>
        </Section>
      )}

      <Section title="Start an activity">
        <div className="grid gap-snug sm:grid-cols-2 lg:grid-cols-3">
          {ACTIVITIES.map(({ type, blurb }) => (
            <Link
              key={type}
              to={path(`/practice/new?activity=${type}`)}
              className="hover:bg-accent/50 focus-visible:ring-ring flex flex-col gap-tight rounded-lg border p-gutter outline-none transition-colors focus-visible:ring-2"
            >
              <span className="font-medium">{ACTIVITY_LABEL[type]}</span>
              <span className="text-muted-foreground text-xs leading-relaxed">
                {blurb}
              </span>
            </Link>
          ))}
        </div>
      </Section>

      {savedPractice.length > 0 && (
        <Section title="Saved sets">
          <ul className="flex flex-col gap-tight">
            {savedPractice.map((set) => (
              <li key={set.id}>
                <Card>
                  <CardContent className="flex flex-wrap items-center justify-between gap-base">
                    <div className="flex min-w-0 flex-col gap-hairline">
                      <span className="font-medium">{set.name}</span>
                      <span className="text-muted-foreground flex flex-wrap items-center gap-tight text-xs">
                        <span>{ACTIVITY_LABEL[set.config.activity]}</span>
                        <Separator orientation="vertical" className="h-3" />
                        <span className="font-mono tabular-nums">
                          {set.config.length} questions
                        </span>
                        <Separator orientation="vertical" className="h-3" />
                        <span>
                          {set.config.difficulties
                            .map((d) => DIFFICULTY_LABEL[d])
                            .join(', ')}
                        </span>
                        <Separator orientation="vertical" className="h-3" />
                        <span>
                          {set.config.topicIds
                            .map((id) => topicMap.get(id)?.title)
                            .filter(Boolean)
                            .slice(0, 2)
                            .join(', ')}
                          {set.config.topicIds.length > 2 &&
                            ` +${set.config.topicIds.length - 2}`}
                        </span>
                      </span>
                    </div>
                    <div className="flex shrink-0 items-center gap-tight">
                      <Button
                        size="sm"
                        onClick={() =>
                          navigate(
                            `/practice/new?activity=${set.config.activity}&topic=${set.config.topicIds.join(',')}`,
                          )
                        }
                      >
                        <PlayIcon />
                        Open
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Delete ${set.name}`}
                        onClick={() =>
                          dispatch({ type: 'remove-practice', setId: set.id })
                        }
                      >
                        <Trash2Icon />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section title="Recent practice">
        {recent.length === 0 ? (
          <EmptyState
            icon={<ClipboardListIcon />}
            title="No practice recorded yet"
            description="Choose an activity above. Results are stored on this device and change what the overview suggests."
            action={
              <Button asChild>
                <Link to={path('/practice/new')}>Set up practice</Link>
              </Button>
            }
          />
        ) : (
          <ul className="flex flex-col gap-tight">
            {recent.map((attempt) => (
              <li key={attempt.id}>
                <Link
                  to={path(`/practice/results/${attempt.id}`)}
                  className="hover:bg-accent/50 focus-visible:ring-ring flex items-center justify-between gap-tight rounded-md border p-snug outline-none transition-colors focus-visible:ring-2"
                >
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate text-sm">{attempt.title}</span>
                    <span className="text-muted-foreground text-xs">
                      {formatRelative(attempt.completedAt ?? attempt.startedAt)}
                      {attempt.mode === 'self-rated' && ' · self-rated'}
                      {attempt.remediatesAttemptId && ' · retry'}
                    </span>
                  </div>
                  <span className="shrink-0 font-mono text-sm tabular-nums">
                    {attempt.marksAwarded}/{attempt.marksAvailable}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </Page>
  );
}
