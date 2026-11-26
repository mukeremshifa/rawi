import { useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { ArchiveIcon, PencilIcon, PlusIcon, SearchIcon, Trash2Icon } from 'lucide-react';

import { Page, PageHeader, Breadcrumbs, SectionHeader, Toolbar } from '@/components/layout';
import { EmptyState, ErrorState, LoadingState, Notice, SaveIndicator } from '@/components/states';
import { EvidenceMeter, Meter } from '@/components/Meter';
import { DueLabel, Stat, OutcomeBadge } from '@/components/domain';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Calendar, addDays, toISODate } from '@/components/ui/calendar';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { CheckboxRow } from '@/components/ui/checkbox';
import { Combobox } from '@/components/ui/combobox';
import { DateField } from '@/components/ui/date-field';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  RowActions,
} from '@/components/ui/dropdown-menu';
import { Field, FieldSet } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Kbd, modKey } from '@/components/ui/kbd';
import { List, ListLoading, ListRow } from '@/components/ui/list';
import { NumberField } from '@/components/ui/number-field';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Progress } from '@/components/ui/progress';
import { RadioCards, RadioGroup } from '@/components/ui/radio-group';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { Select } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { Switch } from '@/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableEmpty,
  TableHead,
  TableHeader,
  TableLoading,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { TimeField } from '@/components/ui/time-field';
import { Hint } from '@/components/ui/tooltip';
import { useConfirm } from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';

const topics = [
  'The Columbian Exchange',
  'Conquest and the encomienda system',
  'The plantation complex',
  'Mercantilism and imperial trade',
  'Resistance and revolt',
].map((label, i) => ({ value: `t${i}`, label, group: i < 3 ? 'Module 1' : 'Module 2' }));
const today = toISODate(new Date());

function Specimen({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-snug border-t pt-base">
      <h2 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">{title}</h2>
      {children}
    </section>
  );
}

function Gallery() {
  const confirm = useConfirm();
  const [select, setSelect] = useState('');
  const [single, setSingle] = useState('t1');
  const [many, setMany] = useState<string[]>(['t0', 't3']);
  const [segment, setSegment] = useState<'active' | 'archived' | 'all'>('active');
  const [mode, setMode] = useState<'immediate' | 'end'>('immediate');
  const [count, setCount] = useState<number | null>(10);
  const [date, setDate] = useState(addDays(today, 3));
  const [time, setTime] = useState<number | null>(540);
  const [on, setOn] = useState(true);
  const [sort, setSort] = useState<'asc' | 'desc'>('desc');
  return (
    <div className="flex flex-col gap-section">
      <Specimen title="Buttons">
        <div className="flex flex-wrap items-center gap-tight">
          <Button>Start practice</Button>
          <Button variant="secondary">Add material</Button>
          <Button variant="ghost">Cancel</Button>
          <Button variant="destructive">Archive course</Button>
          <Button variant="link">Read the source</Button>
          <Button loading>Saving</Button>
          <Button disabled>Disabled</Button>
          <Hint label="Edit">
            <Button variant="ghost" size="icon" aria-label="Edit">
              <PencilIcon />
            </Button>
          </Hint>
          <Button variant="secondary" size="icon-sm" aria-label="Add">
            <PlusIcon />
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-tight">
          <Button size="sm">Small</Button>
          <Button size="md">Default</Button>
          <Button size="lg">Page action</Button>
        </div>
      </Specimen>

      <Specimen title="Fields">
        <div className="grid gap-base sm:grid-cols-2">
          <Field label="Course name" required description="Shown in lists and the sidebar.">
            <Input placeholder="Introductory statistics" />
          </Field>
          <Field label="Course name" required error="Enter a course name.">
            <Input defaultValue="" />
          </Field>
          <Field label="Goal" optional>
            <Textarea placeholder="What you want to be able to do" />
          </Field>
          <Field label="Disabled">
            <Input disabled value="Managed by Google" readOnly />
          </Field>
          <Field label="Kind">
            <Select
              value={select}
              onValueChange={setSelect}
              placeholder="Choose a kind"
              options={[
                { value: '', label: 'Any kind' },
                { value: 'reading', label: 'Reading' },
                { value: 'slides', label: 'Slides' },
              ]}
            />
          </Field>
          <Field label="Topic">
            <Combobox value={single} onValueChange={setSingle} options={topics} searchPlaceholder="Search topics" />
          </Field>
          <Field label="Topics">
            <Combobox multiple value={many} onValueChange={setMany} options={topics} placeholder="All topics" />
          </Field>
          <Field label="Questions">
            <NumberField value={count} onValueChange={setCount} min={1} max={50} />
          </Field>
          <Field label="Date">
            <DateField value={date} onValueChange={setDate} clearable />
          </Field>
          <Field label="Start time">
            <TimeField value={time} onValueChange={setTime} />
          </Field>
          <Field label="Minutes">
            <NumberField value={30} onValueChange={() => {}} suffix="min" />
          </Field>
        </div>
        <div className="flex flex-col">
          <Field layout="row" label="Allow hints" description="Hints count as assisted work.">
            <Switch checked={on} onCheckedChange={setOn} />
          </Field>
          <Field layout="row" label="Workspace name">
            <Input defaultValue="My workspace" />
          </Field>
        </div>
        <FieldSet legend="Reminders">
          <CheckboxRow label="Upcoming assessments" defaultChecked />
          <CheckboxRow label="Planned study" description="On the day of each planned session." />
          <CheckboxRow label="Disabled option" disabled />
        </FieldSet>
      </Specimen>

      <Specimen title="Choice">
        <SegmentedControl
          aria-label="Status"
          value={segment}
          onValueChange={setSegment}
          options={[
            { value: 'active', label: 'Active' },
            { value: 'archived', label: 'Archived' },
            { value: 'all', label: 'All' },
          ]}
        />
        <RadioGroup
          aria-label="Feedback"
          value={mode}
          onValueChange={setMode}
          options={[
            { value: 'immediate', label: 'After each answer' },
            { value: 'end', label: 'At the end', description: 'See everything once you submit.' },
          ]}
        />
        <RadioCards
          aria-label="Feedback timing"
          value={mode}
          onValueChange={setMode}
          options={[
            { value: 'immediate', label: 'After each answer', description: 'Check as you go.' },
            { value: 'end', label: 'At the end', description: 'Like a real test.' },
          ]}
        />
      </Specimen>

      <Specimen title="Tabs">
        <Tabs defaultValue="sets">
          <TabsList>
            <TabsTrigger value="sets">Saved sets</TabsTrigger>
            <TabsTrigger value="history">History</TabsTrigger>
            <TabsTrigger value="off" disabled>
              Disabled
            </TabsTrigger>
          </TabsList>
          <TabsContent value="sets">
            <p className="text-muted-foreground">Saved sets content.</p>
          </TabsContent>
          <TabsContent value="history">
            <p className="text-muted-foreground">History content.</p>
          </TabsContent>
        </Tabs>
      </Specimen>

      <Specimen title="Overlays">
        <div className="flex flex-wrap gap-tight">
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="secondary">Dialog</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>New course</DialogTitle>
                <DialogDescription>Name it now. You can add topics next.</DialogDescription>
              </DialogHeader>
              <DialogBody>
                <Field label="Course name" required>
                  <Input autoFocus />
                </Field>
              </DialogBody>
              <DialogFooter>
                <Button variant="secondary">Cancel</Button>
                <Button>Create course</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <Button
            variant="secondary"
            onClick={async () => {
              const yes = await confirm({
                title: 'Discard unsaved changes?',
                description: 'Your edits on this page have not been saved.',
                confirmLabel: 'Discard changes',
                destructive: true,
              });
              toast(yes ? 'Discarded' : 'Kept editing');
            }}
          >
            AlertDialog
          </Button>
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="secondary">Sheet</Button>
            </SheetTrigger>
            <SheetContent>
              <SheetHeader>
                <SheetTitle>Add material</SheetTitle>
              </SheetHeader>
              <SheetBody>
                <Field label="Title" required>
                  <Input />
                </Field>
                <Field label="Text">
                  <Textarea className="min-h-48" />
                </Field>
              </SheetBody>
              <SheetFooter>
                <Button variant="secondary">Cancel</Button>
                <Button>Add material</Button>
              </SheetFooter>
            </SheetContent>
          </Sheet>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="secondary">Popover</Button>
            </PopoverTrigger>
            <PopoverContent>
              <p className="font-medium">Reminders</p>
              <p className="text-muted-foreground text-sm">Nothing due today.</p>
            </PopoverContent>
          </Popover>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="secondary">DropdownMenu</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem>
                <PencilIcon />
                Rename
              </DropdownMenuItem>
              <DropdownMenuItem>
                <ArchiveIcon />
                Archive
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem destructive>
                <Trash2Icon />
                Remove
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button variant="secondary" onClick={() => toast.success('Course archived')}>
            Toast
          </Button>
        </div>
        <Calendar value={date} onSelect={setDate} />
      </Specimen>

      <Specimen title="Table">
        <Toolbar
          actions={
            <Button size="md">
              <PlusIcon />
              Add material
            </Button>
          }
        >
          <div className="relative w-56 max-w-full">
            <SearchIcon
              className="text-muted-foreground absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2"
              aria-hidden
            />
            <Input placeholder="Search" className="pl-8" />
          </div>
          <SegmentedControl
            aria-label="Status"
            value={segment}
            onValueChange={setSegment}
            options={[
              { value: 'active', label: 'Active' },
              { value: 'archived', label: 'Archived' },
            ]}
          />
        </Toolbar>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Title</TableHead>
              <TableHead>Kind</TableHead>
              <TableHead sort={sort} onSort={() => setSort(sort === 'asc' ? 'desc' : 'asc')}>
                Updated
              </TableHead>
              <TableHead className="w-8">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {['Grant, Tribute and Labour', 'Sugar and the Commercial System'].map((t, i) => (
              <TableRow key={t}>
                <TableCell className="font-medium">{t}</TableCell>
                <TableCell className="text-muted-foreground">Reading</TableCell>
                <TableCell className="text-muted-foreground tabular">{i + 2} Oct</TableCell>
                <TableCell>
                  <RowActions>
                    <DropdownMenuItem>Open</DropdownMenuItem>
                    <DropdownMenuItem>Archive</DropdownMenuItem>
                  </RowActions>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <Table>
          <TableBody>
            <TableLoading colSpan={3} rows={3} />
          </TableBody>
        </Table>
        <Table>
          <TableBody>
            <TableEmpty colSpan={3}>No materials match these filters.</TableEmpty>
          </TableBody>
        </Table>
      </Specimen>

      <Specimen title="List">
        <List>
          <ListRow
            to="#"
            title="Sample lab: The Atlantic World"
            meta="6 topics · Quiz in 4 days"
            trailing="Yesterday"
            leading={<Avatar name="Atlantic World" shape="square" />}
            actions={
              <RowActions>
                <DropdownMenuItem>Archive</DropdownMenuItem>
              </RowActions>
            }
          />
          <ListRow
            to="#"
            title="Statistics"
            meta="8 topics"
            trailing="3 days ago"
            leading={<Avatar name="Statistics" shape="square" />}
          />
        </List>
        <ListLoading rows={2} />
      </Specimen>

      <Specimen title="Status">
        <div className="flex flex-wrap items-center gap-tight">
          <Badge>Archived</Badge>
          <Badge variant="outline">Draft</Badge>
          <Badge variant="accent">Current</Badge>
          <Badge variant="success">Correct</Badge>
          <Badge variant="warning">Partly right</Badge>
          <Badge variant="danger">Failed</Badge>
          <OutcomeBadge outcome="correct" />
          <OutcomeBadge outcome="partial" />
          <OutcomeBadge outcome="incorrect" />
          <OutcomeBadge outcome="skipped" />
        </div>
        <div className="flex flex-col gap-tight">
          <EvidenceMeter level="not-checked" />
          <EvidenceMeter level="practising" />
          <EvidenceMeter level="independent-once" />
          <EvidenceMeter level="retained" />
        </div>
        <div className="grid max-w-md gap-tight">
          <Meter value={4 / 11} label="Topics with independent evidence" />
          <Progress value={62} />
          <Progress value={null} />
        </div>
        <div className="flex flex-wrap gap-section">
          <Stat value={12} label="Day streak" />
          <Stat value="6/22" label="Marks" />
          <Stat value="—" label="Last score" />
        </div>
        <div className="flex flex-wrap gap-base">
          <DueLabel date={today} />
          <DueLabel date={addDays(today, 2)} />
          <DueLabel date={addDays(today, 9)} />
          <DueLabel date={addDays(today, -3)} />
        </div>
        <div className="flex flex-wrap items-center gap-base">
          <SaveIndicator status="idle" dirty />
          <SaveIndicator status="saving" />
          <SaveIndicator status="saved" />
          <SaveIndicator status="failed" error="Could not connect." onRetry={() => {}} />
        </div>
        <div className="flex flex-wrap items-center gap-tight">
          <Kbd>{modKey}</Kbd>
          <Kbd>K</Kbd>
          <Kbd>Enter</Kbd>
          <Avatar name="Mukerem Shifa" />
          <Avatar name="Mukerem Shifa" size="lg" />
        </div>
      </Specimen>

      <Specimen title="States">
        <LoadingState lines={3} />
        <EmptyState
          compact
          title="No courses yet"
          description="Add a course to organise its topics, materials and practice."
          action={
            <Button size="md">
              <PlusIcon />
              New course
            </Button>
          }
        />
        <ErrorState detail="Could not connect. Keep this page open and retry." onRetry={() => {}} />
        <Notice>Question generation isn't available yet.</Notice>
        <Card>
          <CardHeader>
            <CardTitle>Card</CardTitle>
            <CardDescription>Only for a separate object.</CardDescription>
          </CardHeader>
          <CardContent>Content</CardContent>
        </Card>
      </Specimen>

      <Specimen title="Type">
        <div className="flex flex-col gap-2">
          <p className="font-serif text-2xl">Display 32 serif</p>
          <p className="text-xl font-semibold">Page title 24</p>
          <p className="text-lg font-semibold">20</p>
          <p className="text-md">Body 16</p>
          <p className="text-base">Interface 14</p>
          <p className="text-sm">Secondary 13</p>
          <p className="text-xs">Caption 12</p>
          <p className="rawi-prose ui-reading font-serif">
            Reading text follows the reading-size preference and holds a measure of about sixty-eight characters, so a
            long passage stays comfortable to read.
          </p>
        </div>
        <Separator />
      </Specimen>
    </div>
  );
}

/** Development only: every kit component in every state, light and dark. */
export default function Kit() {
  return (
    <Page width="full">
      <div className="px-4 py-6 sm:px-gutter">
        <Breadcrumbs items={[{ label: 'Development', to: '/' }, { label: 'Kit' }]} />
        <PageHeader
          className="mt-2"
          title="Component kit"
          description="Every component in every state, in both themes."
        />
      </div>
      <div className="grid xl:grid-cols-2">
        {['light', 'dark'].map(theme => (
          <div
            key={theme}
            className={cn(theme, 'bg-background text-foreground border-t px-4 py-6 sm:px-gutter xl:border-r')}
          >
            <SectionHeader title={theme === 'light' ? 'Light' : 'Dark'} className="mb-base" />
            <Gallery />
          </div>
        ))}
      </div>
    </Page>
  );
}
