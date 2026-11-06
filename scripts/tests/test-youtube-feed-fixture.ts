import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
// @ts-expect-error js-yaml ships no types; only load() is used.
import yaml from 'js-yaml';
import { getLatestVideos } from '../../lib/music/youtubeFeedsServer';
import { VIDEOS_PER_CHANNEL } from '../../lib/music/youtubeConfig';
import { channels as YOUTUBE_CHANNELS } from '../../data/youtube-creators.json';
import { filterArknightsVideos } from '../../lib/music/contentFilter';

/*
 * The Check's browser run reads the community pages' videos from a checked-in feed, not the
 * channels' live ones: every channel feed returned 404 for hours on 2026-09-27, the pages
 * built with "No videos found", and the picture-card census (at least one video card on
 * /community and /community/videos) failed 8 tests on main. This holds the three parts
 * that make that so, and the one that keeps production as it was:
 * - with ARKPEDIA_YOUTUBE_FEED_FIXTURE set, the reader never reaches the network and the
 *   pages get more than a page of cards;
 * - unset, it fetches every configured channel live, as before;
 * - set to a file that cannot be read, it fails, rather than render an empty feed;
 * - check.yml's Build step, its live-release build and the Playwright webServer all name
 *   the same file, so the pages prerender and regenerate from it, and no Check step reads
 *   a live channel feed (whose fetch has no timeout).
 */
const ENV = 'ARKPEDIA_YOUTUBE_FEED_FIXTURE';
const FIXTURE = 'tests/fixtures/youtube-feeds.xml';

async function withFetch<T>(stub: (url: string) => Promise<Response>, run: () => Promise<T>): Promise<{ result: T; urls: string[] }> {
  const real = globalThis.fetch;
  const urls: string[] = [];
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    urls.push(url);
    return stub(url);
  }) as typeof fetch;
  try {
    return { result: await run(), urls };
  } finally {
    globalThis.fetch = real;
  }
}

async function withEnv<T>(value: string | undefined, run: () => Promise<T>): Promise<T> {
  const before = process.env[ENV];
  if (value === undefined) delete process.env[ENV];
  else process.env[ENV] = value;
  try {
    return await run();
  } finally {
    if (before === undefined) delete process.env[ENV];
    else process.env[ENV] = before;
  }
}

test('with the fixture named, the videos come from it and nothing is fetched', async () => {
  const { result: videos, urls } = await withEnv(FIXTURE, () => withFetch(
    async (url) => { throw new Error(`the fixture run reached the network: ${url}`); },
    () => getLatestVideos(YOUTUBE_CHANNELS, VIDEOS_PER_CHANNEL),
  ));
  assert.deepEqual(urls, []);
  const shown = filterArknightsVideos(videos);
  // More than /community/videos' first 24-card batch, so it grows as it is read too.
  assert.ok(shown.length > 24, `the fixture gives ${shown.length} cards after the feed filter`);
  assert.ok(shown.length < videos.length, 'the fixture holds a title the feed filter drops');
  const labels = new Set(YOUTUBE_CHANNELS.map((c) => c.label));
  for (const v of videos) {
    assert.ok(labels.has(v.channelLabel), `${v.videoId} belongs to a configured channel`);
    assert.match(v.thumbnail, /^data:image\/svg\+xml;base64,/, `${v.videoId} draws its art with no network`);
  }
  const perChannel = new Map<string, number>();
  for (const v of videos) perChannel.set(v.channelLabel, (perChannel.get(v.channelLabel) ?? 0) + 1);
  assert.ok([...perChannel.values()].every((n) => n <= VIDEOS_PER_CHANNEL), 'no channel gives more than VIDEOS_PER_CHANNEL');
  const times = videos.map((v) => Date.parse(v.publishedAt));
  assert.deepEqual(times, [...times].sort((a, b) => b - a), 'newest first');
});

test('without the fixture, every configured channel is fetched live as before', async () => {
  const { urls } = await withEnv(undefined, () => withFetch(
    async () => new Response('not found', { status: 404 }),
    () => assert.rejects(() => getLatestVideos(YOUTUBE_CHANNELS, VIDEOS_PER_CHANNEL), /YouTube feeds unavailable/),
  ));
  assert.deepEqual(urls.sort(), YOUTUBE_CHANNELS.map((c) => `https://www.youtube.com/feeds/videos.xml?channel_id=${c.id}`).sort());
});

test('a fixture named but missing fails the build instead of showing no videos', async () => {
  await withEnv('tests/fixtures/no-such-feed.xml', async () => {
    await assert.rejects(() => getLatestVideos(YOUTUBE_CHANNELS, VIDEOS_PER_CHANNEL), /ENOENT/);
  });
});

test("check.yml's two builds and the Playwright webServer name the same fixture", () => {
  assert.ok(fs.existsSync(path.join(process.cwd(), FIXTURE)), `${FIXTURE} exists`);
  const workflow = yaml.load(fs.readFileSync('.github/workflows/check.yml', 'utf8')) as { jobs: { check: { steps: { name?: string; run?: string; env?: Record<string, string> }[] } } };
  const steps = workflow.jobs.check.steps;
  const build = steps.find((step) => step.name === 'Build');
  assert.equal(build?.env?.[ENV], FIXTURE, 'check.yml Build step env');
  // Every step that builds the site, by what it runs: the live-release build too.
  const builds = steps.filter((step) => /\b(?:npm run (?:--ignore-scripts )?build|next build)\b/.test(step.run ?? ''));
  assert.ok(builds.length >= 2, `check.yml builds the site in ${builds.length} step(s)`);
  for (const step of builds) assert.equal(step.env?.[ENV], FIXTURE, `check.yml "${step.name}" step env`);
  const config = fs.readFileSync('playwright.config.ts', 'utf8');
  const webServer = config.slice(config.indexOf('webServer'));
  assert.match(webServer, new RegExp(`${ENV}: '${FIXTURE.replace(/[./]/g, '\\$&')}'`), 'playwright.config.ts webServer env');
});
