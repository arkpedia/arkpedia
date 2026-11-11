import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import test from 'node:test';
import { getLatestVideos } from '../../lib/music/youtubeFeedsServer';
import { loadVideoArchive } from '../../lib/music/youtubeArchiveServer';
import { CONTENT_SCHEMA } from '../../lib/content/types';
import type { YouTubeVideo } from '../../lib/music/youtube';

const hash = (body: string) => createHash('sha256').update(body).digest('hex');
const archived: YouTubeVideo = { videoId: 'archived001', title: 'Arknights guide', channelLabel: 'Creator', publishedAt: '',
  thumbnail: 'https://i.ytimg.com/vi/archived001/hqdefault.jpg', url: 'https://www.youtube.com/watch?v=archived001',
  isLivestream: false, liveStatus: 'none', archived: true };

async function withArchive(videos: YouTubeVideo[], run: () => Promise<void>) {
  const page = JSON.stringify({ props: { videoArchive: videos } });
  const release = hash(page), revision = release.slice(0, 40);
  const manifest = JSON.stringify({ schema: CONTENT_SCHEMA, release, generatedAt: '2026-11-08T00:00:00Z', generator: revision,
    assets: { 'arkpedia-image-assets': revision, 'arkpedia-skin-assets': revision },
    pages: { '/community': { path: 'pages/community.json', bytes: Buffer.byteLength(page), sha256: hash(page) } }, files: {} });
  const pointer = JSON.stringify({ schema: CONTENT_SCHEMA, release, revision, manifestSha256: hash(manifest) });
  const server = createServer((request, response) => {
    const body = request.url === '/live/current.json' ? pointer : request.url === `/${revision}/release/manifest.json`
      ? manifest : request.url === `/${revision}/release/pages/community.json` ? page : null;
    if (body === null) response.writeHead(404);
    response.end(body);
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const settings = { ARKPEDIA_CONTENT_URL: `http://127.0.0.1:${address.port}`, ARKPEDIA_CONTENT_TEST: '1', ARKPEDIA_CONTENT_DISABLED: '0',
    ARKPEDIA_EXPORT_CONTENT: '0', ARKPEDIA_WORKER: '1', ARKPEDIA_YOUTUBE_FEED_FIXTURE: undefined, ARKPEDIA_CONTENT_PILOT_ORIGIN: undefined };
  const saved = Object.fromEntries(Object.keys(settings).map(key => [key, process.env[key]]));
  const fetcher = globalThis.fetch;
  for (const [key, value] of Object.entries(settings)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  globalThis.fetch = ((input, init) => new URL(String(input)).hostname === 'www.youtube.com'
    ? Promise.resolve(new Response('unavailable', { status: 503 })) : fetcher(input, init)) as typeof fetch;
  try { await run(); }
  finally {
    globalThis.fetch = fetcher;
    for (const [key, value] of Object.entries(saved)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
}

test('a clean Worker build survives a feed outage using the verified published archive', async () => {
  await withArchive([archived], async () => {
    const channels = [{ id: 'outage-build', label: 'Creator' }];
    assert.deepEqual(await getLatestVideos(channels, 6, { revalidateReason: 'build' }), [], 'archive is merged by upload pages, not passed off as a live feed');
    assert.deepEqual(await loadVideoArchive(), [archived]);
    for (const revalidateReason of ['stale', 'on-demand', undefined] as const) {
      await assert.rejects(() => getLatestVideos(channels, 6, { revalidateReason }), /YouTube feeds unavailable/, 'runtime failures retain the previous cached page');
    }
  });
});

test('a build with neither usable feeds nor a published archive still fails', async () => {
  await withArchive([], async () => {
    await assert.rejects(() => getLatestVideos([{ id: 'outage-empty', label: 'Creator' }], 6, { revalidateReason: 'build' }), /YouTube feeds unavailable/);
  });
});
