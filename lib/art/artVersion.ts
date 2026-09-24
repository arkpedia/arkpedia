import artSources from '@/data/assets/banner_art_sources.json';
import { publicFileExists } from '@/lib/assets/publicAssets';

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
 * Apply this (publishedArt) where a path becomes an <Image src>, NEVER in the data files.
 * The scrapers own the per-year event records and headhunting_banners.json and would
 * clobber an edit there, and lib/stages/stageContents.ts resolves poster
 * strings against the filesystem -- `existsSync("foo.webp?v=abc")` is
 * quietly false, which would drop the poster from every stage page.
 */
const SOURCES = artSources as Record<string, string>;

/**
 * The file in the image repository that a record's art names: a site path, or a raw
 * URL pinned to one commit of arkpedia-image-assets. null for any other address (a
 * wiki URL), which the site cannot check and renders as it always has. The same
 * reading as artPath() in scripts/content/check-completeness.mjs, which holds the
 * record back as 'published-partial' while that file is missing.
 */
export function artFile(src: string): string | null {
  if (src.startsWith('/') && !src.startsWith('//')) return src.slice(1);
  try {
    const pinned = new URL(src).pathname.match(/^\/arkpedia\/arkpedia-image-assets\/[a-f0-9]{40}\/(.+)$/);
    return pinned ? decodeURIComponent(pinned[1]) : null;
  } catch {
    return null;
  }
}

/**
 * The <Image src> for a banner's key art or an event's poster: null until the image
 * repository has published the file, and after that the path with its version.
 *
 * A record can be published before its art. The catalogue creates a banner from the
 * game client with banner_image null, and a new Global banner names the file its art
 * will have before the art sync has uploaded it. That record goes out as
 * 'published-partial', and rendering the path anyway would draw a broken image on
 * the front page the day the banner opens. With null, every caller shows the empty
 * box it already shows for a banner with no art, at the same size. The art appears
 * when a release brings an asset index that lists it, with no rebuild.
 */
export function publishedArt(src: string | null | undefined, jobName: string): string | null {
  if (!src) return null;
  const file = artFile(src);
  if (file !== null && !publicFileExists(file)) return null;
  const sha = SOURCES[jobName];
  if (!sha) return src;
  return `${src}${src.includes('?') ? '&' : '?'}v=${sha.slice(0, 8)}`;
}
