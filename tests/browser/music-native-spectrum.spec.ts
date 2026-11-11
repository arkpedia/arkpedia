import { expect, test } from '@playwright/test';
import { stubYouTube } from './youtube-stub';
import { stubMonsterSiren } from './monster-siren-stub';
import type { NativeState, NativeTrack } from '../../lib/music/nativeAudio';

test.afterEach(async ({ page }) => { await page.unrouteAll({ behavior: 'ignoreErrors' }); });

for (const theme of ['dark', 'light']) test(`iOS spectrum uses fresh native samples without another audio stream (${theme})`, async ({ page, baseURL }, info) => {
  await page.route('https://www.arkpedia.net/**', async route => {
    const url = new URL(route.request().url());
    await route.fulfill({ response: await route.fetch({ url: `${baseURL}${url.pathname}${url.search}` }) });
  });
  await stubYouTube(page, 'allow', { dataSaver: false });
  await stubMonsterSiren(page);
  const state: NativeState = { version: 1, sessionId: 'native-spectrum', sequence: 0, track: null,
    playing: false, buffering: false, seconds: 0, duration: 240, revision: 0, changes: {}, error: '' };
  let reads = 0, pending = 0, maximumPending = 0;
  let response: 'fresh' | 'stale' | 'invalid' | 'unavailable' | 'error' = 'fresh';
  await page.exposeBinding('__nativeSpectrumCall', async (_, method: string, options: Record<string, unknown>) => {
    if (method === 'getSpectrum') {
      reads += 1; pending += 1; maximumPending = Math.max(maximumPending, pending);
      // Slower than the display interval: overlapping bridge calls must not accumulate.
      await new Promise(resolve => setTimeout(resolve, 70));
      pending -= 1;
      if (response === 'error') throw new Error('Analysis unavailable');
      return { trackId: response === 'stale' ? 'previous-song' : state.track?.id,
        available: response !== 'unavailable', bands: response === 'invalid' ? [999] : Array.from({ length: 48 }, (_, i) => i === 8 ? 180 : 0) };
    }
    if (method === 'loadTrack') { state.track = options.track as NativeTrack; state.playing = Boolean(options.play); }
    if (method === 'command') {
      if (options.action === 'pause' || options.action === 'stop') state.playing = false;
      if (options.action === 'play') state.playing = true;
    }
    return structuredClone({ ...state, sequence: (state.sequence = (state.sequence ?? 0) + 1) });
  });
  await page.addInitScript(theme => {
    localStorage.setItem('theme', theme);
    const call = (method: string, options = {}) => Reflect.get(window, '__nativeSpectrumCall')(method, options);
    Reflect.set(window, 'Capacitor', { Plugins: { ArkpediaAudio: {
      getState: () => call('getState'), getSpectrum: () => call('getSpectrum'),
      loadTrack: (options: object) => call('loadTrack', options), configure: (options: object) => call('configure', options),
      command: (options: object) => call('command', options),
      addListener: async () => ({ remove: async () => {} }),
    } } });
  }, theme);
  const catalog = await (await page.request.get(`${baseURL}/music-catalogue.json`)).json();
  const song = catalog.songs.find((song: { cid?: string; videoId?: string }) => song.cid && !song.videoId);
  await page.goto('https://www.arkpedia.net/music?view=library');
  await page.getByRole('searchbox', { name: 'Search all songs' }).fill(song.altTitle || song.title);
  await page.locator(`.music-all-songs-list [data-song-id="msr:${song.cid}"] .music-song-row-main`).click();
  const player = page.getByRole('region', { name: 'Player', exact: true });
  await player.getByRole('link', { name: /Open Now playing/ }).click();
  const graph = page.locator('.music-wave-svg[data-live]');
  await expect(graph).toBeVisible();
  const peaks = await graph.locator('.music-wave-live').getAttribute('d');
  expect(peaks).toContain('M81 48v-33.9');
  expect(await page.locator('audio[data-music-audio]').getAttribute('src')).toBeNull();
  expect(await page.locator('audio[data-music-audio]').evaluate((el: HTMLAudioElement) => el.paused)).toBe(true);
  await page.screenshot({ path: info.outputPath('native-spectrum.png') });
  for (const fault of ['stale', 'invalid', 'unavailable', 'error'] as const) {
    response = fault;
    await expect(graph).toHaveCount(0);
    response = 'fresh';
    await expect(graph).toBeVisible();
  }
  await player.getByRole('button', { name: 'Pause', exact: true }).click();
  await expect(graph).toHaveCount(0);
  const pausedReads = reads;
  await page.waitForTimeout(180);
  expect(reads).toBe(pausedReads);
  await player.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(graph).toBeVisible();
  await page.getByRole('button', { name: 'Switch to original waves' }).click();
  const wavesReads = reads;
  await page.waitForTimeout(180);
  expect(reads).toBe(wavesReads);
  await expect(graph).toHaveCount(0);
  await page.getByRole('button', { name: 'Switch to frequency spectrum' }).click();
  await expect(graph).toBeVisible();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(graph).toHaveCount(0);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await expect(graph).toBeVisible();
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { value: true, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(graph).toHaveCount(0);
  const hiddenReads = reads;
  await page.waitForTimeout(180);
  expect(reads).toBe(hiddenReads);
  await page.evaluate(() => {
    Reflect.deleteProperty(document, 'hidden'); document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(graph).toBeVisible();
  expect(maximumPending).toBe(1);
});
