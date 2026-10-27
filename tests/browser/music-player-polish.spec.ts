import { chooseMusicView, openMusicMenu } from './music-navigation-helpers';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { stubMonsterSiren } from './monster-siren-stub';
import { playAllSongs, stubYouTube, youtube } from './youtube-stub';

/*
 * The music player after the maintainer's iPhone test (2026-10-14):
 *
 * - "some of the music doesn't have cover art in the background player": the lock screen
 *   (navigator.mediaSession) gets exactly one picture, the best there is -- Monster Siren's own
 *   JPEG cover as this site serves it (pages/api/music-cover: its CDN refuses requests from these
 *   pages), else the site's cover, else the site's icon -- absolute, encoded, with its size and
 *   type, and never a lesser one first while the cover is being asked for; and the artist Monster
 *   Siren credits when the catalogue has none. The player bar shows the same fallback cover.
 * - "it should be only one click to favourite a song": every song surface has a heart that
 *   toggles the favourite in one press, at every width, outside any menu.
 * - "the small player in the corner ... needs also some rework": at 390px its five controls
 *   share one row, nothing wraps or overflows, and opening it moves nothing on the page.
 *
 * The bar's More holding no Shuffle or Repeat is checked in music-navigation.spec.ts.
 */

interface CatalogueRow { videoId?: string; cid?: string; title: string; altTitle?: string; artist?: string; album?: string; cover?: string }

const bar = (page: Page) => page.getByRole('region', { name: 'Player', exact: true });
const favourites = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('musicFavorites') ?? '[]') as string[]);
const audioPlaying = (page: Page) => page.evaluate(() => {
  const el = document.querySelector<HTMLAudioElement>('audio[data-music-audio]');
  return Boolean(el && !el.paused);
});
const artwork = (page: Page) => page.evaluate(() => (navigator.mediaSession?.metadata?.artwork ?? []).map(({ src, sizes, type }) => ({ src, sizes: sizes ?? '', type: type ?? '' })));

const MSR_COVER = 'https://web.hycdn.cn/siren/pic/20261010/0123456789abcdef0123456789abcdef.jpg';
/** A 1x1 PNG: what the stubbed cover address serves, so no check reaches Monster Siren. */
const PIXEL = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');

/** Every picture the page hands the lock screen, in order (the metadata setter, recorded). */
async function recordArtwork(page: Page) {
  await page.addInitScript(() => {
    const seen: string[][] = [];
    (window as unknown as { __artworks: string[][] }).__artworks = seen;
    const descriptor = Object.getOwnPropertyDescriptor(MediaSession.prototype, 'metadata');
    if (!descriptor?.set) return;
    Object.defineProperty(MediaSession.prototype, 'metadata', {
      ...descriptor,
      set(this: MediaSession, value: MediaMetadata | null) {
        if (value) seen.push(value.artwork.map(image => image.src));
        descriptor.set!.call(this, value);
      },
    });
  });
}
const artworks = (page: Page) => page.evaluate(() => (window as unknown as { __artworks: string[][] }).__artworks);

/** The bundled catalogue's first song with no YouTube upload, served as `change` makes it: a
 *  song the albums have not credited or covered yet. */
async function msrSongWithout(page: Page, change: (row: CatalogueRow) => CatalogueRow): Promise<CatalogueRow> {
  const songs = (await (await page.request.get('/music-catalogue.json')).json()).songs as CatalogueRow[];
  const target = songs.find(row => row.cid && !row.videoId)!;
  expect(target, 'the bundled catalogue lists a song with no YouTube upload').toBeTruthy();
  await page.route('**/music-catalogue.json', async (route) => {
    const response = await route.fetch();
    const body = await response.json() as { songs: CatalogueRow[] };
    body.songs = body.songs.map(row => (row.cid === target.cid && !row.videoId ? change(row) : row));
    await route.fulfill({ response, json: body });
  });
  return target;
}

async function playFromLibrary(page: Page, song: CatalogueRow) {
  await page.goto('/music?view=library');
  await page.getByRole('searchbox', { name: 'Search all songs' }).fill(song.altTitle || song.title);
  const row = page.locator(`.music-all-songs-list [data-song-id="msr:${song.cid}"]`);
  await expect(row).toBeVisible();
  await row.locator('.music-song-row-main').click();
  await expect.poll(() => audioPlaying(page)).toBe(true);
}

/** Exactly one picture, absolute https, printable ASCII only (a Chinese file name
 *  percent-encoded), with its size and type, and never on Monster Siren's CDN (it refuses
 *  requests from these pages). */
function expectOnePicture(entries: { src: string; sizes: string; type: string }[]) {
  expect(entries).toHaveLength(1);
  const [entry] = entries;
  expect(entry.src, 'absolute and encoded').toMatch(/^https?:\/\/[\x21-\x7e]+$/);
  expect(entry.src).not.toContain('hycdn.cn');
  expect(entry.sizes, `${entry.src} has a size`).toMatch(/^\d+x\d+$/);
  expect(entry.type, `${entry.src} has a type`).toMatch(/^image\/(jpeg|png|webp)$/);
}

test.describe('lock screen artwork', () => {
  test.beforeEach(({}, info) => {
    test.skip(info.project.name !== 'desktop', 'the Media Session is the same at every width');
    test.setTimeout(90_000);
  });

  test('a song with no catalogue cover or artist gets Monster Siren\'s cover, served from this site, and its credit, on the lock screen and in the player', async ({ page }) => {
    await recordArtwork(page);
    await stubYouTube(page);
    await stubMonsterSiren(page);
    const asked: string[] = [];
    await page.route('**/api/music-art/**', (route) => {
      asked.push(new URL(route.request().url()).pathname.split('/').pop()!);
      return route.fulfill({ json: { cover: MSR_COVER, artists: ['塞壬唱片-MSR', 'Test Vocalist'], albumName: 'Test Album OST' } });
    });
    const covers: string[] = [];
    await page.route('**/api/music-cover/**', (route) => {
      covers.push(route.request().url());
      return route.fulfill({ contentType: 'image/png', body: PIXEL });
    });
    // Monster Siren's CDN is never asked from the page.
    const cdn: string[] = [];
    await page.route('https://web.hycdn.cn/**', (route) => { cdn.push(route.request().url()); return route.fulfill({ status: 403, body: '' }); });
    const song = await msrSongWithout(page, row => ({ ...row, cover: undefined, artist: undefined }));
    await playFromLibrary(page, song);

    const ours = new URL(`/api/music-cover/${song.cid}`, page.url()).href;
    await expect.poll(async () => (await artwork(page))[0]?.src, { message: 'Monster Siren\'s cover, from this site' }).toBe(ours);
    const entries = await artwork(page);
    expectOnePicture(entries);
    expect(entries[0]).toEqual({ src: ours, sizes: '500x500', type: 'image/jpeg' });
    // Set once: never the site's icon first and the cover after.
    expect((await artworks(page)).flat().filter(src => src.includes('/essential-icons/'))).toEqual([]);
    expect(asked).toEqual([song.cid]);
    // The label's own credit is said in English.
    expect(await page.evaluate(() => navigator.mediaSession.metadata?.artist)).toBe('Monster Siren Records, Test Vocalist');

    // The bar says the same credit where the catalogue has none (its cover is the page's own).
    await expect(bar(page).locator('.music-transport-song-sub')).toHaveText('Monster Siren Records, Test Vocalist');
    // The corner player on another page has only the catalogue: it shows Monster Siren's cover, from this site.
    await page.evaluate(() => (window as unknown as { next: { router: { push: (url: string) => Promise<boolean> } } }).next.router.push('/operators'));
    await page.waitForURL('**/operators');
    await page.getByRole('button', { name: 'Expand player' }).click();
    const widget = page.locator('[data-music-widget]');
    await expect(widget.locator('.music-widget-cover img')).toHaveAttribute('src', `/api/music-cover/${song.cid}`);
    await expect(widget.locator('.music-widget-artist')).toHaveText('Monster Siren Records, Test Vocalist');
    expect(covers.length).toBeGreaterThan(0);
    expect(cdn, 'Monster Siren\'s CDN refuses requests from these pages').toEqual([]);
  });

  test('while Monster Siren\'s cover is being asked for, the lock screen waits for it rather than show the site\'s cover first', async ({ page }) => {
    await recordArtwork(page);
    await stubYouTube(page);
    await stubMonsterSiren(page);
    await page.route('**/api/music-art/**', async (route) => {
      // Slower than the song's start, well within the lock screen's wait (ARTWORK_WAIT_MS, 1.5 s).
      await new Promise(resolve => setTimeout(resolve, 400));
      return route.fulfill({ json: { cover: MSR_COVER, artists: [], albumName: null } });
    });
    await page.route('**/api/music-cover/**', (route) => route.fulfill({ contentType: 'image/png', body: PIXEL }));
    const song = await msrSongWithout(page, row => ({ ...row, cover: '/album-covers/昨日海OST_cover.webp' }));
    await playFromLibrary(page, song);

    await expect.poll(async () => (await artwork(page))[0]?.src ?? '').toContain(`/api/music-cover/${song.cid}`);
    const pictures = (await artworks(page)).filter(list => list.length);
    expect(pictures[0], 'the first picture handed over is the cover asked for').toEqual([new URL(`/api/music-cover/${song.cid}`, page.url()).href]);
    expect(pictures.flat().some(src => src.includes('/album-covers/') || src.includes('/essential-icons/'))).toBe(false);
  });

  test('when Monster Siren cannot say, the one picture is the site\'s cover, its Chinese name encoded, and never the icon', async ({ page }) => {
    await recordArtwork(page);
    await stubYouTube(page);
    await stubMonsterSiren(page);
    await page.route('**/api/music-art/**', (route) => route.fulfill({ status: 502, json: { error: 'unavailable' } }));
    const song = await msrSongWithout(page, row => ({ ...row, artist: undefined, cover: '/album-covers/昨日海OST_cover.webp' }));
    await playFromLibrary(page, song);

    await expect.poll(async () => (await artwork(page)).length).toBe(1);
    const entries = await artwork(page);
    expectOnePicture(entries);
    expect(entries[0].src).toContain(`/album-covers/${encodeURIComponent('昨日海OST_cover.webp')}`);
    expect(entries[0]).toMatchObject({ sizes: '500x500', type: 'image/webp' });
    expect((await artworks(page)).flat().filter(src => src.includes('/essential-icons/'))).toEqual([]);
    expect(await page.evaluate(() => navigator.mediaSession.metadata?.artist)).toBe('Monster Siren Records');
  });
});

/** Presses a heart once and checks the favourite flipped and its tooltip says what the next press
 *  does; presses it again to put it back. */
async function oneClick(page: Page, heart: Locator, id: string, where: string) {
  await expect(heart, `${where}: the heart is shown, outside any menu`).toBeVisible();
  const before = (await favourites(page)).includes(id);
  await expect(heart, where).toHaveAttribute('aria-pressed', String(before));
  await heart.click();
  await expect.poll(async () => (await favourites(page)).includes(id), { message: `${where}: one press favourites` }).toBe(!before);
  await expect(heart, where).toHaveAttribute('aria-pressed', String(!before));
  const tip = await heart.evaluate(el => el.getAttribute('data-tip') ?? el.getAttribute('title'));
  expect(tip, `${where}: the tooltip says what a press does`).toBe(before ? 'Favourite' : 'Unfavourite');
  await heart.click();
  await expect.poll(async () => (await favourites(page)).includes(id), { message: `${where}: one press takes it back` }).toBe(before);
}

const rowHeart = (row: Locator) => row.getByRole('button', { name: /^Favourite: / });

test('every song surface favourites in one press: the rows, the bar and the corner player', async ({ page }) => {
  test.setTimeout(120_000);
  const mobile = page.viewportSize()!.width <= 720;
  await stubYouTube(page);
  await page.goto('/music?view=queue');
  await playAllSongs(page);

  // The Queue.
  const queueRow = page.locator('.music-queue-list .music-song-row').nth(1);
  await oneClick(page, rowHeart(queueRow), (await queueRow.getAttribute('data-song-id'))!, 'queue row');
  if (mobile) {
    // A phone's row keeps its More for the rest; Favourite is no longer listed in it.
    await queueRow.getByRole('button', { name: /^More actions for / }).click();
    const menu = page.getByRole('dialog', { name: 'Song actions', exact: true });
    await expect(menu.getByRole('button', { name: 'Add to playlist', exact: true })).toBeVisible();
    await expect(menu.getByRole('button', { name: /favourite/i })).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);
  }

  // The bar (beside the song on a phone, in the left group on a wide bar).
  const playing = (await youtube(page))!.videoId;
  await oneClick(page, bar(page).getByRole('button', { name: 'Favourite', exact: true }), playing, 'player bar');

  // The Library.
  await chooseMusicView(page, /^Library/);
  const libraryRow = page.locator('.music-all-songs-list .music-song-row').nth(2);
  await oneClick(page, rowHeart(libraryRow), (await libraryRow.getAttribute('data-song-id'))!, 'library row');

  // Now playing's Up next.
  await chooseMusicView(page, 'Now playing');
  const upNext = page.locator('.music-up-next-list .music-song-row').first();
  await oneClick(page, rowHeart(upNext), (await upNext.getAttribute('data-song-id'))!, 'up next row');

  // A saved playlist.
  await openMusicMenu(page);
  await page.getByRole('button', { name: 'Playlists', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Music playlists', exact: true });
  await dialog.getByRole('textbox', { name: 'New playlist name' }).fill('Heart check');
  await dialog.getByRole('button', { name: 'Save queue', exact: true }).click();
  const playlistRow = page.locator('.music-playlist-tracks .music-song-row').nth(1);
  await oneClick(page, rowHeart(playlistRow), (await playlistRow.getAttribute('data-song-id'))!, 'playlist row');
  await dialog.getByRole('button', { name: 'Close Music playlists', exact: true }).click();

  // Discover.
  await page.goto('/music/discover');
  await page.getByRole('searchbox', { name: /Search songs, characters/ }).fill('a');
  const discoverRow = page.locator('.music-discover-song-list .music-song-row').nth(1);
  await oneClick(page, rowHeart(discoverRow), (await discoverRow.getAttribute('data-song-id'))!, 'discover row');

  // The corner player on any other page.
  await page.goto('/operators');
  await page.getByRole('button', { name: 'Expand player' }).click();
  const widget = page.locator('[data-music-widget]');
  await oneClick(page, widget.getByRole('button', { name: 'Favourite', exact: true }), playing, 'corner player');
});

test('the corner player at 390px: one row of named controls, nothing wraps or overflows, nothing on the page moves', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await stubYouTube(page);
  await page.goto('/operators');
  const height = () => page.evaluate(() => document.documentElement.scrollHeight);
  // The roster lays out over a moment after load: read the page's length once it has settled.
  let before = -1;
  await expect.poll(async () => {
    const last = before;
    before = await height();
    await page.waitForTimeout(300);
    return before === last && before === await height();
  }, { message: 'the page settles' }).toBe(true);
  await page.getByRole('button', { name: 'Expand player' }).click();
  const widget = page.locator('[data-music-widget]');
  const close = widget.getByRole('button', { name: 'Collapse player', exact: true });
  await expect(close).toBeVisible();

  const controls = widget.locator('.music-controls');
  const names = await controls.locator('button, a').evaluateAll(els => els.map(el => el.getAttribute('aria-label')));
  expect(names).toEqual(['Favourite', 'Previous track', expect.stringMatching(/^(Play|Pause|Starting…)$/), 'Next track', 'Queue']);
  const boxes = await controls.locator('button, a').evaluateAll(els => els.map(el => el.getBoundingClientRect().toJSON() as DOMRect));
  const centre = boxes[0].y + boxes[0].height / 2;
  for (const [i, box] of boxes.entries()) {
    expect(Math.abs(box.y + box.height / 2 - centre), `${names[i]} is on the one row`).toBeLessThanOrEqual(1);
    expect(Math.min(box.width, box.height), `${names[i]} is a 40px target or more`).toBeGreaterThanOrEqual(40);
    if (i) expect(box.x, `${names[i]} is right of ${names[i - 1]}`).toBeGreaterThanOrEqual(boxes[i - 1].x + boxes[i - 1].width);
  }
  const shell = (await widget.boundingBox())!;
  expect(shell.x).toBeGreaterThanOrEqual(0);
  expect(shell.x + shell.width).toBeLessThanOrEqual(390);
  for (const box of boxes) expect(box.x + box.width, 'inside the card').toBeLessThanOrEqual(shell.x + shell.width);
  // The × is the card's top-right corner, above the song.
  const x = (await close.boundingBox())!;
  const song = (await widget.locator('.music-widget-song').boundingBox())!;
  expect(x.x + x.width).toBeLessThanOrEqual(shell.x + shell.width);
  expect(x.x).toBeGreaterThanOrEqual(song.x + song.width);
  expect(x.y).toBeLessThan(song.y + song.height / 2);
  // No horizontal overflow anywhere: the card, its rows, the page.
  const overflow = await widget.evaluate(el => [el, ...el.querySelectorAll('.music-body, .music-widget-song, .music-seek-row, .music-controls')]
    .filter(node => node.scrollWidth > node.clientWidth + 1).map(node => node.className));
  expect(overflow).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  // The title is one line, cut with an ellipsis rather than wrapped or scrolled.
  expect(await widget.locator('.music-widget-title').evaluate(el => [getComputedStyle(el).whiteSpace, getComputedStyle(el).textOverflow])).toEqual(['nowrap', 'ellipsis']);
  // Fixed in the corner: opening it does not change the page's length.
  expect(await height()).toBe(before);
});

test('the phone bar: the heart beside the song, and More, Previous, Play, Next, Shuffle and Repeat on one row from 360 to 390', async ({ page }) => {
  test.skip(test.info().project.name !== 'mobile', 'the phone bar (720px and under, on a touch screen)');
  await stubYouTube(page);
  await page.goto('/music?view=library');
  await page.locator('.music-all-songs-list .music-song-row-main').first().click();
  await expect.poll(async () => (await youtube(page))?.state).toBe(1);
  await chooseMusicView(page, 'Now playing');
  await expect(bar(page).getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
  for (const width of [360, 375, 390]) {
    await page.setViewportSize({ width, height: 844 });
    const order: (string | RegExp)[] = ['More player actions', 'Previous track', 'Pause', 'Next track', 'Shuffle', /^Repeat: /];
    const boxes: { x: number; y: number; width: number; height: number }[] = [];
    for (const name of order) boxes.push((await bar(page).getByRole('button', { name, exact: typeof name === 'string' }).boundingBox())!);
    const centre = boxes[2].y + boxes[2].height / 2;
    for (const [i, box] of boxes.entries()) {
      expect(Math.abs(box.y + box.height / 2 - centre), `${width}px: ${order[i]} is on Play's row`).toBeLessThanOrEqual(1);
      expect(Math.min(box.width, box.height), `${width}px: ${order[i]} is a 40px target or more`).toBeGreaterThanOrEqual(40);
      if (i) expect(box.x, `${width}px: ${order[i]} follows ${order[i - 1]}`).toBeGreaterThanOrEqual(boxes[i - 1].x + boxes[i - 1].width);
    }
    // Play stays centred in the row, and the row ends inside the screen.
    const row = (await bar(page).locator('.music-player-bottombar-controls').boundingBox())!;
    expect(Math.abs(boxes[2].x + boxes[2].width / 2 - (row.x + row.width / 2))).toBeLessThan(2);
    expect(boxes[5].x + boxes[5].width).toBeLessThanOrEqual(width);
    // The heart and Queue sit beside the song, above the row.
    const heart = (await bar(page).getByRole('button', { name: 'Favourite', exact: true }).boundingBox())!;
    const queue = (await bar(page).getByRole('link', { name: 'Queue', exact: true }).boundingBox())!;
    expect(heart.y + heart.height).toBeLessThanOrEqual(boxes[0].y);
    expect(Math.abs(heart.y - queue.y)).toBeLessThanOrEqual(1);
    expect(queue.x).toBeGreaterThanOrEqual(heart.x + heart.width);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  }
});
