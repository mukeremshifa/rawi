import { z } from 'zod';
import type { Task } from '../../ai/engine';
import type { Language } from '../../ai/types';
import { attribute, DATA_RULE, escapeTags, house, parsed, schemaOf } from '../../ai/style';

/**
 * The model's part in questions: stems with their correct answers, numeric templates, self-check
 * prompts with model answers, and a second reader that solves each one from the source before it
 * sees the key. Code builds multiple choice where facts allow it, and the second reader judges
 * the wrong answers a model writes.
 */
export const QUESTIONS_PROMPT_VERSION = 'questions-v2';

export interface SectionInput {
  key: string; heading: string;
  blocks: { key: string; text: string }[];
  facts: { key: string; kind: string; text: string }[];
}
const sectionsXml = (sections: SectionInput[]) => sections.map(s => `<section key="${s.key}" heading="${attribute(s.heading)}">\nFacts:\n${s.facts.map(f => `- [${f.key}] (${f.kind}) ${escapeTags(f.text)}`).join('\n')}\n${s.blocks.map(b => `<block key="${b.key}">${escapeTags(b.text)}</block>`).join('\n')}\n</section>`).join('\n');
const common = (language: Language) => [
  'Each question is answerable from its own section alone and tests understanding, not wording.',
  'Do not mention "the passage", "the text" or "the section": the student will not see it while answering.',
  DATA_RULE, house(language),
];

/* ── Stems ───────────────────────────────────────────────────────────────── */

const stemSchema = z.object({ items: z.array(z.object({
  fact: z.string().describe('Key of the fact the question tests'),
  stem: z.string().describe('The question'),
  answer: z.string().describe('The correct answer in at most twelve words'),
  answerType: z.string().describe('What kind of thing the answer is, in one or two words, such as person, year, place, cause, effect, policy, term, process'),
  distractors: z.array(z.string()).describe('Three wrong answers of the same kind and length as the correct one. Each is a mistake a student who half-read the material would make'),
  difficulty: z.enum(['recall', 'reasoning']),
  explanation: z.string().describe('One or two sentences on why the answer is right, from the section'),
})) });
export type Stems = z.infer<typeof stemSchema>;
export interface StemInput { language: Language; materialTitle: string; sections: SectionInput[]; count: number }

/**
 * Multiple choice for facts code cannot turn into a question. Code builds multiple choice on
 * definitions and numbers itself. Borrowing wrong answers from sibling stems was measured and
 * gave fewer usable questions than this, because siblings are rarely the same kind of thing, so
 * the model writes three wrong answers of the same kind and a second reader judges them.
 */
export const stemTask: Task<StemInput, Stems> = {
  name: 'questions.stems', promptVersion: QUESTIONS_PROMPT_VERSION, temperature: 0.4,
  needs: { skill: 'write', data: 'institution', lane: 'interactive', maxOutput: 3000, cache: 'none' }, language: i => i.language,
  build: i => ({
    system: [
      'You write multiple-choice questions for a university student from their course material: a stem, the correct answer and three wrong answers.',
      'Write one question per fact you are given, up to the number asked for. Keep the answer short. Every wrong answer is the same kind of thing as the correct one, about the same length, and plausible to a student who half-read the material: a confused term, a reversed cause, a claim from another section. Never use "all of the above" or "none of the above".',
      'recall asks for what the material states. reasoning asks why or how, with a short answer.',
      ...common(i.language),
    ].join('\n'),
    prompt: `<document title="${attribute(i.materialTitle)}">\n${sectionsXml(i.sections)}\n</document>\nWrite up to ${i.count} questions.`,
    schema: schemaOf(stemSchema),
  }),
  check: r => parsed(stemSchema, r.json),
};

/* ── Numeric templates ───────────────────────────────────────────────────── */

const numericSchema = z.object({ templates: z.array(z.object({
  facts: z.array(z.string()).describe('Keys of the facts it applies'),
  stem: z.string().describe('The question, with each parameter written as {name}'),
  params: z.array(z.object({ name: z.string(), min: z.number(), max: z.number(), step: z.number() })),
  expression: z.string().describe('The answer from the parameters, using + - * / ^ ( ) and sqrt, ln, log, exp, abs, round, min, max'),
  unit: z.string().nullable(),
  decimals: z.number().int().describe('Decimal places the answer is given to, 0 to 4'),
  explanation: z.string().describe('How the answer is worked out, with {name} for parameters'),
})) });
export type Templates = z.infer<typeof numericSchema>;
export interface NumericInput { language: Language; materialTitle: string; sections: SectionInput[]; count: number }

/** Numeric questions written once as templates. Code fills in values and computes every answer. */
export const numericTask: Task<NumericInput, Templates> = {
  name: 'questions.numeric', promptVersion: QUESTIONS_PROMPT_VERSION, temperature: 0.3,
  needs: { skill: 'write', data: 'institution', lane: 'interactive', maxOutput: 2000, cache: 'none' }, language: i => i.language,
  build: i => ({
    system: [
      'You write numeric practice questions as templates for a university student, applying a formula or relation the material states.',
      'Each template has parameters with realistic ranges and a step, a stem that uses every parameter as {name}, and an expression that computes the answer from the parameters. The answer must follow from the material, not from outside knowledge.',
      'Write a template only when the material gives a formula or a calculation a student can repeat with new values. Otherwise return none.',
      ...common(i.language),
    ].join('\n'),
    prompt: `<document title="${attribute(i.materialTitle)}">\n${sectionsXml(i.sections)}\n</document>\nWrite up to ${i.count} templates.`,
    schema: schemaOf(numericSchema),
  }),
  check: r => parsed(numericSchema, r.json),
};

/* ── Self-check ──────────────────────────────────────────────────────────── */

const selfCheckSchema = z.object({ items: z.array(z.object({
  section: z.string(), facts: z.array(z.string()),
  prompt: z.string().describe('A question that asks the student to explain why or how, or to apply an idea'),
  answer: z.string().describe('A model answer in two to four sentences, from the section only'),
  difficulty: z.enum(['reasoning', 'stretch']),
})) });
export type SelfChecks = z.infer<typeof selfCheckSchema>;
export interface SelfCheckInput { language: Language; materialTitle: string; sections: SectionInput[]; count: number }

/** Free-response prompts the student answers, then compares with the model answer and marks. */
export const selfCheckTask: Task<SelfCheckInput, SelfChecks> = {
  name: 'questions.self_check', promptVersion: QUESTIONS_PROMPT_VERSION, temperature: 0.4,
  needs: { skill: 'write', data: 'institution', lane: 'interactive', maxOutput: 2500, cache: 'none' }, language: i => i.language,
  build: i => ({
    system: [
      'You write short free-response questions for a university student to answer and then mark themselves against a model answer.',
      'Ask the student to explain why or how something happens, or to apply an idea to a case. Avoid questions with a one-word answer. The model answer says what a good answer must contain, briefly.',
      ...common(i.language),
    ].join('\n'),
    prompt: `<document title="${attribute(i.materialTitle)}">\n${sectionsXml(i.sections)}\n</document>\nWrite up to ${i.count} questions, spread over the sections.`,
    schema: schemaOf(selfCheckSchema),
  }),
  check: r => parsed(selfCheckSchema, r.json),
};

/* ── Verification ────────────────────────────────────────────────────────── */

const solveSchema = z.object({ verdicts: z.array(z.object({
  id: z.string(),
  answerable: z.boolean().describe('The source alone settles the answer'),
  solution: z.string().describe('Your own answer, from the source, in one or two sentences. For a numeric question, the number.'),
  correctOptions: z.array(z.number().int()).describe('For multiple choice, the number of every option the source makes correct. Empty otherwise.'),
  weakOptions: z.array(z.number().int()).describe('For multiple choice, the number of every wrong option a student could rule out without knowing the material, for example because it is a different kind of thing from the question. Empty otherwise.'),
  ambiguity: z.string().describe('Why the question could fairly be read two ways, or empty'),
})) });
export type Solved = z.infer<typeof solveSchema>;
export interface SolveItem { id: string; question: string; options?: string[]; source: string }

/**
 * A second reader solves each question from its source before seeing any key, so agreement means
 * something. For multiple choice and numbers the comparison is done in code.
 */
export const solveTask: Task<{ language: Language; items: SolveItem[] }, Solved> = {
  name: 'questions.solve', promptVersion: QUESTIONS_PROMPT_VERSION, temperature: 0,
  needs: { skill: 'check', data: 'institution', lane: 'interactive', maxOutput: 2500, cache: 'none' }, language: i => i.language,
  build: i => ({
    system: ['You answer practice questions using only the source text given with each one.', 'Solve each question yourself. For multiple choice, judge every option on its own against the source. For a calculation, work it out and give the number.', 'Say if the source does not settle the answer, or if the question could fairly be read two ways.', DATA_RULE, house(i.language)].join('\n'),
    prompt: i.items.map(q => `<item id="${q.id}">\nQuestion: ${escapeTags(q.question)}\n${q.options ? `Options: ${q.options.map((o, n) => `${n + 1}. ${escapeTags(o)}`).join(' | ')}\n` : ''}<document>${escapeTags(q.source)}</document>\n</item>`).join('\n'),
    schema: schemaOf(solveSchema),
  }),
  // A verdict missing for some items leaves those unchecked, which keeps them out.
  check: (r, i) => { const v = parsed(solveSchema, r.json); return v && i.items.some(q => v.verdicts.some(o => o.id === q.id)) ? v : null; },
};

const compareSchema = z.object({ verdicts: z.array(z.object({
  id: z.string(),
  matches: z.boolean().describe('The model answer says what the independent solution says, and the source supports it'),
  reason: z.string(),
})) });
export interface CompareItem { id: string; question: string; proposed: string; solution: string; source: string }

/** Compares a self-check's model answer with the independent solution, which code cannot do. */
export const compareTask: Task<{ language: Language; items: CompareItem[] }, z.infer<typeof compareSchema>> = {
  name: 'questions.compare', promptVersion: QUESTIONS_PROMPT_VERSION, temperature: 0,
  needs: { skill: 'check', data: 'institution', lane: 'interactive', maxOutput: 1500, cache: 'none' }, language: i => i.language,
  build: i => ({
    system: ['You review practice questions. Each comes with a proposed model answer, an independent solution written from the source without seeing it, and the source.', 'Judge whether the model answer agrees with the solution and the source in substance, not wording. Give a short reason. Be strict.', DATA_RULE, house(i.language)].join('\n'),
    prompt: i.items.map(q => `<item id="${q.id}">\nQuestion: ${escapeTags(q.question)}\nProposed answer: ${escapeTags(q.proposed)}\nIndependent solution: ${escapeTags(q.solution)}\n<document>${escapeTags(q.source)}</document>\n</item>`).join('\n'),
    schema: schemaOf(compareSchema),
  }),
  check: (r, i) => { const v = parsed(compareSchema, r.json); return v && i.items.every(q => v.verdicts.some(o => o.id === q.id)) ? v : null; },
};
