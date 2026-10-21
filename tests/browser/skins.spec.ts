import { expect, test } from '@playwright/test';
import { closeFilters, openFilters } from './census-routes';

test('the gallery leads with what is available now, and the tabs still narrow it', async ({ page }) => {
  // The "Available now" shelf above the gallery listed the outfits the Available now tab
  // lists (2026-09-29): gone, and under All those outfits come first instead.
  await page.clock.setFixedTime(new Date('2026-09-22T12:00:00Z'));
  await page.goto('/skins');
  await expect(page.getByRole('region', { name: 'Available now', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Close', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Random draws', exact: true })).toHaveCount(0);
  await expect(page.getByText(/Fashion Review · .* outfits in random draws/)).toHaveCount(0);
  const results = page.getByRole('main', { name: 'Skin gallery' });
  const operators = () => results.locator('.skin-card-operator').allTextContents();
  await expect(results.locator('.skin-card')).toHaveCount(30);
  const all = await operators();
  // On a phone the tabs are in the Filters sheet, applied as they are pressed.
  await openFilters(page);
  await page.getByRole('button', { name: 'Available now', exact: true }).click();
  await expect(results.locator('.skin-card')).toHaveCount(8);
  const now = await operators();
  expect(now[0]).toBe('Surtr');
  expect(all.slice(0, now.length), 'All opens on the outfits available now, in their order').toEqual(now);
  await page.getByRole('button', { name: 'Rewards', exact: true }).click();
  await expect(results.locator('.skin-card')).toHaveCount(2);
  await page.getByRole('button', { name: 'All', exact: true }).click();
  await expect(results.locator('.skin-card')).toHaveCount(30);
  await closeFilters(page);
  await results.locator('.skin-card').last().focus();
  await expect.poll(() => results.locator('.skin-card').count()).toBeGreaterThan(30);
  await expect(results.locator('.skin-card').nth(29)).toBeFocused();
  await expect(page.getByRole('button', { name: 'Show more', exact: true })).toHaveCount(0);
});
