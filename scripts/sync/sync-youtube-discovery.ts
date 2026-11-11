/** Bounded, metadata-only historical lookup for the daily public content release.
 * Run with node --import tsx; no YouTube API key or video downloads are needed. */
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { loadVideoDiscoveryContext } from '../../lib/music/youtubeContextServer';
import { readLocalVideoArchive, YOUTUBE_ARCHIVE_FILE, YOUTUBE_ARCHIVE_RECORD } from '../../lib/music/youtubeArchiveServer';
import { getAllOperators } from '../../lib/operators/operators';
import { getWelfareInfo } from '../../lib/operators/operatorTypes';
import { filterDiscoveryVideos } from '../../lib/music/youtubeDiscovery';
import { normalizeVideoText } from '../../lib/music/youtubeRelevance';
import type { YouTubeVideo } from '../../lib/music/youtube';

interface ListingEntry { id?: string; title?: string; channel_id?: string; timestamp?: number; upload_date?: string; live_status?: string; is_live?: boolean; was_live?: boolean }
export function archiveListing(entries: ListingEntry[], channels: Map<string, string>): YouTubeVideo[] {
  return filterDiscoveryVideos(entries.flatMap(entry => {
    const channelLabel = channels.get(entry.channel_id ?? '');
    if (!channelLabel || !/^[\w-]{11}$/.test(entry.id ?? '') || !entry.title
      || entry.is_live || entry.was_live || ['is_live', 'is_upcoming', 'was_live', 'post_live'].includes(entry.live_status ?? '')) return [];
    const day = entry.upload_date?.match(/^(\d{4})(\d{2})(\d{2})$/);
    return [{ videoId: entry.id!, title: entry.title, channelLabel,
      publishedAt: Number.isFinite(entry.timestamp) ? new Date(entry.timestamp! * 1000).toISOString() : day ? `${day[1]}-${day[2]}-${day[3]}T00:00:00Z` : '',
      thumbnail: `https://i.ytimg.com/vi/${entry.id}/hqdefault.jpg`, url: `https://www.youtube.com/watch?v=${entry.id}`,
      isLivestream: false, liveStatus: 'none' as const, archived: true as const }];
  }));
}

export async function refreshDiscoveryArchive(now: number) {
  const file = path.resolve(YOUTUBE_ARCHIVE_FILE);
  let previous: { videos: YouTubeVideo[]; queries: Record<string, string> } = { videos: readLocalVideoArchive(), queries: {} };
  try { previous = { ...previous, ...JSON.parse(fs.readFileSync(file, 'utf8')) }; } catch { /* First preparation. */ }
  const context = await loadVideoDiscoveryContext(now, true);
  const registry = JSON.parse(fs.readFileSync('data/youtube-creators.json', 'utf8')) as { channels: { id: string; label: string }[] };
  const guides = JSON.parse(fs.readFileSync('data/guide-creators.json', 'utf8')) as { creators: { channelId: string; name: string }[] };
  const channels = new Map([...registry.channels.map(channel => [channel.id, channel.label] as const), ...guides.creators.map(creator => [creator.channelId, creator.name] as const)]);
  const current = new Set(context.operators.map(operator => operator.name));
  const welfare = getAllOperators().filter(operator => current.has(operator.name)
    && context.events.some(event => normalizeVideoText(event.name) === normalizeVideoText(getWelfareInfo(operator.howToObtain)?.['Unlock Location'] ?? '')));
  const queries = [...new Set([
    ...context.events.flatMap(event => (event.stagePrefixes ?? []).map(prefix => `Arknights "${prefix}-" guide`)),
    ...context.events.map(event => `Arknights "${event.name}" guide`),
    ...welfare.map(operator => `Arknights "${operator.name}"`),
    ...context.skins.slice(0, 3).map(skin => `Arknights "${skin.aliases[0]}" skin`),
  ])].slice(0, 6);
  const today = new Date(now).toISOString().slice(0, 10);
  const videos = new Map([...previous.videos, ...readLocalVideoArchive()].map(video => [video.videoId, video]));
  for (const query of queries) {
    if (previous.queries[query] === today) continue;
    try {
      const { stdout } = await promisify(execFile)(process.env.ARKPEDIA_YT_DLP || 'yt-dlp', [
        '--flat-playlist', '--dump-single-json', '--skip-download', '--no-warnings', `ytsearch40:${query}`,
      ], { timeout: 30_000, maxBuffer: 8 * 1024 * 1024 });
      const listing = JSON.parse(stdout) as { entries?: ListingEntry[] };
      if (!Array.isArray(listing.entries) || !listing.entries.length) throw new Error('empty search');
      const found = archiveListing(listing.entries, channels);
      for (const video of found) videos.set(video.videoId, video);
      previous.queries[query] = today;
      console.log(`YouTube archive: ${found.length} trusted results for ${query}`);
    } catch { console.warn(`YouTube archive: keeping previous results for ${query}`); }
  }
  // Existing operator guides are explicit editorial associations. oEmbed supplies
  // the real title/creator but no publication date: retain that date as unknown.
  const references = welfare.flatMap(operator => (operator.guides ?? []).map(guide => ({ ...guide, operator: operator.name }))).slice(0, 24);
  for (let i = 0; i < references.length; i += 4) {
    await Promise.all(references.slice(i, i + 4).map(async reference => {
      const existing = videos.get(reference.videoId);
      if (existing) {
        videos.set(reference.videoId, { ...existing, operatorNames: [...new Set([...(existing.operatorNames ?? []), reference.operator])], topicHint: 'operators' });
        return;
      }
      try {
        const response = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${reference.videoId}`)}&format=json`, { signal: AbortSignal.timeout(5000) });
        if (!response.ok) return;
        const info = await response.json() as { title?: string; author_name?: string };
        if (!info.title || !info.author_name) return;
        const video: YouTubeVideo = { videoId: reference.videoId, title: info.title, channelLabel: info.author_name,
          publishedAt: '', thumbnail: `https://i.ytimg.com/vi/${reference.videoId}/hqdefault.jpg`, url: `https://www.youtube.com/watch?v=${reference.videoId}`,
          isLivestream: false, liveStatus: 'none', archived: true, operatorNames: [reference.operator], topicHint: 'operators' };
        if (filterDiscoveryVideos([video]).length) videos.set(video.videoId, video);
      } catch { /* A failed metadata request never creates a fabricated video. */ }
    }));
  }
  const kept = [...videos.values()].sort((a, b) => (Date.parse(b.publishedAt) || 0) - (Date.parse(a.publishedAt) || 0)).slice(0, 2000);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ videos: kept, queries: previous.queries, checkedAt: new Date(now).toISOString() }) + '\n');
  // A reader-visible archive belongs in the release input hash. Query bookkeeping
  // stays in the cache so an unchanged lookup does not churn public releases.
  fs.writeFileSync(path.resolve(YOUTUBE_ARCHIVE_RECORD), JSON.stringify({ videos: kept }) + '\n');
  console.log(`YouTube archive: ${kept.length} public videos retained`);
}

if (process.argv[1]?.endsWith('/sync-youtube-discovery.ts')) void refreshDiscoveryArchive(Date.now()).catch(error => { console.error(error); process.exitCode = 1; });
