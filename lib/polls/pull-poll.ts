import type { HeadhuntingBanner } from '@/lib/gacha/headhuntingBanners';
import type { BannerGoal } from '@/lib/pulls/plan';
import type { UpcomingBanner } from '@/lib/pulls/pulls';

export const PULL_POLL_ID = 'pull-or-skip-v1';
export const BANNER_INTENT = '$banner';
export interface PollPortrait {icon:string|null;rarity:number;charIds?:string[];art?:string|null}
export const PULL_POLL_DRAFT = 'arkpedia.pull-poll.v1';
export type Want = -1 | 0 | 1 | 2 | 3 | 4 | 5 | 6;
export type Ballot = Record<string, Record<string, Want>>;
export interface PollBanner {
  id: string; name: string; aliases: string[]; start: string; end: string;
  endAt: string | null; estimated: boolean; image: string | null; operators: string[]; category?:string; limited?:boolean;
  /** Returning limited operators in the off-banner pool; selectable individually. */
  returningOperators?: string[];
  newOperators?: string[]; sixStars?: string[]; rerun?:boolean;
}
export function pollBanners(banners: UpcomingBanner[], lineups: readonly HeadhuntingBanner[] = []): PollBanner[] {
  const day=(range:string|null|undefined)=>range?.match(/\d{4}[/−-]\d{2}[/−-]\d{2}/)?.[0].replaceAll('/','-')??'';
  const earliest=new Map<string,string>();
  for(const row of lineups){const date=day(row.cn_date||row.global_date);if(!date)continue;for(const name of [...row.six_stars,...row.five_stars,...(row.four_stars??[])])if(!earliest.has(name)||date<earliest.get(name)!)earliest.set(name,date);}
  return banners.flatMap(b => {
    const lineup = lineups.find(row => row.name === b.name || row.aliases?.includes(b.name) || b.aliases?.includes(row.name)
      || (!!b.poolId && (row.cnPoolId === b.poolId || row.globalPoolId === b.poolId)));
    if(/kernel|joint|orienteering|locating|standard[_ ]pool/i.test(`${b.category} ${lineup?.pull_type??''} ${b.name}`))return [];
    const featured=[...b.sixStars,...(!lineup?.globalLineupPending?[...(lineup?.five_stars??[]),...(lineup?.four_stars??[])]:[])];
    const limited=lineup?.pull_type==='limited'||/limited|crossover/i.test(b.category);
    const rerun=b.rerun||/rerun/i.test(b.name)||/rerun/i.test(b.event??'');
    const date=day(lineup?.cn_date||lineup?.global_date);
    const newOperators=rerun?[]:featured.filter(name=>!date||!earliest.has(name)||earliest.get(name)===date);
    if(!limited&&!rerun&&!newOperators.length)return [];
    return [{id:b.poolId??`${b.name}:${b.start}`,name:b.name,aliases:b.aliases??[],start:b.start,end:b.end,endAt:b.endAt??null,estimated:!!b.datesEstimated,
      image:b.image,category:b.category,limited,rerun,sixStars:b.globalLineupPending?[]:b.sixStars,newOperators:b.globalLineupPending?[]:newOperators,
      operators:b.globalLineupPending?[]:[...new Set([...featured,...b.alsoRatedUp])],
      returningOperators:b.globalLineupPending||!limited?[]:b.alsoRatedUp.filter(name=>!featured.includes(name))}];
  });
}
/** -1 is good to have; zero is an explicit skip. Missing means unanswered. */
export function parseBallot(value: unknown, banners: readonly PollBanner[]): Ballot {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Invalid poll choices.');
  const catalogue = new Map(banners.map(b => [b.id, b]));
  const result: Ballot = {};
  if (Object.keys(value).length > 200) throw Error('Too many banners.');
  for (const [id, raw] of Object.entries(value)) {
    const banner = catalogue.get(id);
    if (!banner || !raw || typeof raw !== 'object' || Array.isArray(raw)) throw Error('This poll’s banners changed. Reload before submitting.');
    const choices: Record<string, Want> = {};
    for (const [name, want] of Object.entries(raw)) {
      if (!(banner.operators.includes(name) || (!banner.operators.length && name===BANNER_INTENT)) || (name===BANNER_INTENT&&Number(want)>1) || !Number.isInteger(want) || Number(want) < -1 || Number(want) > 6) throw Error('Choose a valid operator potential.');
      Object.defineProperty(choices, name, { value: want, enumerable: true, writable: true, configurable: true });
    }
    if (Object.keys(choices).length) Object.defineProperty(result, id, { value: choices, enumerable: true, writable: true, configurable: true });
  }
  return result;
}
export function bannerChoice(choices: Record<string, Want> | undefined, banner: PollBanner,owned:OwnedPotentials={}): string {
  if (!choices) return '';
  const values = banner.operators.length ? banner.operators.map(name=>choices[name]) : [choices[BANNER_INTENT]];
  if (values.every(w=>w===undefined)) return '';
  return values.every(w=>w===0) ? 'skip' : values.every(w=>w===-1) ? 'maybe'
    : (banner.sixStars?.length?banner.operators.some(name=>(choices[name]??0)>(owned[name]??0))&&[...banner.sixStars,...(banner.returningOperators??[])].every(name=>(choices[name]??0)-(owned[name]??0)<=1)
      : values.every((w,index)=>w===pullWant(banner,banner.operators[index]??BANNER_INTENT))) ? 'pull' : 'custom';
}
export const pullWant = (banner:PollBanner,name:string):Want => banner.returningOperators?.includes(name)?0:banner.newOperators&&!banner.rerun&&!banner.newOperators.includes(name)?-1:1;
export type OwnedPotentials=Record<string,number>;
export function constrainOwned(ballot:Ballot,owned:OwnedPotentials):Ballot {
  return Object.fromEntries(Object.entries(ballot).map(([id,choices])=>[id,Object.fromEntries(Object.entries(choices).map(([name,want])=>[name,want>0&&want<=(owned[name]??0)?(owned[name]>=6?0:owned[name]+1):want]))])) as Ballot;
}
export function activePollBanners(banners:readonly PollBanner[],now=Date.now()):PollBanner[]{return banners.filter(b=>Date.parse(b.endAt??`${b.end}T23:59:59-07:00`)>now);}
/** Keep historical drafts usable when a banner leaves the current catalogue. */
export function currentBallot(value:unknown,banners:readonly PollBanner[]):Ballot {
  if(!value||typeof value!=='object'||Array.isArray(value))return parseBallot(value,banners);
  return parseBallot(Object.fromEntries(Object.entries(value).filter(([id])=>banners.some(b=>b.id===id))),banners);
}
export function setBannerChoice(ballot: Ballot, banner: PollBanner, choice: string,owned:OwnedPotentials={}): Ballot {
  const want: Want = choice === 'pull' ? 1 : choice === 'maybe' ? -1 : 0;
  return constrainOwned({ ...ballot, [banner.id]: Object.fromEntries((banner.operators.length?banner.operators:[BANNER_INTENT]).map(name => [name, choice==='pull'?pullWant(banner,name):want])) },owned);
}
export type Stamp = 'pull'|'maybe'|'skip'|'custom'|'dolphin'|'whale'|'levi';
export const STAMP_LABELS:Record<Stamp,string>={pull:'Pulling!',maybe:'Tempted…',skip:'Skipped',custom:'Picky',dolphin:'Dolphin',whale:'Whale!',levi:'Leviathan!!'};
export function stampKey(choices:Record<string,Want>|undefined,banner:PollBanner,portraits:Record<string,PollPortrait>,owned:OwnedPotentials={}):Stamp|''{
  const verdict=bannerChoice(choices,banner,owned);if(!verdict||verdict==='maybe'||verdict==='skip')return verdict as Stamp|'';
  let tier=0;for(const [name,want] of Object.entries(choices??{})){
    if(want<=0)continue;
    const copies=want-(owned[name]??0);
    let level=copies>=6?3:copies>=4?2:copies>=2?1:0;
    if((portraits[name]?.rarity??6)<6)level=want===6?1:0;
    tier=Math.max(tier,level);
  }
  return tier===3?'levi':tier===2?'whale':tier===1?'dolphin':verdict as Stamp;
}
export function walletMood(ballot:Ballot):string{
  const copies=Object.values(ballot).flatMap(Object.values).reduce((sum,w)=>sum+Math.max(0,w),0);
  return copies===0?'Wallet status: untouched':copies<=3?'Wallet status: fine, probably':copies<=7?'Wallet status: nervous':copies<=12?'Wallet status: in danger':copies<=20?'Orundum? Never heard of it':copies<=30?'Wallet status: beached whale':'Selling the landship for pulls';
}
export interface PollBannerResult {id:string;answers:number;pull:number;maybe:number;skip:number}
export interface PollOperatorResult {banner:string;name:string;answers:number;want:number;maybe:number;no:number;totalPotential:number;maxPotential:number;potentials?:number[]}
export interface PullPollResults {ballots:number;banners:PollBannerResult[];operators:PollOperatorResult[]}
export function importGoals(goals: readonly BannerGoal[], banners: readonly PollBanner[],owned:OwnedPotentials={}): Ballot {
  const result: Ballot = {};
  for (const banner of banners) {
    const goal = goals.find(g => g.banner === banner.name || banner.aliases.includes(g.banner));
    if (!goal) continue;
    result[banner.id] = Object.fromEntries(banner.operators.map(name => [name,
      goal.targets?.length ? (goal.targets.find(t => t.name === name)?Math.min(6,(goal.targets.find(t => t.name === name)?.copies??0)+(owned[name]??0)):0) : pullWant(banner,name)])) as Record<string, Want>;
  }
  return constrainOwned(result,owned);
}
/** URL fragments stay in the browser; sharing never publishes a ballot. */
export function encodeBallot(ballot: Ballot): string {
  const bytes = new TextEncoder().encode(JSON.stringify(ballot));
  return btoa(Array.from(bytes, b => String.fromCharCode(b)).join('')).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function decodeBallot(encoded: string, banners: readonly PollBanner[]): Ballot {
  if (encoded.length > 50000 || !/^[A-Za-z0-9_-]+$/.test(encoded)) throw Error('Invalid shared poll.');
  const bytes = Uint8Array.from(atob(encoded.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
  return currentBallot(JSON.parse(new TextDecoder().decode(bytes)), banners);
}
