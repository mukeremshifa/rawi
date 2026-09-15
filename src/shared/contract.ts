import { z } from 'zod';

/**
 * **The contract.** One interface of named methods, two implementations.
 *
 * ── Why an interface of named methods, and not `api.get<T>(path)` ─────────
 *
 * A verb-shaped seam (`api.get<T>('/concepts')`) takes a string and a
 * caller-asserted type parameter, so nothing can implement it *differently* in
 * a way TypeScript checks. A fake behind that seam has to parse URLs and guess
 * what `T` was meant to be, and drift between fake and real surfaces as a 404
 * at runtime rather than as a compile error.
 *
 * So this file declares `ApiClient` — named methods, typed arguments, typed
 * returns. `src/client/api/fake.ts` and `src/client/api/client.ts` are two
 * implementations of it, and the Worker serves exactly one route per method
 * (`scripts/check-routes.mjs` fails the build if that stops being true).
 * **Drift is a compile error**, which is the whole reason this file exists.
 *
 * ── The model, in one line ────────────────────────────────────────────────
 *
 * **The workspace is the only first-class citizen.** Sources, concepts, check
 * items, sessions and evidence belong to exactly one workspace and have no
 * existence outside it. Every workspace-scoped method therefore takes
 * `workspaceId` as its required first parameter — never optional, never
 * defaulted, never inferred from a heuristic. A surface that cannot name its
 * workspace is not a valid surface, and a defaulted scope is how an ownership
 * bug becomes silent.
 *
 * ── One Zod definition per concept ────────────────────────────────────────
 *
 * Each entity is defined once, here, and its TypeScript type is inferred from
 * the schema rather than declared beside it. The Worker parses requests with
 * these same schemas, so "what the client sends" and "what the server accepts"
 * cannot describe different shapes.
 *
 * ── What the server owns ──────────────────────────────────────────────────
 *
 * Invariant 7: correctness, assistance, evidence, scheduling and quota are
 * server decisions. Notice what this interface has **no method for**: setting
 * an evidence state, marking an attempt independent, choosing a review date,
 * or clearing assistance. The browser renders and requests; it never decides.
 */

// ---------------------------------------------------------------------------
// Errors — part of the contract, because the UI designs against them
// ---------------------------------------------------------------------------

/**
 * Every way a call in this interface can fail, as a closed union, so a surface
 * can `switch` on it and TypeScript will say when a new code has no handler.
 */
export const ApiErrorCode = z.enum([
  /** Signed out, or the token expired and could not be refreshed. */
  'unauthorized',
  /** Authenticated, but this is not yours. Deliberately distinct from `not_found`. */
  'forbidden',
  'not_found',
  /** The request body failed validation. `issues` carries the field-level messages. */
  'invalid_input',
  /** The monthly AI allowance — yours or the product's — is used up. */
  'quota_exceeded',
  /** The provider or the API is throttling. Retryable, after a wait. */
  'rate_limited',
  /** The source text exceeds what the model can be given. */
  'input_too_long',
  /** The model declined to answer. Not something a retry fixes. */
  'refused',
  /** The model or its transport failed. Retryable. */
  'provider_error',
  /**
   * The model returned something that did not survive validation — an invented
   * evidence quote, a wrong ID set. **Not a warning.** Invariant 11: a rejected
   * assessment affects no evidence at all.
   */
  'assessment_rejected',
  /**
   * The request named a check item that is no longer the active one, or a stage
   * the session has moved past. Two open tabs produce this; it is an expected
   * outcome, not a crash.
   */
  'stale_request',
  /**
   * Every authored item for this concept has been seen. **An honest terminal
   * state** (invariant 5), not an error the learner can retry away — the server
   * will not recycle a seen item as fresh.
   */
  'item_bank_exhausted',
  /** The network did not carry the request. Retryable. */
  'network',
  /** The route exists in this contract and not yet in the Worker. */
  'not_implemented',
  'internal',
]);
export type ApiErrorCode = z.infer<typeof ApiErrorCode>;

/**
 * The error every method in this interface rejects with.
 *
 * A class rather than a plain object, so `instanceof` works at a catch site
 * that may also see a `TypeError` from a broken fetch.
 */
export class ApiClientError extends Error {
  constructor(
    readonly code: ApiErrorCode,
    message: string,
    /** Field-level messages from a server-side Zod parse, if any. */
    readonly issues?: { path: string; message: string }[],
    /** The HTTP status, where there was one. Absent for fake-injected errors. */
    readonly status?: number,
  ) {
    super(message);
    this.name = 'ApiClientError';
  }
}

export const ApiErrorBody = z.object({
  code: ApiErrorCode,
  message: z.string(),
  issues: z.array(z.object({ path: z.string(), message: z.string() })).optional(),
});
export type ApiErrorBody = z.infer<typeof ApiErrorBody>;

// ---------------------------------------------------------------------------
// Paging
// ---------------------------------------------------------------------------

export const PageRequest = z.object({
  cursor: z.string().nullable().optional(),
  limit: z.number().int().min(1).max(100).optional(),
});
export type PageRequest = z.infer<typeof PageRequest>;

/** A page of anything. `nextCursor === null` means this is the last page. */
export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

// ---------------------------------------------------------------------------
// The learning vocabulary — the nouns that make Rawi not a flashcard app
// ---------------------------------------------------------------------------

/**
 * What the server is willing to say about a concept, derived **only** from the
 * append-only attempt log.
 *
 *   not-checked          nothing has been asked yet
 *   practicing           attempts exist; none was both correct and unaided
 *   independent-once     one correct, unaided answer on a check item
 *   retained-on-review   a later, different item from another family, also
 *                        correct and unaided
 *
 * Invariant 6: this is the whole vocabulary. There is no number, no percentage
 * and no model confidence score anywhere near it.
 */
export const EvidenceState = z.enum([
  'not-checked',
  'practicing',
  'independent-once',
  'retained-on-review',
]);
export type EvidenceState = z.infer<typeof EvidenceState>;

/**
 * How much help was in force on an item when it was answered.
 *
 * Invariant 1: this only ever climbs — `none -> hinted -> revealed`. Not by
 * reload, not by a second tab, not by a mode switch. Invariant 2: anything
 * above `none` means the answer is not independent evidence, **and using Ask
 * during a check raises it to `hinted`.**
 */
export const AssistanceLevel = z.enum(['none', 'hinted', 'revealed']);
export type AssistanceLevel = z.infer<typeof AssistanceLevel>;

/**
 * Why an item is being asked. Carried over from the Concept Bridge router,
 * where it is already subject-agnostic.
 */
export const ItemPurpose = z.enum([
  'entry',
  'probe',
  'clarification',
  'practice',
  'transfer',
  'review',
]);
export type ItemPurpose = z.infer<typeof ItemPurpose>;

/** Where a session is. The stage the learner is *in*, not a progress bar. */
export const SessionStage = z.enum([
  'diagnose',
  'teach',
  'practice',
  'check',
  'review',
  'summary',
]);
export type SessionStage = z.infer<typeof SessionStage>;

// ---------------------------------------------------------------------------
// Entities
// ---------------------------------------------------------------------------

export const Workspace = z.object({
  id: z.string(),
  name: z.string(),
  /** One line the learner wrote about what they are trying to understand. */
  intent: z.string().nullable(),
  sourceCount: z.number().int().min(0),
  conceptCount: z.number().int().min(0),
  /** Concepts whose next review is due today or earlier. A count, not a score. */
  dueCount: z.number().int().min(0),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Workspace = z.infer<typeof Workspace>;

export const CreateWorkspaceInput = z.object({
  name: z.string().min(1).max(120),
  intent: z.string().max(500).nullable().optional(),
});
export type CreateWorkspaceInput = z.infer<typeof CreateWorkspaceInput>;

export const UpdateWorkspaceInput = z.object({
  name: z.string().min(1).max(120).optional(),
  intent: z.string().max(500).nullable().optional(),
});
export type UpdateWorkspaceInput = z.infer<typeof UpdateWorkspaceInput>;

export const SourceKind = z.enum(['pasted', 'upload']);
export type SourceKind = z.infer<typeof SourceKind>;

export const SourceStatus = z.enum(['ingesting', 'ready', 'failed']);
export type SourceStatus = z.infer<typeof SourceStatus>;

export const Source = z.object({
  id: z.string(),
  workspaceId: z.string(),
  title: z.string(),
  kind: SourceKind,
  status: SourceStatus,
  /**
   * How many chunks this source was split into. `null` while ingesting —
   * **not 0**, because "we have not counted yet" and "it has no content" are
   * different facts and only one of them is alarming.
   */
  chunkCount: z.number().int().min(0).nullable(),
  characterCount: z.number().int().min(0),
  createdAt: z.string(),
});
export type Source = z.infer<typeof Source>;

/** One retrievable span of a source. The unit a citation points at. */
export const SourceChunk = z.object({
  id: z.string(),
  sourceId: z.string(),
  ordinal: z.number().int().min(0),
  text: z.string(),
});
export type SourceChunk = z.infer<typeof SourceChunk>;

export const AddSourceInput = z.object({
  title: z.string().min(1).max(160),
  kind: SourceKind,
  /** Present for `pasted`. For `upload`, the text comes from `uploadPath`. */
  text: z.string().max(200_000).optional(),
  /** The storage path returned by `requestUpload`. Present for `upload`. */
  uploadPath: z.string().optional(),
});
export type AddSourceInput = z.infer<typeof AddSourceInput>;

export const UploadRequest = z.object({
  filename: z.string().min(1).max(200),
  /** v1 accepts `.txt` and `.md` only. No PDF, no OCR. */
  contentType: z.enum(['text/plain', 'text/markdown']),
  byteSize: z.number().int().min(1).max(5_000_000),
});
export type UploadRequest = z.infer<typeof UploadRequest>;

export const UploadTicket = z.object({
  /** A signed, single-use URL into the private `sources` bucket. */
  uploadUrl: z.string(),
  /** Hand this back to `addSource` as `uploadPath`. */
  path: z.string(),
  expiresAt: z.string(),
});
export type UploadTicket = z.infer<typeof UploadTicket>;

export const Concept = z.object({
  id: z.string(),
  workspaceId: z.string(),
  name: z.string(),
  /** One or two sentences, grounded in the sources below. */
  summary: z.string(),
  evidence: EvidenceState,
  /** Concepts this one is built on. Ordering the map, not gating it. */
  prerequisiteIds: z.array(z.string()),
  /** The sources this concept was extracted from. Every claim cites one. */
  sourceIds: z.array(z.string()),
  /** When the last attempt on this concept was recorded. */
  lastAttemptAt: z.string().nullable(),
  /**
   * When a delayed re-check is due, anchored to the attempt that earned it.
   * Invariant 4: reading this on a later day does not move it.
   */
  dueAt: z.string().nullable(),
  /** How many authored items remain unseen. `0` is the honest terminal state. */
  itemsRemaining: z.number().int().min(0),
});
export type Concept = z.infer<typeof Concept>;

/**
 * One thing the learner is asked to do.
 *
 * **`familyId` is the field the delayed re-check depends on.** Two items in the
 * same family are the same question wearing different clothes; a re-check must
 * ask a *different* family or it is testing recall of an answer rather than
 * understanding of a concept.
 *
 * Notice what is absent: **there is no correct answer on this type.** The
 * server never sends one to the browser before it has been earned
 * (invariant 9), and `scripts/check-bundle-secrets.mjs` greps `dist/` to make
 * sure no fixture answer sneaks in either.
 */
export const CheckItem = z.object({
  id: z.string(),
  conceptId: z.string(),
  familyId: z.string(),
  purpose: ItemPurpose,
  prompt: z.string(),
  /** Free text, or a fixed set of choices. */
  responseMode: z.enum(['text', 'choice']),
  /** Present when `responseMode` is `choice`. Order is server-decided. */
  options: z.array(z.object({ id: z.string(), text: z.string() })).nullable(),
  /** How many hints exist. The text of one arrives only when asked for. */
  hintCount: z.number().int().min(0),
});
export type CheckItem = z.infer<typeof CheckItem>;

/**
 * One row of the append-only log. Immutable once written (invariant 4),
 * including `reviewDue` — which is why it is stored rather than recomputed.
 */
export const Attempt = z.object({
  id: z.string(),
  conceptId: z.string(),
  itemId: z.string(),
  familyId: z.string(),
  purpose: ItemPurpose,
  stage: SessionStage,
  correct: z.boolean(),
  /** What was in force **at submission**, not what the learner did after. */
  assistance: AssistanceLevel,
  /** Invariant 2: `correct && assistance === 'none'`. Nothing else. */
  countsAsIndependent: z.boolean(),
  /** Set when the learner used Ask on this item. Ask during a check is help. */
  usedAsk: z.boolean(),
  at: z.string(),
  /** Anchored here, at the moment of the attempt. `null` when none was earned. */
  reviewDue: z.string().nullable(),
});
export type Attempt = z.infer<typeof Attempt>;

/**
 * The live state of a teaching session, as the browser is allowed to see it.
 *
 * The server holds more than this — the active item's correct answer, the full
 * hint list, the routing history. This is the projection, and the omissions are
 * the point.
 */
export const Session = z.object({
  id: z.string(),
  workspaceId: z.string(),
  conceptId: z.string(),
  stage: SessionStage,
  /** Optimistic-concurrency guard. Send it back on every command. */
  version: z.number().int().min(1),
  /** `null` at `teach` and `summary`, where there is nothing to answer. */
  item: CheckItem.nullable(),
  /** Assistance in force on `item`. Monotonic (invariant 1). */
  assistance: AssistanceLevel,
  /** Hints already handed out for `item`, in order. */
  hints: z.array(z.string()),
  /** The revealed answer, present only once it has actually been revealed. */
  revealedAnswer: z.string().nullable(),
  /** The teaching text for this concept, grounded in the workspace's sources. */
  teaching: z
    .object({
      text: z.string(),
      citations: z.array(z.object({ sourceId: z.string(), chunkId: z.string() })),
    })
    .nullable(),
  /** What the server said about the last submission. Never a score. */
  feedback: z
    .object({
      tone: z.enum(['good', 'uncertain', 'revisit']),
      text: z.string(),
    })
    .nullable(),
  /** The evidence state as of this session's last recorded attempt. */
  evidence: EvidenceState,
  /**
   * True when every authored item for this concept has been seen. Invariant 5:
   * the session ends honestly rather than re-serving something.
   */
  itemBankExhausted: z.boolean(),
  startedAt: z.string(),
});
export type Session = z.infer<typeof Session>;

/** Every command that mutates a session carries the item and stage it meant. */
export const SessionCommandInput = z.object({
  /**
   * The item the learner was actually looking at. Invariant 3 and the
   * stale-request guard both live here: a command naming a replaced item is
   * rejected, not applied to whatever happens to be active now.
   */
  itemId: z.string(),
  /** Where the client thought the session was. Mismatch is `stale_request`. */
  expectedStage: SessionStage,
  /** The session version the client last saw. Mismatch is `stale_request`. */
  expectedVersion: z.number().int().min(1),
});
export type SessionCommandInput = z.infer<typeof SessionCommandInput>;

export const SubmitResponseInput = SessionCommandInput.extend({
  /** Free text, or the chosen option's id for a `choice` item. */
  response: z.string().min(1).max(4000),
  /**
   * Makes a retried submission idempotent. Replaying a key returns exactly the
   * attempt that was originally recorded, not a second one.
   */
  idempotencyKey: z.string().min(8).max(100),
});
export type SubmitResponseInput = z.infer<typeof SubmitResponseInput>;

export const AdvanceStageInput = z.object({
  to: SessionStage,
  expectedStage: SessionStage,
  expectedVersion: z.number().int().min(1),
});
export type AdvanceStageInput = z.infer<typeof AdvanceStageInput>;

/** A grounded answer. Every sentence of it is traceable to a chunk. */
export const AskResponse = z.object({
  answer: z.string(),
  citations: z.array(
    z.object({
      sourceId: z.string(),
      sourceTitle: z.string(),
      chunkId: z.string(),
      quote: z.string(),
    }),
  ),
  /**
   * True when this question was asked during an active check, in which case the
   * server has already raised that item's assistance to `hinted`. The UI says
   * so **before** the question is sent, and this is the confirmation that it
   * happened — not the first the learner hears of it.
   */
  recordedAsSupport: z.boolean(),
  /** No grounded answer was available. The model is not asked to improvise. */
  refusedForLackOfGrounding: z.boolean(),
});
export type AskResponse = z.infer<typeof AskResponse>;

export const AskInput = z.object({
  question: z.string().min(1).max(2000),
  /** Present when asked from inside a session. This is what makes it support. */
  sessionId: z.string().nullable().optional(),
});
export type AskInput = z.infer<typeof AskInput>;

/** What a concept's evidence view shows: what you did, unaided or not, when. */
export const ConceptEvidence = z.object({
  concept: Concept,
  attempts: z.array(Attempt),
  /** The attempt that earned the current state, if any. */
  earnedBy: Attempt.nullable(),
});
export type ConceptEvidence = z.infer<typeof ConceptEvidence>;

/** Counts, not scores. Each number is a row count you could go and verify. */
export const EvidenceSummary = z.object({
  workspaceId: z.string(),
  counts: z.object({
    'not-checked': z.number().int().min(0),
    practicing: z.number().int().min(0),
    'independent-once': z.number().int().min(0),
    'retained-on-review': z.number().int().min(0),
  }),
  totalAttempts: z.number().int().min(0),
  independentAttempts: z.number().int().min(0),
  dueToday: z.number().int().min(0),
});
export type EvidenceSummary = z.infer<typeof EvidenceSummary>;

/**
 * What to do next, and **why** — the reason is not decoration. A plan that
 * cannot say why it chose something is a plan the learner has to trust blindly.
 */
export const PlanEntry = z.object({
  conceptId: z.string(),
  conceptName: z.string(),
  action: z.enum(['learn', 'practice', 'check', 'review']),
  /** A sentence the server can defend from the log. */
  reason: z.string(),
  evidence: EvidenceState,
  dueAt: z.string().nullable(),
});
export type PlanEntry = z.infer<typeof PlanEntry>;

export const StudyPlan = z.object({
  workspaceId: z.string(),
  generatedAt: z.string(),
  entries: z.array(PlanEntry),
  /** Nothing to do right now, and that is a healthy state, not an empty one. */
  allCaughtUp: z.boolean(),
});
export type StudyPlan = z.infer<typeof StudyPlan>;

export const JobKind = z.enum(['ingest-source', 'extract-concepts']);
export type JobKind = z.infer<typeof JobKind>;

export const JobStatus = z.enum(['queued', 'running', 'succeeded', 'failed']);
export type JobStatus = z.infer<typeof JobStatus>;

/**
 * A bounded, stepped, client-polled unit of work.
 *
 * Each Worker invocation advances **one step** and returns; the client polls
 * `getJob`. No Queues and no Durable Objects — both add cost or complexity for
 * nothing this workload needs.
 */
export const Job = z.object({
  id: z.string(),
  workspaceId: z.string(),
  kind: JobKind,
  status: JobStatus,
  /** A human sentence: "Reading your document", not "step 3". */
  stage: z.string(),
  unitsDone: z.number().int().min(0),
  /** `null` until the total is actually known. See `GeneratingState`. */
  unitsTotal: z.number().int().min(0).nullable(),
  error: z.object({ code: ApiErrorCode, message: z.string() }).nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Job = z.infer<typeof Job>;

export const Profile = z.object({
  userId: z.string(),
  email: z.string().nullable(),
  timezone: z.string(),
  /**
   * Whether the invite gate is closed **and** this account is not through it.
   * The gate is a flag now, off by default; the mechanism stays available.
   */
  awaitingInvite: z.boolean(),
});
export type Profile = z.infer<typeof Profile>;

/**
 * Whether paid AI is available, and honestly why not when it is not.
 *
 * Fail-closed: without a provider credential **and** both caps, `mode` is
 * `fixture` and the app says so rather than pretending to be thinking.
 */
export const Quota = z.object({
  mode: z.enum(['fixture', 'live']),
  /** Cents, not dollars, because money is an integer. `null` in fixture mode. */
  monthlyCapCents: z.number().int().min(0).nullable(),
  userCapCents: z.number().int().min(0).nullable(),
  userSpentCents: z.number().int().min(0),
  /**
   * Calls that may have charged but whose outcome is unknown. Invariant 10:
   * never assumed free, and surfaced rather than buried.
   */
  ambiguousCalls: z.number().int().min(0),
  available: z.boolean(),
  unavailableReason: z.string().nullable(),
});
export type Quota = z.infer<typeof Quota>;

/**
 * Whether a concept is ready to be *checked* — kept from the donor contract
 * because the idea generalises: a surface that offers an action the server will
 * refuse is a surface that lies.
 */
export const Readiness = z.object({
  ready: z.boolean(),
  /** What is missing, in the order it should be fixed. */
  blockers: z.array(
    z.object({
      code: z.enum([
        'no-sources',
        'no-concepts',
        'not-taught',
        'items-exhausted',
        'quota-exceeded',
      ]),
      message: z.string(),
    }),
  ),
});
export type Readiness = z.infer<typeof Readiness>;

// ---------------------------------------------------------------------------
// The interface
// ---------------------------------------------------------------------------

/**
 * Every route the Worker serves, and every method the fake implements.
 *
 * `scripts/check-routes.mjs` parses the method names below and the `op` field
 * of the Worker's route table, and fails if the two sets differ. A method added
 * here without a route is caught on the commit that creates it, not at deploy.
 */
export interface ApiClient {
  // ── Account ─────────────────────────────────────────────────────────────
  getProfile(timezone: string): Promise<Profile>;
  getQuota(): Promise<Quota>;

  // ── Workspaces ──────────────────────────────────────────────────────────
  listWorkspaces(page?: PageRequest): Promise<Page<Workspace>>;
  getWorkspace(workspaceId: string): Promise<Workspace>;
  createWorkspace(input: CreateWorkspaceInput): Promise<Workspace>;
  updateWorkspace(workspaceId: string, input: UpdateWorkspaceInput): Promise<Workspace>;
  deleteWorkspace(workspaceId: string): Promise<void>;

  // ── Sources ─────────────────────────────────────────────────────────────
  listSources(workspaceId: string, page?: PageRequest): Promise<Page<Source>>;
  getSource(workspaceId: string, sourceId: string): Promise<Source>;
  getSourceChunks(
    workspaceId: string,
    sourceId: string,
    page?: PageRequest,
  ): Promise<Page<SourceChunk>>;
  requestUpload(workspaceId: string, input: UploadRequest): Promise<UploadTicket>;
  /** Returns a job: chunking is stepped, so this cannot be synchronous. */
  addSource(workspaceId: string, input: AddSourceInput): Promise<Job>;
  deleteSource(workspaceId: string, sourceId: string): Promise<void>;

  // ── Concepts ────────────────────────────────────────────────────────────
  listConcepts(workspaceId: string): Promise<Concept[]>;
  getConcept(workspaceId: string, conceptId: string): Promise<Concept>;
  extractConcepts(workspaceId: string): Promise<Job>;
  getConceptReadiness(workspaceId: string, conceptId: string): Promise<Readiness>;

  // ── The teaching session ────────────────────────────────────────────────
  startSession(workspaceId: string, conceptId: string): Promise<Session>;
  getSession(workspaceId: string, sessionId: string): Promise<Session>;
  advanceStage(
    workspaceId: string,
    sessionId: string,
    input: AdvanceStageInput,
  ): Promise<Session>;
  requestHint(
    workspaceId: string,
    sessionId: string,
    input: SessionCommandInput,
  ): Promise<Session>;
  revealAnswer(
    workspaceId: string,
    sessionId: string,
    input: SessionCommandInput,
  ): Promise<Session>;
  submitResponse(
    workspaceId: string,
    sessionId: string,
    input: SubmitResponseInput,
  ): Promise<Session>;
  endSession(workspaceId: string, sessionId: string): Promise<Session>;

  // ── Ask ─────────────────────────────────────────────────────────────────
  ask(workspaceId: string, input: AskInput): Promise<AskResponse>;

  // ── Delayed re-check ────────────────────────────────────────────────────
  listDueReviews(workspaceId: string): Promise<Concept[]>;
  startReview(workspaceId: string, conceptId: string): Promise<Session>;

  // ── Evidence ────────────────────────────────────────────────────────────
  getConceptEvidence(workspaceId: string, conceptId: string): Promise<ConceptEvidence>;
  getEvidenceSummary(workspaceId: string): Promise<EvidenceSummary>;

  // ── Plan ────────────────────────────────────────────────────────────────
  getStudyPlan(workspaceId: string): Promise<StudyPlan>;

  // ── Jobs ────────────────────────────────────────────────────────────────
  getJob(workspaceId: string, jobId: string): Promise<Job>;
  listJobs(workspaceId: string): Promise<Job[]>;
}
