import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const event = '/events/' + encodeURIComponent('[Side Story – Crossover] Thunder in the Azure Dream') + '#rewards';

for (const theme of ['dark', 'light']) {
  test(`reward image preserves every displayed quantity in ${theme}`, async ({ page }) => {
    await page.addInitScript(theme => {
      localStorage.setItem('theme', theme);
      const labels: string[] = [];
      const images: string[] = [];
      Object.assign(window, { rewardExportLabels: labels, rewardExportImages: images });
      const source = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src')!;
      Object.defineProperty(HTMLImageElement.prototype, 'src', { ...source, set(value: string) {
        images.push(value);
        source.set!.call(this, value);
      } });
      const draw = CanvasRenderingContext2D.prototype.fillText;
      CanvasRenderingContext2D.prototype.fillText = function (text, x, y, maxWidth) {
        labels.push(text);
        if (maxWidth === undefined) draw.call(this, text, x, y);
        else draw.call(this, text, x, y, maxWidth);
      };
    }, theme);
    await page.goto(event);
    await page.getByRole('tab', { name: 'Rewards', exact: true }).click();
    const expected = await page.locator('.reward-summary-tile b').allTextContents();
    expect(expected.length).toBeGreaterThan(10);
    const artwork = await page.locator('.event-detail-image-wrap img').getAttribute('src');
    expect(artwork).toBeTruthy();
    await page.evaluate(() => { (window as unknown as { rewardExportImages: string[] }).rewardExportImages.length = 0; });
    // A missing CDN image must not remove its reward, quantity or the download.
    if (theme === 'light') await page.route('**/arkpedia-image-assets/**', route => route.abort());
    const waiting = page.waitForEvent('download');
    const save = page.getByRole('button', { name: 'Save image', exact: true });
    await save.click();
    const download = await waiting;
    expect(await download.failure()).toBeNull();
    const png = await readFile((await download.path())!);
    expect(png.subarray(1, 4).toString()).toBe('PNG');
    expect(png.readUInt32BE(16)).toBe(2880);
    expect(png.readUInt32BE(20)).toBeGreaterThan(800);
    const labels = await page.evaluate(() => (window as unknown as { rewardExportLabels: string[] }).rewardExportLabels);
    expect(labels.filter(text => text.startsWith('×')).sort()).toEqual(expected.sort());
    expect(labels).toContain('Originite Prime');
    expect(labels).toContain('EVENT REWARDS');
    const images = await page.evaluate(() => (window as unknown as { rewardExportImages: string[] }).rewardExportImages);
    expect(images, 'download uses the displayed regional artwork, including Global replacements').toContain(artwork);
    expect(labels.join(' ')).not.toContain('Global dates and rewards await confirmation');
    await expect(save).toBeEnabled();
  });
}
