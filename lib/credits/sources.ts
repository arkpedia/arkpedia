/*
 * The sources Arkpedia is built on, for the Credits page (pages/credits.tsx): each one's name and
 * where to find it -- its GitHub repository, its site, or both. Every GitHub repository the
 * site's scripts and pages fetch from is linked here: scripts/tests/test-credits.ts scans the
 * code for them and fails on one that is not, so a new data source arrives credited.
 */

export interface CreditSource {
  name: string;
  /** Its GitHub repository and/or its own site. */
  links: string[];
}

export interface CreditGroup { id: string; title: string; sources: CreditSource[] }

export const CREDIT_GROUPS: CreditGroup[] = [
  {
    id: 'game',
    title: 'Game data and art',
    sources: [
      { name: 'Arknights (Global)', links: ['https://www.arknights.global'] },
      { name: 'Arknights (CN)', links: ['https://ak.hypergryph.com'] },
      { name: 'Monster Siren Records', links: ['https://monster-siren.hypergryph.com'] },
      { name: 'ArknightsGamedata', links: ['https://github.com/ArknightsAssets/ArknightsGamedata'] },
      { name: 'ArknightsAssets2', links: ['https://github.com/ArknightsAssets/ArknightsAssets2'] },
      { name: 'ArknightsGameData', links: ['https://github.com/Kengxxiao/ArknightsGameData', 'https://github.com/Kengxxiao/ArknightsGameData_YoStar'] },
      { name: 'ArknightsGameData_YoStar', links: ['https://github.com/PuppiizSunniiz/ArknightsGameData_YoStar'] },
      { name: 'AN-EN-Tags', links: ['https://puppiizsunniiz.github.io/AN-EN-Tags'] },
      { name: 'ArknightsGameResource', links: ['https://github.com/yuanyan3060/ArknightsGameResource'] },
      { name: 'ArknightsResource', links: ['https://github.com/fexli/ArknightsResource'] },
      { name: 'Arknights Wiki', links: ['https://arknights.wiki.gg'] },
      { name: 'PRTS Wiki', links: ['https://prts.wiki'] },
    ],
  },
  {
    id: 'voice',
    title: 'Voice lines',
    sources: [
      { name: 'Ark-Voice', links: ['https://github.com/isHarryh/Ark-Voice'] },
      { name: 'tlvr-source', links: ['https://github.com/PseudoMon/tlvr-source'] },
    ],
  },
  {
    id: 'tools',
    title: 'Tools and maps',
    sources: [
      { name: "Timo's story reader", links: ['https://arknights.timo.beer'] },
      { name: 'Arknights Story Map', links: ['https://www.canva.com/design/DAHBABXJpds/tgUQ72n0pCw8HHq56-OBOA/view'] },
      { name: 'myrtle.moe', links: ['https://github.com/Eltik/myrtle'] },
      { name: 'Reclamation Algorithm map', links: ['https://github.com/QingXia-Ela/reclamation-algorithm-map'] },
      { name: 'arkgraph', links: ['https://github.com/Houdou/arkgraph'] },
      { name: 'Arknights Wiki JP', links: ['https://arknights.wikiru.jp'] },
    ],
  },
];

/** Arkpedia's own public repositories. */
export const OWN_REPOSITORIES = [
  'arkpedia-data', 'arkpedia-image-assets', 'arkpedia-skin-assets', 'arkpedia-l2d-assets', 'arkpedia-sd-assets',
  'arkpedia-voice-english', 'arkpedia-voice-japanese', 'arkpedia-voice-mandarin', 'arkpedia-voice-korean',
  'arkpedia-voice-regional', 'arkpedia-color-palette',
].map((name) => `https://github.com/arkpedia/${name}`);

/** Repositories the scan (test-credits.ts) finds that need no entry: Arkpedia's own and the Spine
 *  Runtimes, credited in their own sections. */
export const CREDITED_ELSEWHERE = [/^arkpedia\//, /^EsotericSoftware\/spine-runtimes$/];

/** The owner/name a GitHub repository link points at, or null for any other link. */
export function githubRepository(href: string): string | null {
  const match = href.match(/^https:\/\/github\.com\/([^/]+\/[^/]+?)\/?$/);
  return match ? match[1] : null;
}

/** A link as the page writes it: github.com/owner/name for a repository, the address itself for a
 *  short one, and only the site's name for one whose path is an opaque id. */
export function linkLabel(href: string): string {
  const url = new URL(href);
  const host = url.hostname.replace(/^www\./, '');
  const path = url.pathname.replace(/\/$/, '');
  if (host === 'github.com' || path.split('/').filter(Boolean).length <= 1) return host + path;
  return host;
}
