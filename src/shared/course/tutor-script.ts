import type { SourceRef, TutorIntent, TutorStage, TutorSuggestion } from '../types.ts';
import { CENG401_TUTOR_SCRIPT } from './ceng401-tutor.ts';

/**
 * The tutor's authored script.
 *
 * ── What this is, and what it very deliberately is not ────────────────────
 *
 * This is a lookup table, not a model. Every sentence the tutor says was
 * written by hand and selected by a `(topic, stage, intent)` key. The brief
 * requires the prototype to be honest about that, so the tutor says so itself
 * at the start of every session rather than leaving it to a footnote.
 *
 * The interesting design question is what to do when a typed message does not
 * match anything. The tempting answer is a generic "tell me more", which makes
 * the tutor look like it understood when it did not. The answer taken here is
 * `classify()`: a keyword pass that recognises a handful of genuine intents
 * ("I don't understand", "give me an example", "is it because…"), and an
 * explicit fallback that says the input was not recognised and offers the
 * branches that do exist. Pretending to understand is the one failure mode a
 * teaching prototype cannot afford.
 *
 * ── The six-stage arc ─────────────────────────────────────────────────────
 *
 * orient → understand → recall → reason → apply → reflect. Each topic has
 * authored content at every stage, so a session can actually walk the arc
 * rather than stalling after the explanation.
 */

export interface ScriptTurn {
  text: string;
  /** Where the session moves after this turn. */
  nextStage?: TutorStage;
  source?: SourceRef;
  suggestions?: TutorSuggestion[];
}

/** The stage arc, in order. */
export const STAGE_ORDER: TutorStage[] = [
  'orient',
  'understand',
  'recall',
  'reason',
  'apply',
  'reflect',
];

export const STAGE_LABEL: Record<TutorStage, string> = {
  orient: 'Orienting',
  understand: 'Understanding',
  recall: 'Recalling',
  reason: 'Reasoning',
  apply: 'Applying',
  reflect: 'Reflecting',
};

export const STAGE_BLURB: Record<TutorStage, string> = {
  orient: 'Working out where you are and what this session is for.',
  understand: 'Building the explanation, as simply as it needs to be.',
  recall: 'Getting it back out of your head without the text in front of you.',
  reason: 'Pushing on why, not just what.',
  apply: 'Using it on something you have not seen before.',
  reflect: 'Naming what held and what to come back to.',
};

/* ── The per-topic script ─────────────────────────────────────────────── */

type StageScript = Partial<Record<TutorIntent, ScriptTurn>> & { open: ScriptTurn };

export interface TopicScript {
  /** Opening line when a session starts cold on this topic. */
  greeting: string;
  /** Opening line when a session starts from a passage. */
  fromPassage: string;
  /** Opening line when a session starts from a wrong exam answer. */
  fromMistake: string;
  stages: Record<TutorStage, StageScript>;
  /** The misconception this topic's `check` branch is designed to catch. */
  misconception: {
    /** Keywords in a student answer that trigger the correction branch. */
    triggers: string[];
    correction: ScriptTurn;
  };
  /** Said when a student answers the check correctly. */
  correct: ScriptTurn;
  /** Topic ids for practice launched from this session. */
  practiceTopicIds: string[];
}

const ENC: TopicScript = {
  greeting:
    'Right, the encomienda. Your notes say you keep writing "land grant" in essays, so let us start exactly there, because that one word changes every argument built on top of it.',
  fromPassage:
    'You are looking at the encomienda passage. Let us work through it properly rather than reading it again. Re-reading is the thing that makes material feel familiar without making it usable.',
  fromMistake:
    'This came up in your exam and the answer did not land. That is useful information, not a verdict. Let us find out where the chain broke.',
  stages: {
    orient: {
      open: {
        text: 'Before we start: everything I say here is written in advance for this prototype. I am a scripted tutor, not a live model. I recognise a set of things you might ask and I will tell you plainly when you say something I do not have a branch for.\n\nWith that said. What do you want out of this one: the definition nailed down, or the Valderrama/Okonkwo comparison?',
        nextStage: 'understand',
        suggestions: [
          { label: 'Start with the definition', intent: 'explain' },
          { label: 'Go to the comparison', intent: 'why' },
        ],
      },
    },
    understand: {
      open: {
        text: 'The definition, then.\n\nAn encomienda granted the right to **tribute and labour from a named group of people**. It did not grant land. The land remained, in law, indigenous. In exchange the encomendero owed two obligations: protection, and religious instruction.\n\nHold on to the conditional part. It was granted at the Crown’s pleasure, and the New Laws of 1542 tried to cap it at a single lifetime.',
        nextStage: 'recall',
        source: { materialId: 'mat-encomienda-reading', passageId: 'p-enc-1' },
        suggestions: [
          { label: 'Say that more simply', intent: 'simpler' },
          { label: 'Give me an example', intent: 'example' },
          { label: 'Test me on it', intent: 'check' },
        ],
      },
      simpler: {
        text: 'Simpler version.\n\nYou were not given a farm. You were given the right to make a specific village work for you and hand over goods, and in return you were supposed to protect them and convert them.\n\nThe village still owned its fields. You owned an entitlement to what they produced and to their labour, and the king could take that entitlement back.',
        source: { materialId: 'mat-encomienda-reading', passageId: 'p-enc-1' },
        suggestions: [
          { label: 'Why does that distinction matter?', intent: 'why' },
          { label: 'Test me on it', intent: 'check' },
        ],
      },
      example: {
        text: 'Concretely: a conquistador is assigned the community of a named valley. He does not receive a deed. He receives the right to collect a fixed tribute, maize, cloth, sometimes silver, and to call on a rota of labourers for the mines.\n\nIf he dies, under the New Laws the grant is meant to revert to the Crown rather than pass to his son. That is precisely what the colonists in Peru revolted over in the 1540s, which tells you how much the grant was worth to them.',
        source: { materialId: 'mat-encomienda-reading', passageId: 'p-enc-1' },
        suggestions: [
          { label: 'Test me on it', intent: 'check' },
          { label: 'Why does the distinction matter?', intent: 'why' },
        ],
      },
      why: {
        text: 'Because the whole Valderrama/Okonkwo argument sits on it.\n\nIf it were a land grant, it would look feudal and permanent, and the Crown’s ability to abolish it in 1542 would be inexplicable. As a revocable entitlement to labour and tribute, abolition makes sense, and then the interesting question becomes *why* the Crown wanted it back.\n\nValderrama says: because it was a tax-collection device, and once you have salaried officials you no longer need it. Okonkwo says: the Crown recovered the paperwork and the forced labour carried on regardless under the repartimiento and the mita.',
        nextStage: 'reason',
        source: { materialId: 'mat-encomienda-reading', passageId: 'p-enc-4' },
        suggestions: [
          { label: 'How do I decide between them?', intent: 'explain' },
          { label: 'Test me on it', intent: 'check' },
        ],
      },
    },
    recall: {
      open: {
        text: 'Close the reading and answer this from memory: **what did an encomienda actually grant, and what did it not grant?**\n\nType whatever you have. Half an answer is more useful to me than a perfect one you looked up.',
        suggestions: [
          { label: 'Give me a hint', intent: 'hint' },
          { label: 'I am not sure', intent: 'answer' },
        ],
      },
      hint: {
        text: 'The thing it granted is animate. The thing it did not grant is not.\n\nAnd there were two obligations going the other way: one worldly, one religious.',
        suggestions: [{ label: 'I still am not sure', intent: 'answer' }],
      },
      answer: {
        text: 'It granted the right to **tribute and labour** from a named group of people, with obligations to protect and to instruct them in Christianity. It did **not** grant land. That remained legally indigenous.\n\nNo penalty for asking, that is what I am here for. But let me ask you a different one shortly, because reading an answer and producing one are not the same skill, and the exam only tests the second.',
        nextStage: 'reason',
        suggestions: [{ label: 'Push me on the reasoning', intent: 'why' }],
      },
    },
    reason: {
      open: {
        text: 'Now the part your notes say you cannot do under time pressure.\n\nValderrama and Okonkwo look at the same institution and describe it differently. **What do they actually disagree about?** Not what each says, but what the disagreement is *about*.',
        source: { materialId: 'mat-encomienda-reading', passageId: 'p-enc-4' },
        suggestions: [
          { label: 'Give me a hint', intent: 'hint' },
          { label: 'Tell me the answer', intent: 'answer' },
        ],
      },
      hint: {
        text: 'They agree on the chronology. They agree on the legal content of the grant. They agree severe coercion occurred.\n\nSo the disagreement is not about what happened. Given that, what is left for them to disagree about?',
        suggestions: [{ label: 'Tell me the answer', intent: 'answer' }],
      },
      answer: {
        text: 'They disagree about **which sources reveal the institution’s function**.\n\nValderrama reads fiscal records, tribute schedules, the Crown’s attempts to commute labour into cash, and concludes the thing was a revenue device. Okonkwo says those records show what the Crown *hoped to collect and wished the arrangement to be called*, and turns to residencia hearings and mission mortality registers instead.\n\nOnce you can write that sentence, you have an argument rather than two paragraphs.',
        nextStage: 'apply',
        source: { materialId: 'mat-encomienda-reading', passageId: 'p-enc-4' },
        suggestions: [{ label: 'Let me try applying it', intent: 'continue' }],
      },
      why: {
        text: 'The test that separates them is **what changed after 1542**.\n\nIf the encomienda was essentially fiscal, abolishing it should have substantially changed the experience of indigenous labour. If it was essentially coercive, abolition should have changed the paperwork and very little else.\n\nThat is the step that moves a comparison answer into the upper band, and it is the step nearly every student omits.',
        nextStage: 'apply',
        source: { materialId: 'mat-encomienda-reading', passageId: 'p-enc-4' },
        suggestions: [{ label: 'Let me try applying it', intent: 'continue' }],
      },
    },
    apply: {
      open: {
        text: 'Apply it. Here is a claim an examiner might put in front of you:\n\n> "The New Laws of 1542 ended the exploitation of indigenous labour in Spanish America."\n\nWhich historian would object most strongly, and what single piece of evidence would they reach for?',
        suggestions: [
          { label: 'Give me a hint', intent: 'hint' },
          { label: 'Tell me the answer', intent: 'answer' },
          { label: 'Practise this properly', intent: 'practice' },
        ],
      },
      hint: {
        text: 'Ask yourself what replaced the encomienda rather than what abolished it. Two institutions in the reading carried forced labour past 1542.',
        suggestions: [{ label: 'Tell me the answer', intent: 'answer' }],
      },
      answer: {
        text: 'Okonkwo, and the evidence is the **survival of forced labour after abolition**: the repartimiento replacing the encomienda, and the mita continuing.\n\nHer argument in one line: if the coercion outlives the tax device, the coercion was not a by-product of it.',
        nextStage: 'reflect',
        suggestions: [
          { label: 'Practise this properly', intent: 'practice' },
          { label: 'Wrap up', intent: 'summary' },
        ],
      },
    },
    reflect: {
      open: {
        text: 'Worth naming what changed in this session.\n\nYou came in able to recognise the encomienda and not able to write about it. You now have three things you did not have: the grant is of people not land, the disagreement is about which sources reveal function, and the test between them is what happened after 1542.\n\nThe third one is the one that will still be slippery in a week. That is the one to come back to.',
        suggestions: [
          { label: 'Practise this now', intent: 'practice' },
          { label: 'End and save the summary', intent: 'summary' },
        ],
      },
    },
  },
  misconception: {
    triggers: ['land', 'acre', 'estate', 'property', 'territory', 'farm', 'plot'],
    correction: {
      text: 'Stop there: that is the exact slip your own notes warn you about, and it is worth catching now rather than in the exam.\n\nYou have said **land**. The encomienda did not grant land. It granted the right to tribute and labour from a named group of *people*, and the land stayed legally theirs.\n\nThis is not pedantry. If it were a land grant, the Crown abolishing it in 1542 makes no sense, and Valderrama’s whole fiscal argument collapses. Try the answer again with that corrected.',
      source: { materialId: 'mat-encomienda-reading', passageId: 'p-enc-1' },
      suggestions: [
        { label: 'Let me try again', intent: 'check' },
        { label: 'Explain why it matters', intent: 'why' },
      ],
    },
  },
  correct: {
    text: 'That is right, and specifically right in the way that earns marks: you named what was granted *and* what was not.\n\nLet me push you somewhere harder, because recall is not your problem. Construction under time pressure is.',
    nextStage: 'reason',
    suggestions: [{ label: 'Go on then', intent: 'continue' }],
  },
  practiceTopicIds: ['topic-encomienda', 'topic-debate'],
};

const DEB: TopicScript = {
  greeting:
    'Comparing interpretations. This is the one you flagged as hardest, and it is genuinely the hardest thing this course asks of you, so let us be systematic about it rather than hoping it goes better next time.',
  fromPassage:
    'You are on the historiography passage. Good place to start: this is where the course tells you what a comparison actually requires.',
  fromMistake:
    'Your comparison answer did not reach the upper band. I can tell you exactly which step was missing, because it is the same step that is almost always missing.',
  stages: {
    orient: {
      open: {
        text: 'A note first: I am a scripted tutor in a prototype. The branches below were written in advance, and if you type something I do not recognise I will say so rather than bluff.\n\nNow: when you write a comparison answer, what do you currently do? Summarise one then the other, or something else?',
        nextStage: 'understand',
        suggestions: [
          { label: 'Yes, that is what I do', intent: 'check' },
          { label: 'Just explain the right way', intent: 'explain' },
        ],
      },
    },
    understand: {
      open: {
        text: 'Here is the diagnosis the lecture gives, and it is blunt: **two summaries next to each other is not a comparison**. It is two summaries next to each other.\n\nA comparison requires you to name the **axis**: the thing they differ *about*. There are only three options:\n\n1. They disagree about **what happened**.\n2. They disagree about **which evidence counts**.\n3. They disagree about **what the evidence means**.\n\nThose call for three different answers. Naming which one you are dealing with is the first sentence of a good essay.',
        nextStage: 'recall',
        source: { materialId: 'mat-debate-lecture', passageId: 'p-deb-1' },
        suggestions: [
          { label: 'Say that more simply', intent: 'simpler' },
          { label: 'Give me an example', intent: 'example' },
          { label: 'Test me on it', intent: 'check' },
        ],
      },
      simpler: {
        text: 'Simpler.\n\nBefore you write a word about either historian, finish this sentence: "They disagree about ______."\n\nIf you cannot finish it, you do not yet have a comparison. You have two descriptions. Finishing that sentence *is* the work.',
        suggestions: [
          { label: 'Give me an example', intent: 'example' },
          { label: 'Test me on it', intent: 'check' },
        ],
      },
      example: {
        text: 'Worked example, Valderrama versus Okonkwo.\n\nWeak: "Valderrama argues the encomienda was fiscal. Okonkwo argues it was coercive." Two facts in a row. No axis.\n\nStrong: "Valderrama and Okonkwo agree on what the encomienda was and on the fact of severe coercion. They disagree about **which archive reveals its function**: fiscal records, or residencia hearings and mortality registers."\n\nThe second sentence tells the examiner you know what kind of argument you are in.',
        nextStage: 'recall',
        source: { materialId: 'mat-debate-lecture', passageId: 'p-deb-1' },
        suggestions: [{ label: 'Test me on it', intent: 'check' }],
      },
    },
    recall: {
      open: {
        text: 'From memory: the lecture gives a **four-step structure** for a comparison answer. How many can you get?',
        source: { materialId: 'mat-debate-lecture', passageId: 'p-deb-3' },
        suggestions: [
          { label: 'Give me a hint', intent: 'hint' },
          { label: 'Tell me the answer', intent: 'answer' },
        ],
      },
      hint: {
        text: 'Step one is the axis. Step four is your own judgement. The two in the middle are about giving each side its due, and then about evidence.',
        suggestions: [{ label: 'Tell me the answer', intent: 'answer' }],
      },
      answer: {
        text: '1. **State the disagreement in one sentence**, naming the axis.\n2. **Give each position its strongest form**, with its best evidence. Steelman: the examiner has read both and will notice a weakened version.\n3. **Identify what would distinguish them**: what evidence, if found, would favour one?\n4. **Take a position** and defend it on those terms.\n\nStep three is the one almost nobody writes, and it is the one that moves an answer up a band.',
        nextStage: 'reason',
        source: { materialId: 'mat-debate-lecture', passageId: 'p-deb-3' },
        suggestions: [{ label: 'Why is step three so decisive?', intent: 'why' }],
      },
    },
    reason: {
      open: {
        text: 'Why does step three carry so much weight? Have a go before I answer. What does naming the distinguishing evidence prove about you as a reader?',
        suggestions: [
          { label: 'Give me a hint', intent: 'hint' },
          { label: 'Tell me the answer', intent: 'answer' },
        ],
      },
      hint: {
        text: 'Anyone can report two positions. What does it take to say what *would settle* the argument?',
        suggestions: [{ label: 'Tell me the answer', intent: 'answer' }],
      },
      answer: {
        text: 'Because it proves you have understood both positions well enough to know **what they are claims about**.\n\nReporting two views needs only comprehension. Saying "if X were found, Valderrama’s reading would be in trouble" requires you to have grasped what each position predicts, and that is the difference between summarising history and doing it.\n\nFor these two, the distinguishing evidence is what happened to indigenous labour after 1542.',
        nextStage: 'apply',
        source: { materialId: 'mat-debate-lecture', passageId: 'p-deb-3' },
        suggestions: [{ label: 'Let me try one', intent: 'continue' }],
      },
      why: {
        text: 'Because it proves you have understood both positions well enough to know what they are claims *about*.\n\nReporting two views needs comprehension. Saying what evidence would favour one requires knowing what each predicts, and that is the step that reads as historical thinking rather than revision.',
        nextStage: 'apply',
        suggestions: [{ label: 'Let me try one', intent: 'continue' }],
      },
    },
    apply: {
      open: {
        text: 'Your turn. Larssen reads the plantation as a commercial system; Mbeki says the commercial account is written from the ledger’s point of view.\n\n**Name the axis in one sentence.** Then, if you can, name the evidence that would distinguish them.',
        source: { materialId: 'mat-plantation-reading', passageId: 'p-plant-3' },
        suggestions: [
          { label: 'Give me a hint', intent: 'hint' },
          { label: 'Tell me the answer', intent: 'answer' },
          { label: 'Practise this properly', intent: 'practice' },
        ],
      },
      hint: {
        text: 'Mbeki does not say Larssen has his facts wrong. So the axis is not "what happened". Which of the other two is it?\n\nFor the evidence: think about the cost of surveillance.',
        suggestions: [{ label: 'Tell me the answer', intent: 'answer' }],
      },
      answer: {
        text: 'The axis: **which evidence counts**. Mbeki accepts Larssen’s credit and insurance facts and denies that the ledger can show the system’s full shape, because it was kept by people for whom labour was a cost line.\n\nThe distinguishing evidence: **the expense of surveillance and punishment**. No rational commercial system carries a large recurring cost against a threat that is not real, so if the commercial model cannot account for that cost, something the ledger does not record is doing work.\n\nThat is a complete comparison in two moves.',
        nextStage: 'reflect',
        source: { materialId: 'mat-plantation-reading', passageId: 'p-plant-3' },
        suggestions: [
          { label: 'Practise this properly', intent: 'practice' },
          { label: 'Wrap up', intent: 'summary' },
        ],
      },
    },
    reflect: {
      open: {
        text: 'What you have now that you did not have an hour ago: a **procedure**. Axis, steelman both, distinguishing evidence, judgement.\n\nThat matters because your problem was never comprehension. It was that under exam pressure you had nothing to fall back on and defaulted to summarising. Now there is a shape to reach for.\n\nThe step to rehearse is the third one. Practise it on a pair you have not been taught: pick two historians, ask what would settle it.',
        suggestions: [
          { label: 'Practise this now', intent: 'practice' },
          { label: 'End and save the summary', intent: 'summary' },
        ],
      },
    },
  },
  misconception: {
    triggers: ['summar', 'first i write', 'then i write', 'one then the other', 'both sides', 'describe each'],
    correction: {
      text: 'That is the pattern the lecture singles out, so you are in large company, and it is costing you a band.\n\nSummarising A then summarising B produces two paragraphs that never meet. The examiner already knows what both historians said. What they are marking is whether you can say what the two are *arguing about*.\n\nTry again: finish the sentence "They disagree about ______" before you write anything else.',
      source: { materialId: 'mat-debate-lecture', passageId: 'p-deb-1' },
      suggestions: [
        { label: 'Show me the right structure', intent: 'answer' },
        { label: 'Give me an example', intent: 'example' },
      ],
    },
  },
  correct: {
    text: 'Yes, and note what you just did. You named the axis before describing either position, which is the move that makes everything after it read as an argument.\n\nLet me give you a harder pair.',
    nextStage: 'apply',
    suggestions: [{ label: 'Go on', intent: 'continue' }],
  },
  practiceTopicIds: ['topic-debate', 'topic-encomienda', 'topic-plantation'],
};

const COL: TopicScript = {
  greeting:
    'The Columbian Exchange. The facts here are easy and the causal chain is not, and the exam asks about the chain.',
  fromPassage:
    'You are reading the Exchange material. Let us turn it into something you could write under time pressure.',
  fromMistake:
    'This one went wrong in your exam. Usually that means the causal order got inverted rather than the facts being absent.',
  stages: {
    orient: {
      open: {
        text: 'Quick disclosure: I am a scripted tutor in a prototype: authored branches, not a live model. I will say so when you ask something I have no branch for.\n\nWhat do you want here: the content of the Exchange, or the causal argument about slavery?',
        nextStage: 'understand',
        suggestions: [
          { label: 'The causal argument', intent: 'explain' },
          { label: 'What crossed and why it mattered', intent: 'example' },
        ],
      },
    },
    understand: {
      open: {
        text: 'The causal argument, and the order is everything.\n\nValderrama is explicit: **disease did not cause slavery**. The chain runs:\n\n1. Plantation economy creates a demand for labour at scale.\n2. Epidemic mortality destroys the indigenous supply meeting that demand.\n3. Demand does not fall with supply.\n4. The Atlantic slave trade expands into the gap, because it is now the commercially attractive solution.\n\nGet the order wrong and you have written that disease caused slavery, which is the version the reading exists to refute.',
        nextStage: 'recall',
        source: { materialId: 'mat-exchange-reading', passageId: 'p-exch-2' },
        suggestions: [
          { label: 'Say that more simply', intent: 'simpler' },
          { label: 'Give me an example', intent: 'example' },
          { label: 'Test me on it', intent: 'check' },
        ],
      },
      simpler: {
        text: 'Simpler: the job existed first. The people who had been forced to do it died. The job still needed doing. So it was filled another way.\n\nDisease did not create the demand for labour. It removed one way of meeting it.',
        suggestions: [{ label: 'Test me on it', intent: 'check' }],
      },
      example: {
        text: 'Eastward: maize, potatoes, cassava, tomatoes, crops that raised the calorie ceiling of Old World agriculture and underwrote two centuries of population growth.\n\nWestward: wheat, sugar cane, cattle, horses, swine, and the pathogens of a continent that had lived beside domesticated herds for millennia.\n\nThat last clause is the whole explanation of the asymmetry. It is about animal domestication, not about the populations.',
        source: { materialId: 'mat-exchange-reading', passageId: 'p-exch-1' },
        suggestions: [{ label: 'Test me on it', intent: 'check' }],
      },
    },
    recall: {
      open: {
        text: 'Without looking: **why did Old World pathogens devastate American populations rather than the reverse?**',
        suggestions: [
          { label: 'Give me a hint', intent: 'hint' },
          { label: 'Tell me the answer', intent: 'answer' },
        ],
      },
      hint: {
        text: 'It is about what people had been living next to for thousands of years. Not about people at all, in fact. About animals.',
        suggestions: [{ label: 'Tell me the answer', intent: 'answer' }],
      },
      answer: {
        text: 'Europeans and Africans had lived alongside **domesticated herd animals** for millennia, and carried acquired immunity to the crowd diseases that emerged from them. American populations had no comparable exposure history.\n\nThe asymmetry traces to animal domestication.',
        nextStage: 'reason',
        source: { materialId: 'mat-exchange-reading', passageId: 'p-exch-1' },
        suggestions: [{ label: 'Push me further', intent: 'why' }],
      },
    },
    reason: {
      open: {
        text: 'Harder. Valderrama spends a whole passage arguing **against a purely biological reading** of the Exchange. If the pathogens explain the mortality, what is left to explain?\n\nHave a go.',
        source: { materialId: 'mat-exchange-reading', passageId: 'p-exch-3' },
        suggestions: [
          { label: 'Give me a hint', intent: 'hint' },
          { label: 'Tell me the answer', intent: 'answer' },
        ],
      },
      hint: {
        text: 'Same pathogens, different places, different outcomes. What varied?',
        suggestions: [{ label: 'Tell me the answer', intent: 'answer' }],
      },
      answer: {
        text: '**Recovery.** Same pathogens, different outcomes, and what varied was the weight of colonial demands.\n\nWhere demands on surviving labour were lightest, populations recovered soonest. In the Caribbean sugar islands, where demands were heaviest, recovery did not happen at all.\n\nSo biology sets the initial mortality and colonial policy determines what follows. An explanation that stops at the virus has stopped one step early, and that sentence is worth memorising, because it is a ready-made conclusion.',
        nextStage: 'apply',
        source: { materialId: 'mat-exchange-reading', passageId: 'p-exch-3' },
        suggestions: [{ label: 'Let me apply it', intent: 'continue' }],
      },
    },
    apply: {
      open: {
        text: 'Apply it. An examiner writes:\n\n> "The depopulation of the Americas was a biological event."\n\nHow do you open an answer that neither accepts nor flatly denies that?',
        suggestions: [
          { label: 'Give me a hint', intent: 'hint' },
          { label: 'Tell me the answer', intent: 'answer' },
          { label: 'Practise this properly', intent: 'practice' },
        ],
      },
      hint: {
        text: 'Concede what is true before you qualify it. What part of the claim is simply correct?',
        suggestions: [{ label: 'Tell me the answer', intent: 'answer' }],
      },
      answer: {
        text: 'Concede, then divide.\n\n"The initial mortality was biological in origin and no account can dispense with that. But the claim explains the first century and not the second: where colonial labour demands were light, populations recovered. In the sugar islands they did not. The pathogens were constant and the outcomes were not."\n\nConcede–divide–evidence. It works on any over-stated exam proposition.',
        nextStage: 'reflect',
        suggestions: [
          { label: 'Practise this properly', intent: 'practice' },
          { label: 'Wrap up', intent: 'summary' },
        ],
      },
    },
    reflect: {
      open: {
        text: 'Two things to carry out of this.\n\nThe causal order: demand first, then collapse of supply, then the trade expanding into the gap. And the concede-then-divide opening, which is a reusable structure rather than a fact about this topic.\n\nThe order is what will slip. Come back to it in a few days.',
        suggestions: [
          { label: 'Practise this now', intent: 'practice' },
          { label: 'End and save the summary', intent: 'summary' },
        ],
      },
    },
  },
  misconception: {
    triggers: ['disease caused slavery', 'disease led to slavery', 'caused slavery', 'because of disease they', 'smallpox caused'],
    correction: {
      text: 'Careful: you have inverted the chain, and this is the specific error the reading was written to head off.\n\nDisease did **not** cause slavery. The demand for labour already existed. The plantation economy had created it. What epidemic mortality did was destroy the *supply* that had been meeting that demand, leaving a gap the slave trade expanded into.\n\nThe difference sounds pedantic and is worth several marks: one version makes slavery an accident of epidemiology, the other makes it a commercial decision. Try again.',
      source: { materialId: 'mat-exchange-reading', passageId: 'p-exch-2' },
      suggestions: [
        { label: 'Let me try again', intent: 'check' },
        { label: 'Walk me through the order', intent: 'explain' },
      ],
    },
  },
  correct: {
    text: 'Exactly, and you kept the order right, which is the thing most answers get wrong.\n\nLet me take you somewhere harder.',
    nextStage: 'reason',
    suggestions: [{ label: 'Go on', intent: 'continue' }],
  },
  practiceTopicIds: ['topic-columbian', 'topic-plantation'],
};

const PLANT: TopicScript = {
  greeting:
    'The plantation complex. The trap here is starting with profit. The explanation actually starts with plant biology.',
  fromPassage:
    'You are on the plantation reading. Let us get the chain from cane chemistry to coerced labour straight.',
  fromMistake:
    'This came up and did not land. Most often that means the answer began in the wrong place.',
  stages: {
    orient: {
      open: {
        text: 'Disclosure first: scripted tutor, authored branches, prototype. I will tell you when you have asked something outside the script.\n\nWhere do you want to start: why sugar specifically, or Larssen versus Mbeki?',
        nextStage: 'understand',
        suggestions: [
          { label: 'Why sugar specifically', intent: 'explain' },
          { label: 'Larssen versus Mbeki', intent: 'why' },
        ],
      },
    },
    understand: {
      open: {
        text: 'Start with the cane, not the money.\n\nCut cane must be **milled within about a day** or its sucrose content falls sharply. That single agronomic fact does all the work:\n\n- The mill must sit next to the field.\n- Cutting and hauling must run on the mill’s schedule, so the workforce must be large and coordinated.\n- The mill is heavy fixed capital, so the estate must be big enough to justify it.\n\nA tobacco farm can be small. A sugar estate cannot. **The crop selected for the plantation form, and the form selected for coerced labour at scale.**',
        nextStage: 'recall',
        source: { materialId: 'mat-plantation-reading', passageId: 'p-plant-1' },
        suggestions: [
          { label: 'Say that more simply', intent: 'simpler' },
          { label: 'Give me an example', intent: 'example' },
          { label: 'Test me on it', intent: 'check' },
        ],
      },
      simpler: {
        text: 'Simpler: sugar cane goes off almost immediately after cutting.\n\nSo you cannot cut it and take it to a mill elsewhere: the mill has to be right there, it is expensive, and everyone has to work to its timetable. That means a big estate with a large workforce under tight coordination. Which is why sugar and not tobacco.',
        suggestions: [{ label: 'Test me on it', intent: 'check' }],
      },
      example: {
        text: 'Compare two farms.\n\nTobacco: cure the leaf in a barn, ship it whenever. A family can run it. Small holdings are viable.\n\nSugar: cut at dawn, milled by the next day, boiled immediately after. Cutters, haulers, mill crew and boiling house all on one clock, with a capital-intensive mill at the centre. There is no small version.',
        source: { materialId: 'mat-plantation-reading', passageId: 'p-plant-1' },
        suggestions: [{ label: 'Test me on it', intent: 'check' }],
      },
      why: {
        text: 'Larssen: the plantation was **a node in a commercial system that happened to farm**. Credit began in European ports, financed trade goods for the African coast, bought captives, sold them in the Caribbean, and the proceeds settled the credit and financed the sugar home. The governing logic is in European insurance contracts, not plantation ledgers. The planter is a debtor operating someone else’s capital.\n\nMbeki: that is the ledger’s point of view, and a ledger records what its keeper thought worth recording. Read the accounts against runaway advertisements and punishment books and output looks continually constrained by refusal, slowdown and flight.\n\nHer sharpest point: the surveillance apparatus was **expensive**, and no rational commercial system carries a large recurring cost against a threat that is not real.',
        nextStage: 'reason',
        source: { materialId: 'mat-plantation-reading', passageId: 'p-plant-3' },
        suggestions: [
          { label: 'Test me on it', intent: 'check' },
          { label: 'How do I use that in an essay?', intent: 'explain' },
        ],
      },
    },
    recall: {
      open: {
        text: 'From memory: **what agronomic fact about cane forced the plantation form?** And what follows from it?',
        suggestions: [
          { label: 'Give me a hint', intent: 'hint' },
          { label: 'Tell me the answer', intent: 'answer' },
        ],
      },
      hint: {
        text: 'It is about time. How long do you have between cutting the cane and needing to do something to it?',
        suggestions: [{ label: 'Tell me the answer', intent: 'answer' }],
      },
      answer: {
        text: 'Cane must be **milled within roughly a day of cutting** or sucrose content falls sharply.\n\nFrom that: mill beside the field, workforce on the mill’s schedule, heavy fixed capital, therefore scale, and therefore no viable small version, unlike tobacco.',
        nextStage: 'reason',
        source: { materialId: 'mat-plantation-reading', passageId: 'p-plant-1' },
        suggestions: [{ label: 'Push me further', intent: 'why' }],
      },
    },
    reason: {
      open: {
        text: 'Mbeki’s objection to Larssen is easy to state badly. Have a go: **is she saying his commercial account is wrong?**',
        source: { materialId: 'mat-plantation-reading', passageId: 'p-plant-3' },
        suggestions: [
          { label: 'Give me a hint', intent: 'hint' },
          { label: 'Tell me the answer', intent: 'answer' },
        ],
      },
      hint: {
        text: 'Does she dispute any of his figures? Any of his claims about credit or insurance? What exactly is she objecting to, if not the facts?',
        suggestions: [{ label: 'Tell me the answer', intent: 'answer' }],
      },
      answer: {
        text: 'No, and getting this right is a marks-bearing distinction.\n\nShe does not dispute his facts. She says the account is written **from the ledger’s point of view**, and the ledger was kept by people for whom labour was a cost line. Read alone it makes the enslaved an input. Read against runaway advertisements and punishment books, a different system appears.\n\nThe axis is *which evidence counts*, not *what happened*. An answer that has her calling him wrong has misdescribed the debate.',
        nextStage: 'apply',
        source: { materialId: 'mat-plantation-reading', passageId: 'p-plant-3' },
        suggestions: [{ label: 'Let me apply it', intent: 'continue' }],
      },
      why: {
        text: 'Because "incomplete" and "wrong" are different objections requiring different answers, and the ability to tell them apart is most of what a historiography question is testing.',
        nextStage: 'apply',
        suggestions: [{ label: 'Let me apply it', intent: 'continue' }],
      },
    },
    apply: {
      open: {
        text: 'Apply it to a source. An absentee owner writes to his attorney in 1761 complaining that the cutting pace has fallen off and that he is "not persuaded the sickness is all it is said to be".\n\n**What is that evidence of, and why is it unusually good evidence?**',
        suggestions: [
          { label: 'Give me a hint', intent: 'hint' },
          { label: 'Tell me the answer', intent: 'answer' },
          { label: 'Practise this properly', intent: 'practice' },
        ],
      },
      hint: {
        text: 'The owner is complaining, not documenting. What is he accidentally recording?',
        suggestions: [{ label: 'Tell me the answer', intent: 'answer' }],
      },
      answer: {
        text: 'It is evidence of **feigned illness as everyday resistance**, and it is unusually good evidence precisely because the owner had no interest in recording resistance.\n\nHe is complaining about costs. The resistance is visible in the gap between what he is told and what he believes. A document written to serve the system records, against its own purpose, the refusal that was constraining it.\n\nThat is Mbeki’s method in one move, and it is a transferable technique.',
        nextStage: 'reflect',
        source: { materialId: 'mat-plantation-reading', passageId: 'p-plant-3' },
        suggestions: [
          { label: 'Practise this properly', intent: 'practice' },
          { label: 'Wrap up', intent: 'summary' },
        ],
      },
    },
    reflect: {
      open: {
        text: 'Three things worth keeping.\n\nStart with the cane, not the cash. Mbeki says "incomplete", not "wrong". And reading a document against its purpose is a technique you can use on any source in this paper.\n\nThe middle one is the one that decays. It is easy to slide back into describing the debate as a factual dispute.',
        suggestions: [
          { label: 'Practise this now', intent: 'practice' },
          { label: 'End and save the summary', intent: 'summary' },
        ],
      },
    },
  },
  misconception: {
    triggers: ['profit', 'money', 'because it was lucrative', 'demand for sugar', 'europeans wanted sugar'],
    correction: {
      text: 'You have started with demand, and that is the trap this topic sets.\n\nEuropean appetite for sugar explains why anyone grew it. It does not explain why sugar produced **that particular labour form**. Tobacco was also profitable and produced smallholdings.\n\nThe explanation has to start with the agronomy: cane must be milled within about a day of cutting. That forces the mill beside the field, a coordinated workforce on the mill’s clock, and heavy fixed capital. Profit selected the crop. The crop selected the form.',
      source: { materialId: 'mat-plantation-reading', passageId: 'p-plant-1' },
      suggestions: [
        { label: 'Let me try again', intent: 'check' },
        { label: 'Walk me through it', intent: 'explain' },
      ],
    },
  },
  correct: {
    text: 'Right, and you began with the constraint rather than the profit, which is the ordering that makes it an explanation.\n\nLet me push further.',
    nextStage: 'reason',
    suggestions: [{ label: 'Go on', intent: 'continue' }],
  },
  practiceTopicIds: ['topic-plantation', 'topic-debate'],
};

const MERC: TopicScript = {
  greeting:
    'Mercantilism. Two traps: treating the doctrine as stupid, and running it straight into revolution without the intervening steps.',
  fromPassage:
    'You are on the mercantilism notes. The useful thing here is the gap between the statute book and the wharf.',
  fromMistake:
    'This one slipped. Usually it is the enforcement gap that gets left out.',
  stages: {
    orient: {
      open: {
        text: 'Scripted tutor, authored branches, prototype. I will say so when you go outside the script.\n\nThe doctrine, or the practice?',
        nextStage: 'understand',
        suggestions: [
          { label: 'The doctrine', intent: 'explain' },
          { label: 'The practice', intent: 'example' },
        ],
      },
    },
    understand: {
      open: {
        text: 'Three propositions, held together:\n\n1. National wealth is measured by the stock of **bullion** a state holds.\n2. Trade is close to **zero-sum**: one nation’s surplus is another’s deficit.\n3. **Colonies exist** to supply the metropole with raw materials and to buy its manufactures.\n\nAnd immediately the warning: stated that baldly it sounds foolish, and it is worth resisting the temptation to treat it so. It described a world where state capacity meant paying armies in coin, and the coin was genuinely scarce.',
        nextStage: 'recall',
        source: { materialId: 'mat-mercantilism-lecture', passageId: 'p-merc-1' },
        suggestions: [
          { label: 'Say that more simply', intent: 'simpler' },
          { label: 'What happened in practice?', intent: 'example' },
          { label: 'Test me on it', intent: 'check' },
        ],
      },
      simpler: {
        text: 'Simpler: wealth is the gold in your vault, trade is a fight over a fixed pot, and colonies are there to make the mother country richer.\n\nAnd it was not stupid: if your army only fights when paid in actual coin, having the coin really is what power means.',
        suggestions: [{ label: 'Test me on it', intent: 'check' }],
      },
      example: {
        text: 'The Navigation Acts required three things: colonial trade in **English ships**, then **enumerated goods**, sugar and tobacco first among them, landed in England before resale. And colonial imports of European manufactures routed through English ports.\n\nEnforcement was another matter entirely. The Caribbean customs establishment was small, badly paid and frequently local. Smuggling was not a marginal leakage: on some estimates a large fraction of the Dutch and French sugar in English markets.\n\n**The gap between the statute book and the wharf** is the single most useful thing to hold on to here, and it is what exam answers most often omit.',
        nextStage: 'recall',
        source: { materialId: 'mat-mercantilism-lecture', passageId: 'p-merc-2' },
        suggestions: [{ label: 'Test me on it', intent: 'check' }],
      },
    },
    recall: {
      open: {
        text: 'From memory: **the three requirements of the Navigation Acts.**',
        suggestions: [
          { label: 'Give me a hint', intent: 'hint' },
          { label: 'Tell me the answer', intent: 'answer' },
        ],
      },
      hint: {
        text: 'One about who carries the goods. One about where certain goods must stop first. One about the route of imports.',
        suggestions: [{ label: 'Tell me the answer', intent: 'answer' }],
      },
      answer: {
        text: 'English ships, enumerated goods landed in England before resale, and European manufactures routed through English ports.\n\nShipping, enumeration, entrepôt: three words that will get you all three back under pressure.',
        nextStage: 'reason',
        source: { materialId: 'mat-mercantilism-lecture', passageId: 'p-merc-2' },
        suggestions: [{ label: 'Push me further', intent: 'why' }],
      },
    },
    reason: {
      open: {
        text: 'The lecture warns against running an argument **directly from the Navigation Acts to revolution**. Why? The connection is real, after all.',
        source: { materialId: 'mat-mercantilism-lecture', passageId: 'p-merc-3' },
        suggestions: [
          { label: 'Give me a hint', intent: 'hint' },
          { label: 'Tell me the answer', intent: 'answer' },
        ],
      },
      hint: {
        text: 'A connection is not the same as a mechanism. What would you have to supply to turn one into the other?',
        suggestions: [{ label: 'Tell me the answer', intent: 'answer' }],
      },
      answer: {
        text: 'Because a connection is not a mechanism.\n\nThe real link: a system forcing colonial producers to sell into one market at that market’s prices creates a colonial merchant class with a standing interest in the system failing. That is genuine.\n\nBut an answer that goes straight from statute to revolution has skipped every step that would make it an *explanation*: how a commercial grievance becomes a political movement, who organised it, why then and not fifty years earlier.\n\nConcede the link, then say what is missing. That shape is worth more than picking a side.',
        nextStage: 'apply',
        source: { materialId: 'mat-mercantilism-lecture', passageId: 'p-merc-3' },
        suggestions: [{ label: 'Let me apply it', intent: 'continue' }],
      },
    },
    apply: {
      open: {
        text: 'Apply it. An examiner asks whether mercantilism "worked".\n\n**What is the first distinction your answer has to make?**',
        suggestions: [
          { label: 'Give me a hint', intent: 'hint' },
          { label: 'Tell me the answer', intent: 'answer' },
          { label: 'Practise this properly', intent: 'practice' },
        ],
      },
      hint: {
        text: 'Worked as what? There is more than one thing the system was trying to be.',
        suggestions: [{ label: 'Tell me the answer', intent: 'answer' }],
      },
      answer: {
        text: 'Between the **statute book** and the **wharf**: between mercantilism as policy and mercantilism as practice.\n\nAs a body of law it was comprehensive. As an enforced reality it leaked badly, through a customs service that was small, underpaid and local. Any answer that does not separate the two is answering a question about legislation while appearing to answer one about the economy.',
        nextStage: 'reflect',
        source: { materialId: 'mat-mercantilism-lecture', passageId: 'p-merc-2' },
        suggestions: [
          { label: 'Practise this properly', intent: 'practice' },
          { label: 'Wrap up', intent: 'summary' },
        ],
      },
    },
    reflect: {
      open: {
        text: 'Carry two things: the statute/wharf distinction, and "a connection is not a mechanism".\n\nBoth are reusable. The second in particular will serve you on any question that invites you to run a causal line straight from a policy to an upheaval.',
        suggestions: [
          { label: 'Practise this now', intent: 'practice' },
          { label: 'End and save the summary', intent: 'summary' },
        ],
      },
    },
  },
  misconception: {
    triggers: ['stupid', 'wrong', 'foolish', 'nonsense', 'obviously bad', 'ridiculous', 'didn’t make sense', 'did not make sense'],
    correction: {
      text: 'Careful. You are judging it against economics that had not been written yet, and examiners mark that down hard.\n\nMercantilism described a world in which state capacity depended on paying armies in coin, and coin was genuinely scarce. Given that, a policy of accumulating bullion is not foolish. It is a reasonable response to the constraint actually faced.\n\nSay why contemporaries found it persuasive, *then* say where it fails. Anachronistic dismissal tells the examiner about your century, not theirs.',
      source: { materialId: 'mat-mercantilism-lecture', passageId: 'p-merc-1' },
      suggestions: [
        { label: 'Let me try again', intent: 'check' },
        { label: 'Give me the fair version', intent: 'explain' },
      ],
    },
  },
  correct: {
    text: 'Good, and you gave the doctrine its fair hearing before criticising it, which is what the lecture asks for.\n\nOn to something harder.',
    nextStage: 'reason',
    suggestions: [{ label: 'Go on', intent: 'continue' }],
  },
  practiceTopicIds: ['topic-mercantilism', 'topic-plantation'],
};

const REV: TopicScript = {
  greeting:
    'Resistance. The methodological point here matters more than any individual revolt, and it is what the exam rewards.',
  fromPassage:
    'You are on the resistance reading. The archival problem is the thing to get straight.',
  fromMistake:
    'This did not land in your exam. Usually the answer listed revolts rather than making the argument.',
  stages: {
    orient: {
      open: {
        text: 'Disclosure: scripted tutor, authored branches, prototype. I will say when something falls outside what I have.\n\nThe spectrum of resistance, or the archival problem?',
        nextStage: 'understand',
        suggestions: [
          { label: 'The spectrum', intent: 'explain' },
          { label: 'The archival problem', intent: 'why' },
        ],
      },
    },
    understand: {
      open: {
        text: 'Mbeki’s opening move is a criticism of how the topic is usually taught.\n\nTeach resistance as a **list of revolts** and it looks rare. It was not rare. It was continuous, and organised revolt was its *least* common form.\n\nThe spectrum: deliberate slowness, feigned incomprehension, tool breakage, concealed cultivation, theft, abortion, flight for days, flight for good, maroon settlement, armed rising. Each carries a different risk and a different prospect of success, and people moved between them as circumstances changed.\n\nCounting only the last and concluding resistance was exceptional is **a methodological error, not a finding**.',
        nextStage: 'recall',
        source: { materialId: 'mat-revolt-reading', passageId: 'p-rev-1' },
        suggestions: [
          { label: 'Say that more simply', intent: 'simpler' },
          { label: 'Why does the archive matter?', intent: 'why' },
          { label: 'Test me on it', intent: 'check' },
        ],
      },
      simpler: {
        text: 'Simpler: if you only count armed uprisings, resistance looks rare.\n\nBut working slowly, breaking tools, pretending not to understand and running away for three days were all resistance, and all far more common. Counting only the big events tells you about what got written down, not about what happened.',
        suggestions: [{ label: 'Test me on it', intent: 'check' }],
      },
      why: {
        text: 'Because almost every surviving document was produced by **the system being resisted**: court records, runaway advertisements, punishment books, planter correspondence.\n\nThose record resistance only when it *failed*, or when it alarmed someone enough to write it down. Successful, quiet resistance leaves no trace at all. So the archive systematically over-represents failure and under-represents everything else, and any count drawn from it inherits that bias.\n\nSaying this plainly in an answer is worth marks on its own.',
        nextStage: 'reason',
        source: { materialId: 'mat-revolt-reading', passageId: 'p-rev-3' },
        suggestions: [
          { label: 'How do historians work around it?', intent: 'explain' },
          { label: 'Test me on it', intent: 'check' },
        ],
      },
    },
    recall: {
      open: {
        text: 'From memory: **why does Mbeki object to teaching resistance as a list of revolts?**',
        suggestions: [
          { label: 'Give me a hint', intent: 'hint' },
          { label: 'Tell me the answer', intent: 'answer' },
        ],
      },
      hint: {
        text: 'What impression does a list of revolts create, and why is that impression an artefact of the method rather than a fact about the past?',
        suggestions: [{ label: 'Tell me the answer', intent: 'answer' }],
      },
      answer: {
        text: 'Because it **makes resistance look rare**. Organised revolt was its least common form. The spectrum ran from slowdown and feigned incomprehension through flight to maroon settlement and armed rising.\n\nCounting only the most visible form is a methodological error, not a finding.',
        nextStage: 'reason',
        source: { materialId: 'mat-revolt-reading', passageId: 'p-rev-1' },
        suggestions: [{ label: 'Push me further', intent: 'why' }],
      },
    },
    reason: {
      open: {
        text: 'Now the hard one: **the treaty problem**. Maroon communities won durable autonomy, several by treaty. What was the price, and why does it trouble historians?',
        source: { materialId: 'mat-revolt-reading', passageId: 'p-rev-2' },
        suggestions: [
          { label: 'Give me a hint', intent: 'hint' },
          { label: 'Tell me the answer', intent: 'answer' },
        ],
      },
      hint: {
        text: 'The colonial state got something in exchange for recognition. Something about other people who might follow the same route.',
        suggestions: [{ label: 'Tell me the answer', intent: 'answer' }],
      },
      answer: {
        text: 'Recognition was typically purchased by agreeing to **return future runaways**.\n\nSo a community that had escaped bondage became, in law, an instrument of its enforcement. Historians who read resistance as a single opposed force cannot accommodate that.\n\nMbeki’s own position: autonomy was won by people making the choices available to them rather than the choices we would wish they had had, and a history written to supply heroes will not be able to see it.',
        nextStage: 'apply',
        source: { materialId: 'mat-revolt-reading', passageId: 'p-rev-2' },
        suggestions: [{ label: 'Let me apply it', intent: 'continue' }],
      },
      why: {
        text: 'Because it breaks the model of resistance as one unified side. The treaties are evidence that people made strategic choices under constraint, which is harder to write about and closer to the truth.',
        nextStage: 'apply',
        suggestions: [{ label: 'Let me apply it', intent: 'continue' }],
      },
    },
    apply: {
      open: {
        text: 'Apply it to a source. A 1768 runaway advertisement describes a man named Jupiter: about thirty, a cooper, speaks good English and some French, scar above the left eye, thought to have gone north where his wife lives.\n\n**Why does Mbeki call these unusually valuable, and what can they not tell you?**',
        suggestions: [
          { label: 'Give me a hint', intent: 'hint' },
          { label: 'Tell me the answer', intent: 'answer' },
          { label: 'Practise this properly', intent: 'practice' },
        ],
      },
      hint: {
        text: 'The advertiser needed the description to work. What does that requirement force him to record?',
        suggestions: [{ label: 'Tell me the answer', intent: 'answer' }],
      },
      answer: {
        text: 'Valuable because recapture **required precision**: trade, languages, distinguishing marks, family ties in other parishes. Nothing else in the archive describes individuals that closely, and it is reliable exactly because the advertiser needed it to be.\n\nWhat it cannot tell you: Jupiter’s reasons, in his own words. We have his destination *as guessed by the man who owned him*. And we only have the advertisement because the flight was noticed. The successful escapes are silent.\n\nRead against its purpose, a document of control becomes the best evidence of the person it was written to capture.',
        nextStage: 'reflect',
        source: { materialId: 'mat-revolt-reading', passageId: 'p-rev-3' },
        suggestions: [
          { label: 'Practise this properly', intent: 'practice' },
          { label: 'Wrap up', intent: 'summary' },
        ],
      },
    },
    reflect: {
      open: {
        text: 'Three to keep: the spectrum rather than the list, the archive records failure and alarm, and reading a document against its purpose.\n\nThe treaty problem is the one to return to. It is the most sophisticated thing on this topic and the easiest to lose.',
        suggestions: [
          { label: 'Practise this now', intent: 'practice' },
          { label: 'End and save the summary', intent: 'summary' },
        ],
      },
    },
  },
  misconception: {
    triggers: ['revolts were rare', 'not much resistance', 'few revolts', 'accepted their', 'passive', 'rarely resisted'],
    correction: {
      text: 'That conclusion comes from the method, not from the past, and it is exactly what Mbeki’s first chapter is written against.\n\nOrganised revolt was rare. **Resistance was not.** Slowdown, feigned incomprehension, tool breakage, concealed cultivation, theft and short flight were continuous, and they are nearly invisible in an archive kept by the people being resisted.\n\nSo "there were few revolts, therefore resistance was rare" moves from a fact about the record to a claim about behaviour. Try that again.',
      source: { materialId: 'mat-revolt-reading', passageId: 'p-rev-1' },
      suggestions: [
        { label: 'Let me try again', intent: 'check' },
        { label: 'Explain the archival problem', intent: 'why' },
      ],
    },
  },
  correct: {
    text: 'Yes, and you treated the gap in the record as a fact about the record rather than about the people. That is the distinction this topic is really testing.\n\nSomething harder.',
    nextStage: 'reason',
    suggestions: [{ label: 'Go on', intent: 'continue' }],
  },
  practiceTopicIds: ['topic-revolt', 'topic-debate'],
};

/**
 * Whether the tutor has anything authored for a topic.
 *
 * Lives beside the script rather than in the client engine because the
 * planners need it too. Recommending "Learn X with the tutor" for a topic the
 * script does not cover produces a session whose first message says it cannot
 * help, which is an honest dead end and still a dead end. Checking the
 * capability before suggesting the activity is the fix.
 */
export function hasTutorScript(topicId: string): boolean {
  return topicId in TUTOR_SCRIPT;
}

/*
 * The six Atlantic topics are written above. CENG 401's three live in their
 * own file and are merged in here. Splitting them by course keeps each file a
 * readable length and means a course's scripts sit next to its content, at the
 * cost of one import. `hasTutorScript` reads this merged table, so a topic is
 * covered if and only if it appears in one of the two halves.
 */
export const TUTOR_SCRIPT: Record<string, TopicScript> = {
  'topic-encomienda': ENC,
  'topic-debate': DEB,
  'topic-columbian': COL,
  'topic-plantation': PLANT,
  'topic-mercantilism': MERC,
  'topic-revolt': REV,
  ...CENG401_TUTOR_SCRIPT,
};

/* ── Intent classification ────────────────────────────────────────────── */

const INTENT_PATTERNS: [TutorIntent, RegExp][] = [
  ['simpler', /\b(simpler|simply|plain|don'?t (get|understand)|do not understand|confus|lost|too complicated|eli5)\b/i],
  ['example', /\b(example|instance|concrete|for instance|show me one|such as)\b/i],
  ['hint', /\b(hint|clue|nudge|point me|stuck)\b/i],
  ['answer', /\b(answer|tell me|give up|no idea|not sure|dunno|don'?t know|do not know)\b/i],
  ['practice', /\b(practi[cs]e|quiz|test me|flashcard|drill|exercis)\b/i],
  ['why', /\b(why|how come|what for|reason|matter|significan)\b/i],
  ['summary', /\b(summar|wrap up|finish|done|end (the )?session|that'?s enough)\b/i],
  ['explain', /\b(explain|what is|what was|what does|tell me about|go over|walk me)\b/i],
  ['continue', /\b(continue|next|go on|carry on|keep going|more|ok(ay)?|yes|yep|sure)\b/i],
];

/**
 * Best-effort intent recognition on a typed message.
 *
 * Returns `null` rather than guessing when nothing matches — the caller is
 * required to say so out loud. A tutor that silently maps unrecognised input
 * onto its nearest branch is the dishonest failure mode the brief rules out.
 */
export function classify(input: string): TutorIntent | null {
  const text = input.trim();
  if (!text) return null;
  for (const [intent, pattern] of INTENT_PATTERNS) {
    if (pattern.test(text)) return intent;
  }
  return null;
}

/** Whether a typed answer trips this topic's authored misconception. */
export function hitsMisconception(script: TopicScript, input: string): boolean {
  const lower = input.toLowerCase();
  return script.misconception.triggers.some((t) => lower.includes(t));
}

/**
 * Whether a typed answer looks like a substantive attempt rather than a
 * question. Used to decide between "you answered" and "you asked" at the
 * recall and reason stages, where both are plausible.
 *
 * ── Why length alone is not enough ────────────────────────────────────────
 *
 * The obvious test — long enough, not a question — accepts "zxqw plorbit
 * flumpus" and hands it the "that is right" branch. A scripted tutor praising
 * gibberish is precisely the dishonesty the rest of this file is built to
 * avoid, and it is worse than refusing, because it teaches the student that
 * the tutor is not reading.
 *
 * So an answer must also contain some vocabulary belonging to the subject.
 * `TOPIC_VOCABULARY` is a coarse net — proper nouns and the course's load-
 * bearing terms — and coarse is the right level: this decides which authored
 * branch to show, not what the answer is worth. Anything that clears the
 * length bar but contains none of it falls through to the honest "I do not
 * have a branch for that", which is the correct response to nonsense.
 */
const TOPIC_VOCABULARY =
  /(encomienda|tribute|labour|labor|land|people|crown|spanish|colon|indigenous|christian|1542|new laws|repartimiento|mita|valderrama|okonkwo|larssen|mbeki|fiscal|coerc|tax|revenue|disease|mortality|epidemic|slave|slavery|plantation|sugar|cane|mill|sucrose|capital|credit|insurance|commercial|ledger|mercantil|bullion|navigation|smuggl|colonies|colony|resist|revolt|maroon|runaway|treaty|flight|archive|source|evidence|historian|interpret|compare|comparison|argue|argument|axis|disagree|because|therefore|caused|cause|explain|demand|supply|exchange|atlantic|europe|africa|caribbean)/i;

export function looksLikeAnswer(input: string): boolean {
  const text = input.trim();
  if (text.length < 12) return false;
  if (/\?\s*$/.test(text)) return false;
  if (text.split(/\s+/).filter(Boolean).length < 4) return false;
  return TOPIC_VOCABULARY.test(text);
}

/** The fallback, said out loud when nothing matched. */
export const UNRECOGNISED =
  'I do not have a branch for that. This prototype’s tutor is a set of authored responses rather than a live model, so it only recognises a limited set of moves. I would rather say that than invent something that sounds like an answer.\n\nHere is what I can do from where we are:';

export const SCRIPTED_NOTICE =
  'Simulated tutor. Every response is authored in advance and selected by topic and stage, not generated.';
