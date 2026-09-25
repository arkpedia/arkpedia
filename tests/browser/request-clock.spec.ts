import { expect, test } from '@playwright/test';

// Pages whose content depends on the day render it from the request's clock (`now`,
// lib/content/pageClock.ts), which the server HTML and the browser's first render
// share. /obtain-method used to do its day math on the host's clock, so every reader
// outside UTC got React errors #425/#418/#423 and lost the server HTML. The reader's
// clock is set months away from the server's, across a daylight-saving change.
const HYDRATION = /Minified React error #(?:418|423|425)|Hydration failed|did not match|error while hydrating/i;

for (const timezoneId of ['Europe/Berlin', 'America/Los_Angeles', 'Pacific/Auckland']) {
  test.describe(timezoneId, () => {
    test.use({ timezoneId });
    for (const route of ['/obtain-method', '/schedule', '/schedule?view=calendar', '/farming']) {
      test(`${route} hydrates without a mismatch on any reader clock`, async ({ page }) => {
        const errors: string[] = [];
        page.on('pageerror', (error) => errors.push(error.message));
        page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
        await page.clock.setFixedTime(new Date('2027-03-15T03:00:00Z'));
        await page.goto(route);
        await page.waitForLoadState('networkidle');
        if (route === '/obtain-method') await expect(page.locator('.roster-class-branch', { hasText: /days until/ }).first()).toBeVisible();
        expect(errors.filter((error) => HYDRATION.test(error))).toEqual([]);
      });
    }
  });
}
