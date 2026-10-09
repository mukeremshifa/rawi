import type { AssessmentType } from '../../../shared/domain/types';
import { OUTLINE_MAX } from '../../../shared/contracts/outline';
import { normalTitle, sequenceNumber, type Draft, type DraftInput, type Mapping, type MappingInput, type OutlineProvider, type SyllabusInput, type SyllabusReading } from './provider';

/**
 * The rules pass, used without a key or budget. It reads structure rather
 * than meaning: schedule tables first, then headings, then list items and
 * lines shaped like "Week 3: Estimation". It writes no summaries of its own.
 */
type Topic = SyllabusReading['topics'][number];
type Assessment = SyllabusReading['assessments'][number];

// A schedule line: "Week 3: Estimation", "Unit II — Conquest", "Lecture 4 - Bias". The em dash is recognised in pasted text.
const SCHEDULE_LINE = /^\s*(?:[-*+]\s+|\d{1,2}[.)]\s+)?(?:\*\*)?(week|session|class|lecture|seminar|unit|module|part|topic|lesson)\s*([0-9]{1,2}|[ivxlc]{1,5})\b\s*(?:\*\*)?\s*[:.–—-]?\s*(?:\*\*)?\s*(.{3,160})$/i;
const NOISE = /^(syllabus|course (outline|schedule|description|information)|contents|overview|introduction|reading list|readings?|assessments?|assessment schedule|grading|grades|marking|office hours|prerequisites?|textbooks?|required reading|policies|policy|schedule|instructor|contact|email|aims?|objectives?|learning outcomes?|references|bibliography|attendance|academic integrity)\b/i;
const ASSESSMENT = /\b(final exam(ination)?s?|exam(ination)?s?|mid-?terms?|quiz(zes)?|essays?|assignments?|presentations?|tests?|papers?|projects?|reports?|portfolios?|problem sets?|coursework|dissertations?)\b/i;
const PERCENT = /(\d{1,3}(?:\.\d+)?)\s*%/;
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const MONTH = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';

const clean = (text: string) => text.replace(/\*\*|__|`/g, '').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/\s*\((\d+\s*weeks?|pp?\.[^)]*)\)\s*$/i, '').replace(/[\s.,:]+$/, '').trim();
const label = (kind: string, n: string) => `${kind.charAt(0).toUpperCase()}${kind.slice(1).toLowerCase()} ${/^\d+$/.test(n) ? n : n.toUpperCase()}`;

function tableRows(text: string) {
  if (!text.trimStart().startsWith('|')) return null;
  return text.split('\n').filter(line => line.trim().startsWith('|') && !/^\|\s*(-{3,}\s*\|\s*)+$/.test(line.trim()))
    .map(line => line.trim().replace(/^\||\|$/g, '').split(/(?<!\\)\|/).map(cell => clean(cell.replace(/\\\|/g, '|'))));
}

export function parseDate(text: string, year = new Date().getUTCFullYear()): string | null {
  const iso = /\b(\d{4})-(\d{2})-(\d{2})\b/.exec(text);
  const pad = (n: number) => String(n).padStart(2, '0');
  const valid = (y: number, m: number, d: number) => { const date = new Date(Date.UTC(y, m - 1, d)); return date.getUTCMonth() === m - 1 && date.getUTCDate() === d ? `${y}-${pad(m)}-${pad(d)}` : null; };
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
    const weight = PERCENT.exec(part), date = parseDate(part);
    if (!named || (!weight && !date)) continue;
    const before = clean(part.slice(0, named.index! + named[0].length).replace(/^[\s\d|.:-]+/, '').replace(/^.*?\b(two|three|four|one|a|an|the)\s+/i, ''));
    const title = clean((before.length > 2 ? before : named[0]).replace(/\s*\(.*$/, ''));
    out.push({ title: title.charAt(0).toUpperCase() + title.slice(1), type: assessmentType(part), date, weight: weight ? Math.min(100, Number(weight[1])) : null, topics: [], blocks: [key] });
  }
  return out;
}

export function readSyllabusRules(input: SyllabusInput): SyllabusReading {
  const fromTables: Topic[] = [], fromHeadings: Topic[] = [], fromLines: Topic[] = [], assessments: Assessment[] = [];
  let unit = '';
  for (const block of input.blocks) {
    const rows = tableRows(block.text);
    if (rows && rows.length > 1) {
      const header = rows[0]!.map(h => h.toLowerCase());
      const when = header.findIndex(h => /week|session|class|lecture|unit|module|date|day/.test(h));
      const what = header.findIndex((h, i) => i !== when && /topic|subject|theme|content|title|focus|lecture/.test(h));
      const about = header.findIndex((h, i) => i !== when && i !== what && /reading|description|notes|activit|details/.test(h));
      for (const row of rows.slice(1)) {
        const line = row.join(' ');
        if (ASSESSMENT.test(line) && (PERCENT.test(line) || parseDate(line))) assessments.push(...assessmentsIn(line, block.key));
        if (when < 0 && what < 0) continue;
        const title = row[what >= 0 ? what : when === 0 ? 1 : 0] ?? '';
        if (!title || NOISE.test(title) || /^(no class|holiday|break|reading week|exam week)/i.test(title)) continue;
        if (ASSESSMENT.test(title) && (PERCENT.test(line) || parseDate(line))) continue;
        const marker = when >= 0 ? row[when] ?? '' : '';
        const word = /week|session|class|lecture|unit|module/.exec(header[when] ?? '')?.[0];
        const module = /^\d{1,2}$/.test(marker) && word ? label(word, marker) : marker && !parseDate(marker) ? marker.slice(0, 60) : '';
        fromTables.push({ existing: null, title: title.slice(0, 200), module, summary: about >= 0 && row[about] ? `Reading: ${row[about]}`.slice(0, 300) : '', blocks: [block.key] });
      }
      continue;
    }
    const heading = /^(#{1,4})\s+(.*)$/.exec(block.text);
    if (heading) {
      const text = clean(heading[2]!);
      const schedule = SCHEDULE_LINE.exec(text);
      if (schedule) {
        if (schedule[3] && !NOISE.test(schedule[3])) fromHeadings.push({ existing: null, title: clean(schedule[3]), module: label(schedule[1]!, schedule[2]!), summary: '', blocks: [block.key] });
        else unit = label(schedule[1]!, schedule[2]!);
      } else if (heading[1]!.length >= 2 && !NOISE.test(text) && text.length < 120) {
        fromHeadings.push({ existing: null, title: text, module: unit, summary: '', blocks: [block.key] });
      }
      continue;
    }
    for (const raw of block.text.split('\n')) {
      const line = raw.replace(/^\s*(?:[-*+]|\d{1,2}[.)])\s+/, '').trim();
      if (!line) continue;
      if (ASSESSMENT.test(line) && (PERCENT.test(line) || parseDate(line))) assessments.push(...assessmentsIn(line, block.key));
      const schedule = SCHEDULE_LINE.exec(raw);
      if (schedule?.[3] && !NOISE.test(schedule[3])) fromLines.push({ existing: null, title: clean(schedule[3]), module: label(schedule[1]!, schedule[2]!), summary: '', blocks: [block.key] });
      else if (/^\s*(?:[-*+]|\d{1,2}[.)])\s+/.test(raw) && line.length >= 4 && line.length <= 120 && !NOISE.test(line) && !ASSESSMENT.test(line)) fromLines.push({ existing: null, title: clean(line), module: unit, summary: '', blocks: [block.key] });
    }
  }
  const strongest = fromTables.length >= 3 ? fromTables : fromHeadings.filter(t => t.module).length >= 3 ? fromHeadings.filter(t => t.module) : fromLines.filter(t => t.module).length >= 3 ? fromLines.filter(t => t.module) : [...fromTables, ...fromHeadings, ...fromLines];
  const seen = new Set<string>(), topics: Topic[] = [];
  for (const topic of strongest) {
    const key = normalTitle(topic.title);
    if (!key || seen.has(key)) continue;
    seen.add(key); topics.push(topic);
    if (topics.length >= OUTLINE_MAX) break;
  }
  const kept = new Map<string, Assessment>();
  for (const a of assessments) if (!kept.has(normalTitle(a.title))) kept.set(normalTitle(a.title), a);
  return { topics, assessments: [...kept.values()].slice(0, 20) };
}

const STOP = new Set('about after again also among because been before being between both could does from have here into more most other over same should some such than that their them then there these they this those through under until very what when where which while with would your introduction overview part week lecture session chapter unit topic module notes reading readings slides'.split(' '));
const terms = (text: string) => new Set(text.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(w => w.length >= 4 && !STOP.has(w)).map(w => w.replace(/(ies|es|s)$/, '')));

export function mapMaterialRules(input: MappingInput): Mapping {
  const links: Mapping['links'] = [], unmatched: MappingInput['sections'] = [];
  for (const section of input.sections) {
    const heading = terms(section.heading), body = terms(section.excerpt);
    let best: { key: string; score: number }[] = [];
    for (const topic of input.topics) {
      const title = terms(topic.title), summary = terms(topic.summary);
      // Half the words of the shorter of heading and title must be shared, so one common word is not enough.
      const shared = [...heading].filter(word => title.has(word)).length;
      if (!shared || shared / Math.min(heading.size, title.size) < 0.5) continue;
      let score = shared * 2;
      for (const word of heading) if (!title.has(word) && summary.has(word)) score += 1;
      for (const word of title) if (body.has(word)) score += 0.5;
      best.push({ key: topic.key, score });
    }
    best = best.sort((a, b) => b.score - a.score).filter((b, i, all) => i === 0 || b.score >= all[0]!.score * 0.8).slice(0, 2);
    if (best.length) links.push({ section: section.key, topics: best.map(b => b.key) });
    else if (section.heading && !section.parent && section.excerpt.length >= 400) unmatched.push(section);
  }
  const newTopics = unmatched.slice(0, input.newTopics).map(s => ({ title: s.heading.slice(0, 200), summary: '', sections: [s.key] }));
  return { links, newTopics };
}

export function draftOutlineRules(input: DraftInput): Draft {
  const ordered = [...input.materials].sort((a, b) => (a.order ?? 1e6) - (b.order ?? 1e6));
  const top = ordered.map(m => {
    const level = Math.min(...m.headings.map(h => h.level), 9);
    // A single top heading is usually the document title, so its subheadings are the topics.
    const first = m.headings.filter(h => h.level === level);
    const next = first.length === 1 ? m.headings.filter(h => h.level === level + 1) : [];
    return { m, headings: (next.length >= 2 ? next : first).filter(h => !NOISE.test(h.text) && !/^(summary|conclusions?|questions|further reading|key terms)\b/i.test(h.text)) };
  });
  const module = (m: DraftInput['materials'][number]) => m.order !== null ? (/week/i.test(m.title) ? `Week ${m.order}` : `Lecture ${m.order}`) : '';
  const total = top.reduce((n, t) => n + t.headings.length, 0);
  const topics: Draft['topics'] = [];
  if (total > OUTLINE_MAX || total === 0) {
    for (const { m, headings } of top) topics.push({ title: m.title.replace(/^\s*(lecture|week|session|unit|chapter)\s*\d+\s*[:.–—-]?\s*/i, '').trim() || m.title, module: module(m), summary: headings.length ? `Covers ${listOf(headings.slice(0, 4).map(h => h.text))}.` : '', material: m.key, heading: headings[0]?.key ?? m.lead });
  } else {
    for (const { m, headings } of top) for (const h of headings) topics.push({ title: h.text.slice(0, 200), module: module(m), summary: '', material: m.key, heading: h.key });
  }
  const seen = new Set<string>();
  return { topics: topics.filter(t => { const k = normalTitle(t.title); if (!k || seen.has(k)) return false; seen.add(k); return true; }).slice(0, OUTLINE_MAX) };
}

const listOf = (items: string[]) => items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`;

export const rulesProvider: OutlineProvider = {
  async readSyllabus(input) { return { value: readSyllabusRules(input) }; },
  async mapMaterial(input) { return { value: mapMaterialRules(input) }; },
  async draftOutline(input) { return { value: draftOutlineRules(input) }; },
};
export { sequenceNumber };
