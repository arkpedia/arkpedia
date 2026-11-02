import fs from 'node:fs/promises';
import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('arkpedia:privacy:v1', JSON.stringify({ version: 1, analytics: false, externalMedia: false, externalMediaChosen: true, savedAt: Date.now() })));
});

test('story map fit stays stable without scrollbar and resize feedback', async ({ page }, info) => {
  await page.addInitScript(() => localStorage.setItem('arkpedia:privacy:v1', JSON.stringify({ version: 1, analytics: false, externalMedia: false, externalMediaChosen: true, savedAt: Date.now() })));
  await page.goto('/story');
  await expect(page.locator('.story-map-board')).toBeVisible();
  const widths = info.project.name === 'mobile' ? [320, 412] : [1440, 1920, 1024];
  const results = [];
  for (const width of widths) {
    await page.setViewportSize({ width, height: width === 1920 ? 600 : 900 });
    const samples = await page.locator('.story-map-viewport').evaluate(async el => {
      const values: string[] = [];
      for (let frame = 0; frame < 75; frame++) {
        await new Promise(requestAnimationFrame);
        if (frame > 15) values.push(`${el.clientWidth}|${el.clientHeight}|${el.scrollWidth}|${el.scrollHeight}|${(el.querySelector('.story-map-board') as HTMLElement).style.transform}`);
      }
      return [...new Set(values)];
    });
    results.push({ width, samples });
  }
  await fs.mkdir('.cache/story-review-qa', { recursive: true });
  await fs.writeFile(`.cache/story-review-qa/sizing-${info.project.name}.json`, JSON.stringify(results, null, 2));
  for (const result of results) expect(result.samples, `stable fit at ${result.width}px`).toHaveLength(1);
});

for (const theme of ['dark', 'light']) test(`map zoom, drag, chapter and fullscreen journey (${theme})`, async ({ page }, info) => {
  await page.addInitScript(theme => localStorage.setItem('theme', theme), theme);
  await page.goto('/story');
  const map = page.locator('.story-map-viewport');
  const board = page.locator('.story-map-board');
  await expect(map).toBeVisible();
  const initial = await board.evaluate(el => el.getBoundingClientRect().width);
  const viewportHeight = await map.evaluate(el => el.getBoundingClientRect().height);
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
  await expect.poll(() => board.evaluate(el => el.getBoundingClientRect().width)).toBeGreaterThan(initial * 1.2);
  expect(Math.abs(await map.evaluate(el => el.getBoundingClientRect().height) - viewportHeight)).toBeLessThanOrEqual(1);
  const chapter = map.locator('a[href="/story?chapter=main_0"]').first();
  await chapter.scrollIntoViewIfNeeded();
  const box = (await chapter.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 - 65, box.y + box.height / 2 - 30, { steps: 8 });
  await page.mouse.up();
  await expect(page.locator('.story-chapter-dialog')).toHaveCount(0);
  await chapter.click();
  await expect(page.locator('.story-chapter-dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.story-chapter-dialog')).toHaveCount(0);
  await page.getByRole('button', { name: 'Fit', exact: true }).click();
  await expect.poll(() => map.evaluate(el => Math.max(el.scrollLeft, el.scrollTop))).toBe(0);
  await page.getByRole('button', { name: 'Full screen', exact: true }).click();
  await expect(page.locator('.story-map-frame')).toHaveClass(/is-full/);
  await page.getByRole('button', { name: 'Exit full screen', exact: true }).click();
  await expect(page.locator('.story-map-frame')).not.toHaveClass(/is-full/);
  await page.getByRole('button', { name: /^Full List/ }).click();
  await expect(page.locator('.story-library')).toBeVisible();
  await page.getByRole('button', { name: /^Full List/ }).click();
  await expect(map).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await fs.mkdir('.cache/story-review-qa', { recursive: true });
  await map.screenshot({ path: `.cache/story-review-qa/map-${info.project.name}-${theme}.png` });
});

test('zoomed map never becomes smaller than Fit after the viewport grows', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('arkpedia:privacy:v1', JSON.stringify({ version: 1, analytics: false, externalMedia: false, externalMediaChosen: true, savedAt: Date.now() })));
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto('/story');
  const view = page.locator('.story-map-viewport');
  await expect(view).toBeVisible();
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect.poll(() => view.evaluate(el => {
    const board = el.querySelector('.story-map-board')!.getBoundingClientRect();
    return Math.max(board.width / el.clientWidth, board.height / el.clientHeight);
  })).toBeGreaterThan(0.98);
});

