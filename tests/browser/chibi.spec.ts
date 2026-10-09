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
  await expect(page.locator('.operator-chibi canvas')).toHaveAttribute('data-animation', 'Attack_1');
  expect(await page.locator('.operator-chibi canvas').evaluate(canvas => ((canvas as HTMLCanvasElement).getContext('webgl2') ?? (canvas as HTMLCanvasElement).getContext('webgl'))?.isContextLost())).toBe(false);
  await expect(page.locator('.chibi-controls').getByRole('button', { name: 'Play', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Front', exact: true }).click();
  await expect(select).toContainText('Attack_1');
  const header = await page.locator('.operator-chibi-header').evaluate(element => {
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
  await expect(page.locator('.operator-chibi canvas')).toBeVisible();
});

test('roaming chibi survives viewer close, page navigation and browser back without recreating its canvas', async ({ page }) => {
  await openChibi(page);
  await page.getByRole('button', { name: 'Walk on page', exact: true }).click();
  const pet = page.locator('.chibi-roaming');
  await expect(pet.locator('[role="status"]')).toHaveCount(0);
  const canvas = await pet.locator('canvas').elementHandle();
  const petLabel = await pet.getAttribute('aria-label');
  await page.getByRole('button', { name: 'Chibi viewer', exact: true }).press('Enter');
  await expect(page.getByRole('button', { name: 'Chibi viewer', exact: true })).toHaveAttribute('aria-expanded', 'false');
  await expect(pet).toBeVisible();
  const start = await pet.boundingBox();
  await expect.poll(async () => {
    const current = await pet.boundingBox();
    return Math.hypot(current!.x - start!.x, current!.y - start!.y);
  }, { timeout: 10000 }).toBeGreaterThan(5);
  await expect(pet.getByRole('button')).toHaveCount(1);
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
  await expect(page.locator('.chibi-controls').getByRole('button', { name: 'Play', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await pet.getByRole('button', { name: 'Dismiss roaming chibi', exact: true }).click();
  await expect(pet).toHaveCount(0);
  await expect(page.locator('.operator-chibi canvas')).toBeVisible();
});

test('dragging outside the viewer drops a walking chibi at that point', async ({ page, isMobile }) => {
  await openChibi(page);
  const canvas = await page.locator('.operator-chibi canvas').boundingBox();
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
  await page.getByRole('button', { name: 'Chibi viewer', exact: true }).click();
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
