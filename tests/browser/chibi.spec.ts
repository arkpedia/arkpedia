import { expect, test } from '@playwright/test';

test.setTimeout(120000);
async function openChibi(page: import('@playwright/test').Page) {
  await page.goto('/operators/Thorns');
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

test('page chibi walks, can pause and return, and is removed on navigation', async ({ page }) => {
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
  await page.getByRole('button', { name: 'Walk on page', exact: true }).click();
  await page.goto('/community');
  await expect(pet).toHaveCount(0);
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
  await pet.getByRole('button', { name: 'Return chibi to viewer', exact: true }).click();
  await expect(pet).toHaveCount(0);
});
