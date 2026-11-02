import type { AccountRecord } from '@/lib/account/accountStore';
import { isServerId, type ServerId } from '@/lib/account-import/yostar';
import { assertNoCredentials } from '@/lib/cloud-account/data';

export const COMMUNITY_MIN_SAMPLE = 10;
export const SUPPORT_MAX_AGE = 7 * 86400_000;
export const AVAILABILITY_MAX_AGE = 86400_000;
export const FULL_REPORT_THRESHOLD = 3;
export interface CommunityChoices { stats: boolean; shareTag: boolean; openRequests: boolean }
export const COMMUNITY_OFF: CommunityChoices = { stats: false, shareTag: false, openRequests: false };
export interface CommunityState extends CommunityChoices {
  revision: number; server?: ServerId; importedAt?: string; friendTag?: string | null; listed?: boolean; reportedFull?: boolean;
}
export interface SharedOperator { operator: string; elite: number | null; level?: number | null; m0: number | null; m1: number | null; m2: number | null; modules: Record<string, number> | null }
export interface SharedSupport { skillLevel?:number|null; skillMasteries?:(number|null)[]; operator: string; elite: number; level: number; skill: number | null; mastery: number | null; module: string | null; moduleLevel: number | null; potential?:number|null; skin?:string|null; skillId?:string|null; allMastered?:boolean|null }
/** Only the imported card appearance, never biography, wallet, UID or collections. */
export interface SharedAppearance {
  avatar: string | null; avatarType: string | null; secretary: string | null; secretarySkin: string | null;
  nameCard: string | null; nameCardVariant: number; level: number | null;
  operators: number; skins: number;
}
export interface CommunitySnapshot {
  server: ServerId; uid: string; doctor: string | null; importedAt: string; slots: number | null;
  appearance?: SharedAppearance | null;
  equipmentKnown: boolean; operators: SharedOperator[]; skins: { skin: string; equipped: boolean }[]; supports: SharedSupport[];
}
export interface SupportPlayer { appearance?: SharedAppearance | null; id: string; friendTag: string; server: ServerId; slots: number; importedAt: string; fullReports: number; openReports: number; supports: SharedSupport[] }
export interface CommunityStats {
  contributors: number; owned: number | null; builds?: number; e1?: number; e2?: number;
  masteryOwners?: number; skills?: number[]; moduleGroups?: { level: number; owners: number; modules: number[][] }[]; equipmentOwners?: number; equipped?: number;
}
const id = (v: unknown) => typeof v === 'string' && /^[\w@#+-]{1,100}$/.test(v);
const name = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= 200 && !/[\x00-\x1f]/.test(v) && !['__proto__','constructor','prototype'].includes(v);
const integer = (v: unknown, low: number, high: number): v is number => typeof v === 'number' && Number.isInteger(v) && v >= low && v <= high;
const nullable = (v: unknown, low: number, high: number) => v === null || integer(v, low, high);
export function parseCommunityChoices(value: unknown): CommunityChoices {
  const v=value as CommunityChoices;
  if(!v || ['stats','shareTag','openRequests'].some(key=>typeof (v as unknown as Record<string,unknown>)[key]!=='boolean')) throw Error('Choose each community sharing option.');
  return {stats:v.stats,shareTag:v.shareTag,openRequests:v.shareTag && v.openRequests};
}
/** Deliberately projects only requested community fields, never a private save or wallet. */
export function communitySnapshot(account: AccountRecord, choices: CommunityChoices): CommunitySnapshot {
  const profile=account.profile, builds=account.operatorBuilds;
  return {
    server:account.server, uid:profile?.uid ?? '', doctor:choices.shareTag && choices.openRequests ? account.doctor : null,
    importedAt:account.importedAt, slots:choices.shareTag && choices.openRequests && profile?.friendSlots ? Math.max(0,profile.friendSlots.limit-profile.friendSlots.used) : null,
    appearance:choices.shareTag && choices.openRequests ? {
      avatar:profile?.avatar??null,avatarType:profile?.avatarType??null,secretary:profile?.secretary??null,secretarySkin:profile?.secretarySkin??null,
      nameCard:profile?.nameCard??null,nameCardVariant:profile?.nameCardVariant??0,level:profile?.level??null,
      operators:new Set(account.operators).size,skins:new Set(account.skins).size,
    } : null,
    equipmentKnown:choices.stats && account.outfits!==undefined,
    operators:choices.stats ? [...new Set(account.operators)].map(operator=>{
      const build=builds?.[operator];
      // The canonical imported roster already includes the level currently in training.
      const mastery=(index:number)=>build?build.masteries[index]??0:null;
      return {operator,elite:build?.elite??null,level:build?.level??null,m0:mastery(0),m1:mastery(1),m2:mastery(2),
        modules:build ? Object.fromEntries(Object.entries(build.modules??{}).map(([index,stage])=>[index,stage+1])) : null};
    }) : [],
    skins:choices.stats ? [...new Set(account.skins)].map(skin=>({skin,equipped:Object.values(account.outfits??{}).includes(skin)})) : [],
    supports:choices.shareTag && choices.openRequests ? (profile?.supports??[]).map(unit=>({operator:unit.name,elite:unit.elite,level:unit.level,skill:unit.skill,
      skillLevel:unit.skillLevel??null,skillMasteries:unit.skillMasteries??[],mastery:unit.skillMastery??null,module:unit.module??null,moduleLevel:unit.moduleLevel??null,potential:unit.potential??null,skin:unit.skin??null,skillId:unit.skillId??null,allMastered:unit.allMastered??null})) : [],
  };
}
/** Validate browser imports without claiming that an editable client proves game ownership. */
export function parseCommunitySnapshot(raw: unknown, choices: CommunityChoices, now=Date.now()): CommunitySnapshot {
  assertNoCredentials(raw);
  if(!raw || typeof raw!=='object' || Array.isArray(raw) || new TextEncoder().encode(JSON.stringify(raw)).length>250_000) throw Error('Community snapshot is invalid or too large.');
  const v=raw as CommunitySnapshot;
  if(Object.keys(v).some(key=>!['server','uid','doctor','importedAt','slots','appearance','equipmentKnown','operators','skins','supports'].includes(key))) throw Error('Unexpected community data.');
  const at=Date.parse(v.importedAt);
  if(!isServerId(v.server) || !/^\d{1,32}$/.test(v.uid) || !Number.isFinite(at) || at>now+300_000 || at<0) throw Error('Import your game account again before sharing.');
  if(v.doctor!==null && (typeof v.doctor!=='string' || v.doctor.length>64 || !/^[\p{L}\p{N}][\p{L}\p{N}\p{M} ._-]*#[0-9]{1,8}$/u.test(v.doctor))) throw Error('Import a valid friend tag.');
  if(!nullable(v.slots,0,1000) || typeof v.equipmentKnown!=='boolean' || !Array.isArray(v.operators) || v.operators.length>1000 || !Array.isArray(v.skins) || v.skins.length>3000 || !Array.isArray(v.supports) || v.supports.length>3) throw Error('Invalid community snapshot.');
  let appearance: SharedAppearance | null = null;
  if(v.appearance!=null){
    const a=v.appearance;
    if(typeof a!=='object'||Array.isArray(a)||Object.keys(a).some(key=>!['avatar','avatarType','secretary','secretarySkin','nameCard','nameCardVariant','level','operators','skins'].includes(key))||
      [a.avatar,a.secretarySkin,a.nameCard].some(value=>value!==null&&!id(value))||
      (a.avatarType!==null&&!['ICON','ASSISTANT','DEFAULT','NONE'].includes(a.avatarType))||
      (a.secretary!==null&&!name(a.secretary))||!integer(a.nameCardVariant,0,19)||!nullable(a.level,1,120)||!integer(a.operators,0,1000)||!integer(a.skins,0,3000))throw Error('Invalid public card appearance.');
    appearance={avatar:a.avatar,avatarType:a.avatarType,secretary:a.secretary,secretarySkin:a.secretarySkin,nameCard:a.nameCard,nameCardVariant:a.nameCardVariant,level:a.level,operators:a.operators,skins:a.skins};
  }
  const operators=v.operators.map(op=>{
    if(!name(op?.operator) || !nullable(op.level??null,1,90) || !nullable(op.elite,0,2) || [op.m0,op.m1,op.m2].some(m=>!nullable(m,0,3))) throw Error('Invalid operator build.');
    if(op.elite===null ? [op.m0,op.m1,op.m2,op.modules].some(v=>v!==null) : [op.m0,op.m1,op.m2].some(v=>v===null)) throw Error('Incomplete operator build.');
    if(op.elite!==null && (!op.modules || typeof op.modules!=='object' || Array.isArray(op.modules))) throw Error('Invalid module stages.');
    const modules=op.modules===null ? null : Object.fromEntries(Object.entries(op.modules??{}).map(([index,stage])=>{
      if(!/^[0-7]$/.test(index) || !integer(stage,1,3)) throw Error('Invalid module stage.');
      return [index,stage];
    }));
    if(op.elite!==null && op.elite<2 && ([op.m0,op.m1,op.m2].some(m=>(m??0)>0) || Object.keys(modules??{}).length)) throw Error('Masteries and modules require E2.');
    return {operator:op.operator,elite:op.elite,level:op.elite===null?null:op.level??null,m0:op.m0,m1:op.m1,m2:op.m2,modules};
  });
  const skins=v.skins.map(s=>{
    if(!id(s?.skin) || typeof s.equipped!=='boolean') throw Error('Invalid outfit.');
    return {skin:s.skin,equipped:s.equipped};
  });
  const supports=v.supports.map(s=>{
    if(!name(s?.operator) || !integer(s.elite,0,2) || !integer(s.level,1,90) || !nullable(s.skill,1,3) || !nullable(s.mastery,0,3) || (s.module!==null && !id(s.module)) || !nullable(s.moduleLevel,1,3)) throw Error('Invalid support unit.');
    if(s.elite<2 && ((s.mastery??0)>0 || s.moduleLevel!==null)) throw Error('Invalid support upgrades.');
    if((s.skill===null && s.mastery!==null) || (s.module===null && s.moduleLevel!==null)) throw Error('Incomplete support upgrades.');
    if(!nullable(s.potential??null,1,6)||(s.skin!=null&&!id(s.skin))||(s.skillId!=null&&!id(s.skillId))||(s.allMastered!=null&&typeof s.allMastered!=='boolean'))throw Error('Invalid support appearance.');
    if(!nullable(s.skillLevel??null,1,7)||(s.skillMasteries!==undefined&&(!Array.isArray(s.skillMasteries)||s.skillMasteries.length>3||s.skillMasteries.some(m=>!nullable(m,0,3)))))throw Error('Invalid support skill ranks.');
    if(s.elite<2&&s.skillMasteries?.some(m=>(m??0)>0))throw Error('Invalid support skill masteries.');
    if(s.skill&&s.mastery!==null&&s.skillMasteries?.[s.skill-1]!=null&&s.skillMasteries[s.skill-1]!==s.mastery)throw Error('Invalid selected support mastery.');
    return {skillLevel:s.skillLevel??null,skillMasteries:s.skillMasteries??[],operator:s.operator,elite:s.elite,level:s.level,skill:s.skill,mastery:s.mastery,module:s.module,moduleLevel:s.moduleLevel,potential:s.potential??null,skin:s.skin??null,skillId:s.skillId??null,allMastered:s.allMastered??null};
  });
  if(new Set(operators.map(o=>o.operator)).size!==operators.length || new Set(skins.map(s=>s.skin)).size!==skins.length || new Set(supports.map(s=>s.operator)).size!==supports.length) throw Error('Duplicate community records.');
  // Ignore unconsented fields even if another client sends them.
  return {server:v.server,uid:v.uid,importedAt:new Date(at).toISOString(),doctor:choices.shareTag&&choices.openRequests ? v.doctor : null,slots:choices.shareTag&&choices.openRequests?v.slots:null,
    appearance:choices.shareTag&&choices.openRequests?appearance:null,
    equipmentKnown:choices.stats&&v.equipmentKnown,operators:choices.stats?operators:[],skins:choices.stats?skins:[],supports:choices.shareTag&&choices.openRequests?supports:[]};
}
