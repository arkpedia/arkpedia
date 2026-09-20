import fs from 'node:fs';
import path from 'node:path';
// Project only the existing, counted first-clear pools. No new reward assumptions.
const sources = JSON.parse(fs.readFileSync('data/pull-sources.json', 'utf8'));
const mapRewards = new Map(sources.annihilationOrundum.maps.map(map => [map.id, map.orundum]));
const resources = [], annihilation = [];
for (const file of fs.readdirSync('data/stages')) {
  if (!file.endsWith('.json')) continue;
  const stage = JSON.parse(fs.readFileSync(path.join('data/stages', file), 'utf8'));
  if (stage.stage_type === 'daily' && stage.drops?.some(drop => drop.item?.id === '4002')) resources.push({ id: `resource:${stage.id}`, name: `${stage.code} · ${stage.name}`, amount: 1 });
  if (mapRewards.has(stage.id)) annihilation.push({ id: `annihilation:${stage.id}`, name: stage.name, amount: mapRewards.get(stage.id) });
}
resources.sort((a,b) => a.name.localeCompare(b.name, 'en', { numeric:true }));
annihilation.sort((a,b) => a.id.localeCompare(b.id));
if (resources.length !== sources.originitePrime.byType.daily || annihilation.reduce((n, map) => n + map.amount, 0) !== sources.annihilationOrundum.total) throw new Error('First-clear selections do not match the existing planner reward pools.');
fs.writeFileSync('data/pull-first-clears.json', JSON.stringify({ resources, annihilation }, null, 2) + '\n');
