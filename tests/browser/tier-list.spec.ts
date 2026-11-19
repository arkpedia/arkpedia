import { expect, test, type Locator, type Page, type TestInfo } from '@playwright/test';
import { readOnly } from './census-routes';

/* The Tier List maker (/polls/tier-list): the pool the checkboxes choose, popped out into a
   floating window or pinned under the board; name plates; the three links (full, template,
   quiz); placing by drag alone, where a drop anywhere
   but a row puts the item back; rows, zoom, the saved list, the link and the image; and
   that none of it moves the page under the reader. */
const rowItems = (page: Page) => page.evaluate(() => [...document.querySelectorAll('[data-row]')].map((row) => [...row.querySelectorAll('[data-item]')].map((tile) => tile.getAttribute('aria-label'))));
const pool = (page: Page) => page.locator('[data-pool-list] [data-item]');
const row = (page: Page, n: number) => page.locator('[data-row]').nth(n);
const poolWindow = (page: Page) => page.locator('[data-pool-window]');
const height = (page: Page) => page.evaluate(() => document.documentElement.scrollHeight);
const names = (page: Page, count: number) => pool(page).evaluateAll((tiles, n) => tiles.slice(0, n).map((tile) => tile.getAttribute('aria-label')), count);
const centre = async (target: Locator) => { const box = (await target.boundingBox())!; return { x: box.x + box.width / 2, y: box.y + box.height / 2 }; };
const mobile = (info: TestInfo) => info.project.name === 'mobile';
const detach = (page: Page) => page.getByRole('button', { name: 'Detach the pool so it floats over the page', exact: true }).click();
const pin = (page: Page) => page.getByRole('button', { name: 'Pin the pool under the tier list', exact: true }).click();

async function open(page: Page) {
  await readOnly(page);
  await page.goto('/polls/tier-list');
  await expect(pool(page).first()).toBeVisible();
  // Hydrated: the zoom readout is drawn from the saved list.
  await expect(page.locator('output')).toHaveText('100%');
}

/** One drag, by mouse or by a held finger, from a tile to a point. */
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

/** Drag the pool's first tile into a row. The pool is detached (as it is when the page opens),
 *  so that it and any row are on one screen (a phone's sheet, a window in the corner). */
async function place(page: Page, info: TestInfo, rowIndex: number) {
  if (!(await page.locator('[data-pool-window][data-detached]').count())) await detach(page);
  await row(page, rowIndex).evaluate((element) => window.scrollTo(0, element.getBoundingClientRect().top + window.scrollY - 160));
  const before = (await rowItems(page))[rowIndex].length;
  const box = (await row(page, rowIndex).boundingBox())!;
  await dragTo(page, info, pool(page).first(), { x: box.x + Math.min(box.width - 10, 150), y: box.y + box.height / 2 });
  await expect.poll(async () => (await rowItems(page))[rowIndex].length).toBe(before + 1);
}

/** Open Share, copy one kind of link, and read it back from the clipboard. */
async function copyLink(page: Page, kind: 'Full tier list' | 'Template' | 'Quiz') {
  await page.getByRole('button', { name: 'Share', exact: true }).click();
  await page.getByRole('button', { name: `Copy link: ${kind}`, exact: true }).click();
  await expect(page.getByText(`${kind}: Link copied.`)).toBeVisible();
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  return page.evaluate(() => navigator.clipboard.readText());
}

test('the polls list links to the tier list maker', async ({ page }) => {
  await readOnly(page);
  await page.goto('/polls');
  await expect(page.getByRole('link', { name: 'Tier list maker', exact: true })).toHaveAttribute('href', '/polls/tier-list');
});

test('checkboxes choose the pool without changing the page height', async ({ page }) => {
  await open(page);
  const check = (name: string) => page.getByRole('checkbox', { name, exact: true });
  const icons = await pool(page).count();
  expect(icons).toBeGreaterThan(200);
  const before = await height(page);
  await check('5-star').uncheck();
  const sixStar = await pool(page).count();
  expect(sixStar).toBeLessThan(icons);
  // Elite 0 and Elite 2 art are separate choices, each one illustration per operator.
  await check('Operator icons').uncheck();
  await check('Elite 2 art').check();
  await expect(pool(page)).toHaveCount(sixStar);
  await expect(page.locator('[data-pool-list] [data-item]:not([data-kind="e2"])')).toHaveCount(0);
  // A full illustration is drawn from its 320px rendition, never the full file.
  expect(await pool(page).first().locator('img').getAttribute('src')).toContain('/variants/webp/w320/');
  await check('Elite 2 art').uncheck();
  await check('Elite 0 art').check();
  await expect(page.locator('[data-pool-list] [data-item][data-kind="e0"]')).toHaveCount(sixStar);
  for (const name of ['Operator icons', 'Elite 2 art', 'Outfit art', 'Skill icons', 'Base skill icons']) await check(name).check();
  expect(await pool(page).count()).toBeGreaterThan(sixStar * 6);
  // Enemies, factions and stories have no rarity: with every rarity unticked they are the pool.
  await check('6-star').uncheck();
  await expect(pool(page)).toHaveCount(0);
  await check('Faction emblems').check();
  const factions = await pool(page).count();
  expect(factions).toBeGreaterThan(30);
  await check('Story art').check();
  expect(await pool(page).count()).toBeGreaterThan(factions + 60);
  await check('Enemy icons').check();
  expect(await pool(page).count()).toBeGreaterThan(1000);
  await check('6-star').check();
  await page.getByRole('searchbox', { name: /Search the pool/ }).fill('zzzz no such operator');
  await expect(page.getByText('Nothing in the pool matches.')).toBeVisible();
  for (const name of ['Operator icons', 'Elite 0 art', 'Elite 2 art', 'Outfit art', 'Skill icons', 'Base skill icons', 'Enemy icons', 'Faction emblems', 'Story art']) await check(name).uncheck();
  await page.getByRole('searchbox', { name: /Search the pool/ }).fill('');
  await expect(page.getByText('Tick a rarity and a kind of art to fill the pool.')).toBeVisible();
  expect(await height(page)).toBe(before);
});

test('dragging is the only way in and out, and the list survives a reload', async ({ page }, info) => {
  await open(page);
  // No buttons to place, select or remove, and no removed list.
  for (const name of [/^Remove/, /^Removed/, /Back to pool/, /Deselect/, /^Place /, /Put the pool away/]) await expect(page.getByRole('button', { name })).toHaveCount(0);
  const [first, second] = await names(page, 2);
  const total = await pool(page).count();
  await place(page, info, 1);
  await place(page, info, 1);
  expect((await rowItems(page))[1]).toEqual([first, second]);
  await expect(pool(page)).toHaveCount(total - 2);
  // A tile is not a button: a press on one changes nothing.
  await row(page, 1).locator('[data-item]').first().click();
  expect((await rowItems(page))[1]).toEqual([first, second]);

  await page.getByRole('textbox', { name: 'Row 1 label', exact: true }).fill('Best');
  await page.reload();
  await expect(page.getByRole('textbox', { name: 'Row 1 label', exact: true })).toHaveValue('Best');
  await expect.poll(async () => (await rowItems(page))[1]).toEqual([first, second]);

  // Dropped outside the tier list (here on the page heading), an item is back in the pool.
  await row(page, 1).evaluate((element) => window.scrollTo(0, element.getBoundingClientRect().top + window.scrollY - 260));
  await dragTo(page, info, row(page, 1).locator('[data-item]').first(), await centre(page.getByRole('heading', { name: 'Your tier list', exact: true })));
  await expect.poll(async () => (await rowItems(page))[1]).toEqual([second]);
  await expect(pool(page)).toHaveCount(total - 1);
});

test('rows are added, recoloured and deleted, and a deleted row gives its items back', async ({ page }, info) => {
  await open(page);
  const total = await pool(page).count();
  await page.getByRole('button', { name: 'Add row', exact: true }).click();
  await expect(page.locator('[data-row]')).toHaveCount(6);
  await page.getByRole('textbox', { name: 'Row 6 label', exact: true }).fill('Bench');
  await place(page, info, 5);
  await expect(pool(page)).toHaveCount(total - 1);
  // Pinned again, the pool cannot sit over the row's own buttons.
  await pin(page);
  await page.getByRole('button', { name: 'Edit row Bench', exact: true }).click();
  await page.getByRole('radio', { name: 'Colour #3b3b3b', exact: true }).click();
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(page.locator('[data-ink="light"]')).toHaveCount(1);
  await page.getByRole('button', { name: 'Edit row Bench', exact: true }).click();
  await page.getByRole('button', { name: 'Delete row', exact: true }).click();
  await expect(page.locator('[data-row]')).toHaveCount(5);
  await expect(pool(page)).toHaveCount(total);
});

test('a mouse drags into a row, into place, between rows and back', async ({ page }, info) => {
  test.skip(mobile(info), 'mouse dragging; a finger is the next test');
  await open(page);
  const [first, second] = await names(page, 2);
  await place(page, info, 0);
  await place(page, info, 0);
  expect((await rowItems(page))[0]).toEqual([first, second]);
  // Dropped on the left half of the first tile: it goes in front.
  const front = (await row(page, 0).locator('[data-item]').first().boundingBox())!;
  await dragTo(page, info, row(page, 0).locator('[data-item]').nth(1), { x: front.x + 4, y: front.y + front.height / 2 });
  expect((await rowItems(page))[0]).toEqual([second, first]);
  await dragTo(page, info, row(page, 0).locator('[data-item]').first(), await centre(row(page, 2)));
  expect(await rowItems(page)).toEqual([[first], [], [second], [], []]);
  // Dropped on the floating pool, although a row lies under it: back in the pool.
  await dragTo(page, info, row(page, 2).locator('[data-item]').first(), await centre(pool(page).nth(3)));
  expect(await rowItems(page)).toEqual([[first], [], [], [], []]);
  // Escape gives the drag up.
  const start = await centre(row(page, 0).locator('[data-item]').first());
  await page.mouse.move(start.x, start.y); await page.mouse.down(); await page.mouse.move(start.x + 40, start.y + 200, { steps: 4 });
  await page.keyboard.press('Escape'); await page.mouse.up();
  expect((await rowItems(page))[0]).toEqual([first]);
});

test('a finger drags after a hold, and a swipe on a tile still scrolls the pool', async ({ page }, info) => {
  test.skip(!mobile(info), 'touch dragging');
  await open(page);
  const [name] = await names(page, 1);
  await row(page, 3).evaluate((element) => window.scrollTo(0, element.getBoundingClientRect().top + window.scrollY - 160));
  const scrolled = await page.evaluate(() => window.scrollY);
  await dragTo(page, info, pool(page).first(), await centre(row(page, 3)));
  await expect.poll(async () => (await rowItems(page))[3]).toEqual([name]);
  expect(await page.evaluate(() => window.scrollY)).toBe(scrolled);

  const tile = await centre(pool(page).nth(6));
  const cdp = await page.context().newCDPSession(page);
  const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', y?: number) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: y == null ? [] : [{ x: Math.round(tile.x), y: Math.round(y), id: 1 }] });
  await touch('touchStart', tile.y);
  for (let i = 1; i <= 8; i += 1) await touch('touchMove', tile.y - i * 15);
  await touch('touchEnd');
  await expect.poll(() => page.locator('[data-pool-list]').evaluate((list) => list.scrollTop)).toBeGreaterThan(40);
  expect((await rowItems(page)).flat()).toEqual([name]);
});

test('tiles carry a name plate: whose it is, and for a skill which one', async ({ page }) => {
  await open(page);
  const plate = (tile: Locator) => tile.locator('span > span').allInnerTexts();
  const first = pool(page).first();
  expect(await plate(first)).toEqual([await first.getAttribute('aria-label')]);
  await expect(first.locator('span').first()).toBeVisible();
  await page.getByRole('checkbox', { name: 'Operator icons', exact: true }).uncheck();
  await page.getByRole('checkbox', { name: 'Skill icons', exact: true }).check();
  const skills = await pool(page).evaluateAll((tiles) => tiles.slice(0, 3).map((tile) => [...tile.querySelectorAll('span > span')].map((line) => line.textContent)));
  expect(skills.map((lines) => lines[1])).toEqual(['Skill 1', 'Skill 2', 'Skill 3']);
  expect(new Set(skills.map((lines) => lines[0])).size).toBe(1);
  expect((await pool(page).first().getAttribute('aria-label'))!.startsWith(`${skills[0][0]} - `)).toBe(true);
  // The plate reads on its fixed scrim in either theme, and can be switched off.
  const contrast = await pool(page).first().locator('span').first().evaluate((element) => {
    const lum = (rgb: string) => { const [r, g, b] = rgb.match(/[\d.]+/g)!.slice(0, 3).map((value) => { const c = Number(value) / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
    return (lum(getComputedStyle(element).color) + 0.05) / 0.05;
  });
  expect(contrast).toBeGreaterThan(4.5);
  await page.getByRole('checkbox', { name: 'Show names', exact: true }).uncheck();
  await expect(pool(page).first().locator('span').first()).toBeHidden();
});

test('the pool opens popped out, and its arrow pins it under the tier list', async ({ page }, info) => {
  await open(page);
  const box = poolWindow(page);
  // Popped out when the page opens: over the page, not in it.
  expect(await box.evaluate((element) => getComputedStyle(element).position)).toBe('fixed');
  await expect(box.getByRole('button')).toHaveCount(1);
  if (!mobile(info)) {
    const head = (await page.getByRole('heading', { name: 'Pool', exact: true }).boundingBox())!;
    await page.mouse.move(head.x + 4, head.y + 4); await page.mouse.down(); await page.mouse.move(300, 300, { steps: 5 }); await page.mouse.up();
    const moved = (await box.boundingBox())!;
    expect(Math.abs(moved.x - 300)).toBeLessThan(40);
    expect(Math.abs(moved.y - 300)).toBeLessThan(40);
    // Dragged past the corner, it stays on screen and under the site's bar, never behind it.
    await page.mouse.move(moved.x + 20, moved.y + 12); await page.mouse.down(); await page.mouse.move(-400, -400, { steps: 5 }); await page.mouse.up();
    const bar = (await page.locator('.site-nav').boundingBox())!;
    expect((await box.boundingBox())!.x).toBe(0);
    expect(Math.round((await box.boundingBox())!.y)).toBe(Math.round(bar.y + bar.height));
  } else {
    // A phone's popped-out pool is a sheet along the bottom edge.
    const sheet = (await box.boundingBox())!;
    expect(sheet.x).toBe(0);
    expect(Math.round(sheet.y + sheet.height)).toBe(page.viewportSize()!.height);
  }
  // It does not scroll with the page.
  const top = (await box.boundingBox())!.y;
  await page.evaluate(() => window.scrollBy(0, 150));
  expect((await box.boundingBox())!.y).toBe(top);

  // Pinned: in the page, after the board, moving with it.
  await pin(page);
  expect(await box.evaluate((element) => getComputedStyle(element).position)).toBe('static');
  const boardEnd = await page.locator('[data-row]').last().evaluate((element) => element.getBoundingClientRect().bottom);
  expect((await box.boundingBox())!.y).toBeGreaterThan(boardEnd);
  await expect(pool(page).first()).toBeAttached();

  // Popped out again at the very end of the page: nothing above it moves.
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  const anchor = page.getByRole('button', { name: 'Add row', exact: true });
  const before = { y: await page.evaluate(() => window.scrollY), top: (await anchor.boundingBox())!.y };
  await detach(page);
  expect(await box.evaluate((element) => getComputedStyle(element).position)).toBe('fixed');
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => window.scrollY)).toBe(before.y);
  expect(Math.abs((await anchor.boundingBox())!.y - before.top)).toBeLessThan(4);
});

test('zoom steps the tiles by percent and is kept', async ({ page }) => {
  await open(page);
  const side = () => pool(page).first().evaluate((tile) => tile.getBoundingClientRect().width);
  const base = await side();
  const readout = page.locator('output');
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
  await expect(readout).toHaveText('125%');
  expect(await side()).toBeCloseTo(base * 1.25, 0);
  await page.reload();
  await expect(readout).toHaveText('125%');
  const out = page.getByRole('button', { name: 'Zoom out', exact: true });
  for (let i = 0; i < 3; i += 1) await out.click();
  await expect(readout).toHaveText('50%');
  await expect(out).toBeDisabled();
  expect(await side()).toBeCloseTo(base * 0.5, 0);
});

test('deleting the last row at the end of the page moves nothing', async ({ page }, info) => {
  test.skip(mobile(info), 'a phone deletes from the row dialog');
  await open(page);
  for (let i = 0; i < 8; i += 1) await page.getByRole('button', { name: 'Add row', exact: true }).click();
  // With the pool popped out and parked at the top, the board is the end of the page.
  const head = (await page.getByRole('heading', { name: 'Pool', exact: true }).boundingBox())!;
  await page.mouse.move(head.x + 4, head.y + 4); await page.mouse.down(); await page.mouse.move(40, 80, { steps: 4 }); await page.mouse.up();
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  const anchor = row(page, 10);
  const before = { y: await page.evaluate(() => window.scrollY), top: (await anchor.boundingBox())!.y };
  expect(before.y).toBeGreaterThan(100);
  await page.getByRole('button', { name: 'Delete row 13', exact: true }).click();
  await expect(page.locator('[data-row]')).toHaveCount(12);
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => window.scrollY)).toBe(before.y);
  expect(Math.abs((await anchor.boundingBox())!.y - before.top)).toBeLessThan(4);
});

test('a link shows the list without touching the reader\'s own, until they keep it', async ({ page, context }, info) => {
  test.skip(mobile(info), 'the clipboard is read back on desktop Chromium');
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await open(page);
  const [first, second, third] = await names(page, 3);
  await page.getByRole('textbox', { name: 'Tier list name', exact: true }).fill('Shared ★ list');
  await page.getByRole('textbox', { name: 'Row 1 label', exact: true }).fill('Top');
  await place(page, info, 0);
  await place(page, info, 0);
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
  const link = await copyLink(page, 'Full tier list');
  expect(new URL(link).hash).toMatch(/^#list=[01][A-Za-z0-9_-]+$/);
  expect(new URL(link).search).toBe('');

  // The reader's own list becomes something else, then the link is opened.
  page.on('dialog', (dialog) => void dialog.accept());
  await page.getByRole('button', { name: 'Start over', exact: true }).click();
  await expect(page.locator('output')).toHaveText('100%');
  await place(page, info, 4);
  const own = await rowItems(page);
  expect(own[4]).toEqual([first]);
  await page.goto(link); await page.reload();
  await expect(page.getByText(/You are looking at a shared tier list/)).toBeVisible();
  expect(await rowItems(page)).toEqual([[first, second], [], [], [], []]);
  await expect(page.getByRole('textbox', { name: 'Tier list name', exact: true })).toHaveValue('Shared ★ list');
  await expect(page.locator('output')).toHaveText('125%');
  // Editing the shared list writes nothing.
  await place(page, info, 1);
  expect((await rowItems(page))[1]).toEqual([third]);
  await page.getByRole('button', { name: 'Add row', exact: true }).click();
  await page.goto('/polls/tier-list'); await page.reload();
  // Polled: the first paint is the default list, the saved one arrives with hydration.
  await expect.poll(() => rowItems(page)).toEqual(own);
  await expect(page.locator('[data-row]')).toHaveCount(5);
  // Kept, it replaces the reader's own and the address is clean again.
  await page.goto(link); await page.reload();
  await page.getByRole('button', { name: 'Keep as mine', exact: true }).click();
  await expect(page.getByText(/You are looking at a shared tier list/)).toBeHidden();
  expect(new URL(page.url()).hash).toBe('');
  await page.reload();
  await expect(page.getByRole('textbox', { name: 'Row 1 label', exact: true })).toHaveValue('Top');
  await expect.poll(async () => (await rowItems(page))[0]).toEqual([first, second]);
  // A link that holds no list says so and shows the reader's own.
  await page.goto('/polls/tier-list#list=1nonsense'); await page.reload();
  await expect(page.getByText('That link does not hold a tier list. Showing your own.')).toBeVisible();
  await expect.poll(async () => (await rowItems(page))[0]).toEqual([first, second]);
});

test('a template link carries the tiers and filters with nothing placed', async ({ page, context }, info) => {
  test.skip(mobile(info), 'the clipboard is read back on desktop Chromium');
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await open(page);
  await page.getByRole('checkbox', { name: '5-star', exact: true }).uncheck();
  await page.getByRole('checkbox', { name: 'Faction emblems', exact: true }).check();
  const offered = await pool(page).count();
  await page.getByRole('textbox', { name: 'Row 1 label', exact: true }).fill('Goated');
  await page.getByRole('button', { name: 'Add row', exact: true }).click();
  await place(page, info, 0);
  // Full and quiz links need something placed; a template never does.
  const link = await copyLink(page, 'Template');
  page.on('dialog', (dialog) => void dialog.accept());
  await page.getByRole('button', { name: 'Start over', exact: true }).click();
  await page.goto(link); await page.reload();
  await expect(page.getByText(/You are looking at a shared template/)).toBeVisible();
  await expect(page.locator('[data-row]')).toHaveCount(6);
  await expect(page.getByRole('textbox', { name: 'Row 1 label', exact: true })).toHaveValue('Goated');
  expect((await rowItems(page)).flat()).toEqual([]);
  await expect(page.getByRole('checkbox', { name: '5-star', exact: true })).not.toBeChecked();
  await expect(page.getByRole('checkbox', { name: 'Faction emblems', exact: true })).toBeChecked();
  await expect(pool(page)).toHaveCount(offered);
});

test('a quiz link offers only what its maker placed and scores the reader against them', async ({ page, context }, info) => {
  test.skip(mobile(info), 'the clipboard is read back on desktop Chromium');
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await open(page);
  const [first, second, third, fourth] = await names(page, 4);
  await place(page, info, 0); await place(page, info, 0); await place(page, info, 2); await place(page, info, 4);
  expect(await rowItems(page)).toEqual([[first, second], [], [third], [], [fourth]]);
  const link = await copyLink(page, 'Quiz');
  await page.goto(link); await page.reload();
  await expect(page.getByText(/^Quiz: drag every item/)).toBeVisible();
  // The tiers are the maker's, empty and locked; the pool is their four items and nothing else.
  expect((await rowItems(page)).flat()).toEqual([]);
  await expect(pool(page)).toHaveCount(4);
  expect(await names(page, 4)).toEqual([first, second, third, fourth]);
  for (const name of ['Add row', 'Share', 'Start over', 'Keep as mine', /^Edit row/, /^Delete row/]) await expect(page.getByRole('button', { name })).toHaveCount(0);
  await expect(page.getByRole('checkbox', { name: '6-star', exact: true })).toHaveCount(0);
  await expect(page.getByRole('textbox', { name: 'Row 1 label', exact: true })).not.toBeEditable();
  await expect(page.getByRole('button', { name: 'Check answers', exact: true })).toBeDisabled();
  // Two right (one of them in the maker's tier but placed second), one wrong, one left in the pool.
  await place(page, info, 0); // first -> S: right
  await place(page, info, 1); // second -> A: wrong
  await place(page, info, 2); // third -> B: right
  await page.getByRole('button', { name: 'Check answers', exact: true }).click();
  await expect(page.getByText('Score: 50% · 2 of 4 in the right tier')).toBeVisible();
  await expect(page.locator('[data-row] [data-mark="right"]')).toHaveCount(2);
  await expect(page.locator('[data-row] [data-mark="wrong"]')).toHaveCount(1);
  await expect(page.getByRole('img', { name: `${second} (wrong tier)`, exact: true })).toBeVisible();
  // Moving a tile clears the marks; put right, the score is whole.
  await row(page, 1).evaluate((element) => window.scrollTo(0, element.getBoundingClientRect().top + window.scrollY - 260));
  await dragTo(page, info, row(page, 1).locator('[data-item]').first(), await centre(row(page, 0)));
  await expect(page.locator('[data-mark]')).toHaveCount(0);
  await expect(page.getByText('Not checked yet.')).toBeVisible();
  await place(page, info, 4);
  await page.getByRole('button', { name: 'Check answers', exact: true }).click();
  await expect(page.getByText('Score: 100% · 4 of 4 in the right tier')).toBeVisible();
  // The reader's own list (what they made the quiz from) is untouched.
  await page.getByRole('button', { name: 'Back to mine', exact: true }).click();
  await expect.poll(() => rowItems(page)).toEqual([[first, second], [], [third], [], [fourth]]);
  await page.reload();
  await expect.poll(() => rowItems(page)).toEqual([[first, second], [], [third], [], [fourth]]);
});

test('the tier list is saved as a PNG after its art has been on the page', async ({ page }, info) => {
  test.skip(mobile(info), 'one download is enough');
  await open(page);
  await page.getByRole('checkbox', { name: 'Elite 2 art', exact: true }).check();
  for (let i = 0; i < 4; i += 1) await place(page, info, 0);
  // The tiles have loaded their art without CORS; the image must still export (a canvas
  // that drew a picture fetched that way only fails here, at toBlob).
  await expect.poll(() => page.locator('[data-row] [data-item] img').evaluateAll((images) => images.filter((image) => (image as HTMLImageElement).complete).length)).toBe(4);
  await page.getByRole('button', { name: 'Make image', exact: true }).click();
  await expect(page.locator('canvas[data-ready]')).toBeVisible({ timeout: 25000 });
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download PNG', exact: true }).click()]);
  expect(download.suggestedFilename()).toBe('arkpedia-tier-list.png');
  await expect(page.getByText('PNG downloaded.')).toBeVisible();
  const size = await page.locator('canvas[data-ready]').evaluate((canvas) => [(canvas as HTMLCanvasElement).width, (canvas as HTMLCanvasElement).height]);
  expect(size[0]).toBe(1200);
  expect(size[1]).toBeGreaterThan(400);
});
