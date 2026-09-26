import { expect, test } from '@playwright/test';

test('expanded reading pane stays in the frame and the header search still works', async ({ page }, info) => {
  await page.goto('/operators/Bellone#overview');
  const heading = page.getByRole('heading', { level: 1, name: 'Bellone', exact: true });
  const search = page.getByRole('combobox', { name: 'Search operators', exact: true });
  await expect(heading).toBeVisible();
  // The operator's name is the page header's h1, and the jump-to-operator search sits in
  // that header, above the workspace, whatever the split.
  expect(await heading.evaluate(el => !!el.closest('header') && !el.closest('main'))).toBe(true);
  expect(await search.evaluate(el => !!el.closest('header'))).toBe(true);
  const expand = page.getByRole('button', { name: 'Widen operator information' });
  if (info.project.name === 'mobile') {
    await expect(expand).toBeHidden();
  } else {
    const details = page.locator('[class*="details"]').filter({ has: page.getByRole('navigation', { name: 'Operator sections' }) }).first();
    const before = (await details.boundingBox())!;
    await expand.click();
    const after = (await details.boundingBox())!;
    expect(after.width).toBeGreaterThan(before.width * 1.65);
    // The frame does not move: the panel's right edge stays on the header's.
    const frame = (await page.locator('header.page-header').boundingBox())!;
    expect(Math.abs(after.x + after.width - (frame.x + frame.width - 24))).toBeLessThanOrEqual(1);
    await expect(search).toBeVisible();
  }
  await search.fill('zzzznooperator');
  await expect(page.getByText('No operators found.')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('listbox', { name: 'Matching operators' })).toHaveCount(0);
  await search.fill('Penance');
  await expect(page.getByRole('option', { name: 'Penance', exact: true })).toBeVisible();
  await page.screenshot({ path: info.outputPath('header-search.png') });
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/operators\/Penance/);
  await expect(page.getByRole('heading', { level: 1, name: 'Penance', exact: true })).toBeVisible();
  await expect(search).toHaveValue('');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
});
