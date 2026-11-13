import { expect, test } from '@playwright/test';
import { setTheme } from './overlay-checks';

for (const theme of ['dark', 'light'] as const) {
  test(`CCB contracts change enemy stats, retain map selections and clear independently (${theme})`, async ({ page }, info) => {
    await page.goto('/ccb');
    await setTheme(page, theme);
    const score = page.getByLabel('Contract score', { exact: true });
    const enemy = page.getByRole('table', { name: 'Military Hound stat comparison' });
    const atk = enemy.getByRole('row').filter({ has: page.getByRole('rowheader', { name: 'ATK', exact: true }) });
    await expect(atk.getByRole('cell')).toHaveText(['290', '290', '—']);
    await page.getByRole('button', { name: /^Hostile Forces,/ }).click();
    const contract = page.getByRole('checkbox', { name: /ATK.*30 points/ }).first();
    await contract.check();
    await expect(score).toHaveText('▲ 30');
    await expect(atk.getByRole('cell')).toHaveText(['290', '464', '+174']);
    await page.getByRole('button', { name: 'Rotational maps', exact: true }).click();
    await expect(score).toHaveText('▲ 0');
    await expect(page.getByRole('group', { name: 'Battlefields' }).getByRole('button').first()).toBeVisible();
    await page.getByRole('button', { name: 'Main map', exact: true }).click();
    await expect(score).toHaveText('▲ 30');
    await page.getByRole('button', { name: 'Clear contracts', exact: true }).click();
    await expect(score).toHaveText('▲ 0');
    await expect(atk.getByRole('cell')).toHaveText(['290', '290', '—']);
    await page.getByRole('combobox', { name: 'CCB season' }).click();
    await page.getByRole('option', { name: /CCB #1 / }).click();
    await expect(page.getByRole('combobox', { name: 'CCB season' })).toContainText('CCB #1');
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    await page.screenshot({ path: info.outputPath(`ccb-${theme}.png`) });
  });

  test(`CCB operator build controls update comparison without writing account data (${theme})`, async ({ page }, info) => {
    await page.goto('/ccb');
    await setTheme(page, theme);
    const before = await page.evaluate(() => localStorage.getItem('arkpediaAccount'));
    await page.getByRole('combobox', { name: 'Search operators' }).fill('Thorns');
    await page.getByRole('option', { name: 'Thorns', exact: true }).click();
    const table = page.getByRole('table', { name: 'Thorns stat comparison' });
    await expect(table).toBeVisible();
    const hp = table.getByRole('row').filter({ has: page.getByRole('rowheader', { name: 'HP', exact: true }) }).getByRole('cell').first();
    const original = await hp.innerText();
    await page.getByRole('combobox', { name: 'Operator promotion' }).click();
    await page.getByRole('option', { name: 'Elite 2', exact: true }).click();
    await page.getByRole('spinbutton', { name: 'Operator level', exact: true }).fill('90');
    await expect(hp).not.toHaveText(original);
    await page.getByRole('spinbutton', { name: 'Operator trust', exact: true }).fill('200');
    await expect(page.getByRole('combobox', { name: 'Operator module' })).toBeEnabled();
    expect(await page.evaluate(() => localStorage.getItem('arkpediaAccount'))).toBe(before);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    await table.scrollIntoViewIfNeeded();
    await page.screenshot({ path: info.outputPath(`ccb-build-${theme}.png`) });
    await page.getByRole('button', { name: 'Reset to E0 Lv 1', exact: true }).click();
    await expect(hp).toHaveText(original);
  });
}
