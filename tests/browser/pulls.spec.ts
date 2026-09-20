import { expect, test } from '@playwright/test';

test.describe('pull planner integration', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/pulls');
    await expect(page.getByRole('heading', { name: 'Pull Planner' })).toBeVisible();
  });

  test('adds several banners without closing the picker and loads shared operator art', async ({ page }) => {
    await page.getByRole('button', { name: '+ Add banner' }).click();
    const zima = page.getByRole('button', { name: /Add Zima the Raging Tide/ });
    await expect(zima.locator('img')).toHaveCount(1);
    await expect(zima.locator('img')).toHaveJSProperty('complete', true);
    await zima.click();

    await expect(page.getByRole('button', { name: 'Close' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Added Zima the Raging Tide/ })).toBeDisabled();
    await expect(page.getByRole('button', { name: /Add Closure/ })).toBeEnabled();
    await expect(page.getByRole('heading', { name: /Your banners 1/ })).toBeVisible();
  });

  test('fits the viewport without horizontal page overflow', async ({ page }) => {
    await page.getByRole('button', { name: '+ Add banner' }).click();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test('schedule deep links add the requested banner', async ({ page }) => {
    await page.goto('/pulls?banner=Rage%20of%20The%20Many');
    await expect(page.getByRole('heading', { name: /Your banners 1/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Edit Rage of The Many/ })).toBeVisible();
  });
});
