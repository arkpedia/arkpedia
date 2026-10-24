import { expect, test, type Page } from '@playwright/test';
import { markDocument, sameDocument, startMusic, stubYouTube, youtube, type AutoplayPolicy, type StubCall } from './youtube-stub';

/*
 * The music player is one YouTube iframe in the app shell (lib/music/musicPlayerContext.tsx), so
 * a new document ends the song. "Some pages reset the music player" (2026-10-07) had two causes:
 *
 *  - A deploy. An open tab asks for its own build's page data (/_next/data/<build>/<page>.json),
 *    the new deployment answers 404, and Next loads the page as a new document. No code of the
 *    page can avoid that load, so the player carries the song into the new document
 *    (lib/music/musicResume.ts): the same song at the same moment, the same queue, playing if it
 *    was -- or, where the browser will not start sound by itself, waiting there for one press.
 *  - Restoring a backup in the Import / export dialog reloaded the page
 *    (components/account/DataDialog.tsx); it now restores in place.
 *
 * YouTube is a stub (youtube-stub.ts), so this needs no network. Desktop only: the player works
 * the same on a phone, and the census checks its phone layout.
 */

test.beforeEach(({}, info) => {
  test.skip(info.project.name !== 'desktop', 'the resume is the same at every width');
  test.setTimeout(120000);
});

/** What a reload or another build's page data hands Next: a 404 page, not {"notFound":true}. */
const OTHER_BUILD = { status: 404, contentType: 'text/html; charset=utf-8', body: '<!DOCTYPE html><html><head><title>404: This page could not be found</title></head><body><h1>404</h1></body></html>' };

const player = (page: Page) => page.locator('.music-player');
const callsOf = (calls: StubCall[], name: string) => calls.filter(([call]) => call === name).map(([, arg]) => arg);
const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;

/** The corner player as a reader sees it, opened: the play button, the time, what plays next. */
async function widget(page: Page) {
  const shell = player(page);
  if (await shell.getByRole('button', { name: 'Expand player' }).count()) await shell.getByRole('button', { name: 'Expand player' }).click();
  const play = shell.locator('.music-play-btn');
  return {
    button: await play.getAttribute('aria-label'),
    enabled: await play.isEnabled(),
    time: await shell.locator('.music-time').first().innerText(),
    // What plays next: the Next button's tooltip.
    upNext: await shell.locator('.music-next-btn').getAttribute('data-tip'),
  };
}
async function collapse(page: Page) {
  const close = player(page).getByRole('button', { name: 'Collapse player' });
  if (await close.count()) await close.click();
}

/** A song playing for a moment, and where it is. */
async function playing(page: Page) {
  await startMusic(page);
  await page.waitForTimeout(1500);
  const before = await widget(page);
  await collapse(page);
  const at = (await youtube(page))!;
  expect(at.state).toBe(1);
  return { at, upNext: before.upNext };
}

/** The cue the new document gave YouTube: the song, at its moment. */
async function resumedCue(page: Page) {
  await expect.poll(async () => callsOf((await youtube(page))?.calls ?? [], 'cueVideoById').length, { timeout: 30000 }).toBeGreaterThan(0);
  return callsOf((await youtube(page))!.calls, 'cueVideoById')[0] as { videoId: string; startSeconds: number };
}

test('a reload carries the song on: the same song at the same moment, the same queue, still playing', async ({ page }) => {
  await stubYouTube(page);
  await page.goto('/pull-planner');
  const { at, upNext } = await playing(page);
  await markDocument(page);
  await page.reload();
  expect(await sameDocument(page), 'a reload is a new document').toBe(false);

  const cue = await resumedCue(page);
  expect(cue.videoId).toBe(at.videoId);
  expect(cue.startSeconds).toBeGreaterThanOrEqual(at.time);
  expect(cue.startSeconds).toBeLessThan(at.time + 10);
  await expect.poll(async () => (await youtube(page))!.state, { message: 'and plays on' }).toBe(1);
  const now = (await youtube(page))!;
  expect(now.videoId).toBe(at.videoId);
  expect(now.players).toBe(1);
  // The same queue in the same shuffled order, and the player shows it playing.
  const shown = await widget(page);
  expect(shown.upNext).toBe(upNext);
  expect(shown.button).toBe('Pause');
});

test('after a deploy, a page the tab had not opened loads as a new document, and the song carries on', async ({ page }) => {
  await stubYouTube(page);
  await page.goto('/operator-planner');
  const { at, upNext } = await playing(page);
  // The deployment that served this tab is gone: its build's page data is a 404 now.
  await page.route('**/_next/data/**', (route) => route.fulfill(OTHER_BUILD));
  await markDocument(page);
  const loaded = page.waitForEvent('load', { timeout: 60000 });
  // What a link does on a click (next/link calls the router).
  await page.evaluate(() => { void (window as unknown as { next: { router: { push: (url: string) => Promise<boolean> } } }).next.router.push('/skin-planner'); });
  await loaded;
  await page.unroute('**/_next/data/**');
  await expect(page).toHaveURL(/\/skin-planner$/);
  expect(await sameDocument(page), 'Next loads the page as a new document: nothing in the page can stop that').toBe(false);

  const cue = await resumedCue(page);
  expect(cue.videoId).toBe(at.videoId);
  expect(cue.startSeconds).toBeGreaterThanOrEqual(at.time);
  await expect.poll(async () => (await youtube(page))!.state).toBe(1);
  expect((await widget(page)).upNext).toBe(upNext);
});

for (const policy of ['refuse', 'refuse-silently'] as AutoplayPolicy[]) {
  test(`where the browser will not start sound by itself, the song waits at its moment for one press of Play (${policy})`, async ({ page }) => {
    const stub = await stubYouTube(page);
    await page.goto('/skin-planner');
    const { at, upNext } = await playing(page);
    stub.policy = policy;
    await page.reload();

    const cue = await resumedCue(page);
    expect(cue.videoId).toBe(at.videoId);
    await expect.poll(async () => (await youtube(page))!.refused, { message: 'the player tried, and was refused' }).toBeGreaterThan(0);
    // Not a blank player and not a spinner: the song, paused at its moment, Play ready.
    const shell = player(page);
    await shell.getByRole('button', { name: 'Expand player' }).click();
    await expect(shell.getByRole('button', { name: 'Play', exact: true })).toBeEnabled({ timeout: 10000 });
    const shown = await widget(page);
    expect(shown.time).toBe(clock(cue.startSeconds));
    expect(shown.upNext).toBe(upNext);
    expect((await youtube(page))!.state).not.toBe(1);

    await shell.getByRole('button', { name: 'Play', exact: true }).click();
    await expect.poll(async () => (await youtube(page))!.state).toBe(1);
    const now = (await youtube(page))!;
    expect(now.videoId).toBe(at.videoId);
    expect(now.time).toBeGreaterThanOrEqual(cue.startSeconds);
    expect(now.time).toBeLessThan(cue.startSeconds + 10);
  });
}

test('a player opened but never played carries nothing: YouTube stays unloaded until it is used', async ({ page }) => {
  await stubYouTube(page);
  await page.goto('/pull-planner');
  await player(page).getByRole('button', { name: 'Expand player' }).click();
  await expect(player(page).getByRole('button', { name: 'Play', exact: true })).toBeEnabled({ timeout: 20000 });
  await collapse(page);
  await page.reload();
  await page.waitForTimeout(3000);
  expect(await youtube(page), 'the stub is loaded only with the player').toBeNull();
});

test('the music guesser takes the song paused: a new document there does not play it over the clips', async ({ page }) => {
  await stubYouTube(page);
  await page.goto('/pull-planner');
  const { at } = await playing(page);
  // A new document of the guesser, as an address opened in the tab.
  await page.goto('/games/music-guesser');
  const cue = await resumedCue(page);
  expect(cue.videoId).toBe(at.videoId);
  await page.waitForTimeout(4000);
  const now = (await youtube(page))!;
  expect(callsOf(now.calls, 'playVideo'), 'nothing asked YouTube to play').toEqual([]);
  expect(callsOf(now.calls, 'loadVideoById')).toEqual([]);
  expect(now.state).toBe(5);
});

test('restoring a backup keeps the page and the song, and the player has the restored favourites', async ({ page }) => {
  await stubYouTube(page);
  await page.goto('/account');
  await page.evaluate(() => localStorage.setItem('arkpediaAccount', JSON.stringify({ version: 1, server: 'en', importedAt: '2026-10-01T12:00:00.000Z', doctor: null,
    operators: ['Surtr', 'Amiya'], skins: [], cleared: [], profile: { level: 120, registeredAt: '2020-02-03T03:42:40.000Z', secretary: 'Nian', bio: '', supports: [] } })));
  await page.reload();
  await expect(page.locator('main')).toContainText('Imported 1 Oct 2026');
  const { videoId } = await startMusic(page);
  await collapse(page);
  await markDocument(page);

  await page.locator('.page-header').getByRole('button', { name: 'Import / export', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('tab', { name: 'Backups', exact: true }).click();
  await dialog.locator('summary', { hasText: 'Paste / copy as text' }).click();
  await dialog.getByRole('button', { name: 'Get backup text', exact: true }).click();
  const box = dialog.getByRole('textbox', { name: 'Arkpedia data' });
  const backup = JSON.parse(await box.inputValue());
  backup.stores.arkpediaAccount.importedAt = '2026-01-02T12:00:00.000Z';
  backup.stores.arkpediaAccount.profile.secretary = 'Amiya';
  backup.stores.musicFavorites = [videoId];
  await box.fill(JSON.stringify(backup));
  await dialog.getByRole('button', { name: 'Import text', exact: true }).click();
  const note = dialog.getByRole('status').filter({ hasText: 'Restored' });
  await expect(note).toContainText('Restored your account');
  await expect(note).not.toContainText('Reloading');
  // The reload it replaced came 1.2 s after the note.
  await page.waitForTimeout(2500);
  expect(await sameDocument(page), 'the restore reloaded the page').toBe(true);
  await expect(page.locator('main')).toContainText('Imported 2 Jan 2026');
  await expect(page.locator('main')).toContainText('Assistant: Amiya');
  expect(await youtube(page)).toMatchObject({ state: 1, players: 1, videoId });
  // The player's favourites are the backup's, not the set it read when the page loaded (whose
  // next toggle would write it back over the restored one).
  await page.keyboard.press('Escape');
  await player(page).getByRole('button', { name: 'Expand player' }).click();
  await expect(player(page).getByRole('button', { name: 'Favourite', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await player(page).getByRole('button', { name: 'Favourite', exact: true }).click();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('musicFavorites'))).toBe('[]');
});
