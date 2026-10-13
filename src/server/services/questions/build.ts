import type { Difficulty, QuestionFormat } from '../../../shared/domain/types';
import type { FactKind } from '../knowledge/types';

/**
 * Questions built by code from a section's facts. No model is called: a cloze blanks a term the
 * fact states, matching pairs terms with their definitions, ordering uses steps in the order the
 * material gives them, and multiple choice on a definition or a number draws its wrong answers
 * from sibling facts of the same kind. Each builder returns nothing when the facts cannot support
 * a fair question.
 */
export interface Fact {
  id: string; sectionId: string; materialId: string; kind: FactKind; subject: string; text: string;
  value: number | null; unit: string | null; items: string[] | null; blockIds: string[]; confidence: number;
}
export interface Built {
  format: QuestionFormat; difficulty: Difficulty; factIds: string[]; blockIds: string[];
  prompt: string; explanation: string; answer?: string; options?: string[]; correctIndices?: number[];
  pairs?: { left: string; right: string }[]; sequence?: string[]; template?: string; blanks?: string[][];
}

/** Facts code may build from. A lower bar would put an unsure reading in front of a student as fact. */
const SURE = 0.7;
const normal = (text: string) => text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const clip = (text: string, chars: number) => text.length <= chars ? text : `${text.slice(0, text.lastIndexOf(' ', chars) > chars / 2 ? text.lastIndexOf(' ', chars) : chars).trim()}…`;
const sentence = (text: string) => { const t = text.trim().replace(/\s+/g, ' '); return /[.!?]$/.test(t) ? t : `${t}.`; };
const lower = (text: string) => text.charAt(0).toLowerCase() + text.slice(1);
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/**
 * What a definition says without its term: "The standard error is the spread of…" gives "the
 * spread of…". Null when the rest still names the term, since asking for it would give it away.
 */
const meaning = (f: Fact) => {
  const rest = f.text.trim().replace(new RegExp(`^(?:(?:the|a|an)\\s+)?${escape(f.subject)}\\s*(?:\\([^)]*\\)\\s*)?(?:is defined as|refers to|is|are|means|describes)\\s+`, 'i'), '');
  return rest.length >= 12 && !` ${normal(rest)} `.includes(` ${normal(f.subject)} `) ? rest : null;
};

/** A stable order that does not put the key first, from the question's own text. */
function placeKey<T>(key: T, others: T[], seed: string) {
  let h = 0;
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const at = h % (others.length + 1);
  return { options: [...others.slice(0, at), key, ...others.slice(at)], index: at };
}

export function flashcards(facts: Fact[]): Built[] {
  return facts.filter(f => f.confidence >= SURE && (f.kind === 'definition' || f.kind === 'formula')).map(f => ({
    format: 'flashcard', difficulty: 'recall', factIds: [f.id], blockIds: f.blockIds,
    prompt: f.kind === 'definition' ? `What is meant by ${f.subject}?` : `What is the formula for ${lower(f.subject)}?`,
    answer: f.kind === 'definition' ? sentence(f.text) : `$${f.text}$`, explanation: f.kind === 'definition' ? `${f.subject}: ${sentence(f.text)}` : `${f.subject}: $${f.text}$`,
  }));
}

/**
 * A cloze blanks one thing the fact itself states: the term a definition defines, a number as the
 * material writes it, or a key term of the section that appears in a fact.
 */
export function clozes(facts: Fact[], keyTerms: string[]): Built[] {
  const out: Built[] = [];
  for (const f of facts.filter(f => f.confidence >= SURE)) {
    if (f.kind === 'definition') {
      const rest = meaning(f);
      if (rest) out.push({ format: 'cloze', difficulty: 'recall', factIds: [f.id], blockIds: f.blockIds, prompt: 'Fill in the term.', template: `___: ${lower(sentence(rest))}`, blanks: [[f.subject]], explanation: `${f.subject}: ${lower(sentence(rest))}` });
    } else if (f.kind === 'number' && f.value !== null) {
      const written = [...f.text.matchAll(/-?\d[\d,]*(?:\.\d+)?/g)].find(m => Number(m[0].replace(/,/g, '')) === f.value);
      if (written) out.push({ format: 'cloze', difficulty: 'recall', factIds: [f.id], blockIds: f.blockIds, prompt: 'Fill in the number.', template: sentence(f.text.slice(0, written.index) + '___' + f.text.slice(written.index! + written[0].length)), blanks: [[written[0], String(f.value)]], explanation: sentence(f.text) });
    } else if (f.kind === 'fact') {
      const term = keyTerms.filter(t => t.length >= 4 && new RegExp(`\\b${escape(t)}\\b`, 'i').test(f.text)).sort((a, b) => b.length - a.length)[0];
      if (!term) continue;
      const at = new RegExp(`\\b${escape(term)}\\b`, 'i').exec(f.text)!;
      out.push({ format: 'cloze', difficulty: 'recall', factIds: [f.id], blockIds: f.blockIds, prompt: 'Fill in the missing term.', template: sentence(f.text.slice(0, at.index) + '___' + f.text.slice(at.index + at[0].length)), blanks: [[at[0], term]], explanation: sentence(f.text) });
    }
  }
  return out;
}

/** Terms matched to what they mean, three to five at a time, from one section and then its neighbours. */
export function matchings(own: Fact[], nearby: Fact[]): Built[] {
  const pool = [...own, ...nearby].filter(f => f.kind === 'definition' && f.confidence >= SURE && meaning(f));
  const seen = new Set<string>(), unique: Fact[] = [];
  for (const f of pool) { const k = normal(f.subject); if (k && !seen.has(k)) { seen.add(k); unique.push(f); } }
  const out: Built[] = [];
  // Each group holds at least one of this section's own terms.
  for (let start = 0; start < unique.length; start += 5) {
    let group = unique.slice(start, start + 5);
    if (group.length < 3) group = unique.slice(Math.max(0, unique.length - 3));
    if (group.length < 3 || !group.some(f => own.includes(f))) break;
    const rights = group.map(f => clip(meaning(f)!, 140));
    if (new Set(rights.map(normal)).size !== rights.length) continue;
    out.push({ format: 'matching', difficulty: 'recall', factIds: group.map(f => f.id), blockIds: [...new Set(group.flatMap(f => f.blockIds))], prompt: 'Match each term to its meaning.', pairs: group.map((f, i) => ({ left: f.subject, right: rights[i]! })), explanation: group.map(f => `${f.subject}: ${sentence(f.text)}`).join(' ') });
    if (start + 5 >= unique.length) break;
  }
  return out;
}

/** Steps in the order the material gives them. */
export function orderings(facts: Fact[]): Built[] {
  return facts.filter(f => f.kind === 'steps' && f.confidence >= SURE && f.items && f.items.length >= 3 && f.items.length <= 8 && new Set(f.items.map(normal)).size === f.items.length).map(f => ({
    format: 'ordering', difficulty: 'reasoning', factIds: [f.id], blockIds: f.blockIds,
    prompt: `Put the steps of ${lower(f.subject)} in order.`, sequence: f.items!.map(i => clip(i, 200)), explanation: f.items!.map((s, i) => `${i + 1}. ${s}`).join('\n'),
  }));
}

const formatNumber = (n: number, like: number) => {
  const decimals = (String(like).split('.')[1] ?? '').length;
  const year = Number.isInteger(like) && like >= 1000 && like <= 2100;
  return year ? String(Math.round(n)) : n.toLocaleString('en-GB', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
};
/** Wrong values near a number: years a few decades off, other quantities scaled. */
function nearby(value: number) {
  if (Number.isInteger(value) && value >= 1000 && value <= 2100) return [value - 25, value + 25, value + 50].filter(v => v !== value);
  return [value * 0.5, value * 1.5, value * 2].map(v => Number.isInteger(value) ? Math.round(v) : Math.round(v * 100) / 100).filter(v => v !== value);
}

/**
 * Multiple choice that needs no model. A definition is asked as "which term means", with sibling
 * terms as the wrong answers. A number is asked for its value, with sibling values of the same
 * unit, or near values when there are too few.
 */
export function choices(own: Fact[], siblings: Fact[]): Built[] {
  const out: Built[] = [];
  for (const f of own.filter(f => f.confidence >= SURE)) {
    if (f.kind === 'definition') {
      const rest = meaning(f);
      if (!rest) continue;
      const others = [...new Map([...siblings, ...own].filter(s => s.kind === 'definition' && s.id !== f.id && normal(s.subject) !== normal(f.subject)).map(s => [normal(s.subject), s.subject])).values()].slice(0, 3);
      if (others.length < 3) continue;
      const { options, index } = placeKey(f.subject, others, f.id);
      out.push({ format: 'multiple-choice', difficulty: 'recall', factIds: [f.id], blockIds: f.blockIds, prompt: `Which term means: ${lower(sentence(rest))}`, options, correctIndices: [index], answer: f.subject, explanation: `${f.subject}: ${lower(sentence(rest))}` });
    } else if (f.kind === 'number' && f.value !== null) {
      const same = siblings.filter(s => s.kind === 'number' && s.value !== null && s.value !== f.value && normal(s.unit ?? '') === normal(f.unit ?? '')).map(s => s.value!);
      const values = [...new Set([...same, ...nearby(f.value)])].filter(v => v !== f.value).slice(0, 3);
      if (values.length < 3) continue;
      const show = (v: number) => `${formatNumber(v, f.value!)}${f.unit ? ` ${f.unit}` : ''}`;
      const { options, index } = placeKey(show(f.value), values.map(show), f.id);
      if (new Set(options).size !== options.length) continue;
      out.push({ format: 'multiple-choice', difficulty: 'recall', factIds: [f.id], blockIds: f.blockIds, prompt: `According to the material, what is ${lower(f.subject)}?`, options, correctIndices: [index], answer: show(f.value), explanation: sentence(f.text) });
    }
  }
  return out;
}

/** Every question code can build for a section in the formats asked for. */
export function buildAll(formats: QuestionFormat[], own: Fact[], siblings: Fact[], keyTerms: string[]): Built[] {
  const out: Built[] = [];
  if (formats.includes('flashcard')) out.push(...flashcards(own));
  if (formats.includes('cloze')) out.push(...clozes(own, keyTerms));
  if (formats.includes('matching')) out.push(...matchings(own, siblings));
  if (formats.includes('ordering')) out.push(...orderings(own));
  if (formats.includes('multiple-choice')) out.push(...choices(own, siblings));
  return out;
}
