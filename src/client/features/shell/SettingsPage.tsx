import { useRef, useState } from 'react';
import { Link, NavLink, useParams } from 'react-router-dom';
import { Page, PageHeader, Section } from '@/components/layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useStore, importWorkspace, type AppState } from '@/store/store';
import { useTheme, type ThemeChoice } from '@/components/theme';

const SECTIONS = ['profile', 'workspace', 'study', 'availability', 'notifications', 'appearance', 'data'] as const;
const LABELS = ['Profile', 'Workspace', 'Study preferences', 'Availability', 'Notifications', 'Appearance and accessibility', 'Workspace data'];

export function exportWorkspace(state: AppState) {
  const { restoreProblem, ...data } = state;
  const url = URL.createObjectURL(new Blob([restoreProblem?.raw || JSON.stringify({ format: 'rawi-workspace', version: 1, exportedAt: new Date().toISOString(), state: data }, null, 2)], { type: 'application/json' }));
  const a = document.createElement('a'); a.href = url; a.download = `rawi-workspace-${new Date().toISOString().slice(0, 10)}.json`; a.click(); URL.revokeObjectURL(url);
}

export function SettingsPage() {
  const { section = 'profile' } = useParams();
  const { state, dispatch, saveError, retrySave } = useStore();
  const { choice, setChoice } = useTheme();
  const [name, setName] = useState(state.preferences.displayName);
  const [workspace, setWorkspace] = useState(state.preferences.workspaceName);
  const [accent, setAccent] = useState(state.preferences.accent);
  const [count, setCount] = useState(String(state.preferences.questionCount));
  const [minutes, setMinutes] = useState(String(state.availability.sessionMinutes));
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [incoming, setIncoming] = useState<AppState | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const p = state.preferences;
  const patch = (values: Partial<typeof p>) => { dispatch({ type: 'preferences', patch: values }); setMessage('Changes applied locally.'); };
  const save = () => {
    setError('');
    if (section === 'workspace' && !workspace.trim()) { setError('Enter a workspace name.'); return; }
    if (section === 'study') {
      if (!Number.isInteger(Number(count)) || Number(count) < 1 || Number(count) > 30 || !Number.isInteger(Number(minutes)) || Number(minutes) < 10 || Number(minutes) > 120) { setError('Use 1 to 30 questions and 10 to 120 minutes.'); return; }
      patch({ questionCount: Number(count) }); dispatch({ type: 'set-availability', availability: { ...state.availability, sessionMinutes: Number(minutes) } });
    } else if (section === 'profile') patch({ displayName: name.trim().slice(0, 80), accent });
    else if (section === 'workspace') patch({ workspaceName: workspace.trim().slice(0, 80) });
  };
  const restoreFile = async (selected: File | undefined) => {
    if (!selected) return;
    setError(''); setMessage('Reading recovery file…');
    try {
      if (selected.size > 20 * 1024 * 1024) throw new Error('Choose a recovery file smaller than 20 MB.');
      setIncoming(importWorkspace(await selected.text())); setMessage('');
    } catch (e) { setError(e instanceof Error ? e.message : 'This file could not be restored. Nothing changed.'); setMessage(''); }
  };
  return <Page width="wide"><PageHeader title="Settings" description="Your local profile and workspace. No online account or synchronization." actions={<Button variant="outline" asChild><Link to="/">Back to workspace</Link></Button>} />
    <nav aria-label="Settings sections" className="flex flex-wrap gap-2">{SECTIONS.map((s, i) => <NavLink key={s} to={`/settings/${s}`} className={({ isActive }) => `rounded border px-3 py-2 text-sm ${isActive ? 'bg-secondary font-semibold' : ''}`}>{LABELS[i]}</NavLink>)}</nav>
    <Section title={LABELS[SECTIONS.indexOf(section as typeof SECTIONS[number])] ?? 'Choose a settings section'}>
      {section === 'profile' && <><Label htmlFor="profile-name">Display name (optional)</Label><Input id="profile-name" maxLength={80} value={name} onChange={e => setName(e.target.value)} /><Label htmlFor="profile-accent">Initials avatar accent</Label><Select id="profile-accent" value={accent} onChange={e => setAccent(e.target.value)}>{['indigo', 'amber', 'teal', 'rose', 'violet'].map(c => <option key={c}>{c}</option>)}</Select><p className="text-muted-foreground text-sm">Your initials appear in the workspace header. This profile belongs to this browser.</p></>}
      {section === 'workspace' && <><Label htmlFor="workspace-name">Workspace name</Label><Input id="workspace-name" maxLength={80} value={workspace} onChange={e => setWorkspace(e.target.value)} /><p>{saveError ? 'Changes are in memory and need recovery.' : 'Workspace is stored in this browser on this device.'}</p><Button variant="outline" asChild><Link to="/courses">Manage courses</Link></Button></>}
      {section === 'study' && <><Label htmlFor="default-length">Default session length in minutes</Label><Input id="default-length" type="number" min={10} max={120} value={minutes} onChange={e => setMinutes(e.target.value)} /><Label htmlFor="default-count">Default practice question count</Label><Input id="default-count" type="number" min={1} max={30} value={count} onChange={e => setCount(e.target.value)} /><label className="flex items-center gap-2"><Checkbox checked={p.hints} onCheckedChange={v => patch({ hints: !!v })} />Allow hints in new practice sets</label><Label htmlFor="default-feedback">Feedback in new practice sets</Label><Select id="default-feedback" value={p.feedback} onChange={e => patch({ feedback: e.target.value as 'immediate' | 'end' })}><option value="immediate">After each answer</option><option value="end">At the end</option></Select><p className="text-muted-foreground text-sm">Defaults apply to new activities. Saved drafts, sets and exams keep their settings. Available questions may cap the requested count.</p></>}
      {section === 'availability' && <><p>Availability and default session length are shared across your courses.</p><Button className="self-start" asChild><Link to="/planner/availability">Edit study availability</Link></Button></>}
      {section === 'notifications' && <><p className="text-muted-foreground text-sm">In-app reminders appear while Rawi is open. No email, push or closed-browser delivery.</p>{(['assessments', 'study', 'review'] as const).map((category, i) => <label key={category} className="flex items-center gap-2"><Checkbox checked={p.reminders[category]} onCheckedChange={v => patch({ reminders: { ...p.reminders, [category]: !!v } })} />{['Upcoming assessments', 'Planned study', 'Due topic review'][i]}</label>)}<Label htmlFor="reminder-days">Show upcoming reminders</Label><Select id="reminder-days" value={p.reminders.days} onChange={e => patch({ reminders: { ...p.reminders, days: Number(e.target.value) } })}><option value={0}>On the day</option><option value={1}>One day ahead</option><option value={3}>Three days ahead</option><option value={7}>One week ahead</option></Select><Button variant="outline" asChild><Link to="/notifications">View reminders</Link></Button></>}
      {section === 'appearance' && <><Label htmlFor="theme-choice">Theme</Label><Select id="theme-choice" value={choice} onChange={e => setChoice(e.target.value as ThemeChoice)}><option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option></Select><Label htmlFor="reading-size">Reading text size</Label><Select id="reading-size" value={p.readingSize} onChange={e => patch({ readingSize: e.target.value as typeof p.readingSize })}><option value="normal">Normal</option><option value="large">Large</option><option value="larger">Larger</option></Select><Label htmlFor="motion-choice">Motion</Label><Select id="motion-choice" value={p.motion} onChange={e => patch({ motion: e.target.value as typeof p.motion })}><option value="system">Follow system</option><option value="reduced">Reduce motion</option><option value="full">Full motion</option></Select></>}
      {section === 'data' && <><p>Export includes courses, materials, answers, profile, preferences, reminders and drafts. Restoring replaces this entire local workspace. Export a copy before replacement.</p><div className="flex flex-wrap gap-2"><Button onClick={() => exportWorkspace(state)}>Export workspace</Button><Button variant="outline" onClick={() => file.current?.click()}>Choose recovery file</Button><Button variant="outline" onClick={retrySave}>Retry local save</Button></div><input ref={file} type="file" accept=".json,application/json" className="sr-only" aria-label="Recovery file" onChange={e => void restoreFile(e.target.files?.[0])} /><Button variant="ghost" asChild><Link to="/courses">Intentional demo reset in Courses</Link></Button></>}
      {['profile', 'workspace', 'study'].includes(section) && <Button className="self-start" onClick={save}>Save changes</Button>}
      {error && <Alert variant="destructive"><AlertTitle>Changes need attention</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
      <p role="status" className="text-muted-foreground text-sm">{saveError ? 'Local save failed. Export your work or retry from Workspace data before reloading.' : message}</p>
      <p className="text-muted-foreground text-xs">Dates and planning use this device timezone: {Intl.DateTimeFormat().resolvedOptions().timeZone}.</p>
    </Section>
    <ConfirmDialog open={!!incoming} onOpenChange={v => !v && setIncoming(null)} title="Replace this local workspace?" description={`This replaces ${state.courses.length} courses and their work, profile, preferences and drafts with ${incoming?.courses.length ?? 0} courses from the recovery file. Export the current workspace first if you want to keep it.`} confirmLabel="Replace workspace" onConfirm={() => { if (incoming) dispatch({ type: 'replace-workspace', state: incoming }); setIncoming(null); setMessage('Recovery loaded.'); }} />
  </Page>;
}
