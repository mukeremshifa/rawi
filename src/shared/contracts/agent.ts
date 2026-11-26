import { z } from 'zod';
import { uuid } from './workspace';
import { calendarDate } from './planner';

/**
 * The study agent: a goal per course, and a log of every run and every action it took, with the
 * reason in plain words. Code decides each action. The log is what the student reads on
 * "What Rawi did and why".
 */

export type GoalSource = 'student' | 'syllabus';
export type GoalStatus = 'active' | 'done' | 'dropped';

export interface StudyGoal {
  id: string;
  courseId: string;
  title: string;
  /** The day of the assessment the goal works toward, or null for an open goal. */
  date: string | null;
  assessmentId: string | null;
  scopeId: string;
  source: GoalSource;
  status: GoalStatus;
  createdAt: string;
}

export const goalInput = z.strictObject({
  operationId: uuid,
  title: z.string().trim().min(1).max(120),
  date: calendarDate.nullable(),
  assessmentId: uuid.nullable(),
});
export const goalPatch = z.strictObject({
  operationId: uuid,
  status: z.enum(['active', 'done', 'dropped']),
});

/** What started a run. */
export type AgentTrigger = 'schedule' | 'session' | 'student';
export type AgentRunState = 'running' | 'done' | 'failed';

/** Every tool the agent may call. None of them marks an answer, writes evidence or spends past the caps. */
export const AGENT_TOOLS = [
  'set_goal',
  'close_goal',
  'plan_week',
  'prepare_questions',
  'prepare_glossary',
  'schedule_check',
  'send_reminder',
  'update_tutor_notes',
] as const;
export type AgentTool = (typeof AGENT_TOOLS)[number];

export const TOOL_LABEL: Record<AgentTool, string> = {
  set_goal: 'Set a goal',
  close_goal: 'Closed a goal',
  plan_week: 'Planned the week',
  prepare_questions: 'Prepared questions',
  prepare_glossary: 'Prepared a glossary',
  schedule_check: 'Scheduled a check',
  send_reminder: 'Sent a reminder',
  update_tutor_notes: 'Updated tutor notes',
};

/** What the agent saw before it decided, kept with the run so the log can show it. */
export interface AgentObservation {
  courses: {
    courseId: string;
    name: string;
    goal: string | null;
    daysToGoal: number | null;
    shaky: number;
    due: number;
    unchecked: number;
    secure: number;
    plannedThisWeek: number;
    missed: number;
    languageSupported: number;
  }[];
  hasAvailability: boolean;
}

export interface AgentAction {
  id: string;
  runId: string;
  courseId: string | null;
  tool: AgentTool;
  decidedBy: 'code' | 'model';
  reason: string;
  outcome: string;
  status: 'done' | 'skipped' | 'failed';
  notify: boolean;
  costMicros: number;
  at: string;
}

export interface AgentRun {
  id: string;
  trigger: AgentTrigger;
  state: AgentRunState;
  startedAt: string;
  finishedAt: string | null;
  observation: AgentObservation | null;
  /** A short note on the run, written by a model when one was available, else by code. */
  summary: string | null;
  summaryBy: 'code' | 'model' | null;
  actions: AgentAction[];
}

export interface AgentView {
  goals: StudyGoal[];
  runs: AgentRun[];
  /** Plain counts over the runs shown, so the page never estimates. */
  totals: { runs: number; actions: number; byCode: number; costMicros: number };
}
