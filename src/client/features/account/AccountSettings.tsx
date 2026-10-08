import { useRef, useState } from 'react';
import type { Me, Preferences } from '@shared/contracts/workspace';
import { Page, PageHeader } from '@/components/layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAccount } from '@/lib/account';
import { request, errorMessage, RequestError } from '@/lib/api';
import { useUnsentGuard } from '@/lib/hooks';
import { Logo } from '@/components/Logo';
import { Field, FieldError } from '@/components/ui/field';
import { NumberField } from '@/components/ui/number-field';
import { RadioCards } from '@/components/ui/radio-group';
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
  return <Page className="pt-8" width="narrow"><PageHeader title="Your account" description="Manage your profile and study preferences." />
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
  return <main className="flex min-h-0 flex-1 flex-col overflow-y-auto">
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-section px-4 py-12">
      <Logo />
      <div className="flex flex-col gap-2">
        <h1 className="font-serif text-2xl leading-tight font-medium tracking-tight">Set up your workspace</h1>
        <p className="text-muted-foreground text-md">A few defaults for practice. You can change them any time in Settings.</p>
      </div>
      <form className="flex flex-col gap-gutter" onSubmit={e => { e.preventDefault(); void finish(); }}>
        <fieldset className="flex flex-col gap-gutter" disabled={busy || !!pending.current}>
          <Field label="Your name" required><Input maxLength={80} value={name} onChange={e => setName(e.target.value)} autoComplete="name" /></Field>
          <Field label="Questions per practice set" description="Between 1 and 30."><NumberField value={count} onValueChange={v => setCount(v ?? 1)} min={1} max={30} /></Field>
          <div className="flex flex-col gap-1.5">
            <span id="onboarding-feedback" className="text-sm font-medium">When to show feedback</span>
            <RadioCards aria-labelledby="onboarding-feedback" value={feedback} onValueChange={setFeedback} options={[
              { value: 'immediate', label: 'After each answer', description: 'Check as you go.' },
              { value: 'end', label: 'At the end', description: 'Answer everything first.' },
            ]} />
          </div>
        </fieldset>
        {error && <FieldError>{error}</FieldError>}
        <Button size="lg" loading={busy} disabled={!name.trim()} className="self-start">{pending.current && !busy ? 'Retry' : 'Open my workspace'}</Button>
      </form>
    </div>
  </main>;
}
