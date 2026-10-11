/**
 * Reviewed evaluation cases for `dev/pipeline.ts`. Development only, never bundled.
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

/* ── Grading set ─────────────────────────────────────────────────────────── */

/**
 * Six answers to each of three written questions from `questions.ts`. Marks are per rubric
 * point, in rubric order. They were drafted for review and are the reference the markers are
 * measured against. Change a mark here and the agreement figures follow.
 */
export type AnswerType = 'strong' | 'partial' | 'fluent-wrong' | 'keyword-stuffed' | 'off-topic' | 'alternative';
export interface GradedAnswer { question: string; type: AnswerType; text: string; marks: number[] }

export const GRADED_ANSWERS: GradedAnswer[] = [
  // q-col-wr-1: mortality removes supply, demand pre-existed, direction of causation.
  { question: 'q-col-wr-1', type: 'strong', marks: [2, 2, 2], text: 'Epidemic disease after contact killed most of the indigenous population, which removed the labour supply colonists relied on. Demand for labour in mines and on plantations already existed and did not fall when the supply did. The slave trade expanded to fill that gap. So the order is demand first, then disease removing the supply, then the trade. Disease did not cause slavery on its own.' },
  { question: 'q-col-wr-1', type: 'partial', marks: [2, 0, 0], text: 'Diseases such as smallpox and measles killed a huge share of the indigenous people, so there were far fewer workers. Because of this the Spanish started bringing enslaved Africans across the Atlantic to work instead.' },
  { question: 'q-col-wr-1', type: 'fluent-wrong', marks: [0, 0, 0], text: 'The chain begins with the slave trade itself. Ships carrying captives from West Africa brought smallpox and measles to the Americas, and these diseases then spread through indigenous communities. The resulting mortality reduced the need for plantation labour, so the trade slowed until new crops revived demand. In short, the slave trade caused the epidemics, not the other way round.' },
  { question: 'q-col-wr-1', type: 'keyword-stuffed', marks: [0, 0, 0], text: 'Mortality, disease, epidemic, smallpox, population collapse. Demand, labour problem, plantation, supply. Did not cause, gap, commercially attractive, second solution.' },
  { question: 'q-col-wr-1', type: 'off-topic', marks: [0, 0, 0], text: 'Mercantilism held that national wealth was measured in bullion and that trade was close to zero-sum. Colonies existed to supply raw materials and buy manufactures, which the Navigation Acts tried to enforce.' },
  { question: 'q-col-wr-1', type: 'alternative', marks: [2, 2, 2], text: 'Start with the planters. The Caribbean and mainland estates already needed far more workers than they had. When imported diseases wiped out much of the native population, the supply of coerced indigenous workers shrank while the need stayed exactly where it was. Captives shipped from Africa filled that shortfall. Epidemics did not create slavery. They closed off one source of labour and made the other one profitable.' },

  // q-enc-wr-1: labour and tribute from named people, land remained indigenous, consequence for the argument.
  { question: 'q-enc-wr-1', type: 'strong', marks: [2, 2, 2], text: 'The encomienda granted a Spaniard the labour and tribute of a named indigenous community. It did not grant land: the land legally remained indigenous. Calling it a land grant hides that it was a conditional claim on people, held at the Crown\'s pleasure, which moves the argument from property to coerced labour and tribute and explains how the Crown could limit or abolish it.' },
  { question: 'q-enc-wr-1', type: 'partial', marks: [2, 1, 0], text: 'The encomienda gave Spanish colonists the right to tribute and labour from indigenous communities. It was not really about land.' },
  { question: 'q-enc-wr-1', type: 'fluent-wrong', marks: [0, 0, 0], text: 'The encomienda was a royal land grant that gave conquistadors permanent ownership of large estates, together with the indigenous people living on them. Calling it a land grant is accurate, because the holder owned the soil outright and could pass it to his heirs, much like a feudal lord in Castile.' },
  { question: 'q-enc-wr-1', type: 'keyword-stuffed', marks: [0, 0, 0], text: 'Tribute. Labour. People. Not land. Legally theirs. Conditional. Crown. Obligation. Revocable. Feudal. Argument.' },
  { question: 'q-enc-wr-1', type: 'off-topic', marks: [0, 0, 0], text: 'Sugar cane has to be milled within about a day of cutting, so the mill stood next to the field and the workforce followed the mill\'s schedule.' },
  { question: 'q-enc-wr-1', type: 'alternative', marks: [2, 2, 2], text: 'If you call it a land grant you make it sound like a fief, permanent property, and then you cannot explain how the Crown could cut it back to one lifetime in 1542 or abolish it later. What the Crown actually handed out was a claim on people: a named indigenous community owed the holder tribute and work, while their land stayed theirs in law, and the holder owed them protection and religious instruction in return.' },

  // q-pl-wr-1: milling time constraint, consequence for scale, contrast with another crop.
  { question: 'q-pl-wr-1', type: 'strong', marks: [2, 2, 2], text: 'Cane has to be milled within roughly a day of cutting or its sucrose falls sharply. That puts the mill next to the field, needs a large coordinated workforce working to the mill\'s schedule, and ties up heavy fixed capital in the mill. Tobacco imposes no such constraint, so a tobacco farm can be small. Sugar could not be grown at small scale, which is why it organised the plantation system.' },
  { question: 'q-pl-wr-1', type: 'partial', marks: [2, 1, 0], text: 'Sugar cane has to be processed very quickly after it is cut, so sugar estates needed their own mill and a lot of workers. Sugar was also very profitable in Europe.' },
  { question: 'q-pl-wr-1', type: 'fluent-wrong', marks: [0, 0, 0], text: 'Sugar dominated because it was the most valuable crop per acre and grew only in the Caribbean, whereas tobacco and rice could also be grown in Europe. European demand for sweeteners rose steadily, so investors poured money into sugar islands rather than into crops that faced European competition.' },
  { question: 'q-pl-wr-1', type: 'keyword-stuffed', marks: [0, 0, 0], text: 'Milled, day, sucrose, perish. Scale, coordinated workforce, mill next to field, capital. Tobacco, rice, small, contrast.' },
  { question: 'q-pl-wr-1', type: 'off-topic', marks: [0, 0, 0], text: 'Maroon communities in Jamaica and Suriname won recognition by treaty, but often had to agree to return future runaways in exchange.' },
  { question: 'q-pl-wr-1', type: 'alternative', marks: [2, 2, 2], text: 'Think about what happens after the harvest. Cut cane loses its sugar within about a day unless it is crushed, so the crushing works had to stand beside the fields. That meant huge gangs working to the mill\'s timetable and a big investment in machinery before anything could be sold. Tobacco is cured slowly and could be grown by a family on a small plot, so it never forced that scale.' },
];
