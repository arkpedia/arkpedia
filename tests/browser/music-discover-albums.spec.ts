import { expect, test, type Page } from '@playwright/test';
import { stubYouTube, youtube } from './youtube-stub';

/*
 * Browse by album on /music/discover (2026-10-14). The site's co-owner asked for one, as Monster
 * Siren's own site lists its albums: a cover and a name for every album. Discover had Recently
 * added (twelve albums) and no way to reach the rest but a search.
 * - A row of covers after Recently added, starting where it stops, so the two never repeat.
 * - Show all (?browse=albums): every album in a grid, newest first or A–Z, its song count under
 *   its name, with a filter that reads its English and its own name.
 * - An album opens its songs in place, as Recently added's do, in the shared song row.
 */

interface BrowseAlbum { albumId: string; albumName: string; albumAltName: string; songCount: number; game?: string }
interface RecentAlbum { albumId: string; game?: string }

/** The page's props as the page draws them with Endfield music off, the default: its albums and
 *  songs are in the props, marked, and hidden (lib/music/discoverFilter.ts, music-endfield.spec). */
const pageProps = (page: Page) => page.evaluate(() => {
  const props = (window as unknown as { __NEXT_DATA__: { props: { pageProps: { albums: BrowseAlbum[]; recentAlbums: RecentAlbum[]; songs: { albumId: string; game?: string }[] } } } })
    .__NEXT_DATA__.props.pageProps;
  const arknights = <T extends { game?: string }>(list: T[]) => list.filter((item) => item.game !== 'endfield');
  return { albums: arknights(props.albums), recentAlbums: arknights(props.recentAlbums).slice(0, 12), songs: arknights(props.songs) };
});

const tileNames = (page: Page, scope: string) => page.locator(`${scope} .music-discover-album-tile-name`).allTextContents();

test('Browse by album: a row of covers after Recently added that does not repeat it', async ({ page }) => {
  await page.goto('/music/discover');
  const headings = await page.locator('.music-discover-section h2').allTextContents();
  expect(headings.slice(0, 4)).toEqual(['Recently added', 'Most liked on Arkpedia', 'Browse by album', 'Browse by character']);
  const { albums, recentAlbums } = await pageProps(page);
  expect(albums.length, 'every album with a song is listed').toBeGreaterThan(200);

  const tiles = page.locator('#discover-albums .music-discover-album-tile');
  await expect.poll(() => tiles.count()).toBe(24);
  const recent = new Set(recentAlbums.map((a) => a.albumId));
  const expected = albums.filter((a) => !recent.has(a.albumId)).slice(0, 24).map((a) => a.albumAltName);
  expect(await tileNames(page, '#discover-albums')).toEqual(expected);
  // Each tile is a square cover with its name under it, the size of Recently added's.
  const boxes = await page.locator('.music-discover-section').filter({ has: page.locator('h2', { hasText: /^(Recently added|Browse by album)$/ }) })
    .locator('.music-discover-album-tile-cover').evaluateAll((covers) => covers.slice(0, 6).map((c) => { const r = c.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; }));
  for (const [width, height] of boxes) { expect(width).toBe(boxes[0][0]); expect(height).toBe(width); }
  await expect(tiles.first().locator('img')).toHaveAttribute('src', /album-covers/);
  await expect(page.locator('#discover-albums .music-discover-album-tile-count')).toHaveCount(0);
});

test('Show all lists every album, newest first or A–Z, with a filter on both its names', async ({ page }) => {
  await page.goto('/music/discover');
  await page.locator('.music-discover-section', { has: page.locator('h2', { hasText: 'Browse by album' }) }).getByRole('button', { name: 'Show all' }).click();
  await expect(page).toHaveURL(/[?&]browse=albums\b/);
  const grid = page.locator('#discover-albums.music-discover-grid');
  await expect(grid).toBeVisible();
  const { albums } = await pageProps(page);
  await expect.poll(() => tileNames(page, '#discover-albums')).toEqual(albums.map((a) => a.albumAltName));
  const counts = await grid.locator('.music-discover-album-tile-count').allTextContents();
  expect(counts).toEqual(albums.map((a) => `${a.songCount} song${a.songCount === 1 ? '' : 's'}`));

  // A–Z, then back to newest.
  const order = page.getByRole('group', { name: 'Order albums' });
  await order.getByRole('button', { name: 'A–Z' }).click();
  await expect(order.getByRole('button', { name: 'A–Z' })).toHaveAttribute('aria-pressed', 'true');
  const byName = [...albums.map((a) => a.albumAltName)].sort((a, b) => a.localeCompare(b, 'en', { numeric: true, sensitivity: 'base' }));
  await expect.poll(() => tileNames(page, '#discover-albums')).toEqual(byName);
  await order.getByRole('button', { name: 'Newest' }).click();
  await expect.poll(async () => (await tileNames(page, '#discover-albums'))[0]).toBe(albums[0].albumAltName);

  // The filter reads the English name and the album's own.
  const filter = page.getByRole('searchbox', { name: 'Filter albums' });
  const translated = albums.find((a) => a.albumName !== a.albumAltName && /[㐀-鿿]/.test(a.albumName))!;
  expect(translated, 'an album with an English and a Chinese name').toBeTruthy();
  await filter.fill(translated.albumName);
  await expect.poll(() => tileNames(page, '#discover-albums')).toContain(translated.albumAltName);
  await filter.fill(translated.albumAltName.toUpperCase());
  await expect.poll(() => tileNames(page, '#discover-albums')).toContain(translated.albumAltName);
  await filter.fill('zzzz no such album');
  await expect(grid.locator('.music-discover-album-tile')).toHaveCount(0);
  await expect(page.getByText('No album matches “zzzz no such album”.')).toBeVisible();
  await filter.fill('');
  await expect.poll(() => grid.locator('.music-discover-album-tile').count()).toBe(albums.length);
});

test('an album opens its songs, which play, queue and favourite in one press', async ({ page }) => {
  await stubYouTube(page);
  await page.goto('/music/discover?browse=albums');
  const { albums, songs } = await pageProps(page);
  // An album of a few songs, all on YouTube (the stub plays them), its name its own, so one can
  // play while another is queued.
  const onYouTube = (id: string) => songs.filter((s) => s.albumId === id).length;
  const album = albums.find((a) => a.songCount >= 3 && a.songCount <= 20 && onYouTube(a.albumId) === a.songCount
    && albums.filter((b) => b.albumAltName === a.albumAltName).length === 1)!;
  expect(album, 'an album of three to twenty songs on YouTube').toBeTruthy();
  await page.getByRole('searchbox', { name: 'Filter albums' }).fill(album.albumAltName);
  await page.locator('#discover-albums .music-discover-album-tile', { has: page.locator('.music-discover-album-tile-name', { hasText: album.albumAltName }) }).first().click();
  await expect(page.locator('.music-album-overview').getByRole('heading', { name: album.albumAltName, exact: true })).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`[?&]facet=album%3A${album.albumId}\\b`));
  const rows = page.locator('.music-discover-song-list .music-song-row');
  await expect(rows).toHaveCount(album.songCount);

  const [first, second] = await Promise.all([0, 1].map((i) => rows.nth(i).getAttribute('data-song-id')));
  await rows.nth(0).locator('.music-song-row-main').click();
  await expect(rows.nth(0)).toHaveClass(/\bactive\b/);
  await expect.poll(async () => (await youtube(page))?.videoId).toBe(first);
  await expect.poll(async () => (await youtube(page))?.state).toBe(1);

  const row = page.locator(`.music-discover-song-list [data-song-id="${second}"]`);
  if (test.info().project.name === 'mobile') {
    await row.getByRole('button', { name: /^More actions for / }).click();
    await page.getByRole('dialog', { name: 'Song actions', exact: true }).getByRole('button', { name: 'Add to queue', exact: true }).click();
  } else await row.getByRole('button', { name: /^Add to queue: / }).click();
  await expect(row).toHaveClass(/\bqueued\b/);
  const heart = row.getByRole('button', { name: /^Favourite: / });
  await heart.click();
  await expect(heart).toHaveAttribute('aria-pressed', 'true');

  // Back to browse returns to the grid of albums.
  await page.getByRole('button', { name: /Back to browse/ }).click();
  await expect(page.locator('#discover-albums.music-discover-grid')).toBeVisible();
});

test('filtering the album grid from low on the page keeps the reader\'s place', async ({ page }) => {
  await page.goto('/music/discover?browse=albums');
  const filter = page.getByRole('searchbox', { name: 'Filter albums' });
  await expect.poll(() => page.locator('#discover-albums .music-discover-album-tile').count()).toBeGreaterThan(200);
  // The filter near the top of the screen, the grid running on far below it. Placed again until
  // it stays put: within about a second of loading, the page was seen back at the top now and
  // then before any input (cause not established), and that is not what this checks.
  const top = () => filter.evaluate((el) => Math.round(el.getBoundingClientRect().top));
  await expect.poll(async () => {
    const at = await top();
    if (Math.abs(at - 120) > 8) await page.evaluate(() => window.scrollTo(0, window.scrollY + document.querySelector('.music-discover-album-tools')!.getBoundingClientRect().top - 120));
    await page.waitForTimeout(250);
    return Math.abs(at - 120) <= 8 && at === await top();
  }).toBe(true);
  const before = await top();
  await filter.click();
  await page.keyboard.type('OST', { delay: 30 });
  await expect.poll(() => page.locator('#discover-albums .music-discover-album-tile').count()).toBeLessThan(200);
  await expect.poll(top).toBe(before);
  expect(await page.evaluate(() => window.scrollY), 'still low on the page').toBeGreaterThan(200);
});

test('the album grid fits a 390px phone, three covers across, and a desktop', async ({ page }, info) => {
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/music/discover?browse=albums');
    const tiles = page.locator('#discover-albums .music-discover-album-tile');
    await expect.poll(() => tiles.count()).toBeGreaterThan(200);
    const layout = await page.evaluate(() => {
      const tops = [...document.querySelectorAll('#discover-albums .music-discover-album-tile')].slice(0, 20).map((t) => Math.round(t.getBoundingClientRect().top));
      const widths = [...document.querySelectorAll('#discover-albums .music-discover-album-tile-cover')].slice(0, 20).map((c) => Math.round(c.getBoundingClientRect().width));
      // A phone's scrollbar overlays the page; a desktop browser narrowed to 390 (Linux CI) keeps a
      // classic one, 15px of the width, and fits two covers there instead.
      return { perRow: tops.filter((top) => top === tops[0]).length, widths, overflow: document.documentElement.scrollWidth - window.innerWidth,
        gutter: window.innerWidth - document.documentElement.clientWidth };
    });
    expect(layout.overflow, `${width}: no sideways scroll`).toBeLessThanOrEqual(0);
    // Three across is the phone's (the mobile project: a touch screen, an overlay scrollbar). A
    // desktop browser narrowed to 390 is not one: on CI it fit two, and two is fine there.
    if (width === 390 && info.project.name === 'mobile') expect(layout.perRow, 'three covers across a phone').toBe(3);
    else if (width === 390) expect(layout.perRow, 'two or more in a narrow desktop window').toBeGreaterThanOrEqual(2);
    else expect(layout.perRow).toBeGreaterThanOrEqual(6);
    expect(new Set(layout.widths).size, `${width}: every cover one size`).toBe(1);
    expect(layout.widths[0], `${width}: a cover the size of Recently added's or larger`).toBeGreaterThanOrEqual(104);
  }
});
