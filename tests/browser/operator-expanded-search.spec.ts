import { expect, test } from '@playwright/test';

test('expanded reading pane keeps navigation in bounds and offers modal search', async ({ page }, info) => {
  await page.goto('/operators/Bellone#overview');
  const expand = page.getByRole('button', { name: 'Widen operator information' });
  if (info.project.name === 'mobile') {
    await expect(expand).toBeHidden();
    await page.getByRole('combobox', { name: 'Search operators', exact: true }).fill('Penance');
    await page.getByRole('option', { name: 'Penance', exact: true }).click();
    await expect(page).toHaveURL(/operators\/Penance/);
    return;
  }
  const details = page.locator('[class*="details"]').filter({ has: page.getByRole('heading', { name: 'Bellone', exact: true }) }).first();
  const before = (await details.boundingBox())!;
  await expand.click();
  const after = (await details.boundingBox())!;
  expect(after.width).toBeGreaterThan(before.width * 1.65);
  const search = page.getByRole('button', { name: 'Search Operators', exact: true });
  const bounds = (await search.boundingBox())!;
  expect(bounds.x + bounds.width).toBeLessThan(after.x);
  await search.click();
  const dialog = page.getByRole('dialog', { name: 'Search Operators' });
  const input = dialog.getByRole('combobox');
  await expect(input).toBeFocused();
  await input.fill('zzzznooperator');
  await expect(dialog.getByText('No operators found.')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(search).toBeFocused();
  await search.click();
  await input.fill('Penance');
  await expect(dialog.getByRole('option', { name: 'Penance', exact: true })).toBeVisible();
  await page.screenshot({ path: info.outputPath('expanded-search.png') });
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/operators\/Penance/);
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('combobox', { name: 'Search operators', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
});
