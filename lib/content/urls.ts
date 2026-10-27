import bundledRevisions from '@/data/assets/revisions.json';
import assetFolders from '@/config/asset-folders.json';
import type { ContentRelease } from './types';
import { assetUrl, encodeAssetPath, PINNED_ART } from '@/lib/assets/assetUrl';
import { pinAssetUrl } from '@/lib/assets/revisions';

/* Which repository serves each top-level art folder. One list, config/asset-folders.json,
   which next.config.js's redirects read too; check-published-assets fails when the pinned
   repositories' folders differ from it. */
const SKINS = new Set(assetFolders['arkpedia-skin-assets']);
const IMAGES = new Set(assetFolders['arkpedia-image-assets']);

function artRevision(repository: string, release?: ContentRelease | null): string {
  // A newly deployed page can briefly fall back to its bundled data before
  // that route exists in the public content release. Its media must still use
  // the bundled, commit-pinned asset set rather than a nonexistent Vercel
  // `/public` copy.
  const revision = release?.assets[repository]
    ?? bundledRevisions[repository as keyof typeof bundledRevisions];
  if (!revision) throw new Error(`Content release lacks ${repository}`);
  return revision;
}

/** Pure and request-scoped: never change a process-global asset version. */
export function contentUrl(src: string, release?: ContentRelease | null): string {
  // Accept both stable templates and older page payloads with embedded pins.
  // The suffix also preserves archived actor recordings, not just current audio.
  const voice = src.match(/^https:\/\/(?:raw\.githubusercontent\.com|assets\.arkpedia\.net)\/arkpedia\/(arkpedia-voice-(?:japanese|english|mandarin|korean|regional))\/(?:main|[a-f0-9]{40})\/(.+)$/);
  if (voice) {
    const [, repository, relative] = voice;
    const revision = release ? release.assets[repository] : bundledRevisions[repository as keyof typeof bundledRevisions];
    if (!revision) throw new Error(`Content release lacks ${repository}`);
    return assetUrl(repository, revision, relative);
  }
  // Art a record names by its full address, pinned to whatever commit the record was
  // written against (the catalogue externalises new art that way, and bundled tables
  // keep the pin of the deploy that shipped them). The file is the same; the commit
  // is the page's release, like every root-relative path below.
  const art = src.match(PINNED_ART);
  if (art) {
    const [, repository, relative] = art;
    return assetUrl(repository, artRevision(repository, release), encodeAssetPath(relative));
  }
  if (!src.startsWith('/') || src.startsWith('//')) {
    return /^https:\/\/raw\.githubusercontent\.com\/arkpedia\/arkpedia-(?:sd-assets|l2d-assets|color-palette)\//.test(src) ? pinAssetUrl(src) : src;
  }
  const folder = src.slice(1).split('/')[0];
  let repository = SKINS.has(folder) ? 'arkpedia-skin-assets' : IMAGES.has(folder) ? 'arkpedia-image-assets' : '';
  let relative = src.slice(1);
  if (folder === 'skin-originals' || folder === 'skin-variants') {
    repository = 'arkpedia-skin-assets';
    relative = src.replace(/^\/skin-originals\//, 'originals/').replace(/^\/skin-variants\//, 'variants/');
  }
  if (repository) {
    return assetUrl(repository, artRevision(repository, release), encodeAssetPath(relative));
  }
  // These are generated game records, not application/API routes.
  if (release && (/^\/(?:stage-detail|enemy-detail|planner-data|stage-guesser|lyrics)\//.test(src)
    || /^\/(?:stages-index|enemies-index|operator-deploy|operator-search|music-catalogue|medal-catalogue|site-search)\.json(?:\?|$)/.test(src))) {
    return `${release.baseUrl}/public${src}`;
  }
  return src;
}

/**
 * A URL wrapped for CSS `url()`, for art set from a component: a mask, a backdrop,
 * a cursor. A stylesheet cannot say `url(/story-marks/...)` itself -- that path 307s
 * to the asset commit of the last deploy, not the page's release -- so the component
 * resolves it with useContentUrl() and hands it over as a custom property
 * (test-css-asset-urls).
 *
 * An unquoted url() cannot hold an apostrophe, a bracket or whitespace -- CSS drops
 * the whole declaration, silently. One event poster has an apostrophe in its name
 * ("Grani and the Knights' Treasure"), which is why the Glimpse of the Depths line
 * had no backdrop while the other sixteen did: encodeURIComponent leaves ' alone, so
 * percent-encoding the spaces was not enough. Quoted, with quotes and backslashes
 * escaped, any filename works.
 */
export function cssUrl(url: string): string {
  return `url("${url.replace(/["\\]/g, '\\$&')}")`;
}
