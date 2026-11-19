import { expect, test, type Locator, type Page, type TestInfo } from '@playwright/test';
import { readOnly } from './census-routes';

/* The chart maker (/polls/chart-maker): a labelled grid the reader sizes, or a plane between
   two axes where an item sits anywhere; the Tier List maker's pool and dragging; the saved
   chart, its link and its image. */
const pool = (page: Page) => page.locator('[data-pool-list] [data-item]');
const cell = (page: Page, n: number) => page.locator('[data-row]').nth(n);
const plane = (page: Page) => page.locator('[data-plane]');
const cellItems = (page: Page) => page.evaluate(() => [...document.querySelectorAll('[data-row]')].map((box) => [...box.querySelectorAll('[data-item]')].map((tile) => tile.getAttribute('aria-label'))));
const points = (page: Page) => page.evaluate(() => { const box = document.querySelector('[data-plane]')!.getBoundingClientRect(); return [...document.querySelectorAll('[data-plane] [data-item]')].map((tile) => { const r = tile.getBoundingClientRect(); return { name: tile.getAttribute('aria-label'), x: (r.left + r.width / 2 - box.left) / box.width, y: (r.top + r.height / 2 - box.top) / box.height }; }); });
const names = (page: Page, count: number) => pool(page).evaluateAll((tiles, n) => tiles.slice(0, n).map((tile) => tile.getAttribute('aria-label')), count);
const centre = async (target: Locator) => { const box = (await target.boundingBox())!; return { x: box.x + box.width / 2, y: box.y + box.height / 2 }; };
const mobile = (info: TestInfo) => info.project.name === 'mobile';

/** Open the page with the pool popped out (a window in the corner, a sheet on a phone), so
 *  the pool and any part of the chart are on one screen for a drag. `pinned` leaves the pool
 *  where the page opens it, under the chart. */
async function open(page: Page, pinned = false) {
  await readOnly(page);
  await page.goto('/polls/chart-maker');
  await expect(pool(page).first()).toBeAttached();
  await expect(page.locator('[role="group"][aria-label="Zoom"] output')).toHaveText('100%');
  if (!pinned) await page.getByRole('button', { name: 'Detach the pool so it floats over the page', exact: true }).click();
}

async function dragTo(page: Page, info: TestInfo, tile: Locator, to: { x: number; y: number }) {
  const from = await centre(tile);
  if (!mobile(info)) {
    await page.mouse.move(from.x, from.y); await page.mouse.down();
    await page.mouse.move(from.x + 8, from.y - 8, { steps: 2 }); await page.mouse.move(to.x, to.y, { steps: 8 });
    await page.mouse.up();
    return;
  }
  const cdp = await page.context().newCDPSession(page);
  const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', point?: { x: number; y: number }) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: point ? [{ x: Math.round(point.x), y: Math.round(point.y), id: 1 }] : [] });
  await touch('touchStart', from);
  await page.waitForTimeout(350);
  for (let i = 1; i <= 8; i += 1) await touch('touchMove', { x: from.x + (to.x - from.x) * i / 8, y: from.y + (to.y - from.y) * i / 8 });
  await touch('touchEnd');
  await cdp.detach();
}

/** Bring a board element to the top of the screen, clear of the floating pool below it. */
const lift = (target: Locator) => target.evaluate((element) => window.scrollTo(0, element.getBoundingClientRect().top + window.scrollY - 170));

test('the two makers are in Extras, between Music and Games', async ({ page }, info) => {
  test.skip(mobile(info), 'the desktop bar; the drawer reads the same list');
  await readOnly(page);
  await page.goto('/polls/chart-maker');
  await page.locator('[data-menu="extras"]').first().click();
  const links = page.locator('[data-menu="extras"] a, [data-menu-panel="extras"] a');
  await expect(page.getByRole('link', { name: 'Tier List Maker', exact: true }).first()).toHaveAttribute('href', '/polls/tier-list');
  expect(await page.evaluate(() => { const all = [...document.querySelectorAll('a')].filter((a) => ['/music', '/polls/tier-list', '/polls/chart-maker', '/games'].includes(a.getAttribute('href') ?? '') && a.closest('nav')); const seen: string[] = []; for (const a of all) { const href = a.getAttribute('href')!; if (!seen.includes(href)) seen.push(href); } return seen; })).toEqual(['/music', '/polls/tier-list', '/polls/chart-maker', '/games']);
  void links;
});

test('the pool is under the chart, and the chart is narrower than the page and centred', async ({ page }, info) => {
  await open(page, true);
  const box = page.locator('[data-pool-window]');
  expect(await box.evaluate((element) => getComputedStyle(element).position)).toBe('static');
  const frame = (await page.locator('main').boundingBox())!;
  const centred = async (target: Locator, narrower: boolean) => {
    const chart = (await target.boundingBox())!;
    expect((await box.boundingBox())!.y).toBeGreaterThan(chart.y + chart.height);
    expect(Math.abs((chart.x + chart.width / 2) - (frame.x + frame.width / 2))).toBeLessThan(3);
    if (narrower) expect(chart.width).toBeLessThan(frame.width - 150);
  };
  // On a phone the chart has the whole width; on a wide screen it leaves room either side.
  await centred(page.locator('[class*="TierList_chartFrame"]'), !mobile(info));
  await page.getByRole('button', { name: 'Axes', exact: true }).click();
  await centred(plane(page), !mobile(info));
  // The arrow still pops the pool out.
  await page.getByRole('button', { name: 'Detach the pool so it floats over the page', exact: true }).click();
  expect(await box.evaluate((element) => getComputedStyle(element).position)).toBe('fixed');
});

test('a grid label takes a colour of the reader\'s own, with ink that reads on it', async ({ page }) => {
  await open(page);
  const bar = page.locator('[class*="TierList_cellBar"]').nth(4);
  const swatch = page.getByLabel('Colour of row 2, column 2', { exact: true });
  const own = await swatch.inputValue();
  expect(own).toMatch(/^#[0-9a-f]{6}$/);
  const ground = () => bar.evaluate((element) => getComputedStyle(element).backgroundColor);
  const ink = () => bar.locator('input[type="text"]').evaluate((element) => getComputedStyle(element).color);
  expect(await ink()).toBe('rgb(20, 24, 28)');
  await swatch.fill('#2a0a4a');
  expect(await ground()).toBe('rgb(42, 10, 74)');
  expect(await ink()).toBe('rgb(255, 255, 255)');
  await swatch.fill('#ffee00');
  expect(await ink()).toBe('rgb(20, 24, 28)');
  // Its neighbours keep their own, and the choice is kept.
  expect(await page.getByLabel('Colour of row 2, column 1', { exact: true }).inputValue()).not.toBe('#ffee00');
  await page.reload();
  await expect(page.getByLabel('Colour of row 2, column 2', { exact: true })).toHaveValue('#ffee00');
});

test('the grid: sized and labelled by the reader, filled by dragging, kept over a reload', async ({ page }, info) => {
  await open(page);
  await expect(page.locator('[data-row]')).toHaveCount(9);
  await expect(page.getByRole('textbox', { name: 'Label of row 1, column 1', exact: true })).toHaveValue('Lawful Good');
  const [first, second] = await names(page, 2);
  const total = await pool(page).count();
  await lift(cell(page, 0));
  await dragTo(page, info, pool(page).first(), await centre(cell(page, 1)));
  await expect.poll(async () => (await cellItems(page))[1]).toEqual([first]);
  await dragTo(page, info, pool(page).first(), await centre(cell(page, 0)));
  await expect.poll(async () => (await cellItems(page))[0]).toEqual([second]);
  await expect(pool(page)).toHaveCount(total - 2);

  // A column more, from the grid's own edge: every cell keeps its place, the new ones are empty.
  const before = await page.evaluate(() => document.documentElement.scrollHeight);
  await page.getByRole('button', { name: 'Add a column', exact: true }).click();
  await expect(page.locator('[data-row]')).toHaveCount(12);
  await expect(page.getByRole('textbox', { name: 'Label of row 2, column 1', exact: true })).toHaveValue('Lawful Neutral');
  await expect(page.getByRole('textbox', { name: 'Label of row 1, column 4', exact: true })).toHaveValue('');
  expect((await cellItems(page)).slice(0, 2)).toEqual([[second], [first]]);
  expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeGreaterThanOrEqual(before - 2);
  await page.getByRole('textbox', { name: 'Label of row 1, column 4', exact: true }).fill('Gremlin');
  // Each × sits on the line it removes.
  const remove = (await page.getByRole('button', { name: 'Remove column 2', exact: true }).boundingBox())!;
  const second2 = (await cell(page, 1).boundingBox())!;
  expect(remove.x).toBeGreaterThanOrEqual(second2.x - 1);
  expect(remove.x + remove.width).toBeLessThanOrEqual(second2.x + second2.width + 1);
  // The second column out, wherever it is: what it held is back in the pool, its neighbours stay.
  await page.getByRole('button', { name: 'Remove column 2', exact: true }).click();
  await expect(page.locator('[data-row]')).toHaveCount(9);
  await expect(page.getByRole('textbox', { name: 'Label of row 1, column 2', exact: true })).toHaveValue('Chaotic Good');
  await expect(page.getByRole('textbox', { name: 'Label of row 1, column 3', exact: true })).toHaveValue('Gremlin');
  expect((await cellItems(page))[0]).toEqual([second]);
  await expect(pool(page)).toHaveCount(total - 1);
  await page.getByRole('button', { name: 'Remove row 3', exact: true }).click();
  await page.getByRole('button', { name: 'Remove row 2', exact: true }).click();
  await page.getByRole('button', { name: 'Remove column 3', exact: true }).click();
  await page.getByRole('button', { name: 'Remove column 2', exact: true }).click();
  // One cell left: nothing more to remove, and the label bar reads on its accent.
  await expect(page.locator('[data-row]')).toHaveCount(1);
  await expect(page.getByRole('button', { name: /^Remove (column|row)/ })).toHaveCount(0);
  await page.getByRole('button', { name: 'Add a row', exact: true }).click();
  await page.getByRole('button', { name: 'Add a column', exact: true }).click();
  await page.getByRole('button', { name: 'Add a column', exact: true }).click();
  await expect(page.locator('[data-row]')).toHaveCount(6);
  await page.getByRole('button', { name: 'Remove row 2', exact: true }).click();
  await expect(page.locator('[data-row]')).toHaveCount(3);

  await page.reload();
  await expect(page.locator('[data-row]')).toHaveCount(3);
  await expect.poll(async () => (await cellItems(page))[0]).toEqual([second]);
  // Dropped outside the chart, an item is back in the pool.
  await lift(cell(page, 0));
  await dragTo(page, info, cell(page, 0).locator('[data-item]').first(), await centre(page.getByRole('heading', { name: 'Your chart', exact: true })));
  await expect.poll(async () => (await cellItems(page)).flat()).toEqual([]);
  await expect(pool(page)).toHaveCount(total);
});

test('the axes: four labels of the reader\'s own and an item anywhere between them', async ({ page }, info) => {
  await open(page);
  const [first, second] = await names(page, 2);
  const total = await pool(page).count();
  await page.getByRole('button', { name: 'Axes', exact: true }).click();
  await expect(plane(page)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add a column', exact: true })).toHaveCount(0);
  await page.getByRole('textbox', { name: 'Top of the vertical axis', exact: true }).fill('Seiso');
  await page.getByRole('textbox', { name: 'Left of the horizontal axis', exact: true }).fill('Down bad');
  await lift(plane(page));
  const box = (await plane(page).boundingBox())!;
  const at = (x: number, y: number) => ({ x: box.x + box.width * x, y: box.y + box.height * y });
  // On a phone the sheet covers the plane's lower part, so the drops stay in its upper half.
  await dragTo(page, info, pool(page).first(), at(0.2, 0.3));
  await dragTo(page, info, pool(page).first(), at(0.75, 0.12));
  await expect.poll(async () => (await points(page)).map((point) => point.name)).toEqual([first, second]);
  const placed = await points(page);
  expect(Math.abs(placed[0].x - 0.2)).toBeLessThan(0.03); expect(Math.abs(placed[0].y - 0.3)).toBeLessThan(0.03);
  expect(Math.abs(placed[1].x - 0.75)).toBeLessThan(0.03); expect(Math.abs(placed[1].y - 0.12)).toBeLessThan(0.03);
  await expect(pool(page)).toHaveCount(total - 2);
  // A placed item moves when it is dragged again, and stays one item.
  // While a tile is over the plane, two guide lines mark where it will land.
  if (!mobile(info)) {
    const from = await centre(plane(page).locator('[data-item]').first());
    await page.mouse.move(from.x, from.y); await page.mouse.down(); await page.mouse.move(from.x + 9, from.y + 9, { steps: 2 }); await page.mouse.move(at(0.6, 0.4).x, at(0.6, 0.4).y, { steps: 4 });
    await expect(plane(page)).toHaveAttribute('data-drop', '');
    expect(await plane(page).evaluate((element) => [element.style.getPropertyValue('--drop-x'), element.style.getPropertyValue('--drop-y')].map((value) => Math.round(parseFloat(value))))).toEqual([60, 40]);
    await page.keyboard.press('Escape'); await page.mouse.up();
    await expect(plane(page)).not.toHaveAttribute('data-drop', '');
  }
  await dragTo(page, info, plane(page).locator('[data-item]').first(), at(0.5, 0.2));
  await expect.poll(async () => (await points(page)).find((point) => point.name === first)!.x).toBeGreaterThan(0.45);
  expect((await points(page)).length).toBe(2);

  // One axis hidden: its line and both its labels go, the other axis and every item stay.
  const line = (pseudo: string) => plane(page).evaluate((element, which) => getComputedStyle(element, which).display, pseudo);
  const before = await points(page);
  await page.getByRole('checkbox', { name: 'Vertical axis', exact: true }).uncheck();
  expect([await line('::before'), await line('::after')]).toEqual(['none', 'block']);
  await expect(page.getByRole('textbox', { name: 'Top of the vertical axis', exact: true })).toHaveCount(0);
  await expect(page.getByRole('textbox', { name: 'Left of the horizontal axis', exact: true })).toHaveValue('Down bad');
  expect(await points(page)).toEqual(before);
  await page.getByRole('checkbox', { name: 'Horizontal axis', exact: true }).uncheck();
  expect([await line('::before'), await line('::after')]).toEqual(['none', 'none']);
  await expect(plane(page).getByRole('textbox')).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('checkbox', { name: 'Horizontal axis', exact: true })).not.toBeChecked();
  // Shown again, an axis has the label it had.
  await page.getByRole('checkbox', { name: 'Vertical axis', exact: true }).check();
  await page.getByRole('checkbox', { name: 'Horizontal axis', exact: true }).check();
  await expect(page.getByRole('textbox', { name: 'Top of the vertical axis', exact: true })).toHaveValue('Seiso');
  await expect.poll(async () => (await points(page)).length).toBe(2);
  // The grid kept nothing of this, and comes back as it was.
  await page.getByRole('button', { name: 'Grid', exact: true }).click();
  await expect(page.locator('[data-row]')).toHaveCount(9);
  await expect(pool(page)).toHaveCount(total);
  await page.getByRole('button', { name: 'Axes', exact: true }).click();
  // Dropped off the plane, an item is back in the pool.
  await lift(plane(page));
  await dragTo(page, info, plane(page).locator('[data-item]').first(), await centre(page.getByRole('heading', { name: 'Your chart', exact: true })));
  await expect.poll(async () => (await points(page)).length).toBe(1);
});

test('a chart is shared as a link that never overwrites the reader\'s own, and saved as a PNG', async ({ page, context }, info) => {
  test.skip(mobile(info), 'the clipboard and the download are read back on desktop Chromium');
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await open(page);
  const [first] = await names(page, 1);
  await page.getByRole('button', { name: 'Axes', exact: true }).click();
  await page.getByRole('textbox', { name: 'Bottom of the vertical axis', exact: true }).fill('Yabai');
  await lift(plane(page));
  const box = (await plane(page).boundingBox())!;
  await dragTo(page, info, pool(page).first(), { x: box.x + box.width * 0.3, y: box.y + box.height * 0.4 });
  await expect.poll(async () => (await points(page)).length).toBe(1);

  await page.getByRole('button', { name: 'Share', exact: true }).click();
  await page.getByRole('button', { name: 'Copy link: Full chart', exact: true }).click();
  await expect(page.getByText('Full chart: Link copied.')).toBeVisible();
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  const link = await page.evaluate(() => navigator.clipboard.readText());
  expect(new URL(link).hash).toMatch(/^#chart=[01][A-Za-z0-9_-]+$/);

  await page.getByRole('button', { name: 'Make image', exact: true }).click();
  await expect(page.locator('canvas[data-ready]')).toBeVisible({ timeout: 25000 });
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download PNG', exact: true }).click()]);
  expect(download.suggestedFilename()).toBe('arkpedia-chart.png');
  await page.getByRole('button', { name: 'Close', exact: true }).click();

  page.on('dialog', (dialog) => void dialog.accept());
  await page.getByRole('button', { name: 'Start over', exact: true }).click();
  await expect(page.locator('[data-row]')).toHaveCount(9);
  await page.goto(link); await page.reload();
  await expect(page.getByText(/You are looking at a shared chart/)).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Bottom of the vertical axis', exact: true })).toHaveValue('Yabai');
  const shared = await points(page);
  expect(shared.map((point) => point.name)).toEqual([first]);
  expect(Math.abs(shared[0].x - 0.3)).toBeLessThan(0.03);
  await page.getByRole('textbox', { name: 'Bottom of the vertical axis', exact: true }).fill('Changed');
  await page.goto('/polls/chart-maker'); await page.reload();
  await expect(page.locator('[data-row]')).toHaveCount(9);
  await page.getByRole('button', { name: 'Axes', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Bottom of the vertical axis', exact: true })).toHaveValue('');
  // A tier list's link is not a chart.
  await page.goto('/polls/chart-maker#chart=1nonsense'); await page.reload();
  await expect(page.getByText('That link does not hold a chart. Showing your own.')).toBeVisible();
});

test('a grid is shared as a quiz: its maker\'s items only, a locked grid, and a score', async ({ page, context }, info) => {
  test.skip(mobile(info), 'the clipboard is read back on desktop Chromium');
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await open(page);
  const [first, second, third] = await names(page, 3);
  await lift(cell(page, 0));
  for (const target of [0, 4, 8]) { await dragTo(page, info, pool(page).first(), await centre(cell(page, target))); await expect.poll(async () => (await cellItems(page))[target].length).toBe(1); }
  // The axes version has no cells to be right in: no quiz is offered there.
  await page.getByRole('button', { name: 'Axes', exact: true }).click();
  await page.getByRole('button', { name: 'Share', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Copy link: Quiz', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('button', { name: 'Grid', exact: true }).click();
  await page.getByRole('button', { name: 'Share', exact: true }).click();
  await page.getByRole('button', { name: 'Copy link: Quiz', exact: true }).click();
  await expect(page.getByText('Quiz: Link copied.')).toBeVisible();
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  const link = await page.evaluate(() => navigator.clipboard.readText());

  await page.goto(link); await page.reload();
  await expect(page.getByText(/^Quiz: drag every item into the cell/)).toBeVisible();
  await page.getByRole('button', { name: 'Detach the pool so it floats over the page', exact: true }).click();
  expect((await cellItems(page)).flat()).toEqual([]);
  await expect(pool(page)).toHaveCount(3);
  expect(await names(page, 3)).toEqual([first, second, third]);
  // The grid is the question: it cannot be resized, relabelled or recoloured, nor the pool changed.
  for (const name of ['Add a column', 'Add a row', /^Remove (column|row)/, 'Share', 'Start over', 'Keep as mine', 'Grid', 'Axes']) await expect(page.getByRole('button', { name })).toHaveCount(0);
  await expect(page.getByRole('checkbox', { name: '6-star', exact: true })).toHaveCount(0);
  await expect(page.getByLabel(/^Colour of row/)).toHaveCount(0);
  await expect(page.getByRole('textbox', { name: 'Label of row 1, column 1', exact: true })).not.toBeEditable();
  await lift(cell(page, 0));
  await dragTo(page, info, pool(page).first(), await centre(cell(page, 0))); // first: right
  await dragTo(page, info, pool(page).first(), await centre(cell(page, 1))); // second: wrong
  await expect.poll(async () => (await cellItems(page)).flat().length).toBe(2);
  await page.getByRole('button', { name: 'Check answers', exact: true }).click();
  await expect(page.locator('[data-score="33"]')).toHaveText(/Score\s*33%\s*1 of 3 in the right cell/);
  await expect(page.getByRole('img', { name: `${second} (wrong cell)`, exact: true })).toBeVisible();
  await dragTo(page, info, cell(page, 1).locator('[data-item]').first(), await centre(cell(page, 4)));
  await expect(page.locator('[data-mark]')).toHaveCount(0);
  await dragTo(page, info, pool(page).first(), await centre(cell(page, 8)));
  await page.getByRole('button', { name: 'Check answers', exact: true }).click();
  await expect(page.locator('[data-score="100"]')).toHaveText(/3 of 3 in the right cell/);
  // The maker's own chart is as they left it.
  await page.getByRole('button', { name: 'Back to mine', exact: true }).click();
  await expect.poll(async () => (await cellItems(page)).map((items) => items.length)).toEqual([1, 0, 0, 0, 1, 0, 0, 0, 1]);
});
