import type { Question } from '../types.ts';
import { ATLANTIC_COURSE_ID } from './topics.ts';

/**
 * The authored question bank.
 *
 * ── Why the pool has to be this large ─────────────────────────────────────
 *
 * The brief requires difficulty controls that actually select different
 * questions, mixed-topic exams, and a results screen that can recommend
 * *different* remediation from what was just attempted. All three fail quietly
 * on a small pool: pick "stretch" and get the same four questions, or retry a
 * mistake and be handed the identical question you have just memorised the
 * answer to. So the bank is deliberately oversized relative to any one session
 * — every (topic, format, difficulty) cell that the UI can select has at least
 * one question, and the cells the seeded student is weak at have several.
 *
 * ── Marks ─────────────────────────────────────────────────────────────────
 *
 * Marks are per-question and used only by exams. Recall formats are worth 1–2,
 * source analysis 6, essays 12–15, which is roughly the ratio a real paper
 * uses and matters because the exam builder shows a live total.
 */

export const SEED_QUESTIONS: Question[] = [
  /* ── Columbian Exchange ─────────────────────────────────────────────── */
  {
    id: 'q-col-fc-1',
    courseId: ATLANTIC_COURSE_ID,
    format: 'flashcard',
    topicId: 'topic-columbian',
    difficulty: 'recall',
    marks: 1,
    prompt: 'Which direction did maize, potatoes and cassava travel, and what was the long-run consequence?',
    answer:
      'Eastward, to Europe, Africa and Asia. They raised the calorie ceiling of Old World agriculture and underwrote a long demographic expansion.',
    explanation:
      'The direction is the easy half. The consequence — a higher calorie ceiling, therefore population growth — is the half that earns marks.',
    source: { materialId: 'mat-exchange-reading', passageId: 'p-exch-1' },
  },
  {
    id: 'q-col-fc-2',
    courseId: ATLANTIC_COURSE_ID,
    format: 'flashcard',
    topicId: 'topic-columbian',
    difficulty: 'recall',
    marks: 1,
    prompt: 'Why did Old World pathogens devastate American populations rather than the reverse?',
    answer:
      'Europeans and Africans had lived alongside domesticated herd animals for millennia and carried acquired immunity to the resulting diseases. American populations had no such exposure history.',
    explanation:
      'The asymmetry traces to animal domestication, not to any difference in the populations themselves.',
    source: { materialId: 'mat-exchange-reading', passageId: 'p-exch-1' },
  },
  {
    id: 'q-col-mc-1',
    courseId: ATLANTIC_COURSE_ID,
    format: 'multiple-choice',
    topicId: 'topic-columbian',
    difficulty: 'reasoning',
    marks: 2,
    prompt:
      'Valderrama insists that disease "did not cause slavery". Which statement best captures his actual causal claim?',
    options: [
      'Disease was unrelated to the growth of the Atlantic slave trade.',
      'Disease removed one solution to a labour problem the plantation economy had already created, making a second solution commercially attractive.',
      'Disease caused the plantation economy, which then required enslaved labour.',
      'Slavery spread the epidemics that reduced indigenous populations.',
    ],
    correctIndices: [1],
    explanation:
      'The demand for labour came first. Epidemic mortality removed the indigenous supply that had been meeting it; the slave trade expanded into the resulting gap. Option 3 inverts the order and option 1 overcorrects into denying any link at all.',
    source: { materialId: 'mat-exchange-reading', passageId: 'p-exch-2' },
  },
  {
    id: 'q-col-ms-1',
    courseId: ATLANTIC_COURSE_ID,
    format: 'multiple-select',
    topicId: 'topic-columbian',
    difficulty: 'reasoning',
    marks: 3,
    prompt:
      'Select every piece of evidence Valderrama uses against a purely biological reading of the Exchange.',
    options: [
      'Recovery was fastest where colonial labour demands were lightest.',
      'Caribbean sugar islands saw no demographic recovery at all.',
      'Pathogens travelled on ships, which followed commerce and conquest.',
      'Indigenous populations had no acquired immunity to smallpox.',
      'Mortality estimates for the first century remain contested.',
    ],
    correctIndices: [0, 1, 2],
    explanation:
      'The argument is that identical pathogens produced different outcomes depending on colonial demands, so biology alone cannot be the explanation. Options 4 and 5 are true statements from the reading but they support the biological account or are neutral — they are not part of the case against it.',
    source: { materialId: 'mat-exchange-reading', passageId: 'p-exch-3' },
  },
  {
    id: 'q-col-fb-1',
    courseId: ATLANTIC_COURSE_ID,
    format: 'fill-blank',
    topicId: 'topic-columbian',
    difficulty: 'recall',
    marks: 2,
    prompt: 'Complete the causal chain from the reading.',
    template:
      'Epidemic mortality removed the ___ labour force. The encomienda became harder to work as communities shrank, so colonists ___ demands on survivors, raising mortality further. Into that gap the Atlantic ___ trade expanded.',
    blanks: [
      ['indigenous', 'native', 'american'],
      ['intensified', 'increased', 'raised'],
      ['slave', 'slave ', 'enslaved'],
    ],
    explanation:
      'Each step tightens the loop: fewer workers, heavier demands on those remaining, higher mortality, a larger gap for the slave trade to fill.',
    source: { materialId: 'mat-exchange-reading', passageId: 'p-exch-2' },
  },
  {
    id: 'q-col-wr-1',
    courseId: ATLANTIC_COURSE_ID,
    format: 'written-recall',
    topicId: 'topic-columbian',
    difficulty: 'reasoning',
    marks: 6,
    prompt:
      'From memory, explain the causal chain linking epidemic mortality to the expansion of the Atlantic slave trade. Be explicit about the order of events.',
    rubric: [
      {
        id: 'r-col-1',
        label: 'Identifies epidemic mortality as removing the indigenous labour supply',
        marks: 2,
        keywords: ['mortality', 'disease', 'epidemic', 'smallpox', 'population', 'collapse'],
        missedAdvice:
          'Start with the demographic collapse — it is the first link and the rest does not follow without it.',
      },
      {
        id: 'r-col-2',
        label: 'Explains that labour demand pre-existed and did not fall with supply',
        marks: 2,
        keywords: ['demand', 'labour problem', 'labor problem', 'already', 'plantation', 'supply'],
        missedAdvice:
          'The key move is that demand stayed constant while supply collapsed. Without that, disease and slavery look merely adjacent.',
      },
      {
        id: 'r-col-3',
        label: 'States the direction of causation explicitly, avoiding "disease caused slavery"',
        marks: 2,
        keywords: ['did not cause', 'not cause', 'gap', 'commercially', 'attractive', 'second solution'],
        missedAdvice:
          'Say what disease did *not* do. Valderrama makes the point explicitly, and an answer that leaves it implicit reads as the cruder version.',
      },
    ],
    explanation:
      'A strong answer names three links and their order: demand exists, supply collapses, the trade expands into the gap.',
    source: { materialId: 'mat-exchange-reading', passageId: 'p-exch-2' },
  },

  /* ── Encomienda ─────────────────────────────────────────────────────── */
  {
    id: 'q-enc-fc-1',
    courseId: ATLANTIC_COURSE_ID,
    format: 'flashcard',
    topicId: 'topic-encomienda',
    difficulty: 'recall',
    marks: 1,
    prompt: 'What did an encomienda grant actually convey?',
    answer:
      'The right to tribute and labour from a named group of people, in exchange for obligations to protect and instruct them. Not land — the land remained legally theirs.',
    explanation:
      'People, not acres, and conditionally at that. This is the distinction most undergraduate answers get wrong.',
    source: { materialId: 'mat-encomienda-reading', passageId: 'p-enc-1' },
  },
  {
    id: 'q-enc-fc-2',
    courseId: ATLANTIC_COURSE_ID,
    format: 'flashcard',
    topicId: 'topic-encomienda',
    difficulty: 'recall',
    marks: 1,
    prompt: 'What did the New Laws of 1542 attempt to do?',
    answer:
      'Limit the encomienda to a single lifetime by preventing inheritance, among other restrictions on colonial labour demands.',
    explanation:
      'The attempt matters as much as the outcome: colonial resistance to it, including armed revolt in Peru, is evidence about how valuable the institution was held to be.',
    source: { materialId: 'mat-encomienda-reading', passageId: 'p-enc-1' },
  },
  {
    id: 'q-enc-mc-1',
    courseId: ATLANTIC_COURSE_ID,
    format: 'multiple-choice',
    topicId: 'topic-encomienda',
    difficulty: 'recall',
    marks: 2,
    prompt: 'Which statement about the encomienda is correct?',
    options: [
      'It granted title to land, which the encomendero could sell.',
      'It granted the labour and tribute of named people, while the land remained legally theirs.',
      'It granted both land and people in perpetuity.',
      'It was a wage contract between colonists and indigenous workers.',
    ],
    correctIndices: [1],
    explanation:
      'The grant was of people and conditional. Reading it as a land grant makes every subsequent argument about the institution go wrong.',
    source: { materialId: 'mat-encomienda-reading', passageId: 'p-enc-1' },
  },
  {
    id: 'q-enc-mc-2',
    courseId: ATLANTIC_COURSE_ID,
    format: 'multiple-choice',
    topicId: 'topic-encomienda',
    difficulty: 'reasoning',
    marks: 3,
    prompt:
      'Okonkwo argues that the abolition of the encomienda does not show it was essentially fiscal. What is her reason?',
    options: [
      'The abolition was never actually enforced anywhere.',
      'Forced labour continued after abolition through the repartimiento and the mita, so the coercion outlived the tax device.',
      'The Crown continued to collect tribute in the same way afterwards.',
      'The fiscal records from after 1542 have not survived.',
    ],
    correctIndices: [1],
    explanation:
      'Her test is survival: if abolishing the fiscal arrangement leaves the coercion intact, the coercion was not merely a by-product of it.',
    source: { materialId: 'mat-encomienda-reading', passageId: 'p-enc-3' },
  },
  {
    id: 'q-enc-match-1',
    courseId: ATLANTIC_COURSE_ID,
    format: 'matching',
    topicId: 'topic-encomienda',
    difficulty: 'reasoning',
    marks: 4,
    prompt: 'Match each historian to the evidence base their argument rests on.',
    pairs: [
      { left: 'Valderrama', right: 'Tribute schedules and Crown fiscal records' },
      { left: 'Okonkwo', right: 'Residencia hearings and mission mortality registers' },
      { left: 'Larssen', right: 'European insurance contracts and credit instruments' },
      { left: 'Mbeki', right: 'Runaway advertisements and punishment books' },
    ],
    explanation:
      'The pattern is the point: each historian’s conclusion follows from which archive they treat as revealing. That observation is the spine of a comparison answer.',
    source: { materialId: 'mat-encomienda-reading', passageId: 'p-enc-3' },
  },
  {
    id: 'q-enc-fb-1',
    courseId: ATLANTIC_COURSE_ID,
    format: 'fill-blank',
    topicId: 'topic-encomienda',
    difficulty: 'recall',
    marks: 2,
    prompt: 'Complete the definition.',
    template:
      'An encomienda granted the right to ___ and labour from a named group of people, in exchange for an obligation to protect them and see them instructed in ___. The ___ remained, in law, theirs.',
    blanks: [['tribute'], ['christianity', 'the faith', 'religion'], ['land']],
    explanation: 'Tribute, Christianity, land. Three words that carry most of the definition.',
    source: { materialId: 'mat-encomienda-reading', passageId: 'p-enc-1' },
  },
  {
    id: 'q-enc-wr-1',
    courseId: ATLANTIC_COURSE_ID,
    format: 'written-recall',
    topicId: 'topic-encomienda',
    difficulty: 'reasoning',
    marks: 6,
    prompt:
      'Without looking at your notes, explain what the encomienda was and why calling it a "land grant" changes the argument.',
    rubric: [
      {
        id: 'r-enc-1',
        label: 'Defines the grant as labour and tribute from named people',
        marks: 2,
        keywords: ['tribute', 'labour', 'labor', 'people', 'not land'],
        missedAdvice: 'Name both halves of what was granted: tribute and labour, from a named community.',
      },
      {
        id: 'r-enc-2',
        label: 'States that land remained legally indigenous',
        marks: 2,
        keywords: ['land remained', 'legally theirs', 'not a grant of land', 'did not grant land', 'own the land'],
        missedAdvice:
          'Say explicitly that the land stayed theirs in law. The contrast is what makes the definition precise.',
      },
      {
        id: 'r-enc-3',
        label: 'Explains the consequence for the argument',
        marks: 2,
        keywords: ['conditional', 'crown', 'obligation', 'revocable', 'argument', 'feudal'],
        missedAdvice:
          'Finish the thought: if it were a land grant it would look feudal and permanent, which makes the Crown’s ability to abolish it inexplicable.',
      },
    ],
    explanation:
      'Definition, contrast, consequence. The third part is what turns a definition into an argument.',
    source: { materialId: 'mat-encomienda-reading', passageId: 'p-enc-1' },
  },
  {
    id: 'q-enc-sa-1',
    courseId: ATLANTIC_COURSE_ID,
    format: 'source-analysis',
    topicId: 'topic-encomienda',
    difficulty: 'reasoning',
    marks: 6,
    prompt:
      'Read the extract. Identify the claim being made, the evidence offered for it, and one limitation of that evidence.',
    extract: `"An institution abolished the moment direct taxation became feasible was a tax-collection device all along. The Crown's repeated attempts to convert labour obligations into cash payments point the same way: what it wanted was revenue, and labour was merely the form in which a territory without coin could pay."

— Valderrama, *Atlantic Crossings* (fictional)`,
    rubric: [
      {
        id: 'r-sa-enc-1',
        label: 'Identifies the claim: the encomienda was fundamentally a revenue device',
        marks: 2,
        keywords: ['fiscal', 'revenue', 'tax', 'tribute', 'money', 'cash'],
        missedAdvice: 'State the claim in one sentence before analysing it.',
      },
      {
        id: 'r-sa-enc-2',
        label: 'Identifies the evidence: timing of abolition and attempts to commute labour to cash',
        marks: 2,
        keywords: ['abolition', 'abolished', 'timing', 'convert', 'commute', 'cash payment', 'direct taxation'],
        missedAdvice:
          'Name the two evidential moves separately — when it was abolished, and what the Crown kept trying to change it into.',
      },
      {
        id: 'r-sa-enc-3',
        label: 'Identifies a limitation, e.g. that fiscal records describe intention not practice',
        marks: 2,
        keywords: ['intention', 'intended', 'practice', 'silent', 'coercion', 'okonkwo', 'not record', 'hoped'],
        missedAdvice:
          'The limitation Okonkwo presses: these sources record what the Crown wished to collect, not what happened in the mines.',
      },
    ],
    explanation:
      'Claim, evidence, limitation — in that order. The limitation is where marks are usually lost, because it requires bringing in what the source is silent about.',
    source: { materialId: 'mat-encomienda-reading', passageId: 'p-enc-2' },
  },

  /* ── Plantation complex ─────────────────────────────────────────────── */
  {
    id: 'q-pl-fc-1',
    courseId: ATLANTIC_COURSE_ID,
    format: 'flashcard',
    topicId: 'topic-plantation',
    difficulty: 'recall',
    marks: 1,
    prompt: 'What agronomic fact about sugar cane drove the plantation form?',
    answer:
      'Cane must be milled within about a day of cutting or its sucrose content falls sharply — which puts the mill beside the field and requires a large coordinated workforce and heavy fixed capital.',
    explanation:
      'The technical constraint comes before the economic consequence. Answers that start with profit skip the step that explains the form.',
    source: { materialId: 'mat-plantation-reading', passageId: 'p-plant-1' },
  },
  {
    id: 'q-pl-mc-1',
    courseId: ATLANTIC_COURSE_ID,
    format: 'multiple-choice',
    topicId: 'topic-plantation',
    difficulty: 'reasoning',
    marks: 2,
    prompt:
      'Larssen calls the plantation "a node in a commercial system that happened to farm". What does this claim rest on?',
    options: [
      'Plantations produced more trade goods than food.',
      'Credit, insurance and the terms of the circuit originated in Europe, so the planter operated someone else’s capital under distant terms.',
      'Most planters were absentees who never visited their estates.',
      'Sugar was traded more widely than any other commodity.',
    ],
    correctIndices: [1],
    explanation:
      'The governing logic is in the credit and insurance contracts, not the plantation ledger. That is why Larssen reads the planter as a debtor rather than a landowner.',
    source: { materialId: 'mat-plantation-reading', passageId: 'p-plant-2' },
  },
  {
    id: 'q-pl-ord-1',
    courseId: ATLANTIC_COURSE_ID,
    format: 'ordering',
    topicId: 'topic-plantation',
    difficulty: 'reasoning',
    marks: 4,
    prompt:
      'Put the legs of the commercial circuit in the order Larssen describes, beginning with its origin.',
    sequence: [
      'Credit is advanced by merchants in European ports',
      'Trade goods are purchased and shipped to the West African coast',
      'Goods are exchanged for captive people',
      'Captives are carried to the Caribbean and sold',
      'Sale proceeds settle the original credit and finance the sugar shipment home',
    ],
    explanation:
      'The circuit begins with European credit, not with the African coast. Starting in the wrong place is what makes an answer describe a triangle of trade rather than a system of finance.',
    source: { materialId: 'mat-plantation-reading', passageId: 'p-plant-2' },
  },
  {
    id: 'q-pl-ms-1',
    courseId: ATLANTIC_COURSE_ID,
    format: 'multiple-select',
    topicId: 'topic-plantation',
    difficulty: 'stretch',
    marks: 3,
    prompt: 'Select every claim Mbeki makes against Larssen’s commercial account.',
    options: [
      'Plantation accounts were kept by people for whom labour was a cost line.',
      'The commercial model cannot explain the expense of surveillance and punishment.',
      'The commercial account is factually wrong about credit flows.',
      'Output was continually constrained by refusal, slowdown, flight and revolt.',
      'Sugar was less profitable than Larssen claims.',
    ],
    correctIndices: [0, 1, 3],
    explanation:
      'Mbeki does not dispute Larssen’s facts about credit or profit — she disputes what the ledger can show. Options 3 and 5 attribute a factual disagreement to her that she does not make.',
    source: { materialId: 'mat-plantation-reading', passageId: 'p-plant-3' },
  },
  {
    id: 'q-pl-sa-1',
    courseId: ATLANTIC_COURSE_ID,
    format: 'source-analysis',
    topicId: 'topic-plantation',
    difficulty: 'stretch',
    marks: 6,
    prompt:
      'Identify the perspective from which this extract is written, and what that perspective makes it good and bad evidence for.',
    extract: `"Memorandum to the attorney, Bybrook estate, 1761. The mill gang is short four hands since the last crop and the overseer reports the pace of cutting much fallen off. I am not persuaded the sickness is all it is said to be. You will engage two additional drivers at whatever wage is necessary and you will render me a weekly account of the hogsheads."

— Fictional estate correspondence`,
    rubric: [
      {
        id: 'r-sa-pl-1',
        label: 'Identifies the perspective as the absentee owner, writing about costs and output',
        marks: 2,
        keywords: ['owner', 'absentee', 'proprietor', 'attorney', 'cost', 'output', 'profit'],
        missedAdvice: 'Say who is writing and what they are trying to achieve by writing it.',
      },
      {
        id: 'r-sa-pl-2',
        label: 'Notes the suspicion of feigned sickness as evidence of everyday resistance',
        marks: 2,
        keywords: ['sickness', 'feign', 'slowdown', 'resistance', 'refusal', 'not persuaded', 'pace'],
        missedAdvice:
          'The owner’s scepticism is the most revealing line: it is evidence of slowdown, recorded by someone who did not intend to record it.',
      },
      {
        id: 'r-sa-pl-3',
        label: 'States a limitation: it records only what alarmed the owner, and in his terms',
        marks: 2,
        keywords: ['limitation', 'one side', 'his terms', 'silent', 'no voice', 'only records', 'cost line'],
        missedAdvice:
          'Name what the source cannot show — the enslaved people appear only as a shortfall in output, never in their own words.',
      },
    ],
    explanation:
      'This is Mbeki’s method applied directly: read the commercial document against its purpose and the resistance it was written to complain about becomes visible.',
    source: { materialId: 'mat-plantation-reading', passageId: 'p-plant-3' },
  },
  {
    id: 'q-pl-fb-1',
    courseId: ATLANTIC_COURSE_ID,
    format: 'fill-blank',
    topicId: 'topic-plantation',
    difficulty: 'recall',
    marks: 2,
    prompt: 'Complete the agronomic argument.',
    template:
      'Cane must be ___ within roughly a day of cutting or its ___ content falls sharply. This forces the mill next to the field and requires heavy fixed ___ investment.',
    blanks: [['milled', 'ground', 'processed'], ['sucrose', 'sugar'], ['capital']],
    explanation: 'Milled, sucrose, capital — the chain from plant biology to industrial form.',
    source: { materialId: 'mat-plantation-reading', passageId: 'p-plant-1' },
  },
  {
    id: 'q-pl-wr-1',
    courseId: ATLANTIC_COURSE_ID,
    format: 'written-recall',
    topicId: 'topic-plantation',
    difficulty: 'reasoning',
    marks: 6,
    prompt:
      'Explain from memory why sugar, rather than tobacco or rice, organised the Atlantic plantation system.',
    rubric: [
      {
        id: 'r-pl-wr-1',
        label: 'Names the milling time constraint',
        marks: 2,
        keywords: ['milled', 'day', 'sucrose', 'perish', 'immediately', 'quickly'],
        missedAdvice: 'Begin with the constraint: cane spoils within about a day of cutting.',
      },
      {
        id: 'r-pl-wr-2',
        label: 'Draws the consequence for scale and coordination',
        marks: 2,
        keywords: ['scale', 'coordinated', 'workforce', 'mill next', 'schedule', 'large', 'capital'],
        missedAdvice:
          'Connect the constraint to the form: mill beside field, workforce on the mill’s schedule, heavy fixed capital.',
      },
      {
        id: 'r-pl-wr-3',
        label: 'Contrasts with a crop that does not impose the constraint',
        marks: 2,
        keywords: ['tobacco', 'rice', 'small', 'smallholding', 'contrast', 'indigo'],
        missedAdvice:
          'Use the contrast case. A tobacco farm can be small, which is exactly why the comparison proves the point.',
      },
    ],
    explanation:
      'Constraint, consequence, contrast. The contrast is what makes it an explanation rather than a description.',
    source: { materialId: 'mat-plantation-reading', passageId: 'p-plant-1' },
  },

  /* ── Mercantilism ───────────────────────────────────────────────────── */
  {
    id: 'q-mer-fc-1',
    courseId: ATLANTIC_COURSE_ID,
    format: 'flashcard',
    topicId: 'topic-mercantilism',
    difficulty: 'recall',
    marks: 1,
    prompt: 'State the three propositions of mercantilist doctrine.',
    answer:
      'National wealth is measured in bullion; trade is close to zero-sum; colonies exist to supply raw materials to the metropole and to buy its manufactures.',
    explanation:
      'Bullion, zero-sum, colonial subordination. Holding all three together is what makes it a doctrine rather than three opinions.',
    source: { materialId: 'mat-mercantilism-lecture', passageId: 'p-merc-1' },
  },
  {
    id: 'q-mer-mc-1',
    courseId: ATLANTIC_COURSE_ID,
    format: 'multiple-choice',
    topicId: 'topic-mercantilism',
    difficulty: 'reasoning',
    marks: 2,
    prompt:
      'The lecture warns against treating mercantilism as foolish. What is the defence offered?',
    options: [
      'Modern economics has shown the bullion theory to be correct.',
      'It described a world where state capacity depended on paying armies in genuinely scarce coin.',
      'It was never actually implemented as policy.',
      'Contemporaries did not really believe it.',
    ],
    correctIndices: [1],
    explanation:
      'The doctrine was a reasonable response to its own conditions. Judging it against later economic theory tells you about the theory, not about the eighteenth century.',
    source: { materialId: 'mat-mercantilism-lecture', passageId: 'p-merc-1' },
  },
  {
    id: 'q-mer-ms-1',
    courseId: ATLANTIC_COURSE_ID,
    format: 'multiple-select',
    topicId: 'topic-mercantilism',
    difficulty: 'reasoning',
    marks: 3,
    prompt: 'Select every requirement the Navigation Acts imposed.',
    options: [
      'Colonial trade had to travel in English ships.',
      'Enumerated goods had to be landed in England before resale.',
      'Colonial imports of European manufactures had to pass through English ports.',
      'Colonies were forbidden to grow sugar.',
      'All colonial trade had to be conducted in bullion.',
    ],
    correctIndices: [0, 1, 2],
    explanation:
      'Three requirements: English shipping, enumeration, and entrepôt. Options 4 and 5 invert the point of the system — the Acts existed to channel colonial produce, not to suppress it.',
    source: { materialId: 'mat-mercantilism-lecture', passageId: 'p-merc-2' },
  },
  {
    id: 'q-mer-fb-1',
    courseId: ATLANTIC_COURSE_ID,
    format: 'fill-blank',
    topicId: 'topic-mercantilism',
    difficulty: 'reasoning',
    marks: 2,
    prompt: 'Complete the lecture’s warning about enforcement.',
    template:
      'The customs establishment in the Caribbean was small, badly paid and frequently ___. ___ was not a marginal leakage. The gap between the statute book and the ___ is the most useful thing to hold on to about mercantilism.',
    blanks: [['local'], ['smuggling', 'contraband'], ['wharf', 'dock', 'quay']],
    explanation:
      'Local officials, large-scale smuggling, and the resulting gap between law and practice.',
    source: { materialId: 'mat-mercantilism-lecture', passageId: 'p-merc-2' },
  },
  {
    id: 'q-mer-wr-1',
    courseId: ATLANTIC_COURSE_ID,
    format: 'written-recall',
    topicId: 'topic-mercantilism',
    difficulty: 'stretch',
    marks: 6,
    prompt:
      'Explain why the lecture warns against running an argument directly from the Navigation Acts to revolution.',
    rubric: [
      {
        id: 'r-mer-1',
        label: 'States that the connection is real but not a mechanism',
        marks: 2,
        keywords: ['mechanism', 'not automatic', 'real but', 'connection', 'too direct'],
        missedAdvice:
          'Concede the connection before qualifying it — the lecture does not deny the link, it denies the shortcut.',
      },
      {
        id: 'r-mer-2',
        label: 'Identifies the interest the system created in a colonial merchant class',
        marks: 2,
        keywords: ['merchant', 'interest', 'colonial merchants', 'prices', 'one market', 'smuggl'],
        missedAdvice:
          'Name the group whose interests the system created: colonial merchants forced to sell into one market at that market’s prices.',
      },
      {
        id: 'r-mer-3',
        label: 'Notes that the intermediate steps are what make it an explanation',
        marks: 2,
        keywords: ['steps', 'intermediate', 'explanation', 'skipped', 'stages', 'how'],
        missedAdvice:
          'Say what an answer would need to supply: the steps between a commercial grievance and an armed rising.',
      },
    ],
    explanation:
      'Concede, specify, then say what is missing. That shape works for any "X caused Y" question you are sceptical of.',
    source: { materialId: 'mat-mercantilism-lecture', passageId: 'p-merc-3' },
  },

  /* ── Resistance and revolt ──────────────────────────────────────────── */
  {
    id: 'q-rev-fc-1',
    courseId: ATLANTIC_COURSE_ID,
    format: 'flashcard',
    topicId: 'topic-revolt',
    difficulty: 'recall',
    marks: 1,
    prompt: 'Why does Mbeki object to teaching resistance as a list of revolts?',
    answer:
      'It makes resistance look rare. Organised revolt was its least common form; the spectrum ran from slowdown and feigned incomprehension through flight and maroon settlement to armed rising.',
    explanation:
      'Counting only the most visible form and concluding resistance was exceptional is a methodological error, not a finding.',
    source: { materialId: 'mat-revolt-reading', passageId: 'p-rev-1' },
  },
  {
    id: 'q-rev-mc-1',
    courseId: ATLANTIC_COURSE_ID,
    format: 'multiple-choice',
    topicId: 'topic-revolt',
    difficulty: 'stretch',
    marks: 3,
    prompt: 'What is "the treaty problem" in the study of maroon communities?',
    options: [
      'Treaties were never honoured by colonial governments.',
      'Recognition of autonomy was typically purchased by agreeing to return future runaways.',
      'No treaties with maroon communities survive in the archive.',
      'Maroon communities refused all negotiation with colonial states.',
    ],
    correctIndices: [1],
    explanation:
      'A community that had escaped bondage became, in law, an instrument of its enforcement. Mbeki’s point is that a history written to supply heroes cannot see this.',
    source: { materialId: 'mat-revolt-reading', passageId: 'p-rev-2' },
  },
  {
    id: 'q-rev-ord-1',
    courseId: ATLANTIC_COURSE_ID,
    format: 'ordering',
    topicId: 'topic-revolt',
    difficulty: 'reasoning',
    marks: 4,
    prompt:
      'Order these forms of refusal from least visible in the archive to most visible, as Mbeki presents the spectrum.',
    sequence: [
      'Deliberate slowness and feigned incomprehension',
      'Tool breakage and concealed cultivation',
      'Flight for a few days',
      'Permanent flight and maroon settlement',
      'Armed rising',
    ],
    explanation:
      'The ordering is the argument: what the archive records best is what was rarest, which systematically distorts any count.',
    source: { materialId: 'mat-revolt-reading', passageId: 'p-rev-1' },
  },
  {
    id: 'q-rev-sa-1',
    courseId: ATLANTIC_COURSE_ID,
    format: 'source-analysis',
    topicId: 'topic-revolt',
    difficulty: 'reasoning',
    marks: 6,
    prompt:
      'Mbeki argues runaway advertisements are more useful than they appear. Using this extract, explain what they reveal and what they cannot.',
    extract: `"RUN AWAY from the subscriber, a negro man named JUPITER, about thirty years, a cooper by trade, speaks good English and some French, has a scar above the left eye, is supposed to be gone towards the north side where he has a wife at Mr. Halliburton's. Whoever secures him shall have two pistoles reward."

— Fictional newspaper advertisement, 1768`,
    rubric: [
      {
        id: 'r-sa-rev-1',
        label: 'Notes the precision of detail — skill, languages, appearance, relationships',
        marks: 2,
        keywords: ['skill', 'cooper', 'trade', 'language', 'french', 'scar', 'wife', 'detail', 'precise'],
        missedAdvice:
          'List what the advertisement is forced to record: trade, languages, distinguishing marks, family ties.',
      },
      {
        id: 'r-sa-rev-2',
        label: 'Explains that the detail exists because recapture required it',
        marks: 2,
        keywords: ['recapture', 'purpose', 'identify', 'against its purpose', 'reward', 'in order to'],
        missedAdvice:
          'The reason the detail is reliable is that the advertiser needed it to be. Say so.',
      },
      {
        id: 'r-sa-rev-3',
        label: 'States the limitation: it records only failed or attempted flight, in the owner’s voice',
        marks: 2,
        keywords: ['failed', 'only those', 'owner', 'voice', 'silent', 'no account', 'motive', 'caught'],
        missedAdvice:
          'Name the silence: we learn Jupiter’s destination as guessed by his owner, never his reasons in his own words.',
      },
    ],
    explanation:
      'Read against its purpose, a document of control becomes the best surviving evidence of the person it was written to capture.',
    source: { materialId: 'mat-revolt-reading', passageId: 'p-rev-3' },
  },
  {
    id: 'q-rev-wr-1',
    courseId: ATLANTIC_COURSE_ID,
    format: 'written-recall',
    topicId: 'topic-revolt',
    difficulty: 'reasoning',
    marks: 6,
    prompt:
      'Explain the archival problem in the study of Atlantic resistance, and how historians work around it.',
    rubric: [
      {
        id: 'r-rev-wr-1',
        label: 'States that nearly all documents were produced by the system being resisted',
        marks: 2,
        keywords: ['produced by', 'court', 'planter', 'official', 'colonial', 'system being resisted', 'owner'],
        missedAdvice: 'Open with who made the archive. Everything else follows from that.',
      },
      {
        id: 'r-rev-wr-2',
        label: 'Notes the selection bias: resistance is recorded when it failed or alarmed someone',
        marks: 2,
        keywords: ['failed', 'alarm', 'bias', 'only when', 'caught', 'selection'],
        missedAdvice:
          'Name the bias precisely: successful, quiet resistance leaves no trace, so the record over-represents failure.',
      },
      {
        id: 'r-rev-wr-3',
        label: 'Describes reading sources against their purpose',
        marks: 2,
        keywords: ['against', 'purpose', 'grain', 'advertisement', 'punishment book', 'against their'],
        missedAdvice:
          'The technique has a name in the reading — reading a document against the purpose for which it was written.',
      },
    ],
    explanation:
      'Who made it, what that biases, and how to read around it. Three moves that work for any question about difficult archives.',
    source: { materialId: 'mat-revolt-reading', passageId: 'p-rev-3' },
  },

  /* ── Interpretation and historiography ──────────────────────────────── */
  {
    id: 'q-deb-fc-1',
    courseId: ATLANTIC_COURSE_ID,
    format: 'flashcard',
    topicId: 'topic-debate',
    difficulty: 'recall',
    marks: 1,
    prompt: 'Name the three families of explanation and their representative historian.',
    answer:
      'Economic (Larssen — capital, credit, commodity flows); cultural/social (Mbeki — human relations and the actions of people inside the system); imperial/institutional (Valderrama — state capacity and what governments could actually manage at distance).',
    explanation:
      'None is the correct one. The productive question is which reading better explains a particular piece of evidence.',
    source: { materialId: 'mat-debate-lecture', passageId: 'p-deb-2' },
  },
  {
    id: 'q-deb-mc-1',
    courseId: ATLANTIC_COURSE_ID,
    format: 'multiple-choice',
    topicId: 'topic-debate',
    difficulty: 'reasoning',
    marks: 3,
    prompt:
      'According to the lecture, what turns two adjacent summaries into a comparison?',
    options: [
      'Writing more about each historian.',
      'Naming the axis of disagreement — whether they differ about what happened, which evidence counts, or what it means.',
      'Deciding which historian is correct in the first line.',
      'Quoting both historians directly.',
    ],
    correctIndices: [1],
    explanation:
      'The axis is the whole thing. Valderrama and Okonkwo barely disagree about events; they disagree about which sources reveal the institution’s function.',
    source: { materialId: 'mat-debate-lecture', passageId: 'p-deb-1' },
  },
  {
    id: 'q-deb-ord-1',
    courseId: ATLANTIC_COURSE_ID,
    format: 'ordering',
    topicId: 'topic-debate',
    difficulty: 'reasoning',
    marks: 4,
    prompt: 'Put the lecture’s four-step structure for a comparison answer in order.',
    sequence: [
      'State the disagreement in one sentence, naming the axis',
      'Give each position its strongest form, with its best evidence',
      'Identify what evidence would distinguish them',
      'Take a position and defend it on those terms',
    ],
    explanation:
      'Step three is the one that separates a good answer from a competent one, and it is almost always the missing one.',
    source: { materialId: 'mat-debate-lecture', passageId: 'p-deb-3' },
  },
  {
    id: 'q-deb-match-1',
    courseId: ATLANTIC_COURSE_ID,
    format: 'matching',
    topicId: 'topic-debate',
    difficulty: 'reasoning',
    marks: 4,
    prompt: 'Match each reading of Atlantic history to what it takes as primary.',
    pairs: [
      { left: 'Economic reading', right: 'Capital, credit and commodity flows' },
      { left: 'Cultural and social reading', right: 'The actions of people inside the system' },
      { left: 'Imperial and institutional reading', right: 'State capacity and administration at distance' },
      { left: 'Biological reading', right: 'Pathogens and immunological exposure' },
    ],
    explanation:
      'The biological reading is included because it is the one Valderrama explicitly argues does not go far enough on its own.',
    source: { materialId: 'mat-debate-lecture', passageId: 'p-deb-2' },
  },
  {
    id: 'q-deb-essay-1',
    courseId: ATLANTIC_COURSE_ID,
    format: 'essay',
    topicId: 'topic-debate',
    difficulty: 'stretch',
    marks: 15,
    prompt:
      '"The encomienda is better understood as a fiscal device than as a system of coerced labour." Discuss with reference to Valderrama and Okonkwo.',
    rubric: [
      {
        id: 'r-ess-1',
        label: 'Names the axis of disagreement rather than summarising each in turn',
        marks: 3,
        keywords: ['axis', 'disagree about', 'which evidence', 'function', 'not about what happened', 'differ'],
        missedAdvice:
          'Open by naming what the two actually disagree about. Two adjacent summaries is the single commonest failure on this paper.',
      },
      {
        id: 'r-ess-2',
        label: 'States Valderrama’s position with its strongest evidence',
        marks: 3,
        keywords: ['valderrama', 'fiscal', 'tribute schedule', 'abolition', 'state capacity', 'cash', 'revenue'],
        missedAdvice:
          'Give the fiscal reading its best case: tribute schedules, attempts to commute labour to cash, abolition once direct taxation was feasible.',
      },
      {
        id: 'r-ess-3',
        label: 'States Okonkwo’s position with its strongest evidence',
        marks: 3,
        keywords: ['okonkwo', 'residencia', 'coerc', 'mortality', 'dominican', 'friar', 'labour extraction', 'labor extraction'],
        missedAdvice:
          'Give the coercive reading its best case: residencia hearings, Dominican complaints, mission mortality registers.',
      },
      {
        id: 'r-ess-4',
        label: 'Identifies the test that would distinguish them — what changed after 1542',
        marks: 3,
        keywords: ['1542', 'new laws', 'after abolition', 'repartimiento', 'mita', 'test', 'distinguish', 'outlived'],
        missedAdvice:
          'This is the step that earns the upper band: if abolition changed only the paperwork while the repartimiento and mita continued, the coercion outlived the fiscal device.',
      },
      {
        id: 'r-ess-5',
        label: 'Takes and defends a position on those terms',
        marks: 3,
        keywords: ['i argue', 'in my view', 'more persuasive', 'conclude', 'stronger', 'therefore', 'on balance'],
        missedAdvice:
          'Finish with a judgement defended on the criterion you set out, not a restatement of both views.',
      },
    ],
    explanation:
      'The upper band is reached by step four — naming what evidence would settle it. Most answers stop after presenting both positions.',
    source: { materialId: 'mat-encomienda-reading', passageId: 'p-enc-4' },
  },
  {
    id: 'q-deb-essay-2',
    courseId: ATLANTIC_COURSE_ID,
    format: 'essay',
    topicId: 'topic-debate',
    difficulty: 'stretch',
    marks: 12,
    prompt:
      'How far can the plantation complex be explained as a commercial system? Answer with reference to Larssen and Mbeki.',
    rubric: [
      {
        id: 'r-ess2-1',
        label: 'Sets out Larssen’s commercial account, including credit and insurance',
        marks: 3,
        keywords: ['larssen', 'credit', 'insurance', 'circuit', 'commercial', 'capital', 'debtor'],
        missedAdvice:
          'Establish the commercial account first — credit from European ports, insurance contracts, the planter as debtor.',
      },
      {
        id: 'r-ess2-2',
        label: 'States Mbeki’s objection about the ledger’s point of view',
        marks: 3,
        keywords: ['mbeki', 'ledger', 'cost line', 'point of view', 'kept by', 'input'],
        missedAdvice:
          'Her objection is not that the facts are wrong but that the ledger shows only what its keeper thought worth recording.',
      },
      {
        id: 'r-ess2-3',
        label: 'Uses the surveillance-cost argument as evidence',
        marks: 3,
        keywords: ['surveillance', 'punishment', 'expensive', 'cost', 'recurring', 'threat', 'rational'],
        missedAdvice:
          'The sharpest evidence: no rational commercial system incurs a large recurring cost against a threat that is not real.',
      },
      {
        id: 'r-ess2-4',
        label: 'Reaches a judgement about how far the commercial reading extends',
        marks: 3,
        keywords: ['how far', 'extent', 'conclude', 'limit', 'both', 'incomplete', 'on balance', 'argue'],
        missedAdvice:
          'The question asks "how far", so answer it with a limit — where the commercial reading explains well and where it stops.',
      },
    ],
    explanation:
      'A "how far" question wants a boundary, not a verdict. Say where the commercial account works and where it runs out.',
    source: { materialId: 'mat-plantation-reading', passageId: 'p-plant-3' },
  },
  {
    id: 'q-deb-essay-3',
    courseId: ATLANTIC_COURSE_ID,
    format: 'essay',
    topicId: 'topic-debate',
    difficulty: 'reasoning',
    marks: 12,
    prompt:
      'Plan an answer to: "Demographic collapse, not commercial demand, explains the growth of Atlantic slavery." Set out a thesis and an outline rather than a full essay.',
    rubric: [
      {
        id: 'r-ess3-1',
        label: 'States a thesis that takes a position on the quoted claim',
        marks: 3,
        keywords: ['thesis', 'argue', 'reject', 'accept', 'partly', 'contend', 'this answer will'],
        missedAdvice:
          'A plan still needs a thesis. "I will discuss both sides" is not one.',
      },
      {
        id: 'r-ess3-2',
        label: 'Sequences the causal chain correctly: demand first, then collapse of supply',
        marks: 3,
        keywords: ['demand', 'first', 'already', 'supply', 'order', 'gap', 'pre-exist'],
        missedAdvice:
          'The order is the argument. Commercial demand existed before the collapse; the collapse removed the supply meeting it.',
      },
      {
        id: 'r-ess3-3',
        label: 'Names evidence for each section of the outline',
        marks: 3,
        keywords: ['evidence', 'valderrama', 'larssen', 'mortality', 'sugar', 'recovery', 'caribbean'],
        missedAdvice:
          'Attach evidence to each outline point — a plan without evidence is a list of intentions.',
      },
      {
        id: 'r-ess3-4',
        label: 'Identifies the counter-argument the answer must handle',
        marks: 3,
        keywords: ['counter', 'objection', 'however', 'against', 'biological', 'critic'],
        missedAdvice:
          'Name the strongest objection in the plan, so the essay does not discover it halfway through.',
      },
    ],
    explanation:
      'Planning practice is worth as much as writing practice, and takes a fifth of the time. Thesis, sequence, evidence, counter-argument.',
    source: { materialId: 'mat-exchange-reading', passageId: 'p-exch-2' },
  },
  {
    id: 'q-deb-wr-1',
    courseId: ATLANTIC_COURSE_ID,
    format: 'written-recall',
    topicId: 'topic-debate',
    difficulty: 'reasoning',
    marks: 6,
    prompt:
      'From memory, state the four-step structure for a comparison answer and say which step is usually missing.',
    rubric: [
      {
        id: 'r-deb-wr-1',
        label: 'Recalls at least three of the four steps',
        marks: 2,
        keywords: ['axis', 'strongest', 'distinguish', 'position', 'defend', 'evidence would'],
        missedAdvice: 'State the disagreement, steelman both, name the distinguishing evidence, decide.',
      },
      {
        id: 'r-deb-wr-2',
        label: 'Identifies step three as the usual omission',
        marks: 2,
        keywords: ['third', 'step three', 'distinguish', 'what evidence would', 'missing'],
        missedAdvice:
          'It is step three — naming what evidence would favour one position — that is almost always absent.',
      },
      {
        id: 'r-deb-wr-3',
        label: 'Explains why steelmanning matters',
        marks: 2,
        keywords: ['steelman', 'strongest form', 'strawman', 'examiner', 'has read', 'notice'],
        missedAdvice:
          'The examiner has read both historians and will notice a weakened version of either.',
      },
    ],
    explanation:
      'Knowing the structure is what makes a timed comparison answer possible without notes.',
    source: { materialId: 'mat-debate-lecture', passageId: 'p-deb-3' },
  },
  {
    id: 'q-deb-sa-1',
    courseId: ATLANTIC_COURSE_ID,
    format: 'source-analysis',
    topicId: 'topic-debate',
    difficulty: 'stretch',
    marks: 6,
    prompt:
      'This extract makes a methodological claim. Identify it, and say which of the three families of explanation it belongs to.',
    extract: `"Accounts of sugar production were kept by people for whom labour was a cost line. Read them alone and the enslaved appear as an input. Read them against runaway advertisements, punishment books and the correspondence of nervous overseers, and a different system appears."

— Mbeki, *Refusal* (fictional)`,
    rubric: [
      {
        id: 'r-sa-deb-1',
        label: 'Identifies the claim: which archive you read determines what you can see',
        marks: 2,
        keywords: ['archive', 'which source', 'determines', 'depends', 'read against', 'perspective'],
        missedAdvice: 'The claim is about method, not about sugar. Say that first.',
      },
      {
        id: 'r-sa-deb-2',
        label: 'Assigns it to the cultural/social family',
        marks: 2,
        keywords: ['cultural', 'social', 'human relations', 'people inside', 'mbeki'],
        missedAdvice:
          'It belongs to the cultural and social reading — the one that insists the actions of people inside the system shaped it.',
      },
      {
        id: 'r-sa-deb-3',
        label: 'Notes that it does not dispute the economic account’s facts',
        marks: 2,
        keywords: ['not dispute', 'does not deny', 'facts', 'incomplete', 'partial', 'compatible', 'not wrong'],
        missedAdvice:
          'Precision matters: she says the commercial account is written from one vantage point, not that it is false.',
      },
    ],
    explanation:
      'Distinguishing "incomplete" from "wrong" is the move that makes a historiographical answer sound like a historian.',
    source: { materialId: 'mat-plantation-reading', passageId: 'p-plant-3' },
  },
];

export const QUESTION_BY_ID = new Map(SEED_QUESTIONS.map((q) => [q.id, q]));
