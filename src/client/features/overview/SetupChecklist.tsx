import { Link } from 'react-router-dom';
import { useCourse, useCoursePath } from '@/store/course-context';
import { useStore } from '@/store/store';
import { useTopics, useMaterials, useQuestions, useAssessments } from '@/store/selectors';
import { useDraftState } from '@/store/drafts';
import { isUsableMaterial } from '@shared/ai-context.ts';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

export function SetupChecklist() {
  const course = useCourse(); const path = useCoursePath(); const { state } = useStore();
  const topics = useTopics(); const materials = useMaterials(); const questions = useQuestions(); const assessments = useAssessments();
  const [hidden, setHidden] = useDraftState(`guidance:${course.id}`, false);
  const covered = topics.filter(t => materials.some(m => isUsableMaterial(m) && m.topicIds.includes(t.id)));
  if (hidden) return <Button variant="ghost" className="self-start" onClick={() => setHidden(false)}>Show course setup</Button>;
  return <Card><CardContent className="flex flex-col gap-3">
    <div className="flex items-center justify-between"><h2 className="font-semibold">Continue setup</h2><Button variant="ghost" size="sm" onClick={() => setHidden(true)}>Skip guidance for now</Button></div>
    <ol className="grid gap-3 sm:grid-cols-2">
      <li><Link className="underline" to={path('/syllabus')}>{topics.length ? `${topics.length} topics saved` : 'Add topics'}</Link></li>
      <li><Link className="underline" to={path('/materials?add=1')}>{covered.length} of {topics.length} topics have linked readable material. Add material</Link></li>
      <li><Link className="underline" to={path('/exams/assessment')}>{assessments.length} assessment dates. Add another (optional)</Link></li>
      <li><Link className="underline" to="/planner/availability">{state.availability.windows.length ? 'Study availability saved' : 'Set study availability (optional)'}</Link><p className="text-muted-foreground text-xs">Shared across all your courses.</p></li>
    </ol>
    <h3 className="text-sm font-medium">Study now</h3>
    {!topics.length && <p className="text-muted-foreground text-sm">You can read unlinked material while building your topics.</p>}
    <ul className="flex flex-col gap-2">{topics.map(t => {
      const reading = materials.find(m => !m.archived && m.origin !== 'preview' && m.topicIds.includes(t.id));
      const bank = questions.some(q => q.topicId === t.id);
      return <li key={t.id} className="flex flex-wrap items-center gap-2 text-sm"><span>{t.title}</span>{reading && <><Link className="underline" to={path(`/materials/${reading.id}`)}>Read</Link><Link className="underline" to={path(`/tutor/new?topic=${t.id}`)}>Tutor</Link><Link className="underline" to={path(`/practice/new?topic=${t.id}`)}>Generate questions</Link></>}{bank && <Link className="underline" to={path(`/practice/new?topic=${t.id}&source=bank`)}>Bank practice</Link>}{!reading && <span className="text-muted-foreground">Link a reading for tutoring and generation.</span>}</li>;
    })}</ul><p className="text-muted-foreground text-xs">Tutoring and generation also require the local AI service. Bank practice and reading work without it.</p>
  </CardContent></Card>;
}
