import { publicFiles } from '@/lib/assets/publicAssets';
import { eventTitle } from './eventName.mjs';

// Sorts filenames so embedded numbers compare numerically, not
// lexically -- e.g. "Crossing CG 2.webp" before "Crossing CG 10.webp",
// not after (plain string sort would put "10" before "2").
function naturalCompare(a: string, b: string): number {
  const tokenize = (s: string) => s.match(/(\d+)|(\D+)/g) || [];
  const aParts = tokenize(a);
  const bParts = tokenize(b);
  const len = Math.max(aParts.length, bParts.length);
  for (let i = 0; i < len; i++) {
    const ap = aParts[i] || '';
    const bp = bParts[i] || '';
    const an = Number(ap);
    const bn = Number(bp);
    if (!isNaN(an) && !isNaN(bn) && ap !== '' && bp !== '') {
      if (an !== bn) return an - bn;
    } else if (ap !== bp) {
      return ap < bp ? -1 : 1;
    }
  }
  return 0;
}

/* From the compiled-in asset index (lib/assets/publicAssets.ts), never the disk: the art lives in
   arkpedia-image-assets, and no machine that exports a release has it under public/, where
   images are git-ignored. Listing the disk gave every published event page its poster alone
   while its CG set was published (scripts/audits/check-public-disk-reads.mjs keeps it so). */
function readFolderImages(folderName: string): string[] {
  return publicFiles(`cg-collection/${folderName}`)
    .filter((f) => /\.(webp|png|jpe?g)$/i.test(f))
    .sort(naturalCompare)
    .map((f) => `/cg-collection/${folderName}/${f}`);
}

/**
 * The CG set the image repository publishes for an event under cg-collection/<eventName>/
 * (trying the event's exact name first, then that name with its leading "[Tag] " stripped), as
 * web-servable paths, naturally sorted. Most events have no folder: both attempts missing
 * returns an empty array, and the caller falls back to the event's single poster. A new folder
 * shows with the next content run, once the asset sync has indexed it; no deploy.
 */
export function getEventCgImages(eventName: string): string[] {
  const direct = readFolderImages(eventName);
  if (direct.length > 0) return direct;

  // Events are stored with a leading "[Tag] " ("[Story Collection] Crossing"), but their
  // cg-collection folder is usually named after the shorter, tag-free title.
  const stripped = eventTitle(eventName);
  if (stripped !== eventName) {
    return readFolderImages(stripped);
  }
  return [];
}
