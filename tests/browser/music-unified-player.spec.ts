import fs from 'node:fs/promises';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { chooseMusicView, openMusicMenu } from './music-navigation-helpers';
import { stubYouTube, youtube } from './youtube-stub';

async function navigate(page: Page, path: string) {
  await page.evaluate(path => (window as unknown as { next: { router: { push: (path: string) => Promise<void> } } }).next.router.push(path), path);
  await expect(page).toHaveURL(new RegExp(path.replace(/[?]/g, '\\?') + '$'));
}
const bar = (page: Page) => page.getByRole('region', { name: 'Player', exact: true });
const labels = ['Favourite', 'Previous track', 'Pause', 'Next track', 'Shuffle', 'Repeat: off', "Don't autoplay this song", 'Stream-safe: hide copyrighted songs', 'More player actions'];
async function fullControls(page: Page) {
  await expect(bar(page)).toBeVisible();
  for (const name of labels) await expect(bar(page).getByRole('button', { name, exact: true })).toBeVisible();
  const musicPage = new URL(page.url()).pathname.startsWith('/music');
  await expect(page.getByRole('button', { name: 'Minimize player', exact: true })).toHaveCount(musicPage ? 0 : 1);
  for (const name of ['Seek', 'Volume']) await expect(bar(page).getByRole('slider', { name, exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

for (const theme of ['dark', 'light']) {
  test(`one player follows music views and ordinary pages without restarting (${theme})`, async ({ page }, info) => {
    if (info.project.name === 'mobile') await page.setViewportSize({ width: 390, height: 844 });
    await stubYouTube(page);
    await page.addInitScript(theme => localStorage.setItem('theme', theme), theme);
    await page.goto('/pull-planner');
    await expect(bar(page)).toHaveCount(0);
    await page.getByRole('button', { name: 'Expand player' }).click();
    await expect(page.getByRole('button', { name: 'Minimize player' })).toBeVisible();
    await page.getByRole('button', { name: 'Minimize player' }).click();
    await expect(page.getByRole('button', { name: 'Expand player' })).toBeFocused();
    await page.getByRole('button', { name: 'Expand player' }).click();
    await bar(page).getByRole('link', { name: /Now playing|Choose a song in Library/ }).click();
    await chooseMusicView(page, 'Library');
    await expect(page.locator('.music-library-row').first()).toBeVisible();
    const song = page.locator('.music-library-row[data-song-id="2Qul6EjQmYc"]');
    await page.getByRole('searchbox', { name: 'Search all songs', exact: true }).fill('Paper Boat');
    await expect(page.getByRole('searchbox', { name: 'Search all songs', exact: true })).toHaveValue('Paper Boat');
    await song.locator('.music-song-row-main').click();
    await expect.poll(async () => (await youtube(page))?.state).toBe(1);
    await bar(page).getByRole('button', { name: 'Favourite', exact: true }).click();
    const initial = (await youtube(page))!;
    const loads = initial.calls.filter(([name]) => /loadVideoById|cueVideoById/.test(name)).length;
    const geometry = () => bar(page).evaluate(el => {
      const root = el.getBoundingClientRect();
      return [...el.querySelectorAll<HTMLElement>('.music-play-btn, .music-volume-control, .music-player-bottombar-seek')].map(control => {
        const box = control.getBoundingClientRect();
        return [box.x - root.x, box.y - root.y, box.width, box.height].map(Math.round);
      });
    });
    await fullControls(page);
    const expectedGeometry = await geometry();
    for (const view of ['Favourites', 'Now playing', 'Library']) {
      await chooseMusicView(page, view);
      await fullControls(page);
      expect(await geometry()).toEqual(expectedGeometry);
    }
    // Music pages keep the transport open, including when Escape is pressed.
    await bar(page).getByRole('slider', { name: 'Volume', exact: true }).focus();
    await page.keyboard.press('Escape');
    await fullControls(page);
    expect(await geometry()).toEqual(expectedGeometry);
    await openMusicMenu(page);
    await page.getByRole('button', { name: 'Playlists', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Music playlists', exact: true });
    await dialog.getByRole('textbox', { name: 'New playlist name' }).fill('Shared player');
    await dialog.getByRole('button', { name: 'Save queue', exact: true }).click();
    await page.keyboard.press('Escape');
    await openMusicMenu(page);
    await page.getByRole('link', { name: 'Shared player', exact: true }).click();
    await fullControls(page);
    expect(await geometry()).toEqual(expectedGeometry);
    await navigate(page, '/pull-planner');
    await fullControls(page);
    expect((await youtube(page))?.videoId).toBe(initial.videoId);
    expect((await youtube(page))?.players).toBe(1);
    expect((await youtube(page))!.calls.filter(([name]) => /loadVideoById|cueVideoById/.test(name))).toHaveLength(loads);
    const main = page.locator('main');
    expect(await main.evaluate(el => parseFloat(getComputedStyle(el).paddingBottom))).toBeGreaterThanOrEqual((await bar(page).boundingBox())!.height);
    await fs.mkdir('.cache/music-unified-qa', { recursive: true });
    await page.screenshot({ path: `.cache/music-unified-qa/${info.project.name}-${theme}-external.png` });
    await bar(page).screenshot({ path: `.cache/music-unified-qa/${info.project.name}-${theme}-bar.png`, scale: 'css' });
    await page.getByRole('button', { name: 'Minimize player' }).click();
    await expect(bar(page)).toHaveCount(0);
    await navigate(page, '/world?section=twitch');
    await expect(page.getByRole('button', { name: 'Expand player' })).toBeVisible();
    await expect(bar(page)).toHaveCount(0);
    expect((await youtube(page))?.state).toBe(1);
    await page.getByRole('button', { name: 'Expand player' }).click();
    await fullControls(page);
    await bar(page).getByRole('link', { name: 'Queue', exact: true }).click();
    await expect(page).toHaveURL(/\/world\?section=twitch&musicQueue=1/);
    await expect(page.getByRole('dialog', { name: 'Playback queue', exact: true })).toBeVisible();
    await fullControls(page);
    expect((await youtube(page))?.videoId).toBe(initial.videoId);
  });
}

test('playback exposes the shared player and manual minimization survives the next song', async ({ page }) => {
  await stubYouTube(page);
  await page.goto('/music/discover?q=paper');
  await page.locator('[data-song-id="2Qul6EjQmYc"] .music-song-row-main').first().click();
  await expect.poll(async () => (await youtube(page))?.state).toBe(1);
  await navigate(page, '/pull-planner');
  await fullControls(page);
  const first = (await youtube(page))!.videoId;
  await page.getByRole('button', { name: 'Minimize player' }).click();
  await page.evaluate(() => (window as unknown as { __yt: { finish: () => void } }).__yt.finish());
  await expect.poll(async () => (await youtube(page))?.videoId).not.toBe(first);
  await expect.poll(async () => (await youtube(page))?.state).toBe(1);
  await expect(bar(page)).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Expand player' })).toBeVisible();
  await navigate(page, '/music?view=library');
  await fullControls(page);
  await navigate(page, '/pull-planner');
  await expect(bar(page)).toHaveCount(0);
  await page.getByRole('button', { name: 'Expand player' }).click();
  await fullControls(page);
});

async function entrance(page: Page, element: Locator, name: string, direction: 'x' | 'y', reduced: boolean) {
  if (reduced) {
    expect(await element.evaluate(el => el.getAnimations().length)).toBe(0);
    await expect(element).toHaveCSS('translate', 'none');
    await expect(element).toHaveCSS('opacity', '1');
    return;
  }
  const frames = await element.evaluate((el, name) => {
    const animation = el.getAnimations().find(a => (a as CSSAnimation).animationName === name);
    if (!animation) return null;
    animation.pause();
    const duration = Number(animation.effect!.getTiming().duration);
    const sample = (at: number) => {
      animation.currentTime = duration * at;
      const style = getComputedStyle(el);
      return { translate: style.translate.split(' ').map(parseFloat), opacity: Number(style.opacity), width: (el as HTMLElement).offsetWidth, height: (el as HTMLElement).offsetHeight, pageWidth: document.documentElement.scrollWidth };
    };
    return { duration, start: sample(.2), end: sample(.7) };
  }, name);
  expect(frames, `${name} starts when its panel appears`).not.toBeNull();
  expect(frames!.duration).toBeGreaterThanOrEqual(100);
  expect(frames!.duration).toBeLessThanOrEqual(400);
  const axis = direction === 'x' ? 0 : 1;
  expect(frames!.start.translate[axis]).toBeGreaterThan(frames!.end.translate[axis]);
  expect(frames!.end.translate[axis]).toBeGreaterThan(0);
  expect(frames!.start.opacity).toBeLessThan(frames!.end.opacity);
  expect(frames!.end.opacity).toBeLessThan(1);
  expect(frames!.start.width).toBe(frames!.end.width);
  expect(frames!.start.height).toBe(frames!.end.height);
  expect(frames!.start.pageWidth).toBeLessThanOrEqual(page.viewportSize()!.width);
  expect(frames!.end.pageWidth).toBeLessThanOrEqual(page.viewportSize()!.width);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Entrances never introduce horizontal page scrolling').toBe(true);
  await page.screenshot({ path: test.info().outputPath(`${name}-mid-entrance.png`), scale: 'css' });
  await element.evaluate(el => { for (const animation of el.getAnimations()) animation.finish(); });
  await expect(element).toHaveCSS('translate', 'none');
  await expect(element).toHaveCSS('opacity', '1');
}

for (const theme of ['dark', 'light']) for (const motion of ['no-preference', 'reduce'] as const) {
  test(`overlay entrances preserve playback and honor ${motion} (${theme})`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: motion });
    await stubYouTube(page);
    await page.addInitScript(theme => localStorage.setItem('theme', theme), theme);
    await page.goto('/music/discover?q=paper');
    // Pause from creation so short entrances can be sampled reliably on WebKit too.
    if (motion === 'no-preference') await page.addStyleTag({ content: '.music-queue-drawer, .music-player-bottombar[data-minimizable], .music-floating-toggle, .music-player.collapsed { animation-play-state: paused !important; }' });
    await page.locator('[data-song-id="2Qul6EjQmYc"] .music-song-row-main').first().click();
    await expect.poll(async () => (await youtube(page))?.state).toBe(1);
    const initial = (await youtube(page))!;
    const loads = initial.calls.filter(([op]) => /loadVideoById|cueVideoById/.test(op)).length;
    await navigate(page, '/pull-planner');
    await entrance(page, bar(page), 'music-player-enter', 'x', motion === 'reduce');
    await entrance(page, page.getByRole('button', { name: 'Minimize player', exact: true }), 'music-player-enter', 'x', motion === 'reduce');
    const resting = await bar(page).boundingBox();
    await navigate(page, '/world?section=twitch');
    expect(await bar(page).evaluate(el => el.getAnimations().length), 'An open player does not replay its entrance during navigation').toBe(0);
    expect(await bar(page).boundingBox()).toEqual(resting);
    await page.getByRole('button', { name: 'Minimize player', exact: true }).click();
    const expand = page.getByRole('button', { name: 'Expand player', exact: true });
    await expect(expand).toBeFocused();
    await entrance(page, expand.locator('..'), 'music-player-enter', 'x', motion === 'reduce');
    await expand.click();
    await entrance(page, bar(page), 'music-player-enter', 'x', motion === 'reduce');
    await page.getByRole('button', { name: 'Minimize player', exact: true }).evaluate(el => { for (const animation of el.getAnimations()) animation.finish(); });
    for (let i = 0; i < 2; i++) {
      await bar(page).getByRole('link', { name: 'Queue', exact: true }).click();
      const queue = page.getByRole('dialog', { name: 'Playback queue', exact: true });
      await entrance(page, queue, 'music-queue-enter', 'y', motion === 'reduce');
      await expect(queue.getByRole('link', { name: 'Close queue', exact: true })).toBeFocused();
      await page.keyboard.press('Escape');
      await expect(queue).toHaveCount(0);
    }
    const after = (await youtube(page))!;
    expect(after.state).toBe(1);
    expect(after.videoId).toBe(initial.videoId);
    expect(after.players).toBe(1);
    expect(after.calls.filter(([op]) => /loadVideoById|cueVideoById/.test(op))).toHaveLength(loads);
  });
}
