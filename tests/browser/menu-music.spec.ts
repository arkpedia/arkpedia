import { test, expect } from '@playwright/test';
import { stubYouTube } from './youtube-stub';

test('Endfield is searchable within albums and artists as well as songs', async ({page}) => {
  await stubYouTube(page);
  await page.addInitScript(() => localStorage.setItem('musicIncludeEndfield','true'));
  await page.goto('/music/discover?browse=albums');
  await page.getByRole('searchbox',{name:'Filter albums'}).fill('endfield');
  const albums=page.locator('#discover-albums .music-discover-album-tile');
  await expect(albums.first()).toBeVisible();
  const expected=await page.evaluate(() => JSON.parse(document.getElementById('__NEXT_DATA__')!.textContent!).props.pageProps.albums.filter((a:any)=>a.game==='endfield').map((a:any)=>a.albumAltName));
  await expect.poll(()=>albums.locator('.music-discover-album-tile-name').allTextContents()).toEqual(expected);
  await page.goto('/music/discover?browse=artists');
  await page.getByRole('searchbox',{name:'Filter artists'}).fill('endfield');
  await expect(page.locator('#discover-artists .music-discover-artist-card').first()).toBeVisible();
  await page.getByRole('searchbox',{name:'Filter artists'}).fill('endfield zzzzz');
  await expect(page.locator('#discover-artists .music-discover-artist-card')).toHaveCount(0);
});

test('album and artist filters reveal hidden Endfield matches', async ({page}) => {
  await stubYouTube(page);
  await page.goto('/music/discover?browse=albums');
  await page.getByRole('searchbox',{name:'Filter albums'}).fill('endfield');
  await expect(page.locator('.music-hidden-endfield-hint')).toContainText('Endfield albums');
  await page.getByRole('button',{name:'Include Endfield music'}).click();
  await expect(page.locator('#discover-albums .music-discover-album-tile').first()).toBeVisible();
  await page.evaluate(() => localStorage.removeItem('musicIncludeEndfield'));
  await page.goto('/music/discover?browse=artists');
  await page.getByRole('searchbox',{name:'Filter artists'}).fill('endfield');
  await expect(page.getByRole('button',{name:'Include Endfield music'})).toBeVisible();
  await page.getByRole('button',{name:'Include Endfield music'}).click();
  await expect(page.locator('#discover-artists .music-discover-artist-card').first()).toBeVisible();
});
