import type { SupportUnit } from './accountStore';
import type { GameAccountMap } from '@/lib/planner/gameAccount';
import type { Owned } from '@/lib/planner/roster';

/** Never replace missing imported ranks with assumed M3/rank 7. */
export function supportPreviewBuild(unit:SupportUnit,skillCount:number,map:GameAccountMap):Owned|undefined{
  if(!unit.skillLevel||!skillCount||!unit.skillMasteries||unit.skillMasteries.length<skillCount||unit.skillMasteries.slice(0,skillCount).some(m=>m===null))return undefined;
  const modules:Record<number,number>={};
  if(unit.module){
    const char=Object.values(map.chars).find(char=>char.name===unit.name),index=char?.modules[unit.module];
    if(index===undefined||!unit.moduleLevel)return undefined;
    modules[index]=unit.moduleLevel-1;
  }
  return {elite:unit.elite,level:unit.level,skillLevel:unit.skillLevel,masteries:Object.fromEntries(unit.skillMasteries.map((m,i)=>[i,(m??0) as 0|1|2|3])),modules,...(unit.potential?{potential:unit.potential}:{})};
}
