import { beforeEach, describe, expect, it } from 'vitest';

import { ApiClientError } from '../../src/shared/contract.ts';
import { fakeApi, reset } from '../../src/client/api/fake.ts';

const WORKSPACE = 'ws-demo';
const CONCEPT = 'con-demo-elasticity';

/**
 * The fake is a test fixture and a demo surface, so it gets tested like code.
 *
 * The cases below are all the ones that would let it drift *more capable than a
 * real API* — which is the failure that makes the UI un-buildable, because the
 * design is then aimed at a server nobody can write.
 */
describe('the fake API', () => {
  beforeEach(() => reset());

  it('seeds a workspace with a ready source and its passages', async () => {
    const workspaces = await fakeApi.listWorkspaces();
    expect(workspaces.items).toHaveLength(1);

    const sources = await fakeApi.listSources(WORKSPACE);
    expect(sources.items[0]!.status).toBe('ready');
    expect(sources.items[0]!.chunkCount).toBeGreaterThan(0);

    const chunks = await fakeApi.getSourceChunks(WORKSPACE, sources.items[0]!.id);
    expect(chunks.items.length).toBeGreaterThan(1);
  });

  it('returns a job from addSource rather than a ready source', async () => {
    // Chunking is stepped on the server. A fake that returned a ready source
    // would let the UI be designed against an API nobody can build.
    const job = await fakeApi.addSource(WORKSPACE, {
      title: 'Notes',
      kind: 'pasted',
      text: 'One paragraph.\n\nAnother paragraph.',
    });
    expect(job.status).toBe('queued');
    expect(job.unitsTotal).toBeNull();

    let current = job;
    for (let poll = 0; poll < 5 && current.status !== 'succeeded'; poll += 1) {
      current = await fakeApi.getJob(WORKSPACE, job.id);
    }
    expect(current.status).toBe('succeeded');
    expect(current.unitsTotal).not.toBeNull();
  });

  it('never sends an answer key to the browser', async () => {
    const session = await fakeApi.startSession(WORKSPACE, CONCEPT);
    expect(session.item).not.toBeNull();
    expect(session.item).not.toHaveProperty('correct_option_id');
    expect(session.item).not.toHaveProperty('answer_explanation');
    expect(session.revealedAnswer).toBeNull();
  });

  it('keeps assistance monotonic', async () => {
    const session = await fakeApi.startSession(WORKSPACE, CONCEPT);
    const command = {
      itemId: session.item!.id,
      expectedStage: session.stage,
      expectedVersion: session.version,
    };

    const hinted = await fakeApi.requestHint(WORKSPACE, session.id, command);
    expect(hinted.assistance).toBe('hinted');

    const revealed = await fakeApi.revealAnswer(WORKSPACE, session.id, {
      ...command,
      expectedVersion: hinted.version,
    });
    expect(revealed.assistance).toBe('revealed');
    expect(revealed.revealedAnswer).not.toBeNull();

    // A hint after a reveal does not take anything back.
    const again = await fakeApi.requestHint(WORKSPACE, session.id, {
      ...command,
      expectedVersion: revealed.version,
    });
    expect(again.assistance).toBe('revealed');
  });

  it('rejects a command built against a stale version', async () => {
    const session = await fakeApi.startSession(WORKSPACE, CONCEPT);
    const command = {
      itemId: session.item!.id,
      expectedStage: session.stage,
      expectedVersion: session.version,
    };
    await fakeApi.requestHint(WORKSPACE, session.id, command);

    await expect(fakeApi.requestHint(WORKSPACE, session.id, command)).rejects.toMatchObject({
      code: 'stale_request',
    });
  });

  it('rejects a command naming an item that is no longer active', async () => {
    const session = await fakeApi.startSession(WORKSPACE, CONCEPT);
    await expect(
      fakeApi.requestHint(WORKSPACE, session.id, {
        itemId: 'some-other-item',
        expectedStage: session.stage,
        expectedVersion: session.version,
      }),
    ).rejects.toMatchObject({ code: 'stale_request' });
  });

  it('records a revealed-then-correct answer as not independent', async () => {
    const session = await fakeApi.startSession(WORKSPACE, CONCEPT);
    const revealed = await fakeApi.revealAnswer(WORKSPACE, session.id, {
      itemId: session.item!.id,
      expectedStage: session.stage,
      expectedVersion: session.version,
    });

    await fakeApi.submitResponse(WORKSPACE, session.id, {
      itemId: revealed.item!.id,
      expectedStage: revealed.stage,
      expectedVersion: revealed.version,
      response: 'revenue falls because they can go elsewhere',
      idempotencyKey: 'key-one-two-three',
    });

    const evidence = await fakeApi.getConceptEvidence(WORKSPACE, CONCEPT);
    expect(evidence.attempts[0]!.assistance).toBe('revealed');
    expect(evidence.attempts[0]!.countsAsIndependent).toBe(false);
    expect(evidence.concept.evidence).toBe('practicing');
  });

  it('records a correct unaided answer as independent', async () => {
    const session = await fakeApi.startSession(WORKSPACE, CONCEPT);
    await fakeApi.submitResponse(WORKSPACE, session.id, {
      itemId: session.item!.id,
      expectedStage: session.stage,
      expectedVersion: session.version,
      response: 'Because there are three cafes nearby, total revenue falls.',
      idempotencyKey: 'key-independent-1',
    });

    const evidence = await fakeApi.getConceptEvidence(WORKSPACE, CONCEPT);
    expect(evidence.attempts[0]!.countsAsIndependent).toBe(true);
    expect(evidence.concept.evidence).toBe('independent-once');
  });

  it('treats Ask during a session as help', async () => {
    const session = await fakeApi.startSession(WORKSPACE, CONCEPT);
    const response = await fakeApi.ask(WORKSPACE, {
      question: 'What does elastic demand mean for revenue?',
      sessionId: session.id,
    });
    expect(response.recordedAsSupport).toBe(true);

    const after = await fakeApi.getSession(WORKSPACE, session.id);
    expect(after.assistance).toBe('hinted');
  });

  it('refuses to answer what the sources do not cover', async () => {
    const response = await fakeApi.ask(WORKSPACE, {
      question: 'Explain mitochondrial respiration.',
      sessionId: null,
    });
    expect(response.refusedForLackOfGrounding).toBe(true);
    expect(response.citations).toHaveLength(0);
  });

  it('is idempotent on a replayed submission', async () => {
    const session = await fakeApi.startSession(WORKSPACE, CONCEPT);
    const input = {
      itemId: session.item!.id,
      expectedStage: session.stage,
      expectedVersion: session.version,
      response: 'revenue falls here',
      idempotencyKey: 'replayed-key-0001',
    };
    const first = await fakeApi.submitResponse(WORKSPACE, session.id, input);
    const replay = await fakeApi.submitResponse(WORKSPACE, session.id, {
      ...input,
      expectedVersion: first.version,
    });
    expect(replay.evidence).toBe(first.evidence);

    const evidence = await fakeApi.getConceptEvidence(WORKSPACE, CONCEPT);
    expect(evidence.attempts).toHaveLength(1);
  });

  it('reports a concept with no authored items honestly', async () => {
    const concept = await fakeApi.getConcept(WORKSPACE, 'con-demo-definition');
    expect(concept.itemsRemaining).toBe(0);

    const readiness = await fakeApi.getConceptReadiness(WORKSPACE, 'con-demo-definition');
    expect(readiness.ready).toBe(false);
    expect(readiness.blockers[0]!.code).toBe('no-concepts');
  });

  it('reports fixture mode rather than pretending AI is available', async () => {
    const quota = await fakeApi.getQuota();
    expect(quota.mode).toBe('fixture');
    expect(quota.available).toBe(false);
    expect(quota.unavailableReason).toBeTruthy();
  });

  it('cannot reach another workspace', async () => {
    await expect(fakeApi.listConcepts('ws-not-mine')).rejects.toBeInstanceOf(
      ApiClientError,
    );
  });
});
