import { test, expect } from '@playwright/test';
const snapshot = { updatedAt: '2026-11-13T04:17:00Z', 'supporter-tier': [{ id: '20', name: 'Giant Cookie Supporters', supporters: ['Public Supporter'] }, { id: '10', name: 'Cookie Supporters', supporters: [] }] };
for (const theme of ['dark', 'light']) {
  test(`supporter acknowledgements and owner contacts in ${theme}`, async ({ page }) => {
    await page.addInitScript(theme => localStorage.setItem('theme', theme), theme);
    await page.route('**/api/patreon-supporters', route => route.fulfill({ json: snapshot }));
    await page.goto('/support');
    await expect(page.getByRole('heading', { name: 'Thank you to Kukkikaze’s Patreon supporters' })).toBeVisible();
    await expect(page.getByText('Public Supporter', { exact: true })).toBeVisible();
    await expect(page.locator('.supporter-tier')).toHaveCount(1);
    await expect(page.locator('time')).toHaveAttribute('datetime', snapshot.updatedAt);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    for (const path of ['/about', '/privacy']) {
      await page.goto(path);
      await expect(page.getByRole('link', { name: 'kukkikaze@arkpedia.net', exact: true })).toHaveAttribute('href', 'mailto:kukkikaze@arkpedia.net');
      await expect(page.getByRole('link', { name: 'jungermin@arkpedia.net', exact: true }).first()).toHaveAttribute('href', 'mailto:jungermin@arkpedia.net');
      await expect(page.getByText(/For sponsorships and inquiries unrelated to the Arkpedia website/)).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
  });
}
test('supporter failures do not restore the old acknowledgement list and can be retried', async ({ page }) => {
  let calls = 0;
  await page.route('**/api/patreon-supporters', route => route.fulfill(calls++ === 0 ? { status: 503, json: { error: 'unavailable' } } : { json: snapshot }));
  await page.goto('/support');
  await expect(page.getByText('Supporter acknowledgements are temporarily unavailable.')).toBeVisible();
  await expect(page.locator('.supporter-list li')).toHaveCount(0);
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(page.getByText('Public Supporter', { exact: true })).toBeVisible();
});

test('a failed initial sync leaves preparing state and can recover', async ({ page }) => {
  let calls = 0;
  await page.route('**/api/patreon-supporters', route => {
    calls++;
    return route.fulfill(calls === 1 ? { status: 202, json: { status: 'preparing' } } : calls === 2 ? { status: 503, json: { error: 'unavailable' } } : { json: snapshot });
  });
  await page.goto('/support');
  await expect(page.getByText('Supporter acknowledgements are temporarily unavailable.')).toBeVisible();
  await expect(page.locator('.supporter-list li')).toHaveCount(0);
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(page.getByText('Public Supporter', { exact: true })).toBeVisible();
  expect(calls).toBe(3);
});
