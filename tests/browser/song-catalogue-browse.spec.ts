import { chooseMusicView, openMusicMenu } from './music-navigation-helpers';
import { expect, test, type Page } from '@playwright/test';
import { playAllSongs, stubYouTube, youtube } from './youtube-stub';

const KEY = 'arkpedia.music-playlists.v1';
const queueRows = (page: Page) => page.locator('[data-song-list] .music-queue-row[data-song-id]');
const catalogueRows = (page: Page) => page.locator('.music-all-songs-list .music-song-row');
async function openPicker(page: Page, id: string) {
  // The row itself carries the id; scope directly to it for both phone and desktop controls.
  const target = page.locator(`.music-all-songs-list [data-song-id="${id}"]`);
  if (test.info().project.name === 'mobile') {
    await target.getByRole('button', { name: /^More actions for / }).click();
    const menu = page.getByRole('dialog', { name: 'Song actions', exact: true });
    await expect(menu.getByRole('button', { name: 'Reorder', exact: true })).toHaveCount(0);
    await expect(menu.getByRole('button', { name: 'Remove', exact: true })).toHaveCount(0);
    await menu.getByRole('button', { name: 'Add to playlist', exact: true }).click();
  } else await target.locator('.music-song-desktop-actions button[aria-haspopup="dialog"]').click();
  return page.getByRole('dialog', { name: 'Add to playlists', exact: true });
}

for (const theme of ['dark', 'light']) {
  test(`browse all songs and add to the playing playlist without changing playback (${theme})`, async ({ page }) => {
    if (test.info().project.name === 'mobile' && theme === 'light') await page.setViewportSize({ width: 320, height: 844 });
    await page.addInitScript(value => localStorage.setItem('theme', value), theme);
    const catalogue = await (await page.request.get('/music-catalogue.json')).json();
    const songs = catalogue.songs.filter((song: { copyright?: boolean }) => !song.copyright).slice(0, 4);
    const ids = songs.map((song: { videoId: string }) => song.videoId);
    await stubYouTube(page);
    await page.goto('/music?view=queue');
  await playAllSongs(page);
    await expect(queueRows(page).first()).toBeVisible();
    await page.evaluate(({ key, tracks }) => {
      localStorage.setItem(key, JSON.stringify([{ id: 'night', name: 'Night music', tracks }, { id: 'other', name: 'Other music', tracks: [] }]));
      window.dispatchEvent(new Event('arkpediaMusicPlaylistsChanged'));
    }, { key: KEY, tracks: ids.slice(0, 2) });
    await openMusicMenu(page);
    await page.getByRole('button', { name: 'Playlists', exact: true }).click();
    const lists = page.getByRole('dialog', { name: 'Music playlists', exact: true });
    await lists.getByRole('combobox', { name: 'Saved playlist' }).click();
    await page.getByRole('option', { name: 'Night music', exact: true }).click();
    await lists.getByRole('button', { name: 'Play playlist', exact: true }).click();
    await expect(lists.getByRole('status')).toContainText('Playing Night music');
    await page.keyboard.press('Escape');
    await expect.poll(async () => (await youtube(page))?.state).toBe(1);
    await expect(queueRows(page)).toHaveCount(2);
    const before = (await youtube(page))!;
    const queueBefore = await queueRows(page).evaluateAll(rows => rows.map(row => (row as HTMLElement).dataset.songId));
    await chooseMusicView(page, 'Library');
    await expect(catalogueRows(page).first()).toBeVisible();
    await page.getByRole('searchbox', { name: 'Search all songs', exact: true }).fill(songs[2].title);
    const picker = await openPicker(page, ids[2]);
    await expect(picker.getByRole('checkbox', { name: 'Night music', exact: true })).toBeChecked();
    await expect(picker.getByRole('checkbox', { name: 'Other music', exact: true })).not.toBeChecked();
    await expect(picker.getByRole('checkbox', { name: 'Favourites', exact: true })).not.toBeChecked();
    await picker.getByRole('button', { name: 'Add to playlists', exact: true }).click();
    await expect(picker.getByRole('status')).toHaveText('Added to 1 playlist.');
    await expect(picker.getByRole('checkbox', { name: 'Night music Added ✓', exact: true })).toBeDisabled();
    const stored = await page.evaluate(key => JSON.parse(localStorage.getItem(key)!), KEY);
    expect(stored.find((p: { id: string }) => p.id === 'night').tracks).toEqual(ids.slice(0, 3));
    expect(stored.find((p: { id: string }) => p.id === 'other').tracks).toEqual([]);
    await page.screenshot({ path: `.cache/song-catalogue-${theme}-${test.info().project.name}.png` });
    await page.keyboard.press('Escape');
    await chooseMusicView(page, /^Queue/);
    expect(await queueRows(page).evaluateAll(rows => rows.map(row => (row as HTMLElement).dataset.songId))).toEqual(queueBefore);
    const after = (await youtube(page))!;
    expect(after).toMatchObject({ state: 1, videoId: before.videoId, players: 1, calls: before.calls });
    expect(after.time).toBeGreaterThanOrEqual(before.time);
    expect(await page.locator('body').evaluate(el => el.scrollWidth <= innerWidth)).toBe(true);
    // The playing playlist remains the default after a new document restores the queue.
    await page.reload();
    await expect(queueRows(page)).toHaveCount(2);
    await expect.poll(async () => (await youtube(page))?.state).toBe(1);
    await chooseMusicView(page, 'Library');
    await page.getByRole('searchbox', { name: 'Search all songs', exact: true }).fill(songs[3].title);
    const restored = await openPicker(page, ids[3]);
    await expect(restored.getByRole('checkbox', { name: 'Night music', exact: true })).toBeChecked();
    await page.keyboard.press('Escape');
    // Playing the whole catalogue clears the saved-playlist default.
    await openMusicMenu(page);
    await page.getByRole('button', { name: 'Playlists', exact: true }).click();
    await lists.getByRole('button', { name: 'Play all songs', exact: true }).click();
    await expect(lists.getByRole('status')).toContainText('Playing all songs');
    await page.keyboard.press('Escape');
    const cleared = await openPicker(page, ids[3]);
    await expect(cleared.getByRole('checkbox', { name: 'Night music', exact: true })).not.toBeChecked();
  });
}

test('catalogue failure can retry without replacing the queue or stopping playback', async ({ page }) => {
  await stubYouTube(page);
  await page.goto('/music?view=queue');
  await playAllSongs(page);
  await expect(queueRows(page).nth(1)).toBeVisible();
  await queueRows(page).first().locator('.music-song-row-main').click();
  await expect.poll(async () => (await youtube(page))?.state).toBe(1);
  const before = (await youtube(page))!;
  await page.route('**/music-catalogue.json', route => route.fulfill({ status: 503, body: '' }));
  await chooseMusicView(page, 'Library');
  await expect(page.getByRole('status').filter({ hasText: 'Could not load songs' })).toBeVisible();
  await page.unroute('**/music-catalogue.json');
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(catalogueRows(page).first()).toBeVisible();
  expect((await youtube(page))!).toMatchObject({ state: 1, videoId: before.videoId, players: 1, calls: before.calls });
});

test('switching lists preserves browsing positions and independent searches', async ({ page }) => {
  await stubYouTube(page);
  await page.goto('/music?view=queue');
  await playAllSongs(page);
  await expect(queueRows(page).nth(1)).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await expect.poll(async () => (await youtube(page))?.state).toBe(1);
  const list = page.locator('[data-song-list]').first();
  await list.evaluate(el => { el.scrollTop = 600; });
  const queueAt = await list.evaluate(el => el.scrollTop);
  await chooseMusicView(page, 'Library');
  await expect(catalogueRows(page).first()).toBeVisible();
  const all = page.locator('.music-all-songs-list');
  await all.evaluate(el => { el.scrollTop = 600; });
  const allAt = await all.evaluate(el => el.scrollTop);
  await chooseMusicView(page, /^Queue/);
  expect(await list.evaluate(el => el.scrollTop)).toBeCloseTo(queueAt, 0);
  await page.getByRole('searchbox', { name: 'Search the queue', exact: true }).fill('queue-only-query');
  await chooseMusicView(page, 'Library');
  expect(await all.evaluate(el => el.scrollTop)).toBeCloseTo(allAt, 0);
  await expect(page.getByRole('searchbox', { name: 'Search all songs', exact: true })).toHaveValue('');
  await page.getByRole('searchbox', { name: 'Search all songs', exact: true }).fill('catalogue-only-query');
  await expect(all).toContainText('No songs match your search.');
  await chooseMusicView(page, /^Queue/);
  await expect(page.getByRole('searchbox', { name: 'Search the queue', exact: true })).toHaveValue('queue-only-query');
});
