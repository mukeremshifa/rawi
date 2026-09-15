import { expect, test } from '@playwright/test';

/**
 * The end-to-end drive, against `VITE_API_MODE=fake`.
 *
 * ── Why it runs against the fake ──────────────────────────────────────────
 *
 * No Worker, no Supabase, no credentials, no spend — which is what makes this
 * gate runnable on any machine and in CI on the first push. The fake enforces
 * the same invariants the server does (see `tests/unit/fake.test.ts`), so what
 * is being checked here is the *surface*: that the screens exist, that the
 * states render, and that the loop can be completed by a person clicking.
 *
 * What it cannot check is the server. That is an honest limit, and it is why
 * the invariants have their own tests against `rules.ts` directly.
 */

test.describe('the learning loop', () => {
  test('sign-in through to a completed session', async ({ page }) => {
    // ── The workspace list ───────────────────────────────────────────────
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Your workspaces' })).toBeVisible();
    await expect(page.getByText('Intro microeconomics')).toBeVisible();

    // ── The plan ─────────────────────────────────────────────────────────
    await page.getByText('Intro microeconomics').click();
    await expect(page.getByRole('heading', { name: 'What to do next' })).toBeVisible();
    // Every entry carries a reason. This is the property the screen exists for.
    await expect(page.getByText(/Not started|attempts recorded/i).first()).toBeVisible();

    // ── Sources ──────────────────────────────────────────────────────────
    await page.getByRole('link', { name: 'Sources' }).click();
    await expect(page.getByRole('heading', { name: 'Sources' })).toBeVisible();
    await expect(page.getByText('Lecture 4 — elasticity')).toBeVisible();

    await page.getByText('Lecture 4 — elasticity').click();
    // Passages are visible as passages, so a citation points at a thing.
    await expect(page.getByText(/Price elasticity of demand measures/)).toBeVisible();

    // ── The concept map ──────────────────────────────────────────────────
    await page.getByRole('link', { name: 'Concepts' }).click();
    await expect(page.getByRole('heading', { name: 'Concepts' })).toBeVisible();
    await expect(page.getByText('Elasticity and total revenue')).toBeVisible();
    await expect(page.getByText('Not checked yet').first()).toBeVisible();

    // ── A concept ────────────────────────────────────────────────────────
    await page.getByText('Elasticity and total revenue').click();
    await expect(page.getByRole('heading', { name: 'Elasticity and total revenue' })).toBeVisible();
    await expect(page.getByText('Nothing has been asked about this yet.')).toBeVisible();

    // ── The session: a hint, then a reveal, then an answer ───────────────
    await page.getByRole('button', { name: 'Start a session' }).click();
    await expect(page.getByRole('heading', { name: 'Session' })).toBeVisible();
    await expect(page.getByText('No help used')).toBeVisible();

    await page.getByRole('button', { name: /Hint/ }).click();
    await expect(page.getByText('Hint used')).toBeVisible();

    await page.getByRole('button', { name: /Show the answer/ }).click();
    await expect(page.getByText('Answer revealed')).toBeVisible();
    await expect(page.getByText('The answer')).toBeVisible();

    await page
      .getByLabel('Your answer')
      .fill('Because there are three other cafes, total revenue falls.');
    await page.getByRole('button', { name: 'Submit' }).click();

    // The evidence badge must NOT say independent: the answer was revealed.
    await expect(page.getByText('Practising').first()).toBeVisible();
  });

  test('asking during a check announces the cost before it is taken', async ({ page }) => {
    await page.goto('/w/ws-demo/concepts/con-demo-elasticity');
    await page.getByRole('button', { name: 'Start a session' }).click();

    await expect(page.getByText(/Asking here counts as help/)).toBeVisible();
    await page.getByRole('link', { name: 'Ask anyway' }).click();

    await expect(page.getByRole('heading', { name: 'Ask' })).toBeVisible();
    await expect(page.getByText('This counts as help')).toBeVisible();

    await page.getByLabel('Your question').fill('What does elastic demand mean for revenue?');
    await page.getByRole('button', { name: 'Ask' }).click();

    await expect(page.getByText('Recorded as help on the question you are checking.')).toBeVisible();
  });

  test('Ask says so when the sources do not cover the question', async ({ page }) => {
    await page.goto('/w/ws-demo/ask');
    await page.getByLabel('Your question').fill('Explain mitochondrial respiration in detail.');
    await page.getByRole('button', { name: 'Ask' }).click();

    await expect(page.getByText(/Nothing in this workspace/)).toBeVisible();
    await expect(page.getByText(/nothing in your sources answers it/)).toBeVisible();
  });

  test('evidence shows counts, never a percentage', async ({ page }) => {
    await page.goto('/w/ws-demo/evidence');
    await expect(page.getByRole('heading', { name: 'Evidence' })).toBeVisible();
    await expect(page.getByText('Nothing recorded yet')).toBeVisible();

    // Invariant 6, checked against what is actually on screen.
    await expect(page.locator('body')).not.toContainText('%');
    await expect(page.locator('body')).not.toContainText(/mastery/i);
  });

  test('adding a source is visibly a job', async ({ page }) => {
    await page.goto('/w/ws-demo/sources');
    await page.getByRole('button', { name: 'Add a source' }).click();

    await page.getByLabel('Title').fill('My notes');
    await page
      .getByLabel('Or paste the text')
      .fill('A first paragraph about supply.\n\nA second paragraph about demand.');
    await page.getByRole('button', { name: 'Add source' }).click();

    // The generating state is a state, not a flash.
    await expect(page.getByRole('status').filter({ hasText: /Reading|Splitting/ })).toBeVisible();
    await expect(page.getByText('My notes')).toBeVisible();
  });

  test('a mistyped address gets a real 404', async ({ page }) => {
    await page.goto('/w/ws-demo/nothing-here');
    await expect(page.getByRole('heading', { name: 'Not here' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Back to your workspaces' })).toBeVisible();
  });
});
