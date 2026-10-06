import fs from 'node:fs';
import { expect, test } from '@playwright/test';

test('gacha banners load and unload as their list scrolls', async ({ page }, testInfo) => {
  await page.goto('/gacha');
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

test('CN-only banners use estimated Global windows in the simulator, and a Joint Operation Global has not dated is not shown', async ({ page }, testInfo) => {
  // Joint Operation 23 ran on CN only: its record is in the data, and in no list a page reads
  // (lib/gacha/bannerSchedule.ts waitsForGlobal), as Global will offer other operators.
  const records = JSON.parse(fs.readFileSync('data/headhunting_banners.json', 'utf8')) as Array<{ name: string; six_stars: string[] }>;
  const joint = records.find(row => row.name === '[jo] Joint Operation 23')!;
  await page.goto('/gacha');
  const windows = await page.evaluate(() => {
    const rows = (window as typeof window & { __NEXT_DATA__: { props: { pageProps: { banners: Array<{ name: string; global_date: string | null; global_date_estimated?: boolean }> } } } }).__NEXT_DATA__.props.pageProps.banners;
    return rows.filter(row => row.name.includes('Persona 3 Reload') || row.name === '[jo] Joint Operation 23');
  });
  // The crossover's Global window is forecast from its event; the Joint Operation is not there at all.
  expect(windows.map(row => row.name)).toEqual(['[Crossover · Persona 3 Reload] Some Evening of White and Mystic Blue']);
  expect(windows[0].global_date_estimated && windows[0].global_date?.startsWith('2027/')).toBe(true);
  // A Joint Operation's row is labelled by its operators: neither on Upcoming nor in its own tab.
  const jointRow = page.locator('.gacha-banner-sidebar-item', { hasText: joint.six_stars.join(' / ') });
  await expect(page.locator('.gacha-banner-sidebar-item').first()).toBeVisible();
  await expect(jointRow).toHaveCount(0);
  if (testInfo.project.name === 'mobile') {
    await page.getByRole('combobox', { name: 'Banner category' }).click();
    await page.getByRole('option', { name: 'Joint Operation', exact: true }).click();
  } else {
    await page.getByRole('button', { name: 'Joint Operation', exact: true }).click();
  }
  // Global's own Joint Operations are there, and none under CN dates.
  await expect(page.locator('.gacha-banner-sidebar-item').first()).toBeVisible();
  await expect(jointRow).toHaveCount(0);
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
