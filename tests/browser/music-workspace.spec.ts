import { chooseMusicView, musicViewLink, openMusicMenu } from './music-navigation-helpers';
import fs from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { stubYouTube, youtube } from './youtube-stub';

for (const theme of ['dark', 'light']) {
  test(`music workspace keeps favourites, lyrics and playback connected (${theme})`, async ({ page }, info) => {
    await page.addInitScript(value => localStorage.setItem('theme', value), theme);
    await stubYouTube(page);
    await page.goto('/music?view=library');
    const bar = page.getByRole('region', { name: 'Player', exact: true });
    await page.getByRole('searchbox', { name: 'Search all songs' }).fill('Speed of Light');
    const first = page.locator('.music-library-row[data-song-id="d3jylNWjb3k"]');
    await expect(first).toBeVisible();
    await first.locator('.music-song-row-main').click();
    await expect.poll(async () => (await youtube(page))?.state).toBe(1);
    const playing = (await youtube(page))!;
    await bar.getByRole('button', { name: 'Favourite', exact: true }).click();
    await chooseMusicView(page, 'Favourites');
    await expect(page).toHaveURL(/scope=favorites/);
    await expect(page.locator('.music-library-row')).toHaveCount(1);
    await expect(musicViewLink(page, 'Favourites')).toHaveAttribute('aria-current', 'page');
    await chooseMusicView(page, 'Library');
    await page.goBack();
    await expect(page).toHaveURL(/scope=favorites/);
    await expect(page.locator('.music-library-row')).toHaveCount(1);
    await bar.getByRole('link', { name: /Open Now playing$/ }).click();
    await expect(page).toHaveURL(/view=player$/);
    await expect(page.locator('#music-lyrics')).toBeVisible();
    expect((await youtube(page))!).toMatchObject({ players: 1, state: 1, videoId: playing.videoId });
    expect((await youtube(page))!.calls.filter(([name]) => name === 'loadVideoById')).toHaveLength(playing.calls.filter(([name]) => name === 'loadVideoById').length);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await openMusicMenu(page);
  await page.getByRole('button', { name: 'Playlists', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Music playlists', exact: true });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('textbox', { name: 'New playlist name' }).fill('Workspace playlist');
    await dialog.getByRole('button', { name: 'Save queue', exact: true }).click();
    await expect(dialog.getByRole('combobox', { name: 'Saved playlist' })).toContainText('Workspace playlist');
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(page.locator('.music-playlist-shortcuts a').filter({ hasText: 'Workspace playlist' })).toBeAttached();
    if (info.project.name === 'mobile') await expect(page.getByRole('button', { name: 'Music menu', exact: true })).toBeFocused();
    if (info.project.name === 'desktop') {
      await page.setViewportSize({ width: 1280, height: 480 });
      await page.getByRole('link', { name: 'Workspace playlist', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Workspace playlist', exact: true }).first()).toBeVisible();
      await page.setViewportSize({ width: 1440, height: 1000 });
    }
    if (process.env.ARKPEDIA_QA_CAPTURE) {
      await fs.mkdir(process.env.ARKPEDIA_QA_CAPTURE, { recursive: true });
      await page.screenshot({ path: `${process.env.ARKPEDIA_QA_CAPTURE}/music-now-playing-${info.project.name}-${theme}.png` });
      await chooseMusicView(page, 'Discover');
      await expect(page.getByRole('heading', { name: 'Recently added', exact: true })).toBeVisible();
      await page.screenshot({ path: `${process.env.ARKPEDIA_QA_CAPTURE}/music-discover-${info.project.name}-${theme}.png` });
    }
  });
}

for (const theme of ['dark', 'light']) {
  test(`autoplay queue uses an artwork card and grouped controls (${theme})`, async ({ page }, info) => {
    await page.addInitScript(value => localStorage.setItem('theme', value), theme);
    await stubYouTube(page);
    await page.goto('/music?view=queue');
    const bar = page.getByRole('region', { name: 'Player', exact: true });
    await expect(page.getByRole('heading', { name: 'Your queue is empty', exact: true })).toBeVisible();
    await bar.getByRole('button', { name: 'Play', exact: true }).click();
    await expect.poll(async () => (await youtube(page))?.state).toBe(1);
    await expect(page.locator('.music-queue-now')).toBeVisible();
    await expect(page.locator('.music-queue-now-art')).toBeVisible();
    const automatic = page.getByRole('region', { name: 'Autoplay from library', exact: true });
    await automatic.getByRole('button', { name: 'About autoplay', exact: true }).click();
    await expect(page.getByRole('region', { name: 'About autoplay', exact: true })).toContainText('Plays after your queue ends.');
    await page.keyboard.press('Escape');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await fs.mkdir('.cache/music-workspace-qa', { recursive: true });
    await page.screenshot({ path: `.cache/music-workspace-qa/queue-${info.project.name}-${theme}.png` });
  });
}

test('the player uses the same highlight on icon links and buttons', async ({ page }, info) => {
  const theme = info.project.name === 'mobile' ? 'dark' : 'light';
  await page.addInitScript(theme => localStorage.setItem('theme', theme), theme);
  await stubYouTube(page);
  await page.goto('/music/discover?q=speed');
  await page.locator('.music-discover-song-row[data-song-id="d3jylNWjb3k"] .music-song-row-main').click();
  await chooseMusicView(page, 'Now playing');
  const bar = page.getByRole('region', { name: 'Player', exact: true });
  const queue = bar.getByRole('link', { name: 'Queue', exact: true });
  const repeat = bar.getByRole('button', { name: /^Repeat:/ });
  const heart = bar.getByRole('button', { name: 'Favourite', exact: true });
  const lyrics = bar.getByRole('button', { name: 'Lyrics', exact: true });
  const swatch = await bar.evaluate(el => {
    const probe = document.createElement('span');
    probe.style.color = 'var(--teal)';
    el.appendChild(probe);
    const color = getComputedStyle(probe).color;
    probe.remove();
    return color;
  });
  const controls = [queue, heart, repeat];
  if (info.project.name === 'mobile') controls.push(lyrics);
  for (const control of controls) {
    await control.hover();
    await expect(control).toHaveCSS('color', swatch);
    await expect(control).toHaveCSS('border-top-color', 'rgba(0, 0, 0, 0)');
    await expect(control).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  }
  await heart.click();
  await repeat.hover();
  await expect(heart).toHaveCSS('color', swatch);
  await expect(heart).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  if (process.env.ARKPEDIA_QA_CAPTURE) {
    await bar.screenshot({ path: `${process.env.ARKPEDIA_QA_CAPTURE}/button-highlights-${info.project.name}-${theme}.png` });
  }
  await repeat.focus();
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Tab');
  await expect(repeat).toBeFocused();
  await expect(repeat).toHaveCSS('outline-style', 'solid');
});

test('phone music dropdown is anchored, dismisses outside and with Escape, and keeps the page still', async ({ page }, info) => {
  test.skip(info.project.name !== 'mobile');
  await stubYouTube(page);
  await page.goto('/music?view=library');
  const trigger = page.getByRole('button', { name: 'Music menu', exact: true });
  await expect(trigger).toBeVisible();
  const position = await page.evaluate(() => scrollY);
  await trigger.click();
  const menu = page.getByRole('dialog', { name: 'Music', exact: true });
  await expect(menu).toBeVisible();
  const buttonBox = (await trigger.boundingBox())!;
  await expect.poll(async () => Math.abs((await menu.boundingBox())!.y - buttonBox.y - buttonBox.height - 6)).toBeLessThan(2);
  const box = (await menu.boundingBox())!;
  expect(Math.abs(box.x + box.width - buttonBox.x - buttonBox.width)).toBeLessThan(2);
  expect(box.height).toBeLessThan(500);
  expect(await page.evaluate(() => getComputedStyle(document.body).overflow)).not.toBe('hidden');
  await expect(page.getByRole('navigation', { name: 'Music', exact: true }).getByRole('link', { name: 'Library', exact: true })).toHaveAttribute('aria-current', 'page');
  await page.keyboard.press('Tab');
  await expect(menu.getByRole('link', { name: 'Discover', exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(menu).not.toBeVisible();
  await expect(trigger).toBeFocused();
  expect(await page.evaluate(() => scrollY)).toBe(position);
  await trigger.click();
  await page.getByRole('heading', { name: 'Library', exact: true }).click();
  await expect(menu).not.toBeVisible();
  await trigger.click();
  await trigger.click();
  await expect(menu).not.toBeVisible();
});

test('scrolling Now Playing never exposes Library underneath; the explicit back control preserves playback', async ({ page }, info) => {
  test.skip(info.project.name !== 'mobile');
  await stubYouTube(page);
  await page.goto('/music?view=library');
  await page.locator('.music-library-row .music-song-row-main').first().click();
  await expect.poll(async () => (await youtube(page))?.state).toBe(1);
  const playing = (await youtube(page))!;
  await chooseMusicView(page, 'Now playing');
  const bar = page.getByRole('region', { name: 'Player', exact: true });
  const transportHeight = (await bar.boundingBox())!.height;
  await page.evaluate(() => scrollTo(0, 0));
  const art = page.locator('.music-now-playing-cover');
  const touch = async (type: string, y: number) => art.evaluate((el, { type, y }) => {
    const point = new Touch({ identifier: 1, target: el, clientX: 160, clientY: y });
    el.dispatchEvent(new TouchEvent(type, { bubbles: true, cancelable: true, touches: type === 'touchend' ? [] : [point], changedTouches: [point] }));
  }, { type, y });
  await touch('touchstart', 200); await touch('touchmove', 245); await touch('touchend', 245);
  await expect(page).toHaveURL(/view=player/);
  await touch('touchstart', 200); await touch('touchmove', 340);
  await expect.poll(() => page.locator('.music-now-playing').evaluate(el => getComputedStyle(el).transform)).toBe('none');
  await expect(page.locator('.music-view-panel')).not.toBeVisible();
  expect(await page.locator('.music-now-playing-song-info').evaluate(el => getComputedStyle(el).overflowY)).toBe('visible');
  await touch('touchend', 340);
  await expect(page).toHaveURL(/view=player/);
  await page.getByRole('link', { name: 'Back to Library', exact: true }).click();
  await expect(page).toHaveURL(/view=library/);
  await expect(page.locator('.music-library-row').first()).toBeVisible();
  await expect.poll(async () => (await bar.boundingBox())!.height).toBe(transportHeight);
  await bar.getByRole('link', { name: /Open Now playing$/ }).click();
  await expect(page).toHaveURL(/view=player/);
  expect((await youtube(page))!).toMatchObject({ state: 1, videoId: playing.videoId });
  expect((await youtube(page))!.calls.filter(([name]) => name === 'loadVideoById')).toHaveLength(playing.calls.filter(([name]) => name === 'loadVideoById').length);
  await page.getByRole('link', { name: 'Back to Library', exact: true }).click();
  await expect(page).toHaveURL(/view=library/);
});
