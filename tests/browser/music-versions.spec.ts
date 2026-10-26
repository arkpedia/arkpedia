import fs from 'node:fs';
import { expect, test } from '@playwright/test';
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
    await page.getByRole('navigation', { name: 'Music', exact: true }).getByRole('link', { name: 'Now playing', exact: true }).click();
    await page.getByRole('button', { name: 'Play instrumental version', exact: true }).click();
    await expect.poll(async () => (await youtube(page))?.videoId).toBe(instrumental.videoId);
    const back = page.getByRole('button', { name: 'Play vocal version', exact: true });
    await expect(back).toBeVisible();
    await back.focus(); await page.keyboard.press('Enter');
    await expect.poll(async () => (await youtube(page))?.videoId).toBe(vocal.videoId);
    await expect(page.getByRole('button', { name: 'Play instrumental version', exact: true })).toBeVisible();
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

test('Stream-safe pauses a flagged playing song and Play selects an allowed song', async ({ page }, info) => {
  await stubYouTube(page);
  await page.route(/\/music-catalogue\.json(?:\?|$)/, route => route.fulfill({ json: { songs: [flagged, vocal] } }));
  await page.goto('/music?view=library');
  await page.locator(`.music-library-row[data-song-id="${flagged.videoId}"] .music-song-row-main`).click();
  await expect.poll(async () => (await youtube(page))?.state).toBe(1);
  const player = page.getByRole('region', { name: 'Player', exact: true });
  if (info.project.name === 'mobile') {
    await player.getByRole('button', { name: 'More player actions' }).click();
    await page.getByRole('checkbox', { name: 'Stream-safe', exact: true }).check();
    await page.keyboard.press('Escape');
  } else await player.getByRole('button', { name: 'Stream-safe: hide copyrighted songs' }).click();
  await expect.poll(async () => (await youtube(page))?.state).toBe(2);
  await expect(page.locator(`.music-library-row[data-song-id="${flagged.videoId}"]`)).toHaveCount(0);
  await player.getByRole('button', { name: 'Play', exact: true }).click();
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
