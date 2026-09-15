import fs from 'fs';
import path from 'path';

const CG_COLLECTION_DIR = path.join(process.cwd(), 'public', 'cg-collection');

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

// Strips a leading "[Tag] " prefix, e.g. "[Story Collection] Crossing"
// -> "Crossing" -- events are often stored with these tags in their
// full name, but their cg-collection folder is usually just named
// after the shorter, tag-free title.
function stripLeadingBracketTag(name: string): string {
  return name.replace(/^\[[^\]]*\]\s*/, '').trim();
}

function readFolderImages(folderName: string): string[] {
  const dir = path.join(CG_COLLECTION_DIR, folderName);
  let files: string[] = [];
  try {
    files = fs.readdirSync(dir);
  } catch {
    return [];
  }
  return files
    .filter((f) => /\.(webp|png|jpe?g)$/i.test(f))
    .sort(naturalCompare)
    .map((f) => `/cg-collection/${folderName}/${f}`);
}

/**
 * Reads public/cg-collection/<eventName>/ (trying the event's exact
 * name first, then that name with a leading "[Tag] " prefix stripped)
 * and returns web-servable paths for every image inside, naturally
 * sorted. Most events won't have a folder here yet -- both attempts
 * missing returns an empty array rather than throwing, same defensive
 * pattern as lib/operators/operators.ts's folder readers, so callers
 * can just fall back to the event's single poster image when this
 * comes back empty.
 */
export function getEventCgImages(eventName: string): string[] {
  const direct = readFolderImages(eventName);
  if (direct.length > 0) return direct;

  const stripped = stripLeadingBracketTag(eventName);
  if (stripped !== eventName) {
    return readFolderImages(stripped);
  }
  return [];
}