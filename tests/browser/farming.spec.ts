import { expect, test } from '@playwright/test';

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
