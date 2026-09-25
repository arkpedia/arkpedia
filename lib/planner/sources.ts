import type { FarmingTier } from '@/lib/farming/farmingTypes';
import type { FormulaLookup } from './craft';

/**
 * Where a material comes from.
 *
 * A shortfall list sorted by tier tells you what you are missing. It does not tell you
 * what to DO, which is the question you actually have: three of these come out of the
 * Workshop and cost you nothing but time, two are in an event shop that closes, and
 * the rest mean running stages -- and those are three completely different afternoons.
 * Grouping by route turns a list into a plan.
 *
 * Every bucket is derived from data the site already keeps. Nothing here is a second
 * hand-maintained list that could drift from the first.
 */
export type SourceKind = 'workshop' | 'factory' | 'certificate' | 'event' | 'farm' | 'unknown';

export interface Source {
  kind: SourceKind;
  /** Stage codes to run, for a farmable. Empty for the other kinds. */
  stages: string[];
  /** What a certificate-store item is bought with, and for how much if we know. */
  buy?: { currency: string; price?: number };
}

/* Every input is the page's: the planner hands in the release's supply stages, its own
   recipe lookup and the release's farming guide (usePlannerContent). There is no
   module-level instance, because one would compile this deploy's copies of the tables
   into the browser bundle and answer from them. */
export function createSourceTools(supply: Record<string, string[]>, lookupRecipe: FormulaLookup, farmingTiers: readonly FarmingTier[]) {


/**
 * The permanent certificate store, by hand.
 *
 * It has to be by hand. The Chip Catalyst appears nowhere in shop_client_table.json --
 * zero occurrences of its id, its name or its constant -- because the store's stock is
 * server-side and no shipped table carries it. So this is the same kind of curated map
 * as the farming guide next door, and it is kept deliberately small: one entry, for the
 * one material with no other source at all. A Chip Catalyst does not drop and cannot be
 * crafted, and a Dualchip needs one, so without this the planner would send a reader
 * looking for something and give them nowhere to look.
 *
 * `price` is optional and currently unset -- the number is not in any table either, and
 * a made-up one is worse than none. Fill it in and the row states it.
 */
const CERTIFICATE_STORE: Record<string, { currency: string; price?: number }> = {
  'Chip Catalyst': { currency: 'Purchase Certificate', price: 90 },
};

/**
 * The permanent supply stages, derived rather than written down.
 *
 * The farming guide is a curated list of BUILD materials, so it has no entry for a
 * certificate, a skill summary or a battle record -- none of those is a material an
 * operator costs and two are currencies. They all come from the supply stages, and
 * scripts/build/build-supply-stages.mjs reads which from data/stages.json.
 *
 * Derived, because a hand-written range would have been wrong: CA-1 through CA-5 all
 * drop a Skill Summary, but only CA-4 and CA-5 drop a volume 3. Best stage first.
 */
const SUPPLY: Record<string, string[]> = supply;

/** The farming guide's own material -> stages map. Its labels are stage codes, with
 *  one exception: "Event Store", which is a shop rather than a stage. */
const EVENT_STORE = 'Event Store';
const FARMING = new Map(
  farmingTiers.flatMap((t) => t.materials).map((m) => [m.name, m.stages.map((s) => s.label)]),
);

function sourceFor(name: string): Source {
  const labels = FARMING.get(name) ?? [];
  /* The guide first, because its codes are chosen for efficiency; then the supply
     stages, which cover what the guide deliberately does not. */
  const stages = [...labels.filter((l) => l !== EVENT_STORE), ...(SUPPLY[name] ?? [])];

  /* A stage beats the Workshop, which is the one ordering decision here and not the
     obvious one. Almost everything below Tier 4 is craftable AND farmable -- an
     Orirock Cube is three Orirock at the workbench, or one run of 1-7 -- and the run
     is the better answer, because crafting it only moves the shortfall down a tier to
     something you would then have to go and farm anyway. So: if the guide names a
     stage, this is a farmable.
     What is left in the Workshop bucket is what has no stage at all: the chip line,
     the skill summaries, and Tier 4 and 5, which the game does not drop. */
  if (stages.length) return { kind: 'farm', stages };
  if (labels.includes(EVENT_STORE)) return { kind: 'event', stages: [] };
  /* formulaFor rather than isCraftable: the chip line is F_ASC, which the resolver
     must not walk (it is a cycle of class trades) but which a PLAYER can absolutely go
     and do at the same workbench. "Craft or promote" is the honest label for both.
     The room matters -- a Dualchip is made in the FACTORY out of two Chip Packs and a
     Chip Catalyst, and sending someone to the Workshop for one is sending them to the
     wrong bench. */
  const recipe = lookupRecipe(name);
  if (recipe) return { kind: recipe.room === 'FACTORY' ? 'factory' : 'workshop', stages: [] };
  /* After the bench, not before: anything you can make, you should make. This is for
     what is left, which the store is the only route to. */
  const buy = CERTIFICATE_STORE[name];
  if (buy) return { kind: 'certificate', stages: [], buy };
  return { kind: 'unknown', stages: [] };
}



/**
 * The SHORTEST list of stages that covers a set of farmables, best run first.
 *
 * A greedy cover, not a union. Each material lists two or three stages that drop it
 * and the same stage often drops several, so the answer worth showing is "run these
 * four and you have all eleven" -- the union just restates the list one level down.
 * It used to be the union, ordered by coverage, under a caption claiming it was a
 * cover: eleven farmables came out as eight stages, and "8 stages cover all 4
 * farmables" is a sentence that makes the reader do the arithmetic to find out it is
 * not telling them anything.
 *
 * Greedy is not guaranteed optimal -- set cover is NP-hard and greedy is within a
 * log factor -- which is the right trade for a strip of stage codes: it is always a
 * genuine cover, and it is always at least as short as the union.
 */
function stagesToRun(names: string[]): { codes: string[]; covers: number } {
  const stagesOf = new Map<string, string[]>();
  for (const name of names) {
    const s = sourceFor(name);
    if (s.kind !== 'farm' || !s.stages.length) continue;
    stagesOf.set(name, s.stages);
  }
  const uncovered = new Set(stagesOf.keys());
  const farmables = uncovered.size;
  const codes: string[] = [];
  while (uncovered.size) {
    const gain = new Map<string, number>();
    for (const name of uncovered) {
      for (const code of stagesOf.get(name)!) gain.set(code, (gain.get(code) || 0) + 1);
    }
    let best: string | null = null;
    let bestGain = 0;
    for (const [code, n] of gain) {
      if (n > bestGain || (n === bestGain && best !== null && code.localeCompare(best) < 0)) {
        best = code;
        bestGain = n;
      }
    }
    /* Cannot happen while `uncovered` is non-empty -- every name in it has at least
       one stage -- but a loop that could spin on bad data is worse than one that
       stops early. */
    if (!best) break;
    codes.push(best);
    for (const name of [...uncovered]) {
      if (stagesOf.get(name)!.includes(best)) uncovered.delete(name);
    }
  }
  return { codes, covers: farmables };
}
return { sourceFor, stagesToRun };
}

export const SOURCE_LABELS: Record<SourceKind, { tag: string; title: string; note: string }> = {
  workshop: { tag: 'Workshop', title: 'Craft or promote', note: 'no stage runs needed' },
  factory: { tag: 'Factory', title: 'Make in the base', note: 'no stage runs needed' },
  certificate: { tag: 'Certificate store', title: 'Buy with certificates', note: 'always open' },
  event: { tag: 'Event store', title: 'Buy with event currency', note: 'before the event ends' },
  farm: { tag: 'Farm', title: 'Run these stages', note: 'codes are the drop sources' },
  unknown: { tag: 'Elsewhere', title: 'No listed source', note: 'not in the farming guide' },
};

/** The order the groups are shown in: cheapest route first. */
export const SOURCE_ORDER: SourceKind[] = ['workshop', 'factory', 'certificate', 'event', 'farm', 'unknown'];
