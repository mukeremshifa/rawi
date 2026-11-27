import { useState } from 'react';
import { CONSENT_VERSION, type Me } from '@shared/contracts/workspace';

import { Logo } from '@/components/Logo';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { useAccount } from '@/lib/account';
import { errorMessage, request } from '@/lib/api';

/**
 * What Rawi keeps and where it goes, in plain words. Shown before a student agrees to the pilot and
 * in Settings afterwards. Every statement here must stay true of the code: update it with any
 * change to storage, AI routes or deletion.
 */
export function DataNote() {
  return (
    <div className="flex max-w-prose flex-col gap-snug text-base">
      <p>
        Rawi is a pilot run for research and for the Create AI Agents Championship. Taking part is your choice, and you
        can stop and delete everything at any time.
      </p>
      <h3 className="font-semibold">What Rawi keeps</h3>
      <ul className="list-disc pl-5">
        <li>Your Google name, email address and picture, used to sign you in.</li>
        <li>The materials you upload, and what Rawi reads from them: sections, summaries, terms and questions.</li>
        <li>
          Your answers and how they were marked, your tutor conversations and notes, your plan, your goals, and every
          step the Rawi agent takes for you.
        </li>
        <li>
          A record of each AI request: which service, how long it took and what it cost, and for a streamed or rejected
          reply, the start of what the model wrote, so a reply cut off midway can be recovered.
        </li>
      </ul>
      <h3 className="font-semibold">Where it goes</h3>
      <ul className="list-disc pl-5">
        <li>Your account and study records are kept in a Neon Postgres database, and your files in Cloudflare R2.</li>
        <li>
          Anything you write, such as tutor questions and answers, goes only to AI models on Amazon Bedrock in the
          United States, which keeps no copy of it.
        </li>
        <li>
          Your course materials are converted by Datalab, and read by AI models on Amazon Bedrock and on Google Vertex
          AI in the United States. Google may keep material it receives for a limited time to check for abuse.
        </li>
        <li>Nothing is sold, shown to advertisers, or shared with your instructors or classmates.</li>
      </ul>
      <h3 className="font-semibold">Deleting it</h3>
      <p>
        Settings, Profile, Delete account removes your account, everything listed above and your files at once. It
        cannot be undone. If you only want to stop, you can also just stop using Rawi.
      </p>
    </div>
  );
}

/** The pilot agreement, shown once before the first use and again when the terms change. */
export function Consent({ onAgreed, onSignOut }: { onAgreed: (me: Me) => void; onSignOut: () => void }) {
  const account = useAccount();
  const [adult, setAdult] = useState(false);
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const renewed = !!account.preferences.consentVersion && account.preferences.consentVersion !== CONSENT_VERSION;
  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      const saved = await request<{ consentVersion: string; consentedAt: string }>(
        '/v1/consent',
        account.user.id,
        {},
        'POST',
      );
      onAgreed({ ...account, preferences: { ...account.preferences, ...saved } });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-gutter px-4 py-10">
      <Logo />
      <h1 className="text-2xl font-semibold tracking-tight">
        {renewed ? 'The pilot terms have changed' : 'Before you start'}
      </h1>
      <DataNote />
      <div className="flex flex-col gap-snug border-t pt-gutter">
        <label className="flex items-start gap-2 text-base">
          <Checkbox checked={adult} onCheckedChange={c => setAdult(c === true)} className="mt-1" />
          <span>I am 18 or older.</span>
        </label>
        <label className="flex items-start gap-2 text-base">
          <Checkbox checked={agree} onCheckedChange={c => setAgree(c === true)} className="mt-1" />
          <span>I have read what Rawi keeps and where it goes, and I agree to take part in the pilot.</span>
        </label>
        {error && <p className="text-danger-text text-sm">{error}</p>}
        <div className="flex flex-wrap gap-tight">
          <Button onClick={() => void submit()} disabled={!adult || !agree} loading={busy}>
            Agree and continue
          </Button>
          <Button variant="ghost" onClick={onSignOut}>
            Sign out
          </Button>
        </div>
        <p className="text-muted-foreground text-sm">
          The pilot is open to adults only. If you are under 18, please sign out.
        </p>
      </div>
    </main>
  );
}

/** Delete the account. The student types DELETE, since nothing can bring the account back. */
export function DeleteAccount({ onDeleted }: { onDeleted: () => void }) {
  const account = useAccount();
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      await request('/v1/account/delete', account.user.id, { confirm: 'DELETE' }, 'POST');
      onDeleted();
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  };
  return (
    <section className="flex flex-col gap-snug">
      <h2 className="text-md font-semibold tracking-tight">Delete account</h2>
      <p className="text-muted-foreground max-w-prose text-base">
        Removes your account, every course, material, file, answer, tutor conversation, plan, goal and agent record, at
        once. It cannot be undone. Your Google account itself is not affected.
      </p>
      <div className="flex flex-wrap items-center gap-tight">
        <Input
          aria-label="Type DELETE to confirm"
          placeholder="Type DELETE to confirm"
          className="w-56"
          value={confirm}
          onChange={e => setConfirm(e.target.value)}
        />
        <Button variant="destructive" disabled={confirm !== 'DELETE'} loading={busy} onClick={() => void submit()}>
          Delete my account
        </Button>
      </div>
      {error && <p className="text-danger-text text-sm">{error}</p>}
    </section>
  );
}
