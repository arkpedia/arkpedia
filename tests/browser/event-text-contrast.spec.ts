import { expect, test, type Page } from '@playwright/test';

// Sample rendered pixels underneath text, with its ink hidden for the capture.
// White/black art cover both extremes without relying on a particular CDN image.
async function readableText(page: Page, selectors: string) {
  const samples = await page.locator(selectors).evaluateAll(elements => elements.flatMap(el => {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const result: { text: string; color: string; x: number; y: number }[] = [];
    let node: Node | null;
    while ((node = walker.nextNode())) {
      const parent = node.parentElement!;
      if (!node.textContent?.trim() || parent.closest('.visually-hidden') || !parent.checkVisibility()) continue;
      const range = document.createRange(); range.selectNodeContents(node);
      for (const rect of range.getClientRects()) {
        if (rect.height < 3 || rect.top < 0 || rect.bottom > innerHeight) continue;
        for (const fraction of [.1, .5, .9]) result.push({
          text: node.textContent.trim(), color: getComputedStyle(parent).color,
          x: rect.left + rect.width * fraction, y: rect.top + rect.height / 2,
        });
      }
    }
    return result;
  }));
  expect(samples.length).toBeGreaterThan(10);
  const hidden = await page.addStyleTag({ content: '.artwork-page * { -webkit-text-fill-color: transparent !important; text-shadow: none !important; }' });
  const background = (await page.screenshot()).toString('base64');
  await hidden.evaluate(el => el.parentNode!.removeChild(el));
  const measured = await page.evaluate(async ({ samples, background }) => {
    const image = new Image(); image.src = `data:image/png;base64,${background}`; await image.decode();
    const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
    const context = canvas.getContext('2d', { willReadFrequently: true })!; context.drawImage(image, 0, 0);
    const ink = document.createElement('canvas').getContext('2d', { willReadFrequently: true })!;
    const luminance = (rgb: number[]) => rgb.reduce((sum, value, index) => {
      const v = value / 255;
      return sum + [.2126, .7152, .0722][index] * (v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
    }, 0);
    return samples.map(sample => {
      ink.fillStyle = sample.color; ink.fillRect(0, 0, 1, 1);
      const foreground = luminance(Array.from(ink.getImageData(0, 0, 1, 1).data).slice(0, 3));
      const pixel = context.getImageData(Math.floor(sample.x * image.width / innerWidth), Math.floor(sample.y * image.height / innerHeight), 1, 1).data;
      const ground = luminance(Array.from(pixel).slice(0, 3));
      return { text: sample.text, ratio: (Math.max(foreground, ground) + .05) / (Math.min(foreground, ground) + .05) };
    });
  }, { samples, background });
  expect(measured.filter(sample => sample.ratio < 4.5), 'event text below 4.5:1 over artwork').toEqual([]);
}

for (const theme of ['dark', 'light']) test(`event text stays readable over bright and dark artwork (${theme})`, async ({ page }) => {
  await page.addInitScript(theme => localStorage.setItem('theme', theme), theme);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/events/' + encodeURIComponent("[Rerun] The Masses' Travels Rerun"));
  await page.evaluate(() => document.fonts.ready);
  await page.addStyleTag({ content: '.event-page-art img { visibility: hidden; }' });
  for (const art of ['#fff', '#000']) {
    await page.locator('.event-page-art').evaluate((el, art) => { (el as HTMLElement).style.background = art; }, art);
    await page.getByRole('tab', { name: 'Operators', exact: true }).click();
    await readableText(page, '.artwork-heading h1, .artwork-heading .sub, .artwork-heading .eyebrow, .event-detail-tabs .tab, .event-banner-extra-label, .event-banner-extra-name, .event-banner-extra-how, .event-banner-extra .rarity');
    await page.getByRole('tab', { name: 'Rewards', exact: true }).click();
    await readableText(page, '.event-section-head h3, .artwork-glass > .hint, .artwork-glass .tab, .reward-summary-group h4');
  }
});
