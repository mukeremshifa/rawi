import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { Material, MaterialKind } from '@shared/types.ts';
import { useStore } from '@/store/store';
import { useDraftState } from '@/store/drafts';
import { useTopics } from '@/store/selectors';
import { useCoursePath } from '@/store/course-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { splitIntoPassages } from './AddMaterialDialog';

export function EditMaterialDialog({ material, open, onOpenChange, onSaved }: {
  material: Material; open: boolean; onOpenChange: (open: boolean) => void;
  onSaved?: (material: Material) => void;
}) {
  const { state, dispatch } = useStore();
  const topics = useTopics();
  const path = useCoursePath();
  const prefix = `material:${material.courseId}:${material.id}:`;
  const [title, setTitle] = useDraftState(prefix + 'title', material.title);
  const [kind, setKind] = useDraftState<MaterialKind>(prefix + 'kind', material.kind);
  const initialText = material.passages.map(p => `# ${p.heading}\n\n${p.text}`).join('\n\n');
  const [text, setText] = useDraftState(prefix + 'text', initialText);
  const [topicIds, setTopics] = useDraftState(prefix + 'topics', material.topicIds);
  const [error, setError] = useState('');
  const discard = () => {
    setTitle(material.title); setKind(material.kind); setText(initialText); setTopics(material.topicIds);
    dispatch({ type: 'clear-draft', prefix });
    onOpenChange(false);
  };
  const save = () => {
    if (!title.trim() || !text.trim()) { setError('Enter a title and some content.'); return; }
    const parsed = material.origin === 'preview' ? material.passages : splitIntoPassages(text, topicIds);
    if (!parsed.length) { setError('Add at least one paragraph beneath the heading.'); return; }
    const used = new Set<string>();
    const passages = parsed.map(p => {
      const unchanged = material.passages.find(old => !used.has(old.id) && old.text === p.text && old.heading === p.heading);
      if (unchanged) used.add(unchanged.id);
      return { ...p, id: unchanged?.id ?? p.id, topicIds };
    });
    // Only old evidence is retained, once per identity. New study uses passages above.
    const referenced = new Set([
      ...state.questions.filter(q => q.source?.materialId === material.id).map(q => q.source!.passageId),
      ...state.tutorSessions.flatMap(s => [s.source, ...s.messages.flatMap(m => [m.source, ...(m.citations ?? [])])]).filter(ref => ref?.materialId === material.id).map(ref => ref!.passageId),
      ...state.materials.filter(m => m.noteSource?.materialId === material.id).map(m => m.noteSource!.passageId),
    ]);
    const priorPassages = [...(material.priorPassages ?? []), ...material.passages.filter(p => !used.has(p.id))].filter(p => referenced.has(p.id));
    const next = { ...material, title: title.trim(), kind, passages, priorPassages, topicIds, updatedAt: new Date().toISOString() };
    dispatch({ type: 'update-material', materialId: material.id, patch: next });
    dispatch({ type: 'clear-draft', prefix });
    onOpenChange(false); onSaved?.(next);
  };
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
    <DialogHeader><DialogTitle>Edit material and topic links</DialogTitle><DialogDescription>Closing keeps your draft. Saving changes future study. Earlier citations keep their original passages.</DialogDescription></DialogHeader>
    <Label htmlFor="edit-material-title">Title</Label><Input id="edit-material-title" value={title} onChange={e => setTitle(e.target.value)} />
    <Label htmlFor="edit-material-kind">Type</Label><Select id="edit-material-kind" value={kind} onChange={e => setKind(e.target.value as MaterialKind)}><option value="reading">Reading</option><option value="lecture-notes">Lecture notes</option><option value="student-note">My note</option></Select>
    {material.origin !== 'preview' && <><Label htmlFor="edit-material-text">Content and your commentary</Label><Textarea id="edit-material-text" rows={12} value={text} onChange={e => setText(e.target.value)} /></>}
    <fieldset><legend className="mb-2 font-medium">Link topics</legend><div className="flex flex-wrap gap-2">{topics.map(t => <label key={t.id} className="flex items-center gap-2 rounded border p-2"><Checkbox checked={topicIds.includes(t.id)} onCheckedChange={v => setTopics(previous => v ? [...previous, t.id] : previous.filter(id => id !== t.id))} />{t.title}</label>)}</div></fieldset>
    {!topics.length && <Button variant="outline" asChild><Link to={path(`/syllabus?returnMaterial=${material.id}`)}>Create topics, then return to this reading</Link></Button>}
    {error && <p role="alert" className="text-destructive text-sm">{error}</p>}
    <DialogFooter><Button variant="ghost" onClick={discard}>Discard draft</Button><Button variant="outline" onClick={() => onOpenChange(false)}>Keep draft and close</Button><Button onClick={save}>Save changes</Button></DialogFooter>
  </DialogContent></Dialog>;
}
