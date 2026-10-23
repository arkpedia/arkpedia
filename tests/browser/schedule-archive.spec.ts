import { expect, test } from '@playwright/test';

test('past events are newest first, shareable, and link to their event pages', async ({ page }) => {
  await page.goto('/schedule');
  await page.getByRole('button', { name: 'See past events', exact: true }).click();
  await expect(page).toHaveURL(/past=1/);
  await expect(page.getByRole('heading', { name: 'Past events', exact: true })).toBeVisible();
  const rows = page.locator('#schedule-view-panel-events .events-row');
  await expect(rows.first()).toBeVisible();
  const dates = await rows.locator('time').evaluateAll(nodes => nodes.map(node => Date.parse(node.getAttribute('datetime')!)));
  expect(dates.length).toBeGreaterThan(1);
  expect(dates).toEqual([...dates].sort((a, b) => b - a));
  await expect(rows.locator('.badge-live')).toHaveCount(0);
  const first = rows.first().locator('a.events-row-main');
  const href = await first.getAttribute('href');
  const name = await rows.first().locator('.events-row-name').innerText();
  await first.click();
  await expect(page).toHaveURL(new URL(href!, 'http://127.0.0.1:3192').href);
  await expect(page.locator('h1')).toHaveText(name);
  await page.goto('/schedule?past=1');
  await expect(page.getByRole('heading', { name: 'Past events', exact: true })).toBeVisible();
  await expect(rows.first().locator('a.events-row-main')).toHaveAttribute('href', href!);
  await page.getByRole('button', { name: 'See current events', exact: true }).click();
  await expect(page).not.toHaveURL(/past=1/);
  await expect(page.getByRole('heading', { name: 'Past events', exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
