import { expect, test } from '@playwright/test';
import { readOnly } from './census-routes';

for (const theme of ['dark', 'light']) {
  test(`an archived event opens its launch card from the end of the tabs (${theme})`, async ({ page }) => {
    await readOnly(page);
    await page.addInitScript(theme => {
      localStorage.setItem('theme', theme);
      localStorage.setItem('arkpedia:event-start-clock', '24h');
    }, theme);
    await page.goto('/events/' + encodeURIComponent('Duel Channel: Ivy Vine'));
    const tabs = page.getByRole('tablist', { name: 'Event sections' });
    const launch = page.getByRole('button', { name: 'Launch Time', exact: true });
    await expect(tabs).toBeVisible();
    const originalTab = await tabs.getByRole('tab', { selected: true }).textContent();
    const navRight = await page.locator('.event-detail-nav').evaluate(nav => nav.getBoundingClientRect().right);
    expect(await launch.evaluate(button => button.getBoundingClientRect().right)).toBeCloseTo(navRight, 0);
    await launch.focus();
    await page.keyboard.press('Enter');
    const card = page.getByRole('dialog', { name: 'Duel Channel: Ivy Vine · Start times' });
    await expect(card.getByRole('button', { name: '24h', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(card.getByRole('img', { name: /worldwide start times/ })).toBeVisible({ timeout: 20000 });
    await card.getByRole('button', { name: 'View as text' }).click();
    await expect(card.locator('caption')).toContainText('Global event · Start · 23 Sept 2026');
    await page.keyboard.press('Escape');
    await expect(card).toHaveCount(0);
    await expect(launch).toBeFocused();
    await expect(tabs.getByRole('tab', { selected: true })).toHaveText(originalTab!);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}
