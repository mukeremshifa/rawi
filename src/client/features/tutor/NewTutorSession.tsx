import { answerReview } from '@shared/answer-review.ts';
import { useEffect, useRef } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';

import { useStore } from '@/store/store';
import { useCourse, useCoursePath } from '@/store/course-context';
import { useTopic } from '@/store/selectors';
import { openSession } from './engine';

/**
 * Creates a session from query parameters, then replaces itself with it.
 *
 * ── Why this is a route rather than a function call ───────────────────────
 *
 * Every surface that launches tutoring — a passage action, a plan suggestion, a
 * results page's "discuss this with the tutor" — needs to create a session and
 * land the student in it. Making that a link to `/tutor/new?topic=…` means
 * those surfaces stay declarative `<Link>`s rather than each importing the
 * store and the engine to do the same three lines.
 *
 * The navigation is `replace`, so the back button from a session returns to
 * wherever the student came from rather than re-running this route and creating
 * a second identical session.
 *
 * The ref guard is for React 18+ StrictMode, which mounts effects twice in
 * development. Without it every session launched in dev is created twice.
 */
export function NewTutorSession() {
  const [params] = useSearchParams();
  const { state, dispatch } = useStore();
  const course = useCourse();
  const path = useCoursePath();
  const navigate = useNavigate();
  const created = useRef<string | null>(null);

  const topicId = params.get('topic');
  const topic = useTopic(topicId ?? undefined);
  const materialId = params.get('material');
  const passageId = params.get('passage');
  const quote = params.get('quote');
  const fromAttemptId = params.get('attempt');
  const fromQuestionId = params.get('question');
  /* The planner session that launched this, when one did. Carried onto the
     session so that reaching the end of the arc completes it. */
  const plannedSessionId = params.get('session');

  useEffect(() => {
    /* A topic from another course is not opened here: tutoring stays inside
       the course whose material it draws on. */
    if (!topic || topic.courseId !== course.id || !state.topics.some(t => t.id === topic.id) || created.current) return;

    const session = openSession({
      courseId: course.id,
      topic,
      ...(materialId && passageId
        ? { source: { materialId, passageId } }
        : {}),
      ...(quote ? { quote } : {}),
      ...(fromAttemptId ? { fromAttemptId } : {}),
      ...(fromQuestionId ? { fromQuestionId } : {}),
      ...(plannedSessionId ? { plannedSessionId } : {}),
    });

    const attempt = state.attempts.find(a => a.id === fromAttemptId && a.courseId === course.id);
    const question = state.questions.find(q => q.id === fromQuestionId && q.courseId === course.id && q.topicId === topic.id);
    if (attempt && question) session.review = answerReview(attempt, question);
    session.title = topic.title;
    if (session.source && !state.materials.some(m => m.id === session.source!.materialId && m.courseId === course.id && m.passages.some(p => p.id === session.source!.passageId))) session.source = undefined;
    created.current = session.id;
    dispatch({ type: 'upsert-tutor-session', session });
    navigate(path(`/tutor/${session.id}`), { replace: true });
  }, [
    course.id,
    path,
    topic,
    materialId,
    passageId,
    quote,
    fromAttemptId,
    fromQuestionId,
    plannedSessionId,
    dispatch,
    navigate,
  ]);

  if (!topic || topic.courseId !== course.id || !state.topics.some(t => t.id === topic.id)) {
    return <Navigate to={path('/tutor')} replace />;
  }
  return null;
}
