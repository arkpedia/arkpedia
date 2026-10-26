import { expect, test } from '@playwright/test';

// The reset label in the nav switches the whole site's server (lib/time/siteServer.ts).
test('the reset label steps the site through Global, Japan and Korea, and the choice survives a reload', async ({ page, isMobile }) => {
  await page.goto('/');
  if (isMobile) await page.getByRole('button', { name: 'Open navigation menu', exact: true }).click();
  const button = page.locator('.site-nav-clock-server:visible').first();
  await expect(button).toHaveText(/^EN (Reset|RST)$/);
  await button.click();
  await expect(button).toHaveText(/^JP (Reset|RST)$/);
  await expect(page.locator('html')).toHaveAttribute('data-site-server', 'jp');
  // The phone clock now lives in the drawer; changing region keeps that drawer open.
  await expect(page.locator('.mobile-nav-drawer.open')).toHaveCount(isMobile ? 1 : 0);
  await button.click();
  await expect(button).toHaveText(/^KR (Reset|RST)$/);
  await page.reload();
  if (isMobile) await page.getByRole('button', { name: 'Open navigation menu', exact: true }).click();
  await expect(page.locator('.site-nav-clock-server:visible').first()).toHaveText(/^KR (Reset|RST)$/);
  await page.locator('.site-nav-clock-server:visible').first().click();
  await expect(page.locator('.site-nav-clock-server:visible').first()).toHaveText(/^EN (Reset|RST)$/);
  await expect(page.locator('html')).not.toHaveAttribute('data-site-server', /./);
});
