import type { Concept, Source, SourceChunk, Workspace } from '@shared/contract.ts';
import type { ConceptContent } from '@shared/content.ts';



const WORKSPACE_ID = 'ws-demo';
const SOURCE_ID = 'src-demo';
const CONCEPT_ID = 'con-demo-elasticity';

const SOURCE_TEXT = `Price elasticity of demand measures how much the quantity demanded of a good responds to a change in its price. It is calculated as the percentage change in quantity demanded divided by the percentage change in price.

When elasticity is greater than one in absolute value, demand is called elastic: buyers respond a lot, and a price rise reduces total revenue because the fall in quantity outweighs the higher price per unit.

When elasticity is less than one in absolute value, demand is inelastic: buyers respond little, and a price rise increases total revenue because quantity falls by proportionally less than the price rose.

Goods with close substitutes tend to have elastic demand, because buyers can switch away easily. Necessities with few substitutes tend to have inelastic demand. Elasticity also tends to be higher over longer time horizons, because buyers have more time to find alternatives.`;

const chunkTexts = SOURCE_TEXT.split(/\n{2,}/).map((piece) => piece.trim());

export const DEMO_CHUNK_IDS = chunkTexts.map((_, index) => `chunk-${SOURCE_ID}-${index}`);

const content: ConceptContent = {
  schema_version: 1,
  concept_id: CONCEPT_ID,
  name: 'Elasticity and total revenue',
  summary:
    'Whether a price rise increases or decreases total revenue depends on how much quantity responds.',
  teaching_explanation:
    'Total revenue is price times quantity, so a price rise pulls revenue in two directions at once: each unit earns more, and fewer units sell. Elasticity is what settles which effect wins. If demand is elastic — elasticity greater than one in absolute value — the fall in quantity outweighs the higher price, and revenue falls. If demand is inelastic, quantity falls by proportionally less than the price rose, and revenue rises.',
  teaching_chunk_ids: [DEMO_CHUNK_IDS[1]!, DEMO_CHUNK_IDS[2]!],
  claims: [
    {
      id: 'ELASTIC_REVENUE_FALLS',
      meaning:
        'When demand is elastic, raising the price reduces total revenue, because quantity falls proportionally more than price rose.',
      acceptable_examples: [
        'revenue falls',
        'revenue goes down',
        'total revenue decreases',
        'they lose revenue',
      ],
      contradiction_examples: [
        'revenue rises',
        'revenue increases',
        'they make more money',
      ],
      source_chunk_ids: [DEMO_CHUNK_IDS[1]!],
    },
  ],
  supports: [
    {
      id: 'sup-vocab',
      type: 'vocabulary',
      text: 'Elastic means buyers respond a lot. Inelastic means they respond little.',
    },
    {
      id: 'sup-frame',
      type: 'sentence_frame',
      text: 'Because demand is ______, a price rise makes total revenue ______.',
    },
  ],
  tasks: [
    {
      id: 'task-entry',
      version: 1,
      family_id: 'fam-revenue-direction',
      purpose: 'entry',
      prompt:
        'A coffee shop raises its prices by 10%. Its customers have three other cafés within a block. What happens to the shop’s total revenue, and why?',
      response_mode: 'text',
      options: null,
      correct_option_id: null,
      answer_explanation:
        'With close substitutes a block away, demand is elastic. Quantity falls proportionally more than the 10% price rise, so total revenue falls.',
      hints: [
        'Start with how easily these customers can go somewhere else.',
        'If quantity falls by more than 10%, what happens to price × quantity?',
      ],
      required_claim_ids: ['ELASTIC_REVENUE_FALLS'],
      clarification_task_ids: ['task-clarify'],
      support_ids: ['sup-vocab'],
    },
    {
      id: 'task-clarify',
      version: 1,
      family_id: 'fam-definition',
      purpose: 'clarification',
      prompt:
        'Which of these describes elastic demand?',
      response_mode: 'choice',
      options: [
        { id: 'opt-a', text: 'Buyers barely change what they buy when the price changes.' },
        { id: 'opt-b', text: 'Buyers change what they buy a lot when the price changes.' },
        { id: 'opt-c', text: 'The price never changes.' },
      ],
      correct_option_id: 'opt-b',
      answer_explanation:
        'Elastic demand means quantity responds strongly to price — buyers have somewhere else to go.',
      hints: ['Think about what "elastic" means for a rubber band.'],
      required_claim_ids: ['ELASTIC_REVENUE_FALLS'],
      clarification_task_ids: [],
      support_ids: ['sup-vocab'],
    },
    {
      id: 'task-probe',
      version: 1,
      family_id: 'fam-definition',
      purpose: 'probe',
      prompt:
        'A pharmacy raises the price of a prescription medicine with no substitute by 10%. What happens to its total revenue?',
      response_mode: 'text',
      options: null,
      correct_option_id: null,
      answer_explanation:
        'With no substitute, demand is inelastic: quantity falls by less than 10%, so total revenue rises.',
      hints: ['There is nowhere else to go. Does quantity fall by more or less than 10%?'],
      required_claim_ids: ['ELASTIC_REVENUE_FALLS'],
      clarification_task_ids: ['task-clarify'],
      support_ids: ['sup-vocab'],
    },
    {
      id: 'task-practice',
      version: 1,
      family_id: 'fam-revenue-direction',
      purpose: 'practice',
      prompt:
        'A cinema raises ticket prices and total revenue goes down. What does that tell you about the elasticity of demand for its tickets?',
      response_mode: 'text',
      options: null,
      correct_option_id: null,
      answer_explanation:
        'Revenue falling after a price rise means quantity fell proportionally more: demand is elastic.',
      hints: ['Work backwards from revenue to quantity.'],
      required_claim_ids: ['ELASTIC_REVENUE_FALLS'],
      clarification_task_ids: [],
      support_ids: ['sup-frame'],
    },
    {
      id: 'task-transfer',
      version: 1,
      family_id: 'fam-transfer-pricing',
      purpose: 'transfer',
      prompt:
        'A bus company wants more revenue and is deciding whether to raise or cut fares. Most of its riders have no car. What would you advise, and why?',
      response_mode: 'text',
      options: null,
      correct_option_id: null,
      answer_explanation:
        'Riders without cars have few substitutes, so demand is inelastic and a fare rise would raise revenue — quantity falls by proportionally less than the fare rose.',
      hints: ['What are the alternatives for someone with no car?'],
      required_claim_ids: ['ELASTIC_REVENUE_FALLS'],
      clarification_task_ids: [],
      support_ids: [],
    },
    {
      id: 'task-review',
      version: 1,
      family_id: 'fam-review-context',
      purpose: 'review',
      prompt:
        'A streaming service raises its monthly price and its total revenue rises, even though some subscribers leave. Is demand for it elastic or inelastic, and how do you know?',
      response_mode: 'text',
      options: null,
      correct_option_id: null,
      answer_explanation:
        'Revenue rose after a price rise, so quantity fell by proportionally less than the price: demand is inelastic.',
      hints: [],
      required_claim_ids: ['ELASTIC_REVENUE_FALLS'],
      clarification_task_ids: [],
      support_ids: [],
    },
  ],
};

const now = new Date('2026-09-01T09:00:00.000Z').toISOString();

export const DEMO: {
  workspace: Workspace & { intent: string | null };
  sources: (Source & { text: string })[];
  chunks: (SourceChunk & { workspaceId: string })[];
  concepts: (Concept & { content: ConceptContent | null })[];
} = {
  workspace: {
    id: WORKSPACE_ID,
    name: 'Intro microeconomics',
    intent: 'I keep getting elasticity questions wrong in problem sets.',
    sourceCount: 1,
    conceptCount: 2,
    dueCount: 0,
    createdAt: now,
    updatedAt: now,
  },
  sources: [
    {
      id: SOURCE_ID,
      workspaceId: WORKSPACE_ID,
      title: 'Lecture 4 — elasticity',
      kind: 'pasted',
      status: 'ready',
      chunkCount: chunkTexts.length,
      characterCount: SOURCE_TEXT.length,
      createdAt: now,
      text: SOURCE_TEXT,
    },
  ],
  chunks: chunkTexts.map((text, ordinal) => ({
    id: DEMO_CHUNK_IDS[ordinal]!,
    sourceId: SOURCE_ID,
    workspaceId: WORKSPACE_ID,
    ordinal,
    text,
  })),
  concepts: [
    {
      id: CONCEPT_ID,
      workspaceId: WORKSPACE_ID,
      name: content.name,
      summary: content.summary,
      evidence: 'not-checked',
      prerequisiteIds: ['con-demo-definition'],
      sourceIds: [SOURCE_ID],
      lastAttemptAt: null,
      dueAt: null,
      itemsRemaining: content.tasks.length,
      content,
    },
    {
      // A concept with no authored items — the honest "nothing to check yet"
      // state. It is here on purpose: that state is reachable in production
      // whenever a source is too thin to author from, and a demo that never
      // shows it is a demo that hides a real screen.
      id: 'con-demo-definition',
      workspaceId: WORKSPACE_ID,
      name: 'What elasticity measures',
      summary:
        'Percentage change in quantity demanded divided by percentage change in price.',
      evidence: 'not-checked',
      prerequisiteIds: [],
      sourceIds: [SOURCE_ID],
      lastAttemptAt: null,
      dueAt: null,
      itemsRemaining: 0,
      content: null,
    },
  ],
};
