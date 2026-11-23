import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test('downloads the zoomed comparison as condensed and detailed PNGs', async ({ page }, info) => {
  await page.goto('/dps-calculator');
  const empty = page.getByText('Add an operator to plot damage and compare builds.');
  await expect(empty).toBeVisible();
  await expect(page.getByRole('button', { name: 'Remove', exact: true })).toHaveCount(0);
  const search = page.getByRole('combobox', { name: 'Add operator' });
  await search.fill('Tragodia');
  await search.press('ArrowDown');
  await search.press('Enter');
  const cards = page.getByRole('article').filter({ has: page.getByRole('button', { name: 'Duplicate' }) });
  await expect(cards.first()).toContainText('#1 ·');
  await cards.first().getByRole('button', { name: 'Duplicate' }).click();
  await expect(cards.nth(1)).toContainText('#2 ·');
  await cards.first().getByRole('button', { name: 'Remove' }).click();
  await expect(cards.first()).toContainText('#1 ·');
  await expect(page.getByRole('rowheader', { name: /#1 Tragodia S2 M3 Blood’s Whisper/ })).toBeVisible();
  await expect(empty).toHaveCount(0);
  await page.getByRole('combobox', { name: 'Measure', exact: true }).click();
  await page.getByRole('option', { name: 'Time to first burst (s)', exact: true }).click();
  await page.getByRole('combobox', { name: 'Vertical zoom', exact: true }).click();
  await page.getByRole('option', { name: 'First 30 s', exact: true }).click();
  let height = 0;
  for (const view of ['Condensed', 'Detailed']) {
    const [file] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: view + ' PNG', exact: true }).click(),
    ]);
    expect(file.suggestedFilename()).toBe('arkpedia-dps-' + view.toLowerCase() + '.png');
    const path = info.outputPath(file.suggestedFilename());
    await file.saveAs(path);
    const png = await readFile(path);
    expect(png.subarray(0, 8)).toEqual(Buffer.from('89504e470d0a1a0a', 'hex'));
    expect(png.readUInt32BE(16)).toBe(1080);
    expect(png.readUInt32BE(20)).toBeGreaterThan(height);
    height = png.readUInt32BE(20);
  }
  await page.getByRole('button', { name: 'Remove', exact: true }).click();
  await expect(empty).toBeVisible();
  await expect(page.getByRole('button', { name: 'Detailed PNG' })).toHaveCount(0);
  await search.fill('Skadi');
  await page.getByRole('option', { name: 'Skadi', exact: true }).click();
  await expect(cards.first()).toContainText('#1 ·');
});
