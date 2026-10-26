import fs from 'node:fs';
import path from 'node:path';
// Project only the existing, counted first-clear pools. No new reward assumptions.
const sources = JSON.parse(fs.readFileSync('data/pull-sources.json', 'utf8'));
const mapRewards = new Map(sources.annihilationOrundum.maps.map(map => [map.id, map.orundum]));
// The permanent maps pay certificates, not Orundum: listed with amount 0 and their certs.
const certMaps = new Map((sources.annihilationOrundum.certMaps ?? []).map(map => [map.id, map.certs]));
const resources = [], annihilation = [], costs = {};
for (const file of fs.readdirSync('data/stages')) {
  if (!file.endsWith('.json')) continue;
  const stage = JSON.parse(fs.readFileSync(path.join('data/stages', file), 'utf8'));
  if (Number.isFinite(stage.sanity_cost)) costs[stage.id] = Math.max(0, stage.sanity_cost);
  if (stage.stage_type === 'daily' && stage.drops?.some(drop => drop.item?.id === '4002')) resources.push({ id: `resource:${stage.id}`, name: `${stage.code} · ${stage.name}`, amount: 1 });
  if (mapRewards.has(stage.id)) annihilation.push({ id: `annihilation:${stage.id}`, name: stage.name, amount: mapRewards.get(stage.id) });
  else if (certMaps.has(stage.id)) annihilation.push({ id: `annihilation:${stage.id}`, name: stage.name, amount: 0, certs: certMaps.get(stage.id) });
}
resources.sort((a,b) => a.name.localeCompare(b.name, 'en', { numeric:true }));
// Release order: the permanent camp_0n maps, then the rotating camp_r_nn ones.
annihilation.sort((a,b) => a.id.localeCompare(b.id));
if (resources.length !== sources.originitePrime.byType.daily || annihilation.reduce((n, map) => n + map.amount, 0) !== sources.annihilationOrundum.total) throw new Error('First-clear selections do not match the existing planner reward pools.');
// Obsidian Festival's ticket stages charge event tickets instead of sanity (apCost -1).
// Their site records keep sanity_cost null because their cost is a different currency.
const nonSanityStages = Object.fromEntries(['a003_f01', 'a003_f02', 'a003_f03', 'a003_f04'].map(id => [id, 0]));
const rewardStages = new Set([
  ...sources.originitePrime.chapters.flatMap(chapter => chapter.stages ?? []),
  ...sources.events.list.filter(event => event.playable).flatMap(event => event.stages ?? []),
  ...resources.map(stage => stage.id.slice('resource:'.length)),
  ...annihilation.map(stage => stage.id.slice('annihilation:'.length)),
]);
Object.assign(costs, nonSanityStages);
const stageSanity = Object.fromEntries([...rewardStages].sort().flatMap(id => costs[id] === undefined ? [] : [[id, costs[id]]]));
fs.writeFileSync('data/pull-first-clears.json', JSON.stringify({ resources, annihilation, stageSanity }, null, 2) + '\n');
