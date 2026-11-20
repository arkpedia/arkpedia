import fs from 'node:fs';
import path from 'node:path';
import { getAllOperators } from '../../lib/operators/operators';
import { getSkillList } from '../../lib/operators/operatorTypes';
import { baseSkillDisplayName, getBaseSkillIconPath, getSkillIconPath } from '../../lib/operators/operatorIconPaths';
import { getOperatorIconPath } from '../../lib/operators/operatorIcon';
import map from '../../data/game-account-map.json';
import { portraitStatus } from '../../lib/operators/operatorPortrait';
import { FINAL_STATS_ROWS } from '../../lib/results/finalPollResults';
import { getAllSkins,skinImagePath } from '../../lib/skins/skins';
import { friendOperators } from '../../lib/account/friendCatalogue';
import type { GameAccountMap } from '../../lib/planner/gameAccount';
import { buildOperatorNameAliases } from '../lib/operator-name-aliases';
import { OPERATOR_NAME_ALIASES_VERSION } from '../../lib/operators/operatorSearch';
import { rosterMetadata } from '../../lib/operators/rosterSort';
import { publicFileExists, publicFiles } from '../../lib/assets/publicAssets';
import { bundledStoryLibrary } from '../../lib/story/storyMapData';
import { artPath, baseSkillPath, enemyIconPath, enemyItemId, factionItemId, skillPath, storyArtPath, storyItemId, TIER_ART_STAGES, type TierCatalogue, type TierCatalogueOperator } from '../../lib/tier-list/catalogue';

const operators = getAllOperators();
const aliases = buildOperatorNameAliases(operators);
const output = {
  operatorNameAliasesVersion: OPERATOR_NAME_ALIASES_VERSION,
  operators: operators.map((operator) => ({
    name: operator.name,
    rarity: operator.rarity,
    ...(aliases[operator.name].length ? { aliases: aliases[operator.name] } : {}),
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
  rarity:op.rarity??0,className:op.class??'',icon:getOperatorIconPath(op),skills:getSkillList(op).length,skillIcons:getSkillList(op).map(skill=>skill.icon || getSkillIconPath(op.name,skill.name)),art:artFor(op),
  roster:rosterMetadata(op),
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

// The Tier List maker's art (lib/tier-list/catalogue.ts): every operator portrait,
// promotion illustration, outfit illustration, skill icon and base skill icon the asset index holds. Each path is checked here because none of the
// three lookups is guarded at render: a missing file is a blank tile, so it is left out,
// with a warning for the ones a published operator should have. No server filter: art that
// exists is offered, whichever region the record came from.
const published = (file: string | null | undefined): file is string => { try { return !!file && publicFileExists(decodeURIComponent(file)); } catch { return false; } };
// A path the names already give is left out of the file (lib/tier-list/catalogue.ts derives it).
const lean = (image: string, derived: string): [] | [string] => (image === derived ? [] : [image]);
const tierIds = new Set<string>();
const tierId = (id: string) => { if (!id || tierIds.has(id)) throw new Error(`[tier list catalogue] duplicate or empty item id "${id}"`); tierIds.add(id); return id; };
const skinsByModel = new Map<string, ReturnType<typeof getAllSkins>>();
for (const skin of getAllSkins()) if (skin.model && skin.skinId) skinsByModel.set(skin.model, [...(skinsByModel.get(skin.model) ?? []), skin]);
const tierOperators: TierCatalogueOperator[] = operators.flatMap((op) => {
  if (!op.rarity) return [];
  // Item ids travel in shared links, so they are the game's own (char_...), never our English name.
  if (!/^char_\d+_\w+$/.test(op.internalName ?? '')) throw new Error(`[tier list catalogue] "${op.name}" has no game id (internalName) to build its item ids from`);
  const id = tierId(op.internalName!);
  const icon = op.portraitPending ? null : getOperatorIconPath(op);
  if (icon && !published(icon)) throw new Error(`[tier list catalogue] ${op.name}'s portrait ${icon} is not in the asset index, and portraitPending does not say so`);
  const art = TIER_ART_STAGES.filter((stage) => published(artPath(op.name, op.rarity!, stage)));
  // Each outfit by its full illustration, already resolved (quote- and slash-stripped names included).
  const skins = (skinsByModel.get(op.name) ?? []).flatMap((skin): [string, string, string?][] => {
    // A new outfit names its art in full, pinned to the skin-asset commit that added it
    // (the catalogue externalises it that way): that is published art too.
    const pinned = !!skin.image?.startsWith('https://raw.githubusercontent.com/arkpedia/arkpedia-skin-assets/');
    if (!skin.image || !(pinned || published(skin.image))) { console.warn(`[tier list catalogue] no illustration for the outfit "${op.name} - ${skin.name}"`); return []; }
    return [[tierId(`skin:${skin.skinId}`).slice(5), skin.name, ...lean(skin.image, artPath(op.name, op.rarity!, skin.name))]];
  });
  const skills = getSkillList(op).flatMap((skill, i): [number, string, string?][] => {
    const image = skill.icon || getSkillIconPath(op.name, skill.name);
    if (!skill.name || !image || !published(image)) { if (!op.portraitPending) console.warn(`[tier list catalogue] no skill icon for "${op.name} - ${skill.name}"`); return []; }
    return [[i + 1, skill.name, ...lean(image, skillPath(op.name, skill.name))]];
  });
  const baseSkills = (op.baseSkills ?? []).flatMap((skill): [string, string, string?][] => {
    const image = getBaseSkillIconPath(op.name, skill);
    const buff = (skill as { buffId?: string }).buffId;
    if (!buff || !image || !published(image)) { if (!op.portraitPending) console.warn(`[tier list catalogue] no base skill icon for "${op.name} - ${skill.name}"`); return []; }
    return [[tierId(`base:${id}:${buff}`).slice(6 + id.length), baseSkillDisplayName(skill), ...lean(image, baseSkillPath(op.name, baseSkillDisplayName(skill)))]];
  });
  return [{ id, name: op.name, rarity: op.rarity, icon, art, skins, skills, baseSkills }];
});
// Enemies, from the handbook index build-enemy-details.mjs wrote just before this script
// (generate:public runs it first): the ones the handbook shows, with an icon the index holds.
const enemyIndex = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'public/enemies-index.json'), 'utf8')) as { slug: string; name: string; icon?: string; hidden?: boolean }[];
const tierEnemies = enemyIndex.flatMap((enemy): [string, string, string?][] => {
  if (enemy.hidden || !enemy.icon || !published(enemy.icon)) return [];
  // The handbook's slug is the enemy page's address, the stablest name the index gives it.
  return [[tierId(enemyItemId(enemy.slug)).slice(6), enemy.name, ...lean(enemy.icon, enemyIconPath(enemy.name))]];
});
// Factions: every emblem in the image repository, by its file's name.
const tierFactions = publicFiles('faction-icons').filter((file) => file.endsWith('.webp')).map((file) => tierId(factionItemId(file.slice(0, -5))).slice(8)).sort((a, b) => a.localeCompare(b));
// Stories: the main story's chapters, the side stories and the vignettes, each with the art
// the Story page shows for it.
const tierStories = bundledStoryLibrary().flatMap((entry): [string, string, string?][] => {
  if (!['main', 'side', 'mini'].includes(entry.category) || !entry.image || !published(entry.image)) return [];
  return [[tierId(storyItemId(entry.id)).slice(6), entry.title, ...lean(entry.image, storyArtPath(entry.id))]];
});
if (tierEnemies.length < 1000 || tierFactions.length < 30 || tierStories.length < 60) throw new Error(`[tier list catalogue] too few records to be right: ${tierEnemies.length} enemies, ${tierFactions.length} factions, ${tierStories.length} stories`);
fs.writeFileSync(path.join(process.cwd(), 'data/tier-list-catalogue.json'), JSON.stringify({ operators: tierOperators, enemies: tierEnemies, factions: tierFactions, stories: tierStories } satisfies TierCatalogue) + '\n');
