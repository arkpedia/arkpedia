import fs from 'fs';
import releaseOverrides from '@/data/operator-release-overrides.json';
import path from 'path';
import { Operator } from './operatorTypes';

const FUTURE_ICONS_DIR = path.join(process.cwd(), 'public', 'future_operator_icons');
const DATA_DIR = path.join(process.cwd(), 'data');

const RARITY_FOLDERS = [
  'operators-6star',
  'operators-5star',
  'operators-4star',
  'operators-3star',
  'operators-2star',
  'operators-1star',
];

/**
 * Reads every .json file in a rarity folder (e.g. data/operators-6star/)
 * and returns the parsed contents -- one operator per file, replacing
 * the old single monolithic operators-Nstar.json array. Missing
 * folders (e.g. a rarity not scraped yet) return an empty array rather
 * than throwing, same defensive pattern as getFutureOperators().
 */
function readOperatorFolder(folderName: string): unknown[] {
  const dir = path.join(DATA_DIR, folderName);
  let files: string[] = [];
  try {
    files = fs.readdirSync(dir);
  } catch {
    return [];
  }

  return files
    .filter((f) => f.toLowerCase().endsWith('.json'))
    .map((f) => {
      try {
        const raw = fs.readFileSync(path.join(dir, f), 'utf-8');
        return JSON.parse(raw);
      } catch {
        return null;
      }
    })
    .filter((op): op is unknown => op !== null);
}

/**
 * Reads public/future_operator_icons/ and builds minimal placeholder
 * Operator entries from whatever WebP files are present -- for upcoming
 * operators that have art but no wiki page / full data yet. Drop a new
 * "OperatorName.webp" in that folder and it'll show up in the roster
 * automatically, no code changes needed.
 */
function getFutureOperators(): Operator[] {
  let files: string[] = [];
  try {
    files = fs.readdirSync(FUTURE_ICONS_DIR);
  } catch {
    return [];
  }

  return files
    .filter((f) => f.toLowerCase().endsWith('.webp'))
    .map((f) => {
      const name = f.replace(/\.webp$/i, '');
      return {
        name,
        rarity: null,
        class: null,
        branch: null,
        faction: null,
        umbrellaFactions: [],
        connectedFactions: [],
        position: null,
        tags: [],
        trait: null,
        howToObtain: null,
        alternate: null,
        potential: { levels: [], totalCost: [] },
        promotion: [],
        skills: [],
        isFuture: true,
      } satisfies Operator;
    });
}

interface TalentRow {
  stage: string | null;
  potential: string | null;
  description: string | null;
}
interface RawTalent {
  name?: string | null;
  rows?: TalentRow[];
  technique?: unknown;
  [key: string]: unknown;
}

// Matches a trailing Roman numeral (I-VI covers every real case --
// operators cap at Potential 6) at the end of a talent's base name,
// e.g. "Pay-Per-Confession I" -> base "Pay-Per-Confession". Longer
// numerals are checked first so "VI" isn't half-matched as "V" + "I".
const TRAILING_ROMAN_NUMERAL = /\s+(VI|IV|III|II|I|V)$/;

function baseTalentName(rawName: string): string {
  // The "Replaces X" label got concatenated onto the name with no
  // separator during scraping -- cut everything from "Replaces" onward
  // first, then strip the trailing Roman numeral from what's left.
  const beforeReplaces = rawName.split('Replaces')[0].trim();
  return beforeReplaces.replace(TRAILING_ROMAN_NUMERAL, '').trim();
}

/** Merges a scraped talents array's "one entry per potential level"
 * chains (detected via the base-name-plus-Roman-numeral pattern) back
 * into single talent objects with all their rows combined -- see the
 * comment above the caller for the full explanation. Talents that
 * don't match this pattern (genuinely separate, e.g. a second real
 * talent unlocked at Elite 2) are left untouched. */
function normalizeTalents(rawTalents: RawTalent[] | undefined): RawTalent[] {
  if (!rawTalents || rawTalents.length === 0) return [];

  const groups = new Map<string, RawTalent[]>();
  const order: string[] = [];
  for (const t of rawTalents) {
    const base = baseTalentName(t.name || '');
    if (!groups.has(base)) {
      groups.set(base, []);
      order.push(base);
    }
    groups.get(base)!.push(t);
  }

  return order.map((base) => {
    const entries = groups.get(base)!;
    if (entries.length === 1) return entries[0]; // genuinely a single entry -- leave its original name/shape alone
    return {
      ...entries[0],
      name: base,
      rows: entries.flatMap((e) => e.rows || []),
      technique: entries.flatMap((e) => (Array.isArray(e.technique) ? e.technique : [])),
    };
  });
}

// getAllOperators() is called repeatedly across the build -- once per
// page for most pages, but for the per-operator detail page it's
// called (directly, or indirectly via getOperatorByName) inside
// getStaticProps, which itself runs once per operator. Without this
// cache, that meant re-reading and re-parsing every operator JSON file
// from disk hundreds of times in a single build. The data can't change
// mid-build, so computing it once and reusing the result is always
// safe.
let cachedOperators: Operator[] | null = null;

export function getAllOperators(): Operator[] {
  if (cachedOperators) return cachedOperators;

  const allData = RARITY_FOLDERS.flatMap((folder) => readOperatorFolder(folder));
  // Filter out any entries that failed to scrape (they only have
  // { name, error } rather than the full Operator shape).
  const releasedRaw = allData.filter((op) => !('error' in (op as Record<string, unknown>))) as Operator[];
  const released = releasedRaw.map((op) => ({
    ...op,
    talents: normalizeTalents(op.talents as unknown as RawTalent[] | undefined) as unknown as Operator['talents'],
  }));
  const releasedNames = new Set(released.map((op) => op.name));

  // Only include a future stub if that operator isn't already in the
  // real, fully-scraped dataset (once released and re-scraped, the real
  // entry takes over automatically).
  const future = getFutureOperators().filter((op) => !releasedNames.has(op.name));

  cachedOperators = [...released, ...future].map(op => {
    const override = releaseOverrides[op.name as keyof typeof releaseOverrides];
    if (!override) return op;
    return { ...op, releaseAt: override.startAt, characterInfo: {
      ...op.characterInfo, 'Release Date': override.startAt.slice(0, 10).replace(/-/g, '/'),
    } };
  }).sort((a, b) => a.name.localeCompare(b.name));
  return cachedOperators;
}

export function getOperatorByName(name: string): Operator | undefined {
  return getAllOperators().find((op) => op.name === name);
}