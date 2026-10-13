/**
 * Reviewed evaluation cases for `dev/measure.ts`, and extra materials for the seed. Development
 * only, never bundled.
 *
 * The library is the fictional Atlantic World course in `materials.ts` plus four materials
 * written here to stress the pipeline: one paragraph longer than any chunk, a table of a hundred
 * rows, a figure whose content exists only in its generated description, and a handbook whose
 * second version contradicts the first. Every name, ship, port and number is invented.
 *
 * Expectations are written as text markers and patterns, never block ids, so they survive any
 * change to chunking. A marker is a phrase that must appear in the evidence given to the model.
 */

/* ── Extra materials ─────────────────────────────────────────────────────── */

const ledgerYears = Array.from({ length: 46 }, (_, i) => 1715 + i);
/** One paragraph of about 4,900 characters. The 1758 entry sits past character 4,000. */
const ledger = 'The customs ledgers of Port Calloway survive almost complete for the middle of the century, and they are unusually regular in form. '
  + ledgerYears.map((year, i) => `In ${year} the ledger records ${400 + (i * 37) % 150} hogsheads of sugar, ${40 + (i * 13) % 60} bales of cotton and ${year === 1758 ? 312 : 100 + (i * 29) % 180} casks of indigo landed at Port Calloway.`).join(' ');

const prefixes = ['Swift', 'Grey', 'Bold', 'Silver', 'Northern', 'Patient', 'Lucky', 'Quiet', 'Red', 'Faithful'];
const suffixes = ['Heron', 'Anchor', 'Lark', 'Venture', 'Promise', 'Dolphin', 'Rose', 'Hope', 'Pilgrim', 'Merchant'];
const cargoes = ['sugar', 'tobacco', 'rice', 'indigo', 'timber', 'salt fish'];
const ports = ['Bridgetown', 'Kingston', 'Charleston', 'Port Calloway', 'Basseterre'];
/** A register of a hundred voyages. The Mariposa is row 88, far past where a cut would fall. */
const register = ['| Ship | Year | Tonnage | Cargo | Port of lading |', '| --- | --- | --- | --- | --- |',
  ...Array.from({ length: 100 }, (_, i) => i === 87
    ? '| Mariposa | 1764 | 212 | sugar | Bridgetown |'
    : `| ${prefixes[i % 10]} ${suffixes[Math.floor(i / 10)]} | ${1750 + (i % 20)} | ${80 + (i * 17) % 300 === 212 ? 213 : 80 + (i * 17) % 300} | ${cargoes[i % 6]} | ${ports[i % 5]} |`)].join('\n');

export const EVAL_MATERIALS: { key: string; title: string; markdown: string; versions?: string[] }[] = [
  {
    key: 'ledger', title: 'Port Calloway customs ledgers',
    markdown: `# The ledgers as a source\n\n${ledger}\n\n# Reading the ledgers critically\n\nA ledger records what passed the customs house, not what was traded. Smuggled cargo leaves no entry, so the figures are a floor rather than a total.`,
  },
  {
    key: 'register', title: 'A register of Atlantic voyages',
    markdown: `# Voyage register\n\nThe register below lists voyages cleared by the harbour master, one row per voyage.\n\n${register}\n\n# Using the register\n\nTonnage is the registered burden of the ship, not the weight of cargo carried on a given voyage.`,
  },
  {
    key: 'winds', title: 'Winds and routes of the North Atlantic',
    // The placeholder paragraph becomes a figure block before the material is read.
    markdown: `# Why routes were not straight lines\n\nA sailing ship could not choose its course freely. Captains planned voyages around the prevailing winds, and a route that looks long on a map was often the fastest one in practice.\n\nFIGURE_PLACEHOLDER\n\n# Seasons\n\nVoyages were timed to avoid the hurricane season in the Caribbean, which ran from late summer into the autumn.`,
  },
  {
    key: 'handbook', title: 'Course handbook',
    markdown: '',
    versions: [
      '# Assessment\n\nThe source commentary is due in week 5 and is worth 20 per cent of the final mark. The essay is due in week 10 and is worth 40 per cent.',
      '# Assessment\n\nThe source commentary is now due in week 6 and is worth 25 per cent of the final mark. The essay is due in week 10 and is worth 35 per cent.',
    ],
  },
];

export const FIGURE = {
  material: 'winds',
  caption: 'Figure 1. Prevailing winds of the North Atlantic',
  /** Stands in for what the vision model writes at ingest. */
  description: 'The diagram shows a clockwise loop of prevailing winds. Ships sail south to the Canary Islands, cross west on the trade winds to the Caribbean, and return north and east on the westerlies, passing the Azores before reaching Europe.',
};

/* ── Tutor cases ─────────────────────────────────────────────────────────── */

/** Where a session starts: a section of a material, or a topic with no section. */
export type EvalStart = { material: string; heading: string; version?: number } | { topic: true };
export type Verdict = 'sufficient' | 'partial' | 'absent';
export interface TutorCase {
  id: string;
  kind: 'ordinary' | 'follow-up' | 'unsupported' | 'partial' | 'long-block' | 'table' | 'figure' | 'version' | 'conflict' | 'focus-shift';
  start: EvalStart;
  history?: [student: string, tutor: string][];
  message: string;
  /** Each marker must appear in some passage given to the model. */
  evidence: string[];
  /** No passage given to the model may contain these. */
  staleEvidence?: string[];
  verdict: Verdict;
  /** Every pattern must match the reply. */
  answer: RegExp[];
  forbid?: RegExp[];
  /** The reply must say the materials do not cover something. */
  limitation?: boolean;
}

/** A reply that admits what the materials leave out. Reviewed against the fallback wording too. */
export const LIMITATION = /(material|notes|reading|course|source|passage)s?[^.]{0,80}\b(do not|don't|does not|doesn't|did not|didn't|not)\b[^.]{0,40}\b(cover|say|mention|include|address|discuss|specify|state|name|identify|explain)|beyond (your|the) (course )?materials|not (covered|in your materials)|outside (of )?(your|the) (course )?materials/i;
const CITED = /\[\[\d+\]\]/;

const topic = { topic: true } as const;
export const TUTOR_CASES: TutorCase[] = [
  { id: 'ord-demography', kind: 'ordinary', start: { material: 'mat-exchange-reading', heading: 'The demographic argument' }, message: 'Why did the demographic collapse matter for the slave trade?', evidence: ['a labour system whose supply was collapsing'], verdict: 'sufficient', answer: [/labou?r/i, /(demand|need)/i] },
  { id: 'ord-encomienda', kind: 'ordinary', start: topic, message: 'What did an encomienda actually grant?', evidence: ['right to receive tribute and labour'], verdict: 'sufficient', answer: [/tribute/i, /labou?r/i] },
  { id: 'ord-navigation', kind: 'ordinary', start: topic, message: 'What did the Navigation Acts require of colonial trade?', evidence: ['travel in English ships'], verdict: 'sufficient', answer: [/English ships/i] },
  {
    id: 'follow-enforcement', kind: 'follow-up', start: topic,
    history: [['What were the three ideas behind mercantilism?', 'Mercantilism held that national wealth is the stock of bullion, that trade is close to zero-sum, and that colonies exist to supply raw materials and buy manufactures. Which of those seems most surprising to you?']],
    message: 'Did people actually follow it?', evidence: ['Smuggling was not a marginal leakage'], verdict: 'sufficient', answer: [/smuggl/i],
  },
  {
    id: 'follow-maroon', kind: 'follow-up', start: topic,
    history: [['What were maroon communities?', 'Maroon communities were settlements of people who had escaped slavery, in places such as Jamaica, Suriname and the Brazilian interior. Some were recognised by treaty. Shall we look at what those treaties involved?']],
    message: 'Yes, what was the catch?', evidence: ['agreeing to return future runaways'], verdict: 'sufficient', answer: [/(runaway|return)/i],
  },
  {
    id: 'follow-larssen', kind: 'follow-up', start: topic,
    history: [["What is Larssen's argument about the plantation?", 'Larssen argues that the plantation was a node in a commercial system that happened to farm, financed by credit from European ports and governed by insurance contracts. Does that framing make sense to you?']],
    message: 'Who disagreed with him, and why?', evidence: ["Mbeki's criticism of Larssen"], verdict: 'sufficient', answer: [/Mbeki/],
  },
  { id: 'unsup-napoleon', kind: 'unsupported', start: topic, message: "What did Napoleon's army do in Egypt in 1798?", evidence: [], verdict: 'absent', answer: [], forbid: [CITED], limitation: true },
  { id: 'unsup-calculus', kind: 'unsupported', start: { material: 'mat-exchange-reading', heading: 'What crossed, and in which direction' }, message: 'How do I differentiate x squared?', evidence: [], verdict: 'absent', answer: [], forbid: [CITED], limitation: true },
  { id: 'unsup-tordesillas', kind: 'unsupported', start: topic, message: 'What did the Treaty of Tordesillas divide between Spain and Portugal?', evidence: [], verdict: 'absent', answer: [], forbid: [CITED], limitation: true },
  { id: 'partial-newlaws', kind: 'partial', start: topic, message: 'What did the New Laws of 1542 change about the encomienda, and which officials enforced them?', evidence: ['New Laws of 1542'], verdict: 'partial', answer: [/lifetime/i], limitation: true },
  { id: 'long-indigo', kind: 'long-block', start: topic, message: 'How many casks of indigo were landed at Port Calloway in 1758?', evidence: ['In 1758 the ledger records'], verdict: 'sufficient', answer: [/\b312\b/] },
  { id: 'table-mariposa', kind: 'table', start: topic, message: 'What was the tonnage of the Mariposa and what cargo did it carry?', evidence: ['Mariposa'], verdict: 'sufficient', answer: [/\b212\b/, /sugar/i] },
  { id: 'figure-azores', kind: 'figure', start: topic, message: 'On the wind diagram, which islands do ships pass on the way back to Europe?', evidence: ['Azores'], verdict: 'sufficient', answer: [/Azores/] },
  { id: 'version-current', kind: 'version', start: topic, message: 'When is the source commentary due and how much is it worth?', evidence: ['due in week 6'], staleEvidence: ['due in week 5'], verdict: 'sufficient', answer: [/week 6/i, /25/], forbid: [/week 5/i] },
  { id: 'version-stale-focus', kind: 'version', start: { material: 'handbook', heading: 'Assessment', version: 1 }, message: 'When is the source commentary due and how much is it worth?', evidence: ['due in week 6'], staleEvidence: ['due in week 5'], verdict: 'sufficient', answer: [/week 6/i], forbid: [/week 5(?![^.]*(earlier|previous|old|changed|moved))/i] },
  { id: 'conflict-encomienda', kind: 'conflict', start: topic, message: 'Was the encomienda mainly about revenue or about forced labour?', evidence: ['Valderrama', 'Okonkwo'], verdict: 'sufficient', answer: [/Valderrama/, /Okonkwo/] },
  { id: 'focus-shift', kind: 'focus-shift', start: { material: 'mat-exchange-reading', heading: 'What crossed, and in which direction' }, message: 'Why are runaway advertisements useful evidence?', evidence: ['runaway advertisements'], verdict: 'sufficient', answer: [/advertis/i] },
];
