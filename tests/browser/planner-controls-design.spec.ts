import fs from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { PLANNER_PLAN } from './census-routes';

for (const theme of ['dark', 'light']) {
  test(`material goal selector and mastery artwork (${theme})`, async ({ page }, info) => {
    await page.addInitScript(({ storage, theme }) => {
      for (const [key, value] of Object.entries(storage)) localStorage.setItem(key, JSON.stringify(value));
      localStorage.setItem('theme', theme);
    }, { storage: PLANNER_PLAN, theme });
    await page.goto("/operator-planner");
    await page.getByRole('tab', { name: 'All', exact: true }).click();
    const all = page.locator('.simple-all');
    const selector = all.getByRole('button', { name: 'Choose goals for material totals', exact: true });
    await expect(selector).toBeVisible();
    await expect(selector).toContainText('4/4');
    await selector.click();
    const goals = page.getByRole('region', { name: 'Choose goals for material totals', exact: true });
    await expect.poll(async () => {
      const trigger = (await selector.boundingBox())!;
      const popup = (await goals.boundingBox())!;
      return Math.abs(trigger.x + trigger.width - popup.x - popup.width);
    }).toBeLessThan(2);
    const trigger = (await selector.boundingBox())!;
    const count = (await selector.locator('b').boundingBox())!;
    expect(count.x + count.width).toBeLessThan(trigger.x + trigger.width);
    await goals.getByRole('checkbox', { name: 'Surtr', exact: true }).uncheck();
    await expect(selector).toContainText('3/4');
    await page.keyboard.press('Escape');
    await expect(selector).toBeFocused();
    await page.getByRole('tab', { name: 'Surtr', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Choose goals for material totals', exact: true })).toHaveCount(0);
    await page.locator('.simple-state-link').nth(1).click();
    const dialog = page.getByRole('dialog', { name: 'Surtr — Set goal', exact: true });
    await expect(dialog).toBeVisible();
    for (const rank of [1, 2, 3]) {
      const button = dialog.getByRole('button', { name: `M${rank}`, exact: true }).first();
      await expect(button.getByRole('img', { name: `M${rank}`, exact: true })).toBeVisible();
      const artwork = button.getByRole('img');
      await expect(artwork).toHaveAttribute('src', new RegExp(`M${rank}\\.webp`));
      const asset = (await artwork.getAttribute('src'))!;
      expect((await page.request.get(asset)).ok()).toBe(true);
    }
    await dialog.getByRole('button', { name: 'M1', exact: true }).first().click();
    await expect(dialog.getByRole('button', { name: 'M1', exact: true }).first()).toHaveAttribute('aria-pressed', 'true');
    await fs.mkdir('.cache/planner-controls-qa', { recursive: true });
    await page.screenshot({ path: `.cache/planner-controls-qa/masteries-${info.project.name}-${theme}.png` });
    await page.keyboard.press('Escape');
    await page.getByRole('tab', { name: 'All', exact: true }).click();
    await expect(selector).toContainText('3/4');
    await selector.click();
    await expect(goals.getByRole('checkbox', { name: 'Surtr', exact: true })).not.toBeChecked();
    await page.screenshot({ path: `.cache/planner-controls-qa/goals-${info.project.name}-${theme}.png` });
  });
}
