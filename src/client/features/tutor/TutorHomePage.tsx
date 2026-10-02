import { RecordLibrary } from '@/components/RecordLibrary';
import { Link } from 'react-router-dom';
import { MessageSquareIcon } from 'lucide-react';

import { AI_TUTOR_NOTICE } from '@shared/tutor.ts';

import { Page, PageHeader, Section } from '@/components/layout';
import { EmptyState } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  EvidenceChip,
  SimulatedNotice,
} from '@/components/domain';
import { useStore } from '@/store/store';
import { useCourse, useCoursePath } from '@/store/course-context';
import { useCanTutor, useEvidence, useTopics } from '@/store/selectors';

/**
 * The tutor's front door: pick a topic, or pick up where you left off.
 *
 * Topics with no readable material behind them are shown and disabled rather
 * than hidden, so a student can see why the tutor cannot teach them yet.
 * A placeholder for a file Rawi could not read does not count as material.
 */
export function TutorHomePage() {
  const path = useCoursePath();
  const course = useCourse();
  const { state } = useStore();
  const tutorSessions = state.tutorSessions.filter(s => s.courseId === course.id);
  const topics = useTopics();
  const evidence = useEvidence();
  const canTutor = useCanTutor();

  return (
    <Page>
      <PageHeader
        title="Tutor"
        description="Work through a topic with explanations, questions and hints. Start from a topic here, or from a passage in any reading."
      />

      <SimulatedNotice tone="block">{AI_TUTOR_NOTICE}</SimulatedNotice>

      <RecordLibrary kind="tutor" />

      <Section
        title="Start a topic"
        description="The tutor moves through orient, understand, recall, reason, apply and reflect."
      >
        <div className="grid gap-snug sm:grid-cols-2">
          {topics.map((topic) => {
            const available = canTutor(topic.id);
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
                        Link a readable material
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
                    title="The tutor teaches from your course material, and none relates to this topic yet."
                    aria-label={`${topic.title}: no readable material for the tutor`}
                  >
                    {card}<Button variant="outline" size="sm" asChild><Link to={path('/materials?add=1')}>Add or link material</Link></Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Section>

      {tutorSessions.length === 0 && topics.every((t) => !canTutor(t.id)) && (
        <EmptyState
          icon={<MessageSquareIcon />}
          title="Add material for the tutor to teach from"
          description="The tutor works from this course's readings and notes. Paste a reading or add a text file, then link it to a topic."
          action={
            <Button variant="outline" asChild>
              <Link to={path('/materials')}>Go to materials</Link>
            </Button>
          }
        />
      )}
    </Page>
  );
}
