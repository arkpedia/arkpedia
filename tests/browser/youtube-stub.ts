import { expect, type Page } from '@playwright/test';
import { openMusicMenu } from './music-navigation-helpers';

/*
 * A stand-in for YouTube's iframe API (https://www.youtube.com/iframe_api), so the music player's
 * checks need no network. The player (lib/music/musicPlayerContext.tsx) drives YouTube only
 * through YT.Player and the methods below; the stub answers them the way YouTube does (its
 * methods appear once the player is ready, a cue is "cued", a load plays) and records what the
 * page asked of it in window.__yt. Like YouTube's, it puts its iframe where the container was.
 *
 * `policy` stands for the browser's autoplay rule, read as each document loads the API:
 *  - 'allow': sound may start any time (a browser that lets this site autoplay);
 *  - 'refuse': only within a few seconds of the reader's own press in this document, as Safari
 *    does, and Chrome for a page the reader has not used; YouTube then fires onAutoplayBlocked;
 *  - 'refuse-silently': the same, without that event.
 */
export type AutoplayPolicy = 'allow' | 'refuse' | 'refuse-silently';

const stub = (policy: AutoplayPolicy) => `(() => {
  const initial = window.__yt = { calls: [], state: -1, videoId: '', start: 0, startedAt: 0, players: 0, refused: 0, policy: ${JSON.stringify(policy)} };
  initial.time = () => initial.state === 1 ? initial.start + (Date.now() - initial.startedAt) / 1000 : initial.start;
  // A press in this document (a browser counts its own, not one carried over from the last).
  let pressedAt = 0;
  for (const type of ['pointerdown', 'keydown']) window.addEventListener(type, () => { pressedAt = Date.now(); }, true);
  function Player(el, opts) {
    const S = el.id === 'arkpedia-page-audio' ? (window.__pageYt = { ...initial, calls: [], state: -1, videoId: '', start: 0, startedAt: 0, players: 0 }) : initial;
    S.time = () => S.state === 1 ? S.start + (Date.now() - S.startedAt) / 1000 : S.start;
    S.players += 1;
    // As YouTube's: the size it is given, no border, the element's id.
    const frame = document.createElement('iframe');
    frame.title = 'YouTube video player';
    frame.width = String((opts && opts.width) || 640);
    frame.height = String((opts && opts.height) || 360);
    frame.setAttribute('frameborder', '0');
    if (el.id) frame.id = el.id;
    el.replaceWith(frame);
    const events = (opts && opts.events) || {};
    const player = this;
    // An asynchronous YouTube failure arrives after the pending state notification.
    S.fail = () => setTimeout(() => { S.state = -1; if (events.onError) events.onError({ target: player, data: 100 }); }, 20);
    const emit = (state) => { S.state = state; setTimeout(() => events.onStateChange && events.onStateChange({ data: state, target: player }), 10); };
    S.finish = () => emit(0);
    const video = (arg) => typeof arg === 'string' ? { videoId: arg, startSeconds: 0 } : { videoId: arg.videoId, startSeconds: arg.startSeconds || 0 };
    const mayPlay = () => S.policy === 'allow' || Date.now() - pressedAt < 5000;
    const play = () => {
      if (!S.videoId || S.state === 1) return;
      if (!mayPlay()) {
        S.refused += 1;
        if (S.policy === 'refuse') setTimeout(() => events.onAutoplayBlocked && events.onAutoplayBlocked({ target: player }), 10);
        emit(-1);
        return;
      }
      S.startedAt = Date.now();
      emit(1);
    };
    const methods = {
      loadVideoById(arg) { const v = video(arg); S.calls.push(['loadVideoById', v]); S.state = -1; S.videoId = v.videoId; S.start = v.startSeconds; play(); },
      cueVideoById(arg) { const v = video(arg); S.calls.push(['cueVideoById', v]); S.videoId = v.videoId; S.start = v.startSeconds; emit(5); },
      playVideo() { S.calls.push(['playVideo']); play(); },
      pauseVideo() { S.calls.push(['pauseVideo']); S.start = S.time(); emit(2); },
      seekTo(seconds) { S.calls.push(['seekTo', seconds]); S.start = seconds; S.startedAt = Date.now(); },
      getCurrentTime() { return S.time(); },
      getDuration() { return 240; },
      getPlayerState() { return S.state; },
      getVideoData() { return { video_id: S.videoId, title: 'Stub ' + S.videoId }; },
      getPlaylist() { return []; },
      setVolume(v) { S.volume = v; }, mute() {}, unMute() {}, destroy() { S.state = 2; S.destroyed = true; frame.remove(); },
    };
    setTimeout(() => { Object.assign(player, methods); if (events.onReady) events.onReady({ target: player }); }, 50);
  }
  window.YT = { Player, PlayerState: { UNSTARTED: -1, ENDED: 0, PLAYING: 1, PAUSED: 2, BUFFERING: 3, CUED: 5 } };
  if (typeof window.onYouTubeIframeAPIReady === 'function') window.onYouTubeIframeAPIReady();
})();`;

export interface YouTubeStub { policy: AutoplayPolicy }

/** The player's Data saver setting (lib/music/musicPlayerContext.tsx, MUSIC_DATA_SAVER_KEY). */
export const DATA_SAVER_KEY = 'arkpediaMusicDataSaver';

/** Every later document of this page gets the stub in place of YouTube, which is never reached;
 *  set `policy` before a load to change the autoplay rule for it.
 *
 *  Every song with a Monster Siren id plays from Monster Siren's own file unless the reader turns
 *  on Data saver -- and the catalogue gives one to nearly every song on YouTube -- so a check that
 *  stubs YouTube to watch the player drive it starts with Data saver on (where the reader's tab
 *  has not set it), and YouTube plays every song that has a video, as it did before Monster Siren
 *  playback. `dataSaver: false` leaves the setting alone: the default, checked by
 *  music-data-saver.spec.ts. */
export async function stubYouTube(page: Page, policy: AutoplayPolicy = 'allow', { dataSaver = true, mediaConsent = true }: { dataSaver?: boolean; mediaConsent?: boolean } = {}): Promise<YouTubeStub> {
  const control: YouTubeStub = { policy };
  if (mediaConsent) await page.addInitScript(() => localStorage.setItem('arkpedia:privacy:v1', JSON.stringify({ version: 1, analytics: false, externalMedia: true, savedAt: Date.now() })));
  if (dataSaver) {
    await page.addInitScript((key) => {
      try { if (localStorage.getItem(key) === null) localStorage.setItem(key, 'true'); } catch { /* an opaque origin */ }
    }, DATA_SAVER_KEY);
  }
  await page.route(/^https:\/\/([a-z0-9-]+\.)?(youtube\.com|youtube-nocookie\.com|ytimg\.com|googlevideo\.com)\//, (route) => (route.request().url().startsWith('https://www.youtube.com/iframe_api')
    ? route.fulfill({ status: 200, contentType: 'text/javascript', body: stub(control.policy) })
    : route.fulfill({ status: 404, body: '' })));
  return control;
}

export type StubCall = [string, { videoId: string; startSeconds: number } | number | undefined];
export interface StubState { calls: StubCall[]; state: number; videoId: string; players: number; refused: number; time: number }

/** What the stub has been asked and where it is, or null before this document loaded it. */
export function youtube(page: Page): Promise<StubState | null> {
  return page.evaluate(() => {
    const yt = (window as unknown as { __yt?: StubState & { time: () => number } }).__yt;
    return yt ? { calls: yt.calls, state: yt.state, videoId: yt.videoId, players: yt.players, refused: yt.refused, time: yt.time() } : null;
  });
}

/** Opens the corner player and presses Play, as a reader does; resolves once the song plays. */
export async function startMusic(page: Page): Promise<StubState> {
  const original = page.url();
  const player = page.locator('.music-player');
  // Autoplay off for this setup: with nothing queued, Play then opens the library to choose a
  // song, the known one this starts. (With autoplay on, the default, Play starts autoplay where
  // the reader is: music-polish.spec.ts.)
  await page.evaluate(() => localStorage.setItem('arkpediaMusicAutoplay', 'false'));
  await page.reload();
  await player.getByRole('button', { name: 'Expand player' }).click();
  await player.getByRole('button', { name: /^(Play|Starting…)$/ }).click();
  await expect(page).toHaveURL(/view=library/);
  await page.locator('.music-library-row .music-song-row-main').first().click();
  await expect.poll(async () => (await youtube(page))?.state ?? null, { timeout: 20000 }).toBe(1);
  // The stub marks PLAYING before delivering onStateChange. Wait for the app to
  // acknowledge it before this setup navigation; the resume test drives its own reload.
  await expect(page.getByRole('region', { name: 'Player', exact: true }).getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
  await page.goto(original);
  await expect.poll(async () => (await youtube(page))?.state ?? null, { timeout: 20000 }).toBe(1);
  return (await youtube(page))!;
}

/** Marks this document, so a check can tell whether a later one replaced it. */
export async function markDocument(page: Page) {
  await page.evaluate(() => { (window as unknown as { __sameDocument?: boolean }).__sameDocument = true; });
}
export function sameDocument(page: Page): Promise<boolean> {
  return page.evaluate(() => (window as unknown as { __sameDocument?: boolean }).__sameDocument === true);
}

/** Explicitly choose the whole catalogue for regressions that need a populated queue.
 * Fresh visits themselves now have an empty queue. This uses the real playlist action. */
export async function playAllSongs(page: Page) {
  await openMusicMenu(page);
  await page.getByRole('button', { name: 'Playlists', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Music playlists', exact: true });
  await expect(dialog.getByRole('button', { name: 'Play all songs', exact: true })).toBeEnabled();
  await dialog.getByRole('button', { name: 'Play all songs', exact: true }).click();
  await expect(dialog.getByRole('status')).toContainText('Playing all songs');
  await expect.poll(async () => (await youtube(page))?.state).toBe(1);
  await dialog.getByRole('button', { name: 'Close Music playlists', exact: true }).click();
  if (new URL(page.url()).searchParams.get('view') === 'queue') await expect(page.locator('[data-song-list] .music-queue-row.current')).toBeVisible();
}
