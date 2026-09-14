import { expect, test } from '@playwright/test';

test('keyboard/mobile learning, tutor, refresh, delayed review, export and deletion', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Start a lesson' })).toBeVisible();
  await page.getByRole('button', { name: 'Start lesson' }).click();

  const unsure = page.getByRole('radio', { name: 'I don’t know yet' });
  await unsure.focus();
  await page.keyboard.press('Space');
  await page.getByRole('button', { name: 'Submit answer' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Not quite.' })).toBeVisible();
  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(page.getByRole('heading', { name: 'Explanation' })).toBeFocused();
  await page.getByLabel('What is still unclear?').fill('How do substitutes change demand?');
  await page.getByRole('button', { name: 'Ask for an explanation' }).click();
  await expect(page.locator('.tutor-reply')).toContainText('Start by naming the variable');
  await expect(page.locator('.tutor-reply')).toContainText(/rawi-demo-(notes|example)-v1/);

  await page.getByRole('button', { name: 'Practise this' }).click();
  await page.getByRole('button', { name: 'Give me a hint' }).click();
  await page.getByRole('radio', { name: 'The demand curve shifts right' }).check();
  await page.getByRole('button', { name: 'Submit answer' }).click();
  await expect(page.getByText('Recorded as assisted: help was used on this question.')).toBeVisible();
  await page.getByRole('button', { name: 'Try the check' }).click();

  await page.reload();
  await expect(page.getByRole('heading', { name: 'Independent check' })).toBeVisible();
  await expect(page.getByText('Tutor help is paused while an unanswered independent check is active.')).toBeVisible();
  await page.getByRole('radio', { name: 'The demand curve for tea shifts right' }).check();
  await page.getByRole('button', { name: 'Submit answer' }).click();
  await expect(page.getByText('Recorded as independent: you answered without help.')).toBeVisible();
  await page.getByRole('button', { name: 'Finish' }).click();
  await expect(page.getByText('Solved independently once')).toBeVisible();

  const sessionId = await page.evaluate(() => window.localStorage.getItem('rawi.sessionId'));
  expect(sessionId).toBeTruthy();
  const reviewStatus = await page.evaluate(async (id) => {
    const response = await fetch(`/api/sessions/${id}/review`, {
      method: 'POST',
      headers: { 'X-Rawi-Test-Now': '2030-09-21T00:00:00.000Z' },
    });
    return response.status;
  }, sessionId);
  expect(reviewStatus).toBe(200);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Delayed review' })).toBeVisible();
  await page.getByRole('radio', { name: 'Movement along the existing demand curve' }).check();
  await page.getByRole('button', { name: 'Submit answer' }).click();
  await expect(page.getByText('Retained on review')).toBeVisible();

  await page.getByLabel('Report a content, technical, or privacy problem').fill('Synthetic browser test issue');
  await page.getByRole('button', { name: 'Send report' }).click();
  await expect(page.getByText('Report saved for the pilot operator.')).toBeVisible();

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export my data' }).click();
  expect((await download).suggestedFilename()).toMatch(/^rawi-export-/);

  const noHorizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
  );
  expect(noHorizontalOverflow).toBe(true);

  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Delete my Rawi data' }).click();
  await expect(page.getByRole('heading', { name: 'Start a lesson' })).toBeVisible();
});
