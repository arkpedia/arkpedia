import type { YouTubeVideo } from './youtube';

export interface VideoSubject {
  name: string;
  aliases: string[];
  until: number;
  stagePrefixes?: string[];
  soleSkinModelAliases?: string[];
}
export interface VideoDiscoveryContext {
  events: VideoSubject[];
  operators: VideoSubject[];
  skins: VideoSubject[];
}
export const EMPTY_VIDEO_CONTEXT: VideoDiscoveryContext = { events: [], operators: [], skins: [] };

export const normalizeVideoText = (text: string) => text.normalize('NFKD').replace(/\p{M}/gu, '')
  .toLowerCase().replace(/[’'`]/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

export function mentionsVideoSubject(title: string, aliases: string[]): boolean {
  const normalized = ` ${normalizeVideoText(title)} `;
  return aliases.some(alias => normalizeVideoText(alias).length >= 3
    && normalized.includes(` ${normalizeVideoText(alias)} `));
}

/** Titles and explicit indexed-guide associations only. In particular, a skin
 * showcase must name the available outfit, not merely the same operator. */
export function currentVideoRelevance(video: YouTubeVideo, context: VideoDiscoveryContext, now: number): { score: number; label: string } {
  for (const event of context.events.filter(subject => now < subject.until)) {
    const stageMatch = (event.stagePrefixes ?? []).some(prefix =>
      new RegExp(`\\b${prefix}[- ](?:EX[- ]|S[- ]|TR[- ])?\\d+\\b`, 'i').test(video.title));
    const guide = stageMatch || /\b(guide|clear|afk|walkthrough)\b|攻略|공략/i.test(video.title);
    if (guide && (stageMatch || mentionsVideoSubject(video.title, event.aliases))) return { score: 3, label: `Current event · ${event.name}` };
  }
  const skinVideo = /\b(skin|outfit|costume|live\s?2d|l2d)\b|皮肤|スキン|스킨/i.test(video.title);
  if (skinVideo) {
    for (const skin of context.skins.filter(subject => now < subject.until)) {
      if (mentionsVideoSubject(video.title, skin.aliases) || mentionsVideoSubject(video.title, skin.soleSkinModelAliases ?? [])) return { score: 1, label: `Outfit available · ${skin.name}` };
    }
    return { score: 0, label: '' };
  }
  for (const operator of context.operators.filter(subject => now < subject.until)) {
    if ((video.operatorNames ?? []).includes(operator.name)
      || (/\b(analysis|review|guide|showcase|should you|skills?|s[123])\b/i.test(video.title)
        && mentionsVideoSubject(video.title, operator.aliases))) return { score: 2, label: `Available now · ${operator.name}` };
  }
  return { score: 0, label: '' };
}

export function rankDiscoveryVideos(videos: YouTubeVideo[], context: VideoDiscoveryContext, now: number): YouTubeVideo[] {
  const unique = new Map<string, YouTubeVideo>();
  for (const video of videos) {
    const latest = unique.get(video.videoId);
    unique.set(video.videoId, latest ? { ...video, ...latest,
      operatorNames: [...new Set([...(latest.operatorNames ?? []), ...(video.operatorNames ?? [])])],
      ...(latest.topicHint || video.topicHint ? { topicHint: latest.topicHint ?? video.topicHint } : {}),
    } : video);
  }
  return [...unique.values()]
    .sort((a, b) => currentVideoRelevance(b, context, now).score - currentVideoRelevance(a, context, now).score
      || (Date.parse(b.publishedAt) || 0) - (Date.parse(a.publishedAt) || 0) || a.videoId.localeCompare(b.videoId));
}
