import { test, expect, type Page } from './request-diagnostics';
import type { EventVideo } from '../../lib/events/eventVideos';
import { startMusic, stubYouTube, youtube } from './youtube-stub';

/*
 * The event page's PVs tab (components/events/EventVideos.tsx): the event's official videos, a
 * thumbnail each until the reader presses one. The page's props come from the content release, and
 * one compiled before the tab has no `videos`, so the test gives the page its own in __NEXT_DATA__,
 * as event-news.spec.ts does, and checks the page rather than the release. YouTube's player is
 * answered with an empty page here: nothing leaves for YouTube, and nothing plays.
 */
const CPT = '[Celebration] Critical Phase Transition';
const VIDEOS: EventVideo[] = [
  { videoId: '1pQ8W0LftHU', title: 'Arknights Official Trailer - Critical Phase Transition', kind: 'trailer', published: '2026-10-12T08:00:17Z' },
  { videoId: 'kUbe_9aWz-k', title: 'Arknights Animation PV - Critical Phase Transition', kind: 'animation', published: '2026-10-07T13:50:13Z' },
  { videoId: 'gUAcO0qvaQc', title: "Arknights - Kal'tsit Esperanta Preview", kind: 'operator', published: '2026-10-13T09:00:10Z' },
];

async function withVideos(page: Page, videos: EventVideo[], event = CPT) {
  // The page data given below is not what the server rendered, so a development server lays its
  // error overlay over the page, which takes the clicks; a production build has none.
  await page.addInitScript(() => {
    const hide = () => document.head?.append(Object.assign(document.createElement('style'), { textContent: 'nextjs-portal { display: none !important; }' }));
    if (document.head) hide(); else document.addEventListener('DOMContentLoaded', hide, { once: true });
  });
  await page.route((url) => decodeURIComponent(url.pathname) === `/events/${event}`, async (route) => {
    const html = await (await route.fetch()).text();
    const body = html.replace(/(<script id="__NEXT_DATA__" type="application\/json"[^>]*>)([\s\S]*?)(<\/script>)/, (_, open: string, json: string, close: string) => {
      const data = JSON.parse(json);
      data.props.pageProps.videos = videos;
      return open + JSON.stringify(data).replace(/</g, '\\u003c') + close;
    });
    await route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body });
  });
  // A stand-in for YouTube's embed that keeps every message the page sends it, as YouTube's player
  // reads its commands (enablejsapi=1).
  await page.route(/youtube-nocookie\.com\/embed\//, (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>player</title><script>window.__got = []; addEventListener("message", (event) => window.__got.push(String(event.data)));</script>' }));
}

/** The messages the embed on the page has been sent. */
async function embedMessages(page: Page): Promise<string[]> {
  const frame = page.frames().find((candidate) => candidate.url().includes('youtube-nocookie.com/embed/'));
  return frame ? frame.evaluate(() => (window as unknown as { __got: string[] }).__got) : [];
}

const sectionTab = (page: Page, name: string) => page.getByRole('tab', { name, exact: true }).or(page.getByRole('button', { name, exact: true })).first();

test('the PVs tab lists the event\'s official videos and puts a player in only for the one pressed', async ({ page }, info) => {
  await withVideos(page, VIDEOS);
  await page.goto(`/events/${encodeURIComponent(CPT)}#pvs`);
  await expect(sectionTab(page, 'PVs')).toBeVisible();
  const figures = page.locator('.event-videos .event-video');
  await expect(figures).toHaveCount(3);
  await expect(figures.first().locator('.event-video-meta')).toHaveText('Official trailer · 12 Oct 2026');
  await expect(figures.first().getByRole('link', { name: VIDEOS[0].title })).toHaveAttribute('href', 'https://www.youtube.com/watch?v=1pQ8W0LftHU');
  // Opening the tab loads no player.
  const players = page.locator('iframe[src*="youtube-nocookie.com/embed/"]');
  await expect(players).toHaveCount(0);

  const frame = figures.first().locator('.event-video-frame');
  const before = await frame.boundingBox();
  await figures.first().getByRole('button', { name: `Play ${VIDEOS[0].title}` }).click();
  const consent = page.getByRole('dialog', { name: 'Allow external media?', exact: true });
  await expect(consent).toBeVisible();
  await expect(players).toHaveCount(0);
  await consent.getByRole('button', { name: 'Keep disabled', exact: true }).click();
  await expect(players).toHaveCount(0);
  await figures.first().getByRole('button', { name: `Play ${VIDEOS[0].title}` }).click();
  await consent.getByRole('button', { name: 'Allow external media', exact: true }).click();
  await expect(players).toHaveCount(1);
  const src = new URL(await players.first().getAttribute('src') ?? '');
  expect(src.pathname).toBe('/embed/1pQ8W0LftHU');
  expect(src.searchParams.get('autoplay')).toBe('1');
  expect(src.searchParams.get('enablejsapi')).toBe('1');
  // The player takes the picture's box: the page is no taller or shorter for it.
  const after = await frame.boundingBox();
  expect(Math.abs((after?.height ?? 0) - (before?.height ?? -1))).toBeLessThan(1);

  // One at a time: the next one pressed takes the player, and the first is a picture again.
  await figures.nth(1).getByRole('button', { name: `Play ${VIDEOS[1].title}` }).click();
  await expect(players).toHaveCount(1);
  expect(new URL(await players.first().getAttribute('src') ?? '').pathname).toBe('/embed/kUbe_9aWz-k');
  await expect(figures.first().getByRole('button', { name: `Play ${VIDEOS[0].title}` })).toBeVisible();

  // No sideways scroll at a phone's width.
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  await page.screenshot({ path: info.outputPath('cpt-pvs.png'), fullPage: false });
});

test('an event with no official videos has no PVs tab', async ({ page }) => {
  await withVideos(page, []);
  await page.goto(`/events/${encodeURIComponent(CPT)}#pvs`);
  await expect(sectionTab(page, 'Rewards')).toBeVisible();
  await expect(page.getByRole('tab', { name: 'PVs', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'PVs', exact: true })).toHaveCount(0);
});

test('pressing a video pauses the song, and playing the song again pauses the video', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'the player is the same at every width');
  test.setTimeout(90_000);
  // The music player's YouTube is the stub (youtube-stub.ts), registered first so the page and the
  // embed above, registered after it, take their own requests.
  await stubYouTube(page);
  await withVideos(page, VIDEOS);
  await page.goto(`/events/${encodeURIComponent(CPT)}#pvs`);
  await startMusic(page);
  const player = page.locator('.music-player');
  // The corner player folds away when the reader clicks elsewhere on the page.
  const control = async (name: string) => {
    if (await player.getByRole('button', { name: 'Expand player' }).isVisible()) await player.getByRole('button', { name: 'Expand player' }).click();
    return player.getByRole('button', { name, exact: true });
  };
  await expect(await control('Pause')).toBeVisible();
  // Opening the tab stopped nothing.
  await expect(sectionTab(page, 'PVs')).toBeVisible();
  expect((await youtube(page))?.state).toBe(1);

  await page.locator('.event-videos').getByRole('button', { name: `Play ${VIDEOS[0].title}` }).click();
  await expect.poll(async () => (await youtube(page))?.state).toBe(2);
  await expect.poll(() => page.frames().some((frame) => frame.url().includes('/embed/1pQ8W0LftHU'))).toBe(true);
  const play = await control('Play');
  await expect(play).toBeVisible();

  await play.click();
  await expect.poll(async () => (await youtube(page))?.state).toBe(1);
  await expect.poll(async () => (await embedMessages(page)).map((text) => JSON.parse(text).func)).toContain('pauseVideo');
});

test('a rerun\'s page lists its launch\'s videos too, each marked with the run it was released for', async ({ page }) => {
  const RERUN = '[Rerun] Under Tides Rerun';
  await withVideos(page, [
    { videoId: 'aaaaaaaaaaa', title: 'Arknights Animation PV - Under Tides Rerun', kind: 'animation', published: '2023-02-14T08:00:00Z', run: 'rerun' },
    { videoId: 'bbbbbbbbbbb', title: 'Arknights Official Trailer - Under Tides', kind: 'trailer', published: '2021-10-20T08:00:00Z', run: 'launch' },
  ], RERUN);
  await page.goto(`/events/${encodeURIComponent(RERUN)}#pvs`);
  const meta = page.locator('.event-videos .event-video-meta');
  await expect(meta).toHaveText([/^Animation PV · Rerun · /, /^Official trailer · Launch · /]);
});

test('a page that lists only its own run\'s videos marks no run', async ({ page }) => {
  await withVideos(page, VIDEOS.map((video) => ({ ...video, run: 'launch' as const })));
  await page.goto(`/events/${encodeURIComponent(CPT)}#pvs`);
  await expect(page.locator('.event-videos .event-video-meta').first()).toHaveText('Official trailer · 12 Oct 2026');
});
