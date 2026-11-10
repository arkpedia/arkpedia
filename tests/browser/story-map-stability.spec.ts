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
        if (frame > 15) values.push(`${el.clientWidth}|${el.clientHeight}|${el.scrollWidth}|${el.scrollHeight}|${el.querySelector('.story-map-board')!.getBoundingClientRect().width}`);
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
  await page.evaluate(() => document.fonts.ready);
  const initial = await board.evaluate(el => el.getBoundingClientRect().width);
  // Keep the large source board out of a transformed paint surface on phones.
  // Its painted bounds must still match the scrollable area at every zoom.
  const checkPaintBounds = async () => {
    const geometry = await board.evaluate(el => {
      const rect = el.getBoundingClientRect();
      const sizer = el.parentElement!.getBoundingClientRect();
      return { transform: getComputedStyle(el).transform, zoom: getComputedStyle(el).zoom, width: Math.abs(rect.width - sizer.width), height: Math.abs(rect.height - sizer.height) };
    });
    expect(geometry.transform).toBe('none');
    expect(geometry.zoom).toBe('1');
    expect(geometry.width).toBeLessThan(1);
    expect(geometry.height).toBeLessThan(1);
  };
  await checkPaintBounds();
  const viewportHeight = await map.evaluate(el => el.getBoundingClientRect().height);
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
  await expect.poll(() => board.evaluate(el => el.getBoundingClientRect().width)).toBeGreaterThan(initial * 1.2);
  await checkPaintBounds();
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

test('readable SVG labels scale with the artwork', async ({ page }) => {
  await page.goto('/story');
  await page.evaluate(() => document.fonts.ready);
  const board = page.locator('.story-map-board');
  const label = page.locator('.story-map-text text').first();
  const ink = () => label.evaluate(el => {
    const glyph = el as SVGGraphicsElement, box = glyph.getBBox(), matrix = glyph.getScreenCTM()!;
    return { width: box.width * Math.hypot(matrix.a, matrix.b), height: box.height * Math.hypot(matrix.c, matrix.d) };
  });
  const zoom = page.getByRole('button', { name: 'Zoom in', exact: true });
  // At Fit some labels are below one CSS pixel. Compare glyph geometry at a
  // readable scale, avoiding platform-specific font hinting and clipped Range boxes.
  for (let steps = 0; steps < 12 && (await ink()).height < 16; steps++) await zoom.click();
  expect((await ink()).height).toBeGreaterThanOrEqual(16);
  await expect(zoom).toBeEnabled();
  const before = { ink: await ink(), board: await board.evaluate(el => el.getBoundingClientRect().width) };
  await zoom.click();
  await expect.poll(() => board.evaluate(el => el.getBoundingClientRect().width)).toBeGreaterThan(before.board);
  const ratio = await board.evaluate(el => el.getBoundingClientRect().width) / before.board;
  expect(Math.abs((await ink()).width / before.ink.width - ratio), 'labels scale with the artwork').toBeLessThan(0.05);
});

test('mobile text enlargement keeps diagram labels aligned with the artwork', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'mobile text inflation');
  await page.goto('/story');
  test.skip(!await page.evaluate(() => CSS.supports('text-size-adjust', '500%')), 'this engine does not implement mobile text inflation');
  const text = page.locator('.story-map-text').first();
  await expect(text).toBeVisible();
  const size = () => text.evaluate(el => {
    const range = document.createRange(); range.selectNodeContents(el);
    const rect = range.getBoundingClientRect();
    return { width: rect.width, height: rect.height };
  });
  const before = await size();
  await page.addStyleTag({ content: 'html { -webkit-text-size-adjust: 500%; text-size-adjust: 500%; }' });
  const after = await size();
  expect(Math.abs(after.width - before.width)).toBeLessThan(0.5);
  expect(Math.abs(after.height - before.height)).toBeLessThan(0.5);
});


test('mobile pinch zoom belongs to the map and preserves native page zoom outside it', async ({ page, isMobile, browserName }) => {
  test.skip(!isMobile || browserName !== 'chromium', 'real multi-touch input uses Chromium CDP; iPhone is checked directly');
  await page.goto('/story');
  const map = page.locator('.story-map-viewport');
  await expect(map).toBeVisible();
  await expect.poll(() => map.evaluate(el => el.querySelector('.story-map-board')!.getBoundingClientRect().width <= el.clientWidth)).toBe(true);
  await map.scrollIntoViewIfNeeded();
  const box = (await map.boundingBox())!;
  const cx = box.x + box.width / 2, cy = box.y + box.height / 4;
  const state = () => map.evaluate(el => {
    const board = el.querySelector('.story-map-board')!.getBoundingClientRect();
    return { width: board.width, height: board.height, left: el.scrollLeft, top: el.scrollTop,
      pageScale: visualViewport!.scale, pageY: scrollY };
  });
  const before = await state();
  const local = await map.evaluate((el, point) => {
    const r = el.getBoundingClientRect();
    return { x: point.x - r.left - el.clientLeft, y: point.y - r.top - el.clientTop };
  }, { x: cx, y: cy });
  // Observe painted frames during the gesture, not only the settled final size.
  // A scroll update against the previous map size makes the artwork jump even
  // when the final anchor is correct.
  await map.evaluate((el, point) => {
    const board = el.querySelector('.story-map-board')!;
    const initial = board.getBoundingClientRect();
    const sourceX = (el.scrollLeft + point.x) / initial.width;
    const sourceY = (el.scrollTop + point.y) / initial.height;
    const trace = { active: true, errors: [] as number[] };
    Object.assign(window, { storyPinchTrace: trace });
    const sample = () => {
      if (!trace.active) return;
      const rect = board.getBoundingClientRect();
      const expectedX = Math.max(0, Math.min(el.scrollWidth - el.clientWidth, sourceX * rect.width - point.x));
      const expectedY = Math.max(0, Math.min(el.scrollHeight - el.clientHeight, sourceY * rect.height - point.y));
      trace.errors.push(Math.max(Math.abs(el.scrollLeft - expectedX), Math.abs(el.scrollTop - expectedY)));
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  }, local);
  const touch = await page.context().newCDPSession(page);
  const points = (half: number, x = cx, y = cy) => [
    { id: 1, x: x - half, y, radiusX: 8, radiusY: 8 },
    { id: 2, x: x + half, y, radiusX: 8, radiusY: 8 },
  ];
  try {
    await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: points(30) });
    for (let half = 40; half <= 110; half += 10) {
      await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: points(half) });
      await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    }
    await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect.poll(async () => (await state()).width).toBeGreaterThan(before.width * 3);
    const zoomed = await state();
    expect(zoomed.pageScale).toBeCloseTo(before.pageScale, 4);
    expect(zoomed.pageY).toBeCloseTo(before.pageY, 0);
    // The same source point remains under the pinch midpoint.
    const frameErrors = await page.evaluate(() => {
      const trace = (window as unknown as { storyPinchTrace: { active: boolean; errors: number[] } }).storyPinchTrace;
      trace.active = false;
      return trace.errors;
    });
    expect(frameErrors.length).toBeGreaterThan(8);
    expect(Math.max(...frameErrors)).toBeLessThan(2);
    expect((zoomed.left + local.x) / zoomed.width).toBeCloseTo((before.left + local.x) / before.width, 2);
    expect((zoomed.top + local.y) / zoomed.height).toBeCloseTo((before.top + local.y) / before.height, 2);
    await expect(page.locator('.story-chapter-dialog')).toHaveCount(0);

    // Moving the midpoint without changing finger spacing pans at a fixed scale.
    await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: points(80) });
    await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: points(80, cx - 30, cy) });
    await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect.poll(async () => (await state()).left).toBeGreaterThan(zoomed.left + 20);
    const translated = await state();
    expect(translated.width).toBeCloseTo(zoomed.width, 0);

    // A single finger still pans the native scroller after the pinch ends.
    const finger = { id: 3, x: cx, y: cy + 30, radiusX: 8, radiusY: 8 };
    await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [finger] });
    for (let d = 10; d <= 70; d += 10) {
      await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...finger, x: cx - d }] });
    }
    await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect.poll(async () => (await state()).left).toBeGreaterThan(translated.left + 30);
    expect((await state()).pageScale).toBeCloseTo(before.pageScale, 4);
    await expect(page.locator('.story-chapter-dialog')).toHaveCount(0);

    // Wait for observed native momentum to finish. On Linux a tap during a fling
    // may only stop the scroller, rather than activate the button it lands on.
    await map.evaluate(async el => {
      let stable = 0, left = el.scrollLeft, top = el.scrollTop;
      for (let frame = 0; frame < 180; frame++) {
        await new Promise(requestAnimationFrame);
        if (el.scrollLeft === left && el.scrollTop === top) {
          if (++stable >= 8) return;
        } else stable = 0;
        left = el.scrollLeft;
        top = el.scrollTop;
      }
      throw new Error('Native map pan did not settle before Fit');
    });
    await page.getByRole('button', { name: 'Fit', exact: true }).tap();
    await expect.poll(async () => (await state()).width).toBeCloseTo(before.width, 0);
    // Pinching smaller cannot go below Fit or hand the gesture to page zoom.
    await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: points(80) });
    await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: points(25) });
    await touch.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
    expect((await state()).width).toBeCloseTo(before.width, 0);
    expect((await state()).pageScale).toBeCloseTo(before.pageScale, 4);

    const chapter = map.locator('a[href="/story?chapter=main_0"]').first();
    await chapter.tap();
    await expect(page.locator('.story-chapter-dialog')).toBeVisible();
    await page.locator('.story-chapter-dialog').getByRole('button', { name: 'Close', exact: true }).tap();

    // Page zoom remains enabled when a pinch starts outside the map.
    await page.evaluate(() => scrollTo(0, 0));
    const outside = { x: box.x + box.width / 2, y: 230 };
    const pageScale = (await state()).pageScale;
    await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: points(30, outside.x, outside.y) });
    for (let half = 40; half <= 110; half += 10) {
      await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: points(half, outside.x, outside.y) });
    }
    await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect.poll(() => page.evaluate(() => visualViewport!.scale)).toBeGreaterThan(pageScale * 1.2);
  } finally { await touch.detach(); }
});
