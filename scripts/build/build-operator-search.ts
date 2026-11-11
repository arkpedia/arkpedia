import fs from 'node:fs';
import path from 'node:path';
import { getAllOperators } from '../../lib/operators/operators';
import { getSkillList } from '../../lib/operators/operatorTypes';
import { getSkillIconPath } from '../../lib/operators/operatorIconPaths';
import { getOperatorIconPath } from '../../lib/operators/operatorIcon';
import map from '../../data/game-account-map.json';
import { portraitStatus } from '../../lib/operators/operatorPortrait';
import { FINAL_STATS_ROWS } from '../../lib/results/finalPollResults';
import { getAllSkins,skinImagePath } from '../../lib/skins/skins';
import { friendOperators } from '../../lib/account/friendCatalogue';
import type { GameAccountMap } from '../../lib/planner/gameAccount';

const operators = getAllOperators();
const output = {
  operators: operators.map((operator) => ({
    name: operator.name,
    rarity: operator.rarity,
    // No release state: the header search draws a record from its name, rarity and
    // portraitStatus. An isFuture judged when this file was built used to sit here, frozen
    // until the next build, and nothing read it.
    ...portraitStatus(operator),
    ...(operator.sourceRegion ? { sourceRegion: operator.sourceRegion } : {}),
  })),
};

const destination = path.join(process.cwd(), 'public/operator-search.json');
fs.writeFileSync(destination, `${JSON.stringify(output)}\n`);
console.log(`Wrote ${output.operators.length} operator search records to ${destination}`);

// Compact server-bundled fallback for a statistics page missing from an older release.
// `art` is the illustration the statistics page draws behind a ranking (the Elite 2 art,
// else the base art), resolved here against the published asset index so a missing file
// warns at build time rather than 404ing on the page; null when the operator has neither.
const artFor = (op: { name: string; rarity: number | null }) => {
  const art = skinImagePath(op.name, 'Elite 2', op.rarity) ?? skinImagePath(op.name, 'Base', op.rarity);
  if (!art) console.warn(`[community catalogue] no illustration found for "${op.name}" (Elite 2 or Base) in any rarity's skins folder`);
  return art;
};
fs.writeFileSync(path.join(process.cwd(), 'data/community-operator-catalogue.json'), JSON.stringify(operators.map(op=>({
  name:op.name,charIds:Object.entries(map.chars).filter(([,v])=>v.name===op.name).map(([id])=>id),
  rarity:op.rarity??0,className:op.class??'',icon:getOperatorIconPath(op),skills:getSkillList(op).length,skillIcons:getSkillList(op).map(skill=>getSkillIconPath(op.name,skill.name)),art:artFor(op),
})))+'\n');

// Polls can be Preview-only and absent from the published content release. Bundle
// their public catalogue so runtime fallback never scans unavailable source files.
const skins=getAllSkins().filter(skin=>skin.skinId&&skin.model).map(skin=>({id:skin.skinId!,name:skin.name,operator:skin.model!,image:skin.image,aliases:skin.searchAliases??[]})).sort((a,b)=>a.operator.localeCompare(b.operator)||a.name.localeCompare(b.name));
const byId=new Map(skins.map(skin=>[skin.id,skin]));
const featured=['char_1028_texas2@epoque#36','char_350_surtr@ambienceSynesthesia#6','char_103_angel@sale#8'];
const showcase=featured.flatMap(id=>{const skin=byId.get(id);return skin?.image?[{image:skin.image,name:skin.name,operator:skin.operator}]:[];});
const rarity=new Map(operators.map(op=>[op.name,op.rarity]));
const powerLeaders=[...FINAL_STATS_ROWS].sort((a,b)=>b.mean-a.mean).slice(0,3);
const previousLeaders=powerLeaders.map(row=>{
  const image=skinImagePath(row.operator_name,'Elite 2',rarity.get(row.operator_name)??null)??skinImagePath(row.operator_name,'Base',rarity.get(row.operator_name)??null);
  const rank=powerLeaders.findIndex(other=>other.mean===row.mean)+1;
  return {id:row.operator_name,name:row.operator_name,image,rank,mean:row.mean};
});
const previousArt=previousLeaders.flatMap(row=>row.image?[row.image]:[]);
fs.writeFileSync(path.join(process.cwd(),'data/community-poll-catalogue.json'),JSON.stringify({skins,showcase,previousArt,previousLeaders})+'\n');

// Account tabs need the same complete collection catalogue when an older release
// lacks /account. Keep runtime fallback independent of raw operator/voice files.
fs.writeFileSync(path.join(process.cwd(),'data/account-catalogue.json'),JSON.stringify({
  operators:friendOperators(map as GameAccountMap,operators),
  skins:getAllSkins().flatMap(skin=>skin.skinId?[{id:skin.skinId,name:skin.name,model:skin.model,series:skin.series,image:skin.image}]:[]),
})+'\n');
