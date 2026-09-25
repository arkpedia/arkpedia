import { CostGroup } from '../operators/operatorTypes';

// Named groups, defined once and reused both for the flat sort order
// and for splitting a material list into display rows -- avoids
// duplicating the same names in two places.
const EXP_LMD = ['EXP', 'LMD'];

// Sits right after LMD and before Chips.
const BATTLE_RECORDS = ['Strategic Battle Record', 'Tactical Battle Record', 'Frontline Battle Record', 'Drill Battle Record'];

/* Dualchip, then Chip Pack, then Chip -- the game's ladder, highest first, like the
   material tiers below. The Packs are here because the Workshop makes them
   (data/base-formulas.json); nothing an operator costs is denominated in one, so
   they only ever appear once crafting is in the answer. Left out, they sorted after
   everything else, which put a mid-tier chip below a Tier 1 Orirock. */
const CHIPS = [
  /* The catalyst the Factory wants alongside two Chip Packs to make a Dualchip. It is
     not part of the ladder, which is why it leads rather than sitting in it. */
  'Chip Catalyst',
  'Caster Dualchip', 'Defender Dualchip', 'Guard Dualchip', 'Medic Dualchip',
  'Sniper Dualchip', 'Specialist Dualchip', 'Supporter Dualchip', 'Vanguard Dualchip',
  'Caster Chip Pack', 'Defender Chip Pack', 'Guard Chip Pack', 'Medic Chip Pack',
  'Sniper Chip Pack', 'Specialist Chip Pack', 'Supporter Chip Pack', 'Vanguard Chip Pack',
  'Caster Chip', 'Defender Chip', 'Guard Chip', 'Medic Chip',
  'Sniper Chip', 'Specialist Chip', 'Supporter Chip', 'Vanguard Chip',
];

const SKILL_SUMMARIES = ['Skill Summary - 3', 'Skill Summary - 2', 'Skill Summary - 1'];

const MODULE_MATERIALS = ['Module Data Block', 'Data Supplement Stick', 'Data Supplement Instrument'];


/* The red one, and it is the only certificate here.
   The other three, plus the Recruitment Permit, Information Fragments, Furniture Parts,
   Originium Shards and Pure Gold, were all in this catalogue briefly and are all gone:
   none of them can appear in an operator's bill, so a depot tile for one is a box asking
   for a number nothing will ever subtract. What is left holds to that rule with one
   exception, LMD, which every bill names.
   This one stays because it buys a Chip Catalyst, and a Chip Catalyst is the one
   ingredient of a Dualchip that nothing drops and nothing makes. It sits with the
   currencies: a certificate is SPENT, not consumed, which is what LMD is and what a
   chip is not. */
const CERTIFICATES = ['Purchase Certificate'];

const T5 = [
  'D32 Steel', 'Bipolar Nanoflake', 'Polymerization Preparation', 'Nucleic Crystal Sinter',
  'Aggregate Cyclicene', 'Cyclicene Prefab', 'Coagulative Nodule', 'Crystalline Electronic Unit',
  'Transmuted Salt', 'Transmuted Salt Agglomerate', 'Fuscous Fiber', 'Solidified Fiber Board',
  'Chiral Refractor', 'Rephasic Enantiomer',
];

const T4 = [
  'Orirock Concentration', 'Optimized Device', 'Keton Colloid', 'Polyester Lump',
  'Oriron Block', 'Sugar Lump', 'Grindstone Pentahydrate', 'Incandescent Alloy Block',
  'White Horse Kohl', 'Manganese Trihydrate', 'RMA70-24', 'Refined Solvent',
  'Polymerized Gel', 'Crystalline Circuit', 'Cutting Fluid Solution',
];

const T3 = [
  'Orirock Cluster', 'Integrated Device', 'Aketon', 'Polyester Pack',
  'Oriron Cluster', 'Sugar Pack', 'Grindstone', 'Incandescent Alloy',
  'Loxic Kohl', 'Manganese Ore', 'RMA70-12', 'Semi-Synthetic Solvent',
  'Coagulating Gel', 'Crystalline Component', 'Compound Cutting Fluid',
];

const T2 = ['Orirock Cube', 'Device', 'Polyketon', 'Polyester', 'Oriron', 'Sugar'];

const T1 = ['Orirock', 'Damaged Device', 'Diketon', 'Ester', 'Oriron Shard', 'Sugar Substitute'];

/** Explicit priority order for displaying a single flowing material
 * list. Two synthetic entries -- "EXP" and "LMD" -- lead the list,
 * followed by the four Battle Record types, chips (Dualchip tier,
 * then Chip tier, each alphabetized by class), Skill Summaries (3
 * down to 1), module materials, Recruitment Permit, Information
 * Fragment, then the tiered raw materials (T5 down to T1), and
 * finally Furniture Part at the very end. */
export const MATERIAL_SORT_ORDER: string[] = [
  ...EXP_LMD,
  ...CERTIFICATES,
  ...BATTLE_RECORDS,
  ...CHIPS,
  ...SKILL_SUMMARIES,
  ...MODULE_MATERIALS,
  ...T5,
  ...T4,
  ...T3,
  ...T2,
  ...T1,
];

/**
 * The same names again, but grouped for a screen that shows all of them at once.
 *
 * The flat order above is right for a cost list, which is a handful of items in one
 * run. The depot is the whole catalogue, and sixty-five tiles in one grid is a wall
 * -- it needs the headings the game itself uses. Built from the same constants as
 * MATERIAL_SORT_ORDER so the two cannot describe different sets, and asserted below
 * so that adding a name to one and forgetting the other fails loudly.
 *
 * EXP is not here: it is a number an operator needs, not a thing you hold. What you
 * hold is battle records, which are.
 */
export interface MaterialGroup {
  /** What the group is called. One label, not two: these used to be a paired
   *  tag/heading -- "TIER 5 MATERIALS", "CURRENCY, RECORDS & CHIPS CHIPS" -- and the
   *  second half never carried anything. It said MATERIALS five times down the list
   *  and repeated the tag outright in the other two. */
  tag: string;
  names: string[];
}

export const MATERIAL_GROUPS: MaterialGroup[] = [
  { tag: 'Skills & modules', names: [...SKILL_SUMMARIES, ...MODULE_MATERIALS] },
  { tag: 'Currency, records & chips', names: ['LMD', ...CERTIFICATES, ...BATTLE_RECORDS, ...CHIPS] },
  { tag: 'Tier 5', names: T5 },
  { tag: 'Tier 4', names: T4 },
  { tag: 'Tier 3', names: T3 },
  { tag: 'Tier 2', names: T2 },
  { tag: 'Tier 1', names: T1 },
];

/* Every name in the sort order is in exactly one group, and no group invents one.
   EXP is the single deliberate omission. This runs at import, so a name added to one
   list and not the other is a module-load error rather than a tile that quietly
   never appears. */
{
  const grouped = MATERIAL_GROUPS.flatMap((g) => g.names);
  const dupes = grouped.filter((n, i) => grouped.indexOf(n) !== i);
  const missing = MATERIAL_SORT_ORDER.filter((n) => n !== 'EXP' && !grouped.includes(n));
  const extra = grouped.filter((n) => !MATERIAL_SORT_ORDER.includes(n));
  if (dupes.length || missing.length || extra.length) {
    throw new Error(
      'materialSortOrder: MATERIAL_GROUPS and MATERIAL_SORT_ORDER disagree.' +
      (missing.length ? ` Ungrouped: ${missing.join(', ')}.` : '') +
      (extra.length ? ` Not in the sort order: ${extra.join(', ')}.` : '') +
      (dupes.length ? ` In two groups: ${dupes.join(', ')}.` : ''),
    );
  }
}

/**
 * The order the game's own depot lists things in.
 *
 * Derived, not transcribed. item_table gives every item a sortId and that sortId IS
 * the depot screen's order -- LMD 10201, Pure Gold 10202, the certificates 10203/4/5.
 * scripts/build/build-ingame-order.mjs pulls the numbers out for every material the site has
 * art for; this sorts the catalogue by them.
 *
 * It began as a hand transcription of a real depot, which is how the derivation is
 * known to be right: 96 of the 96 materials that carry a sortId came out in exactly the
 * order the screen showed. What the transcription could not show was the two the player
 * did not happen to hold, and those are precisely what deriving it fixes -- Originium
 * Shard sits at 10003, ABOVE LMD, and Recruitment Permit at 40012, between the
 * certificates and the battle records. Neither position was guessable.
 *
 * Kept apart from MATERIAL_SORT_ORDER above, which is ranked by TIER because the
 * crafting resolver walks it in that order and leans on it: a Tier 3 and a Tier 4
 * target can want the same Tier 2 ingredient and the higher tier has to win. The game's
 * order groups by material LINE instead, so tier is not monotonic down it and ranking
 * the resolver by it would quietly change which target takes a contested ingredient.
 * This one is display only.
 *
 * The sortIds are data/item-sort-ids.json, a game table the content release carries (the
 * release's copy also numbers the token items); the planner reads it from its props and
 * passes it in, so /operators and /events, which only sort cost lists, never load it.
 */
export function inGameOrder(sortIds: Record<string, number>): string[] {
  return MATERIAL_SORT_ORDER
    /* EXP is a number an operator needs, not a thing you hold, so it has no place on a
       depot screen and no sortId either. */
    .filter((name) => name !== 'EXP')
    .slice()
    .sort((a, b) => (sortIds[a] ?? Infinity) - (sortIds[b] ?? Infinity) || a.localeCompare(b));
}

/* Every holdable material has a place in that order. A name with no sortId sorts to the
   end, which is a tile in the wrong place rather than a missing one -- silent either
   way, so it fails here instead. /planner's table loader runs this wherever the table is
   read from data/ -- the build's prerender and the content export -- which is where the
   import-time check this replaced used to fail. The browser sorts a missing one last. */
export function checkItemSortIds(sortIds: Record<string, number>): Record<string, number> {
  const placeless = inGameOrder(sortIds).filter((name) => sortIds[name] === undefined);
  if (placeless.length) {
    throw new Error(
      'materialSortOrder: no sortId for ' + placeless.join(', ') +
      '. Re-run scripts/build/build-ingame-order.mjs; if the game genuinely has no entry for it, ' +
      'add an alias there the way Information Fragment(s) has one.',
    );
  }
  return sortIds;
}

const SORT_INDEX = new Map(MATERIAL_SORT_ORDER.map((name, i) => [name, i]));

/** Sorts a material list according to the explicit order above.
 * Anything not in the list (shouldn't normally happen, but data is
 * data) sorts after everything that is, alphabetically among itself
 * rather than disappearing or erroring. */
export function sortMaterials(items: CostGroup): CostGroup {
  return [...items].sort((a, b) => {
    const ai = SORT_INDEX.get(a.name);
    const bi = SORT_INDEX.get(b.name);
    if (ai !== undefined && bi !== undefined) return ai - bi;
    if (ai !== undefined) return -1;
    if (bi !== undefined) return 1;
    return a.name.localeCompare(b.name);
  });
}

export interface MaterialRowGroup {
  key: string;
  items: CostGroup;
}

/** Splits a material list into display rows: EXP/LMD + Battle Records
 * + Chips together on one row, Skill Summaries + module materials
 * together on the next, Recruitment Permit + Information Fragment
 * together on the next, then each material tier (T5 through T1) on
 * its own row, then Furniture Part on a final row. Anything that
 * doesn't fall in a named group is appended as a last row so nothing
 * silently disappears. */
export function groupMaterialsIntoRows(items: CostGroup): MaterialRowGroup[] {
  const sorted = sortMaterials(items);
  const byName = new Map(sorted.map((item) => [item.name, item]));
  const used = new Set<string>();

  function pick(names: string[]): CostGroup {
    const picked: CostGroup = [];
    for (const name of names) {
      const item = byName.get(name);
      if (item) {
        picked.push(item);
        used.add(name);
      }
    }
    return picked;
  }

  const rows: MaterialRowGroup[] = [
    { key: 'exp-records-chips', items: pick([...EXP_LMD, ...CERTIFICATES, ...BATTLE_RECORDS, ...CHIPS]) },
    { key: 'summaries-modules', items: pick([...SKILL_SUMMARIES, ...MODULE_MATERIALS]) },
    { key: 't5', items: pick(T5) },
    { key: 't4', items: pick(T4) },
    { key: 't3', items: pick(T3) },
    { key: 't2', items: pick(T2) },
    { key: 't1', items: pick(T1) },
    /* Anything the rows above do not name still gets a row of its own at the end --
       see the leftover push below. Nothing falls off. */
  ].filter((row) => row.items.length > 0);

  const leftover = sorted.filter((item) => !used.has(item.name));
  if (leftover.length > 0) rows.push({ key: 'other', items: leftover });

  return rows;
}