import type { Target } from './calculator';
import { readDataTable } from '../content/dataTable';
import { getEnemyBundles } from '../enemies/enemies';

type Defined<T> = { m_defined: boolean; m_value: T };
type Rank = 'NORMAL' | 'ELITE' | 'BOSS';
type Attribute = 'def' | 'magicResistance' | 'epDamageResistance' | 'epResistance';
interface EnemyRecord {
  level: number;
  enemyData: {
    levelType?: Defined<Rank>;
    attributes?: Partial<Record<Attribute, Defined<number>>>;
  };
}
export interface EnemyPreset {
  id: string;
  name: string;
  code: string | null;
  levels: EnemyLevel[];
}
export type EnemyLevel = Pick<Target, 'tier' | 'def' | 'res' | 'elementalRes' | 'injuryRes'> & {
  level: number;
};
const ranks = { NORMAL: 'Grunt', ELITE: 'Elite', BOSS: 'Boss' } as const;
function defined<T>(field: Defined<T> | undefined) {
  return field?.m_defined ? field.m_value : undefined;
}

// Variants override level zero field by field. The combat levelType can differ
// from the rank printed in the handbook, including for Finale Cadence.
export function enemyTargets(): EnemyPreset[] {
  const database = readDataTable<Record<string, EnemyRecord[]>>('simulator/raw/enemy_database.json');
  return getEnemyBundles()
    .flatMap((bundle) =>
      bundle.enemies.map((enemy) => {
        const records = database[enemy.id];
        const base = records?.find((row) => row.level === 0)?.enemyData;
        if (!base) throw new Error('Missing base combat record for ' + enemy.id);
        const levels = records
          .map(({ level, enemyData }) => {
            const attr = (key: Attribute) =>
              defined(enemyData.attributes?.[key]) ?? defined(base.attributes?.[key]) ?? 0;
            const rank = defined(enemyData.levelType) ?? defined(base.levelType) ?? 'NORMAL';
            if (!(rank in ranks)) throw new Error('Unknown combat rank for ' + enemy.id);
            return {
              level,
              tier: ranks[rank],
              def: attr('def'),
              res: attr('magicResistance'),
              elementalRes: attr('epDamageResistance'),
              injuryRes: attr('epResistance'),
            };
          })
          .sort((a, b) => a.level - b.level);
        return { id: enemy.id, name: enemy.name, code: enemy.index, levels };
      }),
    )
    .sort((a, b) => a.name.localeCompare(b.name, 'en') || a.id.localeCompare(b.id));
}
