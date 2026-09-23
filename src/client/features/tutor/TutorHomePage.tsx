import { Link } from 'react-router-dom';
import { MessageSquareIcon, PlayIcon } from 'lucide-react';

import { SCRIPTED_NOTICE, STAGE_LABEL } from '@shared/course/tutor-script.ts';

import { Page, PageHeader, Section } from '@/components/layout';
import { EmptyState } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  EvidenceChip,
  SimulatedNotice,
  formatRelative,
} from '@/components/domain';
import { useAppState } from '@/store/store';
import { useCoursePath } from '@/store/course-context';
import { useEvidence, useTopicMap, useTopics } from '@/store/selectors';
import { hasScript } from './engine';

/**
 * The tutor's front door: pick a topic, or pick up where you left off.
 *
 * Topics with no authored script are shown and disabled rather than hidden.
 * A student who added their own topic should be able to see that the tutor
 * cannot help with it yet — quietly omitting it would leave them wondering
 * where their topic went.
 */
export function TutorHomePage() {
  const path = useCoursePath();
  const { tutorSessions } = useAppState();
  const topics = useTopics();
  const topicMap = useTopicMap();
  const evidence = useEvidence();

  const open = tutorSessions
    .filter((s) => !s.endedAt)
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  const past = tutorSessions
    .filter((s) => s.endedAt)
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));

  return (
    <Page>
      <PageHeader
        title="Tutor"
        description="Work through a topic with explanations, questions and hints. Start from a topic here, or from a passage in any reading."
      />

      <SimulatedNotice tone="block">{SCRIPTED_NOTICE}</SimulatedNotice>

      {open.length > 0 && (
        <Section title="Pick up where you left off">
          <ul className="flex flex-col gap-tight">
            {open.map((session) => {
              const topic = topicMap.get(session.topicId);
              return (
                <li key={session.id}>
                  <Card>
                    <CardContent className="flex flex-wrap items-center justify-between gap-base">
                      <div className="flex min-w-0 flex-col gap-hairline">
                        <span className="font-medium">
                          {topic?.title ?? 'Session'}
                        </span>
                        <span className="text-muted-foreground flex items-center gap-tight text-xs">
                          <Badge variant="secondary" className="font-normal">
                            {STAGE_LABEL[session.stage]}
                          </Badge>
                          <span>
                            {session.messages.length} turns ·{' '}
                            {formatRelative(session.updatedAt)}
                          </span>
                        </span>
                      </div>
                      <Button size="sm" asChild>
                        <Link to={path(`/tutor/${session.id}`)}>
                          <PlayIcon />
                          Resume
                        </Link>
                      </Button>
                    </CardContent>
                  </Card>
                </li>
              );
            })}
          </ul>
        </Section>
      )}

      <Section
        title="Start a topic"
        description="The tutor moves through orient, understand, recall, reason, apply and reflect."
      >
        <div className="grid gap-snug sm:grid-cols-2">
          {topics.map((topic) => {
            const available = hasScript(topic.id);
            const ev = evidence.get(topic.id);
            const card = (
              <Card className={available ? undefined : 'opacity-60'}>
                <CardContent className="flex h-full flex-col gap-snug">
                  <div className="flex items-start justify-between gap-tight">
                    <span className="font-medium leading-snug">{topic.title}</span>
                    {topic.priority === 'high' && (
                      <Badge variant="outline" className="shrink-0">
                        High priority
                      </Badge>
                    )}
                  </div>
                  <p className="text-muted-foreground text-xs leading-relaxed">
                    {topic.summary}
                  </p>
                  <div className="mt-auto flex items-center justify-between gap-tight pt-tight">
                    <EvidenceChip level={ev?.level ?? 'not-checked'} />
                    {available ? (
                      <span className="text-primary text-xs font-medium">
                        Start session →
                      </span>
                    ) : (
                      <span className="text-muted-foreground text-xs">
                        No authored script
                      </span>
                    )}
                  </div>
                </CardContent>
              </Card>
            );

            return (
              <div key={topic.id}>
                {available ? (
                  <Link
                    to={path(`/tutor/new?topic=${topic.id}`)}
                    className="focus-visible:ring-ring block rounded-lg outline-none focus-visible:ring-2"
                  >
                    {card}
                  </Link>
                ) : (
                  <div
                    title="The tutor's responses are authored per topic, and there are none for this one."
                    aria-label={`${topic.title} — no authored tutor script`}
                  >
                    {card}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Section>

      {past.length > 0 && (
        <Section title="Past sessions">
          <ul className="flex flex-col gap-tight">
            {past.map((session) => {
              const topic = topicMap.get(session.topicId);
              return (
                <li key={session.id}>
                  <Link
                    to={path(`/tutor/${session.id}`)}
                    className="hover:bg-accent/50 focus-visible:ring-ring flex items-center justify-between gap-tight rounded-md border p-snug outline-none transition-colors focus-visible:ring-2"
                  >
                    <div className="flex min-w-0 flex-col">
                      <span className="truncate text-sm">
                        {topic?.title ?? 'Session'}
                      </span>
                      <span className="text-muted-foreground text-xs">
                        Reached {STAGE_LABEL[session.stage].toLowerCase()} ·{' '}
                        {formatRelative(session.updatedAt)}
                      </span>
                    </div>
                    <span className="text-muted-foreground shrink-0 text-xs">
                      Review →
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </Section>
      )}

      {tutorSessions.length === 0 && topics.every((t) => !hasScript(t.id)) && (
        <EmptyState
          icon={<MessageSquareIcon />}
          title="No authored tutor content for your topics"
          description="The tutor's responses are written per topic, and the script covers the sample course only. Practice and exams still work on any topic with questions behind it."
          action={
            <Button variant="outline" asChild>
              <Link to={path('/practice')}>Go to practice</Link>
            </Button>
          }
        />
      )}
    </Page>
  );
}
