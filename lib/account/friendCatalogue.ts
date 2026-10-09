import type { GameAccountMap } from '@/lib/planner/gameAccount';
import { getSkillList, type Operator } from '@/lib/operators/operatorTypes';
import { getOperatorIconPath } from '@/lib/operators/operatorIcon';
import { moduleMarkPath } from './portraits';

export interface FriendOperator {
  name: string; rarity: number; icon: string; className: string | null; skills: number;
  modules: { index: number; label: string; mark: string | null }[];
}
export interface FriendSkin { id: string; name: string; model: string | null; series: string; image: string | null }

/** Compact page data. The bundled id map also covers builds before this route is published. */
export function friendOperators(map: GameAccountMap, records: readonly Operator[]): FriendOperator[] {
  const definitions = new Map(records.map(op => [op.name, op]));
  const chars = new Map(Object.values(map.chars).map(char => [char.name, char]));
  return [...new Set([...chars.keys(), ...definitions.keys()])].map(name => {
    const op = definitions.get(name), char = chars.get(name), rarity = op?.rarity ?? char?.rarity ?? 0;
    return { name, rarity, icon: getOperatorIconPath({ name, rarity, portraitPending: op?.portraitPending }), className: op?.class ?? null,
      skills: op ? getSkillList(op).length : (rarity === 6 || name === 'Amiya' ? 3 : rarity >= 4 ? 2 : rarity === 3 ? 1 : 0),
      modules: Object.entries(char?.modules ?? {}).map(([id, index]) => ({ index,
        label: map.moduleTypes?.[id]?.toUpperCase() ?? `Mod ${index + 1}`, mark: moduleMarkPath(id, map.moduleTypes) })).sort((a, b) => a.index - b.index),
    };
  });
}
