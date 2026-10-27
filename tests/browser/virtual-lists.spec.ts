import fs from 'node:fs';
import { expect, test } from '@playwright/test';

test('gacha banners load and unload as their list scrolls', async ({ page }, testInfo) => {
  await page.goto("/gacha-simulator");
  if (testInfo.project.name === 'mobile') {
    await page.getByRole('combobox', { name: 'Banner category' }).click();
    await page.getByRole('option', { name: 'Limited', exact: true }).click();
  } else {
    await page.getByRole('button', { name: 'Limited', exact: true }).click();
  }
  const list = page.getByRole('region', { name: 'Banners' });
  const cards = list.locator('.gacha-banner-sidebar-item');
  await expect.poll(() => cards.count()).toBeGreaterThan(0);
  const first = await cards.first().getAttribute('title');
  const bounds = await list.evaluate((element) => ({ total: element.scrollHeight, visible: element.clientHeight }));
  expect(bounds.total).toBeGreaterThan(bounds.visible);
  expect(await cards.count()).toBeLessThan(20);
  await list.evaluate((element) => { element.scrollTop = element.scrollHeight; });
  await expect.poll(() => cards.first().getAttribute('title')).not.toBe(first);
  expect(await cards.count()).toBeLessThan(20);
  await expect(page.getByRole('button', { name: /show (older|further)/i })).toHaveCount(0);
  await cards.last().click();
  await expect(cards.last()).toHaveAttribute('aria-pressed', 'true');
});

test('CN-only banners use estimated Global windows without a Joint Operation CN lineup', async ({ page }, testInfo) => {
  const records = JSON.parse(fs.readFileSync('data/headhunting_banners.json', 'utf8')) as Array<{ name: string; six_stars: string[] }>;
  const joint = records.find(row => row.name === '[jo] Joint Operation 23')!;
  await page.goto("/gacha-simulator");
  if (testInfo.project.name === 'mobile') {
    await page.getByRole('combobox', { name: 'Banner category' }).click();
    await page.getByRole('option', { name: 'Joint Operation', exact: true }).click();
  } else {
    await page.getByRole('button', { name: 'Joint Operation', exact: true }).click();
  }
  const forecast = page.locator('.gacha-banner-sidebar-item', { hasText: 'Joint Operation 23' });
  await expect(forecast).toBeVisible();
  await expect(forecast).toContainText('Estimated Global');
  await expect(forecast.locator('img')).toHaveCount(0);
  await forecast.click();
  await expect(page.getByText('Awaiting Global lineup confirmation.', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Pull one operator', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Pull ten operators', exact: true })).toBeDisabled();
  for (const name of joint.six_stars) await expect(page.locator('.gacha-main-col').getByRole('img', { name, exact: true })).toHaveCount(0);
  await expect(page.locator('.gacha-banner-sidebar-item', { hasText: 'CN ·' })).toHaveCount(0);
});

test('enemy cards load and unload without a manual expansion footer', async ({ page }) => {
  await page.goto('/enemies');
  const list = page.locator('.enemy-grid-pane');
  const cards = list.locator('.enemy-tile');
  await expect.poll(async () => list.evaluate((element) => element.scrollHeight > element.clientHeight * 3)).toBe(true);
  const first = await cards.first().getAttribute('title');
  expect(await cards.count()).toBeLessThan(100);
  await list.evaluate((element) => { element.scrollTop = element.scrollHeight; });
  await expect.poll(() => cards.first().getAttribute('title')).not.toBe(first);
  expect(await cards.count()).toBeLessThan(100);
  await expect(page.getByRole('button', { name: /show (40 more|all)/i })).toHaveCount(0);
});
