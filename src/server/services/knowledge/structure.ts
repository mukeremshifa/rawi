import { blockMarkdown, spansText } from '../../../shared/domain/document-text';
import type { SectionBlock } from '../outline/sections';
import type { FactKind } from './types';

/**
 * A version's structure, read by code: non-overlapping sections with stable keys, and the facts
 * that need no model to find. Nothing here calls a provider.
 */
export interface LeafSection {
  ordinal: number; key: string; headingBlockId: string | null; heading: string; path: string[]; level: number;
  blockIds: string[]; text: string; tokens: number;
}

const normal = (text: string) => text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

/**
 * Sections in reading order. Each heading owns the blocks up to the next heading of any level,
 * and the path names every heading above it, so the key reads like "trade / the middle passage".
 * A heading with nothing under it before a subheading appears only in its children's paths.
 * Repeated paths get a counter, so keys stay unique within a version.
 */
export function leafSections(list: SectionBlock[]): LeafSection[] {
  const out: LeafSection[] = [];
  const stack: { level: number; text: string }[] = [];
  const seen = new Map<string, number>();
  let current: { headingBlockId: string | null; heading: string; path: string[]; level: number; blocks: SectionBlock[] } = { headingBlockId: null, heading: '', path: [], level: 0, blocks: [] };
  const flush = () => {
    const blocks = current.blocks.filter(b => blockMarkdown(b).trim());
    if (!blocks.length) return;
    const base = current.path.map(normal).filter(Boolean).join(' / ') || '(lead)';
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    const text = blocks.map(b => blockMarkdown(b).trim()).join('\n\n');
    out.push({ ordinal: out.length, key: n > 1 ? `${base} #${n}` : base, headingBlockId: current.headingBlockId, heading: current.heading, path: current.path, level: current.level, blockIds: blocks.map(b => b.id), text, tokens: Math.ceil(text.length / 4) });
  };
  for (const block of list) {
    if (block.type !== 'heading') { current.blocks.push(block); continue; }
    flush();
    const text = spansText(block.content.spans).trim().slice(0, 300);
    while (stack.length && stack.at(-1)!.level >= block.content.level) stack.pop();
    stack.push({ level: block.content.level, text });
    current = { headingBlockId: block.id, heading: text, path: stack.map(s => s.text), level: block.content.level, blocks: [] };
  }
  flush();
  return out;
}

export interface FactDraft {
  kind: FactKind; subject: string; text: string; value: number | null; unit: string | null; items: string[] | null;
  blockIds: string[]; confidence: number; extractor: string;
}

/** The last sentence of a text, for naming what an equation or list that follows it is about. */
const lastSentence = (text: string) => (text.split(/(?<=[.!?:])\s+/).filter(Boolean).at(-1) ?? '').replace(/[:.]\s*$/, '').trim().slice(0, 160);
/** A bold term opening a paragraph and then defined: "**Encomienda** was a grant of...". */
const DEFINED = /^\*\*([^*]{2,80})\*\*\s*(?:\([^)]{1,60}\)\s*)?(?:is|are|was|were|means|meant|refers to|referred to|describes|denotes|is defined as|was defined as)\s+(.{12,600})$/is;

/**
 * Facts code can read for itself: equations become formulas, an ordered list becomes steps, and a
 * paragraph that opens with a bold term and defines it becomes a definition. Steps from a list
 * are only as sure as the list is a sequence, so they start lower than a model's reading of them.
 */
export function ruleFacts(section: LeafSection, blocks: Map<string, SectionBlock>): FactDraft[] {
  const out: FactDraft[] = [];
  let previous = '';
  for (const id of section.blockIds) {
    const b = blocks.get(id);
    if (!b) continue;
    if (b.type === 'equation') {
      out.push({ kind: 'formula', subject: lastSentence(previous) || section.heading, text: b.content.latex.trim(), value: null, unit: null, items: null, blockIds: [id], confidence: 1, extractor: 'rule' });
    } else if (b.type === 'list' && b.content.ordered && b.content.items.length >= 3 && b.content.items.length <= 12) {
      const items = b.content.items.map(i => spansText(i.spans).trim()).filter(Boolean);
      if (items.length === b.content.items.length && items.every(i => i.length <= 200)) out.push({ kind: 'steps', subject: lastSentence(previous) || section.heading, text: items.join(' Then '), value: null, unit: null, items, blockIds: [id], confidence: 0.6, extractor: 'rule' });
    } else if (b.type === 'paragraph') {
      const m = DEFINED.exec(blockMarkdown(b).trim());
      if (m) out.push({ kind: 'definition', subject: m[1]!.trim(), text: m[2]!.replace(/\*\*/g, '').trim(), value: null, unit: null, items: null, blockIds: [id], confidence: 0.85, extractor: 'rule' });
    }
    previous = blockMarkdown(b);
  }
  return out;
}

/* ── Checking a model's facts against the text ───────────────────────────── */

const words = (text: string) => (text.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? []);
const stem = (word: string) => word.length > 6 ? word.slice(0, Math.max(5, word.length - 3)) : word;
/** Share of a claim's words that its cited text contains. A paraphrase keeps most of them. */
export function support(claim: string, source: string) {
  const own = [...new Set(words(claim))];
  if (!own.length) return 0;
  const text = source.toLowerCase();
  return own.filter(w => text.includes(stem(w))).length / own.length;
}
/** Numbers as written in a text, with separators and spacing removed. */
const numbersIn = (text: string) => new Set((text.match(/-?\d[\d,.\s]*\d|\d/g) ?? []).map(n => Number(n.replace(/[,\s]/g, ''))).filter(Number.isFinite));

/**
 * A model's fact, kept only when its cited text bears it out. A number must appear in its
 * source as written. A definition's term must appear there. Steps keep only items the source
 * states. Confidence is the share of the claim the source supports.
 */
export function checkFact(f: Omit<FactDraft, 'confidence' | 'extractor'>, source: string, extractor: string): FactDraft | null {
  if (!f.subject.trim() || !f.text.trim() || !source.trim()) return null;
  const subject = f.subject.trim().slice(0, 200), text = f.text.trim().slice(0, 800);
  if (f.kind === 'number') {
    if (f.value === null || !Number.isFinite(f.value) || !numbersIn(source).has(f.value)) return null;
    const share = support(`${subject} ${text}`, source);
    return share >= 0.5 ? { ...f, subject, text, confidence: Math.min(1, 0.4 + share * 0.6), extractor } : null;
  }
  if (f.kind === 'definition') {
    if (!source.toLowerCase().includes(subject.toLowerCase().slice(0, 60))) return null;
    const share = support(text, source);
    return share >= 0.6 ? { ...f, subject, text, value: null, unit: null, items: null, confidence: share, extractor } : null;
  }
  if (f.kind === 'steps') {
    const items = (f.items ?? []).map(i => i.trim()).filter(i => i && support(i, source) >= 0.6);
    if (items.length < 3 || items.length !== (f.items ?? []).length) return null;
    return { ...f, subject, text: items.join(' Then '), items, value: null, unit: null, confidence: 0.9, extractor };
  }
  if (f.kind === 'formula') {
    if (!/[=<>≈≤≥]/.test(text)) return null;
    return { ...f, subject, text, value: null, unit: null, items: null, confidence: support(subject, source) >= 0.5 ? 0.9 : 0.6, extractor };
  }
  const share = support(text, source);
  return share >= 0.6 ? { ...f, subject, text, value: null, unit: null, items: null, confidence: share, extractor } : null;
}

/**
 * Model and rule facts together. A model fact about the same blocks and subject as a rule fact
 * replaces it with the higher confidence of the two, so two readers agreeing counts for more.
 */
export function mergeFacts(rules: FactDraft[], model: FactDraft[]) {
  const out = [...model];
  for (const r of rules) {
    const same = out.find(m => m.kind === r.kind && m.blockIds.some(id => r.blockIds.includes(id)) && (normal(m.subject) === normal(r.subject) || r.kind !== 'definition'));
    if (same) same.confidence = Math.min(1, Math.max(same.confidence, r.confidence) + 0.05);
    else out.push(r);
  }
  return out;
}
