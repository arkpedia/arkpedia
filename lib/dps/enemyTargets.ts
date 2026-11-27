import type { Target } from './calculator';
import { enemyDefenseForms, type EnemyDefenseForm } from './enemyDefenseForms';
import { enemyFightPhases, type EnemyFightPhase } from './enemyFightPhases';
import { readDataTable } from '../content/dataTable';
import { getEnemyBundles } from '../enemies/enemies';

type Defined<T> = { m_defined: boolean; m_value: T };
type Rank = 'NORMAL' | 'ELITE' | 'BOSS';
type Attribute = 'maxHp' | 'def' | 'magicResistance' | 'epDamageResistance' | 'epResistance';
interface EnemyRecord {
  level: number;
  enemyData: {
    name?: Defined<string>;
    levelType?: Defined<Rank>;
    attributes?: Partial<Record<Attribute, Defined<number>>>;
    talentBlackboard?: { key: string; value: number }[] | null;
    skills?: { blackboard?: { key: string; value: number }[] | null }[] | null;
  };
}
interface Handbook { enemyData: Record<string, { name: string; enemyIndex?: string | null }> }
export interface EnemyPreset {
  id: string;
  name: string;
  code: string | null;
  levels: EnemyLevel[];
}
export type EnemyLevel = Pick<Target, 'tier' | 'def' | 'res' | 'elementalRes' | 'injuryRes'> & {
  level: number;
  hp?: number;
  forms?: EnemyDefenseForm[];
  fight?: EnemyFightPhase[];
  defenseNote?: string;
};
const ranks = { NORMAL: 'Grunt', ELITE: 'Elite', BOSS: 'Boss' } as const;
function defined<T>(field: Defined<T> | undefined) {
  return field?.m_defined ? field.m_value : undefined;
}

// Variants override level zero field by field. The combat levelType can differ
// from the rank printed in the handbook, including for Finale Cadence.
export function enemyTargets(): EnemyPreset[] {
  const database = readDataTable<Record<string, EnemyRecord[]>>('simulator/raw/enemy_database.json');
  const handbook = readDataTable<Handbook>('simulator/raw/enemy_handbook_table.json').enemyData;
  const summaries = new Map(getEnemyBundles().flatMap(bundle => bundle.enemies.map(enemy => [enemy.id, enemy] as const)));
  for (const id of summaries.keys()) {
    if (!database[id]) throw new Error('Missing combat record for ' + id);
  }
  return Object.entries(database).map(([id, records]) => {
    const enemy = summaries.get(id);
    const base = records.find((row) => row.level === 0)?.enemyData;
    if (!base) throw new Error('Missing base combat record for ' + id);
    const levels = records
      .map(({ level, enemyData }) => {
        const attr = (key: Attribute) =>
          defined(enemyData.attributes?.[key]) ?? defined(base.attributes?.[key]) ?? 0;
        const rank = defined(enemyData.levelType) ?? defined(base.levelType) ?? 'NORMAL';
        if (!(rank in ranks)) throw new Error('Unknown combat rank for ' + id);
        const def = attr('def');
        const res = attr('magicResistance');
        const talents = new Map<string, number>();
        for (const { key, value } of [...base.talentBlackboard ?? [], ...enemyData.talentBlackboard ?? []]) {
          if (typeof key === 'string' && Number.isFinite(value)) talents.set(key, value);
        }
        const reviewed = enemyDefenseForms(id, { def, res }, talents);
        const hp = attr('maxHp');
        const fight = enemyFightPhases(id, { def, res }, reviewed?.forms, talents);
        // Blackboard keys can also describe buffs or debuffs applied to
        // other units. Use them to flag a record for review, not to infer a form.
        const defenseParameter = /(?:^|[.@])(def|magic_resistance|ep_damage_resistance|ep_resistance|damage_resistance|invincible)$/i;
        const hasCombatModifiers = [...talents.keys()].some(key => defenseParameter.test(key))
          || [base, enemyData].some(record => record.skills?.some(skill =>
            Array.isArray(skill.blackboard) && skill.blackboard.some(entry => defenseParameter.test(entry.key))))
          || enemy?.abilities.some(ability => ability.format === 'title');
        const defenseNote = reviewed?.note ?? (!reviewed && hasCombatModifiers
          ? 'Only base defenses are available. Use Customize for form or encounter values.'
          : undefined);
        return {
          level,
          tier: ranks[rank],
          def,
          res,
          elementalRes: attr('epDamageResistance'),
          injuryRes: attr('epResistance'),
          ...(hp > 0 && { hp }),
          ...(fight && { fight }),
          ...(reviewed && { forms: reviewed.forms }),
          ...(defenseNote && { defenseNote }),
        };
      })
      .sort((a, b) => a.level - b.level);
    const name = enemy?.name || handbook[id]?.name || defined(base.name)?.trim() || id;
    return { id, name, code: enemy?.index ?? handbook[id]?.enemyIndex ?? null, levels };
  }).sort((a, b) => a.name.localeCompare(b.name, 'en') || a.id.localeCompare(b.id));
}
