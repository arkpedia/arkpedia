import { expect, test } from '@playwright/test';

for (const timezoneId of ['UTC', 'Europe/Zurich', 'America/Los_Angeles', 'America/New_York', 'Asia/Tokyo', 'Asia/Shanghai', 'Pacific/Auckland', 'Pacific/Honolulu']) {
  test.describe(timezoneId, () => {
    test.use({ timezoneId });
    test('operator availability changes at the confirmed instant without reloading', async ({ page }) => {
      const opening = Date.parse('2026-09-16T15:00:00Z');
      await page.clock.setFixedTime(new Date(opening - 4 * 3600000));
      await page.goto('/operators');
      const names = ['Zima the Raging Tide', 'Ukusik', 'Botani'];
      for (const name of names) {
        const card = page.locator('.roster-card').filter({ has: page.getByText(name, { exact: true }) });
        await expect(card.locator('.roster-release-tag')).toHaveText('In 4h');
      }
      await page.getByRole('searchbox', { name: 'Search operators' }).fill('Zima the Raging Tide');
      const card = page.locator('.roster-card');
      await expect(card).toHaveCount(1);
      await page.clock.setFixedTime(new Date(opening - 1));
      await expect(card.locator('.roster-release-tag')).toHaveText('In 1m');
      const before = await card.boundingBox();
      await page.clock.setFixedTime(new Date(opening));
      await expect(card.locator('.roster-release-tag')).toHaveText('Now Available');
      expect(await card.boundingBox()).toEqual(before);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    });
  });
}
