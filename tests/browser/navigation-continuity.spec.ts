import { expect, test } from '@playwright/test';

test('a directory → operator → browser Back journey keeps the directory position', async ({ page }) => {
  await page.goto('/artists');
  const operator = page.locator('.credit-person').nth(20).locator('a.credit-op').first();
  await operator.scrollIntoViewIfNeeded();
  const position = await page.evaluate(() => scrollY);
  expect(position).toBeGreaterThan(500);
  await operator.click();
  await expect(page).toHaveURL(/\/operators\//);
  await expect.poll(() => page.evaluate(() => scrollY)).toBeLessThan(100);
  await page.goBack();
  await expect(page).toHaveURL(/\/artists$/);
  await expect.poll(() => page.evaluate(() => scrollY)).toBeCloseTo(position, -1);
  await expect(operator).toBeInViewport();
});
