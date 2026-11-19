import { expect, test } from '@playwright/test';

test('the randomized Azure Dream shop is omitted from Tier 3 farming recommendations', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-19T15:00:00Z'));
  await page.goto('/farming');

  const tier3 = page.locator('#farming-tier-3');
  const eventStore = tier3.getByRole('button', { name: 'Event Store — show source' });
  for (const [material, stage] of [['Loxic Kohl', '6-11'], ['Manganese Ore', '10-16'], ['Grindstone', '9-16'], ['RMA70-12', '9-19']]) {
    const tile = tier3.getByTitle(material, { exact: true });
    await expect(tile.getByText('Event Store', { exact: true })).toHaveCount(0);
    await expect(tile.getByRole('button', { name: `${stage} — show source` })).toBeVisible();
  }

  await page.clock.setFixedTime(new Date('2026-12-01T15:00:00Z'));
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(eventStore).toHaveCount(4);
  await eventStore.first().click();
  await expect(page.getByRole('dialog')).toContainText('A Flurry to the Flame Rerun');
});

test('collapsed farming tiers leave keyboard order and source previews return focus', async ({ page }) => {
  await page.goto('/farming');
  const tier2 = page.getByRole('button', { name: 'Tier 2', exact: true });
  const tier1 = page.getByRole('button', { name: 'Tier 1', exact: true });
  await tier2.focus();
  await page.keyboard.press('Tab');
  await expect(tier1).toBeFocused();

  await tier2.press('Enter');
  await expect(tier2).toHaveAttribute('aria-expanded', 'true');
  await tier2.press('Tab');
  const source = page.locator('#farming-tier-2').getByRole('button').first();
  await expect(source).toBeFocused();
  await source.press('Enter');
  const popup = page.getByRole('dialog');
  await expect(popup).toBeVisible();
  await expect(popup.getByRole('img')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(popup).toBeHidden();
  await expect(source).toBeFocused();
  await expect(page).toHaveURL(/\/farming$/);

  await tier2.press('Enter');
  await expect(tier2).toHaveAttribute('aria-expanded', 'false');
  await tier2.press('Tab');
  await expect(tier1).toBeFocused();
});
