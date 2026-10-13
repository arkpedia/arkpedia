import { expect, test, type Page } from '@playwright/test';
import { stubYouTube, youtube } from './youtube-stub';

const rows = (page: Page) => page.locator('.music-queue-list .music-queue-row[data-song-id]');
const order = (page: Page) => rows(page).evaluateAll(elements => elements.map(el => (el as HTMLElement).dataset.songId));
/** The queue's own order (its display positions), whatever part of it the view shows first. */
const queueOrder = (page: Page) => rows(page).evaluateAll(elements => elements
  .map(el => ({ pos: Number((el as HTMLElement).dataset.displayPos), id: (el as HTMLElement).dataset.songId }))
  .sort((a, b) => a.pos - b.pos).map(row => row.id));
async function dragInput(page: Page) {
  if (test.info().project.name !== 'mobile') return {
    start: async (x: number, y: number) => { await page.mouse.move(x, y); await page.mouse.down(); },
    move: async (x: number, y: number) => { await page.mouse.move(x, y, { steps: 8 }); },
    end: async () => { await page.mouse.up(); },
  };
  const cdp = await page.context().newCDPSession(page);
  return {
    start: async (x: number, y: number) => { await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] }); },
    move: async (x: number, y: number) => { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y }] }); },
    end: async () => { await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await cdp.detach(); },
  };
}

test('song titles play immediately without inserting or changing the queue', async ({ page }) => {
  await stubYouTube(page);
  await page.goto('/music?view=queue');
  await expect(rows(page).nth(2)).toBeVisible();
  const before = await order(page);
  const song = before[2];
  await rows(page).nth(2).locator('.music-queue-row-title').click();
  await expect.poll(async () => (await youtube(page))?.videoId).toBe(song);
  await expect.poll(async () => (await youtube(page))?.state).toBe(1);
  // The Queue shows the song playing first (the two before it fold into Played earlier); the
  // queue's own order, which data-display-pos carries, is unchanged.
  const played = await queueOrder(page);
  expect(played.slice(0, before.length - 2)).toEqual(before.slice(2));
  await expect(rows(page).first()).toHaveClass(/\bcurrent\b/);
  await expect(page.getByRole('heading', { name: 'Now playing', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Play now', exact: true })).toHaveCount(0);
  await expect(page.locator('.music-queue-row.selected')).toHaveCount(0);
  const next = (await order(page))[1];
  await rows(page).nth(1).locator('.music-queue-row-title').click();
  await expect.poll(async () => (await youtube(page))?.videoId).toBe(next);
  expect((await queueOrder(page)).slice(0, before.length - 3)).toEqual(before.slice(3));
});

test('mobile song actions have anchored playlist and reorder submenus', async ({ page }) => {
  test.skip(test.info().project.name !== 'mobile', 'phone action menu');
  await stubYouTube(page);
  await page.goto('/music?view=queue');
  const row = rows(page).nth(1);
  await expect(row).toBeVisible();
  const more = row.getByRole('button', { name: /^More actions for / });
  await expect(more).toBeVisible();
  expect(await row.evaluate(el => el.getBoundingClientRect().height)).toBeLessThanOrEqual(44);
  await expect(row.locator('.music-song-desktop-actions')).not.toBeVisible();
  await more.click();
  const menu = page.getByRole('dialog', { name: 'Song actions', exact: true });
  const iconPositions = await menu.locator('.music-song-menu-options > button > svg').evaluateAll(icons => icons.map(icon => icon.getBoundingClientRect().left));
  expect(Math.max(...iconPositions) - Math.min(...iconPositions)).toBeLessThan(1);
  await expect(menu.getByRole('button', { name: 'Reorder', exact: true })).toBeVisible();
  await menu.getByRole('button', { name: 'Add to playlist', exact: true }).click();
  const picker = page.getByRole('dialog', { name: 'Add to playlists', exact: true });
  await expect(picker.getByRole('checkbox', { name: 'Favourites', exact: true })).toBeVisible();
  await picker.getByRole('button', { name: 'Back to song actions' }).click();
  await menu.getByRole('button', { name: 'Reorder', exact: true }).click();
  const reorder = page.getByRole('dialog', { name: 'Reorder song', exact: true });
  const before = await order(page);
  await reorder.getByRole('button', { name: 'Move down', exact: true }).click();
  await expect.poll(async () => (await order(page))[2]).toBe(before[1]);
  expect(await youtube(page)).toMatchObject({ state: 5 });
  await rows(page).nth(1).getByRole('button', { name: /^More actions for / }).click();
  await page.screenshot({ path: '.cache/song-mobile-actions.png' });
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const removedId = (await order(page))[1];
  await rows(page).nth(1).getByRole('button', { name: /^More actions for / }).click();
  await page.getByRole('dialog', { name: 'Song actions', exact: true }).getByRole('button', { name: 'Remove', exact: true }).click();
  expect(await order(page)).not.toContain(removedId);
});

for (const shuffled of [false, true]) {
  test(`dragging reorders the visible sequence without changing playback (shuffle ${shuffled})`, async ({ page }) => {
    await stubYouTube(page);
    // Shuffle is on Now playing's full transport (a phone's Queue shows the mini player).
    await page.goto('/music?view=player');
    const shuffle = page.locator('.music-player-bottombar').getByRole('button', { name: 'Shuffle', exact: true });
    await expect(shuffle).toBeVisible();
    if ((await shuffle.getAttribute('aria-pressed') === 'true') !== shuffled) await shuffle.click();
    await page.getByRole('navigation', { name: 'Music' }).getByRole('link', { name: /^Queue/ }).click();
    await expect(rows(page).nth(3)).toBeVisible();
    await rows(page).first().locator('.music-queue-row-title').click();
    await expect.poll(async () => (await youtube(page))?.state).toBe(1);
    const playing = await youtube(page);
    const before = await order(page);
    const handle = (await rows(page).nth(3).locator('.music-queue-drag-handle').boundingBox())!;
    const target = (await rows(page).nth(1).boundingBox())!;
    const input = await dragInput(page);
    await input.start(handle.x + handle.width / 2, handle.y + handle.height / 2);
    await input.move(target.x + target.width / 2, target.y + target.height / 2);
    await expect(rows(page).nth(3)).toHaveClass(/dragging/);
    await expect(rows(page).nth(1)).toHaveClass(/drop-before/);
    await input.end();
    await expect.poll(async () => (await order(page)).slice(0, 5)).toEqual([before[0], before[3], before[1], before[2], before[4]]);
    expect(await youtube(page)).toMatchObject({ state: 1, videoId: playing!.videoId, players: 1 });
    await expect(page.locator('.music-song-drag-ghost')).toHaveCount(0);
  });
}

test('edge scrolling is fast, loads more than one batch, and an outside drop cancels', async ({ page }) => {
  await stubYouTube(page);
  await page.goto('/music?view=queue');
  await expect(rows(page).nth(1)).toBeVisible();
  const before = await order(page);
  await page.evaluate(() => document.fonts.ready);
  await expect.poll(async () => (await youtube(page))?.state).toBe(5);
  const handle = (await rows(page).nth(1).locator('.music-queue-drag-handle').boundingBox())!;
  const list = page.locator('[data-song-list]').first();
  const box = (await list.boundingBox())!;
  const input = await dragInput(page);
  await input.start(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await input.move(box.x + box.width / 2, box.y + box.height - 5);
  await expect.poll(() => list.evaluate(el => el.scrollTop), { timeout: 1800 }).toBeGreaterThan(700);
  await expect.poll(() => rows(page).count(), { timeout: 3000 }).toBeGreaterThan(50);
  await input.move(8, box.y + box.height / 2);
  await expect(page.locator('.music-song-drag-ghost')).toContainText('Release to cancel');
  const stoppedAt = await list.evaluate(el => el.scrollTop);
  // Stationary outside the list: the scroll loop stops, and releasing does not commit the old target.
  await expect.poll(() => list.evaluate(el => el.scrollTop)).toBe(stoppedAt);
  await input.end();
  expect((await order(page)).slice(0, before.length)).toEqual(before);
  await expect(page.locator('.music-queue-row.dragging')).toHaveCount(0);
  await expect(page.locator('.music-queue-row.drop-before, .music-queue-row.drop-after')).toHaveCount(0);
});

test('Escape cancels a drag, and keyboard arrows reorder with reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await stubYouTube(page);
  await page.goto('/music?view=queue');
  await expect(rows(page).nth(2)).toBeVisible();
  const before = await order(page);
  const handle = (await rows(page).nth(2).locator('.music-queue-drag-handle').boundingBox())!;
  const target = (await rows(page).first().boundingBox())!;
  const input = await dragInput(page);
  await input.start(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await input.move(target.x + target.width / 2, target.y + target.height / 2);
  await page.keyboard.press('Escape');
  await input.end();
  expect(await order(page)).toEqual(before);
  await rows(page).nth(2).locator('.music-queue-drag-handle').press('ArrowUp');
  await expect.poll(async () => (await order(page))[1]).toBe(before[2]);
  expect(await page.locator('.music-queue-row').evaluateAll(elements => elements.flatMap(el => el.getAnimations()).length)).toBe(0);
  await expect(rows(page).nth(1).locator('.music-queue-drag-handle')).toBeFocused();
});

for (const native of [false, true]) {
  test(`edge scrolling stops and reverses while dragging (${native ? 'native title' : 'handle'})`, async ({ page }) => {
    test.skip(native && test.info().project.name === 'mobile', 'native mouse dragging only');
    await stubYouTube(page);
    await page.goto('/music?view=queue');
    await expect(rows(page).nth(1)).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    await expect.poll(async () => (await youtube(page))?.state).toBe(5);
    const list = page.locator('[data-song-list]').first();
    const box = (await list.boundingBox())!;
    const source = (await rows(page).nth(1).locator(native ? '.music-queue-row-title' : '.music-queue-drag-handle').boundingBox())!;
    const input = native ? {
      start: async (x: number, y: number) => { await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x + 8, y, { steps: 3 }); },
      move: async (x: number, y: number) => { await page.mouse.move(x, y, { steps: 8 }); },
      end: async () => { await page.mouse.up(); },
    } : await dragInput(page);
    const x = box.x + box.width / 2;
    await input.start(source.x + source.width / 2, source.y + source.height / 2);
    await input.move(x, box.y + box.height - 5);
    await expect.poll(() => list.evaluate(el => el.scrollTop), { timeout: 1800 }).toBeGreaterThan(700);
    // Moving back slightly should stop downward scrolling even inside the bottom edge zone.
    await input.move(x, box.y + box.height - 20);
    const reversedAt = await list.evaluate(el => el.scrollTop);
    await page.waitForTimeout(250);
    expect(await list.evaluate(el => el.scrollTop)).toBeCloseTo(reversedAt, 0);
    await input.move(x, box.y + box.height - 5);
    await expect.poll(() => list.evaluate(el => el.scrollTop), { timeout: 1000 }).toBeGreaterThan(reversedAt + 150);
    await input.move(x, box.y + box.height / 2);
    const stoppedAt = await list.evaluate(el => el.scrollTop);
    await page.waitForTimeout(250); // Several animation frames must stay still, not merely one sample.
    expect(await list.evaluate(el => el.scrollTop)).toBeCloseTo(stoppedAt, 0);
    await input.move(x, box.y + 5);
    await expect.poll(() => list.evaluate(el => el.scrollTop), { timeout: 1000 }).toBeLessThan(stoppedAt - 150);
    await input.move(x, box.y + 20);
    const reversedUpAt = await list.evaluate(el => el.scrollTop);
    await page.waitForTimeout(250);
    expect(await list.evaluate(el => el.scrollTop)).toBeCloseTo(reversedUpAt, 0);
    await input.move(x, box.y + box.height / 2);
    const backAt = await list.evaluate(el => el.scrollTop);
    await page.waitForTimeout(250);
    expect(await list.evaluate(el => el.scrollTop)).toBeCloseTo(backAt, 0);
    await page.keyboard.press('Escape');
    await input.end();
  });
}


test('native desktop dragging supports a drop and cancels an outside release', async ({ page }) => {
  test.skip(test.info().project.name === 'mobile', 'touch dragging covered separately');
  await stubYouTube(page);
  await page.goto('/music?view=queue');
  await expect(rows(page).nth(3)).toBeVisible();
  const before = await order(page);
  await rows(page).nth(3).locator('.music-queue-row-title').dragTo(rows(page).nth(1).locator('.music-queue-row-title'));
  await expect.poll(async () => (await order(page))[1]).toBe(before[3]);
  const after = await order(page);
  await rows(page).nth(2).locator('.music-queue-row-title').dragTo(page.getByRole('heading', { name: 'Music', exact: true }));
  expect(await order(page)).toEqual(after);
  await expect(page.locator('.music-queue-row.dragging')).toHaveCount(0);
});
