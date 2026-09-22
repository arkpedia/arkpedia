import { expect, test } from '@playwright/test';

test('available outfits have prominent artwork and persistent mouse/keyboard scroll controls', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-09-22T12:00:00Z'));
  await page.goto('/skins?availability=reward');
  const shelf = page.getByRole('region', { name: 'Available now', exact: true });
  const scrollbar = shelf.getByRole('slider', { name: 'Scroll available outfits' });
  const previous = shelf.getByRole('button', { name: 'Previous available outfits' });
  const next = shelf.getByRole('button', { name: 'Next available outfits' });
  const viewport = shelf.locator('.skins-current-viewport');
  await expect(scrollbar).toBeVisible();
  await expect(previous).toBeDisabled();
  await expect(next).toBeEnabled();
  expect((await shelf.locator('img').first().boundingBox())!.height).toBeGreaterThanOrEqual(200);

  await next.click();
  await expect.poll(() => viewport.evaluate(el => el.scrollLeft)).toBeGreaterThan(0);
  await scrollbar.press('End');
  await expect(next).toBeDisabled();
  const max = Number(await scrollbar.getAttribute('max'));
  expect(await viewport.evaluate(el => el.scrollLeft)).toBeCloseTo(max, 0);

  // Drag the visible thumb left with a regular mouse; no horizontal wheel.
  const bounds = (await scrollbar.boundingBox())!;
  const thumbRatio = await viewport.evaluate(el => el.clientWidth / el.scrollWidth);
  const grab = bounds.x + bounds.width * (1 - thumbRatio / 2);
  await page.mouse.move(grab, bounds.y + bounds.height / 2);
  await page.mouse.down();
  await page.mouse.move(bounds.x + 1, bounds.y + bounds.height / 2, { steps: 8 });
  await page.mouse.up();
  await expect(previous).toBeDisabled();
  await page.mouse.move(0, 0);
  await expect(scrollbar).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
});
