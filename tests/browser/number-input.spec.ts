import { expect, test } from '@playwright/test';

test('numeric game settings remain empty while typing, then accept and clamp the replacement', async ({ page }) => {
  await page.goto('/games/operator-guesser');
  const guesses = page.getByRole('spinbutton', { name: 'Guesses', exact: true });
  await guesses.fill('');
  await expect(guesses).toHaveValue('');
  await guesses.pressSequentially('20');
  await expect(guesses).toHaveValue('20');
  await guesses.fill('');
  await page.getByRole('spinbutton', { name: 'Hints / guess', exact: true }).click();
  await expect(guesses).toHaveValue('20');
  await guesses.fill('99');
  await page.getByRole('spinbutton', { name: 'Hints / guess', exact: true }).click();
  await expect(guesses).toHaveValue('30');
});

test('pull budgets allow clearing without resetting the saved goal before a replacement is entered', async ({ page }) => {
  await page.goto("/pull-planner");
  await page.getByRole('button', { name: '+ Add banner' }).click();
  await page.getByRole('button', { name: /^Add / }).first().click();
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  const budget = page.getByRole('spinbutton', { name: /^Pull budget for/ }).first();
  await budget.fill('123');
  await budget.fill('');
  await expect(budget).toHaveValue('');
  await budget.pressSequentially('456');
  await expect(budget).toHaveValue('456');
  await budget.press('Tab');
  await page.reload();
  await expect(page.getByRole('spinbutton', { name: /^Pull budget for/ }).first()).toHaveValue('456');
});
