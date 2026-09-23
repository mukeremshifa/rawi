import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeftIcon,
  BookOpenIcon,
  DumbbellIcon,
  MessageSquareIcon,
} from 'lucide-react';

import { EVIDENCE_DETAIL } from '@shared/progress.ts';

import { Page, PageHeader, Section } from '@/components/layout';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  EvidenceChip,
  EvidenceMeter,
  FORMAT_LABEL,
  OutcomeBadge,
  Stat,
  formatRelative,
} from '@/components/domain';
import { useAppState } from '@/store/store';
import { useCoursePath } from '@/store/course-context';
import {
  useAttempts,
  useEvidence,
  useMaterials,
  useQuestionMap,
  useTopic,
  useTopicMap,
} from '@/store/selectors';
import { hasScript } from '@/features/tutor/engine';
import { NotFoundPage } from '@/routes';

/**
 * One topic, and every piece of evidence behind its level.
 *
 * ── This page is the answer to "why does it say that?" ────────────────────
 *
 * The brief requires that a student can inspect what an indicator is based on
 * and open the relevant attempt. So the level is stated, the four counts it was
 * derived from are listed, and every question the topic has ever been tested on
 * links straight to the attempt it came from.
 *
 * Getting this right is what earns the right to show a level at all. A summary
 * you cannot open is a claim you have to take on trust, which is precisely what
 * the brief warns against.
 */
export function TopicProgressPage() {
  const path = useCoursePath();
  const { topicId } = useParams();
  const topic = useTopic(topicId);
  const topicMap = useTopicMap();
  const evidence = useEvidence();
  const attempts = useAttempts();
  const questionMap = useQuestionMap();
  const materials = useMaterials();
  const { tutorSessions } = useAppState();

  if (!topic || !topicId) return <NotFoundPage />;

  const ev = evidence.get(topicId);
  const level = ev?.level ?? 'not-checked';

  /* Every answer ever given on this topic, newest attempt first. */
  const answers = attempts
    .filter((a) => a.completedAt)
    .sort((a, b) => (a.completedAt! < b.completedAt! ? 1 : -1))
    .flatMap((attempt) =>
      attempt.questions
        .filter((qa) => qa.topicId === topicId)
        .map((qa) => ({ attempt, qa })),
    );

  const relatedMaterials = materials.filter(
    (m) =>
      m.topicIds.includes(topicId) ||
      m.passages.some((p) => p.topicIds.includes(topicId)),
  );

  const sessions = tutorSessions.filter((s) => s.topicId === topicId);

  return (
    <Page className="max-w-3xl pb-page">
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2">
          <Link to={path('/progress')}>
            <ArrowLeftIcon />
            Progress
          </Link>
        </Button>
      </div>

      <PageHeader
        title={topic.title}
        description={topic.summary}
        actions={
          <>
            {hasScript(topicId) && (
              <Button variant="outline" size="sm" asChild>
                <Link to={path(`/tutor/new?topic=${topicId}`)}>
                  <MessageSquareIcon />
                  Tutor
                </Link>
              </Button>
            )}
            <Button size="sm" asChild>
              <Link to={path(`/practice/new?topic=${topicId}`)}>
                <DumbbellIcon />
                Practise
              </Link>
            </Button>
          </>
        }
      />

      <Card>
        <CardContent className="flex flex-col gap-base">
          <div className="flex flex-wrap items-center gap-snug">
            <EvidenceChip level={level} />
            {topic.priority === 'high' && (
              <Badge variant="outline">High priority</Badge>
            )}
          </div>
          <EvidenceMeter level={level} label={topic.title} />
          <p className="text-muted-foreground text-sm leading-relaxed">
            {EVIDENCE_DETAIL[level]}
          </p>
        </CardContent>
      </Card>

      <Section
        title="What this is based on"
        description="The counts the level above is derived from. Nothing else feeds into it."
      >
        <div className="grid gap-base sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardContent>
              <Stat
                value={`${ev?.independentCorrect ?? 0}/${ev?.independent ?? 0}`}
                label="unaided exam answers correct"
              />
            </CardContent>
          </Card>
          <Card>
            <CardContent>
              <Stat value={ev?.practised ?? 0} label="practice answers (hints allowed)" />
            </CardContent>
          </Card>
          <Card>
            <CardContent>
              <Stat value={ev?.selfRated ?? 0} label="self-rated cards" />
            </CardContent>
          </Card>
          <Card>
            <CardContent>
              <Stat
                value={ev?.lastWorkedAt ? formatRelative(ev.lastWorkedAt) : '—'}
                label="last worked"
              />
            </CardContent>
          </Card>
        </div>
      </Section>

      {answers.length > 0 && (
        <Section
          title="Every question you have been asked on this"
          description="Open any row to see the attempt it belongs to."
        >
          <ul className="flex flex-col gap-tight">
            {answers.map(({ attempt, qa }, index) => {
              const question = questionMap.get(qa.questionId);
              return (
                <li key={`${attempt.id}-${qa.questionId}-${index}`}>
                  <Link
                    to={
                      attempt.kind === 'exam'
                        ? `/exams/results/${attempt.id}`
                        : `/practice/results/${attempt.id}`
                    }
                    className="hover:bg-accent/50 focus-visible:ring-ring flex flex-col gap-tight rounded-lg border p-snug outline-none transition-colors focus-visible:ring-2"
                  >
                    <div className="flex flex-wrap items-center gap-tight">
                      <Badge variant="secondary" className="font-normal">
                        {FORMAT_LABEL[qa.format]}
                      </Badge>
                      <span className="text-muted-foreground text-xs">
                        {attempt.mode === 'exam'
                          ? 'Unaided'
                          : attempt.mode === 'self-rated'
                            ? 'Self-rated'
                            : 'With help'}
                      </span>
                      {qa.usedHint && (
                        <>
                          <Separator orientation="vertical" className="h-3" />
                          <span className="text-muted-foreground text-xs">
                            hint used
                          </span>
                        </>
                      )}
                      <div className="flex-1" />
                      <OutcomeBadge outcome={qa.outcome} />
                      <span className="text-muted-foreground font-mono text-xs tabular-nums">
                        {qa.marksAwarded}/{qa.marksAvailable}
                      </span>
                    </div>
                    <p className="line-clamp-2 text-sm leading-relaxed">
                      {question?.prompt ?? 'This question is no longer in the bank.'}
                    </p>
                    <span className="text-muted-foreground text-xs">
                      {attempt.title} ·{' '}
                      {formatRelative(attempt.completedAt ?? attempt.startedAt)}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </Section>
      )}

      {sessions.length > 0 && (
        <Section title="Tutor sessions on this topic">
          <ul className="flex flex-col gap-tight">
            {sessions.map((session) => (
              <li key={session.id}>
                <Link
                  to={path(`/tutor/${session.id}`)}
                  className="hover:bg-accent/50 focus-visible:ring-ring flex items-center justify-between gap-tight rounded-md border p-snug outline-none transition-colors focus-visible:ring-2"
                >
                  <span className="text-sm">
                    {session.messages.filter((m) => m.role === 'student').length} of
                    your turns · {formatRelative(session.updatedAt)}
                  </span>
                  <Badge variant="secondary" className="shrink-0 font-normal">
                    {session.endedAt ? 'Ended' : 'Open'}
                  </Badge>
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {relatedMaterials.length > 0 && (
        <Section title="Materials covering this">
          <ul className="flex flex-col gap-tight">
            {relatedMaterials.map((material) => (
              <li key={material.id}>
                <Link
                  to={path(`/materials/${material.id}`)}
                  className="hover:bg-accent/50 focus-visible:ring-ring flex items-center gap-snug rounded-md border p-snug outline-none transition-colors focus-visible:ring-2"
                >
                  <BookOpenIcon
                    className="text-muted-foreground size-4 shrink-0"
                    aria-hidden
                  />
                  <span className="truncate text-sm">{material.title}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {topic.relatedTopicIds.length > 0 && (
        <Section
          title="Often compared with"
          description="Exam questions frequently set these against each other."
        >
          <div className="flex flex-wrap gap-tight">
            {topic.relatedTopicIds.map((id) => {
              const related = topicMap.get(id);
              return related ? (
                <Button key={id} variant="outline" size="sm" asChild>
                  <Link to={path(`/progress/topic/${id}`)}>{related.title}</Link>
                </Button>
              ) : null;
            })}
          </div>
        </Section>
      )}
    </Page>
  );
}
