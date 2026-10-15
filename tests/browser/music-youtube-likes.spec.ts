import { expect, test } from '@playwright/test';
import albums from '../../data/albums.json';
import { songsFromAlbums, type RawAlbum } from '../../lib/music/albumsData';
import { stubYouTube, youtube } from './youtube-stub';

const songs = songsFromAlbums(albums as RawAlbum[]);
const album = (albums as RawAlbum[]).find(a => {
  const rows = songs.filter(s => s.albumId === a.albumId);
  return rows.length >= 6 && rows.length <= 30 && rows.every((s, i) => rows.findIndex(t => t.videoId === s.videoId) === i);
})!;
const albumSongs = songs.filter(s => s.albumId === album.albumId);
const chartSongs = [...new Map([...songs.filter(s => s.albumId !== album.albumId).slice(0, 40), ...albumSongs.slice(0, 4)].map(s => [s.videoId, s])).values()];
const likes = Object.fromEntries(chartSongs.map((s, i) => [s.videoId, i === chartSongs.length - 1 ? 0 : (i + 1) * 100]));
const chartIds = chartSongs.map(s => s.videoId).sort((a, b) => likes[b] - likes[a]);

test.beforeEach(async ({ page }) => {
  await page.route('**/api/music/youtube-likes', route => route.fulfill({ json: { updatedAt: new Date().toISOString(), likes } }));
});

test('Discover matches the album shelves, expands its ranked grid, and plays in one press', async ({ page }, info) => {
  await stubYouTube(page);
  await page.goto('/music/discover');
  const section = page.getByRole('region', { name: 'Most liked on YouTube', exact: true });
  const tiles = section.locator('.music-discover-album-tile');
  await expect(tiles).toHaveCount(24);
  await expect.poll(() => tiles.evaluateAll(rows => rows.map(r => r.getAttribute('data-song-id')))).toEqual(chartIds.slice(0, 24));
  await expect(tiles.first()).toContainText(`${likes[chartIds[0]].toLocaleString('en-US')} likes`);
  const coverSize = (selector: string) => page.locator(selector).first().evaluate(el => {
    const box = el.getBoundingClientRect(); return [Math.round(box.width), Math.round(box.height)];
  });
  expect(await coverSize('#discover-likes .music-discover-album-tile-cover')).toEqual(await coverSize('#discover-albums .music-discover-album-tile-cover'));
  await expect(section.getByRole('button', { name: 'Scroll on through Songs ordered by YouTube likes' })).toBeVisible();
  const rail = section.getByRole('slider', { name: 'Scroll through Songs ordered by YouTube likes' });
  await expect(rail).toBeVisible();
  await rail.focus();
  await rail.press('End');
  await expect.poll(() => page.locator('#discover-likes .scroll-row').evaluate(el => el.scrollLeft)).toBeGreaterThan(100);
  await rail.press('Home');
  await tiles.first().click();
  await expect(tiles.first()).toHaveAttribute('aria-current', 'true');
  await expect.poll(async () => (await youtube(page))?.videoId).toBe(chartIds[0]);
  await expect.poll(async () => (await youtube(page))?.state).toBe(1);

  await section.getByRole('button', { name: 'Show all', exact: true }).click();
  await expect(page).toHaveURL(/[?&]browse=likes\b/);
  await expect(tiles).toHaveCount(chartIds.length);
  await expect(section.getByRole('button', { name: 'Show less' })).toHaveAttribute('aria-expanded', 'true');
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: `.cache/qa/music-likes/${info.project.name}-expanded.png`, fullPage: true });
  await page.reload();
  await expect(tiles).toHaveCount(chartIds.length);
  await section.getByRole('button', { name: 'Show less', exact: true }).click();
  await expect(tiles).toHaveCount(24);
  await page.screenshot({ path: `.cache/qa/music-likes/${info.project.name}-shelf.png`, fullPage: true });
  await page.getByRole('button', { name: 'Switch to light mode' }).click();
  await section.scrollIntoViewIfNeeded();
  await page.screenshot({ path: `.cache/qa/music-likes/${info.project.name}-light-viewport.png` });
});

test('likes ordering survives reload and keeps zero before unknown songs and ordinary row actions', async ({ page }) => {
  await stubYouTube(page);
  await page.goto(`/music/discover?facet=album%3A${album.albumId}`);
  const rows = page.locator('.music-discover-song-list .music-song-row');
  await expect(rows).toHaveCount(albumSongs.length);
  const original = await rows.evaluateAll(els => els.map(el => el.getAttribute('data-song-id')!));
  const order = page.getByRole('combobox', { name: 'Order songs' });
  await expect(order.locator('option[value="likes"]')).toBeEnabled();
  await order.selectOption('likes');
  const expected = [...original].sort((a, b) => (likes[b] ?? -1) - (likes[a] ?? -1));
  await expect.poll(() => rows.evaluateAll(els => els.map(el => el.getAttribute('data-song-id')!))).toEqual(expected);
  await expect(page).toHaveURL(/[?&]sort=likes\b/);
  await expect(rows.first()).toContainText('YouTube likes');
  const zero = page.locator(`.music-discover-song-list [data-song-id="${albumSongs[3].videoId}"]`);
  await expect(zero).toContainText('0 YouTube likes');
  await page.reload();
  await expect(order).toHaveValue('likes');
  await expect.poll(() => rows.evaluateAll(els => els.map(el => el.getAttribute('data-song-id')!))).toEqual(expected);
  await rows.first().getByRole('button', { name: /^Favourite:/ }).click();
  await expect(rows.first().getByRole('button', { name: /^Favourite:/ })).toHaveAttribute('aria-pressed', 'true');
  await rows.first().locator('.music-song-row-main').click();
  await expect(rows.first()).toHaveClass(/\bactive\b/);
  await order.selectOption('');
  await expect.poll(() => rows.evaluateAll(els => els.map(el => el.getAttribute('data-song-id')!))).toEqual(original);
});

test('API failure and empty counts leave browsing available without a fabricated chart', async ({ page }) => {
  await page.route('**/api/music/youtube-likes', route => route.fulfill({ status: 503, json: { error: 'Unavailable' } }));
  await page.goto('/music/discover');
  await expect(page.getByRole('status', { name: '' }).filter({ hasText: 'YouTube likes are temporarily unavailable.' })).toBeVisible();
  await expect(page.locator('#discover-likes .music-discover-album-tile')).toHaveCount(0);
  await page.getByRole('searchbox', { name: /Search songs, characters/ }).fill(album.albumAltName || album.albumName);
  await expect(page.locator('.music-discover-song-list .music-song-row').first()).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Order songs' }).locator('option[value="likes"]')).toHaveAttribute('disabled', '');
  await page.route('**/api/music/youtube-likes', route => route.fulfill({ json: { updatedAt: new Date().toISOString(), likes: {} } }));
  await page.goto('/music/discover');
  await expect(page.getByText('YouTube likes are temporarily unavailable.', { exact: true })).toBeVisible();
});
