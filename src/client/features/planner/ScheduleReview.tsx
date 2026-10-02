import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Attempt } from '@shared/types.ts';
import { localISO } from '@shared/planner.ts';
import { useStore } from '@/store/store';
import { newId } from '@/lib/id';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';

export function ScheduleReview({ attempt }: { attempt: Attempt }) {
  const { state, dispatch } = useStore(); const [open, setOpen] = useState(false);
  const [date, setDate] = useState(localISO(new Date(Date.now() + 86400000))); const [time, setTime] = useState('18:00');
  const [general, setGeneral] = useState(false); const [created, setCreated] = useState('');
  const createdRef = useRef('');
  const wrong = attempt.questions.filter(q => q.outcome === 'partial' || q.outcome === 'incorrect');
  if (!wrong.length) return null;
  const save = () => {
    if (!date || !time || createdRef.current) return;
    const id = newId('sess'); const [h, m] = time.split(':').map(Number);
    createdRef.current = id;
    dispatch({ type: 'save-session', session: { id, courseId: attempt.courseId, title: `Review: ${attempt.title}`, date, startMinutes: h! * 60 + m!, durationMinutes: state.availability.sessionMinutes, activity: 'review', topicIds: [...new Set(wrong.map(q => q.topicId))], status: 'planned', createdAt: new Date().toISOString(), link: general ? { kind: 'practice-new', topicIds: [...new Set(wrong.map(q => q.topicId))], activity: 'quiz' } : { kind: 'mistake-review', attemptId: attempt.id, questionIds: wrong.map(q => q.questionId) } } });
    setCreated(id);
  };
  return <><Button variant="outline" onClick={() => setOpen(true)}>Schedule missed-answer review</Button><Dialog open={open} onOpenChange={setOpen}><DialogContent><DialogHeader><DialogTitle>Schedule a follow-up</DialogTitle><DialogDescription>The originating result and selected missed questions stay attached through reload and rescheduling.</DialogDescription></DialogHeader>{created ? <><p role="status">Follow-up added once.</p><Button asChild><Link to={`/planner?session=${created}`}>Open planned follow-up</Link></Button><Button variant="outline" onClick={() => setOpen(false)}>Return to this result</Button></> : <><Label htmlFor="review-date">Date</Label><Input id="review-date" type="date" value={date} onChange={e => setDate(e.target.value)} /><Label htmlFor="review-time">Start time</Label><Input id="review-time" type="time" value={time} onChange={e => setTime(e.target.value)} /><label className="flex gap-2"><Checkbox checked={general} onCheckedChange={v => setGeneral(!!v)} />Choose general topic practice instead</label><p>{wrong.length} exact missed answers selected.</p><DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button disabled={!date || !time} onClick={save}>Schedule review</Button></DialogFooter></>}</DialogContent></Dialog></>;
}
