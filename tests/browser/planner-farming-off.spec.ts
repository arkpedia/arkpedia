import { expect, test } from '@playwright/test';
import { PLANNER_PLAN, plannerExperimental, readOnly } from './census-routes';

for (const theme of ['dark', 'light']) {
  test(`Off removes event, shop and permanent rewards and stays off after reload (${theme})`, async ({ page }, info) => {
    await readOnly(page);
    await page.goto('/operator-planner');
    await plannerExperimental(page, { ...PLANNER_PLAN, theme, plannerDepot: {}, plannerFarmingMethod: {
      until: { mode: 'off' }, permanent: ['is-2', 'is-5', 'is-6', 'ra-2', 'ra-3', 'sss'], shop: true, unlimitedShop: true,
    } });
    const trigger = page.getByRole('button', { name: 'Farming method', exact: true });
    await expect(page.locator('.planner-farming-note')).not.toHaveCount(0);
    await expect(page.locator('.need-card-for').filter({ hasText: 'expected from rewards and shops' })).not.toHaveCount(0);
    await trigger.click();
    const menu = page.getByRole('region', { name: 'Farming method', exact: true });
    await expect(menu.getByRole('button', { name: 'Permanent only', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(menu.getByRole('button', { name: 'Off', exact: true })).toHaveAttribute('aria-pressed', 'false');
    await menu.getByRole('button', { name: 'Off', exact: true }).click();
    await expect(menu.getByRole('button', { name: 'Off', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.planner-farming-note')).toHaveCount(0);
    await expect(page.locator('.need-card-for').filter({ hasText: 'expected from rewards and shops' })).toHaveCount(0);
    await expect(menu.getByRole('checkbox')).toHaveCount(0);
    await expect(menu.getByRole('button', { name: 'Permanent only', exact: true })).toHaveAttribute('aria-pressed', 'false');
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('plannerFarmingMethod')!))).toMatchObject({ until: { mode: 'off' }, permanent: [] });
    if (process.env.ARKPEDIA_QA_CAPTURE) await page.screenshot({ animations: 'disabled', path: `${process.env.ARKPEDIA_QA_CAPTURE}/planner-off-${theme}-${info.project.name}.png` });
    await page.keyboard.press('Escape'); await expect(trigger).toBeFocused();
    await expect(trigger).not.toHaveClass(/\bon\b/);
    await page.reload();
    await trigger.click();
    await expect(menu.getByRole('button', { name: 'Off', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.planner-farming-note')).toHaveCount(0);
    await menu.getByRole('button', { name: 'Permanent only', exact: true }).click();
    await menu.getByRole('checkbox', { name: /^IS2\b/ }).check();
    await expect(page.locator('.planner-farming-note')).toContainText('unclaimed IS2 rewards');
    await menu.getByRole('button', { name: 'A date', exact: true }).click();
    await menu.getByLabel('Until', { exact: true }).fill('2099-12-31');
    await expect(menu.getByRole('checkbox', { name: 'Buy limited-stock materials from the shops' })).toBeEnabled();
    await expect(page.locator('.planner-farming-note')).toHaveCount(2);
    await menu.getByRole('button', { name: 'Off', exact: true }).click();
    await expect(page.locator('.planner-farming-note')).toHaveCount(0);
    await expect(page.locator('.need-card-for').filter({ hasText: 'expected from rewards and shops' })).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(await menu.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  });
}
