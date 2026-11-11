import { expect, test, type Page } from '@playwright/test';
import { stubYouTube, youtube } from './youtube-stub';

/*
 * Every place a song is offered can queue it, Endfield's and Arknights' alike (owner, 2026-10-22:
 * "why can't endfield? or youtube song be queued?"): a Discover row, a Most liked on Arkpedia tile
 * (it could only play), the Library. And Discover's player bar seeks like the other tabs' (it had a
 * progress line there). A tab open across a content release queues the new release's songs too:
 * lib/music/catalogueStore.ts, unit-tested in scripts/tests/test-music-catalogue-store.ts.
 */

interface Row { videoId?: string; cid?: string; title: string; altTitle?: string; game?: string }
async function catalogue(page: Page): Promise<Row[]> {
  return (await (await page.request.get('/music-catalogue.json')).json()).songs;
}
const titleOf = (row: Row) => row.altTitle || row.title;
const bar = (page: Page) => page.getByRole('region', { name: 'Player', exact: true });
const notice = (page: Page) => bar(page).locator('.music-transport-notice');

/** A song's Add to queue, wherever its row or tile shows it: a desktop row's own button, or the
 *  More menu a phone row and every Most liked tile have. */
async function addToQueue(page: Page, scope: ReturnType<Page['locator']>, title: string) {
  await expect(scope).toBeVisible();
  const direct = scope.getByRole('button', { name: `Add to queue: ${title}`, exact: true }).first();
  if (await direct.isVisible()) { await direct.click(); return; }
  await scope.getByRole('button', { name: `More actions for ${title}`, exact: true }).first().click();
  await page.getByRole('dialog', { name: 'Song actions', exact: true }).getByRole('button', { name: 'Add to queue', exact: true }).click();
}

test.beforeEach(async ({ page }) => {
  // Endfield music on, its phone pop-up already seen: this is about queueing, not the setting.
  await page.addInitScript(() => { localStorage.setItem('musicIncludeEndfield', 'true'); localStorage.setItem('musicEndfieldNoticeDismissed', 'true'); });
  await stubYouTube(page);
});

test('a Discover row queues an Endfield song and an Arknights song, with nothing playing and with a song playing', async ({ page }) => {
  const rows = await catalogue(page);
  const endfield = rows.find((row) => row.game === 'endfield' && row.videoId)!;
  const arknights = rows.find((row) => row.game !== 'endfield' && row.videoId && row.cid)!;
  for (const song of [endfield, arknights]) {
    await page.goto(`/music/discover?q=${encodeURIComponent(titleOf(song))}`);
    const list = page.locator('.music-discover-song-list');
    await expect(list.locator(`[data-song-id="${song.videoId}"]`).first()).toBeVisible();
    await addToQueue(page, list.locator(`[data-song-id="${song.videoId}"]`).first(), titleOf(song));
    await expect(notice(page)).toContainText(`Added to queue: ${titleOf(song)}`);
  }
  // With a song playing: the next one queues after it.
  await page.goto(`/music/discover?q=${encodeURIComponent(titleOf(arknights))}`);
  await page.locator(`.music-discover-song-list [data-song-id="${arknights.videoId}"] .music-song-row-main`).first().click();
  await expect.poll(async () => (await youtube(page))?.state).toBe(1);
  await page.goto(`/music/discover?q=${encodeURIComponent(titleOf(endfield))}`);
  await addToQueue(page, page.locator(`.music-discover-song-list [data-song-id="${endfield.videoId}"]`).first(), titleOf(endfield));
  await expect(notice(page)).toContainText(`Added to queue: ${titleOf(endfield)}`);
});

test('a Most liked on Arkpedia tile queues its song from its ⋯, and still plays on a press', async ({ page }) => {
  const rows = await catalogue(page);
  const endfield = rows.filter((row) => row.game === 'endfield' && row.videoId).slice(0, 2);
  const arknights = rows.filter((row) => row.game !== 'endfield' && row.videoId).slice(0, 2);
  const likes = Object.fromEntries([...endfield, ...arknights].map((row, i) => [row.videoId!, 1000 - i]));
  await page.route('**/api/music/likes', (route) => route.fulfill({ json: { updatedAt: new Date().toISOString(), likes } }));
  await page.goto('/music/discover');
  const section = page.getByRole('region', { name: 'Most liked on Arkpedia', exact: true });
  await expect(section.locator('.music-discover-album-tile')).toHaveCount(4);
  for (const song of [endfield[0], arknights[0]]) {
    const tile = section.locator('.music-discover-like-tile', { has: page.locator(`[data-song-id="${song.videoId}"]`) });
    await tile.getByRole('button', { name: `More actions for ${titleOf(song)}`, exact: true }).click();
    await page.getByRole('dialog', { name: 'Song actions', exact: true }).getByRole('button', { name: 'Add to queue', exact: true }).click();
    await expect(notice(page)).toContainText(`Added to queue: ${titleOf(song)}`);
  }
  await section.locator(`[data-song-id="${endfield[1].videoId}"]`).click();
  await expect.poll(async () => (await youtube(page))?.videoId).toBe(endfield[1].videoId);
});

test('Discover\'s player head drags to seek, as on the other tabs', async ({ page }) => {
  const song = (await catalogue(page)).find((row) => row.game === 'endfield' && row.videoId)!;
  await page.goto(`/music/discover?q=${encodeURIComponent(titleOf(song))}`);
  await page.locator(`.music-discover-song-list [data-song-id="${song.videoId}"] .music-song-row-main`).first().click();
  await expect.poll(async () => (await youtube(page))?.state).toBe(1);
  const seek = bar(page).getByRole('slider', { name: 'Seek', exact: true });
  await expect(seek).toBeVisible();
  await expect.poll(() => seek.getAttribute('max')).not.toBe('0');
  // Drag the head from the start to three quarters along.
  const box = (await seek.boundingBox())!;
  await page.mouse.move(box.x + 4, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height / 2, { steps: 5 });
  await page.mouse.move(box.x + box.width * 0.75, box.y + box.height / 2, { steps: 5 });
  await page.mouse.up();
  await expect.poll(async () => ((await youtube(page))?.calls ?? []).filter(([name]) => name === 'seekTo').map(([, seconds]) => Number(seconds)).pop() ?? -1)
    .toBeGreaterThan(120);
  expect(await page.locator('body').evaluate((el) => el.scrollWidth <= window.innerWidth)).toBe(true);
});
