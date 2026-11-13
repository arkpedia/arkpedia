import { createHash } from 'node:crypto';
import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const event = '/events/' + encodeURIComponent('[Side Story – Crossover] Thunder in the Azure Dream') + '#rewards';

async function openImage(page: Page) {
  await page.getByRole('button', { name: 'View rewards image fullscreen', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save image', exact: true })).toBeEnabled();
}

async function overviewFits(page: Page) {
  const dialog = page.getByRole('dialog');
  const image = dialog.locator('.reward-image-preview img');
  await expect(image).toBeVisible();
  await expect.poll(() => image.evaluate(el => (el as HTMLImageElement).naturalWidth)).toBeGreaterThan(1000);
  const layout = await dialog.evaluate(el => {
    const preview = el.querySelector('.reward-image-preview')!;
    const image = preview.querySelector('img')!;
    const rect = image.getBoundingClientRect();
    const footer = el.querySelector('.reward-image-footer')!.getBoundingClientRect();
    return {
      containers: [el, el.querySelector('.account-dialog-body')!, preview].map(node => ({ x: node.scrollWidth - node.clientWidth, y: node.scrollHeight - node.clientHeight })),
      fit: getComputedStyle(image).objectFit,
      image: { top: rect.top, bottom: rect.bottom, height: rect.height },
      footer: { top: footer.top, bottom: footer.bottom },
      viewport: innerHeight,
    };
  });
  for (const box of layout.containers) { expect(box.x).toBeLessThanOrEqual(1); expect(box.y).toBeLessThanOrEqual(1); }
  expect(['contain', 'scale-down']).toContain(layout.fit);
  expect(layout.image.height).toBeGreaterThan(0);
  expect(layout.image.top).toBeGreaterThanOrEqual(0);
  expect(layout.image.bottom).toBeLessThanOrEqual(layout.footer.top);
  expect(layout.footer.bottom).toBeLessThan(layout.viewport);
  await expect(dialog.getByRole('button', { name: 'Copy link', exact: true })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Save image', exact: true })).toBeVisible();
  await expect(dialog.getByRole('button', { name: /Zoom rewards|Fit rewards/ })).toHaveCount(0);
}

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
    await openImage(page);
    const waiting = page.waitForEvent('download');
    const save = page.getByRole('button', { name: 'Save image', exact: true });
    await save.click();
    const download = await waiting;
    expect(await download.failure()).toBeNull();
    const png = await readFile((await download.path())!);
    expect(png.subarray(1, 4).toString()).toBe('PNG');
    const previewHash = await page.getByRole('dialog').locator('img').evaluate(async image => {
      const bytes = await (await fetch((image as HTMLImageElement).src)).arrayBuffer();
      return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), n => n.toString(16).padStart(2, '0')).join('');
    });
    expect(createHash('sha256').update(png).digest('hex')).toBe(previewHash);
    // The exporter chooses a wider canvas as live reward lists grow. Fitting the
    // preview must preserve those original pixels, never resize the saved PNG.
    expect(png.readUInt32BE(16)).toBeGreaterThanOrEqual(2880);
    expect(await page.getByRole('dialog').locator('img').evaluate(image => (image as HTMLImageElement).naturalWidth)).toBe(png.readUInt32BE(16));
    expect(png.readUInt32BE(20)).toBeGreaterThan(800);
    const labels = await page.evaluate(() => (window as unknown as { rewardExportLabels: string[] }).rewardExportLabels);
    expect(labels.filter(text => text.startsWith('×')).sort()).toEqual(expected.sort());
    expect(labels).toContain('Originite Prime');
    expect(labels).toContain('EVENT REWARDS');
    expect(labels).toContain('FREE OPERATOR');
    expect(labels.some(text => /^Total [\d,.]+ EXP$/.test(text))).toBe(true);
    expect(labels.some(text => /^Total [\d,.]+ pulls/.test(text))).toBe(true);
    const images = await page.evaluate(() => (window as unknown as { rewardExportImages: string[] }).rewardExportImages);
    expect(images, 'download uses the displayed regional artwork, including Global replacements').toContain(artwork);
    expect(labels.join(' ')).not.toContain('Global dates and rewards await confirmation');
    await expect(save).toBeEnabled();
  });
}

for (const [title, operator, skin] of [
  ["[Side Story – Celebration] The Masses' Travels", true, true],
  ['Positional Football Championship', false, true],
  ['Lifestyle Aid', false, false],
] as const) {
  test(`reward image features only the available free rewards: ${title}`, async ({ page }) => {
    await page.addInitScript(() => {
      const labels: string[] = [];
      Object.assign(window, { rewardExportLabels: labels });
      const draw = CanvasRenderingContext2D.prototype.fillText;
      CanvasRenderingContext2D.prototype.fillText = function (text, x, y, maxWidth) {
        labels.push(text);
        if (maxWidth === undefined) draw.call(this, text, x, y);
        else draw.call(this, text, x, y, maxWidth);
      };
    });
    await page.goto('/events/' + encodeURIComponent(title));
    const tab = page.getByRole('tab', { name: 'Rewards', exact: true });
    if (await tab.count()) await tab.click();
    await expect(page.locator('.reward-summary-tile b').first()).toBeVisible();
    const expected = await page.locator('.reward-summary-tile b').allTextContents();
    expect(expected.length).toBeGreaterThan(0);
    await openImage(page);
    const waiting = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Save image', exact: true }).click();
    expect(await (await waiting).failure()).toBeNull();
    const labels = await page.evaluate(() => (window as unknown as { rewardExportLabels: string[] }).rewardExportLabels);
    expect(labels.includes('FREE OPERATOR')).toBe(operator);
    expect(labels.includes('FREE SKIN')).toBe(skin);
    expect(labels.filter(text => text.startsWith('×')).sort()).toEqual(expected.sort());
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

for (const theme of ['dark', 'light']) {
  test(`Act or Die rerun features Miss.Christine's full artwork in ${theme}`, async ({ page }) => {
    await page.addInitScript(theme => {
      localStorage.setItem('theme', theme);
      const draws: { src: string; x: number; y: number; width: number; height: number }[] = [];
      const panels: { x: number; y: number; width: number; height: number }[] = [];
      const names: number[] = [];
      Object.assign(window, { welfareDraws: draws, welfarePanels: panels, welfareNames: names });
      const rect = CanvasRenderingContext2D.prototype.fillRect;
      CanvasRenderingContext2D.prototype.fillRect = function (x, y, width, height) {
        if (x > 0 && width > 200 && width < 700 && height > 150) panels.push({ x, y, width, height });
        return rect.call(this, x, y, width, height);
      };
      const text = CanvasRenderingContext2D.prototype.fillText;
      CanvasRenderingContext2D.prototype.fillText = function (label, x, y, maxWidth) {
        if (label === 'Miss.Christine') names.push(y);
        return maxWidth === undefined ? text.call(this, label, x, y) : text.call(this, label, x, y, maxWidth);
      };
      const draw = CanvasRenderingContext2D.prototype.drawImage;
      CanvasRenderingContext2D.prototype.drawImage = function (source: CanvasImageSource, ...coordinates: number[]) {
        if (source instanceof HTMLImageElement && source.src.includes('five-star-skins/Miss.Christine')) {
          draws.push({ src: source.src, x: coordinates[0], y: coordinates[1], width: coordinates.length === 8 ? coordinates[6] : coordinates[2], height: coordinates.length === 8 ? coordinates[7] : coordinates[3] });
        }
        return Reflect.apply(draw, this, [source, ...coordinates]);
      };
    }, theme);
    // Stable dimensions prove the full-body image is drawn in the large feature slot.
    await page.route('**/five-star-skins/Miss.Christine*', route => route.fulfill({
      contentType: 'image/svg+xml', headers: { 'access-control-allow-origin': '*' },
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="872" height="1119"><rect width="872" height="1119" fill="teal"/></svg>',
    }));
    await page.goto('/events/' + encodeURIComponent('[Rerun] Act or Die Rerun'));
    await page.getByRole('tab', { name: 'Rewards', exact: true }).click();
    await openImage(page);
    const waiting = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Save image', exact: true }).click();
    expect(await (await waiting).failure()).toBeNull();
    const { draws, panels, names } = await page.evaluate(() => {
      const w = window as unknown as { welfareDraws: { src: string; x: number; y: number; width: number; height: number }[]; welfarePanels: { x: number; y: number; width: number; height: number }[]; welfareNames: number[] };
      return { draws: w.welfareDraws, panels: w.welfarePanels, names: w.welfareNames };
    });
    expect(draws.length).toBeGreaterThan(0);
    expect(draws[0].width).toBeGreaterThan(200);
    expect(draws[0].height).toBeGreaterThan(300);
    const feature = panels.find(panel => panel.x <= draws[0].x && panel.y <= draws[0].y && panel.x + panel.width >= draws[0].x + draws[0].width && panel.y + panel.height >= draws[0].y + draws[0].height);
    expect(feature, 'feature art has a compact card rather than a page-height sidebar').toBeTruthy();
    expect(feature!.height).toBeLessThan(600);
    expect(names[0] - (draws[0].y + draws[0].height), 'name stays beside the artwork it describes').toBeLessThan(80);
  });
}


test('reward image links reopen the fullscreen view and Escape restores the page', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: async (value: string) => { Object.assign(window, { copiedRewardLink: value }); } } });
  });
  await page.goto(event);
  const trigger = page.getByRole('button', { name: 'View rewards image fullscreen', exact: true });
  await expect(page.locator('.reward-summary-actions').getByRole('button')).toHaveCount(1);
  await openImage(page);
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Copy link', exact: true }).click();
  const link = await page.evaluate(() => (window as unknown as { copiedRewardLink: string }).copiedRewardLink);
  expect(new URL(link).hash).toBe('#rewards/image');
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  expect(new URL(page.url()).hash).toBe('#rewards');
  await page.goto(link);
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('dialog').locator('img')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save image', exact: true })).toBeEnabled();
  await overviewFits(page);
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

for (const theme of ['dark', 'light']) {
  test(`dense celebrations export wide without losing rewards in ${theme}`, async ({ page }) => {
    await page.addInitScript(theme => {
      localStorage.setItem('theme', theme);
      const labels: { text: string; y: number }[] = [];
      Object.assign(window, { denseRewardLabels: labels });
      const draw = CanvasRenderingContext2D.prototype.fillText;
      CanvasRenderingContext2D.prototype.fillText = function (text, x, y, maxWidth) {
        labels.push({ text, y });
        return maxWidth === undefined ? draw.call(this, text, x, y) : draw.call(this, text, x, y, maxWidth);
      };
    }, theme);
    await page.goto('/events/' + encodeURIComponent('[Celebration] Critical Phase Transition') + '#rewards');
    await expect(page.locator('.reward-summary-tile b').first()).toBeVisible();
    const expected = await page.locator('.reward-summary-tile b').allTextContents();
    expect(expected.length).toBeGreaterThan(40);
    await openImage(page);
    const waiting = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Save image', exact: true }).click();
    const png = await readFile((await (await waiting).path())!);
    expect(png.readUInt32BE(16), 'dense rewards use a wide composition').toBeGreaterThan(png.readUInt32BE(20));
    const labels = await page.evaluate(() => (window as unknown as { denseRewardLabels: { text: string; y: number }[] }).denseRewardLabels);
    expect(labels.filter(label => label.text.startsWith('×')).map(label => label.text).sort()).toEqual(expected.sort());
    const features = labels.filter(label => ['FREE OPERATOR', 'FREE SKIN'].includes(label.text));
    expect(features).toHaveLength(5);
    expect(new Set(features.map(label => label.y)).size, 'all five featured rewards share one row').toBe(1);
    await overviewFits(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

for (const theme of ['dark', 'light']) test(`the entire reward overview fits without scrolling in ${theme}`, async ({ page }) => {
  test.setTimeout(90000);
  await page.addInitScript(theme => localStorage.setItem('theme', theme), theme);
  await page.goto('/events/' + encodeURIComponent('[Story Collection] Bolívar Diagnosed') + '#rewards');
  await openImage(page);
  await overviewFits(page);
  await page.setViewportSize({ width: 900, height: 420 });
  await overviewFits(page);
  await page.setViewportSize({ width: 360, height: 640 });
  await overviewFits(page);
  const preview = page.locator('.reward-image-preview');
  await preview.evaluate(el => { el.scrollTop = 1000; el.scrollLeft = 1000; });
  expect(await preview.evaluate(el => ({ x: el.scrollLeft, y: el.scrollTop }))).toEqual({ x: 0, y: 0 });
});

for (const theme of ['dark', 'light']) {
  test(`purchasable pack contents stay accessible in ${theme}`, async ({ page }) => {
    await page.addInitScript(theme => localStorage.setItem('theme', theme), theme);
    await page.goto('/events/' + encodeURIComponent('[Crossover] Languid Sentiment') + '#rewards');
    await page.getByRole('tab', { name: 'Rewards', exact: true }).click();
    await page.getByRole('tab', { name: 'Packs', exact: true }).click();
    const pack = page.locator('.event-pack-card').filter({ has: page.locator('.event-pack-card-name', { hasText: /^Fluffy and Warm Pack$/ }) });
    await expect(pack).toBeVisible();
    await pack.click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('heading', { name: 'Fluffy and Warm Pack', exact: true })).toBeVisible();
    await expect(dialog.getByText('Orundum', { exact: true })).toBeVisible();
    await dialog.getByRole('button', { name: 'Close Fluffy and Warm Pack', exact: true }).click();
    await expect(dialog).toBeHidden();
    await expect(pack).toBeFocused();
  });
}
