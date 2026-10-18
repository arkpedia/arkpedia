import { expect, test, type Page } from '@playwright/test';
import { stubMonsterSiren } from './monster-siren-stub';
import { stubYouTube } from './youtube-stub';

/*
 * The player says "playing" only while sound comes out (lib/music/playbackEngine.ts).
 *
 * On an iPhone (2026-10-14) a Monster Siren song stayed silent at 0:00 while the corner player
 * showed Pause and the lock screen ran its clock to 1:41. Now: a song asked to play shows the
 * loading button, never Pause, and the lock screen is told "paused", until the element's clock
 * moves; a song that makes no sound in the watchdog's time is left paused with a word under the
 * player, never loaded again by the timer (an iPhone loads a file only in a press: the fresh
 * address the timer set sat with no data), and the next Play loads a fresh address in its press;
 * and every bit of that can be read off the phone with ?audio-debug=1.
 *
 * The watchdog's times are shortened here (window.__arkpediaAudioWatchdogMs); the player's are
 * 30 seconds for a file to come, 8 for the clock to move once it says it plays, 20 once it has.
 */

test.beforeEach(({}, info) => {
  test.skip(info.project.name !== 'desktop', 'the engine is the same at every width');
  test.setTimeout(90_000);
});

interface CatalogueRow { videoId?: string; cid?: string; title: string; altTitle?: string }
const STUCK = 'Couldn’t start this song. Tap Play to try again.';
const WATCHDOG_MS = 2000;

const bar = (page: Page) => page.getByRole('region', { name: 'Player', exact: true });
const audio = (page: Page) => page.evaluate(() => {
  const el = document.querySelector<HTMLAudioElement>('audio[data-music-audio]');
  return el ? { src: el.getAttribute('src') ?? '', paused: el.paused, time: el.currentTime, count: document.querySelectorAll('audio[data-music-audio]').length } : null;
});

/** Shortens the watchdog, and records every label the bar's play button shows and every state the
 *  lock screen is told, so a Pause or a "playing" that came and went is caught too. */
async function watchTruth(page: Page) {
  await page.addInitScript((ms) => {
    const w = window as unknown as { __arkpediaAudioWatchdogMs: object; __labels: string[]; __sessionStates: string[] };
    w.__arkpediaAudioWatchdogMs = { load: ms, start: ms, stall: ms };
    w.__labels = [];
    w.__sessionStates = [];
    const descriptor = Object.getOwnPropertyDescriptor(MediaSession.prototype, 'playbackState');
    if (descriptor?.set) {
      Object.defineProperty(MediaSession.prototype, 'playbackState', {
        ...descriptor,
        set(this: MediaSession, value: MediaSessionPlaybackState) { w.__sessionStates.push(value); descriptor.set!.call(this, value); },
      });
    }
    const note = () => document.querySelectorAll('.music-play-btn').forEach((button) => {
      const label = button.getAttribute('aria-label') ?? '';
      if (w.__labels.at(-1) !== label) w.__labels.push(label);
    });
    new MutationObserver(note).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ['aria-label'] });
  }, WATCHDOG_MS);
}
const labels = (page: Page) => page.evaluate(() => (window as unknown as { __labels: string[] }).__labels);
const sessionStates = (page: Page) => page.evaluate(() => (window as unknown as { __sessionStates: string[] }).__sessionStates);

async function playMsrSong(page: Page): Promise<CatalogueRow> {
  await page.goto('/music?view=library');
  const msr = (await (await page.request.get('/music-catalogue.json')).json()).songs.find((row: CatalogueRow) => row.cid && !row.videoId) as CatalogueRow;
  await page.getByRole('searchbox', { name: 'Search all songs' }).fill(msr.altTitle || msr.title);
  await page.locator(`.music-all-songs-list [data-song-id="msr:${msr.cid}"] .music-song-row-main`).click();
  return msr;
}

test('a file that never sends a byte shows loading, never Pause, then waits paused with a word, and Play loads it afresh in the press', async ({ page }) => {
  await watchTruth(page);
  await stubYouTube(page);
  const siren = await stubMonsterSiren(page);
  siren.hangFiles = true;
  const msr = await playMsrSong(page);

  // Asked to play, not heard: the loading button, still pressable; the lock screen is told paused.
  await expect(bar(page).getByRole('button', { name: 'Starting…', exact: true })).toBeEnabled();
  await expect.poll(() => page.evaluate(() => navigator.mediaSession.playbackState)).toBe('paused');
  // No sound in the watchdog's time: paused, with a word under the player.
  await expect(bar(page).getByText(STUCK)).toBeVisible({ timeout: 15_000 });
  await expect(bar(page).getByRole('button', { name: 'Play', exact: true })).toBeEnabled();
  expect((await audio(page))!.paused).toBe(true);
  expect(await page.evaluate(() => navigator.mediaSession.playbackState)).toBe('paused');
  // The timer never loads it again (an iPhone loads a file only in a press): one load, its first.
  await page.waitForTimeout(WATCHDOG_MS + 1000);
  expect(siren.resolves).toEqual([msr.cid]);
  expect((await audio(page))!.src).toBe(`/api/music-audio/${msr.cid}`);
  // Never Pause over silence, never "playing" to the lock screen.
  expect(await labels(page)).not.toContain('Pause');
  expect(await sessionStates(page)).not.toContain('playing');

  // The corner player on another page says the same.
  await page.evaluate(() => (window as unknown as { next: { router: { push: (url: string) => Promise<boolean> } } }).next.router.push('/operators'));
  await page.waitForURL('**/operators');
  await page.getByRole('button', { name: 'Expand player' }).click();
  const widget = page.locator('[data-music-widget]');
  await expect(widget.getByText(STUCK)).toBeVisible();
  await expect(widget.getByRole('button', { name: 'Play', exact: true })).toBeEnabled();

  // The CDN answers again: one press of Play loads a fresh address in the press and plays it,
  // and the word goes.
  siren.hangFiles = false;
  await widget.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(widget.getByText(STUCK)).toHaveCount(0);
  // The same direct route, with a fresh redirect requested inside this press.
  expect((await audio(page))!.src).toMatch(new RegExp(`^/api/music-audio/${msr.cid}\\?retry=`));
  await expect(widget.getByRole('button', { name: 'Pause', exact: true })).toBeVisible({ timeout: 15_000 });
  const heard = (await audio(page))!;
  expect(heard.paused).toBe(false);
  await expect.poll(async () => (await audio(page))!.time).toBeGreaterThan(heard.time);
  await expect.poll(() => page.evaluate(() => navigator.mediaSession.playbackState)).toBe('playing');
  expect(heard.count, 'one <audio> element across the navigation').toBe(1);
});

test('an element that says "playing" while its clock stands still (as on the iPhone) never shows Pause, and ends paused with a word', async ({ page }) => {
  await watchTruth(page);
  // Stand-in for what the iPhone did: play() resolves, "playing" fires, the element is not paused,
  // and currentTime stays where it was. Nothing real plays.
  await page.addInitScript(() => {
    const { play, pause } = HTMLMediaElement.prototype;
    HTMLMediaElement.prototype.play = function (this: HTMLMediaElement) {
      if (!(window as unknown as { __silentPlay?: boolean }).__silentPlay || !this.getAttribute('src')) return play.call(this);
      Object.defineProperty(this, 'paused', { configurable: true, get: () => false });
      setTimeout(() => { this.dispatchEvent(new Event('play')); this.dispatchEvent(new Event('playing')); }, 100);
      return Promise.resolve();
    };
    HTMLMediaElement.prototype.pause = function (this: HTMLMediaElement) {
      delete (this as unknown as { paused?: boolean }).paused;
      return pause.call(this);
    };
  });
  await stubYouTube(page);
  await stubMonsterSiren(page);
  await page.goto('/music?view=library');
  await page.evaluate(() => { (window as unknown as { __silentPlay: boolean }).__silentPlay = true; });
  const msr = (await (await page.request.get('/music-catalogue.json')).json()).songs.find((row: CatalogueRow) => row.cid && !row.videoId) as CatalogueRow;
  await page.getByRole('searchbox', { name: 'Search all songs' }).fill(msr.altTitle || msr.title);
  await page.locator(`.music-all-songs-list [data-song-id="msr:${msr.cid}"] .music-song-row-main`).click();

  await expect(bar(page).getByRole('button', { name: 'Starting…', exact: true })).toBeVisible();
  await expect(bar(page).getByText(STUCK)).toBeVisible({ timeout: 15_000 });
  // The timer loads nothing again; the next Play does, from a fresh address, in its press.
  expect((await audio(page))!.src).toBe(`/api/music-audio/${msr.cid}`);
  await expect(bar(page).getByRole('button', { name: 'Play', exact: true })).toBeEnabled();
  await bar(page).getByRole('button', { name: 'Play', exact: true }).click();
  // The same direct route, with a fresh redirect requested inside this press.
  expect((await audio(page))!.src).toMatch(new RegExp(`^/api/music-audio/${msr.cid}\\?retry=`));
  expect(await labels(page)).not.toContain('Pause');
  expect(await sessionStates(page)).not.toContain('playing');
});

test('a play() the browser rejects later, with no error on the element, never shows Pause and ends paused with a word', async ({ page }) => {
  await watchTruth(page);
  await page.addInitScript(() => {
    const play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function (this: HTMLMediaElement) {
      if (!(window as unknown as { __rejectPlay?: boolean }).__rejectPlay || !this.getAttribute('src')) return play.call(this);
      return new Promise<void>((_, reject) => setTimeout(() => reject(new DOMException('The operation is not supported.', 'NotSupportedError')), 300));
    };
  });
  await stubYouTube(page);
  await stubMonsterSiren(page);
  await page.goto('/music?view=library');
  await page.evaluate(() => { (window as unknown as { __rejectPlay: boolean }).__rejectPlay = true; });
  const msr = (await (await page.request.get('/music-catalogue.json')).json()).songs.find((row: CatalogueRow) => row.cid && !row.videoId) as CatalogueRow;
  await page.getByRole('searchbox', { name: 'Search all songs' }).fill(msr.altTitle || msr.title);
  await page.locator(`.music-all-songs-list [data-song-id="msr:${msr.cid}"] .music-song-row-main`).click();

  // The rejection is taken at once as a start that made no sound: the word, nothing loaded again.
  await expect(bar(page).getByText(STUCK)).toBeVisible({ timeout: 15_000 });
  expect((await audio(page))!.src).toBe(`/api/music-audio/${msr.cid}`);
  await expect(bar(page).getByRole('button', { name: 'Play', exact: true })).toBeEnabled();
  expect((await audio(page))!.paused).toBe(true);
  expect(await labels(page)).not.toContain('Pause');
  expect(await sessionStates(page)).not.toContain('playing');
});

test('a song that plays and then stalls shows loading, and the lock screen is told paused; when sound comes back, Pause and playing again', async ({ page }) => {
  await watchTruth(page);
  await stubYouTube(page);
  await stubMonsterSiren(page);
  await playMsrSong(page);
  await expect(bar(page).getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => navigator.mediaSession.playbackState)).toBe('playing');
  const shown = (await labels(page)).length;
  const told = (await sessionStates(page)).length;

  // The element waits for data (as a stalled network makes it): loading at once, not Pause, and
  // the lock screen's clock stops; its clock moves on, and it is playing again.
  await page.evaluate(() => document.querySelector('audio[data-music-audio]')!.dispatchEvent(new Event('waiting')));
  await expect.poll(async () => (await labels(page)).slice(shown)).toEqual(['Starting…', 'Pause']);
  await expect.poll(async () => (await sessionStates(page)).slice(told)).toEqual(expect.arrayContaining(['paused', 'playing']));
  const after = (await sessionStates(page)).slice(told);
  expect(after.indexOf('paused')).toBeLessThan(after.lastIndexOf('playing'));
  await expect(bar(page).getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
});

test('the loading button stops a song still loading, rather than asking again', async ({ page }) => {
  await watchTruth(page);
  await stubYouTube(page);
  const siren = await stubMonsterSiren(page);
  siren.hangFiles = true;
  await playMsrSong(page);
  await bar(page).getByRole('button', { name: 'Starting…', exact: true }).click();
  await expect(bar(page).getByRole('button', { name: 'Play', exact: true })).toBeVisible();
  expect((await audio(page))!.paused).toBe(true);
  // Stopped is stopped: the watchdog does not go on to a fresh address or the word.
  await page.waitForTimeout(WATCHDOG_MS + 1000);
  expect(siren.resolves).toHaveLength(1);
  await expect(bar(page).getByText(STUCK)).toHaveCount(0);
  expect(await labels(page)).not.toContain('Pause');
});

test('the lock screen\'s position follows the song: told where it is at play, seek and pause, never run ahead of it', async ({ page }) => {
  await page.addInitScript(() => {
    const told: { position: number; at: number }[] = [];
    (window as unknown as { __positions: typeof told }).__positions = told;
    const set = MediaSession.prototype.setPositionState;
    MediaSession.prototype.setPositionState = function (this: MediaSession, state?: MediaPositionState) {
      if (state) told.push({ position: state.position ?? 0, at: performance.now() });
      return set.call(this, state);
    };
  });
  await stubYouTube(page);
  await stubMonsterSiren(page);
  const started = Date.now();
  await playMsrSong(page);
  await expect(bar(page).getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
  await page.evaluate(() => { document.querySelector<HTMLAudioElement>('audio[data-music-audio]')!.currentTime = 12; });
  await expect.poll(() => page.evaluate(() => (window as unknown as { __positions: { position: number }[] }).__positions.some(entry => entry.position >= 11.9))).toBe(true);
  await bar(page).getByRole('button', { name: 'Pause', exact: true }).click();
  await expect(bar(page).getByRole('button', { name: 'Play', exact: true })).toBeVisible();
  const elapsed = (Date.now() - started) / 1000;
  const positions = await page.evaluate(() => (window as unknown as { __positions: { position: number }[] }).__positions.map(entry => entry.position));
  // Never ahead of where the song could be: its seek, plus the wall time this check took.
  for (const position of positions) expect(position).toBeLessThanOrEqual(12 + elapsed);
  const last = positions.at(-1)!;
  const time = (await audio(page))!.time;
  expect(Math.abs(last - time), 'the last position told is where it paused').toBeLessThan(1);
});

test('?audio-debug=1 shows the audio panel, lists the media events, stays across pages, and Hide turns it off', async ({ page }) => {
  await stubYouTube(page);
  await stubMonsterSiren(page);
  await page.goto('/music?view=library');
  await expect(page.locator('[data-audio-debug]')).toHaveCount(0);
  await page.goto('/music?view=library&audio-debug=1');
  const panel = page.getByRole('complementary', { name: 'Audio debug' });
  await expect(panel).toBeVisible();
  const msr = (await (await page.request.get('/music-catalogue.json')).json()).songs.find((row: CatalogueRow) => row.cid && !row.videoId) as CatalogueRow;
  await page.getByRole('searchbox', { name: 'Search all songs' }).fill(msr.altTitle || msr.title);
  await page.locator(`.music-all-songs-list [data-song-id="msr:${msr.cid}"] .music-song-row-main`).click();
  await expect(bar(page).getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
  const events = panel.getByRole('list', { name: /Last media events/ });
  await expect(events).toContainText('playing');
  await expect(events).toContainText('play() resolved');
  await expect(events).toContainText('loadedmetadata');
  await expect(panel).toContainText('isPlaying');
  await expect(panel).toContainText('src host');
  await expect(panel).toContainText(new URL(page.url()).host);
  await expect(panel).toContainText(/lock screen\s*playing/);
  // Its text can be selected for a screenshot.
  expect(await panel.evaluate(el => getComputedStyle(el).userSelect)).not.toBe('none');

  // Remembered on the next page (no parameter there), until Hide.
  await page.evaluate(() => (window as unknown as { next: { router: { push: (url: string) => Promise<boolean> } } }).next.router.push('/operators'));
  await page.waitForURL('**/operators');
  await expect(panel).toBeVisible();
  await panel.getByRole('button', { name: 'Hide' }).click();
  await expect(panel).toHaveCount(0);
  await page.reload();
  await expect(page.locator('[data-audio-debug]')).toHaveCount(0);
});

/*
 * An iPhone starts sound only inside a press. On 2026-10-14 a song said it played and stayed
 * silent at 0:00 there, while the same file opened directly played: the press only played and
 * paused the empty <audio>, and the song's file was set and played seconds later, once YouTube's
 * player API had loaded and the signed address had been fetched. Now the press itself sets the
 * song's file (our redirect address, which needs no request first) and plays it. Chromium tells
 * whether a call runs inside a press (navigator.userActivation.isActive), so this checks that the
 * first play() the <audio> gets is that song's file, in the press, with YouTube's API held back.
 */
test('the press plays the song\'s own file inside the press, before YouTube\'s player API has loaded', async ({ page }) => {
  await page.addInitScript(() => {
    const plays: { src: string; inPress: boolean }[] = [];
    (window as unknown as { __plays: typeof plays }).__plays = plays;
    const { play } = HTMLMediaElement.prototype;
    HTMLMediaElement.prototype.play = function (this: HTMLMediaElement) {
      if (this.matches('audio[data-music-audio]')) plays.push({ src: this.getAttribute('src') ?? '', inPress: navigator.userActivation.isActive });
      return play.call(this);
    };
  });
  await stubYouTube(page);
  // YouTube's API held back for a few seconds, as on a phone: the player is not ready at the press.
  await page.route(/^https:\/\/www\.youtube\.com\/iframe_api/, async (route) => { await new Promise((done) => setTimeout(done, 4000)); await route.fallback(); });
  const siren = await stubMonsterSiren(page);
  await page.goto('/music?view=library');
  const msr = (await (await page.request.get('/music-catalogue.json')).json()).songs.find((row: CatalogueRow) => row.cid && !row.videoId) as CatalogueRow;
  await page.getByRole('searchbox', { name: 'Search all songs' }).fill(msr.altTitle || msr.title);
  await page.locator(`.music-all-songs-list [data-song-id="msr:${msr.cid}"] .music-song-row-main`).click();

  const plays = () => page.evaluate(() => (window as unknown as { __plays: { src: string; inPress: boolean }[] }).__plays);
  await expect.poll(plays).not.toEqual([]);
  expect((await plays())[0], 'the first play() is the song\'s file, in the press').toEqual({ src: `/api/music-audio/${msr.cid}`, inPress: true });
  expect((await plays()).some(({ src }) => !src), 'no play() of the empty element').toBe(false);
  // It sounds, and the engine, once up, takes the same file over rather than loading it again.
  await expect.poll(async () => (await audio(page))!.time, { timeout: 20_000 }).toBeGreaterThan(1);
  await expect(bar(page).getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
  await expect.poll(() => siren.resolves).toEqual([msr.cid]);
});

/*
 * The iPhone's log (2026-10-14): the first file came about seven seconds after the press, the
 * element said it played, and 1.2 seconds later the watchdog -- counting from the press -- called
 * it silent and loaded it again; that load, set by a timer, never got a byte. Loading is not
 * silence: a file slower than the old limit plays, from its one load.
 */
test('a file that comes later than the clock\'s limit is waited for, and plays from its one load', async ({ page }) => {
  await watchTruth(page);
  // The clock's limits short, the file's long: it comes after `start` has passed since the press.
  await page.addInitScript(() => { (window as unknown as { __arkpediaAudioWatchdogMs: object }).__arkpediaAudioWatchdogMs = { load: 20_000, start: 1500, stall: 1500 }; });
  await stubYouTube(page);
  const siren = await stubMonsterSiren(page);
  siren.delayFilesMs = 3000;
  const msr = await playMsrSong(page);
  await expect.poll(async () => (await audio(page))!.time, { timeout: 20_000 }).toBeGreaterThan(1);
  await expect(bar(page).getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
  await expect(bar(page).getByText(STUCK)).toHaveCount(0);
  expect(siren.resolves).toEqual([msr.cid]);
  expect((await audio(page))!.src).toBe(`/api/music-audio/${msr.cid}`);
});

test('a failed CDN start retries directly on Play and never changes delivery for later songs', async ({ page }) => {
  await watchTruth(page);
  await stubYouTube(page);
  const siren = await stubMonsterSiren(page);
  siren.hangFiles = true;
  const msr = await playMsrSong(page);
  await expect(bar(page).getByText(STUCK)).toBeVisible({ timeout: 15_000 });
  expect(await page.evaluate(() => localStorage.getItem('arkpediaAudioRelay'))).toBeNull();
  expect(siren.relays).toEqual([]);

  // The CDN recovers. One press asks for a fresh direct address and plays it.
  siren.hangFiles = false;
  await bar(page).getByRole('button', { name: 'Play', exact: true }).click();
  expect((await audio(page))!.src).toMatch(new RegExp(`^/api/music-audio/${msr.cid}\\?retry=`));
  await expect.poll(async () => (await audio(page))!.time, { timeout: 15_000 }).toBeGreaterThan(0.5);
  await expect(bar(page).getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
  expect(siren.relays).toEqual([]);

  // A reload and another song still use the direct CDN route.
  await page.reload();
  const other = (await (await page.request.get('/music-catalogue.json')).json()).songs.find((row: CatalogueRow) => row.cid && row.cid !== msr.cid && !row.videoId) as CatalogueRow | undefined;
  test.skip(!other, 'the bundled catalogue has one Monster Siren-only song');
  await page.getByRole('searchbox', { name: 'Search all songs' }).fill(other!.altTitle || other!.title);
  await page.locator(`.music-all-songs-list [data-song-id="msr:${other!.cid}"] .music-song-row-main`).click();
  await expect.poll(async () => (await audio(page))?.src ?? '').toBe(`/api/music-audio/${other!.cid}`);
  await expect.poll(async () => (await audio(page))!.time, { timeout: 15_000 }).toBeGreaterThan(0.5);
  expect(siren.resolves).toContain(other!.cid);
  expect(siren.relays).toEqual([]);
});

test('an old relay preference and old opt-in link cannot route playback through the retired service', async ({ page }) => {
  await stubYouTube(page);
  const siren = await stubMonsterSiren(page);
  await page.addInitScript(() => localStorage.setItem('arkpediaAudioRelay', String(Date.now() + 86_400_000)));
  await page.goto('/music?view=library&audio-relay=1');
  const msr = (await (await page.request.get('/music-catalogue.json')).json()).songs.find((row: CatalogueRow) => row.cid && !row.videoId) as CatalogueRow;
  await page.getByRole('searchbox', { name: 'Search all songs' }).fill(msr.altTitle || msr.title);
  await page.locator(`.music-all-songs-list [data-song-id="msr:${msr.cid}"] .music-song-row-main`).click();
  await expect.poll(async () => (await audio(page))?.src ?? '').toBe(`/api/music-audio/${msr.cid}`);
  await expect.poll(async () => (await audio(page))!.time).toBeGreaterThan(0.1);
  expect(await page.evaluate(() => localStorage.getItem('arkpediaAudioRelay'))).toBeNull();
  expect(siren.relays).toEqual([]);
  expect(await page.locator('audio[data-music-audio]').evaluate(el => (el as HTMLAudioElement).crossOrigin)).toBe('anonymous');
});
