import { chooseMusicView, musicViewLink, openMusicMenu, clickMusicControl } from './music-navigation-helpers';
import fs from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { stubYouTube, youtube } from './youtube-stub';

const all = JSON.parse(fs.readFileSync('public/music-catalogue.json', 'utf8')).songs as { videoId: string; title: string; altTitle?: string; artist?: string; copyright?: boolean }[];
const letter = all.find(song => /酸橙色信笺|Letter in Orange/.test(song.title + song.altTitle))!;
const songs = [letter, ...all.filter(song => song.videoId !== letter.videoId && !song.copyright).slice(0, 3)];
const bar = (page: Page) => page.getByRole('region', { name: 'Player', exact: true });
const nav = (page: Page) => page.getByRole('navigation', { name: 'Music', exact: true });
const libraryRow = (page: Page, i: number) => page.locator(`.music-library-row[data-song-id="${songs[i].videoId}"]`);
const queueRows = (page: Page) => page.locator('[data-song-list] .music-queue-row[data-song-id]');

async function setup(page: Page) {
  await stubYouTube(page);
  await page.route(/\/music-catalogue\.json(?:\?|$)/, route => route.fulfill({ json: { songs } }));
  await page.route(new RegExp(`/lyrics/${letter.videoId}\\.json`), route => route.fulfill({ json: [0, 10, 20, 30, 40].map(time => ({ time, text: `Lyric at ${time}` })) }));
  await page.goto('/music?view=library');
  await expect(libraryRow(page, 0)).toBeVisible();
}
async function add(page: Page, i: number, action = 'Add to queue') {
  const row = libraryRow(page, i);
  if (test.info().project.name === 'mobile') {
    await row.getByRole('button', { name: /^More actions/ }).click();
    await page.getByRole('dialog', { name: 'Song actions', exact: true }).getByRole('button', { name: action, exact: true }).click();
  } else await row.getByRole('button', { name: new RegExp(`^${action}:`) }).click();
}
async function start(page: Page) {
  await libraryRow(page, 0).locator('.music-song-row-main').click();
  await expect.poll(async () => (await youtube(page))?.videoId).toBe(letter.videoId);
  await expect.poll(async () => (await youtube(page))?.state).toBe(1);
}

test('1: queue count excludes played history during autoplay and shuffle', async ({ page }) => {
  await setup(page);
  await chooseMusicView(page, /^Queue/);
  await expect(queueRows(page)).toHaveCount(0);
  await expect(page.getByRole('heading', { name: test.info().project.name === 'mobile' ? 'Queue' : 'Your queue', exact: true })).toBeVisible();
  const automatic = page.getByRole('region', { name: 'Autoplay from library', exact: true });
  await expect(automatic.getByRole('checkbox')).toBeChecked();
  await automatic.getByRole('button', { name: 'Autoplay from library', exact: true }).click();
  await expect(automatic.locator('.music-autoplay-row .music-song-row-main')).toHaveCount(4);
  await automatic.getByRole('checkbox').uncheck();
  await page.reload();
  await expect(automatic.getByRole('checkbox'), 'turned off, it stays off').not.toBeChecked();
  await automatic.getByRole('checkbox').check();
  await page.reload();
  await expect(automatic.getByRole('checkbox')).toBeChecked();
  await expect(queueRows(page)).toHaveCount(0);
  await chooseMusicView(page, 'Library');
  await add(page, 1); await add(page, 2);
  await chooseMusicView(page, /^Queue/);
  await expect(queueRows(page)).toHaveCount(2);
  const badge = musicViewLink(page, /^Queue/).locator('.music-workspace-count');
  await expect(badge).toContainText('2');
  expect(await queueRows(page).evaluateAll(rows => rows.map(row => (row as HTMLElement).dataset.songId))).toEqual([songs[1].videoId, songs[2].videoId]);
  expect(await page.evaluate(() => innerWidth)).toBe(page.viewportSize()!.width);
  await clickMusicControl(page, 'Play');
  await expect.poll(async () => (await youtube(page))?.videoId).toBe(songs[1].videoId);
  await expect(badge).toContainText('1');
  await clickMusicControl(page, 'Next track');
  await expect.poll(async () => (await youtube(page))?.videoId).toBe(songs[2].videoId);
  await expect(badge).toHaveCount(0);
  await clickMusicControl(page, 'Next track');
  await expect.poll(async () => (await youtube(page))?.videoId).toBe(songs[3].videoId);
  await expect(badge).toHaveCount(0);
  await clickMusicControl(page, 'Shuffle');
  await page.getByRole('button', { name: /^Played earlier/ }).click();
  await expect(queueRows(page)).toHaveCount(2);
  await expect(badge).toHaveCount(0);
  await chooseMusicView(page, 'Library');
  await add(page, 0, 'Play next');
  await expect(badge).toContainText('1');
  await clickMusicControl(page, 'Next track');
  await expect.poll(async () => (await youtube(page))?.videoId).toBe(letter.videoId);
  await clickMusicControl(page, 'Next track');
  await expect.poll(async () => (await youtube(page))?.videoId).toBe(songs[3].videoId);
  await clickMusicControl(page, 'Repeat: off');
  const loads = (await youtube(page))!.calls.filter(([name]) => name === 'loadVideoById').length;
  await page.evaluate(() => (window as unknown as { __yt: { finish: () => void } }).__yt.finish());
  await expect.poll(async () => (await youtube(page))!.calls.filter(([name]) => name === 'loadVideoById').length).toBe(loads + 1);
  expect((await youtube(page))!.videoId).toBe(songs[3].videoId);
});

test('2: playback is independently centered, with Shuffle beside Repeat on the right', async ({ page }) => {
  await setup(page); await start(page);
  await chooseMusicView(page, 'Now playing');
  const widths = test.info().project.name === 'mobile' ? [320, 375, 390, 430] : [768, 1024, 1440];
  for (const width of widths) {
    await page.setViewportSize({ width, height: 844 });
    await expect(bar(page).locator('.music-player-bottombar-controls')).toHaveCSS('display', width >= 1000 ? 'contents' : 'grid');
    const controls = await (width >= 1000 ? bar(page) : bar(page).locator('.music-player-bottombar-controls')).boundingBox();
    const playback = await bar(page).locator('.music-transport-playback').boundingBox();
    expect(Math.abs(playback!.x + playback!.width / 2 - controls!.x - controls!.width / 2)).toBeLessThan(2);
    const shuffle = await bar(page).getByRole('button', { name: 'Shuffle', exact: true }).boundingBox();
    const repeat = await bar(page).getByRole('button', { name: /^Repeat:/ }).boundingBox();
    expect(shuffle!.y).toBe(repeat!.y); expect(repeat!.x).toBeGreaterThan(shuffle!.x);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
});

test('3: bottom Queue toggles to Now playing and back, including browser history', async ({ page }) => {
  await setup(page); await start(page);
  const before = (await youtube(page))!;
  await bar(page).getByRole('link', { name: 'Queue', exact: true }).click();
  await expect(page).toHaveURL(/view=queue/);
  await bar(page).getByRole('link', { name: 'Now playing', exact: true }).click();
  await expect(page).toHaveURL(/view=player/);
  await page.goBack(); await expect(page).toHaveURL(/view=queue/);
  await page.goForward(); await expect(page).toHaveURL(/view=player/);
  expect((await youtube(page))!).toMatchObject({ players: 1, state: 1, videoId: before.videoId });
  expect((await youtube(page))!.calls.filter(([name]) => name === 'loadVideoById').length).toBe(before.calls.filter(([name]) => name === 'loadVideoById').length);
});

test('4: desktop lyrics stay expanded and timed lines seek without moving the player', async ({ page }, info) => {
  await setup(page); await start(page);
  await chooseMusicView(page, 'Now playing');
  const lines = page.locator('#music-lyrics .music-lyric-line:visible');
  if (info.project.name === 'mobile') {
    await expect(lines).toHaveCount(3);
    await page.getByRole('button', { name: 'Expand lyrics', exact: true }).click();
  } else {
    await expect(page.getByRole('button', { name: /(?:Expand|Collapse) lyrics/ })).toBeHidden();
    await expect.poll(async () => {
      const panel = (await page.locator('#music-lyrics').boundingBox())!;
      const art = (await page.locator('.music-now-playing-cover').boundingBox())!;
      const next = (await page.locator('.music-up-next').boundingBox())!;
      const wave = (await page.locator('.music-wave-visualizer').boundingBox())!;
      const nextHeading = (await page.locator('.music-up-next-heading').boundingBox())!;
      return Math.max(Math.abs(panel.y - art.y), Math.abs(next.x + next.width - art.x - art.width), Math.abs(wave.y + wave.height / 2 - nextHeading.y - nextHeading.height / 2));
    }).toBeLessThan(2);
    expect((await page.locator('#music-lyrics').boundingBox())!.height, 'short lyrics fit their content').toBeLessThan(330);
    const spacing = await lines.first().evaluate(el => ({ margin: parseFloat(getComputedStyle(el).marginBottom), height: el.getBoundingClientRect().height }));
    expect(spacing.margin).toBeLessThanOrEqual(8);
    expect(spacing.height + spacing.margin).toBeLessThan(56);
  }
  await expect(lines).toHaveCount(5);
  const before = (await page.locator('.music-up-next').boundingBox())!.y + await page.evaluate(() => scrollY);
  const loadCount = (await youtube(page))!.calls.filter(([call]) => call === 'loadVideoById').length;
  await page.getByRole('button', { name: 'Seek to 0:20: Lyric at 20', exact: true }).click();
  await expect.poll(async () => (await youtube(page))!.calls.filter(([call]) => call === 'seekTo').at(-1)?.[1]).toBe(20);
  await expect.poll(async () => (await youtube(page))!.time).toBeGreaterThanOrEqual(20);
  await page.getByRole('button', { name: 'Seek to 0:10: Lyric at 10', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await youtube(page))!.calls.filter(([call]) => call === 'seekTo').at(-1)?.[1]).toBe(10);
  expect((await youtube(page))!.calls.filter(([call]) => call === 'loadVideoById')).toHaveLength(loadCount);
  expect(Math.abs((await page.locator('.music-up-next').boundingBox())!.y + await page.evaluate(() => scrollY) - before)).toBeLessThan(2);
  if (info.project.name === 'mobile') {
    await page.getByRole('button', { name: 'Collapse lyrics', exact: true }).click();
    await expect(lines).toHaveCount(3);
    await bar(page).getByRole('link', { name: 'Lyrics', exact: true }).click();
    await expect(lines).toHaveCount(5);
  }
  await expect(page.locator('.music-up-next-list > li')).toHaveCount(1);
  expect(await page.locator('#music-lyrics').evaluate(el => { const s = getComputedStyle(el); return [s.scrollbarWidth, s.backgroundColor, s.borderTopWidth]; })).toEqual(['none', 'rgba(0, 0, 0, 0)', '0px']);
  fs.mkdirSync('.cache/music-polish-qa', { recursive: true });
  await page.screenshot({ path: `.cache/music-polish-qa/lyrics-${info.project.name}.png` });
});

test('5: compact header and queue gutters prioritize phone titles', async ({ page }) => {
  await setup(page); await start(page); await add(page, 1);
  await chooseMusicView(page, /^Queue/);
  if (test.info().project.name === 'mobile') {
    const header = await page.locator('.page-header').boundingBox();
    expect(header!.height).toBeLessThan(100);
    const title = await queueRows(page).first().locator('.music-song-row-main').boundingBox();
    const row = await queueRows(page).first().boundingBox();
    expect(title!.width / row!.width).toBeGreaterThan(0.6);
    const handle = await queueRows(page).last().locator('.music-queue-drag-handle').boundingBox();
    expect(handle!.width).toBeLessThanOrEqual(24);
  }
  fs.mkdirSync('.cache/music-polish-qa', { recursive: true });
  await page.screenshot({ path: `.cache/music-polish-qa/queue-${test.info().project.name}.png` });
});

test('6: Repeat all preview and next wrap to the same first chosen song', async ({ page }) => {
  await setup(page); await start(page); await add(page, 1); await add(page, 2);
  await clickMusicControl(page, 'Next track');
  await expect.poll(async () => (await youtube(page))?.videoId).toBe(songs[1].videoId);
  await clickMusicControl(page, 'Next track');
  await expect.poll(async () => (await youtube(page))?.videoId).toBe(songs[2].videoId);
  await clickMusicControl(page, 'Repeat: off');
  await clickMusicControl(page, 'Repeat: one');
  await chooseMusicView(page, 'Now playing');
  await expect(page.locator('.music-up-next-row .music-song-row-title').first()).toHaveText(letter.altTitle || letter.title);
  await clickMusicControl(page, 'Next track');
  await expect.poll(async () => (await youtube(page))?.videoId).toBe(letter.videoId);
});

test('7: volume is horizontal and contained on desktop, hidden on phones', async ({ page }) => {
  await setup(page); await start(page);
  const slider = bar(page).getByRole('slider', { name: 'Volume', exact: true });
  if (test.info().project.name === 'mobile') await expect(slider).toBeHidden();
  else {
    await expect(slider).toBeVisible();
    const rect = await slider.boundingBox(), outer = await bar(page).boundingBox();
    expect(rect!.x).toBeGreaterThanOrEqual(outer!.x); expect(rect!.x + rect!.width).toBeLessThanOrEqual(outer!.x + outer!.width);
    expect(await slider.evaluate(el => getComputedStyle(el).writingMode)).toBe('horizontal-tb');
  }
});

test('8: all music views reserve measured safe clearance above the fixed bar', async ({ page }) => {
  await setup(page); await start(page);
  for (const name of ['Now playing', 'Library', 'Queue', 'Discover']) {
    await chooseMusicView(page, new RegExp(`^${name}`));
    await expect(musicViewLink(page, new RegExp(`^${name}`))).toHaveAttribute('aria-current', 'page');
    await expect(bar(page)).toBeVisible();
    await expect.poll(() => page.locator('main').evaluate(el => parseFloat(getComputedStyle(el).paddingBottom))).toBeGreaterThan((await bar(page).boundingBox())!.height);
    if (name === 'Queue' || name === 'Library') {
      await expect.poll(async () => {
        const list = await page.locator(name === 'Queue' ? '[data-song-list]' : '.music-all-songs-list').boundingBox();
        return list!.y + list!.height - (await bar(page).boundingBox())!.y;
      }).toBeLessThanOrEqual(0);
      if (name === 'Library' && page.viewportSize()!.width > 900) {
        // A late desktop nav measurement commits its spacer in a separate render.
        // That moves the view without a window resize or changing the music tabs.
        const spacer = page.locator('.site-nav-spacer');
        const height = await spacer.evaluate(el => (el as HTMLElement).style.height);
        await spacer.evaluate(el => { (el as HTMLElement).style.height = `${el.getBoundingClientRect().height + 54}px`; });
        await expect.poll(async () => {
          const list = await page.locator('.music-all-songs-list').boundingBox();
          return list!.y + list!.height - (await bar(page).boundingBox())!.y;
        }).toBeLessThanOrEqual(0);
        await spacer.evaluate((el, saved) => { (el as HTMLElement).style.height = saved; }, height);
      }
    }
    if (name === 'Now playing') {
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      const content = await page.locator('.music-up-next').boundingBox(), player = await bar(page).boundingBox();
      expect(content!.y + content!.height).toBeLessThanOrEqual(player!.y);
    }
  }
});

test('9: localized title stays identical across Now playing, Queue and both bars after time and navigation', async ({ page }) => {
  await setup(page); await start(page);
  const title = letter.altTitle || letter.title;
  await chooseMusicView(page, 'Now playing');
  await expect(page.locator('.music-now-playing-song-info h2')).toHaveText(title);
  await expect(bar(page).locator('.music-transport-song-title')).toHaveText(title);
  await chooseMusicView(page, /^Queue/);
  await expect(queueRows(page).first().locator('.music-song-row-main')).toContainText(title);
  await expect(bar(page).locator('.music-transport-song-title')).toHaveText(title);
  await chooseMusicView(page, 'Discover');
  await expect(bar(page).locator('.music-transport-song-title')).toHaveText(title);
  await page.waitForTimeout(8500);
  await expect(bar(page).locator('.music-transport-song-title')).toHaveText(title);
});

test('a song kept out of autoplay leaves the autoplay list, is never picked, and can be let back', async ({ page }) => {
  await setup(page);
  const mobile = test.info().project.name === 'mobile';
  await chooseMusicView(page, /^Queue/);
  const automatic = page.getByRole('region', { name: 'Autoplay from library', exact: true });
  await expect(automatic.getByRole('checkbox'), 'autoplay is on by default').toBeChecked();
  await automatic.getByRole('button', { name: 'Autoplay from library', exact: true }).click();
  const rows = automatic.locator('.music-autoplay-row');
  await expect(rows).toHaveCount(4);
  const out = await rows.first().getAttribute('data-song-id');
  if (mobile) {
    await rows.first().getByRole('button', { name: /^More actions/ }).click();
    await page.getByRole('dialog', { name: 'Song actions', exact: true }).getByRole('button', { name: "Don't autoplay", exact: true }).click();
  } else await rows.first().getByRole('button', { name: /^Don't autoplay:/ }).click();
  await expect(rows).toHaveCount(3);
  await expect(automatic.locator(`.music-autoplay-row[data-song-id="${out}"]`)).toHaveCount(0);
  await expect(automatic.getByText('1 song is kept out of autoplay.')).toBeVisible();
  await page.reload();
  await automatic.getByRole('button', { name: 'Autoplay from library', exact: true }).click();
  await expect(rows, 'kept out across a reload').toHaveCount(3);
  // Still the reader's to play: the library row shows it kept out, and plays it when chosen.
  await chooseMusicView(page, 'Library');
  const libraryOut = page.locator(`.music-library-row[data-song-id="${out}"]`);
  if (!mobile) await expect(libraryOut.getByRole('button', { name: /^Don't autoplay:/ })).toHaveAttribute('aria-pressed', 'true');
  await libraryOut.locator('.music-song-row-main').click();
  await expect.poll(async () => (await youtube(page))?.videoId).toBe(out);
  await chooseMusicView(page, /^Queue/);
  await automatic.getByRole('button', { name: 'Let it back', exact: true }).click();
  await expect(automatic.getByText(/kept out of autoplay/)).toHaveCount(0);
});


test('lyrics follow successive lines; mobile navigation fits without a horizontal drag', async ({ page }) => {
  await setup(page);
  await page.route(new RegExp(`/lyrics/${letter.videoId}\\.json`), route => route.fulfill({ json: Array.from({ length: 30 }, (_, i) => ({ time: i * 10, text: `Sung line ${i}` })) }));
  await start(page);
  await chooseMusicView(page, 'Now playing');
  const mobile = test.info().project.name === 'mobile';
  if (mobile) await page.getByRole('button', { name: 'Expand lyrics', exact: true }).click();
  const panel = page.locator('#music-lyrics');
  for (const time of [100, 150]) {
    await page.evaluate(time => {
      const player = (window as unknown as { __yt: { start: number; startedAt: number } }).__yt;
      player.start = time; player.startedAt = Date.now();
    }, time);
    await expect(panel.locator('.active')).toHaveText(`Sung line ${time / 10}`);
    await expect.poll(() => panel.evaluate(el => {
      const line = el.querySelector('.active')!.getBoundingClientRect();
      const box = el.getBoundingClientRect();
      return Math.abs((line.top + line.bottom) / 2 - (box.top + box.bottom) / 2);
    })).toBeLessThan(8);
  }
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect.poll(() => panel.locator('.active').evaluate(el => getComputedStyle(el).transitionDuration)).toBe('0s');
  for (const theme of ['dark', 'light']) {
    await page.evaluate(theme => document.documentElement.dataset.theme = theme, theme);
    for (const width of mobile ? [360, 412] : [1000, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.evaluate(() => window.scrollTo(0, 0));
      if (mobile) {
        expect((await page.locator('.page-header').boundingBox())!.height).toBeLessThanOrEqual(80);
        await openMusicMenu(page);
      }
      const bounds = await nav(page).evaluate(el => {
        const box = el.getBoundingClientRect();
        return { width: el.clientWidth, scroll: el.scrollWidth, links: Array.from(el.querySelectorAll('a')).map(link => {
          const r = link.getBoundingClientRect();
          return { fits: r.left >= box.left && r.right <= box.right, height: r.height };
        }) };
      });
      expect(bounds.scroll).toBeLessThanOrEqual(bounds.width);
      expect(bounds.links.every(link => link.fits && link.height >= (mobile ? 40 : 32))).toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: `.cache/music-polish-qa/player-${width}-${theme}.png` });
      if (mobile) {
        await page.keyboard.press('Escape');
        await expect(page.getByRole('button', { name: 'Music menu', exact: true })).toBeFocused();
        await expect(page.getByRole('dialog', { name: 'Music', exact: true })).not.toBeVisible();
        await page.screenshot({ path: `.cache/music-polish-qa/player-${width}-${theme}-closed.png` });
      }
    }
  }
  await chooseMusicView(page, /^Queue/);
  await page.goBack();
  await expect(page).toHaveURL(/view=player/);
  expect((await youtube(page))!.videoId).toBe(letter.videoId);
});
