import { expect, test } from '@playwright/test';

// Pages whose content depends on the day render it from the request's clock (`now`,
// lib/content/pageClock.ts), which the server HTML and the browser's first render
// share. /obtain-method used to do its day math on the host's clock, so every reader
// outside UTC got React errors #425/#418/#423 and lost the server HTML. /community's event
// list formatted its dates in the host's zone during render, the same class. The reader's
// clock is set months away from the server's, across a daylight-saving change.
const HYDRATION = /Minified React error #(?:418|423|425)|Hydration failed|did not match|error while hydrating/i;

for (const timezoneId of ['Europe/Berlin', 'America/Los_Angeles', 'Pacific/Auckland']) {
  test.describe(timezoneId, () => {
    test.use({ timezoneId });
    // /gacha and / read their banner and event windows from the request clock too; a bare
    // /stages/browse hydrated a different first render from the server's (the router is
    // ready at once without a query), which is the same failure with no clock involved.
    for (const route of ['/obtain-method', '/schedule', '/schedule?view=calendar', '/farming', '/community', '/gacha', '/', '/stages', '/stages/browse', '/stages/browse?s=pa-1']) {
      test(`${route} hydrates without a mismatch on any reader clock`, async ({ page }) => {
        const errors: string[] = [];
        page.on('pageerror', (error) => errors.push(error.message));
        page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
        await page.clock.setFixedTime(new Date('2027-03-15T03:00:00Z'));
        await page.goto(route);
        await page.waitForLoadState('networkidle');
        if (route === '/obtain-method') await expect(page.locator('.roster-class-branch', { hasText: /days until/ }).first()).toBeVisible();
        if (route === '/community') {
          // The event list renders only events still live or upcoming at the page's clock;
          // with none, the section is one line pointing at the schedule.
          const ranges = page.locator('.event-list-range');
          if (await ranges.count()) await expect(ranges.first()).toHaveText(/\d{4}/);
          else await expect(page.getByText('No upcoming community events.')).toBeVisible();
        }
        expect(errors.filter((error) => HYDRATION.test(error))).toEqual([]);
      });
    }
  });
}
