import { expect, test, type Page, type Locator } from '@playwright/test';
import { stubYouTube, youtube } from './youtube-stub';

const KEY = 'arkpedia.music-playlists.v1';
const mobile = (page: Page) => page.viewportSize()!.width <= 720;
function playlistTrigger(page: Page, row: Locator) {
  return mobile(page) ? row.getByRole('button', { name: /^Actions for / }) : row.getByRole('button', { name: /to playlists$/ });
}
async function openPicker(page: Page, row: Locator) {
  await playlistTrigger(page, row).click();
  if (mobile(page)) await page.getByRole('dialog', { name: 'Song actions', exact: true }).getByRole('button', { name: 'Add to playlists', exact: true }).click();
}
async function toggleFavorite(page: Page, row: Locator) {
  if (mobile(page)) {
    await row.getByRole('button', { name: /^Actions for / }).click();
    await page.getByRole('dialog', { name: 'Song actions', exact: true }).getByRole('button', { name: /(?:from|to) favorites$/ }).click();
  } else await row.locator('.music-song-favorite').click();
}
for (const theme of ['dark', 'light']) {
  test(`song favourites and multi-playlist additions persist without changing playback (${theme})`, async ({ page }) => {
    await page.addInitScript(value => localStorage.setItem('theme', value), theme);
    await stubYouTube(page);
    await page.goto('/music?view=queue');
    const rows = page.locator('.music-queue-row:not(.music-queue-row-placeholder)');
    await expect(rows.nth(1)).toBeVisible();
    await rows.first().locator('.music-queue-row-title').click();
    await expect.poll(async () => (await youtube(page))?.state).toBe(1);
    const playing = (await youtube(page))!;
    const song = await rows.nth(1).locator('.music-queue-row-title').getAttribute('title');
    const favorite = rows.nth(1).locator('.music-song-favorite');
    const plus = playlistTrigger(page, rows.nth(1));
    await toggleFavorite(page, rows.nth(1));
    await expect(favorite).toHaveAttribute('aria-pressed', 'true');
    // Styling changes without moving controls or truncating phone titles to make space.
    const layout = await rows.nth(1).evaluate(row => {
      const title = row.querySelector('.music-queue-row-title') as HTMLElement;
      const buttons = [...row.querySelectorAll('.music-queue-row-actions button')].filter(el => el.getBoundingClientRect().height > 0);
      const css = getComputedStyle(title);
      return { room: title.clientWidth - parseFloat(css.paddingLeft) - parseFloat(css.paddingRight), heights: [title, ...buttons].map(el => el.getBoundingClientRect().height) };
    });
    expect(new Set(layout.heights).size).toBe(1);
    expect(layout.room).toBeGreaterThan(151);
    await openPicker(page, rows.nth(1));
    const dialog = page.getByRole('dialog', { name: 'Add to playlists', exact: true });
    await expect(dialog.getByRole('checkbox', { name: /Favourites/ })).toBeChecked();
    await expect(plus).toHaveAttribute('aria-expanded', 'true');
    expect(await dialog.evaluate(el => el.tagName)).toBe('DIV');
    expect(await page.locator('body').evaluate(el => el.style.overflow)).not.toBe('hidden');
    const anchor = (await plus.boundingBox())!;
    const popup = (await dialog.boundingBox())!;
    expect(popup.width).toBeLessThanOrEqual(320);
    expect(popup.x).toBeGreaterThanOrEqual(0);
    expect(popup.x + popup.width).toBeLessThanOrEqual(page.viewportSize()!.width);
    expect(Math.min(Math.abs(popup.y - anchor.y - anchor.height), Math.abs(anchor.y - popup.y - popup.height))).toBeLessThanOrEqual(8);
    await page.getByRole('heading', { name: 'Music', exact: true }).click();
    await expect(dialog).not.toBeVisible();
    await expect(plus).toHaveAttribute('aria-expanded', 'false');
    await openPicker(page, rows.nth(1));
    await dialog.getByRole('textbox', { name: 'New playlist name' }).fill('Night music');
    await dialog.getByRole('button', { name: 'Create new playlist', exact: true }).click();
    await expect(dialog.getByRole('status')).toContainText('Created Night music');
    await expect(dialog.getByRole('checkbox', { name: /Night music/ })).toBeChecked();
    await expect(dialog.getByRole('checkbox', { name: /Night music/ })).toBeDisabled();
    const saved = await page.evaluate(key => JSON.parse(localStorage.getItem(key)!), KEY);
    const id = saved[0].tracks[0];
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('musicFavorites')!))).toContain(id);
    await page.evaluate(({ key, playingId }) => {
      const saved = JSON.parse(localStorage.getItem(key)!);
      localStorage.setItem(key, JSON.stringify([...saved, { id: 'study', name: 'Study', tracks: [playingId] }, { id: 'travel', name: 'Travel', tracks: [] }, { id: 'untouched', name: 'Untouched', tracks: [playingId] }]));
      window.dispatchEvent(new Event('arkpediaMusicPlaylistsChanged'));
    }, { key: KEY, playingId: playing.videoId });
    await dialog.getByRole('checkbox', { name: 'Study', exact: true }).check();
    await dialog.getByRole('checkbox', { name: 'Travel', exact: true }).check();
    await dialog.getByRole('button', { name: 'Add to playlists', exact: true }).click();
    await expect(dialog.getByRole('status')).toHaveText('Added to 2 playlists.');
    const lists = await page.evaluate(key => JSON.parse(localStorage.getItem(key)!), KEY);
    expect(lists.find((p: { id: string }) => p.id === 'study').tracks).toEqual([playing.videoId, id]);
    expect(lists.find((p: { id: string }) => p.id === 'travel').tracks).toEqual([id]);
    expect(lists.find((p: { id: string }) => p.id === 'untouched').tracks).toEqual([playing.videoId]);
    await expect(dialog.getByRole('button', { name: 'Add to playlists', exact: true })).toBeDisabled();
    await dialog.getByRole('textbox', { name: 'New playlist name' }).fill('Night music');
    await dialog.getByRole('button', { name: 'Create new playlist', exact: true }).click();
    await expect(dialog.getByRole('status')).toContainText('Choose a different name');
    expect((await youtube(page))!).toMatchObject({ state: 1, videoId: playing.videoId, players: 1 });
    await page.keyboard.press('Escape');
    await expect(plus).toBeFocused();
    await page.getByRole('button', { name: 'Playlists', exact: true }).click();
    await page.getByRole('combobox', { name: 'Saved playlist' }).click();
    await expect(page.getByRole('option', { name: 'Night music', exact: true })).toBeVisible();
    await page.getByRole('option', { name: 'Night music', exact: true }).click();
    await page.keyboard.press('Escape');
    await page.reload();
    await expect(favorite).toHaveAttribute('aria-pressed', 'true');
    await openPicker(page, rows.nth(1));
    await expect(dialog.getByRole('checkbox', { name: /Study/ })).toBeChecked();
    await expect(dialog.getByRole('checkbox', { name: /Travel/ })).toBeChecked();
    await page.keyboard.press('Escape');
    await toggleFavorite(page, rows.nth(1));
    await expect(favorite).toHaveAttribute('aria-pressed', 'false');
    await page.reload();
    await expect(favorite).toHaveAttribute('aria-pressed', 'false');
    // Search result and Coming Up rows use the same actions and stable song IDs.
    await page.getByRole('searchbox', { name: 'Search songs' }).fill(song!);
    const result = rows.filter({ has: page.locator(`.music-queue-row-title[title=${JSON.stringify(song)}]`) }).first();
    await expect(result.locator('.music-song-favorite')).toHaveAttribute('aria-pressed', 'false');
    await toggleFavorite(page, result);
    await expect(result.locator('.music-song-favorite')).toHaveAttribute('aria-pressed', 'true');
    expect(await page.locator('body').evaluate(el => el.scrollWidth <= window.innerWidth)).toBe(true);
  });
}

test('the picker keeps a second tab’s playlist edits and does not duplicate existing songs', async ({ page, context }) => {
  await stubYouTube(page);
  await page.goto('/music?view=queue');
  const row = page.locator('.music-queue-row').first();
  await expect(row).toBeVisible();
  await page.evaluate(key => {
    localStorage.setItem(key, JSON.stringify([{ id: 'a', name: 'Shared', tracks: [] }]));
    window.dispatchEvent(new Event('arkpediaMusicPlaylistsChanged'));
  }, KEY);
  await openPicker(page, row);
  const dialog = page.getByRole('dialog', { name: 'Add to playlists', exact: true });
  await dialog.getByRole('checkbox', { name: 'Shared', exact: true }).check();
  const other = await context.newPage();
  await stubYouTube(other);
  await other.goto('/music');
  await other.evaluate(key => localStorage.setItem(key, JSON.stringify([{ id: 'a', name: 'Shared', tracks: ['abcdefghijk'] }, { id: 'b', name: 'New in other tab', tracks: [] }])), KEY);
  await expect(dialog.getByRole('checkbox', { name: 'New in other tab', exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Add to playlists', exact: true }).click();
  await expect(dialog.getByRole('status')).toHaveText('Added to 1 playlist.');
  const lists = await page.evaluate(key => JSON.parse(localStorage.getItem(key)!), KEY);
  expect(lists.find((p: { id: string }) => p.id === 'a').tracks).toHaveLength(2);
  expect(lists.find((p: { id: string }) => p.id === 'a').tracks[0]).toBe('abcdefghijk');
  expect(lists.find((p: { id: string }) => p.id === 'b').tracks).toEqual([]);
  await page.keyboard.press('Escape');
  await openPicker(page, row);
  await expect(dialog.getByRole('checkbox', { name: /Shared/ })).toBeDisabled();
  await expect(dialog.getByRole('button', { name: 'Add to playlists', exact: true })).toBeDisabled();
  await other.close();
});


test('playlist picker flips above a low button and stays within the viewport as its content grows', async ({ page }) => {
  await page.setViewportSize({ width: page.viewportSize()!.width, height: 700 });
  await stubYouTube(page);
  await page.goto('/music?view=queue');
  const buttons = page.locator(`${mobile(page) ? '.music-song-mobile-actions' : '.music-song-desktop-actions'} button[aria-haspopup="dialog"]`);
  await expect(buttons.first()).toBeVisible();
  // Pick a visible row near the queue's bottom without scrolling it into a new position.
  const positions = await buttons.evaluateAll(elements => elements.map(el => {
    const r = el.getBoundingClientRect();
    const list = el.closest('.music-queue-list')!.getBoundingClientRect();
    return { top: r.top, bottom: r.bottom, visible: r.top >= list.top && r.bottom <= list.bottom };
  }));
  const index = positions.reduce((last, r, i) => r.visible && r.top > page.viewportSize()!.height / 2 && r.bottom < page.viewportSize()!.height - 160 ? i : last, -1);
  expect(index).toBeGreaterThanOrEqual(0);
  const plus = buttons.nth(index);
  await plus.click();
  if (mobile(page)) await page.getByRole('dialog', { name: 'Song actions', exact: true }).getByRole('button', { name: 'Add to playlists', exact: true }).click();
  const picker = page.getByRole('dialog', { name: 'Add to playlists', exact: true });
  await expect(picker).toBeVisible();
  await picker.getByRole('textbox', { name: 'New playlist name' }).fill('A playlist with a long title that wraps onto more than one line');
  await picker.getByRole('button', { name: 'Create new playlist' }).click();
  await expect(picker.getByRole('status')).toContainText('Created');
  await expect.poll(async () => {
    const anchor = (await plus.boundingBox())!;
    const rect = (await picker.boundingBox())!;
    return rect.y >= 12 && rect.y + rect.height <= page.viewportSize()!.height - 10
      && Math.abs(anchor.y - rect.y - rect.height - 6) <= 3;
  }).toBe(true);
  await page.screenshot({ path: `.cache/song-anchored-${page.viewportSize()!.width}.png` });
  await picker.getByRole('button', { name: 'Close playlist picker' }).click();
  await expect(picker).not.toBeVisible();
  await expect(plus).toBeFocused();
});


test('Favourites exists by default and stays in sync with hearts and playlist imports', async ({ page }) => {
  await stubYouTube(page);
  await page.goto('/music?view=queue');
  const row = page.locator('.music-queue-row').first();
  await row.locator('.music-queue-row-title').click();
  await expect.poll(async () => (await youtube(page))?.state).toBe(1);
  const favorite = row.locator('.music-song-favorite');
  await expect(favorite).toHaveAttribute('aria-pressed', 'false');
  await openPicker(page, row);
  const picker = page.getByRole('dialog', { name: 'Add to playlists', exact: true });
  await expect(picker.getByRole('checkbox', { name: 'Favourites', exact: true })).not.toBeChecked();
  await picker.getByRole('checkbox', { name: 'Favourites', exact: true }).check();
  await picker.getByRole('button', { name: 'Add to playlists', exact: true }).click();
  await expect(favorite).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Escape');
  await page.reload();
  await expect(favorite).toHaveAttribute('aria-pressed', 'true');
  const favoriteId = await page.evaluate(() => JSON.parse(localStorage.getItem('musicFavorites')!)[0]);
  await toggleFavorite(page, row);
  await openPicker(page, row);
  await expect(picker.getByRole('checkbox', { name: 'Favourites', exact: true })).not.toBeChecked();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Playlists', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Music playlists' });
  await expect(dialog.getByRole('combobox', { name: 'Saved playlist' })).toHaveText('Favourites');
  await expect(dialog.getByRole('button', { name: 'Delete playlist' })).toBeDisabled();
  await expect(dialog.locator('li')).toHaveCount(0);
  const exported = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Export playlist', exact: true }).click();
  const fs = await import('node:fs/promises');
  const data = JSON.parse(await fs.readFile((await (await exported).path())!, 'utf8'));
  expect(data.playlists).toEqual([{ id: 'arkpedia-favourites', name: 'Favourites', tracks: [] }]);
  // Importing another browser's favourites adds to the built-in list rather than creating a duplicate.
  data.playlists[0].tracks = [favoriteId];
  await dialog.locator('input[type=file]').setInputFiles({ name: 'favourites.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(data)) });
  await expect(dialog.getByRole('status')).toContainText('Imported 1 playlist');
  await expect(dialog.locator('li')).toHaveCount(1);
  await expect(favorite).toHaveAttribute('aria-pressed', 'true');
  await dialog.locator('input[type=file]').setInputFiles({ name: 'favourites.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(data)) });
  await expect(dialog.getByRole('status')).toContainText('already saved');
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)!).filter((p: { id: string }) => p.id === 'arkpedia-favourites').length, KEY)).toBe(1);
});
