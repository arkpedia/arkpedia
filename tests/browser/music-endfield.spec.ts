import { chooseMusicView, openMusicMenu, openPlayerActions } from './music-navigation-helpers';
import { expect, test, type Page } from '@playwright/test';
import { stubYouTube } from './youtube-stub';
import { CROSSOVER_PAGE_MUSIC } from '../../lib/music/crossoverPageMusic';

/*
 * Arknights: Endfield's songs (data/endfield-albums.json) are in the player's catalogue, each row
 * marked game 'endfield', and every list that draws from it hides them until the reader ticks
 * "Endfield music" (lib/music/songFilter.ts): the Library, Discover, Play all and a saved
 * playlist's queue alike. The setting is kept in this browser, beside Playlists in the music
 * pages' header and in the player bar's ⋯ menu.
 */

interface Row { videoId?: string; cid?: string; title: string; altTitle?: string; album?: string; game?: string }
async function catalogue(page: Page): Promise<Row[]> {
  const songs: Row[] = (await (await page.request.get('/music-catalogue.json')).json()).songs;
  // The app supplements older published catalogues with reviewed crossover recordings.
  const ids = new Set(songs.map(idOf));
  return [...songs, ...CROSSOVER_PAGE_MUSIC.filter(entry => !ids.has(entry.song.id)).map(entry => entry.song)];
}
const idOf = (row: Row) => row.videoId || `msr:${row.cid}`;
const setting = (page: Page) => page.locator(test.info().project.name === 'mobile' ? '.music-phone-settings input[type=checkbox]' : '.page-header input[type=checkbox]');
async function changeSetting(page: Page, checked: boolean) { await openMusicMenu(page); await setting(page).setChecked(checked); }

test('Endfield music is off until ticked, then joins the Library, and the choice is kept', async ({ page }) => {
  await stubYouTube(page);
  const rows = await catalogue(page);
  const endfield = rows.filter((row) => row.game === 'endfield');
  expect(endfield.length).toBeGreaterThan(0);
  const all = new Set(rows.map(idOf));
  const arknights = new Set(rows.filter((row) => row.game !== 'endfield').map(idOf));
  const song = endfield[0];

  await page.goto('/music?view=library');
  await expect(setting(page)).not.toBeChecked();
  const heading = page.locator('#music-library-heading');
  await expect(heading).toContainText(`${arknights.size} songs`);
  await page.getByRole('searchbox', { name: 'Search all songs' }).fill(song.title);
  const row = page.locator(`.music-all-songs-list [data-song-id="${idOf(song)}"]`);
  await expect(row).toHaveCount(0);

  await changeSetting(page, true);
  await expect(heading).toContainText(`${all.size} songs`);
  await expect(row).toBeVisible();

  await page.reload();
  await expect(setting(page)).toBeChecked();
  await changeSetting(page, false);
  await expect(heading).toContainText(`${arknights.size} songs`);
  expect(await page.locator('body').evaluate((el) => el.scrollWidth <= window.innerWidth)).toBe(true);
});

test('Discover hides Endfield\'s songs and albums while the setting is off, and offers it on a search that finds them', async ({ page }) => {
  await stubYouTube(page);
  const song = (await catalogue(page)).find((row) => row.game === 'endfield')!;
  await page.goto(`/music/discover?q=${encodeURIComponent(song.title)}`);
  const hint = page.locator('.music-hidden-endfield-hint');
  await expect(hint).toContainText('hidden while Endfield music is off');
  const songRow = page.locator(`.music-discover-song-list [data-song-id="${idOf(song)}"]`);
  await expect(songRow).toHaveCount(0);
  await hint.getByRole('button', { name: 'Include Endfield music', exact: true }).click();
  await expect(songRow.first()).toBeVisible();
  await expect(setting(page)).toBeChecked();
  await expect(hint).toHaveCount(0);
});

test('a saved playlist plays its Endfield songs only once the setting is on, and the ⋯ menu holds it too', async ({ page }) => {
  await stubYouTube(page);
  const rows = await catalogue(page);
  const endfield = rows.find((row) => row.game === 'endfield')!;
  const arknights = rows.find((row) => row.game !== 'endfield' && row.videoId)!;
  await page.goto('/music?view=queue');
  await openMusicMenu(page);
  await page.getByRole('button', { name: 'Playlists', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Music playlists' });
  const file = { kind: 'arkpedia-music-playlists', version: 1, playlists: [{ id: 'mixed', name: 'Both games', tracks: [arknights.videoId, endfield.videoId] }] };
  await dialog.locator('input[type=file]').setInputFiles({ name: 'mixed.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(file)) });
  await dialog.getByRole('combobox', { name: 'Saved playlist' }).click();
  await page.getByRole('option', { name: 'Both games', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Play playlist', exact: true })).toBeEnabled();
  await dialog.getByRole('button', { name: 'Play playlist', exact: true }).click();
  await expect(dialog.getByRole('status')).toContainText('hidden by Stream-safe or the Endfield music setting');
  await dialog.getByRole('button', { name: 'Close Music playlists', exact: true }).click();
  await chooseMusicView(page, /^Queue/);
  const queueRow = (id: string) => page.locator(`.music-queue-row[data-song-id="${id}"]`);
  await expect(queueRow(arknights.videoId!)).toBeVisible();
  await expect(queueRow(endfield.videoId!)).toHaveCount(0);

  // The bar's ⋯ menu: the same setting, so the corner player on any page reaches it.
  await openPlayerActions(page);
  const menu = page.getByRole('dialog', { name: 'Player actions', exact: true });
  // Clicked, not checked: on a touch screen the background-play pop-up opens and takes the focus,
  // so the menu closes behind it.
  await menu.getByRole('checkbox', { name: 'Endfield music', exact: true }).click();
  await expect(setting(page)).toBeChecked();
  if (await popUp(page).isVisible()) await popUp(page).getByRole('button', { name: 'OK', exact: true }).click();
  else await page.keyboard.press('Escape');
  await chooseMusicView(page, /^Queue/);
  // Only the playlist's own Endfield song comes in, after what was there.
  await expect(queueRow(endfield.videoId!)).toBeVisible();
  await expect(page.locator('.music-queue-row')).toHaveCount(2);
});

// Endfield's songs play only from YouTube, whose player a phone may not keep going reliably in the
// background; Monster Siren's files play on. Each Endfield music checkbox says so in an ⓘ note,
// drawn the way Data saver's is (components/music/MusicSetting.tsx).
const BACKGROUND_NOTE = 'Endfield songs play from YouTube, so background play on phones may not work properly with them.';

test('the header\'s Endfield music ⓘ says background play on phones may not work properly, and opening it moves nothing', async ({ page }) => {
  await page.goto('/music/discover');
  await page.evaluate(() => document.fonts.ready);
  await openMusicMenu(page);
  const header = page.locator(test.info().project.name === 'mobile' ? '.music-nav-dropdown' : '.page-header');
  const info = header.getByRole('button', { name: 'About Endfield music', exact: true });
  await expect(info).toHaveAttribute('aria-expanded', 'false');
  const infoBox = (await info.boundingBox())!;
  expect(Math.min(infoBox.width, infoBox.height), 'the ⓘ is a 24px target at least').toBeGreaterThanOrEqual(24);
  const playlists = page.getByRole('button', { name: 'Playlists', exact: true });
  const before = { title: await page.locator('.page-header h1').boundingBox(), playlists: await playlists.boundingBox(), setting: await setting(page).boundingBox() };

  await info.click();
  const note = page.getByRole('dialog', { name: 'About Endfield music', exact: true });
  await expect(note).toHaveText(BACKGROUND_NOTE);
  await expect(note.getByRole('button', { name: 'Close about Endfield music', exact: true })).toBeFocused();
  expect({ title: await page.locator('.page-header h1').boundingBox(), playlists: await playlists.boundingBox(), setting: await setting(page).boundingBox() }).toEqual(before);
  // All of it on screen, under the row.
  const noteBox = (await note.boundingBox())!;
  const viewport = page.viewportSize()!;
  expect(noteBox.x).toBeGreaterThanOrEqual(0);
  expect(noteBox.x + noteBox.width).toBeLessThanOrEqual(viewport.width);
  expect(noteBox.y).toBeGreaterThan(infoBox.y + infoBox.height - 1);

  // Escape closes it and gives focus back; the checkbox is untouched.
  await page.keyboard.press('Escape');
  await expect(note).toHaveCount(0);
  await expect(info).toBeFocused();
  await expect(setting(page)).not.toBeChecked();
});

test('the ⋯ menu\'s Endfield music ⓘ says the same, in the menu, under Data saver', async ({ page }) => {
  await stubYouTube(page);
  await page.goto('/music');
  await openPlayerActions(page);
  const menu = page.getByRole('dialog', { name: 'Player actions', exact: true });
  const info = menu.getByRole('button', { name: 'About Endfield music', exact: true });
  const saverBox = (await menu.getByRole('checkbox', { name: 'Data saver', exact: true }).boundingBox())!;
  expect((await menu.getByRole('checkbox', { name: 'Endfield music', exact: true }).boundingBox())!.y).toBeGreaterThan(saverBox.y);
  await info.click();
  const note = page.getByRole('dialog', { name: 'About Endfield music', exact: true });
  await expect(note).toHaveText(BACKGROUND_NOTE);
  const menuBox = (await menu.boundingBox())!;
  const noteBox = (await note.boundingBox())!;
  expect(noteBox.x).toBeGreaterThanOrEqual(menuBox.x - 1);
  expect(noteBox.x + noteBox.width).toBeLessThanOrEqual(menuBox.x + menuBox.width + 1);
  // Escape closes the note only: the menu stays.
  await page.keyboard.press('Escape');
  await expect(note).toHaveCount(0);
  await expect(menu).toBeVisible();
  await expect(info).toBeFocused();
});

// On a touch screen (the site's `(pointer: coarse)` check), turning Endfield music on also says so
// in a pop-up, with "Don't show again" kept in this browser (lib/music/endfieldNotice.ts). It only
// informs: closing it any way leaves the setting on. A desktop's background tabs play on: none there.
const popUp = (page: Page) => page.getByRole('dialog', { name: 'Endfield music on phones', exact: true });

test('on a touch screen, turning Endfield music on says so in a pop-up, until Don\'t show again', async ({ page }, info) => {
  test.skip(info.project.name !== 'mobile', 'only a touch screen shows it');
  await stubYouTube(page); // Isolate the Endfield notice from first-visit media consent.
  await page.goto('/music/discover');
  expect(await page.evaluate(() => window.matchMedia('(pointer: coarse)').matches), 'the mobile project is a touch screen').toBe(true);
  await changeSetting(page, true);
  await expect(popUp(page)).toBeVisible();
  await expect(popUp(page)).toContainText('background play on phones may not work properly with them');
  await expect(popUp(page)).toContainText('Arknights songs keep playing in the background');
  await popUp(page).getByRole('button', { name: 'OK', exact: true }).click();
  await expect(popUp(page)).toHaveCount(0);
  await expect(setting(page)).toBeChecked();
  await expect(test.info().project.name === 'mobile' ? page.getByRole('button', { name: 'Music menu', exact: true }) : setting(page)).toBeFocused();

  // Off and on again: it shows again, and × closes it the same way.
  await changeSetting(page, false);
  await changeSetting(page, true);
  await expect(popUp(page)).toBeVisible();
  await popUp(page).getByRole('checkbox', { name: 'Don’t show again', exact: true }).check();
  await popUp(page).getByRole('button', { name: 'Close Endfield music on phones', exact: true }).click();
  await expect(popUp(page)).toHaveCount(0);
  await expect(setting(page)).toBeChecked();

  // Not again: here, after a reload, or from the ⋯ menu.
  await changeSetting(page, false);
  await changeSetting(page, true);
  await expect(setting(page)).toBeChecked();
  await expect(popUp(page)).toHaveCount(0);
  await page.reload();
  await changeSetting(page, false);
  await changeSetting(page, true);
  await expect(popUp(page)).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('musicEndfieldNoticeDismissed'))).toBe('true');
});

test('the ⋯ menu\'s checkbox shows the same pop-up on a touch screen, and Escape leaves the setting on', async ({ page }, info) => {
  test.skip(info.project.name !== 'mobile', 'only a touch screen shows it');
  await stubYouTube(page);
  await page.goto('/music');
  await openPlayerActions(page);
  const menu = page.getByRole('dialog', { name: 'Player actions', exact: true });
  await menu.getByRole('checkbox', { name: 'Endfield music', exact: true }).click();
  await expect(popUp(page)).toBeVisible();
  // All of it on screen; the menu closed behind it, as the focus went to it.
  const box = (await popUp(page).boundingBox())!;
  const viewport = page.viewportSize()!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
  await page.keyboard.press('Escape');
  await expect(popUp(page)).toHaveCount(0);
  await expect(setting(page)).toBeChecked();
});

test('on a desktop, turning Endfield music on shows no pop-up', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'a desktop\'s background tabs play on');
  await page.goto('/music/discover');
  await changeSetting(page, true);
  await expect(setting(page)).toBeChecked();
  await page.waitForTimeout(300);
  await expect(popUp(page)).toHaveCount(0);
});

// "endfield" finds the game's music: the site search's first row is Endfield music (Discover
// searched for it), then the albums; the music pages' own boxes match the game too, and with the
// setting off say how many matched and offer to include them.
test('the site search: "endfield" leads with Endfield music and its albums, and the row opens Discover\'s search', async ({ page }) => {
  await page.goto('/music/discover');
  await page.getByRole('button', { name: 'Search Arkpedia' }).click();
  await page.getByRole('combobox', { name: 'Search Arkpedia' }).fill('endfield');
  const options = page.getByRole('option');
  await expect(options.first()).toContainText('Endfield music');
  await expect(options.nth(1)).toContainText('Album');
  await expect(options.nth(1)).toContainText('Endfield');
  await options.first().click();
  await expect(page).toHaveURL(/\/music\/discover\?q=endfield$/);
  await expect(page.locator('.music-hidden-endfield-hint')).toContainText('hidden while Endfield music is off');
});

test('Discover\'s and the Library\'s boxes find "endfield": hidden and offered while off, listed when on', async ({ page }) => {
  await stubYouTube(page);
  const endfield = (await catalogue(page)).filter((row) => row.game === 'endfield');
  await page.goto('/music/discover?q=endfield');
  const hint = page.locator('.music-hidden-endfield-hint');
  await expect(hint).toContainText(`${endfield.length} Arknights: Endfield songs match`);
  await expect(page.locator('.music-discover-song-list .music-song-row')).toHaveCount(0);
  await hint.getByRole('button', { name: 'Include Endfield music', exact: true }).click();
  // On a touch screen that opens the background-play pop-up; it leaves the setting on.
  if (await popUp(page).isVisible()) await popUp(page).getByRole('button', { name: 'OK', exact: true }).click();
  await expect(page.locator(`.music-discover-song-list [data-song-id="${idOf(endfield[0])}"]`).first()).toBeVisible();
  await expect(hint).toHaveCount(0);

  // The Library: the setting is on now, so its search lists them; off, it says they are hidden.
  await page.goto('/music?view=library');
  const box = page.getByRole('searchbox', { name: 'Search all songs' });
  await box.fill('endfield');
  await expect(page.locator(`.music-all-songs-list [data-song-id="${idOf(endfield[0])}"]`)).toBeVisible();
  await changeSetting(page, false);
  await expect(page.locator('.music-all-songs-list .music-song-row')).toHaveCount(0);
  await expect(page.locator('.music-library .music-hidden-endfield-hint')).toContainText('hidden while Endfield music is off');
  await expect(page.getByText('No songs match your search.')).toHaveCount(0);
});

// Reported on arkpedia-dev (2026-10-22): "Sanctuary of Ink" in Discover's box with Endfield music on
// said "No songs match". The page there was a release without Endfield's records (the window
// between the deploy and the first release with them); this holds the search itself to it.
test('an Endfield album searched by name: listed when Endfield music is on, said hidden when off, in Discover and the Library', async ({ page }) => {
  await stubYouTube(page);
  const rows = (await catalogue(page)).filter((row) => row.game === 'endfield' && row.album);
  const album = rows[0].album!;
  // As a reader types it: "Sanctuary of Ink", not "... Original Soundtrack".
  const query = album.replace(/\s+Original Soundtrack.*$/i, '');
  const ids = rows.filter((row) => row.album === album).map(idOf);
  const dismiss = async () => { if (await popUp(page).isVisible()) await popUp(page).getByRole('button', { name: 'OK', exact: true }).click(); };

  await page.goto('/music/discover');
  await page.getByRole('searchbox', { name: 'Search songs, characters, artists, albums', exact: true }).fill(query);
  const discoverRow = (id: string) => page.locator(`.music-discover-song-list [data-song-id="${id}"]`);
  await expect(page.locator('.music-hidden-endfield-hint')).toContainText('hidden while Endfield music is off');
  await expect(discoverRow(ids[0])).toHaveCount(0);
  await changeSetting(page, true);
  await dismiss();
  for (const id of ids) await expect(discoverRow(id).first()).toBeVisible();
  await expect(page.getByText('No songs match.', { exact: false })).toHaveCount(0);

  await page.goto('/music?view=library');
  await page.getByRole('searchbox', { name: 'Search all songs' }).fill(query);
  const libraryRow = (id: string) => page.locator(`.music-all-songs-list [data-song-id="${id}"]`);
  await expect(libraryRow(ids[0])).toBeVisible();
  await expect(page.locator('.music-all-songs-list .music-song-row')).toHaveCount(ids.length);
  await changeSetting(page, false);
  await expect(libraryRow(ids[0])).toHaveCount(0);
  await expect(page.locator('.music-library .music-hidden-endfield-hint')).toContainText(`${ids.length} Arknights: Endfield songs match`);
});
