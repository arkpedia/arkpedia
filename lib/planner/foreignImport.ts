import { depotNames, type MaterialCatalogue } from '@/lib/farming/materialCatalogue.mjs';
import type { Depot } from './depot';
import { MAX_COUNT, ownString, shortLabel } from './untrusted';

/**
 * Reading a depot out of somebody else's planner.
 *
 * Nobody starts here. A reader arriving at this page has already been keeping
 * their inventory in Krooster or ark-nights, and asking them to retype a
 * hundred and thirty numbers to try this one is asking them not to. So the three
 * formats those two actually emit are readable directly:
 *
 *   1. KROOSTER CSV -- `itemId, itemName, owned, needed`, one row per item.
 *   2. KROOSTER's penguin-stats JSON -- `{"@type":"@penguin-statistics/planner/config",
 *      "items":[{"id":"2001","have":10771,"need":0}]}`. The same numbers keyed the
 *      same way, in the interchange format penguin-stats' own planner uses.
 *   3. ARK-NIGHTS JSON -- `{"version":"2.6.0","stock":{"G-4-1":1234},
 *      "compound_materials":[{"id":"M-5-6"}],"records":[],"focus_materials":[]}`.
 *
 * WHAT COMES ACROSS, and what does not. All three carry an inventory and nothing
 * else -- no operators, no promotions, no skill or module targets. So an import
 * fills the depot and leaves the plan exactly as it was, and the note under the
 * box says so, because a Krooster reader's roster is the data they care most
 * about and finding out later that it did not arrive is worse than being told.
 *
 * The `needed` / `need` columns are read and DISCARDED. They are the other
 * planner's answer to a question this one works out for itself from your goals,
 * and importing a stale total would put a number on screen that no longer
 * follows from anything visible.
 *
 * ark-nights' `compound_materials` is the one extra thing that does map: it is
 * the list of materials the reader has told it to craft rather than farm, which
 * is exactly this planner's crafting declaration. `records` (a history of
 * inventory edits) and `focus_materials` (its own pinning) have no counterpart
 * here and are ignored.
 *
 * WHY THE MAPS ARE GENERATED. Krooster keys on the gamedata's itemId and
 * ark-nights on arkgraph's shorthand codes, and neither is derivable from an
 * English name -- "M-4-8" is Manganese Trihydrate and there is no rule that
 * says so. Both maps are built by scripts/build/build-import-aliases.ts into
 * data/import-aliases.json, a game record the content release carries: the planner
 * reads it from its props (usePlannerContent) and passes it in, so reading a pasted
 * file needs no network and no copy compiled into the browser bundle.
 */

export type ForeignShape = 'krooster-csv' | 'penguin-stats' | 'ark-nights';

/** data/import-aliases.json: other planners' item keys, mapped to this planner's names. */
export interface ImportAliases {
  byItemId: Record<string, string>;
  byArkgraph: Record<string, string>;
}

/**
 * EXP is a number an operator needs, not a thing you hold, so there is no tile
 * for it and it is in neither map. Krooster exports a row for it anyway, and it
 * is named here so the reader is told it was skipped instead of it turning up in
 * a count of things we could not identify.
 */
const KNOWN_NOT_HELD = new Set(['EXP']);

/* The maps and the material catalogue (data/material-catalogue.json) have to be
   talking about the same materials, and nothing at runtime can notice that they
   stopped: a material the catalogue gained without re-running the builder is one an
   import quietly drops, with the file looking like it loaded. /operator-planner's table loader
   asserts it wherever the tables are read from data/ -- the build's prerender and the
   content export -- so a release that disagrees fails its export rather than reaching
   anybody. */
export function checkImportAliases(aliases: ImportAliases, catalogue: Pick<MaterialCatalogue, 'order'>): ImportAliases {
  const known = new Set(catalogue.order);
  const orphans = [...new Set([...Object.values(aliases.byItemId), ...Object.values(aliases.byArkgraph)])]
    .filter((name) => !known.has(name));
  const held = new Set(Object.values(aliases.byItemId));
  const unmapped = depotNames(catalogue).filter((name) => !KNOWN_NOT_HELD.has(name) && !held.has(name));
  if (orphans.length || unmapped.length) {
    throw new Error(
      'foreignImport: data/import-aliases.json and data/material-catalogue.json disagree.' +
      (unmapped.length ? ` No itemId for: ${unmapped.join(', ')}.` : '') +
      (orphans.length ? ` Maps a name the catalogue does not have: ${orphans.join(', ')}.` : '') +
      ' Re-run: npx tsx scripts/build/build-import-aliases.ts',
    );
  }
  return aliases;
}

export interface ForeignImport {
  shape: ForeignShape;
  /** What they own, in this planner's names. */
  depot: Depot;
  /** What they have said they will craft; null when the format has no such notion. */
  crafting: string[] | null;
  /** Entries the file named that this planner cannot hold, as the file wrote them. */
  unheld: string[];
}

/** A count, or null if it is not one. Rejects rather than coerces: a NaN in a
 *  depot propagates silently through every subtraction and blanks a column. */
function count(raw: unknown): number | null {
  if (typeof raw !== 'number' && typeof raw !== 'string') return null;
  const s = typeof raw === 'string' ? raw.trim() : raw;
  if (s === '') return null;
  const n = Number(s);
  /* Bounded above as well as below: 1e300 is finite and is not a count. */
  if (!Number.isFinite(n) || n < 0 || n > MAX_COUNT) return null;
  return Math.floor(n);
}

/**
 * Krooster's CSV.
 *
 * Columns are found by their header name rather than by position, because the
 * header is the one part of the format that says what the file contains -- and a
 * column added or reordered upstream would otherwise read the wrong one and
 * import a `needed` figure as an `owned` one.
 *
 * A row with the wrong number of fields fails the whole file. That happens when
 * a material name contains a comma, which shifts every field after it, and the
 * result is not a row we can read wrongly-but-plausibly -- it is a count taken
 * from the middle of a word. Refusing says so; guessing would not.
 */
function parseKroosterCsv(text: string, { byItemId }: ImportAliases): ForeignImport | null {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) return null;
  const header = lines[0].split(',').map((h) => h.trim().toLowerCase());
  const idCol = header.indexOf('itemid');
  const ownedCol = header.indexOf('owned');
  const nameCol = header.indexOf('itemname');
  if (idCol === -1 || ownedCol === -1) return null;

  const depot: Depot = {};
  const unheld: string[] = [];
  for (const line of lines.slice(1)) {
    const cells = line.split(',');
    if (cells.length !== header.length) return null;
    const id = cells[idCol].trim();
    const owned = count(cells[ownedCol]);
    if (!id || owned === null) return null;
    /* Own entries only: `byItemId['constructor']` is `Object`, and truthy. */
    const name = ownString(byItemId, id);
    if (!name) {
      /* The id for the ones we can explain, the file's own label for the rest.
         `EXP` is filed under the label "Operator EXP", and unheldSummary reads
         the id to know it is the expected skip rather than an unknown. */
      const label = nameCol === -1 ? id : cells[nameCol].trim() || id;
      unheld.push(KNOWN_NOT_HELD.has(id) ? id : label);
      continue;
    }
    if (owned > 0) depot[name] = owned;
  }
  return { shape: 'krooster-csv', depot, crafting: null, unheld };
}

/** Krooster's penguin-stats JSON. Same itemIds, `have` instead of `owned`. */
function parsePenguin(obj: Record<string, unknown>, { byItemId }: ImportAliases): ForeignImport | null {
  const items = obj.items;
  if (!Array.isArray(items)) return null;
  const depot: Depot = {};
  const unheld: string[] = [];
  for (const entry of items) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null;
    const row = entry as Record<string, unknown>;
    const id = typeof row.id === 'string' ? row.id : typeof row.id === 'number' ? String(row.id) : '';
    const have = count(row.have);
    if (!id || have === null) return null;
    const name = ownString(byItemId, id);
    if (!name) { unheld.push(id); continue; }
    if (have > 0) depot[name] = have;
  }
  return { shape: 'penguin-stats', depot, crafting: null, unheld };
}

/** ark-nights' own export, keyed on arkgraph's codes. */
function parseArkNights(obj: Record<string, unknown>, { byArkgraph }: ImportAliases): ForeignImport | null {
  const stock = obj.stock;
  if (!stock || typeof stock !== 'object' || Array.isArray(stock)) return null;
  const depot: Depot = {};
  const unheld: string[] = [];
  for (const [code, raw] of Object.entries(stock as Record<string, unknown>)) {
    const n = count(raw);
    if (n === null) return null;
    const name = ownString(byArkgraph, code);
    if (!name) { unheld.push(code); continue; }
    if (n > 0) depot[name] = n;
  }

  /* Their crafting declaration, and the one field beyond the inventory that has
     a counterpart here. Absent -> null, which leaves the reader's own toggles
     alone; present but empty is a real state ("I craft nothing") and applies. */
  let crafting: string[] | null = null;
  if (obj.compound_materials !== undefined) {
    if (!Array.isArray(obj.compound_materials)) return null;
    const names = new Set<string>();
    for (const entry of obj.compound_materials) {
      const id = entry && typeof entry === 'object' ? (entry as { id?: unknown }).id : entry;
      if (typeof id !== 'string') return null;
      const name = ownString(byArkgraph, id);
      if (name) names.add(name);
      else if (!unheld.includes(id)) unheld.push(id);
    }
    crafting = [...names].sort();
  }

  return { shape: 'ark-nights', depot, crafting, unheld };
}

/**
 * Read a foreign export, or return null if it is not one.
 *
 * A file has to resolve at least ONE material to count as read. Zero is
 * indistinguishable from a vocabulary this does not understand -- a truncated
 * paste, the wrong file, another tool's format that happens to have a `stock`
 * key -- and treating it as "an inventory of nothing" would empty the reader's
 * depot on a mispaste. Somebody who genuinely owns nothing has Clear depot,
 * which is next to this and says what it does.
 */
export function parseForeign(text: string, aliases: ImportAliases): ForeignImport | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  let result: ForeignImport | null = null;
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
    result = parseKroosterCsv(trimmed, aliases);
  } else {
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      return null;
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const obj = parsed as Record<string, unknown>;
    /* Each signature is the format's own self-description, so neither can be
       mistaken for the other or for this planner's bundle. */
    if (obj['@type'] === '@penguin-statistics/planner/config') result = parsePenguin(obj, aliases);
    else if (typeof obj.version === 'string' && obj.stock !== undefined) result = parseArkNights(obj, aliases);
  }

  if (!result || Object.keys(result.depot).length === 0) return null;
  return result;
}

/** The entries we skipped, split into the ones we can explain and the rest. */
export function unheldSummary(unheld: string[]): string {
  if (!unheld.length) return '';
  const named = unheld.filter((k) => !KNOWN_NOT_HELD.has(k));
  const exp = unheld.length - named.length;
  const parts: string[] = [];
  if (exp) parts.push('operator EXP, which is a total rather than something you hold');
  if (named.length) {
    parts.push(
      `${named.length} ${named.length === 1 ? 'entry' : 'entries'} this planner has no tile for `
      + `(${named.slice(0, 4).map((k) => shortLabel(k)).join(', ')}${named.length > 4 ? `, and ${named.length - 4} more` : ''})`,
    );
  }
  return ` Skipped ${parts.join(' and ')}.`;
}
