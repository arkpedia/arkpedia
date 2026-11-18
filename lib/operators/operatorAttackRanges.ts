import type { CroppedRange, ModuleAttackRange, Operator } from './operatorTypes';

export type { CroppedRange } from './operatorTypes';

/** The deployment dataset stores offsets as [forward, lateral]. */
export type AttackRangeTable = Record<string, number[][]>;

export interface OperatorAttackRange {
  elite: number;
  range: CroppedRange;
  talent: string | null;
}

function extendForward(cells: number[][], distance: number): number[][] {
  const edges = new Map<number, number>();
  for (const [forward, lateral] of cells) {
    edges.set(lateral, Math.max(forward, edges.get(lateral) ?? -Infinity));
  }
  return [...cells, ...[...edges].flatMap(([lateral, edge]) =>
    Array.from({ length: distance }, (_, step) => [edge + step + 1, lateral]))];
}

function cropAttackRange(cells: number[][]): CroppedRange {
  const minCol = Math.min(...cells.map(cell => cell[0]));
  const maxCol = Math.max(...cells.map(cell => cell[0]));
  const minRow = Math.min(...cells.map(cell => cell[1]));
  const maxRow = Math.max(...cells.map(cell => cell[1]));
  return {
    cols: maxCol - minCol + 1,
    rows: maxRow - minRow + 1,
    opCell: [1 - minRow, 1 - minCol],
    rangeCells: cells.filter(([forward, lateral]) => forward !== 0 || lateral !== 0)
      .map(([forward, lateral]) => [lateral - minRow + 1, forward - minCol + 1]),
  };
}

export function applyModuleAttackRange(base: CroppedRange, change: ModuleAttackRange): CroppedRange {
  if ('grid' in change) return change.grid;
  const [opRow, opCol] = base.opCell;
  const cells = base.rangeCells.map(([row, col]) => [col - opCol, row - opRow]);
  cells.push([0, 0]);
  return cropAttackRange(extendForward(cells, change.forward));
}

/* Permanent changes to the operator's own normal attack range. Verified against
 * character_table.json: Frostleaf's talent rangeId and Tachanka's
 * ability_range_forward_extend. Other talent rangeIds commonly describe buff
 * areas, substitutes or skill-only effects, so they must not be applied blindly.
 * Source: https://github.com/Kengxxiao/ArknightsGameData_YoStar/blob/main/en_US/gamedata/excel/character_table.json
 */
const PASSIVE_RANGE_CHANGES: Record<string, {
  elite: number; talent: string; rangeId?: string; forwardExtend?: number;
}[]> = {
  char_193_frostl: [{ elite: 2, talent: 'Covered Strike', rangeId: '3-1' }],
  char_459_tachak: [
    { elite: 0, talent: 'Heavy Firepower', forwardExtend: 1 },
    { elite: 2, talent: 'Heavy Firepower', forwardExtend: 2 },
  ],
};

/** First real promotion for each distinct normal range, including passive talents. */
export function getOperatorAttackRanges(
  operator: Pick<Operator, 'name' | 'internalName' | 'stats'>,
  table: AttackRangeTable,
): OperatorAttackRange[] {
  const seen = new Set<string>();
  const choices: OperatorAttackRange[] = [];
  // Amiya's alternate forms unlock after E2 story gates. Their game templates
  // still contain E0/E1 stat rows, but those forms cannot be used at those stages.
  const minimumElite = ['char_1001_amiya2', 'char_1037_amiya3'].includes(operator.internalName ?? '') ? 2 : 0;
  for (const phase of [...(operator.stats?.phases ?? [])].sort((a, b) => a.elite - b.elite)) {
    if (phase.elite < minimumElite) continue;
    const change = PASSIVE_RANGE_CHANGES[operator.internalName ?? '']
      ?.filter(entry => entry.elite <= phase.elite).at(-1);
    const rangeId = change?.rangeId ?? phase.rangeId;
    const raw = table[rangeId];
    if (!raw?.length) throw new Error(`${operator.name}: missing E${phase.elite} attack range ${rangeId}`);
    const cells = change?.forwardExtend ? extendForward(raw, change.forwardExtend) : [...raw];
    if (!cells.some(([forward, lateral]) => forward === 0 && lateral === 0)) cells.push([0, 0]);
    const unique = [...new Map(cells.map(cell => [cell.join(','), cell])).values()]
      .sort(([af, al], [bf, bl]) => al - bl || af - bf);
    const key = JSON.stringify(unique);
    if (seen.has(key)) continue;
    seen.add(key);
    choices.push({
      elite: phase.elite,
      talent: change?.talent ?? null,
      range: cropAttackRange(unique),
    });
  }
  return choices;
}
