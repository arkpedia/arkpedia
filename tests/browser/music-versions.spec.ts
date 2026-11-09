import { chooseMusicView, clickMusicControl } from './music-navigation-helpers';
import fs from 'node:fs';
import { expect, test } from '@playwright/test';
import { stubMonsterSiren } from './monster-siren-stub';
import { stubYouTube, youtube } from './youtube-stub';

const songs = JSON.parse(fs.readFileSync('public/music-catalogue.json', 'utf8')).songs as { videoId: string; title: string; copyright?: boolean }[];
const vocal = songs.find(song => song.title === 'Secret Escape')!;
const instrumental = songs.find(song => song.title === 'Secret Escape (Instrumental)')!;
const flagged = songs.find(song => song.copyright)!;

for (const theme of ['dark', 'light']) {
  test(`switch between vocal and instrumental versions (${theme})`, async ({ page }, info) => {
    await stubYouTube(page);
    await page.addInitScript(theme => localStorage.setItem('theme', theme), theme);
    await page.route(/\/music-catalogue\.json(?:\?|$)/, route => route.fulfill({ json: { songs: [vocal, instrumental] } }));
    await page.goto('/music?view=library');
    await page.locator(`.music-library-row[data-song-id="${vocal.videoId}"] .music-song-row-main`).click();
    await chooseMusicView(page, 'Now playing');
    const seek = page.getByRole('region', { name: 'Player', exact: true }).getByRole('slider', { name: /seek/i });
    await seek.focus();
    await page.keyboard.press('ArrowRight');
    await expect.poll(async () => (await youtube(page))!.time).toBeGreaterThan(1);
    const before = (await youtube(page))!.time;
    await page.getByRole('button', { name: 'Play instrumental version', exact: true }).click();
    await expect.poll(async () => (await youtube(page))?.videoId).toBe(instrumental.videoId);
    const back = page.getByRole('button', { name: 'Play vocal version', exact: true });
    await expect(back).toBeVisible();
    expect(Math.abs((await youtube(page))!.time - before)).toBeLessThan(2);
    await clickMusicControl(page, 'Pause');
    const paused = (await youtube(page))!.time;
    await back.focus(); await page.keyboard.press('Enter');
    await expect.poll(async () => (await youtube(page))?.videoId).toBe(vocal.videoId);
    await expect(page.getByRole('button', { name: 'Play instrumental version', exact: true })).toBeVisible();
    await expect.poll(async () => (await youtube(page))!.state).toBe(5);
    expect(Math.abs((await youtube(page))!.time - paused)).toBeLessThan(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const fallback = page.locator('.header-utilities .profile-avatar-trigger > svg').first();
    if (info.project.name === 'desktop') {
      await expect(fallback).toHaveAttribute('width', '20');
      await expect(fallback).toHaveAttribute('height', '20');
    }
    await fs.promises.mkdir('.cache/music-versions-qa', { recursive: true });
    await page.screenshot({ path: `.cache/music-versions-qa/${info.project.name}-${theme}.png` });
  });
}

test('Stream-safe pauses a flagged playing song and Play selects an allowed song', async ({ page }) => {
  await stubYouTube(page);
  await page.route(/\/music-catalogue\.json(?:\?|$)/, route => route.fulfill({ json: { songs: [flagged, vocal] } }));
  await page.goto('/music?view=library');
  await page.locator(`.music-library-row[data-song-id="${flagged.videoId}"] .music-song-row-main`).click();
  await expect.poll(async () => (await youtube(page))?.state).toBe(1);
  const player = page.getByRole('region', { name: 'Player', exact: true });
  await player.getByRole('button', { name: 'Stream-safe: hide copyrighted songs' }).click();
  await expect.poll(async () => (await youtube(page))?.state).toBe(2);
  await expect(page.locator(`.music-library-row[data-song-id="${flagged.videoId}"]`)).toHaveCount(0);
  await clickMusicControl(page, 'Play');
  await expect.poll(async () => (await youtube(page))?.videoId).toBe(vocal.videoId);
  await expect.poll(async () => (await youtube(page))?.state).toBe(1);
  expect(await page.evaluate(() => localStorage.getItem('musicExcludeCopyrighted'))).toBe('true');
});

test('an album found through search opens its whole song list and Back restores the search', async ({ page }) => {
  await stubYouTube(page);
  await page.goto('/music/discover?q=rhine%20lab');
  const search = page.getByRole('searchbox', { name: 'Search songs, characters, artists, albums', exact: true });
  await expect(search).toHaveValue('rhine lab');
  const rows = page.locator('.music-discover-song-row');
  const before = await rows.count();
  await page.getByRole('button', { name: 'Lone Trail OST', exact: true }).click();
  await expect(search).toHaveValue('');
  await expect.poll(() => rows.count()).toBeGreaterThan(before);
  await expect(page).toHaveURL(/facet=album/);
  await page.goBack();
  await expect(search).toHaveValue('rhine lab');
  await expect(rows).toHaveCount(before);
});

test('both native recordings are prepared and reused across version switches', async ({ page }) => {
  await stubYouTube(page, 'allow', { dataSaver: false });
  await page.addInitScript(() => localStorage.setItem('arkpediaMusicAutoplay', 'false'));
  const siren = await stubMonsterSiren(page);
  await page.goto('/music/discover?q=Still+the+Same');
  await page.locator('.music-discover-song-row[data-song-id="DxMj5INKYQA"] .music-song-row-main').click();
  await chooseMusicView(page, 'Now playing');
  const audio = page.locator('audio[data-music-audio]');
  const standby = page.locator('audio[data-music-standby]');
  await expect.poll(() => audio.evaluate(el => (el as HTMLAudioElement).readyState)).toBeGreaterThanOrEqual(3);
  await audio.evaluate(el => { (el as HTMLAudioElement).currentTime = 20; });
  const aligned = () => page.evaluate(() => {
    const a = document.querySelector<HTMLAudioElement>('audio[data-music-audio]');
    const b = document.querySelector<HTMLAudioElement>('audio[data-music-standby]');
    // WebKit silences the standby by disconnecting its speaker graph; the
    // spectrum suite verifies that output path independently of native mute.
    return a && b && !a.muted && (b.muted || !('captureStream' in b)) && !a.paused && !b.paused && !a.seeking && !b.seeking
      && Math.abs(a.currentTime - b.currentTime + (a.currentSrc.includes('461129') ? -14.6255 : 14.6255)) < ('captureStream' in b ? .035 : .08);
  });
  await expect.poll(aligned).toBe(true);
  await audio.evaluate(el => { (el as HTMLAudioElement).currentTime = 22; });
  await expect.poll(aligned).toBe(true);
  const requests = siren.files.length;
  await page.evaluate(() => {
    // Observe the operation while the element owns its role. WebKit can deliver
    // a standby seek event after that element becomes active, so an event-time
    // role check would incorrectly count a silent follower correction as a glitch.
    const clock = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'currentTime')!;
    for (const el of document.querySelectorAll('audio')) {
      Object.defineProperty(el, 'currentTime', {
        get() { return clock.get!.call(el); },
        set(time) {
          if (el.hasAttribute('data-music-audio')) el.setAttribute('data-interrupted', 'seeking');
          clock.set!.call(el, time);
        },
      });
      for (const method of ['pause', 'load'] as const) {
        const original = el[method].bind(el);
        el[method] = () => {
          if (el.hasAttribute('data-music-audio') || method === 'load') el.setAttribute('data-interrupted', method);
          original();
        };
      }
    }
  });
  for (const version of ['instrumental', 'vocal']) {
    const nextSrc = await standby.evaluate(el => (el as HTMLAudioElement).currentSrc);
    await page.getByRole('button', { name: 'Play ' + version + ' version' }).click();
    await expect.poll(() => audio.evaluate(el => (el as HTMLAudioElement).currentSrc)).toBe(nextSrc);
    await expect.poll(aligned).toBe(true);
    expect(await audio.evaluate(el => (el as HTMLAudioElement).currentTime)).toBeGreaterThan(7);
    // WebKit can be completing a silent follower seek at the tap and use the
    // prepared paused deck instead. Its speaker/level regression covers that
    // fallback; capturing browsers also guarantee the uninterrupted warm path.
    if (await audio.evaluate(el => 'captureStream' in el)) {
      expect(await page.locator('audio[data-interrupted]').evaluateAll(els => els.map(el => el.getAttribute('data-interrupted')))).toEqual([]);
    }
  }
  await clickMusicControl(page, 'Pause');
  const pausedAt = await audio.evaluate(el => (el as HTMLAudioElement).currentTime);
  await page.getByRole('button', { name: 'Play instrumental version' }).click();
  await expect(page.getByRole('button', { name: 'Play vocal version' })).toBeVisible();
  await expect.poll(() => audio.evaluate(el => (el as HTMLAudioElement).paused)).toBe(true);
  expect(Math.abs(await audio.evaluate(el => (el as HTMLAudioElement).currentTime) + 14.6255 - pausedAt)).toBeLessThan(.1);
  expect(siren.files).toHaveLength(requests);
});

test('Paper Boat keeps the lyric highlighted across a switch and seeks on the active recording', async ({ page }) => {
  await stubYouTube(page, 'allow', { dataSaver: false });
  await stubMonsterSiren(page);
  await page.goto('/music/discover?q=Paper+Boat');
  await page.locator('[data-song-id="2Qul6EjQmYc"] .music-song-row-main').click();
  await chooseMusicView(page, 'Now playing');
  const lyrics = page.getByRole('region', { name: 'Lyrics', exact: true });
  const audio = page.locator('audio[data-music-audio]');
  const line = (time: string) => lyrics.getByRole('button', { name: 'Seek to ' + time + ': The night bends, soft and slow' });
  await line('0:16').click();
  await expect(line('0:16')).toHaveAttribute('aria-current', 'true');
  await page.getByRole('button', { name: 'Play instrumental version', exact: true }).click();
  await expect(line('0:08')).toHaveAttribute('aria-current', 'true');
  await clickMusicControl(page, 'Pause');
  const next = lyrics.getByRole('button', { name: 'Seek to 0:13: A cradle made of skies' });
  await next.click();
  await expect(next).toHaveAttribute('aria-current', 'true');
  const seconds = () => audio.evaluate(el => (el as HTMLAudioElement).currentTime);
  expect(await seconds()).toBeCloseTo(21.704 - 7.863, 2);
  await page.getByRole('button', { name: 'Play vocal version', exact: true }).click();
  await expect(lyrics.getByRole('button', { name: 'Seek to 0:21: A cradle made of skies' })).toHaveAttribute('aria-current', 'true');
  expect(await seconds()).toBeCloseTo(21.704, 2);
});

test('Magic Theorem inherits lyrics from a legacy release and keeps both recording clocks aligned', async ({ page }) => {
  await stubYouTube(page, 'allow', { dataSaver: false });
  await stubMonsterSiren(page);
  await page.addInitScript(() => {
    localStorage.setItem('arkpediaMusicAutoplay', 'false');
    localStorage.setItem('arkpedia.music-playlists.v1', JSON.stringify([{ id: 'magic-audit', name: 'Magic audit', tracks: ['5a95hBcx6IY', 'dfvAEq0EQL8'] }]));
  });
  // Exercise an already-published page that still says the instrumental has no lyrics.
  await page.route(/\/music\?view=library&playlist=magic-audit$/, async route => {
    const response = await route.fetch();
    const html = await response.text();
    const match = html.match(/(<script\b[^>]*id="__NEXT_DATA__"[^>]*>)([\s\S]*?)(<\/script>)/);
    expect(match).not.toBeNull();
    const data = JSON.parse(match![2]);
    const instrumental = data.props.pageProps.songLookup.find((row: { videoId: string }) => row.videoId === 'dfvAEq0EQL8');
    expect(instrumental).toBeTruthy();
    instrumental.hasLyrics = false;
    delete instrumental.lyricTrackId;
    const payload = JSON.stringify(data).replace(/</g, '\\u003c');
    await route.fulfill({ response, body: html.replace(match![0], match![1] + payload + match![3]) });
  });
  await page.route(/\/lyrics\/5a95hBcx6IY\.json(?:\?|$)/, route => route.fulfill({ json: [
    { time: 1, text: 'Director: Person' }, { time: 2, text: 'Performed by: Person' },
    { time: 10.5, text: 'Opening line' }, { time: 16.47, text: 'Middle line' }, { time: 22.24, text: 'Later line' },
  ] }));
  await page.goto('/music?view=library&playlist=magic-audit');
  await page.locator('[data-song-id="5a95hBcx6IY"] .music-song-row-main').first().click();
  await chooseMusicView(page, 'Now playing');
  const audio = page.locator('audio[data-music-audio]');
  await expect.poll(() => audio.evaluate(el => (el as HTMLAudioElement).readyState)).toBeGreaterThanOrEqual(3);
  await clickMusicControl(page, 'Pause');
  await expect.poll(() => audio.evaluate(el => (el as HTMLAudioElement).paused)).toBe(true);
  await audio.evaluate(el => { (el as HTMLAudioElement).currentTime = 18.2; });
  await expect.poll(() => audio.evaluate(el => (el as HTMLAudioElement).seeking)).toBe(false);
  await page.getByRole('button', { name: 'Play instrumental version', exact: true }).click();
  await expect(audio).toHaveAttribute('src', /514576/);
  await expect.poll(() => audio.evaluate(el => Math.abs((el as HTMLAudioElement).currentTime - 18.568917))).toBeLessThan(.03);
  const lyrics = page.getByRole('region', { name: 'Lyrics', exact: true });
  await expect(lyrics.getByRole('button').first()).toHaveAccessibleName('Seek to 0:10: Opening line');
  await expect(lyrics.getByText(/Director:|Performed by:/)).toHaveCount(0);
  await lyrics.getByRole('button').first().click();
  await expect.poll(() => audio.evaluate(el => Math.abs((el as HTMLAudioElement).currentTime - 10.868917))).toBeLessThan(.03);
  await page.getByRole('button', { name: 'Play vocal version', exact: true }).click();
  await expect(audio).toHaveAttribute('src', /880368/);
  await expect.poll(() => audio.evaluate(el => Math.abs((el as HTMLAudioElement).currentTime - 10.5))).toBeLessThan(.03);
  await expect.poll(() => audio.evaluate(el => (el as HTMLAudioElement).paused)).toBe(true);
});

test('Speed of Light switches between different edits from their beginnings', async ({ page }) => {
  await stubYouTube(page, 'allow', { dataSaver: false });
  await stubMonsterSiren(page);
  await page.goto('/music/discover?q=speed');
  await page.locator('.music-discover-song-row[data-song-id="d3jylNWjb3k"] .music-song-row-main').click();
  await chooseMusicView(page, 'Now playing');
  const audio = page.locator('audio[data-music-audio]');
  for (const [version, cid] of [['instrumental', '125012'], ['vocal', '880374']]) {
    await expect.poll(() => audio.evaluate(el => (el as HTMLAudioElement).readyState)).toBeGreaterThanOrEqual(3);
    await audio.evaluate(el => { (el as HTMLAudioElement).currentTime = 12; });
    await page.getByRole('button', { name: 'Play ' + version + ' version from start' }).click();
    await expect(audio).toHaveAttribute('src', new RegExp(cid));
    expect(await audio.evaluate(el => (el as HTMLAudioElement).currentTime)).toBeLessThan(2);
    const firstCue = page.getByRole('region', { name: 'Lyrics', exact: true }).getByRole('button').first();
    await expect(firstCue).toHaveAccessibleName(new RegExp('^Seek to ' + (version === 'instrumental' ? '0:08' : '0:17')));
    await expect(firstCue).not.toHaveAttribute('aria-current', 'true');
  }
});
