import { expect, test, type Locator, type Page } from '@playwright/test';
import { stubYouTube, youtube } from './youtube-stub';

/*
 * The music pages' one song row (components/music/SongRow.tsx, 2026-10-13). Every list -- a
 * Discover search with a song not on YouTube yet, the Library, Favourites, the Queue and its
 * autoplay, Up next and a saved playlist -- draws the same row: one height, the album art at one
 * size and one inset from the row's edge, whatever the variant (playing, queued, unavailable,
 * draggable). Before, five lists drew five rows, and Discover's unplayable songs had their art
 * flush against the edge. Every action in a row has an accessible name, and a desktop icon action
 * shows its name on hover and on keyboard focus.
 */

interface Metrics { view: string; variant: string; height: number; art: number; artHeight: number; inset: number; album: number | null }

async function measure(rows: Locator, view: string): Promise<Metrics[]> {
  return rows.evaluateAll((elements, name) => elements.filter(el => el.getBoundingClientRect().height > 0).map(el => {
    const row = el.getBoundingClientRect();
    const art = el.querySelector('.music-song-row-art')!.getBoundingClientRect();
    const variant = ['active', 'current', 'queued', 'unavailable', 'draggable', 'disabled'].filter(c => el.classList.contains(c)).join('+') || 'plain';
    // The album's own column (wide rows): where it shows, it starts at one offset down a list.
    const album = el.querySelector('.music-song-row-album');
    const albumBox = album && getComputedStyle(album).display !== 'none' ? album.getBoundingClientRect() : null;
    return { view: name, variant, height: Math.round(row.height), art: Math.round(art.width), artHeight: Math.round(art.height), inset: Math.round(art.left - row.left),
      album: albumBox ? Math.round(albumBox.left - row.left) : null };
  }), view);
}

/** Every button and link inside the rows has a name a screen reader can read. */
async function unnamedControls(rows: Locator): Promise<string[]> {
  return rows.evaluateAll(elements => elements.flatMap(row => [...row.querySelectorAll('button, a')]
    .filter(el => (el as HTMLElement).getBoundingClientRect().height > 0)
    .filter(el => !(el.getAttribute('aria-label') ?? el.textContent ?? '').trim())
    .map(el => `${row.getAttribute('data-song-id')}: ${el.outerHTML.slice(0, 80)}`)));
}

const rowsIn = (page: Page, scope: string) => page.locator(`${scope} .music-song-row`);

test('every music list draws the same song row, and its actions are named', async ({ page }) => {
  test.setTimeout(90_000);
  await stubYouTube(page);
  const all: Metrics[] = [];
  const unnamed: string[] = [];
  const collect = async (rows: Locator, view: string) => {
    await expect(rows.first()).toBeVisible();
    all.push(...await measure(rows, view));
    unnamed.push(...await unnamedControls(rows));
  };

  // Discover: a search that lists a song with no YouTube upload yet beside playable ones.
  await page.goto('/music/discover');
  const pending = await page.evaluate(() => (window as unknown as { __NEXT_DATA__: { props: { pageProps: { pendingSongs: { title: string; albumName: string }[] } } } })
    .__NEXT_DATA__.props.pageProps.pendingSongs[0]);
  expect(pending, 'the bundled albums have a song with no YouTube upload').toBeTruthy();
  await page.getByRole('searchbox', { name: /Search songs, characters/ }).fill(pending.albumName);
  await expect(page.locator('.music-discover-song-list .music-song-row.unavailable').first()).toBeVisible();
  await collect(rowsIn(page, '.music-discover-song-list'), 'discover');
  expect(all.some(row => row.view === 'discover' && row.variant.includes('unavailable'))).toBe(true);
  // The unplayable song links to Monster Siren, named with where it goes.
  await expect(page.locator('.music-song-row.unavailable .music-song-row-main').first()).toHaveAttribute('href', /monster-siren\.hypergryph\.com\/music\//);
  await expect(page.locator('.music-song-row.unavailable .music-song-row-main').first()).toHaveAttribute('aria-label', /Not on YouTube yet/);

  // Library: play one song, queue two more, favourite one.
  await page.goto('/music?view=library');
  const library = rowsIn(page, '.music-all-songs-list');
  await expect(library.nth(3)).toBeVisible();
  const [first, second, third] = await Promise.all([0, 1, 2].map(i => library.nth(i).getAttribute('data-song-id')));
  await library.nth(0).locator('.music-song-row-main').click();
  await expect.poll(async () => (await youtube(page))?.state).toBe(1);
  const mobile = test.info().project.name === 'mobile';
  const act = async (id: string, action: 'Play next' | 'Add to queue' | 'Favourite') => {
    const row = page.locator(`.music-all-songs-list [data-song-id="${id}"]`);
    if (mobile) {
      await row.getByRole('button', { name: /^More actions for / }).click();
      await page.getByRole('dialog', { name: 'Song actions', exact: true }).getByRole('button', { name: action, exact: true }).click();
    } else await row.getByRole('button', { name: new RegExp(`^${action}: `) }).click();
  };
  await act(second!, 'Add to queue');
  await act(third!, 'Play next');
  await act(third!, 'Favourite');
  await expect(page.locator(`.music-all-songs-list [data-song-id="${second}"]`)).toHaveClass(/\bqueued\b/);
  await collect(library, 'library');
  expect(all.some(row => row.view === 'library' && row.variant.includes('active'))).toBe(true);
  await page.getByRole('radio', { name: 'Favourites', exact: true }).or(page.getByRole('button', { name: 'Favourites', exact: true })).first().click();
  await collect(library, 'favourites');

  // Queue: your queue (the song playing, then the two queued) and the autoplay section.
  await page.getByRole('navigation', { name: 'Music' }).getByRole('link', { name: /^Queue/ }).click();
  const queue = rowsIn(page, '.music-queue-list');
  await expect(page.locator(`.music-queue-list [data-song-id="${first}"]`).first()).toHaveClass(/\bcurrent\b/);
  await page.getByRole('button', { name: /^Autoplay from library/ }).click();
  await expect(page.locator('.music-autoplay-list .music-song-row').first()).toBeVisible();
  await collect(queue, 'queue');
  expect(all.some(row => row.view === 'queue' && row.variant.includes('draggable'))).toBe(true);

  // Now playing's Up next.
  await page.getByRole('navigation', { name: 'Music' }).getByRole('link', { name: 'Now playing', exact: true }).click();
  await collect(rowsIn(page, '.music-up-next-list'), 'up next');

  // A saved playlist: save the queue, and its songs list as the same rows.
  await page.getByRole('button', { name: 'Playlists', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Music playlists', exact: true });
  await dialog.getByRole('textbox', { name: 'New playlist name' }).fill('Row check');
  await dialog.getByRole('button', { name: 'Save queue', exact: true }).click();
  await collect(rowsIn(page, '.music-playlist-tracks'), 'playlist');

  const views = new Set(all.map(row => row.view));
  expect([...views]).toEqual(['discover', 'library', 'favourites', 'queue', 'up next', 'playlist']);
  const base = all[0];
  for (const row of all) {
    const where = `${row.view} (${row.variant})`;
    expect(Math.abs(row.height - base.height), `${where} row height ${row.height} vs ${base.height}`).toBeLessThanOrEqual(1);
    expect(Math.abs(row.art - base.art), `${where} art ${row.art} vs ${base.art}`).toBeLessThanOrEqual(1);
    expect(row.artHeight, `${where} art is square`).toBe(row.art);
    expect(Math.abs(row.inset - base.inset), `${where} art inset ${row.inset} vs ${base.inset}`).toBeLessThanOrEqual(1);
  }
  for (const view of views) {
    const columns = [...new Set(all.filter(row => row.view === view && row.album !== null).map(row => row.album!))];
    expect(columns.length ? Math.max(...columns) - Math.min(...columns) : 0, `${view}: the album column starts at one x (${columns.join(', ')})`).toBeLessThanOrEqual(1);
  }
  expect(unnamed).toEqual([]);
});

test('a row\'s icon actions show their name on hover and on keyboard focus', async ({ page }) => {
  test.skip(test.info().project.name === 'mobile', 'a phone has one named More menu instead of icon actions');
  await stubYouTube(page);
  await page.goto('/music?view=library');
  const row = page.locator('.music-all-songs-list .music-song-row').nth(1);
  await expect(row).toBeVisible();
  const tip = (button: Locator) => button.evaluate(el => {
    const after = getComputedStyle(el, '::after');
    return { text: after.content.replace(/^"|"$/g, ''), visible: after.visibility === 'visible' };
  });
  const actions = row.locator('.music-song-desktop-actions > button');
  const names = await actions.evaluateAll(els => els.map(el => [el.getAttribute('aria-label'), el.getAttribute('data-tip')]));
  expect(names.map(([, label]) => label)).toEqual(['Play next', 'Add to queue', 'Favourite', 'Add to playlist']);
  for (const [name] of names) expect(name).toMatch(/: .+/);
  const addToQueue = row.getByRole('button', { name: /^Add to queue: / });
  expect(await tip(addToQueue)).toEqual({ text: 'Add to queue', visible: false });
  await addToQueue.hover();
  expect(await tip(addToQueue)).toEqual({ text: 'Add to queue', visible: true });
  await page.mouse.move(0, 0);
  // Keyboard: Tab from the song onto its first action.
  await row.locator('.music-song-row-main').focus();
  await page.keyboard.press('Tab');
  const playNext = row.getByRole('button', { name: /^Play next: / });
  await expect(playNext).toBeFocused();
  expect(await tip(playNext)).toEqual({ text: 'Play next', visible: true });
});
