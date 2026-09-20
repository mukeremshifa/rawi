import {
  ApiClientError,
  type AdvanceStageInput,
  type ApiClient,
  type AddSourceInput,
  type AskInput,
  type AskResponse,
  type CheckItem,
  type Concept,
  type ConceptEvidence,
  type CreateWorkspaceInput,
  type EvidenceSummary,
  type Job,
  type Page,
  type PageRequest,
  type Readiness,
  type Session,
  type SessionCommandInput,
  type Source,
  type SourceChunk,
  type StudyPlan,
  type SubmitResponseInput,
  type UpdateWorkspaceInput,
  type Workspace,
} from '@shared/contract.ts';
import type { ConceptContent, Task } from '@shared/content.ts';
import { ASK_NO_GROUNDING, FEEDBACK } from '@shared/messages.ts';

import { DEMO } from './demo.ts';

/** In-memory demo data. Reloading resets all changes; no external services are called. */

// ---------------------------------------------------------------------------
// The store
// ---------------------------------------------------------------------------

interface ItemProgress {
  assistance: 'none' | 'hinted' | 'revealed';
  hintsUsed: number;
  submitted: boolean;
  usedAsk: boolean;
}

interface LocalSession {
  id: string;
  workspaceId: string;
  conceptId: string;
  stage: Session['stage'];
  version: number;
  activeItemId: string | null;
  exposedItemIds: string[];
  items: Record<string, ItemProgress>;
  teachingSeen: boolean;
  feedback: Session['feedback'];
  startedAt: string;
  ended: boolean;
}

interface LocalAttempt {
  id: string;
  conceptId: string;
  itemId: string;
  familyId: string;
  purpose: Task['purpose'];
  stage: Session['stage'];
  correct: boolean;
  assistance: ItemProgress['assistance'];
  countsAsIndependent: boolean;
  usedAsk: boolean;
  at: string;
  reviewDue: string | null;
  idempotencyKey: string;
}

interface Store {
  workspaces: Map<string, Workspace & { intent: string | null }>;
  sources: Map<string, Source & { text: string }>;
  chunks: Map<string, SourceChunk & { workspaceId: string }>;
  concepts: Map<string, Concept & { content: ConceptContent | null }>;
  sessions: Map<string, LocalSession>;
  attempts: LocalAttempt[];
  jobs: Map<string, Job & { remaining: number }>;
}

const store: Store = {
  workspaces: new Map(),
  sources: new Map(),
  chunks: new Map(),
  concepts: new Map(),
  sessions: new Map(),
  attempts: [],
  jobs: new Map(),
};

let seeded = false;

/**
 * The seeded demo workspace, which replaces the old hardcoded demo lesson.
 *
 * It exists so that the first screen a person sees has something on it. Every
 * row is the shape a real one would be, including a source that is genuinely
 * chunked, so the concept map and the citations are real rather than mocked.
 */
function seed(): void {
  if (seeded) return;
  seeded = true;

  store.workspaces.set(DEMO.workspace.id, { ...DEMO.workspace });
  for (const source of DEMO.sources) store.sources.set(source.id, { ...source });
  for (const chunk of DEMO.chunks) store.chunks.set(chunk.id, { ...chunk });
  for (const concept of DEMO.concepts) store.concepts.set(concept.id, { ...concept });
}

function requireWorkspace(workspaceId: string): Workspace {
  seed();
  const workspace = store.workspaces.get(workspaceId);
  if (!workspace) throw new ApiClientError('not_found', 'That workspace is not here.');
  return workspace;
}

function requireConcept(
  workspaceId: string,
  conceptId: string,
): Concept & { content: ConceptContent | null } {
  requireWorkspace(workspaceId);
  const concept = store.concepts.get(conceptId);
  if (!concept || concept.workspaceId !== workspaceId) {
    throw new ApiClientError('not_found', 'That concept is not here.');
  }
  return concept;
}

function requireContent(conceptId: string): ConceptContent {
  const concept = store.concepts.get(conceptId);
  if (!concept?.content) {
    throw new ApiClientError(
      'not_found',
      'No questions have been written for this concept yet.',
    );
  }
  return concept.content;
}

const RANK = { none: 0, hinted: 1, revealed: 2 } as const;

function raise(
  current: ItemProgress['assistance'],
  next: ItemProgress['assistance'],
): ItemProgress['assistance'] {
  return RANK[next] > RANK[current] ? next : current;
}

function progress(session: LocalSession, itemId: string): ItemProgress {
  return (
    session.items[itemId] ?? {
      assistance: 'none',
      hintsUsed: 0,
      submitted: false,
      usedAsk: false,
    }
  );
}

function attemptsFor(conceptId: string): LocalAttempt[] {
  return store.attempts.filter((attempt) => attempt.conceptId === conceptId);
}

/** Derive the displayed evidence from local attempts. */
function evidenceOf(conceptId: string): Concept['evidence'] {
  const attempts = attemptsFor(conceptId);
  const independent = attempts.filter((attempt) => attempt.countsAsIndependent);
  if (independent.length === 0) return attempts.length > 0 ? 'practicing' : 'not-checked';
  const first = independent[0]!;
  const retained = independent.some(
    (attempt) =>
      attempt.purpose === 'review' && attempt.familyId !== first.familyId && attempt.at > first.at,
  );
  return retained ? 'retained-on-review' : 'independent-once';
}

function exposedFor(conceptId: string): string[] {
  return [
    ...new Set(
      [...store.sessions.values()]
        .filter((session) => session.conceptId === conceptId)
        .flatMap((session) => session.exposedItemIds),
    ),
  ];
}

function projectConcept(concept: Concept & { content: ConceptContent | null }): Concept {
  const attempts = attemptsFor(concept.id);
  const exposed = exposedFor(concept.id);
  const due = [...attempts].reverse().find((attempt) => attempt.reviewDue)?.reviewDue ?? null;
  return {
    ...concept,
    evidence: evidenceOf(concept.id),
    lastAttemptAt: attempts.at(-1)?.at ?? null,
    dueAt: due,
    itemsRemaining: concept.content
      ? concept.content.tasks.filter((task) => !exposed.includes(task.id)).length
      : 0,
  };
}

function toCheckItem(task: Task, conceptId: string): CheckItem {
  // Views receive the question; demo answers stay in this data layer.
  return {
    id: task.id,
    conceptId,
    familyId: task.family_id,
    purpose: task.purpose,
    prompt: task.prompt,
    responseMode: task.response_mode,
    options: task.options,
    hintCount: task.hints.length,
  };
}

function projectSession(session: LocalSession): Session {
  const content = requireContent(session.conceptId);
  const task = session.activeItemId
    ? content.tasks.find((candidate) => candidate.id === session.activeItemId)
    : undefined;
  const item = task ? progress(session, task.id) : null;
  const exposed = exposedFor(session.conceptId);

  return {
    id: session.id,
    workspaceId: session.workspaceId,
    conceptId: session.conceptId,
    stage: session.stage,
    version: session.version,
    item: task ? toCheckItem(task, session.conceptId) : null,
    assistance: item?.assistance ?? 'none',
    hints: task ? task.hints.slice(0, item?.hintsUsed ?? 0) : [],
    revealedAnswer: task && item?.assistance === 'revealed' ? task.answer_explanation : null,
    teaching: session.teachingSeen
      ? {
          text: content.teaching_explanation,
          citations: content.teaching_chunk_ids.map((chunkId) => ({
            sourceId: store.chunks.get(chunkId)?.sourceId ?? '',
            chunkId,
          })),
        }
      : null,
    feedback: session.feedback,
    evidence: evidenceOf(session.conceptId),
    itemBankExhausted: content.tasks.every((candidate) => exposed.includes(candidate.id)),
    startedAt: session.startedAt,
  };
}

function guard(session: LocalSession, input: SessionCommandInput): void {
  if (session.version !== input.expectedVersion) {
    throw new ApiClientError('stale_request', 'This session moved on. Reload.');
  }
  if (session.activeItemId !== input.itemId) {
    throw new ApiClientError('stale_request', 'That question has been replaced. Reload.');
  }
  if (session.stage !== input.expectedStage) {
    throw new ApiClientError('stale_request', 'This session is at a different stage. Reload.');
  }
}

function nextItem(
  content: ConceptContent,
  purpose: Task['purpose'],
  exposed: readonly string[],
  excludeFamilies: readonly string[] = [],
): Task | null {
  return (
    content.tasks.find(
      (task) =>
        task.purpose === purpose &&
        !exposed.includes(task.id) &&
        !excludeFamilies.includes(task.family_id),
    ) ?? null
  );
}

function addDays(days: number): string {
  const due = new Date();
  due.setUTCDate(due.getUTCDate() + days);
  return due.toISOString().slice(0, 10);
}

function paginate<T>(items: T[], page?: PageRequest): Page<T> {
  const limit = page?.limit ?? 25;
  const offset = page?.cursor ? Number(page.cursor) : 0;
  const slice = items.slice(offset, offset + limit);
  return {
    items: slice,
    nextCursor: offset + limit < items.length ? String(offset + limit) : null,
  };
}

// ---------------------------------------------------------------------------
// The implementation
// ---------------------------------------------------------------------------

export const localApi: ApiClient = {
  async listWorkspaces(page) {
    seed();
    const items = [...store.workspaces.values()]
      .map((workspace) => ({
        ...workspace,
        sourceCount: [...store.sources.values()].filter(
          (source) => source.workspaceId === workspace.id,
        ).length,
        conceptCount: [...store.concepts.values()].filter(
          (concept) => concept.workspaceId === workspace.id,
        ).length,
        dueCount: [...store.concepts.values()].filter(
          (concept) =>
            concept.workspaceId === workspace.id &&
            projectConcept(concept).dueAt !== null &&
            projectConcept(concept).dueAt! <= new Date().toISOString().slice(0, 10),
        ).length,
      }))
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
    return paginate(items, page);
  },

  async getWorkspace(workspaceId) {
    const workspace = requireWorkspace(workspaceId);
    return {
      ...workspace,
      sourceCount: [...store.sources.values()].filter((s) => s.workspaceId === workspaceId)
        .length,
      conceptCount: [...store.concepts.values()].filter((c) => c.workspaceId === workspaceId)
        .length,
      dueCount: [...store.concepts.values()].filter((concept) => {
        if (concept.workspaceId !== workspaceId) return false;
        const due = projectConcept(concept).dueAt;
        return due !== null && due <= new Date().toISOString().slice(0, 10);
      }).length,
    };
  },

  async createWorkspace(input: CreateWorkspaceInput) {
    seed();
    const now = new Date().toISOString();
    const workspace: Workspace & { intent: string | null } = {
      id: `ws-${crypto.randomUUID().slice(0, 8)}`,
      name: input.name,
      intent: input.intent ?? null,
      sourceCount: 0,
      conceptCount: 0,
      dueCount: 0,
      createdAt: now,
      updatedAt: now,
    };
    store.workspaces.set(workspace.id, workspace);
    return workspace;
  },

  async updateWorkspace(workspaceId, input: UpdateWorkspaceInput) {
    const workspace = requireWorkspace(workspaceId);
    const next = {
      ...workspace,
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.intent !== undefined ? { intent: input.intent } : {}),
      updatedAt: new Date().toISOString(),
    };
    store.workspaces.set(workspaceId, next);
    return next;
  },

  async deleteWorkspace(workspaceId) {
    requireWorkspace(workspaceId);
    store.workspaces.delete(workspaceId);
    for (const [id, source] of store.sources) {
      if (source.workspaceId === workspaceId) store.sources.delete(id);
    }
    for (const [id, concept] of store.concepts) {
      if (concept.workspaceId === workspaceId) store.concepts.delete(id);
    }
  },

  async listSources(workspaceId, page) {
    requireWorkspace(workspaceId);
    return paginate(
      [...store.sources.values()]
        .filter((source) => source.workspaceId === workspaceId)
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
      page,
    );
  },

  async getSource(workspaceId, sourceId) {
    requireWorkspace(workspaceId);
    const source = store.sources.get(sourceId);
    if (!source || source.workspaceId !== workspaceId) {
      throw new ApiClientError('not_found', 'That source is not here.');
    }
    return source;
  },

  async getSourceChunks(workspaceId, sourceId, page) {
    requireWorkspace(workspaceId);
    return paginate(
      [...store.chunks.values()]
        .filter((chunk) => chunk.sourceId === sourceId)
        .sort((left, right) => left.ordinal - right.ordinal),
      page,
    );
  },

  async addSource(workspaceId, input: AddSourceInput) {
    requireWorkspace(workspaceId);

    const text = input.text ?? '';
    if (!text.trim()) {
      throw new ApiClientError('invalid_input', 'There is no text to add.', [
        { path: 'text', message: 'Paste the material you want to learn from.' },
      ]);
    }

    const source: Source & { text: string } = {
      id: `src-${crypto.randomUUID().slice(0, 8)}`,
      workspaceId,
      title: input.title,
      kind: input.kind,
      status: 'ingesting',
      chunkCount: null,
      characterCount: text.length,
      createdAt: new Date().toISOString(),
      text,
    };
    store.sources.set(source.id, source);

    // Chunked in the same shape the server uses, so the chunk list the UI
    // renders is the list a citation could point at.
    const pieces = text
      .split(/\n{2,}/)
      .map((piece) => piece.trim())
      .filter(Boolean);

    pieces.forEach((piece, ordinal) => {
      const id = `chunk-${source.id}-${ordinal}`;
      store.chunks.set(id, { id, sourceId: source.id, workspaceId, ordinal, text: piece });
    });

    const job: Job & { remaining: number } = {
      id: `job-${crypto.randomUUID().slice(0, 8)}`,
      workspaceId,
      kind: 'ingest-source',
      status: 'queued',
      stage: 'Reading your source',
      unitsDone: 0,
      // Deliberately null on the first poll: the server does not know the count
      // until it has read the text either, and GeneratingState renders the two
      // cases differently.
      unitsTotal: null,
      error: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      // Three polls. Enough that the generating state is visibly a state.
      remaining: 3,
    };
    store.jobs.set(job.id, job);
    (store.jobs.get(job.id) as { subjectId?: string }).subjectId = source.id;
    return job;
  },

  async deleteSource(workspaceId, sourceId) {
    requireWorkspace(workspaceId);
    store.sources.delete(sourceId);
    for (const [id, chunk] of store.chunks) {
      if (chunk.sourceId === sourceId) store.chunks.delete(id);
    }
  },

  async listConcepts(workspaceId) {
    requireWorkspace(workspaceId);
    return [...store.concepts.values()]
      .filter((concept) => concept.workspaceId === workspaceId)
      .map(projectConcept)
      .sort((left, right) => left.name.localeCompare(right.name));
  },

  async getConcept(workspaceId, conceptId) {
    return projectConcept(requireConcept(workspaceId, conceptId));
  },

  async extractConcepts(workspaceId) {
    requireWorkspace(workspaceId);
    const job: Job & { remaining: number } = {
      id: `job-${crypto.randomUUID().slice(0, 8)}`,
      workspaceId,
      kind: 'extract-concepts',
      status: 'queued',
      stage: 'Finding the concepts in it',
      unitsDone: 0,
      unitsTotal: null,
      error: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      remaining: 2,
    };
    store.jobs.set(job.id, job);
    return job;
  },

  async getConceptReadiness(workspaceId, conceptId) {
    const concept = requireConcept(workspaceId, conceptId);
    const blockers: Readiness['blockers'] = [];
    if (!concept.content) {
      blockers.push({
        code: 'no-concepts',
        message: 'No questions have been written for this concept yet.',
      });
    } else if (projectConcept(concept).itemsRemaining === 0) {
      blockers.push({ code: 'items-exhausted', message: FEEDBACK.bankExhausted });
    }
    return { ready: blockers.length === 0, blockers };
  },

  async startSession(workspaceId, conceptId) {
    requireConcept(workspaceId, conceptId);
    const content = requireContent(conceptId);

    const open = [...store.sessions.values()].find(
      (session) => session.conceptId === conceptId && !session.ended,
    );
    if (open) return projectSession(open);

    const exposed = exposedFor(conceptId);
    const first =
      nextItem(content, 'entry', exposed) ?? nextItem(content, 'probe', exposed);
    if (!first) throw new ApiClientError('item_bank_exhausted', FEEDBACK.bankExhausted);

    const session: LocalSession = {
      id: `sess-${crypto.randomUUID().slice(0, 8)}`,
      workspaceId,
      conceptId,
      stage: 'diagnose',
      version: 1,
      activeItemId: first.id,
      exposedItemIds: [...exposed, first.id],
      items: {
        [first.id]: { assistance: 'none', hintsUsed: 0, submitted: false, usedAsk: false },
      },
      teachingSeen: false,
      feedback: null,
      startedAt: new Date().toISOString(),
      ended: false,
    };
    store.sessions.set(session.id, session);
    return projectSession(session);
  },

  async getSession(workspaceId, sessionId) {
    requireWorkspace(workspaceId);
    const session = store.sessions.get(sessionId);
    if (!session) throw new ApiClientError('not_found', 'That session is not here.');
    return projectSession(session);
  },

  async advanceStage(workspaceId, sessionId, input: AdvanceStageInput) {
    requireWorkspace(workspaceId);
    const session = store.sessions.get(sessionId);
    if (!session) throw new ApiClientError('not_found', 'That session is not here.');
    if (session.version !== input.expectedVersion || session.stage !== input.expectedStage) {
      throw new ApiClientError('stale_request', 'This session moved on. Reload.');
    }
    session.stage = input.to;
    if (input.to === 'teach') session.teachingSeen = true;
    session.version += 1;
    return projectSession(session);
  },

  async requestHint(workspaceId, sessionId, input) {
    requireWorkspace(workspaceId);
    const session = store.sessions.get(sessionId);
    if (!session) throw new ApiClientError('not_found', 'That session is not here.');
    guard(session, input);

    const content = requireContent(session.conceptId);
    const task = content.tasks.find((candidate) => candidate.id === input.itemId)!;
    const current = progress(session, input.itemId);
    const hintsUsed = Math.min(current.hintsUsed + 1, task.hints.length);

    session.items[input.itemId] = {
      ...current,
      hintsUsed,
      assistance: hintsUsed > 0 ? raise(current.assistance, 'hinted') : current.assistance,
    };
    session.version += 1;
    return projectSession(session);
  },

  async revealAnswer(workspaceId, sessionId, input) {
    requireWorkspace(workspaceId);
    const session = store.sessions.get(sessionId);
    if (!session) throw new ApiClientError('not_found', 'That session is not here.');
    guard(session, input);

    const current = progress(session, input.itemId);
    session.items[input.itemId] = {
      ...current,
      assistance: raise(current.assistance, 'revealed'),
    };
    session.version += 1;
    return projectSession(session);
  },

  async submitResponse(workspaceId, sessionId, input: SubmitResponseInput) {
    requireWorkspace(workspaceId);
    const session = store.sessions.get(sessionId);
    if (!session) throw new ApiClientError('not_found', 'That session is not here.');
    // Idempotent, like the server — and checked BEFORE the stale guard, for
    // the same reason: a retry arrives after the original advanced the session
    // past that item, so guarding first would reject it as stale.
    if (store.attempts.some((attempt) => attempt.idempotencyKey === input.idempotencyKey)) {
      return projectSession(session);
    }

    guard(session, input);

    const content = requireContent(session.conceptId);
    const task = content.tasks.find((candidate) => candidate.id === input.itemId)!;
    const current = progress(session, input.itemId);

    const correct =
      task.response_mode === 'choice'
        ? input.response.trim() === task.correct_option_id
        : content.claims
            .filter((claim) => task.required_claim_ids.includes(claim.id))
            .every((claim) =>
              claim.acceptable_examples.some((example) =>
                input.response.toLowerCase().includes(example.toLowerCase()),
              ),
            );

    const countsAsIndependent = correct && current.assistance === 'none';

    store.attempts.push({
      id: crypto.randomUUID(),
      conceptId: session.conceptId,
      itemId: task.id,
      familyId: task.family_id,
      purpose: task.purpose,
      stage: session.stage,
      correct,
      assistance: current.assistance,
      countsAsIndependent,
      usedAsk: current.usedAsk,
      at: new Date().toISOString(),
      reviewDue: countsAsIndependent ? addDays(task.purpose === 'review' ? 14 : 7) : null,
      idempotencyKey: input.idempotencyKey,
    });

    session.items[input.itemId] = { ...current, submitted: true };

    // The same routing shape the server uses, reduced to the branches the demo
    // content can actually reach. It is not a different state machine.
    const exposed = exposedFor(session.conceptId);
    let follow: Task | null = null;
    if (!correct) {
      follow = nextItem(content, 'clarification', exposed) ?? nextItem(content, 'probe', exposed);
      session.feedback = { tone: 'revisit', text: FEEDBACK.contradicted };
      session.stage = follow ? 'teach' : 'summary';
    } else if (task.purpose === 'entry') {
      follow = nextItem(content, 'probe', exposed);
      session.feedback = { tone: 'good', text: FEEDBACK.entryUnderstood };
      session.stage = follow ? 'check' : 'summary';
    } else if (task.purpose === 'probe' || task.purpose === 'clarification') {
      follow = nextItem(content, 'practice', exposed);
      session.feedback = { tone: 'good', text: FEEDBACK.probeUnderstood };
      session.stage = follow ? 'practice' : 'summary';
    } else if (task.purpose === 'practice') {
      follow = nextItem(content, 'transfer', exposed);
      session.feedback = { tone: 'good', text: FEEDBACK.practiceDone };
      session.stage = follow ? 'check' : 'summary';
    } else {
      session.feedback = {
        tone: 'good',
        text: task.purpose === 'review' ? FEEDBACK.reviewComplete : FEEDBACK.transferComplete,
      };
      session.stage = 'summary';
    }

    if (follow) {
      session.activeItemId = follow.id;
      session.exposedItemIds.push(follow.id);
      session.items[follow.id] = {
        assistance: 'none',
        hintsUsed: 0,
        submitted: false,
        usedAsk: false,
      };
    } else {
      session.activeItemId = null;
      session.ended = true;
    }

    session.version += 1;
    return projectSession(session);
  },

  async endSession(workspaceId, sessionId) {
    requireWorkspace(workspaceId);
    const session = store.sessions.get(sessionId);
    if (!session) throw new ApiClientError('not_found', 'That session is not here.');
    session.stage = 'summary';
    session.activeItemId = null;
    session.ended = true;
    session.version += 1;
    return projectSession(session);
  },

  async ask(workspaceId, input: AskInput): Promise<AskResponse> {
    requireWorkspace(workspaceId);

    let recordedAsSupport = false;
    if (input.sessionId) {
      const session = store.sessions.get(input.sessionId);
      if (session?.activeItemId) {
        // Recorded BEFORE the answer is produced, exactly as the server does:
        // help that fails to arrive is still help that was asked for.
        const current = progress(session, session.activeItemId);
        session.items[session.activeItemId] = {
          ...current,
          usedAsk: true,
          assistance: raise(current.assistance, 'hinted'),
        };
        session.version += 1;
        recordedAsSupport = true;
      }
    }

    const words = input.question
      .toLowerCase()
      .match(/[a-z]{4,}/g)
      ?.filter((word) => word.length > 3) ?? [];

    const candidates = [...store.chunks.values()]
      .filter((chunk) => chunk.workspaceId === workspaceId)
      .map((chunk) => ({
        chunk,
        score: words.filter((word) => chunk.text.toLowerCase().includes(word)).length,
      }))
      .sort((left, right) => right.score - left.score);

    const best = candidates[0];
    if (!best || best.score === 0) {
      return {
        answer: ASK_NO_GROUNDING,
        citations: [],
        recordedAsSupport,
        refusedForLackOfGrounding: true,
      };
    }

    const sentence = best.chunk.text.split(/(?<=[.!?])\s+/)[0] ?? best.chunk.text;
    return {
      answer: sentence,
      citations: [
        {
          sourceId: best.chunk.sourceId,
          sourceTitle: store.sources.get(best.chunk.sourceId)?.title ?? 'Source',
          chunkId: best.chunk.id,
          quote: sentence,
        },
      ],
      recordedAsSupport,
      refusedForLackOfGrounding: false,
    };
  },

  async listDueReviews(workspaceId) {
    requireWorkspace(workspaceId);
    const today = new Date().toISOString().slice(0, 10);
    return [...store.concepts.values()]
      .filter((concept) => concept.workspaceId === workspaceId)
      .map(projectConcept)
      .filter((concept) => concept.dueAt !== null && concept.dueAt <= today);
  },

  async startReview(workspaceId, conceptId) {
    requireConcept(workspaceId, conceptId);
    const content = requireContent(conceptId);
    const exposed = exposedFor(conceptId);
    const seenFamilies = [...new Set(attemptsFor(conceptId).map((a) => a.familyId))];

    const item =
      nextItem(content, 'review', exposed, seenFamilies) ??
      nextItem(content, 'transfer', exposed, seenFamilies);
    if (!item) throw new ApiClientError('item_bank_exhausted', FEEDBACK.bankExhausted);

    const session: LocalSession = {
      id: `sess-${crypto.randomUUID().slice(0, 8)}`,
      workspaceId,
      conceptId,
      stage: 'review',
      version: 1,
      activeItemId: item.id,
      exposedItemIds: [...exposed, item.id],
      items: {
        [item.id]: { assistance: 'none', hintsUsed: 0, submitted: false, usedAsk: false },
      },
      teachingSeen: true,
      feedback: null,
      startedAt: new Date().toISOString(),
      ended: false,
    };
    store.sessions.set(session.id, session);
    return projectSession(session);
  },

  async getConceptEvidence(workspaceId, conceptId): Promise<ConceptEvidence> {
    const concept = projectConcept(requireConcept(workspaceId, conceptId));
    const attempts = attemptsFor(conceptId).map((attempt) => ({
      id: attempt.id,
      conceptId: attempt.conceptId,
      itemId: attempt.itemId,
      familyId: attempt.familyId,
      purpose: attempt.purpose,
      stage: attempt.stage,
      correct: attempt.correct,
      assistance: attempt.assistance,
      countsAsIndependent: attempt.countsAsIndependent,
      usedAsk: attempt.usedAsk,
      at: attempt.at,
      reviewDue: attempt.reviewDue,
    }));
    return {
      concept,
      attempts,
      earnedBy: attempts.find((attempt) => attempt.countsAsIndependent) ?? null,
    };
  },

  async getEvidenceSummary(workspaceId): Promise<EvidenceSummary> {
    requireWorkspace(workspaceId);
    const concepts = [...store.concepts.values()].filter(
      (concept) => concept.workspaceId === workspaceId,
    );
    const counts = {
      'not-checked': 0,
      practicing: 0,
      'independent-once': 0,
      'retained-on-review': 0,
    };
    let totalAttempts = 0;
    let independentAttempts = 0;
    let dueToday = 0;
    const today = new Date().toISOString().slice(0, 10);

    for (const concept of concepts) {
      counts[evidenceOf(concept.id)] += 1;
      const attempts = attemptsFor(concept.id);
      totalAttempts += attempts.length;
      independentAttempts += attempts.filter((a) => a.countsAsIndependent).length;
      const due = projectConcept(concept).dueAt;
      if (due && due <= today) dueToday += 1;
    }

    return { workspaceId, counts, totalAttempts, independentAttempts, dueToday };
  },

  async getStudyPlan(workspaceId): Promise<StudyPlan> {
    requireWorkspace(workspaceId);
    const today = new Date().toISOString().slice(0, 10);

    const entries: StudyPlan['entries'] = [];
    for (const concept of [...store.concepts.values()].filter(
      (candidate) => candidate.workspaceId === workspaceId,
    )) {
      const projected = projectConcept(concept);
      const state = projected.evidence;
      const due = projected.dueAt !== null && projected.dueAt <= today;

      if (due && state !== 'not-checked' && state !== 'practicing') {
        entries.push({
          conceptId: concept.id,
          conceptName: concept.name,
          action: 'review',
          reason:
            'Due today. You solved this unaided before; this asks a different question to see whether it held.',
          evidence: state,
          dueAt: projected.dueAt,
        });
        continue;
      }
      if (state === 'independent-once' || state === 'retained-on-review') continue;
      if (projected.itemsRemaining === 0) {
        entries.push({
          conceptId: concept.id,
          conceptName: concept.name,
          action: 'learn',
          reason: FEEDBACK.bankExhausted,
          evidence: state,
          dueAt: null,
        });
        continue;
      }
      entries.push({
        conceptId: concept.id,
        conceptName: concept.name,
        action: state === 'practicing' ? 'check' : 'learn',
        reason:
          state === 'practicing'
            ? 'Attempts recorded, none yet correct without help. A check is the next thing.'
            : 'Not started, and nothing it depends on is outstanding.',
        evidence: state,
        dueAt: null,
      });
    }

    return {
      workspaceId,
      generatedAt: new Date().toISOString(),
      entries,
      allCaughtUp: entries.length === 0,
    };
  },

  async getJob(workspaceId, jobId) {
    requireWorkspace(workspaceId);
    const job = store.jobs.get(jobId);
    if (!job) throw new ApiClientError('not_found', 'That job is not here.');

    // A poll advances it, exactly as the real one does.
    if (job.status !== 'succeeded' && job.status !== 'failed') {
      job.remaining -= 1;
      job.status = 'running';
      job.unitsTotal ??= 3;
      job.unitsDone = Math.min(job.unitsTotal, job.unitsDone + 1);
      job.updatedAt = new Date().toISOString();

      if (job.remaining <= 0) {
        job.status = 'succeeded';
        job.stage = 'Done';
        job.unitsDone = job.unitsTotal;

        if (job.kind === 'ingest-source') {
          const sourceId = (job as { subjectId?: string }).subjectId;
          const source = sourceId ? store.sources.get(sourceId) : undefined;
          if (source) {
            source.status = 'ready';
            source.chunkCount = [...store.chunks.values()].filter(
              (chunk) => chunk.sourceId === source.id,
            ).length;
          }
        }
      }
    }

    const { remaining: _remaining, ...projected } = job;
    return projected;
  },

  async listJobs(workspaceId) {
    requireWorkspace(workspaceId);
    return [...store.jobs.values()]
      .filter((job) => job.workspaceId === workspaceId)
      .map(({ remaining: _remaining, ...job }) => job);
  },
};
