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

async function open(page: Page) {
  await readOnly(page);
  await page.goto('/polls/chart-maker');
  await expect(pool(page).first()).toBeVisible();
  await expect(page.locator('[role="group"][aria-label="Zoom"] output')).toHaveText('100%');
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

  // A column more: every cell keeps its place, and the new ones are empty and unnamed.
  const before = await page.evaluate(() => document.documentElement.scrollHeight);
  await page.getByRole('button', { name: 'More columns', exact: true }).click();
  await expect(page.locator('[data-row]')).toHaveCount(12);
  await expect(page.getByRole('textbox', { name: 'Label of row 2, column 1', exact: true })).toHaveValue('Lawful Neutral');
  await expect(page.getByRole('textbox', { name: 'Label of row 1, column 4', exact: true })).toHaveValue('');
  expect((await cellItems(page)).slice(0, 2)).toEqual([[second], [first]]);
  expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeGreaterThanOrEqual(before - 2);
  await page.getByRole('textbox', { name: 'Label of row 1, column 4', exact: true }).fill('Gremlin');
  // Two columns fewer: what the removed column held is back in the pool.
  for (let i = 0; i < 3; i += 1) await page.getByRole('button', { name: 'Fewer columns', exact: true }).click();
  await expect(page.locator('[data-row]')).toHaveCount(3);
  expect((await cellItems(page))[0]).toEqual([second]);
  await expect(pool(page)).toHaveCount(total - 1);
  await expect(page.getByRole('button', { name: 'Fewer columns', exact: true })).toBeDisabled();

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
  await expect(page.getByRole('button', { name: 'More columns', exact: true })).toHaveCount(0);
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
  await dragTo(page, info, plane(page).locator('[data-item]').first(), at(0.5, 0.2));
  await expect.poll(async () => (await points(page)).find((point) => point.name === first)!.x).toBeGreaterThan(0.45);
  expect((await points(page)).length).toBe(2);

  await page.reload();
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
