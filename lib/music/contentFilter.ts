// Filters YouTube videos for the community pages and home page. Two
// independent rules, both currently YouTube-only (Twitch livestreams
// are deliberately NOT filtered by either):
//   1. Must mention "Arknights" -- some configured channels post
//      content about other games too, and a title that never mentions
//      Arknights at all is the clearest signal it isn't actually
//      Arknights content.
//   2. Must NOT mention another specific game (Endfield, Genshin,
//      Honkai, Wuthering, Zenless, NTE, Silver Palace) -- catches the
//      case where a channel's video is nominally about Arknights but
//      is really a crossover/comparison piece focused on one of these.

const REQUIRED_KEYWORD = /\barknights\b/i;

const BANNED_PATTERNS: RegExp[] = [
  /\bendfield\b/i,
  /\bgenshin\b/i,
  /\bhonkai\b/i,
  /\bwuthering\b/i,
  /\bzenless\b/i,
  /\bnte\b/i,
  /\bsilver palace\b/i,
];

/** True if the given text (a video title, typically) mentions
 * "Arknights" as a whole word. */
export function mentionsArknights(text: string | null | undefined): boolean {
  if (!text) return false;
  return REQUIRED_KEYWORD.test(text);
}

/** True if the given text mentions any of the banned other-game
 * keywords. */
export function isBannedContent(text: string | null | undefined): boolean {
  if (!text) return false;
  return BANNED_PATTERNS.some((pattern) => pattern.test(text));
}

/** The real filter YouTube video listings should use: title must
 * mention "Arknights" AND must not mention any banned other-game
 * keyword. Both conditions together, in one pass. */
export function filterArknightsVideos<T extends { title: string }>(items: T[]): T[] {
  return items.filter((item) => mentionsArknights(item.title) && !isBannedContent(item.title));
}
