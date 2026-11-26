import { useRef, useState } from 'react';
import type { Me, Preferences } from '@shared/contracts/workspace';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAccount } from '@/lib/account';
import { request, errorMessage, RequestError } from '@/lib/api';
import { useUnsentGuard } from '@/lib/hooks';
import { Logo } from '@/components/Logo';
import { Field, FieldError } from '@/components/ui/field';
import { NumberField } from '@/components/ui/number-field';
import { RadioCards } from '@/components/ui/radio-group';

/** The browser's time zone, so days, streaks and review dates follow the student's own calendar from the start. */
const browserZone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
  } catch {
    return undefined;
  }
};

export function Onboarding({ onSaved }: { onSaved: (account: Me) => void }) {
  const account = useAccount();
  const [name, setName] = useState(account.user.name);
  const [count, setCount] = useState(account.preferences.values.questionCount);
  const [feedback, setFeedback] = useState(account.preferences.values.feedback);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const pending = useRef<{
    operationId: string;
    expectedRevision: number;
    questionCount: number;
    feedback: 'immediate' | 'end';
    onboardingCompleted: boolean;
    timezone?: string;
  } | null>(null);
  const baseRevision = useRef(account.preferences.revision);
  const allowNavigation = useUnsentGuard(
    name !== account.user.name ||
      count !== account.preferences.values.questionCount ||
      feedback !== account.preferences.values.feedback ||
      !!pending.current,
  );
  async function finish() {
    setBusy(true);
    setError('');
    try {
      const user = await request<Me['user']>('/v1/profile', account.user.id, { name }, 'PATCH');
      pending.current ??= {
        operationId: crypto.randomUUID(),
        expectedRevision: baseRevision.current,
        questionCount: count,
        feedback,
        onboardingCompleted: true,
        ...(browserZone() ? { timezone: browserZone() } : {}),
      };
      const preferences = await request<Preferences>('/v1/preferences', account.user.id, pending.current, 'PATCH');
      pending.current = null;
      allowNavigation();
      onSaved({ ...account, user, preferences });
    } catch (e) {
      setError(errorMessage(e));
      if (e instanceof RequestError && e.code === 'revision_conflict') {
        try {
          const latest = await request<Me>('/v1/me', account.user.id);
          if (latest.preferences.values.onboardingCompleted) {
            allowNavigation();
            onSaved(latest);
          } else {
            pending.current = null;
            baseRevision.current = latest.preferences.revision;
            setError('Your preferences changed in another tab. Your choices remain here. Review them and save again.');
          }
        } catch (readError) {
          setError(errorMessage(readError));
        }
      }
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-section px-4 py-12">
        <Logo />
        <div className="flex flex-col gap-2">
          <h1 className="font-serif text-2xl leading-tight font-medium tracking-tight">Set up your workspace</h1>
          <p className="text-muted-foreground text-md">
            A few defaults for practice. You can change them any time in Settings.
          </p>
        </div>
        <form
          className="flex flex-col gap-gutter"
          onSubmit={e => {
            e.preventDefault();
            void finish();
          }}
        >
          <fieldset className="flex flex-col gap-gutter" disabled={busy || !!pending.current}>
            <Field label="Your name" required>
              <Input maxLength={80} value={name} onChange={e => setName(e.target.value)} autoComplete="name" />
            </Field>
            <Field label="Questions per practice set" description="Between 1 and 30.">
              <NumberField value={count} onValueChange={v => setCount(v ?? 1)} min={1} max={30} />
            </Field>
            <div className="flex flex-col gap-1.5">
              <span id="onboarding-feedback" className="text-sm font-medium">
                When to show feedback
              </span>
              <RadioCards
                aria-labelledby="onboarding-feedback"
                value={feedback}
                onValueChange={setFeedback}
                options={[
                  { value: 'immediate', label: 'After each answer', description: 'Check as you go.' },
                  { value: 'end', label: 'At the end', description: 'Answer everything first.' },
                ]}
              />
            </div>
          </fieldset>
          {error && <FieldError>{error}</FieldError>}
          <Button size="lg" loading={busy} disabled={!name.trim()} className="self-start">
            {pending.current && !busy ? 'Retry' : 'Open my workspace'}
          </Button>
        </form>
      </div>
    </main>
  );
}
