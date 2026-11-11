import { expect, test } from '@playwright/test';

test.beforeEach(async ({ request }) => {
  const response = await request.get('/build-info.json');
  const build = response.ok() ? await response.json() : null;
  test.skip(build?.deploymentRole === 'staging', 'This acceptance check targets the production build.');
});

for (const theme of ['dark', 'light']) test(`production offers account Beta while keeping browser imports available (${theme})`, async ({ page }) => {
  await page.addInitScript(theme => localStorage.setItem('theme', theme), theme);
  let cloudReads = 0;
  await page.route('**/api/cloud-account', route => { cloudReads++; return route.fulfill({ status: 401, json: { providers: ['google', 'discord'] } }); });
  await page.goto('/account');
  await expect(page.getByRole('heading', { name: 'My Account', exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Arkpedia account', exact: true }).locator('.beta-label')).toHaveText('Beta');
  await page.locator('.page-header-actions').getByRole('button', { name: 'Account settings', exact: true }).click();
  const login = page.getByRole('dialog', { name: 'Log in to Arkpedia', exact: true });
  await expect(login.getByRole('button', { name: 'Continue with Google', exact: true })).toBeVisible();
  await expect(login.getByRole('button', { name: 'Continue with Discord', exact: true })).toBeVisible();
  await expect(login.locator('.beta-label')).toHaveText('Beta');
  expect(cloudReads).toBeGreaterThan(0);
  await page.keyboard.press('Escape');
  await expect(login).toHaveCount(0);
  await page.locator('.page-header-actions').getByRole('button', { name: 'Import / export', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Import / export', exact: true }).getByRole('tab', { name: 'Game import', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('production uses the updated public URLs and keeps privacy controls accessible', async ({ page }) => {
  await page.goto('/pulls'); await expect(page).toHaveURL(/\/pull-planner$/);
  await page.goto('/planner'); await expect(page).toHaveURL(/\/operator-planner$/);
  await page.goto('/changelog'); await expect(page).toHaveURL(/\/whats-new$/);
  await expect(page.getByRole('link', { name: 'UI update for the site', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Music player UI update', exact: true })).toBeVisible();
  // The base optimizer stays on Preview for now (#852): its What's new entry leaves the list with it.
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  const settings = page.getByRole('region', { name: 'Settings', exact: true });
  await settings.getByRole('link', { name: 'Privacy choices', exact: true }).click();
  await expect(page).toHaveURL(/\/cookies$/);
  await expect(page.getByRole('button', { name: 'Save privacy choices', exact: true })).toBeVisible();
});
