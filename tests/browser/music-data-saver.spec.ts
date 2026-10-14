import { expect, test, type Page } from '@playwright/test';
import { stubMonsterSiren, WAV_SECONDS } from './monster-siren-stub';
import { DATA_SAVER_KEY, stubYouTube, youtube, type StubCall } from './youtube-stub';

/*
 * Every song with a Monster Siren id plays from Monster Siren's own file through the player's one
 * <audio> element (lib/music/playbackEngine.ts), so it keeps playing while the page is hidden --
 * another app, another tab, a locked phone -- where a phone pauses YouTube. Data saver (the
 * player's ⋯ menu) plays songs from YouTube instead; a song with no YouTube upload plays from
 * Monster Siren either way, and one with no Monster Siren id from YouTube. The engine is chosen at
 * each play: the track id the queue, favourites, playlists and resume keep is the same.
 *
 * Monster Siren and YouTube are stubs (monster-siren-stub.ts, youtube-stub.ts). Data saver is left
 * at its default here (stubYouTube's dataSaver: false), which the other music checks turn on.
 */

test.beforeEach(({}, info) => {
  test.setTimeout(90_000);
  // The ⋯ menu and its ⓘ are checked at both widths; the engines are the same at every width.
  if (!/the ⋯ menu/.test(info.title)) test.skip(info.project.name !== 'desktop', 'the engines are the same at every width');
});

interface CatalogueRow { videoId?: string; cid?: string; title: string; altTitle?: string }
async function catalogue(page: Page): Promise<CatalogueRow[]> {
  return (await (await page.request.get('/music-catalogue.json')).json()).songs;
}
/** Songs on YouTube with a Monster Siren id, which play from Monster Siren by default. */
async function bothSongs(page: Page): Promise<(CatalogueRow & { videoId: string; cid: string })[]> {
  return (await catalogue(page)).filter((row): row is CatalogueRow & { videoId: string; cid: string } => Boolean(row.videoId && row.cid));
}

const audio = (page: Page) => page.evaluate(() => {
  const el = document.querySelector<HTMLAudioElement>('audio[data-music-audio]');
  return el ? { src: el.getAttribute('src') ?? '', paused: el.paused, time: el.currentTime, count: document.querySelectorAll('audio[data-music-audio]').length } : null;
});
const bar = (page: Page) => page.getByRole('region', { name: 'Player', exact: true });
const libraryRow = (page: Page, id: string) => page.locator(`.music-all-songs-list [data-song-id="${id}"]`);
const youtubeLoads = (calls: StubCall[]) => calls.filter(([name]) => name === 'loadVideoById' || name === 'cueVideoById')
  .map(([, arg]) => (typeof arg === 'object' ? arg : null));

async function playFromLibrary(page: Page, song: CatalogueRow, id: string) {
  await page.getByRole('searchbox', { name: 'Search all songs' }).fill(song.altTitle || song.title);
  await libraryRow(page, id).locator('.music-song-row-main').click();
}

async function openMenu(page: Page) {
  await bar(page).getByRole('button', { name: 'More player actions', exact: true }).click();
  return page.getByRole('dialog', { name: 'Player actions', exact: true });
}

/** The page as a phone's is when the reader switches apps or locks the screen. */
async function hide(page: Page) {
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
}
async function show(page: Page) {
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
    document.dispatchEvent(new Event('visibilitychange'));
  });
}

test('a song on YouTube that has a Monster Siren id plays from Monster Siren by default, and YouTube never loads it', async ({ page }) => {
  await stubYouTube(page, 'allow', { dataSaver: false });
  const siren = await stubMonsterSiren(page);
  await page.goto('/music?view=library');
  const [song] = await bothSongs(page);
  expect(song, 'the bundled catalogue gives songs on YouTube their Monster Siren id').toBeTruthy();

  await playFromLibrary(page, song, song.videoId);
  await expect.poll(async () => (await audio(page))?.paused).toBe(false);
  expect(siren.resolves).toEqual([song.cid]);
  expect((await audio(page))!.src).toContain(`/__siren/${song.cid}.wav`);
  await expect(bar(page).getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
  // Its row is the one playing: the song is still named by its video id.
  await expect(libraryRow(page, song.videoId)).toHaveClass(/\bactive\b/);
  expect(youtubeLoads((await youtube(page))?.calls ?? []).some(arg => arg?.videoId === song.videoId), 'YouTube never loads it').toBe(false);
  expect((await youtube(page))?.state ?? -1).not.toBe(1);
  // The lock screen's view of it, from the page (YouTube is not playing to give one).
  await expect.poll(() => page.evaluate(() => navigator.mediaSession?.metadata?.title ?? '')).not.toBe('');
  // "playing" once its clock moves, not at play() (lib/music/playbackEngine.ts).
  await expect.poll(() => page.evaluate(() => navigator.mediaSession?.playbackState)).toBe('playing');
  // It still links to its YouTube page (Now playing), as every song on YouTube does.
  await page.getByRole('navigation', { name: 'Music' }).getByRole('link', { name: /^Now playing/ }).click();
  await expect(page.getByRole('link', { name: /Watch on YouTube/ })).toBeVisible();
});

test('a song with no Monster Siren id plays from YouTube, whatever the setting', async ({ page }) => {
  await stubYouTube(page, 'allow', { dataSaver: false });
  const siren = await stubMonsterSiren(page);
  await page.goto('/music?view=library');
  const [song] = await bothSongs(page);
  // A song the albums have no Monster Siren id for yet (a new upload): its row has no cid.
  await page.route('**/music-catalogue.json', async (route) => {
    const response = await route.fetch();
    const body = await response.json() as { songs: CatalogueRow[] };
    body.songs = body.songs.map(row => (row.videoId === song.videoId ? { ...row, cid: undefined } : row));
    await route.fulfill({ response, json: body });
  });
  await page.reload();
  await playFromLibrary(page, song, song.videoId);
  await expect.poll(async () => (await youtube(page))?.state).toBe(1);
  expect((await youtube(page))!.videoId).toBe(song.videoId);
  expect(siren.resolves).toEqual([]);
  expect(await audio(page)).toMatchObject({ src: '', paused: true });
});

test('Data saver mid-song moves the song to YouTube at the same moment, and back to Monster Siren when unchecked', async ({ page }) => {
  await stubYouTube(page, 'allow', { dataSaver: false });
  const siren = await stubMonsterSiren(page);
  await page.goto('/music?view=library');
  const [song] = await bothSongs(page);
  await playFromLibrary(page, song, song.videoId);
  await expect.poll(async () => (await audio(page))!.time).toBeGreaterThan(3);

  const menu = await openMenu(page);
  const saver = menu.getByRole('checkbox', { name: 'Data saver', exact: true });
  await expect(saver).not.toBeChecked();
  const before = (await audio(page))!.time;
  const checkedAt = Date.now();
  await saver.check();
  // YouTube takes the same track, from where the audio was, and plays; the audio lets its file go.
  await expect.poll(async () => (await youtube(page))?.state).toBe(1);
  const load = youtubeLoads((await youtube(page))!.calls).at(-1)!;
  expect(load.videoId).toBe(song.videoId);
  // The song plays on while the box is checked: it may be further on by the time that took.
  expect(load.startSeconds).toBeGreaterThan(before - 2);
  expect(load.startSeconds).toBeLessThan(before + 2 + (Date.now() - checkedAt) / 1000);
  await expect.poll(async () => (await audio(page))).toMatchObject({ src: '', paused: true });
  await expect(bar(page).getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
  expect(await page.evaluate((key) => localStorage.getItem(key), DATA_SAVER_KEY)).toBe('true');
  // The menu stays open, so the new state can be read.
  await expect(saver).toBeChecked();

  // Back: Monster Siren again, from where YouTube was; YouTube paused, never two at once.
  await expect.poll(async () => (await youtube(page))!.time).toBeGreaterThan(load.startSeconds + 1);
  const youtubeAt = (await youtube(page))!.time;
  const uncheckedAt = Date.now();
  await saver.uncheck();
  await expect.poll(async () => (await audio(page))?.paused).toBe(false);
  await expect.poll(async () => (await youtube(page))!.state).toBe(2);
  expect(siren.resolves).toEqual([song.cid, song.cid]);
  // Read after the waits above, while the audio plays on: no further on than the time they
  // took (the NAS runner is slower; 2026-10-14 it read 5.8s on), and not from the start.
  const audioAt = (await audio(page))!.time;
  expect(audioAt).toBeGreaterThan(youtubeAt - 2.5);
  expect(audioAt).toBeLessThan(youtubeAt + 2.5 + (Date.now() - uncheckedAt) / 1000);
  await expect(bar(page).getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
  await expect(libraryRow(page, song.videoId)).toHaveClass(/\bactive\b/);

  // Paused, it moves paused: nothing starts.
  await page.keyboard.press('Escape');
  await bar(page).getByRole('button', { name: 'Pause', exact: true }).click();
  await expect.poll(async () => (await audio(page))!.paused).toBe(true);
  const pausedAt = (await audio(page))!.time;
  const menu2 = await openMenu(page);
  await menu2.getByRole('checkbox', { name: 'Data saver', exact: true }).check();
  await expect.poll(async () => youtubeLoads((await youtube(page))!.calls).length).toBe(2);
  const calls = (await youtube(page))!.calls;
  expect(calls.at(-1)![0]).toBe('cueVideoById');
  expect(Math.abs((calls.at(-1)![1] as { startSeconds: number }).startSeconds - pausedAt)).toBeLessThan(1);
  await page.waitForTimeout(500);
  expect((await youtube(page))!.state).not.toBe(1);
  await expect(bar(page).getByRole('button', { name: 'Play', exact: true })).toBeVisible();
});

test('Data saver is kept across a reload, and a song with no YouTube upload still plays from Monster Siren under it', async ({ page }) => {
  await stubYouTube(page, 'allow', { dataSaver: false });
  const siren = await stubMonsterSiren(page);
  await page.goto('/music?view=library');
  const msrOnly = (await catalogue(page)).find(row => row.cid && !row.videoId)!;
  await playFromLibrary(page, msrOnly, `msr:${msrOnly.cid}`);
  await expect.poll(async () => (await audio(page))?.paused).toBe(false);
  const menu = await openMenu(page);
  await menu.getByRole('checkbox', { name: 'Data saver', exact: true }).check();
  // No YouTube version: nothing to move to, it plays on.
  await page.waitForTimeout(500);
  expect((await audio(page))!.paused).toBe(false);
  expect(youtubeLoads((await youtube(page))?.calls ?? [])).toEqual([]);
  expect(siren.resolves).toEqual([msrOnly.cid]);

  await page.reload();
  await expect.poll(() => page.evaluate((key) => localStorage.getItem(key), DATA_SAVER_KEY)).toBe('true');
  const reopened = await openMenu(page);
  await expect(reopened.getByRole('checkbox', { name: 'Data saver', exact: true })).toBeChecked();
});

test('a song played from Monster Siren carries across a reload under its own track id', async ({ page }) => {
  await stubYouTube(page, 'allow', { dataSaver: false });
  await stubMonsterSiren(page);
  await page.goto('/music?view=library');
  const [song] = await bothSongs(page);
  await playFromLibrary(page, song, song.videoId);
  await expect.poll(async () => (await audio(page))!.time).toBeGreaterThan(2);
  const before = (await audio(page))!.time;
  await page.reload();
  const record = await page.evaluate(() => JSON.parse(sessionStorage.getItem('arkpediaMusicResume') ?? 'null'));
  // Saved as it always was: the video id, not a Monster Siren one.
  expect(record.videoId).toBe(song.videoId);
  expect(record.queue).toContain(song.videoId);
  await expect.poll(async () => (await audio(page))?.src ?? '', { timeout: 30_000 }).toContain(`/__siren/${song.cid}.wav`);
  const playButton = bar(page).getByRole('button', { name: 'Play', exact: true });
  await expect.poll(async () => !(await audio(page))!.paused || await playButton.isVisible(), { timeout: 20_000 }).toBe(true);
  if ((await audio(page))!.paused) await playButton.click();
  await expect.poll(async () => (await audio(page))!.paused).toBe(false);
  expect((await audio(page))!.time).toBeGreaterThanOrEqual(before - 0.5);
  expect(youtubeLoads((await youtube(page))?.calls ?? []).some(arg => arg?.videoId === song.videoId)).toBe(false);
});

test('hidden, the audio plays on, and the next song starts on the same <audio> element when this one ends', async ({ page }) => {
  await stubYouTube(page, 'allow', { dataSaver: false });
  const siren = await stubMonsterSiren(page);
  await page.goto('/music?view=library');
  const [first, second] = await bothSongs(page);
  await playFromLibrary(page, first, first.videoId);
  await expect.poll(async () => (await audio(page))!.time).toBeGreaterThan(1);
  await page.getByRole('searchbox', { name: 'Search all songs' }).fill(second.altTitle || second.title);
  await libraryRow(page, second.videoId).getByRole('button', { name: /^Play next: / }).click();
  await page.evaluate(() => { (document.querySelector('audio[data-music-audio]') as HTMLAudioElement & { __same?: boolean }).__same = true; });

  await hide(page);
  // Nothing pauses it: the clock runs on, and the record a reload would use is still written.
  const hiddenAt = (await audio(page))!.time;
  await expect.poll(async () => (await audio(page))!.time).toBeGreaterThan(hiddenAt + 1);
  expect((await audio(page))!.paused).toBe(false);
  expect(await page.evaluate(() => sessionStorage.getItem('arkpediaMusicResume'))).toContain(first.videoId);
  // The next song's address is asked for ahead, so it can start in the end's own task.
  await expect.poll(() => siren.resolves).toEqual([first.cid, second.cid]);

  await page.evaluate((seconds) => { document.querySelector<HTMLAudioElement>('audio[data-music-audio]')!.currentTime = seconds - 0.4; }, WAV_SECONDS);
  await expect.poll(async () => (await audio(page))!.src, { timeout: 15_000 }).toContain(`/__siren/${second.cid}.wav`);
  await expect.poll(async () => (await audio(page))!.paused).toBe(false);
  await expect.poll(async () => (await audio(page))!.time).toBeGreaterThan(0.5);
  const same = await page.evaluate(() => (document.querySelector('audio[data-music-audio]') as HTMLAudioElement & { __same?: boolean }).__same === true);
  expect(same, 'the same element plays the next song').toBe(true);
  expect((await audio(page))!.count).toBe(1);
  // No second request for it as it started, and YouTube was never asked.
  expect(siren.resolves).toEqual([first.cid, second.cid]);
  expect(youtubeLoads((await youtube(page))?.calls ?? [])).toEqual([]);
  await expect.poll(() => page.evaluate(() => navigator.mediaSession?.playbackState)).toBe('playing');

  await show(page);
  await expect(libraryRow(page, second.videoId)).toHaveClass(/\bactive\b/);
  await expect(bar(page).getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
});

test('hidden, a next song YouTube would not start waits, shown and paused, once the page is back', async ({ page }) => {
  // A phone pauses YouTube while the page is hidden. Stand-in: YouTube starts only within a few
  // seconds of a press, and says nothing when it does not (refuse-silently).
  await stubYouTube(page, 'refuse-silently');
  await stubMonsterSiren(page);
  await page.goto('/music?view=library');
  const [first, second] = await bothSongs(page);
  await playFromLibrary(page, first, first.videoId);
  await expect.poll(async () => (await youtube(page))?.state).toBe(1);
  await page.getByRole('searchbox', { name: 'Search all songs' }).fill(second.altTitle || second.title);
  await libraryRow(page, second.videoId).getByRole('button', { name: /^Play next: / }).click();
  await page.waitForTimeout(5500);
  await hide(page);
  await page.evaluate(() => (window as unknown as { __yt: { finish: () => void } }).__yt.finish());
  await expect.poll(async () => (await youtube(page))!.videoId).toBe(second.videoId);
  expect((await youtube(page))!.state).not.toBe(1);
  await show(page);
  // Not the last song left on show: the one loaded, paused, one press of Play away.
  await expect(libraryRow(page, second.videoId)).toHaveClass(/\bactive\b/, { timeout: 15_000 });
  await expect(bar(page).getByRole('button', { name: 'Play', exact: true })).toBeEnabled({ timeout: 15_000 });
  await bar(page).getByRole('button', { name: 'Play', exact: true }).click();
  await expect.poll(async () => (await youtube(page))!.state).toBe(1);
  expect((await youtube(page))!.videoId).toBe(second.videoId);
});

test('the ⋯ menu holds Data saver, and its ⓘ explains it in a note that Escape, a press outside and × close', async ({ page }) => {
  await stubYouTube(page, 'allow', { dataSaver: false });
  await page.goto('/music');
  const more = bar(page).getByRole('button', { name: 'More player actions', exact: true });
  await expect(more).toBeVisible();
  const menu = await openMenu(page);
  const saver = menu.getByRole('checkbox', { name: 'Data saver', exact: true });
  await expect(saver).toBeVisible();
  await expect(saver).not.toBeChecked();
  const info = menu.getByRole('button', { name: 'About data saver', exact: true });
  await expect(info).toHaveAttribute('aria-expanded', 'false');
  const infoBox = (await info.boundingBox())!;
  expect(Math.min(infoBox.width, infoBox.height), 'the ⓘ is a 24px target at least').toBeGreaterThanOrEqual(24);

  await info.click();
  const note = page.getByRole('dialog', { name: 'About data saver', exact: true });
  await expect(note).toBeVisible();
  await expect(info).toHaveAttribute('aria-expanded', 'true');
  await expect(note).toContainText('official Arknights music player, which allows background play');
  await expect(note).toContainText('background play becomes unavailable');
  await expect(note).toContainText('Data saver plays songs from YouTube instead');
  await expect(note.getByRole('button', { name: 'Close about data saver', exact: true })).toBeFocused();
  // Its text sits inside the menu, all of it in view.
  const menuBox = (await menu.boundingBox())!;
  const noteBox = (await note.boundingBox())!;
  expect(noteBox.x).toBeGreaterThanOrEqual(menuBox.x - 1);
  expect(noteBox.x + noteBox.width).toBeLessThanOrEqual(menuBox.x + menuBox.width + 1);

  // Escape closes the note only, and gives focus back to the ⓘ.
  await page.keyboard.press('Escape');
  await expect(note).toHaveCount(0);
  await expect(menu).toBeVisible();
  await expect(info).toBeFocused();
  await expect(info).toHaveAttribute('aria-expanded', 'false');

  // ×.
  await info.click();
  await note.getByRole('button', { name: 'Close about data saver', exact: true }).click();
  await expect(note).toHaveCount(0);
  await expect(info).toBeFocused();

  // A press elsewhere (the menu's heading): the note closes, the menu stays.
  await info.click();
  await expect(note).toBeVisible();
  await menu.locator('.music-song-playlist-heading > b').click();
  await expect(note).toHaveCount(0);
  await expect(menu).toBeVisible();
  await expect(saver).not.toBeChecked();
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
});
