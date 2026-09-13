/**
 * Browser acceptance harness for R02B.
 *
 * A fetch-based in-process harness that exercises the critical paths against
 * the actual Hono application (same as running in the Worker). This is NOT a
 * real browser test — it does not exercise keyboard navigation, screen readers,
 * narrow layouts, focus management, or actual UAE-network conditions. Those
 * require a real browser run and are documented as open in STATUS.md.
 *
 * What this harness DOES verify:
 *  1. Independent completion: full diagnose → learn → practice → check path,
 *     correct unaided, evidence promoted to independent-once.
 *  2. Check → help → replacement: convert primary check, get bank item, submit
 *     it correctly, evidence promoted.
 *  3. Refresh: GET after writes returns the same evidence.
 *  4. Retry after 409: stale item request rejected, fresh state returned.
 *  5. Session expiry: GET on a deleted session returns 404.
 *  6. Exhaustion: convert all bank items, honest exhaustion state.
 *  7. Wrong-unaided label: wrong answer with no help has assistance 'none' and
 *     countsAsIndependent false.
 *  8. Answer-key absence: no correctOptionId or answerExplanation in any
 *     response from the check or convert routes.
 *
 * Run with: npx tsx src/acceptance/harness.ts
 * Or as part of CI: add to package.json scripts after npm run build.
 *
 * Not emulation: no actual browser is opened; no real device or UAE network.
 * Keyboard-only and screen-reader verification remain open.
 */
import app, { clearSessions } from '../server/index.js';
import { demoLesson } from '../content/demo-lesson.js';
import type { SessionView, Stage } from '../shared/types.js';

const ENV = { RAWI_TUTOR_MODE: 'fixture' };

// ─── HTTP helpers ─────────────────────────────────────────────────────────────

async function call(
  path: string,
  init?: RequestInit,
): Promise<{ status: number; body: unknown }> {
  const res = await app.fetch(new Request(`http://localhost${path}`, init), ENV);
  const body = await res.json().catch(() => undefined);
  return { status: res.status, body };
}

function post(path: string, payload?: unknown) {
  return call(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: payload !== undefined ? JSON.stringify(payload) : undefined,
  });
}

async function newSession(): Promise<SessionView> {
  const { body, status } = await post('/api/sessions');
  assert(status === 201, `start session: expected 201, got ${status}`);
  return body as SessionView;
}

async function advanceTo(id: string, stage: Stage): Promise<SessionView> {
  const steps: Record<Stage, readonly Stage[]> = {
    diagnose: [],
    learn: ['learn'],
    practice: ['learn', 'practice'],
    check: ['learn', 'practice', 'check'],
    summary: ['learn', 'practice', 'check', 'summary'],
  };
  let view: SessionView | undefined;
  for (const step of steps[stage]) {
    const { status, body } = await post(`/api/sessions/${id}/stage`, { stage: step });
    assert(status === 200, `advance to ${step}: expected 200, got ${status}`);
    view = body as SessionView;
  }
  if (!view) {
    const { body } = await call(`/api/sessions/${id}`);
    view = body as SessionView;
  }
  return view!;
}

// ─── Assertion helpers ────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function test(name: string, fn: () => Promise<void>) {
  try {
    clearSessions();
    await fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${(err as Error).message}`);
    failed++;
  }
}

function assertNoAnswerKeys(body: unknown, context: string) {
  const s = JSON.stringify(body);
  // correctOptionId must never appear in a client-facing response.
  assert(!s.includes('correctOptionId'), `${context}: correctOptionId in response`);
  // The raw answerExplanation key must never appear — it may appear as
  // revealedAnswer after grading, but the field name itself (which only exists
  // in the server-side AuthoredQuestion) must not leak into the public contract.
  assert(!s.includes('"answerExplanation"'), `${context}: answerExplanation field name in response`);
}

// ─── Path 1: Independent completion ──────────────────────────────────────────

await test('path 1: independent completion promotes evidence to independent-once', async () => {
  const session = await newSession();
  const id = session.sessionId;

  // Diagnose — answer wrongly to trigger learn.
  const wrong = demoLesson.diagnostic.options.find(
    (o) => o.id !== demoLesson.diagnostic.correctOptionId,
  )!;
  const diagRes = await post(`/api/sessions/${id}/attempt`, {
    stage: 'diagnose',
    optionId: wrong.id,
  });
  assert(diagRes.status === 200, `diagnose attempt: ${diagRes.status}`);

  // Learn.
  await advanceTo(id, 'learn');

  // Practice — use a hint (assisted, by design).
  await post(`/api/sessions/${id}/stage`, { stage: 'practice' });
  await post(`/api/sessions/${id}/hint`, { stage: 'practice' });
  const practiceRes = await post(`/api/sessions/${id}/attempt`, {
    stage: 'practice',
    optionId: demoLesson.practice.correctOptionId,
  });
  const practice = practiceRes.body as SessionView;
  assert(practice.lastResult?.countsAsIndependent === false, 'practice hinted: not independent');

  // Check — no help, correct.
  await post(`/api/sessions/${id}/stage`, { stage: 'check' });
  const checkView = (await call(`/api/sessions/${id}`)).body as SessionView;
  const checkItemId = checkView.activeCheckId!;
  const checkItem = [demoLesson.check, ...demoLesson.checkBank].find(q => q.id === checkItemId)!;

  const checkRes = await post(`/api/sessions/${id}/attempt`, {
    stage: 'check',
    optionId: checkItem.correctOptionId,
    itemId: checkItemId,
  });
  const checked = checkRes.body as SessionView;
  assert(checkRes.status === 200, `check attempt: ${checkRes.status}`);
  assert(checked.lastResult?.countsAsIndependent === true, 'check: should be independent');
  assert(checked.evidence.state === 'independent-once', `evidence: ${checked.evidence.state}`);

  assertNoAnswerKeys(checked, 'independent completion');
});

// ─── Path 2: Check → help → replacement ──────────────────────────────────────

await test('path 2: convert primary check, get bank item, submit correctly', async () => {
  const session = await newSession();
  const id = session.sessionId;
  const view = await advanceTo(id, 'check');
  const originalItemId = view.activeCheckId!;

  // Convert to help.
  const convertRes = await post(`/api/sessions/${id}/convert`, {
    itemId: originalItemId,
  });
  assert(convertRes.status === 200, `convert: ${convertRes.status}`);
  const converted = convertRes.body as SessionView;
  const newItemId = converted.activeCheckId!;
  assert(newItemId !== originalItemId, 'replacement item should differ from original');
  assertNoAnswerKeys(converted, 'after convert');

  // Find the bank item and submit correctly.
  const allItems = [demoLesson.check, ...demoLesson.checkBank];
  const bankItem = allItems.find((q) => q.id === newItemId)!;
  assert(bankItem !== undefined, `bank item ${newItemId} not found in lesson`);

  const attemptRes = await post(`/api/sessions/${id}/attempt`, {
    stage: 'check',
    optionId: bankItem.correctOptionId,
    itemId: newItemId,
  });
  assert(attemptRes.status === 200, `bank attempt: ${attemptRes.status}`);
  const bankResult = attemptRes.body as SessionView;
  assert(bankResult.lastResult?.countsAsIndependent === true, 'bank item: should be independent');
  assert(bankResult.evidence.state === 'independent-once', `evidence after bank: ${bankResult.evidence.state}`);
  assertNoAnswerKeys(bankResult, 'bank item submission');
});

// ─── Path 3: Refresh preserves evidence ──────────────────────────────────────

await test('path 3: refresh returns same evidence state and review date', async () => {
  const session = await newSession();
  const id = session.sessionId;
  await advanceTo(id, 'check');

  const checkView = (await call(`/api/sessions/${id}`)).body as SessionView;
  const checkItem = [demoLesson.check, ...demoLesson.checkBank].find(
    (q) => q.id === checkView.activeCheckId,
  )!;

  const { body: submitted } = await post(`/api/sessions/${id}/attempt`, {
    stage: 'check',
    optionId: checkItem.correctOptionId,
    itemId: checkItem.id,
  });
  const sub = submitted as SessionView;
  const reviewDue = sub.evidence.nextReviewDue;

  // Three separate re-reads.
  for (let i = 0; i < 3; i++) {
    const { body: reloaded } = await call(`/api/sessions/${id}`);
    const r = reloaded as SessionView;
    assert(r.evidence.state === 'independent-once', `refresh ${i}: state wrong`);
    assert(r.evidence.nextReviewDue === reviewDue, `refresh ${i}: review date drifted`);
  }
});

// ─── Path 4: Retry after stale item rejection ─────────────────────────────────

await test('path 4: stale item attempt is rejected 409 and session state is readable', async () => {
  const session = await newSession();
  const id = session.sessionId;
  const view = await advanceTo(id, 'check');
  const originalItemId = view.activeCheckId!;

  // Convert to advance the active item.
  const converted = (
    await post(`/api/sessions/${id}/convert`, { itemId: originalItemId })
  ).body as SessionView;
  const newItemId = converted.activeCheckId!;
  assert(newItemId !== originalItemId, 'item should have advanced');

  // Stale attempt with old item ID.
  const stale = await post(`/api/sessions/${id}/attempt`, {
    stage: 'check',
    optionId: demoLesson.check.correctOptionId,
    itemId: originalItemId,
  });
  assert(stale.status === 409, `stale attempt: expected 409, got ${stale.status}`);
  assert((stale.body as { error: string }).error === 'item_replaced', 'should be item_replaced');

  // Session is still readable after the rejection.
  const { status: reloadStatus, body: reloaded } = await call(`/api/sessions/${id}`);
  assert(reloadStatus === 200, `reload after rejection: ${reloadStatus}`);
  assert((reloaded as SessionView).activeCheckId === newItemId, 'active item should still be the new one');
});

// ─── Path 5: Session expiry (missing session) ─────────────────────────────────

await test('path 5: GET on a non-existent session returns 404 session_not_found', async () => {
  const { status, body } = await call('/api/sessions/does-not-exist-r02b');
  assert(status === 404, `expected 404, got ${status}`);
  assert((body as { error: string }).error === 'session_not_found', 'error code wrong');
});

// ─── Path 6: Bank exhaustion ──────────────────────────────────────────────────

await test('path 6: exhausting all bank items produces honest exhaustion state', async () => {
  const session = await newSession();
  const id = session.sessionId;
  await advanceTo(id, 'check');

  const totalItems = 1 + demoLesson.checkBank.length;
  let current = (await call(`/api/sessions/${id}`)).body as SessionView;

  for (let i = 0; i < totalItems; i++) {
    const itemId = current.activeCheckId!;
    assert(!current.checkBankExhausted, `item ${i}: should not be exhausted yet`);
    const res = await post(`/api/sessions/${id}/convert`, { itemId });
    assert(res.status === 200, `convert item ${i}: ${res.status}`);
    current = res.body as SessionView;
  }

  assert(current.checkBankExhausted === true, 'should be exhausted after converting all items');
  assert(current.checkConverted === true, 'last item should show converted');

  // Attempting to convert again should fail.
  const extra = await post(`/api/sessions/${id}/convert`, {
    itemId: current.activeCheckId,
  });
  assert(extra.status === 409, `extra convert should be 409, got ${extra.status}`);
});

// ─── Path 7: Wrong-unaided label ─────────────────────────────────────────────

await test('path 7: wrong unaided answer has assistance none and countsAsIndependent false', async () => {
  const session = await newSession();
  const id = session.sessionId;
  await advanceTo(id, 'check');

  const wrong = demoLesson.check.options.find(
    (o) => o.id !== demoLesson.check.correctOptionId,
  )!;
  const { status, body } = await post(`/api/sessions/${id}/attempt`, {
    stage: 'check',
    optionId: wrong.id,
  });
  assert(status === 200, `wrong attempt: ${status}`);
  const res = body as SessionView;
  assert(res.lastResult?.correct === false, 'should be incorrect');
  assert(res.lastResult?.assistance === 'none', 'should have no assistance');
  assert(res.lastResult?.countsAsIndependent === false, 'should not be independent');
  assert(res.evidence.state !== 'independent-once', 'should not promote on wrong answer');
  // The attempt record must reflect no assistance.
  assert(res.evidence.attempts[0]?.assistance === 'none', 'recorded attempt: no assistance');
});

// ─── Path 8: Answer-key absence from all routes ───────────────────────────────

await test('path 8: no answer keys in session view, convert response, or check stage view', async () => {
  const session = await newSession();
  const id = session.sessionId;
  const view = await advanceTo(id, 'check');

  // Check stage view.
  assertNoAnswerKeys(view, 'check stage view');

  // After convert.
  const converted = (
    await post(`/api/sessions/${id}/convert`, { itemId: view.activeCheckId! })
  ).body;
  assertNoAnswerKeys(converted, 'convert response');

  // After bank attempt.
  const bankView = converted as SessionView;
  const bankItem = [demoLesson.check, ...demoLesson.checkBank].find(
    (q) => q.id === bankView.activeCheckId,
  )!;
  const attempted = (
    await post(`/api/sessions/${id}/attempt`, {
      stage: 'check',
      optionId: bankItem.correctOptionId,
      itemId: bankItem.id,
    })
  ).body;
  assertNoAnswerKeys(attempted, 'bank item attempt response');
});

// ─── Summary ─────────────────────────────────────────────────────────────────

console.log('');
console.log(`Fetch-based acceptance harness: ${passed} passed, ${failed} failed`);
console.log('');
console.log('Not verified by this harness (require a real browser):');
console.log('  - Keyboard-only navigation through the full lesson');
console.log('  - Screen-reader announcements on stage/item change');
console.log('  - Narrow-screen (< 52 rem) layout and touch targets');
console.log('  - Focus management on item replacement');
console.log('  - Real UAE device and network conditions');
console.log('  - Visual rendering of exhaustion/converted states');

if (failed > 0) process.exit(1);
