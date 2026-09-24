import { expect, test } from '@playwright/test';

test('gacha banners load and unload as their list scrolls', async ({ page }, testInfo) => {
  await page.goto('/gacha');
  if (testInfo.project.name === 'mobile') {
    await page.getByRole('combobox', { name: 'Banner category' }).selectOption('limited');
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

test('CN-only banners use estimated Global windows in the simulator', async ({ page }, testInfo) => {
  await page.goto('/gacha');
  const windows = await page.evaluate(() => {
    const rows = (window as typeof window & { __NEXT_DATA__: { props: { pageProps: { banners: Array<{ name: string; global_date: string | null; global_date_estimated?: boolean }> } } } }).__NEXT_DATA__.props.pageProps.banners;
    return rows.filter(row => row.name.includes('Persona 3 Reload') || row.name === '[jo] Joint Operation 23');
  });
  expect(windows.map(row => row.name)).toEqual([
    '[Crossover · Persona 3 Reload] Some Evening of White and Mystic Blue',
    '[jo] Joint Operation 23',
  ]);
  expect(windows.every(row => row.global_date_estimated && row.global_date?.startsWith('2027/'))).toBe(true);
  if (testInfo.project.name === 'mobile') {
    await page.getByRole('combobox', { name: 'Banner category' }).selectOption('joint');
  } else {
    await page.getByRole('button', { name: 'Joint Operation', exact: true }).click();
  }
  await expect(page.locator('.gacha-banner-sidebar-item').first()).toContainText('Estimated Global');
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
