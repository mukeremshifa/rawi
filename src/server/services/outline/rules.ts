import type { AssessmentType } from '../../../shared/domain/types';
import { OUTLINE_MAX } from '../../../shared/contracts/outline';
import {
  normalTitle,
  SUBSTANTIAL_WORDS,
  type AssignInput,
  type Assignment,
  type OutlineProvider,
  type SyllabusInput,
  type SyllabusReading,
} from './provider';

/**
 * The rules pass, used without a key or budget. It reads structure rather
 * than meaning: schedule tables first, then headings, then list items and
 * lines shaped like "Week 3: Estimation". It writes no summaries of its own.
 */
type Topic = SyllabusReading['topics'][number];
type Assessment = SyllabusReading['assessments'][number];

// A schedule line: "Week 3: Estimation", "Unit II — Conquest", "Lecture 4 - Bias". The em dash is recognised in pasted text.
const SCHEDULE_LINE =
  /^\s*(?:[-*+]\s+|\d{1,2}[.)]\s+)?(?:\*\*)?(week|session|class|lecture|seminar|unit|module|part|topic|lesson)\s*([0-9]{1,2}|[ivxlc]{1,5})\b\s*(?:\*\*)?\s*[:.–—-]?\s*(?:\*\*)?\s*(.{3,160})$/i;
const NOISE =
  /^(syllabus|course (outline|schedule|description|information)|contents|overview|introduction|reading list|readings?|assessments?|assessment schedule|grading|grades|marking|office hours|prerequisites?|textbooks?|required reading|policies|policy|schedule|instructor|contact|email|aims?|objectives?|learning outcomes?|references|bibliography|attendance|academic integrity)\b/i;
const ASSESSMENT =
  /\b(final exam(ination)?s?|exam(ination)?s?|mid-?terms?|quiz(zes)?|essays?|assignments?|presentations?|tests?|papers?|projects?|reports?|portfolios?|problem sets?|coursework|dissertations?)\b/i;
const PERCENT = /(\d{1,3}(?:\.\d+)?)\s*%/;
const MONTHS = [
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
];
const MONTH =
  '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';

const clean = (text: string) =>
  text
    .replace(/\*\*|__|`/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\s*\((\d+\s*weeks?|pp?\.[^)]*)\)\s*$/i, '')
    .replace(/[\s.,:]+$/, '')
    .trim();
const label = (kind: string, n: string) =>
  `${kind.charAt(0).toUpperCase()}${kind.slice(1).toLowerCase()} ${/^\d+$/.test(n) ? n : n.toUpperCase()}`;

function tableRows(text: string) {
  if (!text.trimStart().startsWith('|')) return null;
  return text
    .split('\n')
    .filter(line => line.trim().startsWith('|') && !/^\|\s*(-{3,}\s*\|\s*)+$/.test(line.trim()))
    .map(line =>
      line
        .trim()
        .replace(/^\||\|$/g, '')
        .split(/(?<!\\)\|/)
        .map(cell => clean(cell.replace(/\\\|/g, '|'))),
    );
}

export function parseDate(text: string, year = new Date().getUTCFullYear()): string | null {
  const iso = /\b(\d{4})-(\d{2})-(\d{2})\b/.exec(text);
  const pad = (n: number) => String(n).padStart(2, '0');
  const valid = (y: number, m: number, d: number) => {
    const date = new Date(Date.UTC(y, m - 1, d));
    return date.getUTCMonth() === m - 1 && date.getUTCDate() === d ? `${y}-${pad(m)}-${pad(d)}` : null;
  };
  if (iso) return valid(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  const month = (name: string) => MONTHS.findIndex(m => m.startsWith(name.toLowerCase().slice(0, 3))) + 1;
  const dayFirst = new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+${MONTH}\\.?(?:,?\\s+(\\d{4}))?`, 'i').exec(text);
  if (dayFirst) return valid(Number(dayFirst[3] ?? year), month(dayFirst[2]!), Number(dayFirst[1]));
  const monthFirst = new RegExp(`\\b${MONTH}\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?\\b`, 'i').exec(text);
  if (monthFirst) return valid(Number(monthFirst[3] ?? year), month(monthFirst[1]!), Number(monthFirst[2]));
  return null;
}

function assessmentType(text: string): AssessmentType {
  if (/final/i.test(text)) return 'final';
  if (/mid-?term/i.test(text)) return 'midterm';
  if (/quiz|test/i.test(text)) return 'quiz';
  if (/essay|paper|report|dissertation/i.test(text)) return 'essay';
  if (/presentation/i.test(text)) return 'presentation';
  return 'other';
}

/** Assessments in one line or row, each needing a date or a percentage. */
function assessmentsIn(text: string, key: string): Assessment[] {
  const out: Assessment[] = [];
  // One assessment per line unless the line names several, as in "Two essays (30% each) and a final (40%)".
  const pieces = text.split(/;|,(?![^(]*\))|\band\b|\.\s/);
  const several = pieces.filter(p => ASSESSMENT.test(p)).length > 1;
  for (const part of several ? pieces : [text]) {
    const names = [...part.matchAll(new RegExp(ASSESSMENT.source, 'gi'))].filter(m => m.index! < 60);
    const named = names.at(-1);
    const weight = PERCENT.exec(part),
      date = parseDate(part);
    if (!named || (!weight && !date)) continue;
    const before = clean(
      part
        .slice(0, named.index! + named[0].length)
        .replace(/^[\s\d|.:-]+/, '')
        .replace(/^.*?\b(two|three|four|one|a|an|the)\s+/i, ''),
    );
    const title = clean((before.length > 2 ? before : named[0]).replace(/\s*\(.*$/, ''));
    out.push({
      title: title.charAt(0).toUpperCase() + title.slice(1),
      type: assessmentType(part),
      date,
      weight: weight ? Math.min(100, Number(weight[1])) : null,
      topics: [],
      blocks: [key],
    });
  }
  return out;
}

export function readSyllabusRules(input: SyllabusInput): SyllabusReading {
  const fromTables: Topic[] = [],
    fromHeadings: Topic[] = [],
    fromLines: Topic[] = [],
    assessments: Assessment[] = [];
  let unit = '';
  for (const block of input.blocks) {
    const rows = tableRows(block.text);
    if (rows && rows.length > 1) {
      const header = rows[0]!.map(h => h.toLowerCase());
      const when = header.findIndex(h => /week|session|class|lecture|unit|module|date|day/.test(h));
      const what = header.findIndex((h, i) => i !== when && /topic|subject|theme|content|title|focus|lecture/.test(h));
      const about = header.findIndex(
        (h, i) => i !== when && i !== what && /reading|description|notes|activit|details/.test(h),
      );
      for (const row of rows.slice(1)) {
        const line = row.join(' ');
        if (ASSESSMENT.test(line) && (PERCENT.test(line) || parseDate(line)))
          assessments.push(...assessmentsIn(line, block.key));
        if (when < 0 && what < 0) continue;
        const title = row[what >= 0 ? what : when === 0 ? 1 : 0] ?? '';
        if (!title || NOISE.test(title) || /^(no class|holiday|break|reading week|exam week)/i.test(title)) continue;
        if (ASSESSMENT.test(title) && (PERCENT.test(line) || parseDate(line))) continue;
        const marker = when >= 0 ? (row[when] ?? '') : '';
        const word = /week|session|class|lecture|unit|module/.exec(header[when] ?? '')?.[0];
        const module =
          /^\d{1,2}$/.test(marker) && word
            ? label(word, marker)
            : marker && !parseDate(marker)
              ? marker.slice(0, 60)
              : '';
        fromTables.push({
          existing: null,
          title: title.slice(0, 200),
          module,
          summary: about >= 0 && row[about] ? `Reading: ${row[about]}`.slice(0, 300) : '',
          blocks: [block.key],
        });
      }
      continue;
    }
    const heading = /^(#{1,4})\s+(.*)$/.exec(block.text);
    if (heading) {
      const text = clean(heading[2]!);
      const schedule = SCHEDULE_LINE.exec(text);
      if (schedule) {
        if (schedule[3] && !NOISE.test(schedule[3]))
          fromHeadings.push({
            existing: null,
            title: clean(schedule[3]),
            module: label(schedule[1]!, schedule[2]!),
            summary: '',
            blocks: [block.key],
          });
        else unit = label(schedule[1]!, schedule[2]!);
      } else if (heading[1]!.length >= 2 && !NOISE.test(text) && text.length < 120) {
        fromHeadings.push({ existing: null, title: text, module: unit, summary: '', blocks: [block.key] });
      }
      continue;
    }
    for (const raw of block.text.split('\n')) {
      const line = raw.replace(/^\s*(?:[-*+]|\d{1,2}[.)])\s+/, '').trim();
      if (!line) continue;
      if (ASSESSMENT.test(line) && (PERCENT.test(line) || parseDate(line)))
        assessments.push(...assessmentsIn(line, block.key));
      const schedule = SCHEDULE_LINE.exec(raw);
      if (schedule?.[3] && !NOISE.test(schedule[3]))
        fromLines.push({
          existing: null,
          title: clean(schedule[3]),
          module: label(schedule[1]!, schedule[2]!),
          summary: '',
          blocks: [block.key],
        });
      else if (
        /^\s*(?:[-*+]|\d{1,2}[.)])\s+/.test(raw) &&
        line.length >= 4 &&
        line.length <= 120 &&
        !NOISE.test(line) &&
        !ASSESSMENT.test(line)
      )
        fromLines.push({ existing: null, title: clean(line), module: unit, summary: '', blocks: [block.key] });
    }
  }
  const strongest =
    fromTables.length >= 3
      ? fromTables
      : fromHeadings.filter(t => t.module).length >= 3
        ? fromHeadings.filter(t => t.module)
        : fromLines.filter(t => t.module).length >= 3
          ? fromLines.filter(t => t.module)
          : [...fromTables, ...fromHeadings, ...fromLines];
  const seen = new Set<string>(),
    topics: Topic[] = [];
  for (const topic of strongest) {
    const key = normalTitle(topic.title);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    topics.push(topic);
    if (topics.length >= OUTLINE_MAX) break;
  }
  const kept = new Map<string, Assessment>();
  for (const a of assessments) if (!kept.has(normalTitle(a.title))) kept.set(normalTitle(a.title), a);
  return { topics, assessments: [...kept.values()].slice(0, 20) };
}

const STOP = new Set(
  'about after again also among because been before being between both could does from have here into more most other over same should some such than that their them then there these they this those through under until very what when where which while with would your introduction overview part week lecture session chapter unit topic module notes reading readings slides'.split(
    ' ',
  ),
);
const terms = (text: string) =>
  new Set(
    text
      .toLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .filter(w => w.length >= 4 && !STOP.has(w))
      .map(w => w.replace(/(ies|es|s)$/, '')),
  );

/**
 * Topics by shared words. A section whose heading shares half its words with a topic's title
 * covers it. One whose summary and terms share two words with the title only mentions it. A
 * substantial section that fits nothing starts a topic named after its top heading, and later
 * sections under the same heading join it.
 */
export function assignTopicsRules(input: AssignInput): Assignment {
  const links: Assignment['links'] = [],
    newTopics: Assignment['newTopics'] = [];
  const known = input.topics.map(t => ({ key: t.key, title: terms(t.title), summary: terms(t.summary) }));
  for (const section of input.sections) {
    const parts = section.path.split(' / ').filter(Boolean);
    const heading = terms(parts.at(-1) ?? ''),
      body = terms(`${section.summary} ${section.terms.join(' ')}`);
    const found: Assignment['links'][number]['topics'] = [];
    for (const topic of known) {
      const shared = [...heading].filter(w => topic.title.has(w)).length;
      if (shared && shared / Math.min(heading.size, topic.title.size) >= 0.5)
        found.push({ topic: topic.key, depth: 'covers' });
      else if ([...body].filter(w => topic.title.has(w)).length >= 2)
        found.push({ topic: topic.key, depth: 'mentions' });
    }
    if (!found.length && parts.length && section.words >= SUBSTANTIAL_WORDS) {
      const name = (parts.length >= 2 ? parts[1]! : parts[0]!).slice(0, 200);
      if (!NOISE.test(name) && !/^(summary|conclusions?|questions|further reading|key terms)/i.test(name)) {
        let topic = newTopics.find(t => normalTitle(t.title) === normalTitle(name));
        if (!topic && newTopics.length < input.room) {
          topic = { title: name, module: '', summary: '' };
          newTopics.push(topic);
          known.push({ key: name, title: terms(name), summary: new Set() });
        }
        if (topic) found.push({ topic: topic.title, depth: 'covers' });
      }
    }
    if (found.length) links.push({ section: section.key, topics: found.slice(0, 3) });
  }
  return { links, newTopics };
}

export const rulesProvider: OutlineProvider = {
  async readSyllabus(input) {
    return { value: readSyllabusRules(input) };
  },
  async assignTopics(input) {
    return { value: assignTopicsRules(input) };
  },
};
