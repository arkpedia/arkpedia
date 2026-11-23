import { expect, test } from '@playwright/test';
import { createHash } from 'node:crypto';
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
  await page.getByRole('option', { name: '30 s window', exact: true }).click();
  let height = 0;
  for (const view of ['Condensed', 'Detailed']) {
    await page.getByRole('button', { name: view + ' PNG', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: view + ' PNG preview' });
    const picture = dialog.getByRole('img');
    await expect(picture).toBeVisible();
    const previewHex = await picture.evaluate(async el => {
      const bytes = await (await fetch((el as HTMLImageElement).src)).arrayBuffer();
      return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))).join(',');
    });
    const [file] = await Promise.all([
      page.waitForEvent('download'),
      dialog.getByRole('button', { name: 'Save image' }).click(),
    ]);
    expect(file.suggestedFilename()).toBe('arkpedia-dps-' + view.toLowerCase() + '.png');
    const path = info.outputPath(file.suggestedFilename());
    await file.saveAs(path);
    const png = await readFile(path);
    expect(png.subarray(0, 8)).toEqual(Buffer.from('89504e470d0a1a0a', 'hex'));
    expect(png.readUInt32BE(16)).toBe(1080);
    expect(png.readUInt32BE(20)).toBeGreaterThan(height);
    expect(Array.from(createHash('sha256').update(png).digest()).join(',')).toBe(previewHex);
    await dialog.getByRole('button', { name: 'Close' }).click();
    height = png.readUInt32BE(20);
  }
  await page.getByRole('button', { name: 'Remove', exact: true }).click();
  await expect(empty).toBeVisible();
  await expect(page.getByRole('button', { name: 'Detailed PNG' })).toHaveCount(0);
  await search.fill('Skadi');
  await page.getByRole('option', { name: 'Skadi', exact: true }).click();
  await expect(cards.first()).toContainText('#1 ·');
});

test('SilverAsh S2 opens a timeline for modeled and full-roster allies', async ({ page }) => {
  await page.goto('/dps-calculator');
  const timeline = page.locator('summary').filter({ hasText: 'Deployment timeline' });
  await expect(timeline).toHaveCount(0);
  const add = async (label: string, name: string) => {
    await page.getByRole('combobox', { name: label, exact: true }).fill(name);
    await page.getByRole('option', { name, exact: true }).click();
  };
  await add('Add operator', 'SilverAsh the Reignfrost');
  await timeline.click();
  await add('Add timeline ally', 'Phantom');
  const table = page.getByRole('table', { name: /Deployment ·/ });
  await expect(table).toContainText('Bloody Opus');
  await add('Add timeline ally', 'Shining');
  await page.getByRole('spinbutton', { name: 'Ally ATK at impact' }).fill('1200');
  await expect(table.getByRole('row').filter({ hasText: 'Stored S2 strike 1' })).toContainText('1,200');
  await page.getByRole('button', { name: 'Remove', exact: true }).click();
  await expect(timeline).toHaveCount(0);
});

test('inspecting a curve preserves the enemy and alternative charts export', async ({ page }) => {
  await page.goto('/dps-calculator');
  const op = page.getByRole('combobox', { name: 'Add operator', exact: true });
  for (const name of ['Tragodia', 'Exusiai']) {
    await op.fill(name);
    await page.getByRole('option', { name, exact: true }).click();
  }
  const enemy = page.getByRole('combobox', { name: 'Find enemy' });
  await enemy.fill('Slug');
  await page.getByRole('option').first().click();
  const res = page.getByRole('spinbutton', { name: 'RES', exact: true });
  const initial = await res.inputValue();
  await page.getByRole('slider', { name: 'Inspect RES' }).press('End');
  await expect(res).toHaveValue(initial);
  await expect(page.getByRole('button', { name: 'Customize', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Reset probe to target' })).toHaveCount(0);
  for (const name of ['At target', 'Elemental burst']) {
    await page.getByRole('button', { name, exact: true }).click();
    await page.getByRole('button', { name: 'Condensed PNG' }).click();
    const [file] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Save image' }).click(),
    ]);
    expect(await file.failure()).toBeNull();
    await page.getByRole('dialog').press('Escape');
  }
  await expect(page.getByRole('img', { name: /First and second elemental bursts/ })).toBeVisible();
});

test('Chen is searchable without punctuation and zoom follows Virtuosa’s burst timing', async ({ page }) => {
  await page.goto('/dps-calculator');
  const search = page.getByRole('combobox', { name: 'Add operator', exact: true });
  await search.fill('Chen');
  await page.getByRole('option', { name: "Ch'en", exact: true }).click();
  await page.getByRole('button', { name: 'Remove', exact: true }).click();
  await search.fill('Virtuosa');
  await page.getByRole('option', { name: 'Virtuosa', exact: true }).click();
  await page.getByRole('combobox', { name: 'Measure', exact: true }).click();
  await page.getByRole('option', { name: 'Time to first burst (s)', exact: true }).click();
  for (const slot of [3, 2, 1]) {
    await page.getByRole('combobox', { name: 'Damage source', exact: true }).click();
    await page.getByRole('option', { name: new RegExp('^S' + slot) }).click();
    await expect(page.getByRole('cell').filter({ hasText: /First at .* s/ }).first()).toBeVisible();
  }
  await page.getByRole('combobox', { name: 'Vertical zoom', exact: true }).click();
  await page.getByRole('option', { name: '4×', exact: true }).click();
  const slider = page.getByRole('slider', { name: 'Inspect Injury resistance' });
  const plot = page.getByRole('img', { name: /vertical range/ });
  await slider.press('Home');
  const start = await plot.getAttribute('aria-label');
  await slider.press('End');
  await expect(plot).not.toHaveAttribute('aria-label', start!);
});

test('compares Virtuosa modules at the target independently of the probe', async ({ page }) => {
  await page.goto('/dps-calculator');
  await page.getByRole('combobox', { name: 'Add operator' }).fill('Virtuosa');
  await page.getByRole('option', { name: 'Virtuosa', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Measure', exact: true })).toContainText('Time to first burst');
  const slider = page.getByRole('slider', { name: 'Inspect Injury resistance' });
  const results = page.getByRole('group', { name: 'Selected target results' });
  await expect(results).toContainText(/#1 Virtuosa S3 M3/);
  await page.getByRole('button', { name: 'Duplicate' }).click();
  await expect(results).toContainText('Same as #1');
  await page.getByRole('combobox', { name: 'Module', exact: true }).click();
  await page.getByRole('option').last().click();
  await expect(results).toContainText('#1 Virtuosa S3 M3 · No module');
  await expect(results).toContainText('#2 Virtuosa S3 M3 · RIT-X3');
  await expect(results).toContainText(/s faster than #1/);
  const atTarget = await results.innerText();
  await slider.press('End');
  expect(await results.innerText()).toBe(atTarget);
  await page.getByRole('combobox', { name: 'Measure', exact: true }).click();
  await page.getByRole('option', { name: 'Injury / s', exact: true }).click();
  await expect(results).toContainText('injury/s vs #1');
  await page.getByRole('button', { name: 'Duplicate' }).last().click();
  await expect(page.getByRole('combobox', { name: 'Measure', exact: true })).toContainText('Injury / s');
});
