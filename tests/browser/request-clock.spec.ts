import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('arkpedia:privacy:v1', JSON.stringify({ version: 1, analytics: false, externalMedia: false, savedAt: Date.now() })));
});

// Pages whose content depends on the day render it from the request's clock (`now`,
// lib/content/pageClock.ts), which the server HTML and the browser's first render
// share. /obtain-method used to do its day math on the host's clock, so every reader
// outside UTC got React errors #425/#418/#423 and lost the server HTML. /community's event
// list formatted its dates in the host's zone during render, the same class. The reader's
// clock is set months away from the server's, across a daylight-saving change.
const HYDRATION = /Minified React error #(?:418|423|425)|Hydration failed|did not match|error while hydrating/i;

test('switching imported accounts keeps the header clock and supply rotation on the same server', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-18T19:00:00Z'));
  await page.addInitScript(() => localStorage.setItem('arkpediaAccount', JSON.stringify({
    version: 1, server: 'jp', importedAt: '2026-10-16T00:00:00Z', doctor: 'Regional fixture', operators: [], skins: [], cleared: [],
  })));
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/stages/supplies');
  const clock = page.locator('.site-nav-clock:visible').first();
  for (const server of ['jp', 'kr', 'en', 'jp']) {
    await page.evaluate(server => {
      const account = JSON.parse(localStorage.getItem('arkpediaAccount')!);
      localStorage.setItem('arkpediaAccount', JSON.stringify({ ...account, server }));
      window.dispatchEvent(new Event('arkpediaAccountChanged'));
    }, server);
    const inDrawer = !await clock.isVisible();
    if (inDrawer) await page.getByRole('button', { name: 'Open navigation menu', exact: true }).click();
    await expect(clock).toContainText(server.toUpperCase());
    await expect(clock).toContainText(server === 'en' ? '12:00' : '04:00');
    if (inDrawer) await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: server === 'en' ? 'Sunday, today' : 'Monday, today', exact: true })).toHaveAttribute('aria-pressed', 'true');
  }
  expect(errors).toEqual([]);
});

for (const timezoneId of ['Europe/Berlin', 'America/Los_Angeles', 'Pacific/Auckland']) {
  test.describe(timezoneId, () => {
    test.use({ timezoneId });
    // /gacha and / read their banner and event windows from the request clock too; a bare
    // /stages/browse hydrated a different first render from the server's (the router is
    // ready at once without a query), which is the same failure with no clock involved.
    for (const route of ['/obtain-method', '/schedule', '/schedule?view=calendar', '/farming', "/world", "/gacha-simulator", '/', '/stages', '/stages/browse', '/stages/browse?s=pa-1']) {
      test(`${route} hydrates without a mismatch on any reader clock`, async ({ page }) => {
        const errors: string[] = [];
        page.on('pageerror', (error) => errors.push(error.message));
        page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
        await page.clock.setFixedTime(new Date('2027-03-15T03:00:00Z'));
        await page.goto(route);
        await page.waitForLoadState('networkidle');
        if (route === '/obtain-method') await expect(page.locator('.roster-class-branch', { hasText: /days until/ }).first()).toBeVisible();
        if (route === "/world") {
          // The event list and the map are always drawn (an ended event says Ended), and
          // the list's dates are formatted on the request's clock.
          await expect(page.locator('.world-map-svg')).toBeVisible();
          const ranges = page.locator('.event-list-range');
          if (await ranges.count()) await expect(ranges.first()).toHaveText(/\d{4}/);
        }
        expect(errors.filter((error) => HYDRATION.test(error))).toEqual([]);
      });
    }
  });
}
