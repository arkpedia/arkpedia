import { expect, test } from '@playwright/test';

test('Limited navigation groups crossover banners while historical links retain crossover rules', async ({ page }, info) => {
  await page.goto("/gacha-simulator?banner=" + encodeURIComponent('[Crossover] Attack, Defence, Tactical Collide'));
  await expect(page.getByText('Crossover guarantee (120)', { exact: true })).toBeVisible();
  await expect(page.locator('.gacha-main-col').getByText('Limited guarantee', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Pull ten operators', exact: true }).click();
  await expect(page.locator('.gacha-main-col')).toContainText('10');
  if (info.project.name === 'mobile') {
    const category = page.getByRole('combobox', { name: 'Banner category' });
    await category.click();
    await expect(page.getByRole('option', { name: 'Crossover', exact: true })).toHaveCount(0);
    await page.getByRole('option', { name: 'Limited', exact: true }).click();
  } else {
    await expect(page.getByRole('button', { name: 'Crossover', exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Limited', exact: true }).click();
  }
  await expect(page.getByRole('region', { name: 'Banners' })).toBeVisible();
  await page.goto("/gacha-simulator?banner=" + encodeURIComponent('[Celebration] Sealed With Time'));
  await expect(page.locator('.gacha-main-col').getByText('Limited guarantee', { exact: true })).toBeVisible();
  await page.goto("/gacha-simulator?banner=" + encodeURIComponent('[Crossover] Attack, Defence, Tactical Collide'));
  await expect(page.getByText('Crossover guarantee (120)', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText('Crossover guarantee (120)', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: `test-results/gacha-limited-${info.project.name}.png`, fullPage: false });
});


test('datamined current pools and Orienteering forecasts keep distinct labels', async ({ page }) => {
  await page.goto("/gacha-simulator?banner=" + encodeURIComponent('Standard Pool #178 (Global)'));
  await expect(page.locator('.gacha-main-col')).toContainText('Datamined Global · 2026/10/23–2026/11/06');
  await expect(page.locator('.gacha-main-col')).toContainText('Ines');
  await expect(page.locator('.gacha-main-col')).toContainText('Zuo Le');
  await page.goto("/gacha-simulator?banner=" + encodeURIComponent('Orienteering #7'));
  await expect(page.getByText('Awaiting Global lineup confirmation.', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Pull one operator', exact: true })).toBeDisabled();
  await expect(page.locator('.gacha-banner-sidebar-item[aria-pressed="true"]')).toContainText('Global date unannounced');
});
