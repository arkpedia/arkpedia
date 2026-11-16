import type {OwnedPotentials,PollBanner,Want} from './pull-poll';
/** Compact names keep collaboration titles and alter epithets out of copy labels. */
export function shareOperatorName(name:string):string{
  return name.replace(/^(Violet Mizutsune|Kirin R|Zinogre S)\s+/,'').split(' the ')[0];
}
export function shareOperatorCopies(banner:PollBanner,choices:Record<string,Want>|undefined,owned:OwnedPotentials={}){
  return banner.operators.flatMap(name=>{const copies=Math.max(0,(choices?.[name]??0)-(owned[name]??0));return copies>0?[{name,copies,label:`${copies}× ${shareOperatorName(name)}`}]:[];});
}
