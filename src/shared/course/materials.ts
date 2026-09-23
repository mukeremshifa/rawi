import type { Material } from '../types.ts';
import { ATLANTIC_COURSE_ID } from './topics.ts';

/**
 * The seeded library.
 *
 * ── Fictional, internally consistent, and labelled ────────────────────────
 *
 * Every historian, book and journal named below is invented. The brief allows
 * fictional course material and forbids inventing real scholarly citations, so
 * the line taken here is: invent freely, keep it coherent across materials, and
 * label it at every point of display rather than only once in a README.
 *
 * Internal consistency matters more than it looks. The exam questions, the
 * tutor's authored branches and the source-analysis extracts all quote these
 * passages, so a date changed here has to be changed in three other files. The
 * fixed points are: Valderrama argues the encomienda was primarily fiscal;
 * Okonkwo argues it was primarily coercive labour extraction; Larssen reads the
 * plantation complex as a commercial system; Mbeki reads it through resistance.
 * Those four positions are what the comparison questions turn on.
 *
 * ── Passages are the addressable unit ─────────────────────────────────────
 *
 * A material is split into passages because everything interesting points at
 * one: "ask the tutor about this", "this exam question came from here",
 * "practise the topic this covers". A material-level link would be too coarse
 * to be useful for any of the three.
 */

const ADDED = new Date(Date.now() - 1000 * 60 * 60 * 24 * 12).toISOString();

export const SEED_MATERIALS: Material[] = [
  {
    id: 'mat-exchange-reading',
    courseId: ATLANTIC_COURSE_ID,
    title: 'The Exchange and its Aftermath',
    kind: 'reading',
    origin: 'authored',
    attribution: 'Adapted from H. Valderrama, *Atlantic Crossings* (fictional, ch. 2)',
    topicIds: ['topic-columbian'],
    addedAt: ADDED,
    passages: [
      {
        id: 'p-exch-1',
        heading: 'What crossed, and in which direction',
        topicIds: ['topic-columbian'],
        text: `The traffic that followed 1492 was never symmetrical. Eastward went maize, potatoes, cassava and tomatoes: crops that would, within two centuries, raise the calorie ceiling of European and Asian agriculture and underwrite a long demographic expansion. Westward went wheat, sugar cane, cattle, horses and swine, and with them the pathogens of a continent that had lived alongside domesticated animals for millennia.

It is the asymmetry of the disease exchange that most demands explanation. American populations had no acquired immunity to smallpox, measles, influenza or typhus. Mortality estimates for the century after contact remain contested, but no serious reconstruction places the decline below fifty per cent, and several place it far higher.`,
      },
      {
        id: 'p-exch-2',
        heading: 'The demographic argument',
        topicIds: ['topic-columbian', 'topic-encomienda'],
        text: `Demographic collapse is the hinge on which much of the subsequent history turns, and it is worth being precise about the causal chain rather than gesturing at it.

Epidemic mortality removed the indigenous labour force on which early Spanish extraction depended. The encomienda, which granted a colonist the labour of a community rather than its land, became progressively harder to work as those communities shrank. Colonists responded by intensifying demands on survivors, which raised mortality further. It was into this gap, a labour system whose supply was collapsing and whose demand was not, that the Atlantic slave trade expanded.

Note the shape of the argument. Disease did not *cause* slavery. It removed one solution to a labour problem that the plantation economy had already created, and made a second solution commercially attractive.`,
      },
      {
        id: 'p-exch-3',
        heading: 'Against a purely biological reading',
        topicIds: ['topic-columbian', 'topic-debate'],
        text: `A biological account of the Exchange has an appealing tidiness, and that is precisely its danger. Pathogens do not decide where to travel. Ships carry them, and ships follow commerce and conquest.

Where colonial demands on labour were lightest, indigenous populations recovered soonest. Where the demands were heaviest, the Caribbean sugar islands above all, recovery did not occur at all. The same pathogens produced very different outcomes depending on what was being asked of the people who survived them. Any explanation that stops at the virus has stopped one step too early.`,
      },
    ],
  },
  {
    id: 'mat-encomienda-reading',
    courseId: ATLANTIC_COURSE_ID,
    title: 'Grant, Tribute and Labour: the encomienda reconsidered',
    kind: 'reading',
    origin: 'authored',
    attribution:
      'Adapted from H. Valderrama, *Atlantic Crossings* (fictional, ch. 4) and A. Okonkwo, *The Coerced Atlantic* (fictional, ch. 1)',
    topicIds: ['topic-encomienda', 'topic-debate'],
    addedAt: ADDED,
    passages: [
      {
        id: 'p-enc-1',
        heading: 'What an encomienda actually granted',
        topicIds: ['topic-encomienda'],
        text: `The encomienda was not a grant of land. This is the single most common error in undergraduate writing on the subject, and it matters because almost every argument about the institution depends on getting it right.

What the Crown granted was the right to receive tribute and labour from a named group of indigenous people, in exchange for an obligation to protect them and see them instructed in Christianity. The land remained, in law, theirs. The encomendero held people, not acres, and held them conditionally, at the Crown's pleasure, for a term that the New Laws of 1542 attempted to limit to a single lifetime.`,
      },
      {
        id: 'p-enc-2',
        heading: 'Valderrama: the fiscal reading',
        topicIds: ['topic-encomienda', 'topic-debate'],
        text: `Valderrama's account treats the encomienda as, first and last, a device for extracting revenue from a territory the Crown could not yet administer directly.

On this reading the institution was a stopgap. Spain had conquered more than it could govern. It lacked the officials, the roads and the coin to collect tribute itself, so it delegated collection to the men who had done the conquering and paid them in the proceeds. The obligations to protect and instruct were not decoration but the legal basis on which the delegation rested.

The evidence Valderrama leans on is fiscal: tribute schedules, the Crown's repeated attempts to convert labour obligations into cash payments, and the speed with which the institution was dismantled once a salaried colonial bureaucracy existed to replace it. An institution abolished the moment direct taxation became feasible was, he argues, a tax-collection device all along.`,
      },
      {
        id: 'p-enc-3',
        heading: 'Okonkwo: the coercive reading',
        topicIds: ['topic-encomienda', 'topic-debate'],
        text: `Okonkwo accepts most of Valderrama's fiscal evidence and denies the conclusion drawn from it.

Her objection is about what the sources are records *of*. Tribute schedules record what the Crown hoped to collect and how it wished the arrangement to be described. They are poor evidence of what was done to people in the mines and fields, because that is not what they were written to record. For that she turns to the *residencia* hearings, the complaints of the Dominican friars, and mission mortality registers.

Read against those sources, she argues, the encomienda was a labour-extraction system with a fiscal justification attached, and the justification should not be mistaken for the function. Her sharpest point is about the abolition Valderrama treats as decisive: the institution was dismantled, she notes, but forced labour was not. The *repartimiento* replaced it and the mita continued. If the coercion outlives the tax device, the coercion was not incidental to it.`,
      },
      {
        id: 'p-enc-4',
        heading: 'Where the two accounts actually differ',
        topicIds: ['topic-debate', 'topic-encomienda'],
        text: `It is worth being exact about the disagreement, because it is narrower than it first appears and students routinely overstate it.

Valderrama and Okonkwo agree on the chronology, on the legal content of the grant, and on the fact of severe coercion. They differ on which of those facts is doing the explanatory work. For Valderrama, coercion is a consequence of a fiscal arrangement badly supervised at distance. For Okonkwo, the fiscal arrangement is the licence under which coercion was organised.

The test that separates them is what happened after 1542. If the encomienda was essentially fiscal, its abolition should have changed the experience of indigenous labour substantially. If it was essentially coercive, abolition should have changed the paperwork and little else.`,
      },
    ],
  },
  {
    id: 'mat-plantation-reading',
    courseId: ATLANTIC_COURSE_ID,
    title: 'Sugar and the Commercial System',
    kind: 'reading',
    origin: 'authored',
    attribution: 'Adapted from I. Larssen, *The Plantation Complex* (fictional, ch. 3)',
    topicIds: ['topic-plantation', 'topic-mercantilism'],
    addedAt: ADDED,
    passages: [
      {
        id: 'p-plant-1',
        heading: 'Why sugar and not something else',
        topicIds: ['topic-plantation'],
        text: `Sugar organised the Atlantic in a way that tobacco, rice and indigo did not, and the reason is technical before it is economic.

Cane must be milled within roughly a day of cutting or its sucrose content falls sharply. That single agronomic fact forces the mill next to the field, forces a large coordinated workforce to cut and haul on a schedule set by the mill, and forces heavy fixed capital investment in the mill itself. A tobacco farm can be small. A sugar estate cannot. The crop selected for the plantation form, and the plantation form selected for coerced labour at scale.`,
      },
      {
        id: 'p-plant-2',
        heading: 'The commercial circuit',
        topicIds: ['topic-plantation', 'topic-mercantilism'],
        text: `Larssen's central claim is that the plantation was not an agricultural enterprise that happened to trade, but a node in a commercial system that happened to farm.

Credit originated in European ports. It financed the purchase of trade goods, which were exchanged on the West African coast for captives, who were carried to the Caribbean and sold, the proceeds settling the original credit and financing the sugar shipment home. Each leg was underwritten by insurance contracts written in Europe, and it is in those contracts, not in plantation ledgers, that Larssen finds the system's governing logic.

The planter, on this account, was less a landowner than a debtor operating someone else's capital under terms set at a distance of four thousand miles.`,
      },
      {
        id: 'p-plant-3',
        heading: 'Mbeki’s objection',
        topicIds: ['topic-plantation', 'topic-revolt', 'topic-debate'],
        text: `Mbeki's criticism of Larssen is not that the commercial account is wrong but that it is written from the ledger's point of view, and a ledger records what its keeper thought worth recording.

Accounts of sugar production, she observes, were kept by people for whom labour was a cost line. Read them alone and the enslaved appear as an input. Read them against runaway advertisements, plantation punishment books and the correspondence of nervous overseers, and a different system appears: one in which output was continually constrained by the refusal, slowdown, flight and revolt of the people performing it.

Her argument is not sentimental. It is that the commercial model cannot explain its own numbers. The elaborate apparatus of surveillance and punishment on a sugar estate was expensive, and no rational commercial system incurs a large recurring cost against a threat that is not real.`,
      },
    ],
  },
  {
    id: 'mat-mercantilism-lecture',
    courseId: ATLANTIC_COURSE_ID,
    title: 'Lecture 7. Mercantilism: the theory and the practice',
    kind: 'lecture-notes',
    origin: 'authored',
    attribution: 'Fictional lecture notes, Week 7',
    topicIds: ['topic-mercantilism'],
    addedAt: ADDED,
    passages: [
      {
        id: 'p-merc-1',
        heading: 'The doctrine, stated fairly',
        topicIds: ['topic-mercantilism'],
        text: `Three propositions, held together:

1. National wealth is measured by the stock of bullion a state holds.
2. Trade is close to zero-sum: one nation's surplus is another's deficit.
3. Colonies exist to supply the metropole with raw materials and to buy its manufactures, and should be prevented from doing anything else.

Stated this baldly the doctrine sounds foolish, and it is worth resisting the temptation to treat it as such. It was a reasonable description of a world in which state capacity depended on the ability to pay armies in coin, and in which the coin was genuinely scarce.`,
      },
      {
        id: 'p-merc-2',
        heading: 'The Navigation Acts in practice',
        topicIds: ['topic-mercantilism', 'topic-plantation'],
        text: `The Acts required that colonial trade travel in English ships, that enumerated goods, sugar and tobacco first among them, be landed in England before resale, and that colonial imports of European manufactures pass through English ports.

Enforcement was another matter. The customs establishment in the Caribbean was small, badly paid and frequently local. Smuggling was not a marginal leakage. On some estimates it accounted for a large fraction of the Dutch and French sugar entering English markets. The gap between the statute book and the wharf is the single most useful thing to hold on to about mercantilism, and it is the thing exam answers most often omit.`,
      },
      {
        id: 'p-merc-3',
        heading: 'Where the system generated its own opposition',
        topicIds: ['topic-mercantilism', 'topic-revolt'],
        text: `A system that forces colonial producers to sell into one market at prices set by that market's buyers creates a colonial merchant class with a standing interest in the system's failure.

This is the line of argument that connects mercantilism to the imperial crises of the later eighteenth century. It should be handled carefully: the connection is real but it is not a mechanism, and an answer that runs directly from the Navigation Acts to revolution has skipped every step that would make it an explanation.`,
      },
    ],
  },
  {
    id: 'mat-revolt-reading',
    courseId: ATLANTIC_COURSE_ID,
    title: 'Refusal: resistance in the Atlantic world',
    kind: 'reading',
    origin: 'authored',
    attribution: 'Adapted from N. Mbeki, *Refusal* (fictional, ch. 1 and 5)',
    topicIds: ['topic-revolt'],
    addedAt: ADDED,
    passages: [
      {
        id: 'p-rev-1',
        heading: 'The spectrum of refusal',
        topicIds: ['topic-revolt'],
        text: `Resistance is usually taught as a list of revolts, which has the effect of making it look rare. It was not rare. It was continuous, and organised revolt was its least common form.

The spectrum runs from the barely visible to the unmistakable: deliberate slowness, feigned incomprehension, tool breakage, concealed cultivation, theft, abortion, flight for days, flight for good, maroon settlement, and armed rising. Each carries a different risk and a different prospect of success, and people moved between them according to circumstance.

Counting only the last of these and concluding that resistance was exceptional is a methodological error, not a finding.`,
      },
      {
        id: 'p-rev-2',
        heading: 'Maroon communities and the treaty problem',
        topicIds: ['topic-revolt', 'topic-debate'],
        text: `Maroon settlements in Jamaica, Suriname and the Brazilian interior achieved something no shipboard rising did: durable autonomous territory, in several cases recognised by treaty.

The treaties are the difficulty. Recognition was typically purchased by agreeing to return future runaways. A community that had escaped bondage thereby became, in law, an instrument of its enforcement. Historians who read resistance as a single opposed force struggle with this; Mbeki's own position is that autonomy was won by people making the choices available to them rather than the choices we would wish them to have had, and that a history written to supply heroes will not be able to see it.`,
      },
      {
        id: 'p-rev-3',
        heading: 'What the evidence looks like',
        topicIds: ['topic-revolt'],
        text: `The archival problem is severe and should be stated plainly in any answer on this topic.

Almost every surviving document was produced by the system being resisted: court records, runaway advertisements, punishment books, the correspondence of planters and officials. These record resistance only when it failed, or when it alarmed someone enough to write it down.

The advertisements are more useful than they first appear. Written to enable recapture, they describe individuals with a precision that nothing else in the archive matches: skills, languages spoken, scars, likely destinations, named relatives in other parishes. Read against their purpose, they are among the best surviving evidence of who these people were and where they thought they could get to.`,
      },
    ],
  },
  {
    id: 'mat-debate-lecture',
    courseId: ATLANTIC_COURSE_ID,
    title: 'Lecture 11: Reading historians against each other',
    kind: 'lecture-notes',
    origin: 'authored',
    attribution: 'Fictional lecture notes, Week 11',
    topicIds: ['topic-debate'],
    addedAt: ADDED,
    passages: [
      {
        id: 'p-deb-1',
        heading: 'Comparison is not summary',
        topicIds: ['topic-debate'],
        text: `The commonest failure in this paper is an answer that summarises historian A, then summarises historian B, then stops. That is two summaries adjacent to each other. It is not a comparison.

A comparison requires you to name the axis on which they differ. Do they disagree about what happened, about which evidence counts, or about what the evidence means? Those are three quite different disagreements and they call for three different kinds of answer.

Valderrama and Okonkwo do not disagree much about what happened. They disagree about which sources reveal the institution's function, and once you can say that sentence, you have an argument rather than a pair of paragraphs.`,
      },
      {
        id: 'p-deb-2',
        heading: 'Three families of explanation',
        topicIds: ['topic-debate'],
        text: `Economic readings (Larssen) treat the Atlantic as a system of capital, credit and commodity flows, and explain events by the incentives those flows created.

Cultural and social readings (Mbeki) treat it as a field of human relations, and insist that the actions of the people inside the system are part of what determined its shape.

Imperial and institutional readings (Valderrama) treat it as a problem of state capacity, and explain events by what governments were trying to do and how little of it they could manage at distance.

None of the three is the correct one. A strong answer uses the tension between them: the productive question is which reading explains a particular piece of evidence better, and why.`,
      },
      {
        id: 'p-deb-3',
        heading: 'A usable structure for a comparison answer',
        topicIds: ['topic-debate'],
        text: `A structure that reliably works under exam conditions:

1. State the disagreement in one sentence, naming the axis.
2. Give each position its strongest form, with its best evidence. Steelman, do not strawman. The examiner has read both and will notice.
3. Identify what would distinguish them: what evidence, if found, would favour one?
4. Take a position and defend it on those terms.

Step three is the one that separates a good answer from a competent one, and it is the one that is almost always missing.`,
      },
    ],
  },
  {
    id: 'mat-student-note',
    courseId: ATLANTIC_COURSE_ID,
    title: 'My notes: things I keep forgetting',
    kind: 'student-note',
    origin: 'pasted',
    topicIds: ['topic-encomienda', 'topic-debate'],
    addedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 3).toISOString(),
    passages: [
      {
        id: 'p-note-1',
        heading: 'Pasted note',
        topicIds: ['topic-encomienda', 'topic-debate'],
        text: `encomienda = PEOPLE not land. keep writing "land grant" in essays, stop it.

New Laws 1542: tried to stop inheritance, mostly failed, colonists revolted in Peru.

V = fiscal/tax, O = coercion. the test between them is what changed after 1542 (paperwork vs actual labour). ← remember this, it's the bit that makes it a comparison

Larssen = ledgers/credit. Mbeki = says ledgers only show what the owner thought mattered.

I can recognise all of this when I read it and then produce none of it in a timed essay.`,
      },
    ],
  },
];
