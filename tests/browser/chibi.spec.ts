import { expect, test } from '@playwright/test';

test.setTimeout(120000);
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
  expect(await page.locator('.chibi-window canvas').evaluate(canvas => ((canvas as HTMLCanvasElement).getContext('webgl2') ?? (canvas as HTMLCanvasElement).getContext('webgl'))?.isContextLost())).toBe(false);
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
  await page.locator('.chibi-controls').getByRole('button', { name: 'Pause', exact: true }).click();
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
  await expect(pet.getByRole('button')).toHaveCount(2);
  await expect(pet.getByRole('button', { name: 'Dismiss roaming chibi', exact: true })).toBeVisible();
  await pet.focus(); await page.keyboard.press('ArrowLeft');
  const stopped = await pet.boundingBox();
  // A real Next link changes pages without reloading the app and its detached canvas.
  await page.getByRole('link', { name: /^Arkpedia ARKPEDIA(?: Beta)?$/ }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(pet).toHaveAccessibleName(petLabel!);
  expect(await canvas!.evaluate(element => element.isConnected)).toBe(true);
  expect(await pet.boundingBox()).toEqual(stopped);
  expect(await canvas!.evaluate(element => ((element as HTMLCanvasElement).getContext('webgl2') ?? (element as HTMLCanvasElement).getContext('webgl'))?.isContextLost())).toBe(false);
  await page.goBack();
  await expect(page).toHaveURL(/\/operators\/Thorns$/);
  await expect(pet).toBeVisible();
  expect(await canvas!.evaluate(element => element.isConnected)).toBe(true);
  await page.getByRole('group', { name: 'Operator outfits', exact: true }).getByRole('button', { name: 'Base', exact: true }).click();
  await page.getByRole('button', { name: 'Chibi viewer', exact: true }).press('Enter');
  await expect(page.getByRole('button', { name: 'Return to viewer', exact: true })).toBeVisible();
  await expect(page.locator('.chibi-controls').getByRole('button', { name: 'Pause', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await pet.getByRole('button', { name: 'Dismiss roaming chibi', exact: true }).click();
  await expect(pet).toHaveCount(0);
  await expect(page.locator('.chibi-window canvas')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toHaveAttribute('aria-pressed', 'true');
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
  await page.getByRole('link', { name: /^Arkpedia ARKPEDIA(?: Beta)?$/ }).click();
  // The pet outlives both pages, so its visibility does not mean navigation finished.
  // Dismiss on Home, once the old viewer trigger really has unmounted.
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('button', { name: 'Chibi viewer', exact: true })).toHaveCount(0);
  await expect(pet).toBeVisible();
  await pet.getByRole('button', { name: 'Dismiss roaming chibi', exact: true }).click();
  await expect(pet).toHaveCount(0);
  await expect(page.locator('#page-content')).toBeFocused();
});

for (const theme of ['dark', 'light'] as const) for (const [activity, choice, clip, duration] of [
  ['sit', 0, 'Sit', 3000], ['sleep', .3, 'Sleep', 10000],
  ['idle', .55, 'Relax', 2000], ['special', .9, 'Interact', 2233.3333492279053],
] as const) {
  test(`roaming ${activity} uses a native base pose and returns to its routine (${theme})`, async ({ page, isMobile }, testInfo) => {
    await page.addInitScript(value => localStorage.setItem('theme', value), theme);
    await openChibi(page);
    await page.getByRole('button', { name: 'Walk on page', exact: true }).click();
    const pet = page.locator('.chibi-roaming');
    await expect(pet.locator('canvas')).toHaveAttribute('data-animation', /.+/);
    // Preloaded game furniture is required before choosing a sitting/sleeping pose.
    await expect.poll(() => page.evaluate(() => performance.getEntriesByType('resource').filter(entry => entry.name.includes('/furnitureicons/')).length)).toBe(2);
    await page.evaluate(pick => {
      const values = [0, 0, 0, 0, pick, 0, 0];
      Math.random = () => values.shift() ?? 0;
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
  await page.evaluate(() => {
    const values = [0, 0, 0, .9, 0, 0, 0];
    Math.random = () => values.shift() ?? 0;
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
    await page.getByRole('link', { name: /^Arkpedia ARKPEDIA(?: Beta)?$/ }).click();
    await expect(page).toHaveURL(/\/$/);
    await page.evaluate(() => { Math.random = () => .9; });
    await pet.focus(); await page.keyboard.press('Enter');
    await expect(pet).toHaveAttribute('data-activity', 'tap');
    await expect(canvas).toHaveAttribute('data-animation', 'Interact');
    await expect(pet).not.toHaveAttribute('data-break-duration', /.+/, { timeout: 3000 });
    await expect(canvas).toHaveAttribute('data-animation', 'Relax');
    expect(await pet.boundingBox()).toEqual(position);
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
  test(`all native animations can play and pause on the roaming chibi (${theme})`, async ({ page }, testInfo) => {
    await page.addInitScript(value => localStorage.setItem('theme', value), theme);
    const pet = await openTapChibi(page);
    await page.getByRole('combobox', { name: 'Chibi animation', exact: true }).click();
    for (const name of ['Walking', 'Sitting', 'Sleeping', 'Base idle', 'Normal tap', 'Trust tap', 'Attack_1']) {
      await expect(page.getByRole('option', { name, exact: true })).toBeVisible();
    }
    await page.keyboard.press('Escape');
    // A manual normal tap must be visibly selectable even before the first trust tap.
    await chooseAnimation(page, 'Normal tap');
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    await expect(pet.locator('canvas')).toHaveAttribute('data-animation', 'Interact');
    await expect(pet).not.toHaveAttribute('data-break-duration', /.+/, { timeout: 3000 });
    await chooseAnimation(page, 'Walking');
    const before = await pet.boundingBox();
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    await expect(pet).toHaveAttribute('data-activity', 'walking');
    await expect(pet.locator('canvas')).toHaveAttribute('data-animation', 'Move');
    await expect.poll(async () => Math.abs((await pet.boundingBox())!.x - before!.x)).toBeGreaterThan(10);
    await chooseAnimation(page, 'Sitting');
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    await expect(pet.locator('.chibi-furniture')).toHaveAttribute('data-furniture', 'furni_s2_chair_L_01');
    await expect(pet.locator('canvas')).toHaveAttribute('data-animation', 'Sit');
    await expect(pet).not.toHaveAttribute('data-break-duration', /.+/, { timeout: 6500 });
    await chooseAnimation(page, 'Sleeping');
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    await expect(pet.locator('.chibi-furniture')).toHaveAttribute('data-furniture', 'furni_s1_bed_01');
    await expect(pet.locator('canvas')).toHaveAttribute('data-animation', 'Sleep');
    await page.getByRole('button', { name: 'Pause', exact: true }).click();
    await page.waitForTimeout(250);
    const still = await pet.locator('canvas').screenshot();
    await page.waitForTimeout(1000);
    expect((await pet.locator('canvas').screenshot()).equals(still)).toBe(true);
    await expect(pet).toHaveAttribute('data-activity', 'sleep');
    if (process.env.ARKPEDIA_QA_CAPTURE) await page.screenshot({ path: `${process.env.ARKPEDIA_QA_CAPTURE}/chibi-controls-${theme}-${testInfo.project.name}.png` });
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    await expect(pet).not.toHaveAttribute('data-break-duration', /.+/, { timeout: 17000 });
    await chooseAnimation(page, 'Attack_1');
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    await expect(pet.locator('canvas')).toHaveAttribute('data-animation', 'Attack_1');
    await expect(pet).not.toHaveAttribute('data-break-duration', /.+/, { timeout: 7000 });
    await expect(pet.locator('canvas')).toHaveAttribute('data-animation', 'Relax');
    await expect(page.locator('.chibi-window [role="status"]')).toHaveCount(0);
  });
  test(`viewer drags inside the viewport and reopens from another page (${theme})`, async ({ page, isMobile }) => {
    await page.addInitScript(value => localStorage.setItem('theme', value), theme);
    const pet = await openTapChibi(page), viewer = page.getByRole('dialog', { name: /Chibi viewer/ });
    const handle = page.getByRole('button', { name: 'Move chibi viewer', exact: true });
    const bounds = await handle.boundingBox(), start = { x: bounds!.x + 15, y: bounds!.y + 15 };
    const drop = { x: 2, y: 2 };
    if (isMobile) {
      const touch = await page.context().newCDPSession(page);
      await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [start] });
      await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [drop] });
      await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await touch.detach();
    } else {
      await page.mouse.move(start.x, start.y); await page.mouse.down(); await page.mouse.move(drop.x, drop.y, { steps: 8 }); await page.mouse.up();
    }
    expect((await viewer.boundingBox())!.x).toBe(8); expect((await viewer.boundingBox())!.y).toBe(8);
    await handle.focus(); await page.keyboard.press('ArrowDown');
    expect((await viewer.boundingBox())!.y).toBe(28);
    await chooseAnimation(page, 'Sleeping');
    const position = await viewer.boundingBox(), canvas = await pet.locator('canvas').elementHandle();
    await page.getByRole('button', { name: 'Close chibi viewer', exact: true }).click();
    await page.getByRole('link', { name: /^Arkpedia ARKPEDIA(?: Beta)?$/ }).click();
    await expect(page).toHaveURL(/\/$/);
    await pet.getByRole('button', { name: 'Open chibi viewer', exact: true }).click();
    await expect(viewer).toBeVisible();
    await expect(page.getByRole('combobox', { name: 'Chibi animation', exact: true })).toContainText('Sleeping');
    expect(await viewer.boundingBox()).toEqual(position);
    expect(await canvas!.evaluate(element => element.isConnected)).toBe(true);
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    await expect(pet.locator('canvas')).toHaveAttribute('data-animation', 'Sleep');
    await page.getByRole('button', { name: 'Pause', exact: true }).click();
    await viewer.press('Escape');
    await expect(viewer).toHaveCount(0);
    await expect(pet.getByRole('button', { name: 'Open chibi viewer', exact: true })).toBeFocused();
    await pet.getByRole('button', { name: 'Open chibi viewer', exact: true }).click();
    await handle.focus();
    for (let i = 0; i < 50; i++) await page.keyboard.press('ArrowRight');
    const edge = await viewer.boundingBox();
    expect(edge!.x + edge!.width).toBeLessThanOrEqual(page.viewportSize()!.width - 8);
    await page.getByRole('button', { name: 'Close chibi viewer', exact: true }).click();
  });
}


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


test('manual base idle keeps animating after returning to the routine', async ({ page }) => {
  await openChibi(page);
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await page.getByRole('button', { name: 'Walk on page', exact: true }).click();
  const pet = page.locator('.chibi-roaming'), canvas = pet.locator('canvas');
  await expect(canvas).toHaveAttribute('data-animation', 'Relax');
  const position = await pet.boundingBox();
  // Keep the random destination at the current position to isolate stationary playback.
  await page.evaluate(point => {
    const values = [point!.x / (innerWidth - 160), point!.y / (innerHeight - 180), 0];
    let calls = 0; Math.random = () => values[calls++ % values.length];
  }, position);
  await chooseAnimation(page, 'Base idle');
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(pet).toHaveAttribute('data-activity', 'animation');
  await expect(pet).not.toHaveAttribute('data-break-duration', /.+/, { timeout: 6000 });
  await expect(canvas).toHaveAttribute('data-animation', 'Relax');
  await page.waitForTimeout(300);
  const first = await canvas.screenshot();
  await page.waitForTimeout(900);
  expect((await canvas.screenshot()).equals(first)).toBe(false);
  expect(await pet.boundingBox()).toEqual(position);
});
