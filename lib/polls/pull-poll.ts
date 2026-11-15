import type { HeadhuntingBanner } from '@/lib/gacha/headhuntingBanners';
import type { BannerGoal } from '@/lib/pulls/plan';
import type { UpcomingBanner } from '@/lib/pulls/pulls';

export const PULL_POLL_ID = 'pull-or-skip-v1';
export const BANNER_INTENT = '$banner';
export interface PollPortrait {icon:string|null;rarity:number}
export const PULL_POLL_DRAFT = 'arkpedia.pull-poll.v1';
export type Want = -1 | 0 | 1 | 2 | 3 | 4 | 5 | 6;
export type Ballot = Record<string, Record<string, Want>>;
export interface PollBanner {
  id: string; name: string; aliases: string[]; start: string; end: string;
  endAt: string | null; estimated: boolean; image: string | null; operators: string[]; category?:string; limited?:boolean;
}
export function pollBanners(banners: UpcomingBanner[], lineups: readonly HeadhuntingBanner[] = []): PollBanner[] {
  return banners.filter(b => b.sixStars.length || b.globalLineupPending).map(b => {
    const lineup = lineups.find(row => row.name === b.name || row.aliases?.includes(b.name) || b.aliases?.includes(row.name)
      || (!!b.poolId && (row.cnPoolId === b.poolId || row.globalPoolId === b.poolId)));
    return ({
    id: b.poolId ?? `${b.name}:${b.start}`, name: b.name, aliases: b.aliases ?? [],
    start: b.start, end: b.end, endAt: b.endAt ?? null, estimated: !!b.datesEstimated,
    image: b.image, category:b.category, limited:['limited','crossover'].some(kind=>b.category.toLowerCase().includes(kind)), operators: b.globalLineupPending ? [] : [...new Set([...b.sixStars, ...b.alsoRatedUp, ...(!lineup?.globalLineupPending ? [...(lineup?.five_stars ?? []), ...(lineup?.four_stars ?? [])] : [])])],
  }); });
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
export function bannerChoice(choices: Record<string, Want> | undefined, banner: PollBanner): string {
  if (!choices) return '';
  const values = banner.operators.length ? banner.operators.map(name=>choices[name]) : [choices[BANNER_INTENT]];
  if (values.every(w=>w===undefined)) return '';
  return values.every(w=>w===0) ? 'skip' : values.every(w=>w===-1) ? 'maybe' : values.every(w=>w===1) ? 'pull' : 'custom';
}
export function setBannerChoice(ballot: Ballot, banner: PollBanner, choice: string): Ballot {
  const want: Want = choice === 'pull' ? 1 : choice === 'maybe' ? -1 : 0;
  return { ...ballot, [banner.id]: Object.fromEntries((banner.operators.length?banner.operators:[BANNER_INTENT]).map(name => [name, want])) };
}
export type Stamp = 'pull'|'maybe'|'skip'|'custom'|'dolphin'|'whale'|'levi';
export const STAMP_LABELS:Record<Stamp,string>={pull:'Pulling!',maybe:'Tempted…',skip:'Skipped',custom:'Picky',dolphin:'Dolphin',whale:'Whale!',levi:'Leviathan!!'};
export function stampKey(choices:Record<string,Want>|undefined,banner:PollBanner,portraits:Record<string,PollPortrait>):Stamp|''{
  const verdict=bannerChoice(choices,banner);if(!verdict||verdict==='maybe'||verdict==='skip')return verdict as Stamp|'';
  let tier=0;for(const [name,want] of Object.entries(choices??{})){
    if(want<=0)continue;
    let level=want>=6?3:want>=4?2:want>=2?1:0;
    if((portraits[name]?.rarity??6)<6)level=Math.max(0,level-1);
    tier=Math.max(tier,level);
  }
  return tier===3?'levi':tier===2?'whale':tier===1?'dolphin':verdict as Stamp;
}
export function walletMood(ballot:Ballot):string{
  const copies=Object.values(ballot).flatMap(Object.values).reduce((sum,w)=>sum+Math.max(0,w),0);
  return copies===0?'Wallet status: untouched':copies<=3?'Wallet status: fine, probably':copies<=7?'Wallet status: nervous':copies<=12?'Wallet status: in danger':copies<=20?'Orundum? Never heard of it':copies<=30?'Wallet status: beached whale':'Selling the landship for pulls';
}
export interface PollBannerResult {id:string;answers:number;pull:number;maybe:number;skip:number}
export interface PollOperatorResult {banner:string;name:string;answers:number;want:number;maybe:number;no:number;totalPotential:number;maxPotential:number}
export interface PullPollResults {ballots:number;banners:PollBannerResult[];operators:PollOperatorResult[]}
export function importGoals(goals: readonly BannerGoal[], banners: readonly PollBanner[]): Ballot {
  const result: Ballot = {};
  for (const banner of banners) {
    const goal = goals.find(g => g.banner === banner.name || banner.aliases.includes(g.banner));
    if (!goal) continue;
    result[banner.id] = Object.fromEntries(banner.operators.map(name => [name,
      goal.targets?.length ? goal.targets.find(t => t.name === name)?.copies ?? 0 : 1])) as Record<string, Want>;
  }
  return result;
}
/** URL fragments stay in the browser; sharing never publishes a ballot. */
export function encodeBallot(ballot: Ballot): string {
  const bytes = new TextEncoder().encode(JSON.stringify(ballot));
  return btoa(Array.from(bytes, b => String.fromCharCode(b)).join('')).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function decodeBallot(encoded: string, banners: readonly PollBanner[]): Ballot {
  if (encoded.length > 50000 || !/^[A-Za-z0-9_-]+$/.test(encoded)) throw Error('Invalid shared poll.');
  const bytes = Uint8Array.from(atob(encoded.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
  return parseBallot(JSON.parse(new TextDecoder().decode(bytes)), banners);
}
