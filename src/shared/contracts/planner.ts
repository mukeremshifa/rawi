import { z } from 'zod';
import { uuid } from './workspace';
import { writeInput } from './learning';
export const calendarDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v => { const d = new Date(`${v}T12:00:00Z`); return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === v; });
const windowFields = { startMinutes: z.number().int().min(0).max(1439), endMinutes: z.number().int().min(1).max(1440) };
export const availabilityInput = z.strictObject({
  windows: z.array(z.strictObject({ id: uuid, day: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5), z.literal(6)]), ...windowFields }).refine(w => w.endMinutes > w.startMinutes)).max(100),
  exceptions: z.array(z.strictObject({ id: uuid, date: calendarDate, windows: z.array(z.strictObject(windowFields).refine(w => w.endMinutes > w.startMinutes)).max(10), note: z.string().max(1000).optional() })).max(365), sessionMinutes: z.number().int().min(10).max(120),
}).refine(v => new Set(v.exceptions.map(e => e.date)).size === v.exceptions.length);
export const assessmentInput = z.strictObject({ title: z.string().trim().min(1).max(200), type: z.enum(['quiz', 'midterm', 'final', 'essay', 'presentation', 'other']), date: calendarDate, time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(), durationMinutes: z.number().int().min(1).max(1440).optional(), topicIds: z.array(uuid).max(200), weightPercent: z.number().min(0).max(100).optional(), notes: z.string().max(4000).optional() });
export const sessionInput = z.strictObject({ courseId: uuid, date: calendarDate, startMinutes: z.number().int().min(0).max(1439), durationMinutes: z.number().int().min(5).max(1440), title: z.string().trim().min(1).max(200), activity: z.enum(['tutor', 'read', 'practice', 'flashcards', 'exam', 'review', 'other']), topicIds: z.array(uuid).max(200), assessmentId: uuid.optional(), status: z.enum(['planned', 'skipped']).default('planned'), locked: z.boolean().default(true) });
export const checkInInput = z.strictObject({ courseId: uuid.optional(), topicId: uuid.optional(), mood: z.enum(['less-time', 'on-track', 'struggling', 'confident']), minutesToday: z.number().int().min(0).max(1440).optional(), note: z.string().max(4000).optional() }).refine(v => !v.topicId || !!v.courseId);
export const plannerWrite = writeInput.extend({ availability: availabilityInput });
export const scheduleWrite = writeInput.extend({ id: uuid, session: sessionInput });
export const assessmentWrite = writeInput.extend({ id: uuid, assessment: assessmentInput });
export const proposalInput = z.strictObject({ operationId: uuid, weekStart: calendarDate });
export function zonedParts(now: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now);
  const value = (key: string) => parts.find(p => p.type === key)!.value;
  return { date: `${value('year')}-${value('month')}-${value('day')}`, minutes: Number(value('hour')) * 60 + Number(value('minute')) };
}
