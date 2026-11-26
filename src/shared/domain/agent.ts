import type { AgentTool } from '../contracts/agent';
import { addDays, daysBetweenDates } from './planner';

/**
 * The agent's policy: what to do next, decided in code from what it observed. Each decision names
 * a tool, its input, the reason in plain words and a key. A key already acted on is not acted on
 * again, so a reminder or a plan is never repeated by the next sweep.
 */

export interface PolicyTopic {
  topicId: string;
  title: string;
  level: 'not-checked' | 'shaky' | 'learning' | 'secure';
  due: number;
}
export interface PolicyGoal {
  id: string;
  title: string;
  date: string | null;
  scopeId: string;
}
export interface PolicySection {
  materialId: string;
  key: string;
  heading: string;
  /** Local date of the right answer given with language support. */
  on: string;
}
export interface PolicyCourse {
  courseId: string;
  name: string;
  goals: PolicyGoal[];
  /** Dated assessments still to come that have no goal yet. */
  ungoaled: { id: string; title: string; date: string }[];
  topics: PolicyTopic[];
  plannedThisWeek: number;
  /** Planned sessions in the last week whose day passed without them being done. */
  missed: { id: string; title: string; date: string }[];
  /** Sections whose latest right answer used language support and that have no unaided right answer since. */
  languageSupported: PolicySection[];
  /** Results in the last fortnight given with language support. */
  languageSupportCount: number;
  glossaryReady: boolean;
}
export interface PolicyInput {
  today: string;
  weekStart: string;
  hasAvailability: boolean;
  courses: PolicyCourse[];
  /** Keys acted on before, so nothing repeats. */
  done: Set<string>;
}
export interface Decision {
  tool: AgentTool;
  courseId: string | null;
  key: string;
  reason: string;
  input: Record<string, unknown>;
  /** Shown among the student's reminders. */
  notify?: boolean;
  remindOn?: string;
}

/** How far ahead a dated assessment becomes a goal. */
const GOAL_HORIZON = 120;
/** How close a goal must be before Rawi writes questions for it ahead of time. */
const PREPARE_WITHIN = 30;
/** Countdown days that get a reminder. */
const COUNTDOWN = [14, 7, 3, 1];
/** Days after a right answer with language support before the unaided check. */
const UNAIDED_AFTER = 3;
/** Results with language support in a fortnight before Rawi offers a glossary. */
const GLOSSARY_AFTER = 2;

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const inDays = (n: number) => (n === 0 ? 'today' : n === 1 ? 'tomorrow' : `in ${n} days`);

export function decide(input: PolicyInput): Decision[] {
  const out: Decision[] = [];
  const add = (d: Decision) => {
    if (input.done.has(d.key) || out.some(o => o.key === d.key)) return;
    out.push(d);
  };
  const { today } = input;
  let wantsPlan: string[] = [];

  for (const c of input.courses) {
    for (const a of c.ungoaled) {
      const days = daysBetweenDates(today, a.date);
      if (days < 0 || days > GOAL_HORIZON) continue;
      add({
        tool: 'set_goal',
        courseId: c.courseId,
        key: `goal:${a.id}`,
        reason: `${a.title} in ${c.name} is ${inDays(days)}, on ${a.date}, so Rawi set it as a goal.`,
        input: { assessmentId: a.id, title: a.title, date: a.date },
      });
      wantsPlan.push(`${a.title} is ${inDays(days)}`);
    }

    const shaky = c.topics.filter(t => t.level === 'shaky');
    const due = c.topics.reduce((n, t) => n + t.due, 0);
    const unchecked = c.topics.filter(t => t.level === 'not-checked');

    for (const g of c.goals) {
      if (g.date && g.date < today) {
        add({
          tool: 'close_goal',
          courseId: c.courseId,
          key: `close:${g.id}`,
          reason: `${g.title} was on ${g.date}, so Rawi closed the goal.`,
          input: { goalId: g.id },
        });
        continue;
      }
      const days = g.date ? daysBetweenDates(today, g.date) : null;
      if (days !== null && COUNTDOWN.includes(days)) {
        const state = [
          shaky.length ? `${plural(shaky.length, 'topic')} still shaky` : '',
          unchecked.length ? `${plural(unchecked.length, 'topic')} not checked yet` : '',
        ]
          .filter(Boolean)
          .join(' and ');
        add({
          tool: 'send_reminder',
          courseId: c.courseId,
          key: `countdown:${g.id}:${days}`,
          reason: `${g.title} in ${c.name} is ${inDays(days)}.${state ? ` ${state[0]!.toUpperCase()}${state.slice(1)}.` : ' Every topic has been checked.'}`,
          input: { title: `${g.title} ${inDays(days)}`, to: `/course/${c.courseId}/practice` },
          notify: true,
          remindOn: today,
        });
      }
      if ((days === null || days <= PREPARE_WITHIN) && (shaky.length || due || unchecked.length))
        add({
          tool: 'prepare_questions',
          courseId: c.courseId,
          key: `prepare:${g.id}:${today}`,
          reason: `${g.title} has ${joinWords(
            [
              shaky.length ? plural(shaky.length, 'shaky topic') : '',
              due ? `${plural(due, 'section')} due for review` : '',
              unchecked.length ? `${plural(unchecked.length, 'topic')} not checked yet` : '',
            ].filter(Boolean),
          )}, so Rawi made sure there are unseen questions for the next session.`,
          input: { goalId: g.id, scopeId: g.scopeId },
        });
      if (!c.plannedThisWeek && days !== null && days >= 0)
        wantsPlan.push(`nothing is planned this week for ${c.name}, ${days} days before ${g.title}`);
    }

    if (c.missed.length)
      wantsPlan.push(`${plural(c.missed.length, 'planned session')} in ${c.name} passed without being done`);

    // Language support: an unaided check a few days after, and a glossary once it keeps happening.
    for (const s of c.languageSupported) {
      const on = addDays(s.on, UNAIDED_AFTER);
      add({
        tool: 'schedule_check',
        courseId: c.courseId,
        key: `unaided:${s.materialId}:${s.key}:${s.on}`,
        reason: `The answer on "${s.heading}" was right, with language support. Rawi scheduled a check without support for ${on}, so the section counts once it is answered alone.`,
        input: {
          materialId: s.materialId,
          key: s.key,
          heading: s.heading,
          date: on < today ? today : on,
          title: `Try "${s.heading}" without support`,
          to: `/course/${c.courseId}/practice`,
        },
        notify: true,
        remindOn: on < today ? today : on,
      });
    }
    if (c.languageSupportCount >= GLOSSARY_AFTER && !c.glossaryReady)
      add({
        tool: 'prepare_glossary',
        courseId: c.courseId,
        key: `glossary:${c.courseId}`,
        reason: `${plural(c.languageSupportCount, 'answer')} in ${c.name} used language support in the last two weeks, so Rawi prepared the course glossary.`,
        input: { title: `The ${c.name} glossary is ready`, to: `/course/${c.courseId}/glossary` },
        notify: true,
        remindOn: today,
      });
    if (c.languageSupportCount >= GLOSSARY_AFTER)
      add({
        tool: 'update_tutor_notes',
        courseId: c.courseId,
        key: `notes-language:${c.courseId}:${input.weekStart}`,
        reason: `Language support came up ${plural(c.languageSupportCount, 'time')} this fortnight, so Rawi told the tutor to offer key terms in the first language before a check.`,
        input: {
          line: 'Language: the student often understands the idea but needs key terms in their first language. Offer the glossary before a check, and an explanation in their first language after one.',
        },
      });
  }

  wantsPlan = [...new Set(wantsPlan)];
  if (wantsPlan.length && input.courses.some(c => c.goals.length || c.ungoaled.length)) {
    if (input.hasAvailability)
      add({
        tool: 'plan_week',
        courseId: null,
        key: `plan:${input.weekStart}:${today}`,
        reason: `${capital(joinWords(wantsPlan))}, so Rawi planned the week.`,
        input: { weekStart: input.weekStart },
      });
    else
      add({
        tool: 'send_reminder',
        courseId: null,
        key: `availability:${input.weekStart}`,
        reason: `Rawi could not plan the week because no study times are set.`,
        input: { title: 'Add your study times so Rawi can plan your week', to: '/planner?availability=1' },
        notify: true,
        remindOn: today,
      });
  }
  return out;
}

const capital = (text: string) => `${text.charAt(0).toUpperCase()}${text.slice(1)}`;
function joinWords(list: string[]) {
  return list.length < 2 ? (list[0] ?? '') : `${list.slice(0, -1).join(', ')} and ${list.at(-1)}`;
}
/** The run's note in code, used when no model writes one. */
export function codeSummary(decisions: { tool: AgentTool; status: string }[]) {
  const done = decisions.filter(d => d.status === 'done');
  if (!done.length) return 'Rawi checked your courses. Nothing needed doing.';
  const counts = new Map<AgentTool, number>();
  for (const d of done) counts.set(d.tool, (counts.get(d.tool) ?? 0) + 1);
  const words: Record<AgentTool, (n: number) => string> = {
    set_goal: n => `set ${plural(n, 'goal')}`,
    close_goal: n => `closed ${plural(n, 'goal')}`,
    plan_week: () => 'planned the week',
    prepare_questions: n => `prepared questions for ${plural(n, 'goal')}`,
    prepare_glossary: n => `prepared ${plural(n, 'glossary', 'glossaries')}`,
    schedule_check: n => `scheduled ${plural(n, 'check')} without support`,
    send_reminder: n => `sent ${plural(n, 'reminder')}`,
    update_tutor_notes: () => 'updated the tutor notes',
  };
  return `Rawi ${joinWords([...counts].map(([tool, n]) => words[tool](n)))}.`;
}
