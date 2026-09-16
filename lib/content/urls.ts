import bundledRevisions from '@/data/assets/revisions.json';
import type { ContentRelease } from './types';

const SKINS = new Set(['one-star-skins', 'two-star-skins', 'three-star-skins', 'four-star-skins', 'five-star-skins', 'six-star-skins', 'skin-series-logos']);
const IMAGES = new Set(['act-marks', 'album-covers', 'alliance-icons', 'base-skill-icons', 'branch-icons', 'cg-collection', 'class-icons', 'content-art', 'cursors', 'enemies-icons', 'enemy-stat-icons', 'essential-icons', 'event-poster', 'faction-icons', 'five-star-icons', 'four-star-icons', 'headhunting-banner-images', 'item-icons', 'material-icons', 'mode-marks', 'nation-marks', 'one-star-icons', 'ra-map', 'six-star-icons', 'skill-icons', 'stages-images', 'stat-icons', 'story-marks', 'stronghold-items', 'stronghold-stratagems', 'stronghold-types', 'three-star-icons', 'two-star-icons']);

/** Pure and request-scoped: never change a process-global asset version. */
export function contentUrl(src: string, release?: ContentRelease | null): string {
  // Accept both stable templates and older page payloads with embedded pins.
  // The suffix also preserves archived actor recordings, not just current audio.
  const voice = src.match(/^https:\/\/raw\.githubusercontent\.com\/arkpedia\/(arkpedia-voice-(?:japanese|english|mandarin|korean|regional))\/(?:main|[a-f0-9]{40})\/(.+)$/);
  if (voice) {
    const [, repository, relative] = voice;
    const revision = release ? release.assets[repository] : bundledRevisions[repository as keyof typeof bundledRevisions];
    if (!revision) throw new Error(`Content release lacks ${repository}`);
    return `https://raw.githubusercontent.com/arkpedia/${repository}/${revision}/${relative}`;
  }
  if (!release || !src.startsWith('/') || src.startsWith('//')) return src;
  const folder = src.slice(1).split('/')[0];
  let repository = SKINS.has(folder) ? 'arkpedia-skin-assets' : IMAGES.has(folder) ? 'arkpedia-image-assets' : '';
  let relative = src.slice(1);
  if (folder === 'skin-originals' || folder === 'skin-variants') {
    repository = 'arkpedia-skin-assets';
    relative = src.replace(/^\/skin-originals\//, 'originals/').replace(/^\/skin-variants\//, 'variants/');
  }
  if (repository) {
    const revision = release.assets[repository];
    if (!revision) throw new Error(`Content release lacks ${repository}`);
    return `https://raw.githubusercontent.com/arkpedia/${repository}/${revision}/${relative}`;
  }
  // These are generated game records, not application/API routes.
  if (/^\/(?:stage-detail|enemy-detail|planner-data|stage-guesser)\//.test(src)
    || /^\/(?:stages-index|enemies-index|operator-deploy)\.json(?:\?|$)/.test(src)) {
    return `${release.baseUrl}/public${src}`;
  }
  return src;
}
