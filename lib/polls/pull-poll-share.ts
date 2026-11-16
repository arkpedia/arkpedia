import type {OwnedPotentials,PollBanner,Want} from './pull-poll';
/** Compact names keep collaboration titles and alter epithets out of copy labels. */
export function shareOperatorName(name:string):string{
  return name.replace(/^(Violet Mizutsune|Kirin R|Zinogre S|Rathalos S)\s+/,'').split(' the ')[0];
}
export function shareOperatorCopies(banner:PollBanner,choices:Record<string,Want>|undefined,owned:OwnedPotentials={}){
  return banner.operators.flatMap(name=>{const copies=Math.max(0,(choices?.[name]??0)-(owned[name]??0));return copies>0?[{name,copies,label:`${copies}× ${shareOperatorName(name)}`}]:[];});
}

interface ShareInterest {name:string;copies:number;label:string;interest:'pull'|'maybe'}
/** Include tentative operators alongside the additional copies planned for a banner. */
export function shareOperatorInterests(banner:PollBanner,choices:Record<string,Want>|undefined,owned:OwnedPotentials={}){
  const copies=shareOperatorCopies(banner,choices,owned);
  return banner.operators.flatMap<ShareInterest>(name=>{
    if(choices?.[name]===-1)return [{name,copies:0,label:shareOperatorName(name),interest:'maybe' as const}];
    const wanted=copies.find(op=>op.name===name);return wanted?[{...wanted,interest:'pull' as const}]:[];
  });
}
