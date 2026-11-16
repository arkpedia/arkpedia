import { isBannedContent, mentionsArknights } from './contentFilter';
import type { YouTubeVideo } from './youtube';
import { currentVideoRelevance, EMPTY_VIDEO_CONTEXT, rankDiscoveryVideos, type VideoDiscoveryContext } from './youtubeRelevance';

export const VIDEO_TOPICS = [
  { value: 'news', label: 'News' },
  { value: 'discussions', label: 'Discussions' },
  { value: 'operators', label: 'Operator analyses' },
  { value: 'guides', label: 'Guides' },
  { value: 'clears', label: 'Stage clears' },
  { value: 'skins', label: 'Skin showcases' },
  { value: 'media', label: 'Music & media' },
  { value: 'reviews', label: 'Game reviews' },
  { value: 'pulls', label: 'Pulls' },
  { value: 'other', label: 'Other' },
] as const;
export type VideoTopic = typeof VIDEO_TOPICS[number]['value'];
export const discoveryVideoTopic = (video: YouTubeVideo): VideoTopic => {
  // Old published pages can still carry the retired combined gameplay category.
  for (const topic of [video.topicHint, video.classifiedTopic]) if (VIDEO_TOPICS.some(item => item.value === topic)) return topic as VideoTopic;
  return videoTopic(video.title);
};
export const filterDiscoveryVideos = (videos: YouTubeVideo[]) => videos.filter(video => !isBannedContent(video.title)
  && (mentionsArknights(video.title) || (video.archived && video.operatorNames?.length)));

/** Conservative title rules, most specific first. A creator is never assigned a
 * permanent topic: the same channel can publish a guide, a song and an opinion. */
export function videoTopic(title: string): VideoTopic {
  if (/\b(skins?|outfits?|costumes?|live\s?2d|l2d)\b|皮肤|時装|スキン|스킨/i.test(title)) return 'skins';
  if (/\b(song|music|bgm|ost|soundtrack|theme|cover|remix|voice[\s-]?lines?|amv|mmd|animation|animated|animatic|pv|ep|trailer|teaser)\b|音楽|歌曲|音乐|ボイス集|语音|語音|애니메이션/i.test(title)) return 'media';
  const stage = /\b[a-z]{1,4}(?:-[a-z]{1,3})?-\d+(?:-\d+)?\b|(?<![\d-])\b\d{1,2}-\d+\b(?!-\d)/i.test(title);
  const combat = stage || /\b(stage|event|annihilation|stronghold protocol|integrated strategies|contingency contract|reclamation algorithm)\b|\b(?:is|cc|ccb)\s*#?\d+\b|\brisk\s*\d+\b|剿灭|殲滅|危機契約/i.test(title);
  if (combat && /\b(guide|tutorial|walkthrough|afk|low[ -]?(?:end|rarity|stars?)|how to)\b|攻略|공략/i.test(title)) return 'guides';
  if (/\b(?:game review|reviewing arknights|arknights review|retrospective|worth (?:playing|starting)|should you (?:play|start))\b/i.test(title)) return 'reviews';
  if (/\b(news|announcement|announced|update|patch|maintenance|schedule|coming soon|revealed)\b|速報|공지|업데이트/i.test(title)) return 'news';
  if (/\b(?:operator (?:review|analysis)|should you (?:pull|save|(?:get and )?build)|pull or skip|worth pulling|is (?:she|he|this operator).*(?:good|bad|worth)|why.*(?:underpowered|overpowered)|explaining why.*(?:bad|good)|skill\s*[123]|s[123]\s*(?:lv\s*\d+|m[0-3]))\b/i.test(title)) return 'operators';
  const resources = /\b(?:track(?:ing)?|tracker|planner|planning|calculator)\b.*\b(?:pulls?|summons?|gacha)\b/i.test(title)
    || (/\bfree\s+pulls\b/i.test(title) && /\b(?:get|earn|farm|obtain|available|new players?|saving|income|counting)\b/i.test(title));
  if (resources) return 'discussions';
  if (/\b(discussion|opinion|thoughts|reaction|reacts|rant|talking|let'?s talk|explained|explaining|drama|hardest|easiest)\b/i.test(title)) return 'discussions';
  if (/\b(pulls|pulling|summoning|summons)\b|\bgacha\b.*\b(session|results?|rolls?)\b/i.test(title)) return 'pulls';
  if (stage || /\b(clears?|challenge|solo|duo|integrated strategies)\b|\b(?:is|cc|ccb)\s*#?\d+\b|\brisk\s*\d+\b/i.test(title)) return 'clears';
  if (/\b(rng|probability|probabilities|rarest|odds|statistics)\b/i.test(title)) return 'discussions';
  if (/\b(?:operators?|analysis|analyses|analyzing|analysing)\b/i.test(title)) return 'operators';
  return 'other';
}

export const FEATURED_VIDEO_WINDOW_MS = 2 * 24 * 60 * 60 * 1000;

export function videoDate(publishedAt: string): string {
  const date = new Date(publishedAt);
  return Number.isFinite(date.getTime()) ? date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '';
}

/** One newest upload per creator. Prefer a 48-hour window, but don't empty the
 * homepage just because every channel has had a quiet couple of days. */
export function featuredChannelVideos(videos: YouTubeVideo[], now: number, context: VideoDiscoveryContext = EMPTY_VIDEO_CONTEXT): YouTubeVideo[] {
  const eligible = rankDiscoveryVideos(filterDiscoveryVideos(videos).filter(video => !video.isLivestream
    && video.liveStatus === 'none' && (Number.isFinite(Date.parse(video.publishedAt))
      ? Date.parse(video.publishedAt) <= now : video.archived && currentVideoRelevance(video, context, now).score > 0)), context, now);
  const recent = eligible.filter(video => now - Date.parse(video.publishedAt) <= FEATURED_VIDEO_WINDOW_MS
    || currentVideoRelevance(video, context, now).score > 0);
  const channels = new Set<string>();
  const ids = new Set<string>();
  const distinct = (recent.length ? recent : eligible).filter(video => {
    if (channels.has(video.channelLabel) || ids.has(video.videoId)) return false;
    channels.add(video.channelLabel);
    ids.add(video.videoId);
    return true;
  });
  return recent.length ? distinct : distinct.slice(0, 3);
}
