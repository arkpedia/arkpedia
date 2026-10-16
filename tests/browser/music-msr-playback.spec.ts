import { expect, test, type Page } from '@playwright/test';
import { stubMonsterSiren } from './monster-siren-stub';
import { stubYouTube, youtube } from './youtube-stub';

/*
 * These checks run with Data saver on (stubYouTube's default), so a song on YouTube plays from
 * YouTube; music-data-saver.spec.ts checks the default, where it plays from Monster Siren too.
 *
 * A song nobody has found a YouTube upload for plays Monster Siren's own audio (lib/music/
 * trackId.ts, lib/music/playbackEngine.ts): an <audio> element, its file's signed address asked
 * of /api/music-guesser/<cid> only when it is to play. It is listed like any song, has no YouTube
 * link, sits in the queue and carries across a reload like any song, and a song on YouTube plays
 * exactly as before. Monster Siren is never reached: its address answer points at a few seconds
 * of silence (monster-siren-stub.ts), and YouTube is the stub.
 */

test.beforeEach(({}, info) => {
  test.skip(info.project.name !== 'desktop', 'the engines are the same at every width; the song rows are checked at both in music-song-rows');
  test.setTimeout(90_000);
});

interface CatalogueRow { videoId?: string; cid?: string; title: string; altTitle?: string }
async function catalogue(page: Page): Promise<CatalogueRow[]> {
  return (await (await page.request.get('/music-catalogue.json')).json()).songs;
}

const audio = (page: Page) => page.evaluate(() => {
  const el = document.querySelector<HTMLAudioElement>('audio[data-music-audio]');
  return el ? { src: el.getAttribute('src') ?? '', paused: el.paused, time: el.currentTime } : null;
});
const bar = (page: Page) => page.getByRole('region', { name: 'Player', exact: true });
const libraryRow = (page: Page, id: string) => page.locator(`.music-all-songs-list [data-song-id="${id}"]`);

test('a song with no YouTube upload is listed, plays from Monster Siren through <audio>, and has no YouTube link', async ({ page }) => {
  await stubYouTube(page);
  const siren = await stubMonsterSiren(page);
  await page.goto('/music?view=library');
  const msr = (await catalogue(page)).find(row => row.cid && !row.videoId)!;
  expect(msr, 'the bundled catalogue lists a song with no YouTube upload').toBeTruthy();
  const id = `msr:${msr.cid}`;

  await page.getByRole('searchbox', { name: 'Search all songs' }).fill(msr.altTitle || msr.title);
  const row = libraryRow(page, id);
  await expect(row).toBeVisible();
  // An ordinary row: it plays, queues and is favourited like any other, and links nowhere.
  await expect(row.locator('a')).toHaveCount(0);
  await expect(row.getByRole('button', { name: /^Add to queue: / })).toBeVisible();
  await expect.poll(() => siren.resolves, { message: 'listing a song asks Monster Siren for nothing' }).toEqual([]);

  await row.locator('.music-song-row-main').click();
  await expect.poll(async () => (await audio(page))?.paused).toBe(false);
  await expect.poll(() => siren.resolves).toEqual([msr.cid]);
  const started = (await audio(page))!;
  expect(started.src).toContain(`/api/music-audio/${msr.cid}`);
  await expect.poll(async () => (await audio(page))!.time, { message: 'the audio clock runs' }).toBeGreaterThan(started.time + 0.5);
  await expect(bar(page).getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
  // YouTube is asked for nothing: it never loads a Monster Siren id.
  expect(((await youtube(page))?.calls ?? []).some(([, arg]) => typeof arg === 'object' && String(arg?.videoId).startsWith('msr:'))).toBe(false);
  await expect(row).toHaveClass(/\bactive\b/);

  // Now playing names it, and offers no YouTube link for it.
  await page.getByRole('navigation', { name: 'Music' }).getByRole('link', { name: /^Now playing/ }).click();
  await expect(page.locator('.music-now-playing-song-info h2')).not.toHaveText('Loading…');
  await expect(page.getByRole('link', { name: /Watch on YouTube/ })).toHaveCount(0);
  // The lock screen's view of it (YouTube's iframe would say this itself for a YouTube song).
  expect(await page.evaluate(() => navigator.mediaSession?.metadata?.title)).toBeTruthy();

  await bar(page).getByRole('button', { name: 'Pause', exact: true }).click();
  await expect.poll(async () => (await audio(page))!.paused).toBe(true);
  await expect(bar(page).getByRole('button', { name: 'Play', exact: true })).toBeVisible();
  await bar(page).getByRole('button', { name: 'Play', exact: true }).click();
  await expect.poll(async () => (await audio(page))!.paused).toBe(false);
  await expect.poll(() => siren.resolves, { message: 'a pause and Play keep the address' }).toEqual([msr.cid]);
});

test('a song on YouTube plays as before, then hands over to a queued Monster Siren song, which carries across a reload', async ({ page }) => {
  await stubYouTube(page);
  const siren = await stubMonsterSiren(page);
  await page.goto('/music?view=library');
  const rows = await catalogue(page);
  const msr = rows.find(row => row.cid && !row.videoId)!;
  const yt = rows.find(row => row.videoId)!;
  const id = `msr:${msr.cid}`;

  await page.getByRole('searchbox', { name: 'Search all songs' }).fill(yt.altTitle || yt.title);
  await libraryRow(page, yt.videoId!).locator('.music-song-row-main').click();
  await expect.poll(async () => (await youtube(page))?.state).toBe(1);
  expect((await youtube(page))!.videoId).toBe(yt.videoId);
  expect(await audio(page)).toMatchObject({ src: '', paused: true });

  await page.getByRole('searchbox', { name: 'Search all songs' }).fill(msr.altTitle || msr.title);
  await libraryRow(page, id).getByRole('button', { name: /^Play next: / }).click();
  await expect.poll(() => siren.resolves, { message: 'queueing asks Monster Siren for nothing' }).toEqual([]);
  // The YouTube song ends: the Monster Siren song is next, and YouTube stops.
  await page.evaluate(() => (window as unknown as { __yt: { finish: () => void } }).__yt.finish());
  await expect.poll(async () => (await audio(page))?.paused).toBe(false);
  await expect.poll(() => siren.resolves).toEqual([msr.cid]);
  await expect(bar(page).getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
  await expect(libraryRow(page, id)).toHaveClass(/\bactive\b/);
  await expect.poll(async () => (await audio(page))!.time).toBeGreaterThan(1.5);

  // A reload: the same song at the same moment, from Monster Siren again.
  const before = (await audio(page))!.time;
  await page.reload();
  await expect.poll(async () => (await audio(page))?.src ?? '', { timeout: 30_000 }).toContain(`/api/music-audio/${msr.cid}`);
  const playButton = bar(page).getByRole('button', { name: 'Play', exact: true });
  // Whether the browser lets a new document start sound by itself is its call: either it plays
  // on, or the song waits there for one press of Play.
  await expect.poll(async () => !(await audio(page))!.paused || await playButton.isVisible(), { timeout: 20_000 }).toBe(true);
  if ((await audio(page))!.paused) await playButton.click();
  await expect.poll(async () => (await audio(page))!.paused).toBe(false);
  // Playing is said before the saved moment is applied (once the file says how long it is).
  await expect.poll(async () => (await audio(page))!.time).toBeGreaterThanOrEqual(before - 0.5);
  const record = await page.evaluate(() => JSON.parse(sessionStorage.getItem('arkpediaMusicResume') ?? 'null'));
  expect(record.videoId).toBe(id);
  expect(record.queue).toContain(id);
  expect(record.queue).toContain(yt.videoId);
  // YouTube never loaded it, in either document.
  expect(((await youtube(page))?.calls ?? []).filter(([name]) => name === 'loadVideoById' || name === 'cueVideoById')
    .some(([, arg]) => typeof arg === 'object' && String(arg?.videoId).startsWith('msr:'))).toBe(false);
});

test('an address the CDN refuses (expired) is asked again once, and the song plays on', async ({ page }) => {
  await stubYouTube(page);
  const siren = await stubMonsterSiren(page);
  await page.goto('/music?view=library');
  const msr = (await catalogue(page)).find(row => row.cid && !row.videoId)!;
  siren.refuseNextFile = true;
  await page.getByRole('searchbox', { name: 'Search all songs' }).fill(msr.altTitle || msr.title);
  await libraryRow(page, `msr:${msr.cid}`).locator('.music-song-row-main').click();
  // play() unpauses the element at once, before the refused file has failed: wait for the second
  // address, then for the song to play on from it.
  await expect.poll(() => siren.resolves, { timeout: 20_000 }).toEqual([msr.cid, msr.cid]);
  await expect.poll(() => siren.files.length, { timeout: 20_000 }).toBeGreaterThanOrEqual(2);
  await expect.poll(async () => (await audio(page))?.paused, { timeout: 20_000 }).toBe(false);
  await expect(bar(page).getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
});

test('where the browser refuses to start the audio by itself, the next song waits, shown and paused, for one press', async ({ page }) => {
  // iOS starts sound only on a press. Stand-in: refuse every play() not within a second of one.
  await page.addInitScript(() => {
    let pressedAt = 0;
    for (const type of ['pointerdown', 'keydown']) window.addEventListener(type, () => { pressedAt = Date.now(); }, true);
    const play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function (this: HTMLMediaElement) {
      if ((window as unknown as { __refuseAudio?: boolean }).__refuseAudio && Date.now() - pressedAt > 1000) {
        return Promise.reject(new DOMException('play() can only be initiated by a user gesture.', 'NotAllowedError'));
      }
      return play.call(this);
    };
  });
  await stubYouTube(page);
  await stubMonsterSiren(page);
  await page.goto('/music?view=library');
  const rows = await catalogue(page);
  const msr = rows.find(row => row.cid && !row.videoId)!;
  const yt = rows.find(row => row.videoId)!;
  const id = `msr:${msr.cid}`;
  await page.getByRole('searchbox', { name: 'Search all songs' }).fill(yt.altTitle || yt.title);
  await libraryRow(page, yt.videoId!).locator('.music-song-row-main').click();
  await expect.poll(async () => (await youtube(page))?.state).toBe(1);
  await page.getByRole('searchbox', { name: 'Search all songs' }).fill(msr.altTitle || msr.title);
  await libraryRow(page, id).getByRole('button', { name: /^Play next: / }).click();

  await page.evaluate(() => { (window as unknown as { __refuseAudio: boolean }).__refuseAudio = true; });
  await page.waitForTimeout(1200);
  await page.evaluate(() => (window as unknown as { __yt: { finish: () => void } }).__yt.finish());
  // Not a silent hang on the song before: the Monster Siren song is the one shown, paused.
  await expect(libraryRow(page, id)).toHaveClass(/\bactive\b/);
  await expect(bar(page).getByRole('button', { name: 'Play', exact: true })).toBeEnabled();
  expect((await audio(page))!.paused).toBe(true);
  expect((await youtube(page))!.state).not.toBe(1);
  // One press plays it.
  await bar(page).getByRole('button', { name: 'Play', exact: true }).click();
  await expect.poll(async () => (await audio(page))!.paused).toBe(false);
  await expect(bar(page).getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
});

test('Discover lists a song with no YouTube upload as a playable row, not a link away', async ({ page }) => {
  await stubYouTube(page);
  const siren = await stubMonsterSiren(page);
  await page.goto('/music/discover');
  const pending = await page.evaluate(() => (window as unknown as { __NEXT_DATA__: { props: { pageProps: { pendingSongs: { songId: string; title: string; albumName: string }[] } } } })
    .__NEXT_DATA__.props.pageProps.pendingSongs[0]);
  await page.getByRole('searchbox', { name: /Search songs, characters/ }).fill(pending.albumName);
  const row = page.locator(`.music-discover-song-list [data-song-id="msr:${pending.songId}"]`);
  await expect(row).toBeVisible();
  await expect(row.locator('a')).toHaveCount(0);
  await expect(page.getByText('Not on YouTube yet')).toHaveCount(0);
  await row.locator('.music-song-row-main').click();
  await expect.poll(async () => (await audio(page))?.paused).toBe(false);
  await expect.poll(() => siren.resolves).toEqual([pending.songId]);
});

test('from a Monster Siren song to one on YouTube: the audio stops and lets its file go, and YouTube plays', async ({ page }) => {
  await stubYouTube(page);
  const siren = await stubMonsterSiren(page);
  await page.goto('/music?view=library');
  const rows = await catalogue(page);
  const msr = rows.find(row => row.cid && !row.videoId)!;
  const yt = rows.find(row => row.videoId)!;
  await page.getByRole('searchbox', { name: 'Search all songs' }).fill(msr.altTitle || msr.title);
  await libraryRow(page, `msr:${msr.cid}`).locator('.music-song-row-main').click();
  await expect.poll(async () => (await audio(page))?.paused).toBe(false);
  await page.getByRole('searchbox', { name: 'Search all songs' }).fill(yt.altTitle || yt.title);
  await libraryRow(page, yt.videoId!).getByRole('button', { name: /^Play next: / }).click();
  await bar(page).getByRole('button', { name: 'Next track', exact: true }).click();
  await expect.poll(async () => (await youtube(page))?.state).toBe(1);
  expect((await youtube(page))!.videoId).toBe(yt.videoId);
  expect(await audio(page)).toMatchObject({ src: '', paused: true });
  await expect(bar(page).getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
  await expect(libraryRow(page, yt.videoId!)).toHaveClass(/\bactive\b/);
  // And back: Previous plays the Monster Siren song again, its address asked afresh, and YouTube stops.
  await bar(page).getByRole('button', { name: 'Previous track', exact: true }).click();
  await expect.poll(async () => (await audio(page))?.paused).toBe(false);
  await expect.poll(async () => (await youtube(page))!.state).toBe(2);
  await expect.poll(() => siren.resolves).toEqual([msr.cid, msr.cid]);
  await expect(bar(page).getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
});

test('a file that fails mid-song (its address expired) is asked for again, and the song carries on from where it was', async ({ page }) => {
  await stubYouTube(page);
  const siren = await stubMonsterSiren(page);
  await page.goto('/music?view=library');
  const msr = (await catalogue(page)).find(row => row.cid && !row.videoId)!;
  await page.getByRole('searchbox', { name: 'Search all songs' }).fill(msr.altTitle || msr.title);
  await libraryRow(page, `msr:${msr.cid}`).locator('.music-song-row-main').click();
  await expect.poll(async () => (await audio(page))!.time).toBeGreaterThan(2);
  const at = (await audio(page))!.time;
  // The element reports what a refused range request would (the fixture is too small for one).
  await page.evaluate(() => document.querySelector('audio[data-music-audio]')!.dispatchEvent(new Event('error')));
  await expect.poll(() => siren.resolves.length).toBe(2);
  await expect.poll(async () => (await audio(page))!.src).toContain('retry=');
  await expect.poll(async () => (await audio(page))!.paused).toBe(false);
  expect((await audio(page))!.time).toBeGreaterThanOrEqual(at);
  await expect(bar(page).getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
});
