import { expect, test, type Page } from '@playwright/test';
import { stubYouTube } from './youtube-stub';

/*
 * Arknights: Endfield's songs (data/endfield-albums.json) are in the player's catalogue, each row
 * marked game 'endfield', and every list that draws from it hides them until the reader ticks
 * "Endfield music" (lib/music/songFilter.ts): the Library, Discover, Play all and a saved
 * playlist's queue alike. The setting is kept in this browser, beside Playlists in the music
 * pages' header and in the player bar's ⋯ menu.
 */

interface Row { videoId?: string; cid?: string; title: string; altTitle?: string; game?: string }
async function catalogue(page: Page): Promise<Row[]> {
  return (await (await page.request.get('/music-catalogue.json')).json()).songs;
}
const idOf = (row: Row) => row.videoId || `msr:${row.cid}`;
const setting = (page: Page) => page.locator('.page-header').getByRole('checkbox', { name: 'Endfield music', exact: true });

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

  await setting(page).check();
  await expect(heading).toContainText(`${all.size} songs`);
  await expect(row).toBeVisible();

  await page.reload();
  await expect(setting(page)).toBeChecked();
  await setting(page).uncheck();
  await expect(heading).toContainText(`${arknights.size} songs`);
  expect(await page.locator('body').evaluate((el) => el.scrollWidth <= window.innerWidth)).toBe(true);
});

test('Discover hides Endfield\'s songs and albums while the setting is off, and offers it on a search that finds them', async ({ page }) => {
  await stubYouTube(page);
  const song = (await catalogue(page)).find((row) => row.game === 'endfield')!;
  await page.goto(`/music/discover?q=${encodeURIComponent(song.title)}`);
  const hint = page.locator('.music-discover-hidden-hint');
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
  const queueRow = (id: string) => page.locator(`.music-queue-row[data-song-id="${id}"]`);
  await expect(queueRow(arknights.videoId!)).toBeVisible();
  await expect(queueRow(endfield.videoId!)).toHaveCount(0);

  // The bar's ⋯ menu: the same setting, so the corner player on any page reaches it.
  await page.getByRole('region', { name: 'Player', exact: true }).getByRole('button', { name: 'More player actions', exact: true }).click();
  const menu = page.getByRole('dialog', { name: 'Player actions', exact: true });
  await menu.getByRole('checkbox', { name: 'Endfield music', exact: true }).check();
  await expect(setting(page)).toBeChecked();
  await page.keyboard.press('Escape');
  // Only the playlist's own Endfield song comes in, after what was there.
  await expect(queueRow(endfield.videoId!)).toBeVisible();
  await expect(page.locator('.music-queue-row')).toHaveCount(2);
});
