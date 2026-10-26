import fs from 'node:fs';
import path from 'node:path';
// Project only the existing, counted first-clear pools. No new reward assumptions.
const sources = JSON.parse(fs.readFileSync('data/pull-sources.json', 'utf8'));
const mapRewards = new Map(sources.annihilationOrundum.maps.map(map => [map.id, map.orundum]));
// The permanent maps pay certificates, not Orundum: listed with amount 0 and their certs.
const certMaps = new Map((sources.annihilationOrundum.certMaps ?? []).map(map => [map.id, map.certs]));
const prior = JSON.parse(fs.readFileSync('data/pull-first-clears.json', 'utf8'));
const resources = [], annihilation = [], costs = Object.fromEntries(Object.entries(prior.stageSanity ?? {}).filter(([, cost]) => Number.isFinite(cost) && cost >= 0));
for (const file of fs.readdirSync('data/stages')) {
  if (!file.endsWith('.json')) continue;
  const stage = JSON.parse(fs.readFileSync(path.join('data/stages', file), 'utf8'));
  if (Number.isFinite(stage.sanity_cost)) costs[stage.id] = Math.max(0, stage.sanity_cost);
  if (stage.stage_type === 'daily' && stage.drops?.some(drop => drop.item?.id === '4002')) resources.push({ id: `resource:${stage.id}`, name: `${stage.code} · ${stage.name}`, amount: 1 });
  if (mapRewards.has(stage.id)) annihilation.push({ id: `annihilation:${stage.id}`, name: stage.name, amount: mapRewards.get(stage.id) });
  else if (certMaps.has(stage.id)) annihilation.push({ id: `annihilation:${stage.id}`, name: stage.name, amount: 0, certs: certMaps.get(stage.id) });
}
// The published catalogue can add a chapter before the site-stage projection is refreshed.
// Keep known costs and supplement them from the same English client, without runtime I/O.
const stageTable = process.env.ARKPEDIA_EN_STAGE_TABLE ?? path.join(process.env.ARKPEDIA_EN_EXCEL ?? '.cache/upstream/en-gamedata/en/gamedata/excel', 'stage_table.json');
if (fs.existsSync(stageTable)) {
  for (const stage of Object.values(JSON.parse(fs.readFileSync(stageTable, 'utf8')).stages)) {
    if (stage.stageId && stage.diamondOnceDrop > 0 && Number.isFinite(stage.apCost)) costs[stage.stageId] = Math.max(0, stage.apCost);
  }
}
resources.sort((a,b) => a.name.localeCompare(b.name, 'en', { numeric:true }));
// Release order: the permanent camp_0n maps, then the rotating camp_r_nn ones.
annihilation.sort((a,b) => a.id.localeCompare(b.id));
if (resources.length !== sources.originitePrime.byType.daily || annihilation.reduce((n, map) => n + map.amount, 0) !== sources.annihilationOrundum.total) throw new Error('First-clear selections do not match the existing planner reward pools.');
// Obsidian Festival's ticket stages charge event tickets instead of sanity (apCost -1).
// Their site records keep sanity_cost null because their cost is a different currency.
const nonSanityStages = Object.fromEntries(['a003_f01', 'a003_f02', 'a003_f03', 'a003_f04'].map(id => [id, 0]));
Object.assign(costs, nonSanityStages);
const stageSanity = Object.fromEntries(Object.entries(costs).sort(([a], [b]) => a.localeCompare(b, 'en')));
fs.writeFileSync('data/pull-first-clears.json', JSON.stringify({ resources, annihilation, stageSanity }, null, 2) + '\n');
