// Server-only: it reads the filesystem when ARKPEDIA_YOUTUBE_FEED_FIXTURE is set. Import it
// from getStaticProps and finalize only (the community pages and the home page), never from
// anything mounted client-side: lib/music/youtube.ts is the module the browser shares.
import { readFileSync } from 'fs';
import { parseChannelFeed, type YouTubeVideo } from './youtube';
import { createChannelFeedReader } from './youtubeFeedCache';
import { workerContext } from './audioLinkMemo';

/**
 * The Check's stand-in for the channels' live feeds: a path (relative to the working
 * directory) to one Atom document holding entries from several channels, each tagged with
 * its <yt:channelId> as a real feed's entries are. check.yml sets it on the Build step and
 * playwright.config.ts on the server it starts, so the pages prerender AND regenerate
 * (revalidate: 1500, which a long browser run outlives) from tests/fixtures/youtube-feeds.xml.
 * Every channel feed returned 404 for hours on 2026-09-27, the pages built with "No videos
 * found", and the picture-card and card-inset guards failed on main as on every branch.
 * Unset (Vercel, a local `npm run dev`), nothing here changes: each channel is fetched live.
 */
const FIXTURE_ENV = 'ARKPEDIA_YOUTUBE_FEED_FIXTURE';

/** The fixture's entries for one channel, as that channel's feed would hold them. */
function fixtureFeed(document: string, channelId: string): string {
  const entries = document.split('<entry>').slice(1).map((entry) => entry.split('</entry>')[0]);
  const own = entries.filter((entry) => (entry.match(/<yt:channelId>([^<]+)<\/yt:channelId>/) || [])[1] === channelId);
  return `<feed>${own.map((entry) => `<entry>${entry}</entry>`).join('')}</feed>`;
}

const fetchChannelFeed = createChannelFeedReader();

export async function getLatestVideos(
  channels: { id: string; label: string }[],
  perChannelLimit: number
): Promise<YouTubeVideo[]> {
  const fixturePath = process.env[FIXTURE_ENV];
  // Read outside the per-channel catch below: a fixture that is set and cannot be read is a
  // broken test build, and must not quietly render "No videos found" like a dead feed.
  const fixture = fixturePath ? readFileSync(fixturePath, 'utf8') : null;
  const bucket = fixture === null ? workerContext()?.bucket ?? null : null;
  const results = await Promise.all(
    channels.map((c) =>
      (fixture !== null ? Promise.resolve(parseChannelFeed(fixtureFeed(fixture, c.id), c.label)) : fetchChannelFeed(c.id, c.label, bucket))
        .then((videos) => videos.slice(0, perChannelLimit))
        .catch(() => [])
    )
  );
  const merged = results.flat();
  if (fixture !== null && merged.length === 0) {
    throw new Error(`${FIXTURE_ENV}=${fixturePath} holds no entry for any channel in lib/music/youtubeConfig.ts`);
  }
  // ISR keeps the previous valid page on a total outage, rather than publishing
  // "No videos" over it. Warm/cold Worker instances also have the R2 fallback above.
  if (fixture === null && channels.length && !merged.length) throw new Error('YouTube feeds unavailable; retaining the previous page');
  merged.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
  return merged;
}
