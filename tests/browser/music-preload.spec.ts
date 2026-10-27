import { chooseMusicView, clickMusicControl, openPlayerActions } from './music-navigation-helpers';
import { expect, test, type Page } from '@playwright/test';
import { signedHeads, stubMonsterSiren, WAV_SECONDS } from './monster-siren-stub';
import { stubYouTube } from './youtube-stub';

interface Song { videoId: string; cid: string; title: string; altTitle?: string }
const bar = (page: Page) => page.getByRole('region', { name: 'Player', exact: true });
const row = (page: Page, song: Song) => page.locator(`.music-all-songs-list [data-song-id="${song.videoId}"]`);
const audio = (page: Page) => page.locator('audio[data-music-audio]');
async function select(page: Page, song: Song, play = false) {
  await page.getByRole('searchbox', { name: 'Search all songs' }).fill(song.altTitle || song.title);
  if (play) {
    await row(page, song).locator('.music-song-row-main').click();
    await expect.poll(() => audio(page).evaluate(el => (el as HTMLAudioElement).currentTime)).toBeGreaterThan(0.1);
  }
  else if (test.info().project.name === 'mobile') {
    await row(page, song).getByRole('button', { name: /^More actions for / }).click();
    const menu = page.getByRole('dialog', { name: 'Song actions', exact: true });
    await menu.getByRole('button', { name: 'Play next', exact: true }).click();
    await expect(menu).toHaveCount(0);
  } else await row(page, song).getByRole('button', { name: /^Play next: / }).click();
}
async function setup(page: Page) {
  await stubYouTube(page, 'allow', { dataSaver: false });
  const siren = await stubMonsterSiren(page);
  await page.addInitScript(() => {
    const create = URL.createObjectURL, revoke = URL.revokeObjectURL;
    const w = window as unknown as { __prepared: string[]; __released: string[]; __ended: number; __started: number };
    w.__prepared = []; w.__released = []; w.__ended = 0; w.__started = 0;
    URL.createObjectURL = blob => { const url = create(blob); if (blob instanceof Blob && blob.type.startsWith('audio/')) w.__prepared.push(url); return url; };
    URL.revokeObjectURL = url => { w.__released.push(url); revoke(url); };
    document.addEventListener('ended', () => { w.__ended = performance.now(); }, true);
    document.addEventListener('playing', () => { if (w.__ended) w.__started = performance.now(); }, true);
  });
  await page.goto('/music?view=library', { waitUntil: 'domcontentloaded' });
  const all: Song[] = (await (await page.request.get('/music-catalogue.json')).json()).songs;
  const songs = all.filter((s, i) => s.videoId && s.cid && all.findIndex(other => other.cid === s.cid) === i).slice(0, 4);
  expect(songs.length).toBe(4);
  return { siren, songs };
}
const prepared = (page: Page) => page.evaluate(() => (window as unknown as { __prepared: string[] }).__prepared);
const released = (page: Page) => page.evaluate(() => (window as unknown as { __released: string[] }).__released);
const upcoming = (page: Page) => page.evaluate(() => {
  const w = window as unknown as { __prepared: string[]; __released: string[] };
  const current = document.querySelector('audio[data-music-audio]')?.getAttribute('src')?.split('#')[0];
  return w.__prepared.filter(url => url !== current && !w.__released.includes(url));
});
async function finish(page: Page) { await audio(page).evaluate((el, seconds) => { (el as HTMLAudioElement).currentTime = seconds - 0.2; }, WAV_SECONDS); }

test('one upcoming track is ready before the end and starts on the same element without a second download', async ({ page }) => {
  const { siren, songs: [first, second] } = await setup(page);
  siren.delayFilesMs = 1000;
  await select(page, first, true);
  await select(page, second);
  await expect.poll(() => prepared(page)).toHaveLength(1);
  const url = (await prepared(page))[0];
  await expect(audio(page)).toHaveAttribute('src', `/api/music-audio/${first.cid}`);
  await expect.poll(() => audio(page).evaluate(el => (el as HTMLAudioElement).paused)).toBe(false);
  expect([...new Set(siren.resolves)]).toEqual([first.cid, second.cid]);
  await audio(page).evaluate(el => el.setAttribute('data-original-element', 'yes'));
  await finish(page);
  await expect(audio(page)).toHaveAttribute('src', url);
  await expect.poll(() => audio(page).evaluate(el => (el as HTMLAudioElement).currentTime)).toBeGreaterThan(0.1);
  await expect(audio(page)).toHaveAttribute('data-original-element', 'yes');
  expect(await audio(page).count()).toBe(1);
  expect(siren.resolves.filter(cid => cid === second.cid)).toHaveLength(1);
  const gap = await page.evaluate(() => { const w = window as unknown as { __ended: number; __started: number }; return w.__started - w.__ended; });
  expect(gap).toBeGreaterThanOrEqual(0);
  expect(gap, 'the prepared file starts without waiting for an audio request').toBeLessThan(800);
});

test('Play next replaces a prepared file, and only the newly selected song plays', async ({ page }) => {
  const { siren, songs: [first, second, third] } = await setup(page);
  await select(page, first, true); await select(page, second);
  await expect.poll(() => prepared(page)).toHaveLength(1);
  const old = (await prepared(page))[0];
  await select(page, third);
  await expect.poll(() => released(page)).toContain(old);
  await expect.poll(() => prepared(page)).toHaveLength(2);
  const next = (await prepared(page))[1];
  await finish(page);
  await expect(audio(page)).toHaveAttribute('src', next);
  await expect(row(page, third)).toHaveClass(/\bactive\b/);
  expect(siren.resolves.filter(cid => cid === third.cid)).toHaveLength(1);
});

test('pause retains a prepared file, and Clear queue releases it without interrupting the current song', async ({ page }) => {
  // Autoplay off (it is on by default): with it on, a cleared queue's next song is an autoplay
  // pick, which may be the very file prepared.
  await page.addInitScript(() => localStorage.setItem('arkpediaMusicAutoplay', 'false'));
  const { songs: [first, second] } = await setup(page);
  await select(page, first, true); await select(page, second);
  await expect.poll(() => prepared(page)).toHaveLength(1);
  const ready = (await prepared(page))[0];
  await bar(page).getByRole('button', { name: 'Pause', exact: true }).click();
  expect(await released(page)).not.toContain(ready);
  await chooseMusicView(page, /^Queue/);
  await page.getByRole('button', { name: 'Clear queue', exact: true }).click();
  await expect.poll(() => released(page)).toContain(ready);
  await expect(audio(page)).toHaveAttribute('src', `/api/music-audio/${first.cid}`);
  await expect.poll(() => audio(page).evaluate(el => (el as HTMLAudioElement).paused)).toBe(true);
});

test('the browser Data saver preference prevents speculative audio downloads', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, 'connection', { configurable: true, value: { saveData: true } }));
  const { siren, songs: [first, second] } = await setup(page);
  await select(page, first, true); await select(page, second);
  await expect.poll(() => audio(page).evaluate(el => (el as HTMLAudioElement).currentTime)).toBeGreaterThan(4);
  expect(await prepared(page)).toHaveLength(0);
  expect([...new Set(siren.resolves)]).toEqual([first.cid]);
  expect(siren.links, 'not even the next song\'s address is asked for ahead').toEqual([]);
});

test('a failed preload leaves playback alone and the next song uses ordinary streaming', async ({ page }) => {
  const { songs: [first, second] } = await setup(page);
  let attempts = 0;
  await page.route(`**/api/music-audio/${second.cid}`, route => {
    if (route.request().resourceType() === 'fetch' && route.request().method() === 'GET') { attempts++; return route.fulfill({ status: 503, body: '' }); }
    return route.fallback();
  });
  await select(page, first, true); await select(page, second);
  await expect.poll(() => attempts).toBe(1);
  await expect(bar(page).getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
  await finish(page);
  await expect(audio(page)).toHaveAttribute('src', `/api/music-audio/${second.cid}`);
  await expect.poll(() => audio(page).evaluate(el => (el as HTMLAudioElement).currentTime)).toBeGreaterThan(0.1);
  expect(attempts).toBe(1);
  expect(await prepared(page)).toHaveLength(0);
});

test('an unfinished direct download never delays Next, and old relay preferences cannot affect preloading', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('arkpediaAudioRelay', String(Date.now() + 60000));
    localStorage.setItem('musicFavorites', JSON.stringify(['msr:697616']));
  });
  const { siren, songs: [first, second, third] } = await setup(page);
  let waiting = false;
  await page.route(`**/api/music-audio/${second.cid}`, route => {
    if (route.request().resourceType() === 'fetch') { if (route.request().method() === 'GET') waiting = true; return new Promise<void>(() => {}); }
    return route.fallback();
  });
  await select(page, first, true); await select(page, second);
  await expect.poll(() => waiting).toBe(true);
  await clickMusicControl(page, 'Next track');
  await expect(audio(page)).toHaveAttribute('src', `/api/music-audio/${second.cid}`);
  await expect.poll(() => audio(page).evaluate(el => (el as HTMLAudioElement).currentTime)).toBeGreaterThan(0.1);
  await select(page, third);
  await expect.poll(() => prepared(page)).toHaveLength(1);
  await finish(page);
  await expect(audio(page)).toHaveAttribute('src', (await prepared(page))[0]);
  expect(siren.resolves.filter(cid => cid === third.cid)).toHaveLength(1);
  expect(siren.relays).toEqual([]);
  expect(await page.evaluate(() => localStorage.getItem('arkpediaAudioRelay'))).toBeNull();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('musicFavorites')!))).toEqual(['msr:697616']);
});

test('shuffle prepares its actual next row; Repeat one discards it and Repeat all wraps to the first song', async ({ page }) => {
  const { songs: [first, second, third] } = await setup(page);
  await select(page, first, true); await select(page, second); await select(page, third);
  await clickMusicControl(page, 'Shuffle');
  await chooseMusicView(page, /^Queue/);
  const nextId = await page.locator('.music-queue-row').nth(1).getAttribute('data-song-id');
  await expect.poll(() => prepared(page)).not.toHaveLength(0);
  // Whichever shuffle chose, automatic playback must consume a prepared file for that row.
  await finish(page);
  await expect(page.locator(`.music-queue-row[data-song-id="${nextId}"]`)).toHaveClass(/\bcurrent\b/);
  await expect(audio(page)).toHaveAttribute('src', /^blob:/);
  await expect.poll(() => upcoming(page)).toHaveLength(1);
  const discarded = (await upcoming(page))[0];
  await clickMusicControl(page, 'Repeat: off');
  await expect.poll(() => released(page)).toContain(discarded);
  const before = (await prepared(page)).length;
  await finish(page);
  await expect.poll(() => audio(page).evaluate(el => (el as HTMLAudioElement).currentTime)).toBeLessThan(3);
  await expect(page.locator(`.music-queue-row[data-song-id="${nextId}"]`)).toHaveClass(/\bcurrent\b/);
  expect(await prepared(page)).toHaveLength(before);
  // Leave one queued successor and verify Repeat all prepares the first after reaching the end.
  await clickMusicControl(page, 'Shuffle');
  await clickMusicControl(page, 'Repeat: one');
  // Play next inserted third before second, so second is the end of the unshuffled queue.
  await page.getByRole('searchbox', { name: 'Search the queue' }).fill(second.altTitle || second.title);
  await page.locator(`.music-queue-row[data-song-id="${second.videoId}"] .music-song-row-main`).click();
  await page.getByRole('searchbox', { name: 'Search the queue' }).fill('');
  await expect.poll(() => audio(page).evaluate(el => (el as HTMLAudioElement).currentTime)).toBeGreaterThan(3);
  await expect.poll(() => upcoming(page)).toHaveLength(1);
  const wrapped = (await upcoming(page))[0];
  await finish(page);
  await expect(audio(page)).toHaveAttribute('src', wrapped);
  await expect(page.locator(`.music-queue-row[data-song-id="${first.videoId}"]`)).toHaveClass(/\bcurrent\b/);
});

test('enabling Data saver releases the upcoming file and leaves only the chosen playback provider running', async ({ page }) => {
  const { songs: [first, second] } = await setup(page);
  await select(page, first, true); await select(page, second);
  await expect.poll(() => prepared(page)).toHaveLength(1);
  const ready = (await prepared(page))[0];
  await openPlayerActions(page);
  await page.getByRole('dialog', { name: 'Player actions', exact: true }).getByRole('checkbox', { name: 'Data saver', exact: true }).check();
  await expect.poll(() => released(page)).toContain(ready);
  await expect(audio(page)).not.toHaveAttribute('src');
});

test('Autoplay prepares the same next library song that plays after the chosen queue', async ({ page }) => {
  // Preserve the catalogue's order when Autoplay makes its one shuffled order.
  await page.addInitScript(() => { Math.random = () => 0.999999; });
  const { siren, songs: [first, second] } = await setup(page);
  await select(page, first, true);
  await chooseMusicView(page, /^Queue/);
  await page.getByRole('region', { name: 'Autoplay from library' }).getByRole('checkbox', { name: 'On', exact: true }).check();
  await expect.poll(() => prepared(page)).toHaveLength(1);
  expect([...new Set(siren.resolves)]).toEqual([first.cid, second.cid]);
  await finish(page);
  await expect(audio(page)).toHaveAttribute('src', (await prepared(page))[0]);
  await expect(bar(page)).toContainText(second.altTitle || second.title);
  expect(siren.resolves.filter(cid => cid === second.cid)).toHaveLength(1);
});

/*
 * The next song's signed address, asked for ahead (lib/music/audioPreload.ts): a HEAD of its
 * address follows the route's redirect to Monster Siren's CDN, which answers with headers only.
 * Next then sets that address and plays it in the press, without asking the route first (0.8-3 s
 * a song on the Cloudflare Worker, 2026-10-22) and without a downloaded file.
 */
test('the next song\'s signed address is asked for ahead, and Next plays it in the press without asking the route', async ({ page }) => {
  await page.addInitScript(() => {
    const plays: { src: string; inPress: boolean }[] = [];
    (window as unknown as { __plays: typeof plays }).__plays = plays;
    const { play } = HTMLMediaElement.prototype;
    HTMLMediaElement.prototype.play = function (this: HTMLMediaElement) {
      if (this.matches('audio[data-music-audio]')) plays.push({ src: this.getAttribute('src') ?? '', inPress: navigator.userActivation.isActive });
      return play.call(this);
    };
  });
  await signedHeads(page);
  const { siren, songs: [first, second] } = await setup(page);
  await select(page, first, true);
  // The next song's file is held back, so at the press only its address can be ready.
  siren.delayFilesMs = 60_000;
  await select(page, second);
  const file = `/siren/audio/${second.cid}.wav`;
  await expect.poll(() => siren.links).toEqual([second.cid]);
  await page.waitForFunction(cid => performance.getEntriesByType('resource').some(entry => entry.name.endsWith(`/api/music-audio/${cid}`)
    && (entry as PerformanceResourceTiming).initiatorType === 'fetch' && (entry as PerformanceResourceTiming).responseEnd > 0), second.cid);
  const asked = siren.resolves.length;
  siren.delayFilesMs = 0;
  await clickMusicControl(page, 'Next track');
  await expect(audio(page)).toHaveAttribute('src', new RegExp(`^https://res01\\.hycdn\\.cn/5{32}/[0-9A-F]{8}${file.replace(/\./g, '\\.')}$`));
  await expect.poll(() => audio(page).evaluate(el => (el as HTMLAudioElement).currentTime)).toBeGreaterThan(0.1);
  expect(siren.resolves.slice(asked).filter(cid => cid === second.cid), 'the route was not asked at the press').toEqual([]);
  expect(siren.cdn.some(({ method, url }) => method === 'GET' && url.endsWith(file)), 'the file came from the CDN').toBe(true);
  const plays = await page.evaluate(() => (window as unknown as { __plays: { src: string; inPress: boolean }[] }).__plays);
  expect(plays.find(({ src }) => src.includes(file)), 'its play() ran inside the press').toMatchObject({ inPress: true });
  expect(await prepared(page)).toHaveLength(0);
});
