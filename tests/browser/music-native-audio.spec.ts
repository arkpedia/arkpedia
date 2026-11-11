import { expect, test } from '@playwright/test';
import { stubYouTube, youtube } from './youtube-stub';
import { stubMonsterSiren } from './monster-siren-stub';
import type { NativeState, NativeTrack } from '../../lib/music/nativeAudio';

test.afterEach(async ({ page }) => { await page.unrouteAll({ behavior: 'ignoreErrors' }); });

for (const theme of ['dark', 'light']) {
  test(`native playback and lock-screen preferences reconcile in ${theme} theme`, async ({ page, baseURL }, info) => {
    test.setTimeout(120_000);
    // Render the checked local source under the native app's production origin. No request
    // to the real production website is made by this fixture.
    await page.route('https://www.arkpedia.net/**', async route => {
      const url = new URL(route.request().url());
      const response = await route.fetch({ url: `${baseURL}${url.pathname}${url.search}` });
      await route.fulfill({ response });
    });
    await stubYouTube(page, 'allow', { dataSaver: false });
    await stubMonsterSiren(page);
    let state: NativeState = { version: 1, sessionId: 'test-native-session', sequence: 0, track: null,
      playing: false, buffering: false, seconds: 0, duration: 240, revision: 0, changes: {}, error: '' };
    let tracks: NativeTrack[] = [];
    let loads = 0;
    const snapshot = () => structuredClone({ ...state, sequence: (state.sequence = (state.sequence ?? 0) + 1) });
    await page.exposeBinding('__nativeCall', async (_, method: string, options: Record<string, unknown>) => {
      if (method === 'loadTrack') {
        loads += 1;
        state.track = options.track as NativeTrack; state.seconds = options.seconds as number; state.playing = Boolean(options.play);
      } else if (method === 'configure') {
        tracks = options.tracks as NativeTrack[];
        if (options.revision === state.revision) state.changes = {};
      } else if (method === 'command') {
        if (options.action === 'play') state.playing = true;
        if (options.action === 'pause') state.playing = false;
        if (options.action === 'stop') {
          // The old native track can remain visible to JS while YouTube starts.
          await new Promise(resolve => setTimeout(resolve, 100));
          state.playing = false; state.track = null;
        }
        if (options.action === 'seek') state.seconds = options.seconds as number;
      }
      return snapshot();
    });
    await page.addInitScript(({ theme }) => {
      localStorage.setItem('theme', theme);
      const target = window as unknown as { Capacitor: unknown; __nativeCall: (method: string, options?: unknown) => Promise<unknown>; __nativePush: (state: unknown) => void };
      target.Capacitor = { Plugins: { ArkpediaAudio: {
        getState: () => target.__nativeCall('getState', {}),
        configure: (options: unknown) => target.__nativeCall('configure', options),
        loadTrack: (options: unknown) => target.__nativeCall('loadTrack', options),
        command: (options: unknown) => target.__nativeCall('command', options),
        addListener: async (_: string, listener: (state: unknown) => void) => { target.__nativePush = listener; return { remove: async () => {} }; },
      } } };
    }, { theme });
    const catalog = await (await page.request.get(`${baseURL}/music-catalogue.json`)).json();
    const song = catalog.songs.find((song: { cid?: string; videoId?: string }) => song.cid && !song.videoId);
    expect(song).toBeTruthy();
    const id = `msr:${song.cid}`;
    await page.goto('https://www.arkpedia.net/music?view=library');
    await page.getByRole('searchbox', { name: 'Search all songs' }).fill(song.altTitle || song.title);
    await page.locator(`.music-all-songs-list [data-song-id="${id}"] .music-song-row-main`).click();
    const bar = page.getByRole('region', { name: 'Player', exact: true });
    await expect(bar.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
    await expect.poll(() => state.track?.id).toBe(id);
    await expect.poll(() => tracks.length).toBeGreaterThan(0);
    expect(await page.locator('audio[data-music-audio]').getAttribute('src')).toBeNull();
    state.revision += 1;
    state.changes = { favourite: { id, kind: 'favourites', value: true }, block: { id, kind: 'blocked', value: true } };
    await page.evaluate(state => (window as unknown as { __nativePush: (state: unknown) => void }).__nativePush(state), snapshot());
    await expect(bar.getByRole('button', { name: 'Favourite', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(bar.getByRole('button', { name: "Don't autoplay this song", exact: true })).toHaveAttribute('aria-pressed', 'true');
    await page.screenshot({ path: info.outputPath('native-player.png') });
    await bar.getByRole('button', { name: 'Pause', exact: true }).click();
    await expect.poll(() => state.playing).toBe(false);
    await bar.getByRole('button', { name: 'Play', exact: true }).click();
    await expect.poll(() => state.playing).toBe(true);
    const next = tracks[tracks.findIndex(track => track.id === id) + 1];
    expect(next, 'the native service receives the next queued song').toBeTruthy();
    state.track = next;
    state.seconds = 17;
    await page.evaluate(state => (window as unknown as { __nativePush: (state: unknown) => void }).__nativePush(state), snapshot());
    await expect.poll(() => page.evaluate(() => JSON.parse(sessionStorage.getItem('arkpediaMusicResume') ?? '{}').videoId)).toBe(next.id);
    state.seconds = 42;
    const before = loads;
    await page.reload();
    await expect(bar.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
    expect(loads, 'Reload adopts the native session without restarting its audio').toBe(before);
    expect(state.seconds).toBe(42);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('musicFavorites') ?? '[]'))).toContain(id);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const yt = catalog.songs.find((song: { videoId?: string; cid?: string }) => song.videoId && !song.cid);
    await page.getByRole('searchbox', { name: 'Search all songs' }).fill(yt.altTitle || yt.title);
    await page.getByRole('button', { name: 'Include Endfield music', exact: true }).click();
    if (info.project.name === 'mobile') await page.getByRole('dialog', { name: 'Endfield music on phones', exact: true }).getByRole('button', { name: 'OK', exact: true }).click();
    await page.locator(`.music-all-songs-list [data-song-id="${yt.videoId}"] .music-song-row-main`).click();
    await expect.poll(async () => (await youtube(page))?.videoId).toBe(yt.videoId);
    await expect.poll(() => state.track).toBeNull();
    await expect(bar.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
    await expect.poll(() => page.evaluate(() => JSON.parse(sessionStorage.getItem('arkpediaMusicResume') ?? '{}').videoId)).toBe(yt.videoId);
  });
}
