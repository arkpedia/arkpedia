import type { CroppedRange } from './branchRanges';
import type { Operator } from './operatorTypes';

/** The deployment dataset stores offsets as [forward, lateral]. */
export type AttackRangeTable = Record<string, number[][]>;

export interface OperatorAttackRange {
  elite: number;
  range: CroppedRange;
  talent: string | null;
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
    const cells = raw.map(([forward, lateral]) => [forward, lateral]);
    if (change?.forwardExtend) {
      // Extend each occupied row's forward edge, retaining the original tiles.
      for (const lateral of new Set(cells.map(cell => cell[1]))) {
        const edge = Math.max(...cells.filter(cell => cell[1] === lateral).map(cell => cell[0]));
        for (let step = 1; step <= change.forwardExtend; step++) cells.push([edge + step, lateral]);
      }
    }
    if (!cells.some(([forward, lateral]) => forward === 0 && lateral === 0)) cells.push([0, 0]);
    const unique = [...new Map(cells.map(cell => [cell.join(','), cell])).values()]
      .sort(([af, al], [bf, bl]) => al - bl || af - bf);
    const key = JSON.stringify(unique);
    if (seen.has(key)) continue;
    seen.add(key);
    const minCol = Math.min(...unique.map(cell => cell[0]));
    const maxCol = Math.max(...unique.map(cell => cell[0]));
    const minRow = Math.min(...unique.map(cell => cell[1]));
    const maxRow = Math.max(...unique.map(cell => cell[1]));
    choices.push({
      elite: phase.elite,
      talent: change?.talent ?? null,
      range: {
        cols: maxCol - minCol + 1,
        rows: maxRow - minRow + 1,
        opCell: [1 - minRow, 1 - minCol],
        rangeCells: unique.filter(([forward, lateral]) => forward !== 0 || lateral !== 0)
          .map(([forward, lateral]) => [lateral - minRow + 1, forward - minCol + 1]),
      },
    });
  }
  return choices;
}
