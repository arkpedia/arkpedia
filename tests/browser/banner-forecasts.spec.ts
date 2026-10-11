import { expect, test } from '@playwright/test';

test('Schedule lists approximate special banners and opens their empty Global lineup', async ({ page }) => {
  await page.goto('/schedule');
  const row = page.locator('.events-row', { hasText: 'Orienteering #7' });
  await expect(row).toContainText('Predicted: 2026/10/18–2026/11/01');
  await expect(row.locator('img')).toHaveCount(0);
  await expect(row.getByText('LIVE', { exact: true })).toHaveCount(0);
  await row.locator('.events-row-main').click();
  const panel = page.getByRole('dialog', { name: 'Orienteering #7', exact: true });
  await expect(panel).toBeVisible();
  await expect(panel).toContainText('Awaiting Global lineup confirmation.');
  await expect(panel).toContainText('Estimated Global:');
  await expect(panel.getByRole('heading', { name: 'Skins', exact: true })).toHaveCount(0);
  await expect(panel.getByRole('img')).toHaveCount(0);
  await panel.getByRole('link', { name: 'Banner page', exact: true }).click();
  await expect(page).toHaveURL(/gacha\?banner=Orienteering/);
  await expect(page.getByText('Awaiting Global lineup confirmation.', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Pull one operator', exact: true })).toBeDisabled();
  await expect(page.getByRole('heading', { name: /Choose 3 six/ })).toHaveCount(0);
});

test('the calendar labels special-banner forecasts and opens their preview', async ({ page }) => {
  await page.goto('/schedule?view=calendar');
  const forecast = page.getByRole('button', { name: 'Orienteering #7 · Estimated', exact: true }).first();
  await expect(forecast).toBeVisible();
  await forecast.click();
  const panel = page.getByRole('dialog', { name: 'Orienteering #7', exact: true });
  await expect(panel).toContainText('Estimated Global:');
  await expect(panel).toContainText('Awaiting Global lineup confirmation.');
});
