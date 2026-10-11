import type { NumericTemplate } from './types';

/**
 * A small, safe arithmetic evaluator for numeric templates: numbers, named parameters, + - * / ^,
 * brackets, and a few functions. Nothing else is accepted, so a model's expression can never run
 * as code.
 */
const FUNCTIONS: Record<string, (...a: number[]) => number> = {
  sqrt: Math.sqrt, abs: Math.abs, ln: Math.log, log: Math.log10, exp: Math.exp, round: Math.round, min: Math.min, max: Math.max,
};
const CONSTANTS: Record<string, number> = { pi: Math.PI, e: Math.E };

type Token = { kind: 'num'; value: number } | { kind: 'id'; name: string } | { kind: 'op'; op: string };
function tokens(text: string): Token[] {
  const out: Token[] = [];
  const re = /\s*(?:(\d+(?:\.\d+)?(?:e[+-]?\d+)?|\.\d+)|([A-Za-z_][A-Za-z0-9_]*)|(\*\*|[-+*/^(),]))/gy;
  let m: RegExpExecArray | null;
  let at = 0;
  while (at < text.length && (m = re.exec(text))) {
    at = re.lastIndex;
    if (m[1]) out.push({ kind: 'num', value: Number(m[1]) });
    else if (m[2]) out.push({ kind: 'id', name: m[2] });
    else if (m[3]) out.push({ kind: 'op', op: m[3] === '**' ? '^' : m[3] });
  }
  if (text.slice(at).trim()) throw new Error('unexpected text');
  return out;
}

/** Evaluates an expression with the given values. Throws on anything it does not understand. */
export function evaluate(expression: string, values: Record<string, number>): number {
  const list = tokens(expression);
  let i = 0;
  const peek = () => list[i];
  const take = (op?: string) => { const t = list[i]; if (op && !(t?.kind === 'op' && t.op === op)) throw new Error(`expected ${op}`); i++; return t; };
  const isOp = (op: string) => { const t = peek(); return t?.kind === 'op' && t.op === op; };
  const sum = (): number => { let v = product(); while (isOp('+') || isOp('-')) { const op = (take() as { op: string }).op; const r = product(); v = op === '+' ? v + r : v - r; } return v; };
  const product = (): number => { let v = power(); while (isOp('*') || isOp('/')) { const op = (take() as { op: string }).op; const r = power(); v = op === '*' ? v * r : v / r; } return v; };
  const power = (): number => { const base = unary(); if (isOp('^')) { take(); return Math.pow(base, power()); } return base; };
  const unary = (): number => { if (isOp('-')) { take(); return -unary(); } if (isOp('+')) { take(); return unary(); } return atom(); };
  const atom = (): number => {
    const t = take();
    if (!t) throw new Error('unexpected end');
    if (t.kind === 'num') return t.value;
    if (t.kind === 'op' && t.op === '(') { const v = sum(); take(')'); return v; }
    if (t.kind === 'id') {
      if (FUNCTIONS[t.name] && isOp('(')) {
        take('(');
        const args = [sum()];
        while (isOp(',')) { take(); args.push(sum()); }
        take(')');
        return FUNCTIONS[t.name]!(...args);
      }
      if (t.name in values) return values[t.name]!;
      if (t.name in CONSTANTS) return CONSTANTS[t.name]!;
    }
    throw new Error('unknown symbol');
  };
  const v = sum();
  if (i !== list.length) throw new Error('trailing input');
  return v;
}

const round = (n: number, decimals: number) => Math.round(n * 10 ** decimals) / 10 ** decimals;
const pick = (p: NumericTemplate['params'][number], random: () => number) => {
  const steps = Math.max(0, Math.floor((p.max - p.min) / p.step));
  return round(p.min + Math.floor(random() * (steps + 1)) * p.step, 6);
};

/**
 * A template is usable when every parameter has a sane range, the expression names only its
 * parameters and a few functions, and sample values give finite answers.
 */
export function checkTemplate(t: NumericTemplate): string[] {
  const out: string[] = [];
  const names = t.params.map(p => p.name);
  if (!t.params.length || t.params.length > 4 || new Set(names).size !== names.length) out.push('params');
  if (t.params.some(p => !(p.step > 0) || !(p.max >= p.min) || (p.max - p.min) / p.step > 10_000)) out.push('ranges');
  if (names.some(n => !t.stem.includes(`{${n}}`))) out.push('stem_params');
  if (!Number.isInteger(t.decimals) || t.decimals < 0 || t.decimals > 4) out.push('decimals');
  try {
    for (let k = 0; k < 5; k++) {
      const values = Object.fromEntries(t.params.map(p => [p.name, pick(p, Math.random)]));
      if (!Number.isFinite(evaluate(t.expression, values))) { out.push('not_finite'); break; }
    }
  } catch { out.push('expression'); }
  return out;
}

/** A fresh variant: values for the parameters, the question with them filled in, and the answer. */
export function variant(t: NumericTemplate, random: () => number = Math.random) {
  for (let attempt = 0; attempt < 12; attempt++) {
    const values = Object.fromEntries(t.params.map(p => [p.name, pick(p, random)]));
    const answer = round(evaluate(t.expression, values), t.decimals);
    if (!Number.isFinite(answer)) continue;
    const stem = t.stem.replace(/\{(\w+)\}/g, (_m, name: string) => name in values ? values[name]!.toLocaleString('en-GB') : `{${name}}`);
    // Half of the last decimal place, so a correctly rounded answer always counts.
    const tolerance = Math.max(0.5 * 10 ** -t.decimals, Math.abs(answer) * 1e-9);
    return { stem, values, answer, tolerance };
  }
  return null;
}
