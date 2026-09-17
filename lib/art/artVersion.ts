import artSources from '@/data/assets/banner_art_sources.json';

/**
 * Cache-busting suffix for the banner and event-poster art that
 * scripts/sync/sync-banner-art.py replaces IN PLACE.
 *
 * next.config.js sets `minimumCacheTTL: 31536000` on the explicit premise
 * that "a new upload gets a new filename, not an in-place overwrite". The
 * sync script breaks that premise: when Global gets the English art for a
 * banner that shipped with the CN client's, the script overwrites
 * public/headhunting-banner-images/<same name>.webp and the URL never
 * changes. Vercel's image cache keys on (url, width, quality, format) and
 * survives redeploys, so the old CN rendition would keep being served for
 * up to a year -- which is exactly the "hard reload shows the Chinese
 * banner" report. The renditions the browser happened not to hold yet came
 * back correct, which is why clicking into a banner and back appeared to
 * fix it.
 *
 * The version is the sha1 the sync script already records per job in
 * data/assets/banner_art_sources.json, so it re-bumps itself on every future swap
 * with no change here or in the script. Art the script has never touched
 * gets no suffix: its bytes have not changed, so neither should its URL.
 *
 * Apply this where a path becomes an <Image src>, NEVER in the data files.
 * The scrapers own the per-year event records and headhunting_banners.json and would
 * clobber an edit there, and lib/stages/stageContents.ts resolves poster
 * strings against the filesystem -- `existsSync("foo.webp?v=abc")` is
 * quietly false, which would drop the poster from every stage page.
 */
const SOURCES = artSources as Record<string, string>;

export function withArtVersion(src: string, jobName: string): string;
export function withArtVersion(src: string | null | undefined, jobName: string): string | null;
export function withArtVersion(src: string | null | undefined, jobName: string): string | null {
  if (!src) return null;
  const sha = SOURCES[jobName];
  if (!sha) return src;
  return `${src}${src.includes('?') ? '&' : '?'}v=${sha.slice(0, 8)}`;
}
