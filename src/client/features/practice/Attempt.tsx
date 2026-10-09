import { useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { BookOpenIcon, MessageSquareIcon, RotateCcwIcon } from 'lucide-react';
import type { LearningAttempt, LearningSet } from '@shared/contracts/learning';
import type { WrittenGrading } from '@shared/domain/types';

import { RATING_LABEL, Stat, formatDate } from '@/components/domain';
import { Page, PageHeader } from '@/components/layout';
import { ErrorState, Notice, PageLoading } from '@/components/states';
import { Button } from '@/components/ui/button';
import { FieldError } from '@/components/ui/field';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { RequestFeedback } from '@/features/ai/AiOperation';
import { QuestionFeedback } from '@/features/practice/QuestionFeedback';
import { useApi, useSave } from '@/lib/data';
import { keys } from '@/lib/query';
import { usePageMeta } from '@/lib/shell';

type AttemptDetail = LearningAttempt & { feedbackRevisions?: { id: string; questionId: string; revision: number; createdAt: string; grading: WrittenGrading }[] };
type Filter = 'all' | 'missed' | 'pending';

const missedOf = (q: AttemptDetail['questions'][number]) =>
  ['incorrect', 'partial', 'skipped'].includes(q.result.outcome) || (q.result.response.kind === 'self-rating' && ['again', 'hard'].includes(q.result.response.rating));

/** Attempt review: the score first, then each question with its outcome and feedback. */
export function AttemptReview() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const data = useApi<AttemptDetail>(`/v1/attempts/${id}`);
  const save = useSave();
  const setId = useRef(crypto.randomUUID());
  const [filter, setFilter] = useState<Filter>('all');
  usePageMeta({ courseId: data.data?.courseId, crumbs: data.data ? [{ label: 'Practice', to: `/course/${data.data.courseId}/practice` }, { label: data.data.title }] : undefined });
  if (data.isPending) return <Page width="narrow"><PageLoading label="Loading results" /></Page>;
  if (data.error) return <Page width="narrow"><ErrorState error={data.error} onRetry={() => void data.refetch()} /></Page>;
  const a = data.data;
  // Written answers with text and a rubric that have no feedback yet. One request marks them all.
  const waiting = a.questions.filter(q => q.result.response.kind === 'text' && q.result.response.text.trim() && q.question.rubric?.length && !a.feedbackRevisions?.some(r => r.questionId === q.question.id)).length;
  const missed = a.questions.filter(missedOf).slice(0, 50);
  const shown = a.questions.map((q, n) => ({ ...q, n })).filter(q => filter === 'all' || (filter === 'missed' ? missedOf(q) : q.result.outcome === 'pending'));
  const practiseMissed = () => save.run<LearningSet>({ path: `/v1/courses/${a.courseId}/sets`, body: { id: setId.current, name: `Review: ${a.title}`.slice(0, 200), questionIds: missed.map(q => q.question.id), feedback: 'immediate', hintsAllowed: true, remediatesAttemptId: a.id } },
    { id: 'remediate', invalidate: [keys.course(a.courseId).sets], onSuccess: saved => navigate(`/sets/${saved.id}`) });
  return (
    <Page width="narrow">
      <PageHeader display title={a.title} description={`${a.exam ? 'Exam rehearsal' : 'Practice'} · ${formatDate(a.completedAt)}${a.finish === 'expired' ? ' · Ended when time ran out' : ''}`}
        actions={missed.length > 0 ? <Button loading={save.busy} onClick={practiseMissed}><RotateCcwIcon />Practise the {missed.length} missed</Button> : undefined} />
      {save.error && <FieldError>{save.error}</FieldError>}
      <div className="grid grid-cols-3 gap-gutter border-y py-gutter">
        <Stat value={a.marksAvailable ? `${a.marksAwarded}/${a.marksAvailable}` : '—'} label="Marks" />
        <Stat value={a.questions.filter(q => q.result.outcome === 'correct').length} label={`of ${a.questions.length} correct`} />
        <Stat value={a.pending} label="Awaiting feedback" />
      </div>
      {a.pending > 0 && <Notice>Written answers awaiting feedback are saved and left out of the marks above, so they don't lower your score.</Notice>}
      {waiting > 0 && !a.sampleDataset && !a.imported && <RequestFeedback attemptId={a.id} count={waiting} onDone={() => void data.refetch()} />}
      {a.sampleTimingNotice && <Notice>{a.sampleTimingNotice}</Notice>}
      {a.sampleDataset && <p className="text-muted-foreground text-sm">Sample activity. Objective answers are marked normally. Sample written feedback is illustrative.</p>}
      {a.imported && <p className="text-muted-foreground text-sm">{a.markingVersion === 'recovered-objective-v1' ? 'Recovered practice, marked by the server. Earlier hint use could not be checked.' : 'Imported history, with its original marking and hint records.'}</p>}
      <SegmentedControl aria-label="Show questions" value={filter} onValueChange={setFilter} options={[{ value: 'all', label: `All ${a.questions.length}` }, { value: 'missed', label: `Missed ${missed.length}` }, { value: 'pending', label: `Awaiting ${a.pending}` }]} />
      <ol className="flex flex-col gap-section">
        {shown.map(({ question, result, n }) => (
          <li key={question.id} className="flex flex-col gap-base border-t pt-gutter">
            <div className="flex gap-snug">
              <span className="text-muted-foreground tabular pt-1 text-sm">{n + 1}</span>
              <h2 className="font-serif text-lg leading-snug">{question.prompt}</h2>
            </div>
            {a.flashcardReview?.firstRatings[question.id] && <p className="text-muted-foreground text-sm">First pass: {RATING_LABEL[a.flashcardReview.firstRatings[question.id]!.rating]}.</p>}
            <QuestionFeedback question={{ ...question, source: undefined }} attempt={result} />
            {a.feedbackRevisions?.some(r => r.questionId === question.id) && (
              <details className="text-sm">
                <summary className="text-muted-foreground cursor-pointer">Earlier feedback</summary>
                <ul className="mt-2 flex flex-col gap-2">
                  {a.feedbackRevisions.filter(r => r.questionId === question.id).map(r => (
                    <li key={r.id} className="rounded-md border px-3 py-2">
                      <p className="text-muted-foreground">Revision {r.revision} · {r.grading.model} · {new Date(r.createdAt).toLocaleString()}</p>
                      <p>{r.grading.summary}</p>
                    </li>
                  ))}
                </ul>
              </details>
            )}
            <div className="flex flex-wrap gap-tight">
              <Button asChild variant="ghost" size="sm"><Link to={`/course/${a.courseId}/tutor?attemptId=${a.id}&questionId=${question.id}&topicId=${question.topicId}`}><MessageSquareIcon />Discuss with the tutor</Link></Button>
              {question.source && <Button asChild variant="ghost" size="sm"><Link to={`/materials/${question.source.materialId}/versions/${question.source.versionId}#block-${question.source.blockIds[0]}`}><BookOpenIcon />Read the source</Link></Button>}
            </div>
          </li>
        ))}
        {shown.length === 0 && <p className="text-muted-foreground">No questions in this view.</p>}
      </ol>
    </Page>
  );
}
