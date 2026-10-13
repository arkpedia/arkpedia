import { expect, test, type Page } from '@playwright/test';
import { playAllSongs, stubYouTube, youtube } from './youtube-stub';

/*
 * The music section's navigation and queue actions (2026-10-13 redesign): Discover, Library, Now
 * playing and Queue in one nav; the player bar on every one of them, whose song opens Now playing;
 * Back and Forward step through the views; and none of it ever restarts the song (one YouTube
 * player, no new load, the clock running on). Library actions: Play now plays a song and the
 * queue plays on after it; Play next and Add to queue line songs up in "Next in queue" without
 * touching the song playing. Queue: the song playing is marked and fixed, songs come out, and
 * Clear queue keeps only the song playing, with Undo.
 */

const nav = (page: Page) => page.getByRole('navigation', { name: 'Music' });
const bar = (page: Page) => page.getByRole('region', { name: 'Player' });
const queueRows = (page: Page) => page.locator('[data-song-list] .music-queue-row[data-song-id]');
const libraryRows = (page: Page) => page.locator('.music-all-songs-list .music-queue-row[data-song-id]');
const ids = (rows: ReturnType<typeof queueRows>) => rows.evaluateAll(els => els.map(el => (el as HTMLElement).dataset.songId!));
/** Loads of a song asked of YouTube: navigation must add none. */
const loads = async (page: Page) => (await youtube(page))!.calls.filter(([name]) => name === 'loadVideoById' || name === 'cueVideoById').length;

async function stillPlaying(page: Page, videoId: string, loadCount: number, since: number) {
  const now = (await youtube(page))!;
  expect(now).toMatchObject({ players: 1, state: 1, videoId });
  expect(await loads(page)).toBe(loadCount);
  expect(now.time).toBeGreaterThanOrEqual(since);
  return now.time as number;
}

async function libraryAction(page: Page, id: string, action: 'Play now' | 'Play next' | 'Add to queue') {
  const row = page.locator(`.music-all-songs-list [data-song-id="${id}"]`);
  if (test.info().project.name === 'mobile') {
    await row.getByRole('button', { name: /^More actions for / }).click();
    await page.getByRole('dialog', { name: 'Song actions', exact: true }).getByRole('button', { name: action, exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Song actions', exact: true })).toHaveCount(0);
  } else if (action === 'Play now') await row.locator('.music-queue-row-title').click();
  else await row.getByRole('button', { name: action === 'Play next' ? /^Play next: / : /^Add to queue: / }).click();
}

test('Discover to Now playing and back, Back and Forward, and repeated trips never restart the song', async ({ page }) => {
  await stubYouTube(page);
  await page.goto('/music/discover');
  await expect(nav(page).getByRole('link', { name: 'Discover', exact: true })).toHaveAttribute('aria-current', 'page');
  await page.getByRole('searchbox', { name: /Search songs, characters/ }).fill('a');
  // The search writes ?q= after a pause (useQueryState); a navigation in that pause is replaced by it.
  await expect(page).toHaveURL(/[?&]q=a/);
  const first = page.locator('.music-discover-song-row').first();
  const id = (await first.getAttribute('data-song-id'))!;
  await first.locator('.music-discover-song-play').click();
  await expect.poll(async () => (await youtube(page))?.state).toBe(1);
  expect((await youtube(page))!.videoId).toBe(id);
  const count = await loads(page);
  let time = await stillPlaying(page, id, count, 0);

  // The bar shows the song's album art here, as on /music.
  await expect(bar(page).locator('.music-transport-cover img')).toBeVisible();
  // The song playing offers no queue actions: left out, not shown disabled.
  if (test.info().project.name === 'mobile') {
    await first.getByRole('button', { name: /^More actions for / }).click();
    const menu = page.getByRole('dialog', { name: 'Song actions', exact: true });
    await expect(menu.getByRole('button', { name: /^(?:Un)?favourite$/i })).toBeVisible();
    await expect(menu.getByRole('button', { name: 'Add to playlist', exact: true })).toBeVisible();
    for (const name of ['Play now', 'Play next', 'Add to queue']) await expect(menu.getByRole('button', { name, exact: true })).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);
    const other = page.locator('.music-discover-song-row').nth(1);
    await other.getByRole('button', { name: /^More actions for / }).click();
    for (const name of ['Play now', 'Play next', 'Add to queue']) await expect(menu.getByRole('button', { name, exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
  } else {
    await expect(first.getByRole('button', { name: /^(?:Play next|Add to queue): / })).toHaveCount(0);
    await expect(page.locator('.music-discover-song-row').nth(1).getByRole('button', { name: /^Play next: / })).toHaveText('Play next');
    await expect(page.locator('.music-discover-song-row').nth(1).getByRole('button', { name: /^Add to playlist: / })).toHaveText('Add to playlist');
  }
  await expect(page.getByRole('button', { name: '‹ Back to browse', exact: true })).toBeVisible();

  // The player bar names the song and is the way back to it.
  const back = bar(page).getByRole('link', { name: /Open Now playing$/ });
  await expect(back).toBeVisible();
  await expect(back).toHaveAccessibleName(/^Now playing: /);
  await back.click();
  await expect(page).toHaveURL(/\/music\?view=player$/);
  await expect(nav(page).getByRole('link', { name: 'Now playing', exact: true })).toHaveAttribute('aria-current', 'page');
  time = await stillPlaying(page, id, count, time);

  await nav(page).getByRole('link', { name: 'Library', exact: true }).click();
  await expect(page).toHaveURL(/view=library$/);
  await expect(libraryRows(page).first()).toBeVisible();
  await nav(page).getByRole('link', { name: /^Queue/ }).click();
  await expect(page).toHaveURL(/view=queue$/);
  await expect(queueRows(page).first()).toBeVisible();
  time = await stillPlaying(page, id, count, time);

  await page.goBack();
  await expect(page).toHaveURL(/view=library$/);
  await expect(libraryRows(page).first()).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/view=player$/);
  await expect(page.locator('.music-now-playing')).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/\/music\/discover/);
  await expect(page.locator('.music-discover-song-row').first()).toBeVisible();
  await page.goForward();
  await expect(page).toHaveURL(/view=player$/);
  time = await stillPlaying(page, id, count, time);

  for (let i = 0; i < 3; i++) {
    await nav(page).getByRole('link', { name: 'Discover', exact: true }).click();
    await expect(page).toHaveURL(/\/music\/discover$/);
    await expect(bar(page).getByRole('link', { name: /Open Now playing$/ })).toBeVisible();
    await bar(page).getByRole('link', { name: /Open Now playing$/ }).click();
    await expect(page).toHaveURL(/view=player$/);
  }
  await stillPlaying(page, id, count, time);
  // In the music section the floating widget steps aside for the player bar.
  await expect(page.locator('[data-music-widget]')).toHaveCount(0);
});

test('Library: Play now keeps the queue, Play next and Add to queue line songs up without touching the song playing', async ({ page }) => {
  await stubYouTube(page);
  await page.goto('/music?view=library');
  await expect(libraryRows(page).nth(8)).toBeVisible();
  const songs = (await ids(libraryRows(page))).slice(0, 9);
  await libraryAction(page, songs[0], 'Play now');
  await expect.poll(async () => (await youtube(page))?.videoId).toBe(songs[0]);
  await expect.poll(async () => (await youtube(page))?.state).toBe(1);
  const count = await loads(page);

  await libraryAction(page, songs[3], 'Play next');
  await expect(bar(page).getByRole('status')).toContainText('Playing next:');
  await libraryAction(page, songs[5], 'Add to queue');
  await libraryAction(page, songs[6], 'Add to queue');
  await libraryAction(page, songs[2], 'Play next');
  await expect(bar(page).getByRole('status')).toContainText('Playing next:');
  let time = await stillPlaying(page, songs[0], count, 0);
  await expect(nav(page).getByRole('link', { name: /^Queue/ })).toContainText('4');

  await nav(page).getByRole('link', { name: /^Queue/ }).click();
  await expect(page.getByRole('heading', { name: /^Next in queue/ })).toBeVisible();
  expect((await ids(queueRows(page))).slice(0, 5)).toEqual([songs[0], songs[2], songs[3], songs[5], songs[6]]);
  // Browsing the Library added nothing else and took nothing out: each song once.
  const all = await ids(queueRows(page));
  expect(new Set(all).size).toBe(all.length);
  time = await stillPlaying(page, songs[0], count, time);

  // Play now from the Library: it plays at once, and what was lined up plays after it.
  await nav(page).getByRole('link', { name: 'Library', exact: true }).click();
  await libraryAction(page, songs[8], 'Play now');
  await expect.poll(async () => (await youtube(page))?.videoId).toBe(songs[8]);
  await expect.poll(async () => (await youtube(page))?.state).toBe(1);
  expect((await youtube(page))!.players).toBe(1);
  await nav(page).getByRole('link', { name: /^Queue/ }).click();
  expect((await ids(queueRows(page))).slice(0, 5)).toEqual([songs[8], songs[2], songs[3], songs[5], songs[6]]);
  // Next plays the first of them.
  await bar(page).getByRole('button', { name: 'Next track', exact: true }).click();
  await expect.poll(async () => (await youtube(page))?.videoId).toBe(songs[2]);
  await expect(nav(page).getByRole('link', { name: /^Queue/ })).toContainText('3');
});

test('Queue: the song playing is marked and stays put, songs come out, and Clear queue undoes', async ({ page }) => {
  await stubYouTube(page);
  await page.goto('/music?view=queue');
  await playAllSongs(page);
  await expect(queueRows(page).nth(5)).toBeVisible();
  await queueRows(page).first().locator('.music-queue-row-title').click();
  await expect.poll(async () => (await youtube(page))?.state).toBe(1);
  const playing = (await youtube(page))!.videoId as string;
  const current = queueRows(page).first();
  await expect(current).toHaveClass(/\bcurrent\b/);
  await expect(current).toHaveAttribute('data-song-id', playing);
  await expect(current.getByRole('button', { name: /^Reorder / })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Now playing', exact: true })).toBeVisible();

  const before = await ids(queueRows(page));
  const removed = before[2];
  if (test.info().project.name === 'mobile') {
    await queueRows(page).nth(2).getByRole('button', { name: /^More actions for / }).click();
    await page.getByRole('dialog', { name: 'Song actions', exact: true }).getByRole('button', { name: 'Remove', exact: true }).click();
  } else {
    await expect(current.getByRole('button', { name: 'Remove', exact: true })).toBeDisabled();
    await queueRows(page).nth(2).getByRole('button', { name: 'Remove', exact: true }).click();
  }
  await expect.poll(() => ids(queueRows(page))).not.toContain(removed);
  const kept = await ids(queueRows(page));

  await page.getByRole('button', { name: 'Clear queue', exact: true }).click();
  await expect(queueRows(page)).toHaveCount(1);
  await expect(queueRows(page).first()).toHaveAttribute('data-song-id', playing);
  await expect(bar(page).getByRole('status')).toContainText('Cleared');
  await expect(page.getByText('Nothing plays after this song.')).toBeVisible();
  expect((await youtube(page))!).toMatchObject({ state: 1, videoId: playing, players: 1 });

  await page.getByRole('button', { name: 'Undo clear', exact: true }).click();
  await expect.poll(async () => (await ids(queueRows(page))).slice(0, 10)).toEqual(kept.slice(0, 10));
  expect((await youtube(page))!).toMatchObject({ state: 1, videoId: playing, players: 1 });
});

test('a video the catalogue lists twice is one song in the queue and the Library', async ({ page }) => {
  // 切尔诺伯格 (ZCiLqOcjA0Y) is one YouTube upload listed under two credits (OST 3 and Prelude to
  // Dawn). The default queue held it twice, which #407's Check caught only when the shuffle put
  // both copies on screen; searching finds them wherever they are. Whatever the catalogue lists
  // twice is checked; the unit test (test-music-catalogue.ts) holds the rule without the data.
  const catalogue = await (await page.request.get('/music-catalogue.json')).json() as { songs: { videoId: string; title: string }[] };
  const twice = catalogue.songs.filter((song, i) => catalogue.songs.findIndex(other => other.videoId === song.videoId) !== i);
  test.skip(!twice.length, 'the catalogue lists no video twice');
  await stubYouTube(page);
  await page.goto('/music?view=queue');
  await playAllSongs(page);
  await expect(queueRows(page).first()).toBeVisible();
  for (const song of twice) {
    await page.getByRole('searchbox', { name: 'Search the queue', exact: true }).fill(song.title);
    await expect(page.locator(`[data-song-list] .music-queue-row[data-song-id="${song.videoId}"]`)).toHaveCount(1);
  }
  await nav(page).getByRole('link', { name: 'Library', exact: true }).click();
  for (const song of twice) {
    await page.getByRole('searchbox', { name: 'Search all songs', exact: true }).fill(song.title);
    await expect(page.locator(`.music-all-songs-list [data-song-id="${song.videoId}"]`)).toHaveCount(1);
  }
});

test('a link followed right after typing in a search reaches its page', async ({ page }) => {
  // useQueryState writes the search to the address after a pause; a link pressed in that pause
  // used to be cancelled by the write, which put the reader back on Discover (2026-10-13).
  await stubYouTube(page);
  await page.goto('/music/discover');
  // The next page's data arrives late, as on a slow phone: the search's write (250ms) fires while
  // the navigation is still in flight, which is when it cancelled it.
  await page.route(/\/_next\/data\/[^/]+\/music\.json/, async route => { await new Promise(resolve => setTimeout(resolve, 700)); await route.continue(); });
  await page.getByRole('searchbox', { name: /Search songs, characters/ }).fill('a');
  await nav(page).getByRole('link', { name: 'Library', exact: true }).click();
  await expect(page).toHaveURL(/\/music\?view=library$/);
  await expect(libraryRows(page).first()).toBeVisible();
  await page.waitForTimeout(600); // past the write's delay: nothing sends the reader back
  await expect(page).toHaveURL(/\/music\?view=library$/);
});

test('songs queued with Play next and Add to queue stay under Next in queue after a reload', async ({ page }) => {
  await stubYouTube(page);
  await page.goto('/music?view=library');
  await expect(libraryRows(page).nth(6)).toBeVisible();
  const songs = (await ids(libraryRows(page))).slice(0, 7);
  await libraryAction(page, songs[0], 'Play now');
  await expect.poll(async () => (await youtube(page))?.state).toBe(1);
  await libraryAction(page, songs[4], 'Add to queue');
  await libraryAction(page, songs[6], 'Add to queue');
  await page.reload();
  await nav(page).getByRole('link', { name: /^Queue/ }).click();
  await expect(page.getByRole('heading', { name: /^Next in queue/ })).toContainText('2');
  await expect.poll(async () => (await ids(queueRows(page))).slice(0, 3)).toEqual([songs[0], songs[4], songs[6]]);
  await expect(nav(page).getByRole('link', { name: /^Queue/ })).toContainText('2');
});

test("the one-row player bar's More reaches Favourite, Shuffle, Repeat and the queue", async ({ page }) => {
  // A phone's Library and Queue show the mini player; Discover's bar is one row at every width.
  const mobile = test.info().project.name === 'mobile';
  await stubYouTube(page);
  await page.goto(mobile ? '/music?view=library' : '/music/discover');
  if (mobile) {
    await expect(libraryRows(page).first()).toBeVisible();
    await libraryRows(page).first().locator('.music-queue-row-title').click();
  } else {
    await page.getByRole('searchbox', { name: /Search songs, characters/ }).fill('a');
    await expect(page).toHaveURL(/[?&]q=a/);
    await page.locator('.music-discover-song-play').first().click();
  }
  await expect.poll(async () => (await youtube(page))?.state).toBe(1);
  const playing = (await youtube(page))!.videoId as string;
  const more = bar(page).getByRole('button', { name: 'More player actions', exact: true });
  await expect(more).toBeVisible();
  const box = (await more.boundingBox())!;
  if (mobile) expect(Math.min(box.width, box.height)).toBeGreaterThanOrEqual(44);
  // Still one row on a phone: the More sits level with Play.
  const play = (await bar(page).getByRole('button', { name: 'Pause', exact: true }).boundingBox())!;
  expect(Math.abs(box.y - play.y)).toBeLessThan(4);
  await more.click();
  const menu = page.getByRole('dialog', { name: 'Player actions', exact: true });
  const favourite = menu.getByRole('button', { name: /^(?:Un)?favourite$/i });
  await expect(favourite).toHaveAttribute('aria-pressed', 'false');
  await favourite.click();
  await expect(favourite).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('musicFavorites')!))).toContain(playing);
  const shuffle = menu.getByRole('button', { name: 'Shuffle', exact: true });
  const shuffled = await shuffle.getAttribute('aria-pressed');
  await shuffle.click();
  await expect(shuffle).toHaveAttribute('aria-pressed', shuffled === 'true' ? 'false' : 'true');
  await menu.getByRole('button', { name: 'Repeat: Off', exact: true }).click();
  await expect(menu.getByRole('button', { name: 'Repeat: This song', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
  await expect(more).toBeFocused();
  // The transport (Now playing on a phone) shows the same states.
  await more.click();
  await menu.getByRole('link', { name: 'Open queue', exact: true }).click();
  await expect(page).toHaveURL(/\/music\?view=queue$/);
  await expect(queueRows(page).first()).toBeVisible();
  expect((await youtube(page))!).toMatchObject({ state: 1, videoId: playing, players: 1 });
  await nav(page).getByRole('link', { name: 'Now playing', exact: true }).click();
  if (mobile) {
    await more.click();
    await expect(page.getByRole('dialog', { name: 'Player actions', exact: true }).getByRole('button', { name: 'Unfavourite', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('Escape');
  } else await expect(bar(page).getByRole('button', { name: 'Favorite', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(bar(page).getByRole('button', { name: 'Repeat: one', exact: true })).toBeVisible();
});
