import fs from 'node:fs/promises';
import { projectIs } from '../../lib/gamemodes/integratedStrategies';
async function main() {
const lock = JSON.parse(await fs.readFile('data/upstream.lock.json', 'utf8'));
async function load(repository: string, region: string) {
  const revision = lock.repositories[repository]?.commit;
  if (!/^[a-f0-9]{40}$/.test(revision ?? '')) throw new Error(`Missing pinned IS source: ${repository}`);
  const response = await fetch(`https://raw.githubusercontent.com/${repository}/${revision}/${region}/gamedata/excel/roguelike_topic_table.json`, { signal: AbortSignal.timeout(90000) });
  if (!response.ok) throw new Error(`IS catalogue ${region}: HTTP ${response.status}`);
  return response.json();
}
const [cn, global, stages] = await Promise.all([load('Kengxxiao/ArknightsGameData', 'zh_CN'), load('PuppiizSunniiz/ArknightsGameData_YoStar', 'en_US'), fs.readFile('data/community-stage-catalogue.json', 'utf8').then(JSON.parse)]);
const topics = projectIs(cn, global, stages);
if (!topics.length || topics.some(t => !t.name || !t.sections.items.length || !t.sections.stages.length)) throw new Error('Incomplete IS catalogue; keeping the previous deployment');
await fs.mkdir('public/_is', { recursive: true });
for (const topic of topics) await fs.writeFile(`public/_is/${topic.id}.json`, JSON.stringify(topic));
await fs.writeFile('public/_is/manifest.json', JSON.stringify(topics.map(({ sections, ...topic }) => ({ ...topic, counts: Object.fromEntries(Object.entries(sections).map(([k, v]) => [k, v.length])) }))));
console.log(`IS reference: ${topics.length} themes, Global records preferred over CN by identity`);

}
main().catch(error => { console.error(error); process.exitCode = 1; });
