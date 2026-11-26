import { useMemo, useState, type ReactNode } from 'react';
import { NavLink, Navigate, useParams } from 'react-router-dom';
import { preferencesPatch, type Me, type Preferences, type PreferenceFields } from '@shared/contracts/workspace';

import { MOTION_LABEL, READING_SIZE_LABEL, THEME_LABEL } from '@/components/domain';
import { Page, PageHeader, SectionHeader } from '@/components/layout';
import { ErrorState, Notice, PageLoading, SaveIndicator } from '@/components/states';
import { Button } from '@/components/ui/button';
import { CheckboxRow } from '@/components/ui/checkbox';
import { Combobox } from '@/components/ui/combobox';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field, FieldSet } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { NumberField } from '@/components/ui/number-field';
import { RadioGroup } from '@/components/ui/radio-group';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { Select } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { useAccount } from '@/lib/account';
import { request, errorMessage } from '@/lib/api';
import { useApi, useSave } from '@/lib/data';
import { useUnsentGuard } from '@/lib/hooks';
import { usePageMeta } from '@/lib/shell';
import { cn } from '@/lib/utils';

const SECTIONS = [
  { id: 'profile', label: 'Profile' },
  { id: 'study', label: 'Study defaults' },
  { id: 'appearance', label: 'Appearance' },
  { id: 'ai', label: 'AI' },
] as const;
type Section = (typeof SECTIONS)[number]['id'];

const TIMEZONES = (() => {
  try {
    return Intl.supportedValuesOf('timeZone');
  } catch {
    return ['UTC'];
  }
})();

/** Settings: Profile, Study defaults and Appearance, each a group of Field rows. */
export function Settings({
  onProfile,
  onPreferences,
}: {
  onProfile: (user: Me['user']) => void;
  onPreferences: (value: Preferences) => void;
}) {
  const { section = 'profile' } = useParams();
  usePageMeta({ crumbs: [{ label: 'Settings' }] });
  if (section === 'preferences') return <Navigate replace to="/settings/study" />;
  if (!SECTIONS.some(s => s.id === section)) return <Navigate replace to="/settings" />;
  return (
    <Page width="wide">
      <PageHeader title="Settings" />
      <div className="flex flex-col gap-gutter md:flex-row md:gap-section">
        <nav aria-label="Settings sections" className="flex shrink-0 gap-1 overflow-x-auto md:w-44 md:flex-col">
          {SECTIONS.map(s => (
            <NavLink
              key={s.id}
              to={`/settings/${s.id}`}
              end
              className={({ isActive }) =>
                cn(
                  'flex h-8 shrink-0 items-center rounded-md px-2.5 text-base whitespace-nowrap outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  isActive || section === s.id
                    ? 'bg-selected font-medium'
                    : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                )
              }
            >
              {s.label}
            </NavLink>
          ))}
        </nav>
        <div className="min-w-0 flex-1">
          {section === 'profile' ? (
            <ProfileSection onSaved={onProfile} />
          ) : section === 'ai' ? (
            <AiSection />
          ) : (
            <PreferencesSection section={section as Exclude<Section, 'profile' | 'ai'>} onSaved={onPreferences} />
          )}
        </div>
      </div>
    </Page>
  );
}

function Group({
  title,
  description,
  children,
  footer,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-1">
      <SectionHeader title={title} description={description} />
      <div className="divide-y border-y">{children}</div>
      {footer && <div className="flex flex-wrap items-center justify-end gap-snug pt-3">{footer}</div>}
    </section>
  );
}

function ProfileSection({ onSaved }: { onSaved: (user: Me['user']) => void }) {
  const { user } = useAccount();
  const [name, setName] = useState(user.name);
  const save = useSave();
  const dirty = name !== user.name;
  useUnsentGuard(dirty || save.pending);
  const submit = () =>
    save.run<Me['user']>(
      { path: '/v1/profile', method: 'PATCH', body: { name } },
      {
        id: `profile:${name}`,
        onSuccess: saved => {
          onSaved(saved);
          setName(saved.name);
        },
      },
    );
  return (
    <form
      onSubmit={e => {
        e.preventDefault();
        submit();
      }}
    >
      <Group
        title="Profile"
        footer={
          <>
            <SaveIndicator status={save.status} dirty={dirty} error={save.error} onRetry={save.retry} />
            <Button type="submit" loading={save.busy} disabled={!dirty || !name.trim()}>
              Save profile
            </Button>
          </>
        }
      >
        <Field layout="row" label="Display name" required>
          <Input maxLength={80} value={name} onChange={e => setName(e.target.value)} autoComplete="name" />
        </Field>
        <Field layout="row" label="Email" description="You sign in with Google, which manages this address.">
          <Input value={user.email} readOnly disabled />
        </Field>
      </Group>
    </form>
  );
}

type Draft = { values: PreferenceFields; timezone: string };

function PreferencesSection({
  section,
  onSaved,
}: {
  section: Exclude<Section, 'profile' | 'ai'>;
  onSaved: (value: Preferences) => void;
}) {
  const account = useAccount();
  const [base, setBase] = useState(account.preferences);
  const [draft, setDraft] = useState<Draft>({ values: base.values, timezone: base.timezone });
  const [review, setReview] = useState<Preferences | null>(null);
  const [reviewError, setReviewError] = useState('');
  const save = useSave();
  const dirty = draft.timezone !== base.timezone || JSON.stringify(draft.values) !== JSON.stringify(base.values);
  useUnsentGuard(dirty || save.pending);
  const set = (patch: Partial<PreferenceFields>) => setDraft(d => ({ ...d, values: { ...d.values, ...patch } }));
  const invalid = useMemo(() => {
    const parsed = preferencesPatch.safeParse({
      ...draft.values,
      timezone: draft.timezone,
      expectedRevision: base.revision,
    });
    return parsed.success ? '' : 'Check the workspace name, question count and timezone.';
  }, [draft, base.revision]);
  const submit = () => {
    if (invalid) return;
    save.run<Preferences>(
      {
        path: '/v1/preferences',
        method: 'PATCH',
        body: {
          ...draft.values,
          timezone: draft.timezone,
          expectedRevision: base.revision,
          operationId: crypto.randomUUID(),
        },
      },
      {
        id: `preferences:${base.revision}`,
        onSuccess: saved => {
          setBase(saved);
          setDraft({ values: saved.values, timezone: saved.timezone });
          onSaved(saved);
        },
      },
    );
  };
  const loadReview = async () => {
    setReviewError('');
    try {
      setReview(await request<Preferences>('/v1/preferences', account.user.id));
    } catch (e) {
      setReviewError(errorMessage(e));
    }
  };
  const footer = (
    <>
      <SaveIndicator
        status={save.status}
        dirty={dirty}
        error={save.conflict ? 'Your settings changed in another tab.' : save.error}
        onRetry={save.conflict ? undefined : save.retry}
      />
      {save.conflict && (
        <Button type="button" variant="secondary" onClick={() => void loadReview()}>
          Review latest
        </Button>
      )}
      <Button type="submit" loading={save.busy} disabled={!dirty || !!invalid || save.conflict}>
        Save changes
      </Button>
    </>
  );
  const v = draft.values;
  return (
    <form
      onSubmit={e => {
        e.preventDefault();
        submit();
      }}
      className="flex flex-col gap-section"
    >
      {section === 'study' && (
        <>
          <Group title="Workspace">
            <Field layout="row" label="Workspace name" required>
              <Input maxLength={80} value={v.workspaceName} onChange={e => set({ workspaceName: e.target.value })} />
            </Field>
            <Field layout="row" label="Timezone" description="Used for today's plan, deadlines and streaks.">
              <Combobox
                value={draft.timezone}
                onValueChange={tz => setDraft(d => ({ ...d, timezone: tz }))}
                options={[...new Set([draft.timezone, 'UTC', ...TIMEZONES])].map(tz => ({
                  value: tz,
                  label: tz.replace(/_/g, ' '),
                }))}
                searchPlaceholder="Search timezones"
              />
            </Field>
          </Group>
          <Group title="Practice">
            <Field layout="row" label="Questions per set" description="Used for quick start. Between 1 and 30.">
              <NumberField
                value={v.questionCount}
                onValueChange={n => set({ questionCount: n ?? 1 })}
                min={1}
                max={30}
              />
            </Field>
            <Field layout="row" label="Feedback">
              <RadioGroup
                aria-label="Feedback"
                value={v.feedback}
                onValueChange={feedback => set({ feedback })}
                options={[
                  { value: 'immediate', label: 'After each answer' },
                  { value: 'end', label: 'At the end of the set' },
                ]}
              />
            </Field>
            <Field layout="row" label="Allow hints" description="Hinted answers count as assisted work.">
              <Switch checked={v.hints} onCheckedChange={hints => set({ hints })} />
            </Field>
          </Group>
          <Group title="Reminders" description="Shown in the app. Nothing is sent by email." footer={footer}>
            <div className="grid gap-x-gutter gap-y-1.5 py-snug sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)]">
              <span className="text-sm font-medium sm:pt-1">Remind me about</span>
              <FieldSet legend={<span className="sr-only">Reminder types</span>}>
                <CheckboxRow
                  label="Upcoming assessments"
                  checked={v.reminders.assessments}
                  onCheckedChange={c => set({ reminders: { ...v.reminders, assessments: c === true } })}
                />
                <CheckboxRow
                  label="Planned study"
                  checked={v.reminders.study}
                  onCheckedChange={c => set({ reminders: { ...v.reminders, study: c === true } })}
                />
                <CheckboxRow
                  label="Topics due for review"
                  checked={v.reminders.review}
                  onCheckedChange={c => set({ reminders: { ...v.reminders, review: c === true } })}
                />
              </FieldSet>
            </div>
            <Field layout="row" label="How far ahead">
              <Select
                className="w-44"
                value={String(v.reminders.days)}
                onValueChange={d => set({ reminders: { ...v.reminders, days: Number(d) as 0 | 1 | 3 | 7 } })}
                options={[
                  { value: '0', label: 'On the day' },
                  { value: '1', label: '1 day before' },
                  { value: '3', label: '3 days before' },
                  { value: '7', label: 'A week before' },
                ]}
              />
            </Field>
          </Group>
        </>
      )}
      {section === 'appearance' && (
        <Group title="Appearance" description="Applies once saved." footer={footer}>
          <Field layout="row" label="Theme">
            <SegmentedControl
              aria-label="Theme"
              value={v.theme}
              onValueChange={theme => set({ theme })}
              options={(['system', 'light', 'dark'] as const).map(value => ({ value, label: THEME_LABEL[value] }))}
            />
          </Field>
          <Field layout="row" label="Reading size" description="For readings, explanations and the tutor.">
            <SegmentedControl
              aria-label="Reading size"
              value={v.readingSize}
              onValueChange={readingSize => set({ readingSize })}
              options={(['normal', 'large', 'larger'] as const).map(value => ({
                value,
                label: READING_SIZE_LABEL[value],
              }))}
            />
          </Field>
          <Field layout="row" label="Motion">
            <SegmentedControl
              aria-label="Motion"
              value={v.motion}
              onValueChange={motion => set({ motion })}
              options={(['system', 'reduced', 'full'] as const).map(value => ({ value, label: MOTION_LABEL[value] }))}
            />
          </Field>
        </Group>
      )}
      {invalid && dirty && <p className="text-danger-text text-sm">{invalid}</p>}
      {reviewError && (
        <p role="alert" className="text-danger-text text-sm">
          {reviewError}
        </p>
      )}
      <Dialog
        open={!!review}
        onOpenChange={open => {
          if (!open) setReview(null);
        }}
      >
        {review && (
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Settings changed elsewhere</DialogTitle>
              <DialogDescription>
                Another tab saved settings after you started editing. Your edits are still here.
              </DialogDescription>
            </DialogHeader>
            <DialogBody>
              <dl className="grid grid-cols-[auto_1fr] gap-x-gutter gap-y-1 text-base">
                {Object.entries({
                  Workspace: review.values.workspaceName,
                  Timezone: review.timezone,
                  Questions: review.values.questionCount,
                  Feedback: review.values.feedback === 'immediate' ? 'After each answer' : 'At the end',
                  Hints: review.values.hints ? 'Allowed' : 'Off',
                  Theme: THEME_LABEL[review.values.theme],
                  'Reading size': READING_SIZE_LABEL[review.values.readingSize],
                  Motion: MOTION_LABEL[review.values.motion],
                }).map(([k, value]) => (
                  <div key={k} className="contents">
                    <dt className="text-muted-foreground">{k}</dt>
                    <dd>{String(value)}</dd>
                  </div>
                ))}
              </dl>
            </DialogBody>
            <DialogFooter>
              <Button
                variant="secondary"
                onClick={() => {
                  save.discard();
                  setBase(review);
                  setDraft({ values: review.values, timezone: review.timezone });
                  onSaved(review);
                  setReview(null);
                }}
              >
                Use these settings
              </Button>
              <Button
                onClick={() => {
                  save.discard();
                  setBase(review);
                  setReview(null);
                }}
              >
                Keep my edits
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    </form>
  );
}

type Funding = {
  using: 'platform' | 'institution' | 'user';
  fallback: string;
  ownKey: {
    vendor: 'bedrock' | 'vertex';
    active: boolean;
    studentRetention: 'none' | 'standard';
    monthlyCapUsd: number | null;
    savedAt: string;
  } | null;
};
type Status = {
  allowance: { todayUsd: number; dailyUsd: number | null; monthUsd: number; monthlyUsd: number | null } | null;
};
const usd = (n: number) => `$${n.toFixed(n < 1 ? 3 : 2)}`;
const EMPTY_KEY = { accessKeyId: '', secretAccessKey: '', project: '', clientEmail: '', privateKey: '' };

/**
 * Who pays for AI work. A student can add their own Bedrock or Vertex key. It is stored sealed and
 * never shown again. Allowing routes that keep prompts for what they write is a separate, visible choice.
 */
function AiSection() {
  const data = useApi<Funding>('/v1/ai/funding');
  const status = useApi<Status>('/v1/ai/status');
  const save = useSave();
  const [vendor, setVendor] = useState<'bedrock' | 'vertex'>('bedrock');
  const [fields, setFields] = useState(EMPTY_KEY);
  const [wide, setWide] = useState(false);
  const [cap, setCap] = useState<number | null>(null);
  const dirty = Object.values(fields).some(Boolean);
  useUnsentGuard(dirty || save.pending);
  if (data.isPending) return <PageLoading label="Loading AI settings" />;
  if (data.error) return <ErrorState error={data.error} onRetry={() => void data.refetch()} />;
  const f = data.data;
  const done = (value: Funding) => {
    data.setData(value);
    setFields(EMPTY_KEY);
    void status.refetch();
  };
  const credentials =
    vendor === 'bedrock'
      ? { vendor, accessKeyId: fields.accessKeyId, secretAccessKey: fields.secretAccessKey }
      : { vendor, project: fields.project, clientEmail: fields.clientEmail, privateKey: fields.privateKey };
  const a = status.data?.allowance;
  const set = (key: keyof typeof EMPTY_KEY) => (e: { target: { value: string } }) =>
    setFields(v => ({ ...v, [key]: e.target.value }));
  return (
    <div className="flex flex-col gap-section">
      <Group
        title="Who pays"
        description={f.using === 'user' ? 'AI work uses your own key.' : `AI work is paid by ${f.fallback}.`}
      >
        {a && (
          <Field layout="row" label="Used today">
            <span>
              {usd(a.todayUsd)}
              {a.dailyUsd !== null ? ` of ${usd(a.dailyUsd)}` : ''}
            </span>
          </Field>
        )}
        {a && (
          <Field layout="row" label="Used this month">
            <span>
              {usd(a.monthUsd)}
              {a.monthlyUsd !== null ? ` of ${usd(a.monthlyUsd)}` : ''}
            </span>
          </Field>
        )}
        {f.ownKey && (
          <Field
            layout="row"
            label="Use my own key"
            description={`${f.ownKey.vendor === 'bedrock' ? 'AWS Bedrock' : 'Google Vertex'} key saved ${new Date(f.ownKey.savedAt).toLocaleDateString()}.`}
          >
            <Switch
              checked={f.ownKey.active}
              onCheckedChange={on =>
                save.run<Funding>(
                  { path: '/v1/ai/funding/use', body: { source: on ? 'own' : 'platform' } },
                  { id: `use:${on}`, onSuccess: done },
                )
              }
            />
          </Field>
        )}
      </Group>
      {f.ownKey?.studentRetention === 'standard' && (
        <Notice>
          Your key lets services that keep a copy of prompts receive what you write to the tutor. Save the key again to
          change this.
        </Notice>
      )}
      <form
        onSubmit={e => {
          e.preventDefault();
          save.run<Funding>(
            {
              path: '/v1/ai/funding/key',
              method: 'PUT',
              body: { credentials, studentRetention: wide ? 'standard' : 'none', monthlyCapUsd: cap },
            },
            { id: 'key', onSuccess: done },
          );
        }}
      >
        <Group
          title={f.ownKey ? 'Replace your key' : 'Add your own key'}
          description="Your key is stored encrypted and never shown again. Rawi records what each request costs, and stops only at the cap you set."
          footer={
            <>
              {f.ownKey && (
                <Button
                  type="button"
                  variant="ghost"
                  loading={save.busy}
                  onClick={() =>
                    save.run<Funding>(
                      { path: '/v1/ai/funding/key', method: 'DELETE' },
                      { id: 'remove', onSuccess: done },
                    )
                  }
                >
                  Remove key
                </Button>
              )}
              <Button type="submit" loading={save.busy} disabled={!dirty}>
                Save key
              </Button>
            </>
          }
        >
          <Field layout="row" label="Service">
            <SegmentedControl
              aria-label="Service"
              value={vendor}
              onValueChange={setVendor}
              options={[
                { value: 'bedrock', label: 'AWS Bedrock' },
                { value: 'vertex', label: 'Google Vertex' },
              ]}
            />
          </Field>
          {vendor === 'bedrock' ? (
            <>
              <Field layout="row" label="Access key ID" required>
                <Input autoComplete="off" value={fields.accessKeyId} onChange={set('accessKeyId')} />
              </Field>
              <Field layout="row" label="Secret access key" required>
                <Input
                  type="password"
                  autoComplete="off"
                  value={fields.secretAccessKey}
                  onChange={set('secretAccessKey')}
                />
              </Field>
            </>
          ) : (
            <>
              <Field layout="row" label="Project ID" required>
                <Input autoComplete="off" value={fields.project} onChange={set('project')} />
              </Field>
              <Field layout="row" label="Service account email" required>
                <Input autoComplete="off" value={fields.clientEmail} onChange={set('clientEmail')} />
              </Field>
              <Field
                layout="row"
                label="Private key"
                description="The private_key value from the JSON key file."
                required
              >
                <Textarea rows={4} autoComplete="off" value={fields.privateKey} onChange={set('privateKey')} />
              </Field>
            </>
          )}
          <Field layout="row" label="Monthly cap" description="In US dollars. Leave empty for no cap.">
            <NumberField value={cap} onValueChange={n => setCap(n ?? null)} min={1} max={10000} />
          </Field>
          <Field
            layout="row"
            label="Allow services that keep prompts"
            description="Off keeps what you write on services that keep no copy. On widens the choice for your own content."
          >
            <Switch checked={wide} onCheckedChange={setWide} />
          </Field>
        </Group>
      </form>
      {save.error && (
        <p role="alert" className="text-danger-text text-sm">
          {save.error}
        </p>
      )}
    </div>
  );
}
