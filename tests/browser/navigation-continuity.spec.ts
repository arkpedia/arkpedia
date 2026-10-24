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

test('a lazily loaded event archive restores its later batches and scroll position on Back', async ({ page }) => {
  await page.goto('/schedule?past=1');
  await expect(page.getByRole('button', { name: 'Past', exact: true })).toHaveAttribute('aria-pressed', 'true');
  const rows = page.locator('.events-row-main');
  for (let batch = 0; batch < 4 && await rows.count() <= 50; batch++) {
    const count = await rows.count();
    await rows.last().scrollIntoViewIfNeeded();
    await page.mouse.wheel(0, 900);
    await expect.poll(() => rows.count()).toBeGreaterThan(count);
  }
  const event = rows.nth(50);
  await event.scrollIntoViewIfNeeded();
  const position = await page.evaluate(() => scrollY);
  expect(position).toBeGreaterThan(500);
  await event.click();
  await expect(page).toHaveURL(/\/events\//);
  await expect(page.locator('.event-detail-layout')).toBeVisible();
  await expect.poll(() => page.evaluate(() => scrollY)).toBeLessThan(100);
  await page.goBack();
  await expect(page).toHaveURL(/\/schedule\?past=1/);
  await expect.poll(async () => Math.abs(await page.evaluate(() => scrollY) - position), { timeout: 10000 }).toBeLessThanOrEqual(8);
  await expect(event).toBeInViewport();
});
