import { expect, test } from '@playwright/test';

/* A special banner whose Global lineup is still pending (globalLineupPending): it is listed with
   no portraits, says so in its panel and on its banner page, and cannot be pulled. Orienteering #8
   is one in the pinned data (tests/browser/data-pin.json). A withdrawn Global estimate
   (globalForecastWithdrawn, "Global date unannounced", no calendar bar) is held by
   scripts/tests/test-event-editions.ts and test-banner-schedule.ts, since no banner in the
   pinned data carries one. */
const BANNER = 'Orienteering #8';

test('Schedule lists a special banner awaiting its Global lineup with no portraits, and its banner page cannot pull', async ({ page }) => {
  await page.goto('/schedule');
  const row = page.locator('.events-row', { hasText: BANNER });
  await expect(row).toBeVisible();
  await expect(row.locator('img')).toHaveCount(0);
  await row.locator('.events-row-main').click();
  const panel = page.getByRole('dialog', { name: BANNER, exact: true });
  await expect(panel).toBeVisible();
  await expect(panel).toContainText('Awaiting Global lineup confirmation.');
  await expect(panel.getByRole('heading', { name: 'Skins', exact: true })).toHaveCount(0);
  await expect(panel.getByRole('img')).toHaveCount(0);
  await panel.getByRole('link', { name: 'Banner page', exact: true }).click();
  await expect(page).toHaveURL(/gacha-simulator\?banner=Orienteering/);
  await expect(page.getByText('Awaiting Global lineup confirmation.', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Pull one operator', exact: true })).toBeDisabled();
  await expect(page.getByRole('heading', { name: /Choose 3 six/ })).toHaveCount(0);
});
