import { parseDepotExport, type Depot } from './depot';
import { parseForeign, unheldSummary, type ForeignShape, type ImportAliases } from './foreignImport';
import { parseRosterExport, type Roster } from './roster';
import { MAX_IMPORT_BYTES } from './untrusted';

/**
 * The whole planner, as one file.
 *
 * There were two export boxes, one per store, and neither carried the GOALS --
 * so the thing you spend the most time setting was the one thing you could not
 * take with you. Clearing site data or changing machine lost every target.
 *
 * One envelope now, with all four: what you own in materials, what you own in
 * operators, what you are aiming them at, and which materials you have said you
 * will craft rather than farm. Versioned, because a file people keep on disk
 * outlives the shape it was written in.
 *
 * It also reads three formats that are not ours -- Krooster's two and
 * ark-nights' -- because nobody arrives at this page without an inventory
 * already kept somewhere else. lib/planner/foreignImport.ts has those.
 *
 * The builder states ride through UNVALIDATED on purpose. Their rules --
 * skill ranks 5-7 need E1, a mastery needs E2 and rank 7, a module needs a
 * rarity-dependent level -- depend on the operator's rarity, which lives in
 * getStaticProps' props and not here. `clampBuilderStates` in pages/planner.tsx
 * already applies them to whatever comes out of localStorage, and an import is
 * the same untrusted input arriving by a different door, so it goes through the
 * same gate rather than a second copy of the rules that could drift from it.
 */

export const BUNDLE_KIND = 'arkpedia-planner';
export const BUNDLE_VERSION = 1;

export interface PlannerBundle {
  kind: typeof BUNDLE_KIND;
  version: number;
  savedAt: string;
  depot: Depot;
  operators: Roster;
  goals: { selectedNames: string[]; builderStates: Record<string, unknown> };
  /**
   * Which materials you have said you will craft rather than farm.
   *
   * Added after the fact, and deliberately WITHOUT a version bump: an older
   * build reading a file with this field ignores it, whereas raising the version
   * would make the deployed site refuse every file written from here on. A file
   * from before it existed has no field at all, which is not the same as an
   * empty one -- see parseTransfer.
   */
  crafting: string[];
}

export interface ParsedTransfer {
  depot: Depot | null;
  roster: Roster | null;
  goals: { selectedNames: string[]; builderStates: Record<string, unknown> } | null;
  /**
   * Which materials to mark as crafted rather than farmed.
   *
   * null means LEAVE THE READER'S OWN TOGGLES ALONE, and it is not the same as
   * an empty array. A file written before the field existed, or a Krooster
   * export, simply has nothing to say about crafting -- wiping the toggles on
   * the strength of that would be losing data rather than restoring it. An empty
   * array is a real statement ("I craft nothing") and applies.
   */
  crafting: string[] | null;
  /** What the file turned out to be, for the line that reports the load. */
  shape: 'bundle' | 'depot' | 'roster' | 'game' | ForeignShape;
  /** Entries a foreign export named that this planner cannot hold. Never fatal:
   *  every real export carries some -- operator EXP, CN-only materials -- so
   *  they are counted and reported rather than refused. */
  unheld: string[];
}

/* `crafting` is required rather than optional on purpose. An optional argument
   is how a new field ships broken: every call site that omits it still compiles
   and still writes a file with the crafting declaration missing. Required means
   the compiler names the two places that have to pass it. */
export function formatBundle(
  depot: Depot,
  roster: Roster,
  selectedNames: string[],
  builderStates: Record<string, unknown>,
  crafting: ReadonlySet<string>,
): string {
  const sortKeys = <T,>(obj: Record<string, T>): Record<string, T> => Object.fromEntries(
    Object.keys(obj).sort().map((k) => [k, obj[k]]),
  );
  const bundle: PlannerBundle = {
    kind: BUNDLE_KIND,
    version: BUNDLE_VERSION,
    /* Stamped so a folder of these can be told apart, and so a reader can see
       which of two files is the newer one without opening both. */
    savedAt: new Date().toISOString(),
    depot: sortKeys(depot),
    operators: sortKeys(roster),
    goals: { selectedNames, builderStates: sortKeys(builderStates) },
    crafting: [...crafting].sort(),
  };
  return JSON.stringify(bundle, null, 2);
}

/**
 * Read a pasted or opened file, all or nothing.
 *
 * A half-applied import that kept the sections it could read would leave the
 * reader believing the whole file had landed -- so one bad section fails the
 * lot. Older single-store exports still load: they were the only format for a
 * while and somebody will have one.
 *
 * Five formats now, and they are tried in the order that their signatures are
 * exact. Three are OTHER planners' (lib/planner/foreignImport.ts), because
 * nobody arrives here without an inventory already kept somewhere else. Those
 * are the one place the all-or-nothing rule bends, and only in one direction: a
 * key we do not recognise is counted and reported rather than refused, since
 * every real foreign export carries a few -- operator EXP, materials CN has and
 * global does not. A malformed COUNT still fails the file.
 */
export function parseTransfer(text: string, aliases: ImportAliases): ParsedTransfer | null {
  /* Size before shape. JSON.parse on a hundred megabytes is a hung tab before
     a single check has run, and nothing this reads is a tenth of the limit. */
  if (text.length > MAX_IMPORT_BYTES) return null;

  /* Foreign first. Each of the three says what it is in its own first bytes, and
     one of them is not JSON at all, so nothing below can see it. */
  const foreign = parseForeign(text, aliases);
  if (foreign) {
    return {
      depot: foreign.depot,
      /* They carry an inventory and nothing else. Leaving these null rather than
         empty is what stops an import from wiping a roster the file never
         claimed to describe. */
      roster: null,
      goals: null,
      crafting: foreign.crafting,
      shape: foreign.shape,
      unheld: foreign.unheld,
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  const obj = parsed as Record<string, unknown>;

  if (obj.kind !== BUNDLE_KIND) {
    /* Not an envelope. It may still be one of the two shapes this used to
       write -- a bare name->count map, or a bare name->state map. Depot first:
       its values are numbers and the roster's are objects, so they cannot be
       mistaken for each other. */
    /* A bare map with nothing in it is refused, the same way a foreign file that
       resolves nothing is: `{}` is a mispaste far more often than it is "I own
       nothing", and reading it as the latter emptied the depot -- or, one line
       down, the roster. A bundle may still carry an empty section, because a
       bundle says what it is. */
    const depot = parseDepotExport(text);
    if (depot && Object.keys(depot).length && Object.values(depot).every((n) => typeof n === 'number')) {
      const looksLikeRoster = Object.values(obj).some((v) => v && typeof v === 'object');
      if (!looksLikeRoster) return { depot, roster: null, goals: null, crafting: null, shape: 'depot', unheld: [] };
    }
    const roster = parseRosterExport(text);
    if (roster && Object.keys(roster).length) return { depot: null, roster, goals: null, crafting: null, shape: 'roster', unheld: [] };
    return null;
  }

  /* A version this build does not know is refused rather than guessed at.
     Reading a newer file with older rules is how a plan comes back subtly
     wrong instead of visibly absent. */
  if (typeof obj.version !== 'number' || obj.version > BUNDLE_VERSION) return null;

  const depot = obj.depot === undefined ? {} : parseDepotExport(JSON.stringify(obj.depot));
  if (!depot) return null;
  const roster = obj.operators === undefined ? {} : parseRosterExport(JSON.stringify(obj.operators));
  if (!roster) return null;

  let goals: ParsedTransfer['goals'] = { selectedNames: [], builderStates: {} };
  if (obj.goals !== undefined) {
    const g = obj.goals as Record<string, unknown> | null;
    if (!g || typeof g !== 'object' || Array.isArray(g)) return null;
    const names = g.selectedNames;
    const states = g.builderStates;
    if (!Array.isArray(names) || !names.every((n) => typeof n === 'string')) return null;
    if (!states || typeof states !== 'object' || Array.isArray(states)) return null;
    goals = { selectedNames: names as string[], builderStates: states as Record<string, unknown> };
  }

  /* Absent is not empty. A bundle written before the crafting field existed says
     nothing about it, and null carries that through so the reader's own toggles
     survive loading their old file. */
  let crafting: string[] | null = null;
  if (obj.crafting !== undefined) {
    if (!Array.isArray(obj.crafting) || !obj.crafting.every((n) => typeof n === 'string')) return null;
    crafting = obj.crafting as string[];
  }

  return { depot, roster, goals, crafting, shape: 'bundle', unheld: [] };
}

/** The name to put on screen for each format. */
const FOREIGN_LABEL: Record<ForeignShape, string> = {
  'krooster-csv': 'a Krooster CSV',
  'penguin-stats': 'a Krooster penguin-stats file',
  'ark-nights': 'an ark-nights export',
};

/** What a load actually changed, for the status line. */
export function describeTransfer(t: ParsedTransfer): string {
  if (t.shape in FOREIGN_LABEL) {
    const materials = Object.keys(t.depot ?? {}).length;
    /* What did NOT come across, stated rather than left to be discovered. A
       Krooster reader's roster is the data they care most about, and none of
       these formats carries one; and their `needed` column is the answer to a
       question this planner works out from your own goals instead. */
    return `Read ${FOREIGN_LABEL[t.shape as ForeignShape]}: ${materials} `
      + `${materials === 1 ? 'material' : 'materials'} into your depot`
      + (t.crafting ? `, and ${t.crafting.length} marked as crafted rather than farmed` : '')
      + '.' + unheldSummary(t.unheld)
      + ' No operators or goals -- these formats only carry an inventory, and what you'
      + ' still need is worked out here from your own targets.';
  }
  if (t.shape === 'game') {
    // lib/planner/gameAccount.ts: the account replaces both stores; unheld is the
    // character ids the planner has no record for yet.
    const operators = Object.keys(t.roster ?? {}).length;
    const held = Object.values(t.depot ?? {}).filter((count) => count > 0).length;
    return `Read your game account: ${operators} ${operators === 1 ? 'operator' : 'operators'} into your roster and `
      + `${held} ${held === 1 ? 'material' : 'materials'} you hold into your depot, in place of what they held. Your goals are as they were.`
      + unheldSummary(t.unheld);
  }
  if (t.shape === 'depot') return `Loaded a depot on its own: ${Object.keys(t.depot ?? {}).length} materials.`;
  if (t.shape === 'roster') return `Loaded operators on their own: ${Object.keys(t.roster ?? {}).length} recorded.`;
  const materials = Object.keys(t.depot ?? {}).length;
  const operators = Object.keys(t.roster ?? {}).length;
  const planned = t.goals?.selectedNames.length ?? 0;
  return `Loaded ${materials} ${materials === 1 ? 'material' : 'materials'}, `
    + `${operators} ${operators === 1 ? 'operator' : 'operators'} and `
    + `${planned} ${planned === 1 ? 'plan' : 'plans'}`
    + (t.crafting ? `, with ${t.crafting.length} marked as crafted rather than farmed` : '')
    + '.';
}
