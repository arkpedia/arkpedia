import { expect, test } from '@playwright/test';

test('available outfits have prominent artwork on a keyboard- and mouse-scrollable row', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-09-22T12:00:00Z'));
  await page.goto('/skins?availability=reward');
  const shelf = page.locator('section.skins-current');
  await expect(shelf.getByRole('heading', { name: /^Available now/ })).toBeVisible();
  // The shared ScrollRow: a named, focusable region once it overflows, under the
  // site's drawn scrollbar (.sidescroll) -- the page no longer draws its own range slider.
  const row = shelf.getByRole('region', { name: 'Outfits available now', exact: true });
  await expect(row).toBeVisible();
  await expect(row).toHaveClass(/sidescroll/);
  await expect(shelf.getByRole('slider')).toHaveCount(0);
  expect((await shelf.locator('img').first().boundingBox())!.height).toBeGreaterThanOrEqual(150);
  expect((await shelf.boundingBox())!.height).toBeLessThan(440);
  await expect(shelf.locator('.skins-current-item strong').first()).toHaveText('Surtr');
  // Cards are .btn-bare: the outfit name keeps its own case and weight, not the button voice.
  expect(await shelf.locator('.skins-current-item strong').first().evaluate(el => getComputedStyle(el).textTransform)).toBe('none');

  const scrollLeft = () => row.evaluate(el => el.scrollLeft);
  await row.focus();
  for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowRight');
  await expect.poll(scrollLeft).toBeGreaterThan(0);
  for (let i = 0; i < 6; i++) await page.keyboard.press('ArrowLeft');
  await expect.poll(scrollLeft).toBe(0);
  // It scrolls itself (headless Chromium hides scrollbars, so the drawn bar's space
  // cannot be measured here; .sidescroll above is what draws it).
  expect(await row.evaluate(el => getComputedStyle(el).overflowX)).toBe('auto');
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  // The page no longer switches the whole document to a thin scrollbar.
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).scrollbarWidth)).not.toBe('thin');
});


test('closing the shelf keeps the gallery available and direct outfits load progressively', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-09-22T12:00:00Z'));
  await page.goto('/skins');
  await expect(page.getByRole('button', { name: 'Random draws', exact: true })).toHaveCount(0);
  await expect(page.getByText(/Fashion Review · .* outfits in random draws/)).toHaveCount(0);
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  const results = page.getByRole('main', { name: 'Skin gallery' });
  await expect(page.getByRole('region', { name: 'Available now', exact: true })).toHaveCount(0);
  await expect(results).toBeFocused();
  await page.getByRole('button', { name: 'Available now', exact: true }).click();
  await expect(results.locator('.skin-card-operator').first()).toHaveText('Surtr');
  await expect(results.locator('.skin-card')).toHaveCount(8);
  await page.getByRole('button', { name: 'Rewards', exact: true }).click();
  await expect(results.locator('.skin-card')).toHaveCount(2);
  await page.getByRole('button', { name: 'All', exact: true }).click();
  await expect(results.locator('.skin-card')).toHaveCount(30);
  await results.locator('.skin-card').last().focus();
  await expect.poll(() => results.locator('.skin-card').count()).toBeGreaterThan(30);
  await expect(results.locator('.skin-card').nth(29)).toBeFocused();
  await expect(page.getByRole('button', { name: 'Show more', exact: true })).toHaveCount(0);
});
