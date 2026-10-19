import { expect, test } from '@playwright/test';

// The reset label in the nav switches the whole site's server (lib/time/siteServer.ts).
test('the reset label steps the site through Global, Japan and Korea, and the choice survives a reload', async ({ page }) => {
  await page.goto('/');
  const button = page.locator('.site-nav-clock-server:visible').first();
  await expect(button).toHaveText(/^EN (Reset|RST)$/);
  await button.click();
  await expect(button).toHaveText(/^JP (Reset|RST)$/);
  await expect(page.locator('html')).toHaveAttribute('data-site-server', 'jp');
  // On a phone the clock sits in the bar whose taps open the drawer: the switch must not.
  await expect(page.locator('.mobile-nav-drawer.open')).toHaveCount(0);
  await button.click();
  await expect(button).toHaveText(/^KR (Reset|RST)$/);
  await page.reload();
  await expect(page.locator('.site-nav-clock-server:visible').first()).toHaveText(/^KR (Reset|RST)$/);
  await page.locator('.site-nav-clock-server:visible').first().click();
  await expect(page.locator('.site-nav-clock-server:visible').first()).toHaveText(/^EN (Reset|RST)$/);
  await expect(page.locator('html')).not.toHaveAttribute('data-site-server', /./);
});
