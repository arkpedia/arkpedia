import type { SupportUnit } from '@/lib/account/accountStore';
import type { FriendOperator } from '@/lib/account/friendCatalogue';
import { normalizeForSearch } from '@/lib/search/searchNormalize';
import type { SupportPlayer } from './model';

/** Recorded support builds only; never look at the viewer's planner. */
export function playerSupportUnits(player: SupportPlayer, operators: readonly FriendOperator[]): SupportUnit[] {
  const catalogue = new Map(operators.map(op => [normalizeForSearch(op.name), op.rarity]));
  return player.supports.map(unit => ({name:unit.operator,rarity:catalogue.get(normalizeForSearch(unit.operator))??null,
    elite:unit.elite,level:unit.level,potential:unit.potential??0,skill:unit.skill,skillMastery:unit.mastery,
    skillLevel:unit.skillLevel,skillMasteries:unit.skillMasteries,module:unit.module,moduleLevel:unit.moduleLevel,
    skillId:unit.skillId,skin:unit.skin,allMastered:unit.allMastered===true}));
}
