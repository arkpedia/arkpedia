import { expect, test } from './request-diagnostics';
import { contentUrl } from '../../lib/content/urls';

test.setTimeout(120000);

test('default and skin battle/base animations load exclusively from pinned SD assets', async ({ page }) => {
  const requested = new Set<string>();
  const failed: string[] = [];
  const isModel = (url: string) => /\.(?:skel|atlas)(?:\?|$)/.test(url)
    || /assets\.arkpedia\.net\/arkpedia\/.*\/(?:models\/operator|spine)\/.*\.png(?:\?|$)/.test(url);
  page.on('request', request => { if (isModel(request.url())) requested.add(request.url()); });
  page.on('response', response => { if (isModel(response.url()) && !response.ok()) failed.push(`${response.status()} ${response.url()}`); });
  for (const outfit of ['Base', 'Blade-cleaved Tides']) {
    await page.goto('/operators/Thorns');
    await page.getByRole('group', { name: 'Operator outfits', exact: true }).getByRole('button', { name: outfit, exact: true }).click();
    await page.getByRole('button', { name: 'Chibi viewer', exact: true }).click();
    await expect(page.locator('.chibi-window canvas')).toHaveAccessibleName(`Thorns — ${outfit} chibi`);
    const select = page.getByRole('combobox', { name: 'Chibi animation', exact: true });
    await expect(select).toContainText('Idle');
    await expect(page.locator('.chibi-window [role="status"]')).toHaveCount(0);
    const payload = JSON.parse((await page.locator('#__NEXT_DATA__').textContent())!);
    const backTextures = (Object.values(payload.props.pageProps.chibis[outfit].back.textures) as string[])
      .map(url => contentUrl(url, payload.props.pageProps.__contentRelease));
    await Promise.all([
      ...backTextures.map(url => page.waitForResponse(response => response.url() === url && response.ok())),
      page.getByRole('button', { name: 'Back', exact: true }).click(),
    ]);
    await expect(page.locator('.chibi-window [role="status"]')).toHaveCount(0);
    await select.click();
    await page.getByRole('option', { name: 'Walking', exact: true }).click();
    await expect(page.locator('.chibi-window canvas')).toHaveAttribute('data-animation', /move|walk/i);
    await expect(page.locator('.chibi-window [role="status"]')).toHaveCount(0);
    await page.getByRole('button', { name: 'Close chibi viewer', exact: true }).click();
    await expect(page.locator('.chibi-window')).toHaveCount(0);
  }
  expect(requested.size).toBeGreaterThanOrEqual(18);
  expect(failed).toEqual([]);
  for (const url of requested) expect(url).toMatch(/^https:\/\/assets\.arkpedia\.net\/arkpedia\/arkpedia-sd-assets\/[a-f0-9]{40}\/models\//);
});

/** How many pixels of a chibi canvas hold part of the chibi. Each chibi is a 2D canvas the page's
 *  one WebGL context draws into (lib/spine/sharedChibiGL.ts); a lost picture reads 0. */
const drawnPixels = (element: Element) => {
  const canvas = element as HTMLCanvasElement;
  const data = canvas.getContext('2d')?.getImageData(0, 0, canvas.width, canvas.height).data;
  let count = 0;
  if (data) for (let i = 3; i < data.length; i += 4) if (data[i] > 0) count++;
  return count;
};

async function revealControls(page: import('@playwright/test').Page) {
  // Keyboard users can reveal the controls without triggering a chibi interaction.
  await page.keyboard.press('Tab');
  await page.locator('.chibi-roaming').focus();
}

async function openChibi(page: import('@playwright/test').Page) {
  await page.goto('/operators/Thorns');
  await page.getByRole('group', { name: 'Operator outfits', exact: true }).getByRole('button', { name: 'Base', exact: true }).click();
  await page.getByRole('button', { name: 'Chibi viewer', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Chibi animation', exact: true })).toContainText('Idle');
  await expect(page.locator('.chibi-viewer [role="status"]')).toHaveCount(0);
}

test('facing preserves animation and pause, with facing beside the viewer title', async ({ page }) => {
  await openChibi(page);
  const select = page.getByRole('combobox', { name: 'Chibi animation', exact: true });
  await select.click();
  await page.getByRole('option', { name: 'Attack_1', exact: true }).click();
  await page.locator('.chibi-controls').getByRole('button', { name: 'Pause', exact: true }).click();
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(page.locator('.chibi-viewer [role="status"]')).toHaveCount(0);
  await expect(select).toContainText('Attack_1');
  await expect(page.locator('.chibi-window canvas')).toHaveAttribute('data-animation', 'Attack_1');
  await expect.poll(() => page.locator('.chibi-window canvas').evaluate(drawnPixels), { message: 'the chibi is drawn' }).toBeGreaterThan(0);
  await expect(page.locator('.chibi-controls').getByRole('button', { name: 'Pause', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Front', exact: true }).click();
  await expect(select).toContainText('Attack_1');
  const header = await page.locator('.chibi-window-header').evaluate(element => {
    const title = element.querySelector('button')!.getBoundingClientRect();
    const facing = element.querySelector('.seg-control')!.getBoundingClientRect();
    return { titleTop: title.top, titleBottom: title.bottom, facingTop: facing.top, facingBottom: facing.bottom, titleRight: title.right, facingLeft: facing.left };
  });
  expect(header.facingTop).toBeLessThan(header.titleBottom);
  expect(header.titleTop).toBeLessThan(header.facingBottom);
  expect(header.facingLeft).toBeGreaterThan(header.titleRight);
});

test('page chibi walks, can pause and return to its viewer', async ({ page }) => {
  await openChibi(page);
  await page.getByRole('button', { name: 'Walk on page', exact: true }).click();
  const pet = page.locator('.chibi-roaming');
  await expect(pet).toBeVisible();
  await expect(pet.locator('[role="status"]')).toHaveCount(0);
  await expect(pet.locator('canvas')).toHaveAttribute('data-animation', /.+/);
  const start = await pet.boundingBox();
  await expect.poll(async () => {
    const current = await pet.boundingBox();
    return Math.hypot(current!.x - start!.x, current!.y - start!.y);
  }, { timeout: 10000 }).toBeGreaterThan(5);
  await expect(pet.locator('canvas')).toHaveAttribute('data-animation', /move|walk/i);
  await revealControls(page);
  await pet.getByRole('button', { name: 'Pause walking', exact: true }).click();
  const stopped = await pet.boundingBox();
  // Sample a real interval: motion must stop rather than just changing the button.
  await page.waitForTimeout(400);
  expect(await pet.boundingBox()).toEqual(stopped);
  await pet.focus(); await page.keyboard.press('ArrowLeft');
  const moved = await pet.boundingBox();
  expect(moved!.x).toBe(Math.max(0, stopped!.x - 20));
  await page.keyboard.press('Escape');
  await expect(pet).toHaveCount(0);
  await expect(page.locator('.chibi-window canvas')).toBeVisible();
});

test('roaming chibi survives viewer close, page navigation and browser back without recreating its canvas', async ({ page }) => {
  await openChibi(page);
  await page.getByRole('button', { name: 'Walk on page', exact: true }).click();
  const pet = page.locator('.chibi-roaming');
  await expect(pet.locator('[role="status"]')).toHaveCount(0);
  const canvas = await pet.locator('canvas').elementHandle();
  const petLabel = await pet.getAttribute('aria-label');
  await page.getByRole('button', { name: 'Close chibi viewer', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Chibi viewer', exact: true })).toHaveAttribute('aria-expanded', 'false');
  await expect(pet).toBeVisible();
  const start = await pet.boundingBox();
  await expect.poll(async () => {
    const current = await pet.boundingBox();
    return Math.hypot(current!.x - start!.x, current!.y - start!.y);
  }, { timeout: 10000 }).toBeGreaterThan(5);
  await revealControls(page);
  // Pause/resume, dismiss, and the −/+ size pair centred at its feet (#395).
  await expect(pet.getByRole('button')).toHaveCount(4);
  await expect(pet.getByRole('group', { name: 'Chibi size', exact: true }).getByRole('button')).toHaveCount(2);
  await revealControls(page);
  await expect(pet.getByRole('button', { name: 'Dismiss roaming chibi', exact: true })).toBeVisible();
  await pet.focus(); await page.keyboard.press('ArrowLeft');
  const stopped = await pet.boundingBox();
  // A real Next link changes pages without reloading the app and its detached canvas.
  await page.getByRole('link', { name: /^Arkpedia(?: home| ARKPEDIA(?: Beta)?)$/ }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(pet).toHaveAccessibleName(petLabel!);
  expect(await canvas!.evaluate(element => element.isConnected)).toBe(true);
  expect(await pet.boundingBox()).toEqual(stopped);
  await expect.poll(() => canvas!.evaluate(drawnPixels), { message: 'the roaming chibi is still drawn' }).toBeGreaterThan(0);
  await page.goBack();
  await expect(page).toHaveURL(/\/operators\/Thorns$/);
  await expect(pet).toBeVisible();
  expect(await canvas!.evaluate(element => element.isConnected)).toBe(true);
  await page.getByRole('group', { name: 'Operator outfits', exact: true }).getByRole('button', { name: 'Base', exact: true }).click();
  await page.getByRole('button', { name: 'Chibi viewer', exact: true }).press('Enter');
  await expect(page.getByRole('button', { name: 'Return to viewer', exact: true })).toBeVisible();
  await expect(page.locator('.chibi-controls').getByRole('button', { name: 'Pause', exact: true })).toHaveAttribute('aria-pressed', 'false');
  await revealControls(page);
  await pet.getByRole('button', { name: 'Dismiss roaming chibi', exact: true }).click();
  await expect(pet).toHaveCount(0);
  await expect(page.locator('.chibi-window canvas')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toHaveAttribute('aria-pressed', 'false');
});

test('dragging outside the viewer drops a walking chibi at that point', async ({ page, isMobile }) => {
  await openChibi(page);
  const canvas = await page.locator('.chibi-window canvas').boundingBox();
  const drop = isMobile ? { x: canvas!.x + canvas!.width / 2, y: canvas!.y + canvas!.height + 40 } : { x: Math.max(90, canvas!.x - 220), y: canvas!.y + canvas!.height / 2 };
  const start = { x: canvas!.x + canvas!.width / 2, y: canvas!.y + canvas!.height / 2 };
  if (isMobile) {
    const touch = await page.context().newCDPSession(page);
    await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [start] });
    await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [drop] });
    await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await touch.detach();
  } else {
    await page.mouse.move(start.x, start.y);
    await page.mouse.down(); await page.mouse.move(drop.x, drop.y, { steps: 12 }); await page.mouse.up();
  }
  const pet = page.locator('.chibi-roaming');
  await expect(pet).toBeVisible();
  await expect(pet.locator('[role="status"]')).toHaveCount(0);
  const bounds = await pet.boundingBox();
  expect(bounds!.x).toBeCloseTo(drop.x - 80, 0);
  expect(bounds!.y).toBeCloseTo(drop.y - 90, 0);
  await page.getByRole('button', { name: 'Close chibi viewer', exact: true }).click();
  await expect(pet).toBeVisible();
  await page.getByRole('link', { name: /^Arkpedia(?: home| ARKPEDIA(?: Beta)?)$/ }).click();
  // The pet outlives both pages, so its visibility does not mean navigation finished.
  // Dismiss on Home, once the old viewer trigger really has unmounted.
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('button', { name: 'Chibi viewer', exact: true })).toHaveCount(0);
  await expect(pet).toBeVisible();
  await revealControls(page);
  await pet.getByRole('button', { name: 'Dismiss roaming chibi', exact: true }).click();
  await expect(pet).toHaveCount(0);
  await expect(page.locator('#page-content')).toBeFocused();
});

for (const theme of ['dark', 'light'] as const) for (const [activity, choice, clip, duration] of [
  ['sit', 0, 'Sit', 3000], ['sleep', .3, 'Sleep', 10000],
  ['idle', .55, 'Relax', 3333.3332538604736], ['special', .9, 'Interact', 2233.3333492279053],
] as const) {
  test(`roaming ${activity} uses a native base pose and returns to its routine (${theme})`, async ({ page, isMobile }, testInfo) => {
    await page.addInitScript(value => localStorage.setItem('theme', value), theme);
    await openChibi(page);
    await page.getByRole('button', { name: 'Walk on page', exact: true }).click();
    const pet = page.locator('.chibi-roaming');
    await expect(pet.locator('canvas')).toHaveAttribute('data-animation', /.+/);
    // Preloaded game furniture is required before choosing a sitting/sleeping pose.
    await expect.poll(() => page.evaluate(() => performance.getEntriesByType('resource').filter(entry => entry.name.includes('/furnitureicons/')).length)).toBe(2);
    // The scripted draws start at the drop, not now: the pet is still walking, and on a
    // loaded runner it could reach a target between this line and the drag and spend the
    // first draws, shifting the pick (CI 2026-10-13: idle with no break, special never
    // starting). A capture listener on window runs before the provider's own pointerup.
    await page.evaluate(pick => {
      const values = [0, 0, 0, 0, pick, 0, 0], real = Math.random.bind(Math);
      let armed = false;
      window.addEventListener('pointerup', () => { armed = true; }, { capture: true, once: true });
      Math.random = () => (armed ? values.shift() ?? 0 : real());
    }, choice);
    const bounds = await pet.locator('canvas').boundingBox();
    const start = { x: bounds!.x + 80, y: bounds!.y + 90 }, drop = { x: 90, y: 90 };
    if (isMobile) {
      const touch = await page.context().newCDPSession(page);
      await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [start] });
      await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [drop] });
      await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await touch.detach();
    } else {
      await page.mouse.move(start.x, start.y); await page.mouse.down(); await page.mouse.move(drop.x, drop.y); await page.mouse.up();
    }
    await expect(pet).toHaveAttribute('data-activity', activity, { timeout: 12000 });
    await expect(pet.locator('canvas')).toHaveAttribute('data-animation', clip);
    await expect(pet).toHaveAttribute('data-break-duration', /.+/, { timeout: 12000 });
    expect(Number(await pet.getAttribute('data-break-duration'))).toBeCloseTo(duration, 0);
    const furniture = pet.locator('.chibi-furniture');
    await expect(furniture).toHaveCount(activity === 'sit' || activity === 'sleep' ? 1 : 0);
    if (activity === 'sit' || activity === 'sleep') {
      expect(await furniture.evaluate(image => (image as HTMLImageElement).naturalWidth)).toBe(226);
      const box = await furniture.boundingBox(), viewport = page.viewportSize()!;
      expect(box!.x).toBeGreaterThanOrEqual(0); expect(box!.y).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width);
      expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height);
    }
    const position = await pet.boundingBox();
    if (process.env.ARKPEDIA_QA_CAPTURE && (activity === 'sit' || activity === 'sleep')) {
      await page.screenshot({ path: `${process.env.ARKPEDIA_QA_CAPTURE}/chibi-${activity}-${theme}-${testInfo.project.name}.png` });
    }
    await page.waitForTimeout(duration / 2);
    await expect(pet).toHaveAttribute('data-activity', activity);
    expect(await pet.boundingBox()).toEqual(position);
    await expect(pet).not.toHaveAttribute('data-break-duration', /.+/, { timeout: duration / 2 + 1500 });
    await expect(pet.locator('canvas')).toHaveAttribute('data-animation', 'Relax');
    await expect(furniture).toHaveCount(0);
    await pet.focus(); await page.keyboard.press('Escape');
    await expect(pet).toHaveCount(0);
  });
}


test('ordinary stationary chibi visibly animates between walks without a timed break', async ({ page, isMobile }) => {
  await openChibi(page);
  await page.getByRole('button', { name: 'Walk on page', exact: true }).click();
  const pet = page.locator('.chibi-roaming'), canvas = pet.locator('canvas');
  await expect(canvas).toHaveAttribute('data-animation', /.+/);
  // Choose a nearby destination, skip the optional break, then stay at that point.
  // Armed at the drop, as in the break tests above: a walk that ends before the drag would
  // otherwise spend the scripted draws.
  await page.evaluate(() => {
    const values = [0, 0, 0, .9, 0, 0, 0], real = Math.random.bind(Math);
    let armed = false;
    window.addEventListener('pointerup', () => { armed = true; }, { capture: true, once: true });
    Math.random = () => (armed ? values.shift() ?? 0 : real());
  });
  const bounds = await canvas.boundingBox();
  const start = { x: bounds!.x + 80, y: bounds!.y + 90 }, drop = { x: 90, y: 90 };
  if (isMobile) {
    const touch = await page.context().newCDPSession(page);
    await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [start] });
    await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [drop] });
    await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await touch.detach();
  } else {
    await page.mouse.move(start.x, start.y); await page.mouse.down(); await page.mouse.move(drop.x, drop.y); await page.mouse.up();
  }
  await expect.poll(async () => (await pet.boundingBox())!.x).toBeLessThan(5);
  await expect(pet).toHaveAttribute('data-activity', 'idle');
  await expect(pet).not.toHaveAttribute('data-break-duration', /.+/);
  await expect(canvas).toHaveAttribute('data-animation', 'Relax');
  // Let the walk-to-idle blend finish before checking ongoing movement.
  await page.waitForTimeout(250);
  const position = await pet.boundingBox(), first = await canvas.screenshot();
  await page.waitForTimeout(900);
  const second = await canvas.screenshot();
  expect(await pet.boundingBox()).toEqual(position);
  expect(first.equals(second)).toBe(false);
  await expect(canvas).toHaveAttribute('data-animation', 'Relax');
  await pet.focus(); await page.keyboard.press('Escape');
});

async function openTapChibi(page: import('@playwright/test').Page) {
  await page.goto('/operators/Thorns');
  await page.getByRole('group', { name: 'Operator outfits', exact: true }).getByRole('button', { name: 'Blade-cleaved Tides', exact: true }).click();
  await page.getByRole('button', { name: 'Chibi viewer', exact: true }).click();
  // The artwork switch keeps the previous outfit visible until the next art loads.
  await expect(page.locator('.chibi-window canvas')).toHaveAccessibleName('Thorns — Blade-cleaved Tides chibi');
  await expect(page.locator('.chibi-window [role="status"]')).toHaveCount(0);
  // Pause automatic walking, then explicitly tap: user reactions still play once.
  await page.locator('.chibi-controls').getByRole('button', { name: 'Pause', exact: true }).click();
  await page.getByRole('button', { name: 'Walk on page', exact: true }).click();
  const pet = page.locator('.chibi-roaming');
  await expect(pet.locator('canvas')).toHaveAttribute('data-animation', 'Relax');
  await revealControls(page);
  await pet.getByRole('button', { name: 'Pause walking', exact: true }).click();
  return pet;
}

for (const theme of ['dark', 'light']) {
  test(`chibi first tap is trust, later taps choose either reaction, and repeated taps restart (${theme})`, async ({ page, isMobile }, testInfo) => {
    await page.addInitScript(value => localStorage.setItem('theme', value), theme);
    const pet = await openTapChibi(page), canvas = pet.locator('canvas');
    const position = await pet.boundingBox();
    await page.evaluate(() => { Math.random = () => .9; });
    if (isMobile) await canvas.tap(); else await canvas.click();
    await expect(pet).toHaveAttribute('data-activity', 'trust-tap');
    await expect(canvas).toHaveAttribute('data-animation', 'Special');
    expect(Number(await pet.getAttribute('data-break-duration'))).toBeCloseTo(6766.666889190674, 0);
    await page.waitForTimeout(1000);
    const start = await canvas.screenshot();
    await page.waitForTimeout(2500);
    const progressed = await canvas.screenshot();
    expect(start.equals(progressed)).toBe(false);
    expect(await pet.boundingBox()).toEqual(position);
    // Restart the same native clip using Space, without resuming paused walking.
    await page.evaluate(() => { Math.random = () => .1; });
    await pet.focus(); await page.keyboard.press('Space');
    await page.waitForTimeout(350);
    expect((await canvas.screenshot()).equals(progressed)).toBe(false);
    if (process.env.ARKPEDIA_QA_CAPTURE) {
      await page.screenshot({ path: `${process.env.ARKPEDIA_QA_CAPTURE}/chibi-tap-${theme}-${testInfo.project.name}.png` });
    }
    await page.waitForTimeout(4000);
    await expect(pet).toHaveAttribute('data-activity', 'trust-tap');
    await expect(pet).not.toHaveAttribute('data-break-duration', /.+/, { timeout: 4000 });
    await expect(canvas).toHaveAttribute('data-animation', 'Relax');
    expect(await pet.boundingBox()).toEqual(position);
    // Viewer close/navigation do not reset the first-tap guarantee on this pet.
    await page.getByRole('button', { name: 'Close chibi viewer', exact: true }).click();
    await page.getByRole('link', { name: /^Arkpedia(?: home| ARKPEDIA(?: Beta)?)$/ }).click();
    // Home's first ISR response may be cold on the shared runner; wait for the
    // client navigation before checking that this same roaming pet survives it.
    await expect(page).toHaveURL(/\/$/, { timeout: 30000 });
    await page.evaluate(() => { Math.random = () => .9; });
    await pet.focus(); await page.keyboard.press('Enter');
    await expect(pet).toHaveAttribute('data-activity', 'tap');
    await expect(canvas).toHaveAttribute('data-animation', 'Interact');
    await expect(pet).not.toHaveAttribute('data-break-duration', /.+/, { timeout: 3000 });
    await expect(canvas).toHaveAttribute('data-animation', 'Relax');
    expect(await pet.boundingBox()).toEqual(position);
    await revealControls(page);
    await pet.getByRole('button', { name: 'Dismiss roaming chibi', exact: true }).click();
    await expect(pet).toHaveCount(0);
  });
}

test('dragging and cancelled touches do not consume the first trust tap', async ({ page, isMobile }) => {
  const pet = await openTapChibi(page), canvas = pet.locator('canvas');
  await page.evaluate(() => { Math.random = () => .9; });
  const bounds = await canvas.boundingBox();
  const start = { x: bounds!.x + 80, y: bounds!.y + 90 }, drop = { x: 100, y: 100 };
  if (isMobile) {
    const touch = await page.context().newCDPSession(page);
    await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [start] });
    await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [drop] });
    await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [start] });
    await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [start] });
    await touch.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
    await touch.detach();
  } else {
    await page.mouse.move(start.x, start.y); await page.mouse.down();
    await page.mouse.move(drop.x, drop.y); await page.mouse.move(start.x, start.y); await page.mouse.up();
  }
  await expect(pet).toHaveAttribute('data-activity', 'idle');
  const position = await pet.boundingBox();
  if (isMobile) await canvas.tap(); else await canvas.click();
  await expect(pet).toHaveAttribute('data-activity', 'trust-tap');
  await expect(canvas).toHaveAttribute('data-animation', 'Special');
  expect(await pet.boundingBox()).toEqual(position);
  await revealControls(page);
  await pet.getByRole('button', { name: 'Dismiss roaming chibi', exact: true }).click();
});

test('a base chibi with only Interact uses its native reaction and resumes walking', async ({ page, isMobile }) => {
  await openChibi(page);
  await page.getByRole('button', { name: 'Walk on page', exact: true }).click();
  const pet = page.locator('.chibi-roaming'), canvas = pet.locator('canvas');
  await expect(canvas).toHaveAttribute('data-animation', /.+/);
  if (isMobile) await canvas.tap(); else await canvas.click();
  await expect(pet).toHaveAttribute('data-activity', 'trust-tap');
  await expect(canvas).toHaveAttribute('data-animation', 'Interact');
  const position = await pet.boundingBox();
  await page.waitForTimeout(1000);
  expect(await pet.boundingBox()).toEqual(position);
  await expect(pet).not.toHaveAttribute('data-break-duration', /.+/, { timeout: 2000 });
  await expect(canvas).toHaveAttribute('data-animation', 'Relax');
  await expect.poll(async () => {
    const current = await pet.boundingBox();
    return Math.hypot(current!.x - position!.x, current!.y - position!.y);
  }, { timeout: 10000 }).toBeGreaterThan(5);
});


async function chooseAnimation(page: import('@playwright/test').Page, label: string) {
  await page.getByRole('combobox', { name: 'Chibi animation', exact: true }).click();
  await page.getByRole('option', { name: label, exact: true }).click();
}
for (const theme of ['dark', 'light']) {
  test(`viewer animations stay independent of roaming movement (${theme})`, async ({ page }, testInfo) => {
    await page.addInitScript(value => localStorage.setItem('theme', value), theme);
    await page.clock.install();
    const pet = await openTapChibi(page), viewer = page.locator('.chibi-window');
    const position = await pet.boundingBox();
    await revealControls(page);
    const movement = pet.getByRole('button', { name: 'Resume walking', exact: true });
    const movementBox = (await movement.boundingBox())!;
    await revealControls(page);
    const dismissBox = (await pet.getByRole('button', { name: 'Dismiss roaming chibi', exact: true }).boundingBox())!;
    // #395: pause/resume at the top left, dismiss at the top right, −/+ centred at the feet,
    // so all of them still fit at the smallest chibi size.
    expect(movementBox.x).toBeCloseTo(position!.x, 0);
    expect(movementBox.y).toBeCloseTo(position!.y, 0);
    expect(dismissBox.x + dismissBox.width).toBeCloseTo(position!.x + position!.width, 0);
    expect(dismissBox.y).toBeCloseTo(position!.y, 0);
    const sizeBox = (await pet.getByRole('group', { name: 'Chibi size', exact: true }).boundingBox())!;
    expect(sizeBox.x + sizeBox.width / 2).toBeCloseTo(position!.x + position!.width / 2, 0);
    expect(sizeBox.y + sizeBox.height).toBeCloseTo(position!.y + position!.height, 0);
    expect(movementBox.width).toBeGreaterThanOrEqual(36);
    expect(movementBox.height).toEqual(movementBox.width);
    await expect(movement).toHaveCSS('border-top-width', '0px');
    await page.mouse.move(0, 0);
    await expect(movement).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    const glyph = (await movement.locator('svg').boundingBox())!;
    expect(glyph.x + glyph.width / 2).toBeCloseTo(movementBox.x + movementBox.width / 2, 0);
    expect(glyph.y + glyph.height / 2).toBeCloseTo(movementBox.y + movementBox.height / 2, 0);
    // Keep protocol/CI delays from consuming the short native pose before its assertion.
    await page.clock.pauseAt(new Date(Date.now() + 1000));
    await chooseAnimation(page, 'Trust tap');
    await viewer.getByRole('button', { name: 'Play', exact: true }).click();
    await expect(viewer.locator('[role="status"]')).toHaveCount(0);
    await page.clock.runFor(100);
    await expect(viewer.locator('canvas')).toHaveAttribute('data-animation', 'Special');
    await expect(viewer.locator('canvas')).toHaveAttribute('data-framed', 'true');
    await expect(pet.locator('canvas')).toHaveAttribute('data-animation', 'Relax');
    const close = await viewer.getByRole('button', { name: 'Close chibi viewer', exact: true }).boundingBox();
    const pause = await viewer.getByRole('button', { name: 'Pause', exact: true }).boundingBox();
    // Queuing another pose cannot cut this 6.77-second native reaction short.
    await chooseAnimation(page, 'Sleeping');
    await page.clock.runFor(2000);
    await expect(viewer.locator('canvas')).toHaveAttribute('data-animation', 'Special');
    await page.clock.runFor(7000);
    await expect(viewer.locator('canvas')).toHaveAttribute('data-animation', 'Sleep', { timeout: 10000 });
    await page.clock.resume();
    expect(await viewer.getByRole('button', { name: 'Close chibi viewer', exact: true }).boundingBox()).toEqual(close);
    expect(await viewer.getByRole('button', { name: 'Pause', exact: true }).boundingBox()).toEqual(pause);
    expect(await pet.boundingBox()).toEqual(position);
    await page.waitForTimeout(300);
    const first = await pet.locator('canvas').screenshot();
    await page.waitForTimeout(900);
    expect((await pet.locator('canvas').screenshot()).equals(first)).toBe(false);
    await viewer.getByRole('button', { name: 'Pause', exact: true }).click();
    await page.waitForTimeout(250);
    const still = await viewer.locator('canvas').screenshot();
    await page.waitForTimeout(300);
    expect((await viewer.locator('canvas').screenshot()).equals(still)).toBe(true);
    await revealControls(page);
    await expect(pet.getByRole('button', { name: 'Open chibi viewer', exact: true })).toHaveCount(0);
    if (process.env.ARKPEDIA_QA_CAPTURE) await page.screenshot({ path: `${process.env.ARKPEDIA_QA_CAPTURE}/chibi-independent-${theme}-${testInfo.project.name}.png` });
    await revealControls(page);
    await pet.getByRole('button', { name: 'Resume walking', exact: true }).click();
    await expect.poll(async () => Math.hypot((await pet.boundingBox())!.x - position!.x, (await pet.boundingBox())!.y - position!.y), { timeout: 10000 }).toBeGreaterThan(5);
  });
  test(`larger animation artwork fits with anchored controls (${theme})`, async ({ page }, testInfo) => {
    await page.addInitScript(value => localStorage.setItem('theme', value), theme);
    await openTapChibi(page);
    const viewer = page.locator('.chibi-window'), canvas = viewer.locator('canvas');
    const original = await canvas.boundingBox();
    const close = await viewer.getByRole('button', { name: 'Close chibi viewer', exact: true }).boundingBox();
    const pause = await viewer.getByRole('button', { name: 'Pause', exact: true }).boundingBox();
    await page.getByRole('combobox', { name: 'Chibi animation', exact: true }).click();
    for (const name of ['Walking', 'Sitting', 'Sleeping', 'Base idle', 'Normal tap', 'Trust tap', 'Attack_1']) {
      await expect(page.getByRole('option', { name, exact: true })).toBeVisible();
    }
    await page.keyboard.press('Escape');
    await chooseAnimation(page, 'Start');
    await expect(canvas).toHaveAttribute('data-animation', 'Start');
    await expect.poll(async () => (await canvas.boundingBox())!.height).toBeGreaterThan(original!.height + 10);
    await viewer.getByRole('button', { name: 'Play', exact: true }).click();
    for (let i = 0; i < 4; i++) { await page.waitForTimeout(100); await expect(canvas).toHaveAttribute('data-framed', 'true'); }
    await viewer.getByRole('button', { name: 'Pause', exact: true }).click();
    expect(await viewer.getByRole('button', { name: 'Close chibi viewer', exact: true }).boundingBox()).toEqual(close);
    expect(await viewer.getByRole('button', { name: 'Pause', exact: true }).boundingBox()).toEqual(pause);
    const expanded = await canvas.boundingBox(), viewport = page.viewportSize()!;
    expect(expanded!.x).toBeGreaterThanOrEqual(0); expect(expanded!.y).toBeGreaterThanOrEqual(0);
    expect(expanded!.x + expanded!.width).toBeLessThanOrEqual(viewport.width);
    expect(expanded!.y + expanded!.height).toBeLessThanOrEqual(viewport.height);
    if (process.env.ARKPEDIA_QA_CAPTURE) await page.screenshot({ path: `${process.env.ARKPEDIA_QA_CAPTURE}/chibi-expanded-${theme}-${testInfo.project.name}.png` });
  });
  test(`viewer drags within the viewport and reopens at its default position (${theme})`, async ({ page, isMobile }) => {
    await page.addInitScript(value => localStorage.setItem('theme', value), theme);
    await openChibi(page);
    const viewer = page.getByRole('dialog', { name: /Chibi viewer/ });
    const original = await viewer.boundingBox();
    const handle = viewer.getByRole('button', { name: 'Move chibi viewer', exact: true });
    const bounds = await handle.boundingBox(), start = { x: bounds!.x + 15, y: bounds!.y + 15 }, drop = { x: 2, y: 2 };
    if (isMobile) {
      const touch = await page.context().newCDPSession(page);
      await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [start] });
      await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [drop] });
      await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await touch.detach();
    } else {
      await page.mouse.move(start.x, start.y); await page.mouse.down(); await page.mouse.move(drop.x, drop.y, { steps: 8 }); await page.mouse.up();
    }
    expect((await viewer.boundingBox())!.x).toBe(8); expect((await viewer.boundingBox())!.y).toBe(8);
    await handle.focus(); await page.keyboard.press('ArrowDown');
    expect((await viewer.boundingBox())!.y).toBe(28);
    await viewer.getByRole('button', { name: 'Close chibi viewer', exact: true }).click();
    const trigger = page.getByRole('button', { name: 'Chibi viewer', exact: true });
    await expect(trigger).toBeFocused(); await trigger.click();
    expect(await viewer.boundingBox()).toEqual(original);
    await handle.focus();
    for (let i = 0; i < 50; i++) await page.keyboard.press('ArrowRight');
    const edge = await viewer.boundingBox();
    expect(edge!.x + edge!.width).toBeLessThanOrEqual(page.viewportSize()!.width - 8);
  });
}


test('a queued pose waits for playback when a base model finishes loading after Play', async ({ page }) => {
  await page.clock.install();
  await page.goto('/operators/Thorns');
  await page.getByRole('group', { name: 'Operator outfits', exact: true }).getByRole('button', { name: 'Blade-cleaved Tides', exact: true }).click();
  const payload = JSON.parse((await page.locator('#__NEXT_DATA__').textContent())!);
  const skeleton = contentUrl(payload.props.pageProps.chibis['Blade-cleaved Tides'].walk.skeleton, payload.props.pageProps.__contentRelease);
  let release = () => {}, loading = () => {}, requests = 0;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const requested = new Promise<void>(resolve => { loading = resolve; });
  // The catalogue loads first. Hold the renderer's separate request so its
  // zero-length Default framing pose is applied only after Play was pressed.
  await page.route(skeleton, async route => {
    if (++requests === 2) { loading(); await gate; }
    await route.continue();
  });
  try {
    await page.getByRole('button', { name: 'Chibi viewer', exact: true }).click();
    const viewer = page.locator('.chibi-window');
    await expect(viewer.locator('canvas')).toHaveAccessibleName('Thorns — Blade-cleaved Tides chibi');
    await expect(viewer.locator('[role="status"]')).toHaveCount(0);
    await viewer.getByRole('button', { name: 'Pause', exact: true }).click();
    await chooseAnimation(page, 'Trust tap');
    await requested;
    await viewer.getByRole('button', { name: 'Play', exact: true }).click();
    await expect(viewer.getByRole('button', { name: 'Pause', exact: true })).toHaveAttribute('aria-pressed', 'false');
    await page.clock.pauseAt(new Date(Date.now() + 1000));
    release();
    await expect(viewer.locator('[role="status"]')).toHaveCount(0);
    await page.clock.runFor(100);
    await expect(viewer.locator('canvas')).toHaveAttribute('data-animation', 'Special');
    await chooseAnimation(page, 'Sleeping');
    await page.clock.runFor(2000);
    await expect(viewer.locator('canvas')).toHaveAttribute('data-animation', 'Special');
    await page.clock.runFor(7000);
    await expect(viewer.locator('canvas')).toHaveAttribute('data-animation', 'Sleep');
  } finally { release(); }
});

test('a faster base catalogue cannot replace the selected battle idle while battle assets load', async ({ page }) => {
  await page.route('**/*.skel', async route => {
    if (route.request().url().includes('/front/')) await new Promise(resolve => setTimeout(resolve, 1500));
    await route.continue();
  });
  await openChibi(page);
  await page.waitForTimeout(500);
  await expect(page.getByRole('combobox', { name: 'Chibi animation', exact: true })).toContainText('Idle');
  await expect(page.locator('.chibi-window canvas')).toHaveAttribute('data-animation', 'Idle');
});

test('an outfit without a chibi model keeps the catalogue message and close control', async ({ page }) => {
  // Every outfit has a model in the pinned data (tests/browser/data-pin.json), so the page is
  // given one without: its Base entry is taken out of the props it ships.
  await page.route(url => decodeURIComponent(url.pathname) === '/operators/Amiya (Guard)', async route => {
    const html = await (await route.fetch()).text();
    const body = html.replace(/(<script id="__NEXT_DATA__" type="application\/json"[^>]*>)([\s\S]*?)(<\/script>)/, (_, open: string, json: string, close: string) => {
      const data = JSON.parse(json);
      delete data.props.pageProps.chibis?.Base;
      return open + JSON.stringify(data).replace(/</g, '\\u003c') + close;
    });
    await route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body });
  });
  await page.goto('/operators/Amiya%20(Guard)');
  await page.getByRole('group', { name: 'Operator outfits', exact: true }).getByRole('button', { name: 'Base', exact: true }).click();
  await page.getByRole('button', { name: 'Chibi viewer', exact: true }).click();
  const viewer = page.getByRole('dialog', { name: /Chibi viewer/ });
  await expect(viewer.getByRole('status')).toContainText('not in the current asset catalogue');
  await expect(viewer.locator('canvas')).toHaveCount(0);
  await expect(viewer.getByRole('button', { name: 'Walk on page', exact: true })).toHaveCount(0);
  await viewer.getByRole('button', { name: 'Close chibi viewer', exact: true }).click();
  await expect(viewer).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Chibi viewer', exact: true })).toBeFocused();
});


test('pausing walking retains a visibly animated native idle', async ({ page }) => {
  await openChibi(page);
  await page.getByRole('button', { name: 'Walk on page', exact: true }).click();
  const pet = page.locator('.chibi-roaming'), canvas = pet.locator('canvas');
  await expect(canvas).toHaveAttribute('data-animation', /.+/);
  await revealControls(page);
  await pet.getByRole('button', { name: 'Pause walking', exact: true }).click();
  await expect(canvas).toHaveAttribute('data-animation', 'Relax');
  const position = await pet.boundingBox();
  await page.waitForTimeout(300); const first = await canvas.screenshot();
  await page.waitForTimeout(900);
  expect((await canvas.screenshot()).equals(first)).toBe(false);
  expect(await pet.boundingBox()).toEqual(position);
});


test('viewer controls fit a short viewport', async ({ page }) => {
  await page.setViewportSize({ width: 844, height: 390 });
  await openChibi(page);
  const viewer = page.locator('.chibi-window');
  const bounds = await viewer.boundingBox();
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(382);
  await expect(viewer.getByRole('button', { name: 'Play', exact: true })).toBeInViewport();
  await expect(viewer.getByRole('button', { name: 'Close chibi viewer', exact: true })).toBeInViewport();
});

test('twenty chibis on the page all keep their picture (one WebGL context for all)', async ({ page, isMobile }) => {
  test.skip(isMobile, 'twenty chibis cover a phone screen, Add another included');
  test.setTimeout(120_000);
  await openChibi(page);
  await page.getByRole('button', { name: 'Walk on page', exact: true }).click();
  const add = page.getByRole('button', { name: 'Add another', exact: true });
  // A page gets about 16 WebGL contexts; each chibi had one, so the 16th took the first one's away.
  for (let i = 1; i < 20; i++) await add.click();
  const pets = page.locator('.chibi-roaming');
  await expect(pets).toHaveCount(20);
  await expect(pets.locator('[role="status"]')).toHaveCount(0, { timeout: 60_000 });
  await expect.poll(() => pets.locator('canvas').evaluateAll(canvases => canvases.filter(canvas => {
    const element = canvas as HTMLCanvasElement;
    const data = element.getContext('2d')?.getImageData(0, 0, element.width, element.height).data;
    if (!data) return false;
    for (let i = 3; i < data.length; i += 4) if (data[i] > 0) return true;
    return false;
  }).length), { timeout: 30_000, message: 'every chibi is drawn' }).toBe(20);
});

test('a tapped roaming chibi keeps its size while its reaction plays', async ({ page, isMobile }) => {
  const pet = await openTapChibi(page), canvas = pet.locator('canvas');
  const scale = Number(await canvas.getAttribute('data-world-per-pixel'));
  expect(scale).toBeGreaterThan(0);
  await page.evaluate(() => { Math.random = () => .9; });
  if (isMobile) await canvas.tap(); else await canvas.click();
  await expect(pet).toHaveAttribute('data-activity', 'trust-tap');
  // Sampled through the reaction: the scale never changes (it used to grow to fit wide effects).
  for (let i = 0; i < 6; i++) {
    expect(Number(await canvas.getAttribute('data-world-per-pixel'))).toBeCloseTo(scale, 6);
    await page.waitForTimeout(150);
  }
});

test('chibi taps play voice reactions, keyboard focus survives pose changes and dragging stays silent', async ({ page }) => {
  await page.addInitScript(() => {
    const state = { played: [] as string[] };
    (window as unknown as { chibiVoiceTest: typeof state }).chibiVoiceTest = state;
    HTMLMediaElement.prototype.play = function () { if (/cn_0(?:34|36)/i.test(this.src)) state.played.push(this.src); return Promise.resolve(); };
  });
  await openChibi(page);
  const canvas = page.locator('.chibi-window canvas');
  const heard = () => page.evaluate(() => (window as unknown as { chibiVoiceTest: { played: string[] } }).chibiVoiceTest.played);
  await canvas.click();
  await expect.poll(async () => (await heard()).length).toBe(1);
  expect((await heard())[0]).toMatch(/cn_036/i);
  await canvas.focus(); await page.keyboard.press('Enter');
  await expect.poll(async () => (await heard()).length).toBe(2);
  await expect(canvas).toBeFocused(); await page.keyboard.press('Space');
  await expect.poll(async () => (await heard()).length).toBe(3);
  const box = (await canvas.boundingBox())!;
  const viewport = page.viewportSize()!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down(); await page.mouse.move(viewport.width - 20, viewport.height - 100, { steps: 12 }); await page.mouse.up();
  await expect(page.locator('.chibi-roaming')).toHaveCount(1);
  expect((await heard()).length).toBe(3);
  await expect.poll(() => page.locator('.chibi-roaming canvas').evaluate(drawnPixels)).toBeGreaterThan(0);
  await page.locator('.chibi-roaming canvas').click();
  await expect.poll(async () => (await heard()).length).toBe(4);
});
