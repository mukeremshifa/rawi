import { useRef, useState } from 'react';
import type { Me, Preferences } from '@shared/contracts/workspace';
import { Page, PageHeader } from '@/components/layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { useAccount } from '@/lib/account';
import { request, errorMessage, RequestError } from '@/lib/api';
import { useUnsentGuard } from '@/lib/hooks';
import { PreferencesEditor } from '@/features/courses/Courses';

export function AccountSettings({ onProfile, onSaved }: { onProfile: (user: Me['user']) => void; onSaved: (value: Preferences) => void }) {
  return <><ProfileEditor onSaved={onProfile} /><PreferencesEditor onSaved={onSaved} /></>;
}
function ProfileEditor({ onSaved }: { onSaved: (user: Me['user']) => void }) {
  const { user } = useAccount();
  const [name, setName] = useState(user.name), [savedName, setSavedName] = useState(user.name);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  useUnsentGuard(name !== savedName);
  async function save() {
    setBusy(true); setMessage('');
    try {
      const saved = await request<Me['user']>('/v1/profile', user.id, { name }, 'PATCH');
      setSavedName(saved.name); setName(saved.name); onSaved(saved); setMessage('Profile saved.');
    } catch (e) { setMessage(errorMessage(e)); }
    finally { setBusy(false); }
  }
  return <Page className="pt-8" width="prose"><PageHeader title="Your account" description="Manage your profile and study preferences." />
    <form className="space-y-4" onSubmit={e => { e.preventDefault(); void save(); }}>
      <label className="block">Display name<Input required maxLength={80} value={name} disabled={busy} onChange={e => setName(e.target.value)} /></label>
      <p>{user.email}</p><p className="text-sm text-muted-foreground">You sign in with Google. Your email is managed by your Google account.</p>
      <Button disabled={busy || !name.trim()}>{busy ? 'Saving…' : 'Save profile'}</Button><p role="status">{message}</p>
    </form></Page>;
}
export function Onboarding({ onSaved }: { onSaved: (account: Me) => void }) {
  const account = useAccount();
  const [name, setName] = useState(account.user.name);
  const [count, setCount] = useState(account.preferences.values.questionCount);
  const [feedback, setFeedback] = useState(account.preferences.values.feedback);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const pending = useRef<{ operationId: string; expectedRevision: number; questionCount: number; feedback: 'immediate' | 'end'; onboardingCompleted: boolean } | null>(null);
  const baseRevision = useRef(account.preferences.revision);
  const allowNavigation = useUnsentGuard(name !== account.user.name || count !== account.preferences.values.questionCount || feedback !== account.preferences.values.feedback || !!pending.current);
  async function finish() {
    setBusy(true); setError('');
    try {
      const user = await request<Me['user']>('/v1/profile', account.user.id, { name }, 'PATCH');
      pending.current ??= { operationId: crypto.randomUUID(), expectedRevision: baseRevision.current, questionCount: count, feedback, onboardingCompleted: true };
      const preferences = await request<Preferences>('/v1/preferences', account.user.id, pending.current, 'PATCH');
      pending.current = null; allowNavigation(); onSaved({ ...account, user, preferences });
    } catch (e) {
      setError(errorMessage(e));
      if (e instanceof RequestError && e.code === 'revision_conflict') {
        try {
          const latest = await request<Me>('/v1/me', account.user.id);
          if (latest.preferences.values.onboardingCompleted) { allowNavigation(); onSaved(latest); }
          else { pending.current = null; baseRevision.current = latest.preferences.revision; setError('Your preferences changed in another tab. Your choices remain here. Review them and save again.'); }
        } catch (readError) { setError(errorMessage(readError)); }
      }
    }
    finally { setBusy(false); }
  }
  return <Page className="py-12" width="prose"><PageHeader title="Make room for learning" description="Choose how you would like to start. You can change these preferences later." />
    <form className="space-y-5" onSubmit={e => { e.preventDefault(); void finish(); }}><fieldset className="space-y-5" disabled={busy || !!pending.current}>
      <label className="block">Your display name<Input required maxLength={80} value={name} onChange={e => setName(e.target.value)} /></label>
      <label className="block">Questions per practice<Input type="number" min={1} max={30} value={count} onChange={e => setCount(Number(e.target.value))} /></label>
      <label className="block">Feedback<Select value={feedback} onChange={e => setFeedback(e.target.value as typeof feedback)}><option value="immediate">After each answer</option><option value="end">At the end</option></Select></label>
    </fieldset><p>Your workspace starts empty. Add a course whenever you are ready.</p>
    {error && <p role="alert">{error}</p>}<Button disabled={busy || !name.trim()}>{busy ? 'Saving…' : pending.current ? 'Retry saving' : 'Open my workspace'}</Button></form></Page>;
}
