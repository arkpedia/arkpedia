// Attack-range grids per operator branch (subclass), transcribed from
// each branch's own CSS grid-area layout. Each entry's FIRST cell is
// always the operator's own tile; the rest are attackable tiles.
//
// Elite 1 range is only stored separately (`e1`) when it genuinely
// differs from Elite 0 -- branches with no `e1` use the same range at
// every elite. One known exception NOT modeled here: Kal'tsit's own
// Elite 2 range differs from the rest of the Medic branch -- that's an
// operator-specific override, not a branch-wide rule, so encoding it
// under "Medic" would incorrectly apply it to every Medic-branch
// operator. Left out until there's a per-operator override mechanism.
//
// IMPORTANT: these keys must exactly match `operator.branch` values
// elsewhere in the codebase (case-insensitive, whitespace-trimmed --
// see normalizeBranchKey below). Several of the source labels had
// typos ("Strategistt", "Forterss", "Trapmaste", "Senty Protector",
// "Arts Peroctectors", "Incantation Medi") which have been corrected
// to their standard spelling here -- worth double-checking these
// against your actual operator.branch values, since a mismatch means
// getBranchRange silently returns null (no range box shown) for that
// branch rather than an error you'd notice immediately.

export interface CroppedRange {
  cols: number;
  rows: number;
  opCell: [number, number];
  rangeCells: [number, number][];
}

interface BranchRangeRaw {
  cols: number; // total grid-template-columns count from the source CSS
  e0: [number, number][]; // first entry is always the operator's own tile
  e1?: [number, number][]; // present only when Elite 1 differs from Elite 0
}

const RAW: Record<string, BranchRangeRaw> = {
  Charger: { cols: 5, e0: [[3, 1], [3, 2]] },
  Pioneer: { cols: 5, e0: [[3, 1], [3, 2]] },
  'Standard Bearer': { cols: 5, e0: [[3, 1], [3, 2]] },
  Strategist: { cols: 5, e0: [[3, 1], [3, 2]] },
  Tactician: {
    cols: 5,
    e0: [[3, 1], [3, 2], [3, 3], [3, 4], [2, 1], [2, 2], [2, 3], [4, 1], [4, 2], [4, 3]],
    e1: [[3, 1], [3, 2], [3, 3], [3, 4], [2, 1], [2, 2], [2, 3], [2, 4], [4, 1], [4, 2], [4, 3], [4, 4]],
  },

  'Arts Fighter': { cols: 5, e0: [[3, 1], [3, 2]] },
  Centurion: { cols: 5, e0: [[3, 1], [3, 2]] },
  Crusher: { cols: 5, e0: [[3, 1], [3, 2]] },
  Dreadnought: { cols: 5, e0: [[3, 1], [3, 2]] },
  Earthshaker: { cols: 5, e0: [[3, 1], [3, 2]] },
  Fighter: { cols: 5, e0: [[3, 1], [3, 2]] },
  Instructor: { cols: 5, e0: [[3, 1], [3, 2], [3, 3]] },
  Liberator: { cols: 5, e0: [[3, 1], [2, 1], [3, 2], [4, 1]] },
  Lord: {
    cols: 5,
    e0: [[3, 1], [2, 1], [2, 2], [4, 1], [4, 2], [3, 2], [3, 3]],
    e1: [[3, 1], [2, 1], [2, 2], [4, 1], [4, 2], [3, 2], [3, 3], [3, 4]],
  },
  Mercenary: { cols: 5, e0: [[3, 1], [3, 2]] },
  'Primal Guard': { cols: 5, e0: [[3, 1], [3, 2]] },
  Reaper: { cols: 5, e0: [[3, 1], [2, 2], [3, 2], [4, 2]] },
  Soloblade: { cols: 5, e0: [[3, 1], [3, 2]] },
  Swordmaster: { cols: 5, e0: [[3, 1], [3, 2]] },
  'Arts Protector': { cols: 5, e0: [[3, 1]] },
  Duelist: { cols: 5, e0: [[3, 1], [3, 2]] },

  Fortress: {
    cols: 6,
    e0: [[3, 1], [2, 4], [2, 5], [3, 4], [3, 5], [4, 4], [4, 5]],
    e1: [[3, 1], [2, 4], [2, 5], [3, 4], [3, 5], [4, 4], [4, 5], [3, 6]],
  },
  Guardian: { cols: 5, e0: [[3, 1]] },
  Juggernaut: { cols: 5, e0: [[3, 1], [3, 2]] },
  'Primal Protector': { cols: 5, e0: [[3, 1]] },
  Protector: { cols: 5, e0: [[3, 1]] },
  'Sentry Protector': { cols: 5, e0: [[3, 1], [3, 2], [3, 3]] },

  Artilleryman: {
    cols: 5,
    e0: [[3, 1], [3, 2], [3, 3], [3, 4], [2, 1], [2, 2], [2, 3], [2, 4], [4, 1], [4, 2], [4, 3], [4, 4]],
    e1: [[3, 1], [3, 2], [3, 3], [3, 4], [2, 1], [2, 2], [2, 3], [2, 4], [4, 1], [4, 2], [4, 3], [4, 4], [3, 5]],
  },
  Besieger: {
    cols: 5,
    e0: [[3, 1], [2, 3], [3, 3], [4, 3], [2, 4], [3, 4], [4, 4]],
    e1: [[3, 1], [1, 3], [1, 4], [2, 3], [2, 4], [2, 5], [3, 3], [3, 4], [3, 5], [4, 3], [4, 4], [4, 5], [5, 3], [5, 4]],
  },
  Deadeye: {
    cols: 5,
    e0: [[3, 1], [3, 2], [3, 3], [3, 4], [2, 1], [2, 2], [2, 3], [2, 4], [4, 1], [4, 2], [4, 3], [4, 4]],
    e1: [[3, 1], [3, 2], [3, 3], [3, 4], [3, 5], [2, 1], [2, 2], [2, 3], [2, 4], [4, 1], [4, 2], [4, 3], [4, 4], [1, 1], [1, 2], [1, 3], [5, 1], [5, 2], [5, 3]],
  },
  Flinger: {
    cols: 5,
    e0: [[3, 1], [3, 2], [3, 3], [3, 4], [2, 1], [2, 2], [2, 3], [2, 4], [4, 1], [4, 2], [4, 3], [4, 4]],
    e1: [[3, 1], [3, 2], [3, 3], [3, 4], [3, 5], [2, 1], [2, 2], [2, 3], [2, 4], [4, 1], [4, 2], [4, 3], [4, 4], [1, 1], [1, 2], [1, 3], [5, 1], [5, 2], [5, 3]],
  },
  Heavyshooter: {
    cols: 5,
    e0: [[3, 1], [3, 2], [3, 3], [2, 1], [2, 2], [4, 1], [4, 2]],
    e1: [[3, 1], [3, 2], [3, 3], [2, 1], [2, 2], [2, 3], [4, 1], [4, 2], [4, 3]],
  },
  Hunter: {
    cols: 5,
    e0: [[3, 1], [2, 1], [2, 2], [4, 1], [4, 2], [3, 2], [3, 3], [3, 4]],
    e1: [[3, 1], [2, 1], [2, 2], [4, 1], [4, 2], [3, 2], [3, 3], [3, 4], [3, 5]],
  },
  Loopshooter: {
    cols: 5,
    e0: [[3, 2], [2, 2], [2, 3], [2, 4], [2, 5], [3, 3], [3, 4], [3, 5], [4, 2], [4, 3], [4, 4], [4, 5]],
    e1: [[3, 2], [2, 2], [2, 3], [2, 4], [2, 5], [3, 3], [3, 4], [3, 5], [4, 2], [4, 3], [4, 4], [4, 5], [2, 1], [3, 1], [4, 1]],
  },
  Marksman: {
    cols: 5,
    e0: [[3, 1], [2, 1], [2, 2], [2, 3], [3, 2], [3, 3], [3, 4], [4, 1], [4, 2], [4, 3]],
    e1: [[3, 1], [3, 2], [3, 3], [3, 4], [2, 1], [2, 2], [2, 3], [2, 4], [4, 1], [4, 2], [4, 3], [4, 4]],
  },
  Skybreaker: {
    cols: 5,
    e0: [[3, 1], [3, 2], [3, 3], [2, 1], [2, 2], [2, 3], [4, 1], [4, 2], [4, 3]],
    e1: [[3, 1], [2, 1], [2, 2], [2, 3], [3, 2], [3, 3], [3, 4], [4, 1], [4, 2], [4, 3]],
  },
  Spreadshooter: {
    cols: 5,
    e0: [[3, 1], [2, 2], [3, 2], [4, 2], [3, 3]],
    e1: [[3, 1], [2, 2], [3, 2], [4, 2], [2, 3], [3, 3], [4, 3]],
  },

  'Blast Caster': {
    cols: 6,
    e0: [[3, 1], [3, 2], [3, 3], [3, 4], [3, 5]],
    e1: [[3, 1], [3, 2], [3, 3], [3, 4], [3, 5], [3, 6]],
  },
  'Chain Caster': {
    cols: 5,
    e0: [[3, 1], [2, 1], [2, 2], [3, 2], [4, 2], [4, 1]],
    e1: [[3, 1], [2, 1], [2, 2], [3, 2], [4, 2], [4, 1], [3, 3]],
  },
  'Core Caster': {
    cols: 5,
    e0: [[3, 1], [2, 1], [2, 2], [3, 2], [4, 2], [4, 1]],
    e1: [[3, 1], [2, 1], [2, 2], [3, 2], [4, 2], [4, 1], [3, 3]],
  },
  'Mech-Accord Caster': {
    cols: 5,
    e0: [[3, 1], [2, 1], [2, 2], [3, 2], [4, 2], [4, 1]],
    e1: [[3, 1], [2, 1], [2, 2], [3, 2], [4, 2], [4, 1], [3, 3]],
  },
  'Mystic Caster': {
    cols: 5,
    e0: [[3, 1], [2, 2], [3, 2], [4, 2], [2, 3], [3, 3], [4, 3], [3, 4]],
    e1: [[3, 1], [2, 2], [3, 2], [4, 2], [2, 3], [3, 3], [4, 3], [2, 4], [3, 4], [4, 4]],
  },
  'Phalanx Caster': {
    cols: 5,
    e0: [[3, 3], [2, 3], [2, 4], [3, 4], [4, 4], [4, 3], [4, 2], [3, 2], [2, 2]],
    e1: [[3, 3], [2, 3], [2, 4], [3, 4], [4, 4], [4, 3], [4, 2], [3, 2], [2, 2], [1, 3], [3, 5], [5, 3], [3, 1]],
  },
  'Primal Caster': {
    cols: 5,
    e0: [[3, 1], [2, 1], [2, 2], [3, 2], [4, 2], [4, 1]],
    e1: [[3, 1], [2, 1], [2, 2], [3, 2], [4, 2], [4, 1], [3, 3]],
  },
  'Shaper Caster': {
    cols: 5,
    e0: [[3, 1], [2, 1], [2, 2], [3, 2], [4, 2], [4, 1]],
    e1: [[3, 1], [2, 1], [2, 2], [3, 2], [4, 2], [4, 1], [3, 3]],
  },
  'Splash Caster': {
    cols: 5,
    e0: [[3, 1], [2, 1], [2, 2], [3, 2], [3, 3], [4, 1], [4, 2]],
    e1: [[3, 1], [2, 1], [2, 2], [2, 3], [3, 2], [3, 3], [4, 1], [4, 2], [4, 3]],
  },

  'Chain Medic': {
    cols: 5,
    e0: [[3, 2], [2, 1], [2, 2], [2, 3], [3, 1], [3, 3], [3, 4], [4, 1], [4, 2], [4, 3]],
    e1: [[3, 2], [2, 1], [2, 2], [2, 3], [2, 4], [3, 1], [3, 3], [3, 4], [4, 1], [4, 2], [4, 3], [4, 4]],
  },
  'Incantation Medic': {
    cols: 5,
    e0: [[3, 1], [2, 1], [2, 2], [2, 3], [3, 2], [3, 3], [3, 4], [4, 1], [4, 2], [4, 3]],
    e1: [[3, 1], [3, 2], [3, 3], [3, 4], [2, 1], [2, 2], [2, 3], [2, 4], [4, 1], [4, 2], [4, 3], [4, 4]],
  },
  Medic: {
    cols: 5,
    e0: [[3, 1], [2, 1], [2, 2], [2, 3], [3, 2], [3, 3], [3, 4], [4, 1], [4, 2], [4, 3]],
    e1: [[3, 1], [3, 2], [3, 3], [3, 4], [2, 1], [2, 2], [2, 3], [2, 4], [4, 1], [4, 2], [4, 3], [4, 4]],
  },
  'Multi-target Medic': {
    cols: 5,
    e0: [[3, 2], [2, 1], [2, 2], [2, 3], [3, 1], [3, 3], [3, 4], [4, 1], [4, 2], [4, 3]],
    e1: [[3, 2], [2, 1], [2, 2], [2, 3], [2, 4], [3, 1], [3, 3], [3, 4], [4, 1], [4, 2], [4, 3], [4, 4]],
  },
  Therapist: {
    cols: 5,
    e0: [[3, 1], [3, 2], [3, 3], [3, 4], [2, 1], [2, 2], [2, 3], [2, 4], [4, 1], [4, 2], [4, 3], [4, 4]],
    e1: [[3, 1], [1, 1], [1, 2], [1, 3], [2, 1], [2, 2], [2, 3], [2, 4], [3, 2], [3, 3], [3, 4], [4, 1], [4, 2], [4, 3], [4, 4], [5, 1], [5, 2], [5, 3]],
  },
  'Wandering Medic': {
    cols: 5,
    e0: [[3, 1], [3, 2], [3, 3], [3, 4], [2, 1], [2, 2], [2, 3], [2, 4], [4, 1], [4, 2], [4, 3], [4, 4]],
    e1: [[3, 1], [1, 2], [1, 3], [1, 4], [2, 1], [2, 2], [2, 3], [2, 4], [3, 2], [3, 3], [3, 4], [4, 1], [4, 2], [4, 3], [4, 4], [5, 2], [5, 3], [5, 4]],
  },
  Watchman: {
    cols: 5,
    e0: [[3, 2], [2, 1], [2, 2], [2, 3], [2, 4], [3, 1], [3, 3], [3, 4], [4, 1], [4, 2], [4, 3], [4, 4]],
    e1: [[3, 2], [2, 1], [2, 2], [2, 3], [2, 4], [3, 1], [3, 3], [3, 4], [4, 1], [4, 2], [4, 3], [4, 4], [1, 2], [1, 3], [5, 2], [5, 3]],
  },

  Abjure: {
    cols: 5,
    e0: [[3, 2], [2, 1], [2, 2], [2, 3], [2, 4], [3, 1], [3, 3], [3, 4], [4, 1], [4, 2], [4, 3], [4, 4]],
    e1: [[3, 2], [2, 1], [2, 2], [2, 3], [2, 4], [3, 1], [3, 3], [3, 4], [4, 1], [4, 2], [4, 3], [4, 4], [1, 2], [1, 3], [5, 2], [5, 3]],
  },
  Artificer: { cols: 5, e0: [[3, 1], [3, 2]] },
  Bard: {
    cols: 5,
    e0: [[3, 3], [2, 3], [2, 4], [3, 4], [4, 4], [4, 3], [4, 2], [3, 2], [2, 2]],
    e1: [[3, 3], [2, 3], [2, 4], [3, 4], [4, 4], [4, 3], [4, 2], [3, 2], [2, 2], [1, 3], [3, 5], [5, 3], [3, 1]],
  },
  'Decel Binder': {
    cols: 5,
    e0: [[3, 2], [2, 1], [2, 2], [2, 3], [2, 4], [3, 1], [3, 3], [3, 4], [4, 1], [4, 2], [4, 3], [4, 4]],
  },
  Hexer: {
    cols: 5,
    e0: [[3, 2], [2, 1], [2, 2], [2, 3], [2, 4], [3, 1], [3, 3], [3, 4], [4, 1], [4, 2], [4, 3], [4, 4]],
    e1: [[3, 2], [2, 1], [2, 2], [2, 3], [2, 4], [3, 1], [3, 3], [3, 4], [4, 1], [4, 2], [4, 3], [4, 4], [1, 2], [1, 3], [5, 2], [5, 3]],
  },
  Ritualist: {
    cols: 5,
    e0: [[3, 2], [2, 1], [2, 2], [2, 3], [2, 4], [3, 1], [3, 3], [3, 4], [4, 1], [4, 2], [4, 3], [4, 4]],
  },
  Summoner: {
    cols: 5,
    e0: [[3, 1], [2, 1], [2, 2], [3, 2], [4, 2], [4, 1]],
    e1: [[3, 1], [2, 1], [2, 2], [3, 2], [4, 2], [4, 1], [3, 3]],
  },

  Alchemist: {
    cols: 5,
    e0: [[3, 1], [1, 1], [2, 1], [4, 1], [5, 1], [2, 2], [3, 2], [4, 2], [3, 3]],
    e1: [[3, 1], [1, 1], [2, 1], [4, 1], [5, 1], [1, 2], [2, 2], [3, 2], [4, 2], [5, 2], [2, 3], [3, 3], [4, 3]],
  },
  Ambusher: {
    cols: 5,
    e0: [[3, 2], [2, 1], [2, 2], [2, 3], [3, 1], [3, 3], [3, 4], [4, 1], [4, 2], [4, 3]],
  },
  Dollkeeper: { cols: 5, e0: [[3, 1], [3, 2]] },
  Executor: { cols: 5, e0: [[3, 1], [3, 2]] },
  Geek: {
    cols: 5,
    e0: [[3, 1], [2, 1], [2, 2], [2, 3], [3, 2], [3, 3], [3, 4], [4, 1], [4, 2], [4, 3]],
    e1: [[3, 1], [3, 2], [3, 3], [3, 4], [2, 1], [2, 2], [2, 3], [2, 4], [4, 1], [4, 2], [4, 3], [4, 4]],
  },
  Hookmaster: {
    cols: 5,
    e0: [[3, 1], [3, 2], [3, 3]],
    e1: [[3, 1], [3, 2], [3, 3], [3, 4]],
  },
  Merchant: { cols: 5, e0: [[3, 1], [3, 2]] },
  'Push Stroker': { cols: 5, e0: [[3, 1], [3, 2]] },
  Skyranger: {
    cols: 5,
    e0: [[3, 1], [3, 2]],
    e1: [[3, 1], [3, 2], [3, 3]],
  },
  Trapmaster: {
    cols: 5,
    e0: [[3, 1], [2, 1], [2, 2], [2, 3], [3, 2], [3, 3], [3, 4], [4, 1], [4, 2], [4, 3]],
    e1: [[3, 1], [3, 2], [3, 3], [3, 4], [2, 1], [2, 2], [2, 3], [2, 4], [4, 1], [4, 2], [4, 3], [4, 4]],
  },
};

const NORMALIZED_INDEX = new Map<string, string>();
for (const key of Object.keys(RAW)) {
  NORMALIZED_INDEX.set(key.trim().toLowerCase(), key);
}

function normalizeBranchKey(branchName: string): string | null {
  return NORMALIZED_INDEX.get(branchName.trim().toLowerCase()) || null;
}

/** Crops out any row with nothing in it (neither the operator's own
 * tile nor a range tile), re-indexing the remaining rows to be
 * contiguous starting at 1. Columns are handled differently: interior
 * gaps are NEVER touched (for branches like Fortress/Besieger, an
 * empty column between the operator and their range IS the range
 * mechanic -- how far away they have to be before they can attack --
 * so compressing it would misrepresent the real data), but TRAILING
 * columns past the last one actually used ARE trimmed, since those
 * are just leftover width from the source CSS reusing a generic
 * repeat(5,1fr)/repeat(6,1fr) template regardless of how many columns
 * that particular branch's range actually needs (e.g. Charger only
 * ever uses columns 1-2 of its nominal 5-column grid -- the other 3
 * were never meaningful, just unused template width). */
function cropEmptyRows(cols: number, cells: [number, number][]): CroppedRange {
  const rowsUsed = Array.from(new Set(cells.map((c) => c[0]))).sort((a, b) => a - b);
  const rowMap = new Map<number, number>();
  rowsUsed.forEach((r, i) => rowMap.set(r, i + 1));
  const mapped = cells.map(([r, c]): [number, number] => [rowMap.get(r)!, c]);
  const maxColUsed = Math.max(...cells.map((c) => c[1]));
  return {
    cols: Math.min(cols, maxColUsed),
    rows: rowsUsed.length,
    opCell: mapped[0],
    rangeCells: mapped.slice(1),
  };
}

/** Returns the row-cropped range grid for a branch at a given elite
 * level (elite >= 1 uses the Elite 1 shape when the branch has one,
 * elite 0 always uses the Elite 0 shape). Returns null if the branch
 * name isn't recognized (see the typo-correction note at the top of
 * this file) or if the operator has no branch at all. */
export function getBranchRange(branchName: string | null | undefined, elite: number): CroppedRange | null {
  if (!branchName) return null;
  const matchedKey = normalizeBranchKey(branchName);
  if (!matchedKey) return null;
  const raw = RAW[matchedKey];
  const cells = elite >= 1 && raw.e1 ? raw.e1 : raw.e0;
  return cropEmptyRows(raw.cols, cells);
}