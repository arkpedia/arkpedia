import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test('downloads the zoomed comparison as condensed and detailed PNGs', async ({ page }, info) => {
  await page.goto('/dps-calculator');
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
});
