import snapshot from '@/data/recruitment-global.json';
import { getAllOperators } from '@/lib/operators/operators';
import type { Operator } from '@/lib/operators/operatorTypes';

/** The reviewed Global recruitment roster is authoritative. An operator's debut
 * date or CN acquisition methods cannot add them to this pool. */
export function getGlobalRecruitmentOperators(): Operator[] {
  if (snapshot.schema !== 1 || snapshot.region !== 'Global' || snapshot.operators.length < 100) {
    throw new Error('Invalid Global recruitment snapshot');
  }
  const byId = new Map(getAllOperators().map(operator => [operator.internalName, operator]));
  return snapshot.operators.map(recruit => {
    const operator = byId.get(recruit.id);
    if (!operator) throw new Error(`Missing Global recruit: ${recruit.id}`);
    return { ...operator, rarity: recruit.rarity, class: recruit.class, position: recruit.position,
      tags: recruit.tags, isFuture: false };
  }).sort((a, b) => a.name.localeCompare(b.name));
}
