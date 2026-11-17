import fs from 'node:fs/promises';
import { fetchAsset } from '../../lib/assets/githubRetry.mjs';
import gameArt from '../../config/is-game-art.json';
import { projectIs } from '../../lib/gamemodes/integratedStrategies';
import { mediaRevision } from '../../lib/assets/mediaDelivery.mjs';
async function main() {
const lock = JSON.parse(await fs.readFile('data/upstream.lock.json', 'utf8'));
async function load(repository: string, region: string) {
  const revision = lock.repositories[repository]?.commit;
  if (!/^[a-f0-9]{40}$/.test(revision ?? '')) throw new Error(`Missing pinned IS source: ${repository}`);
  const response = await fetchAsset(`https://raw.githubusercontent.com/${repository}/${revision}/${region}/gamedata/excel/roguelike_topic_table.json`, { signal: AbortSignal.timeout(90000) });
  if (!response.ok) throw new Error(`IS catalogue ${region}: HTTP ${response.status}`);
  return response.json();
}
const [cn, global, stages] = await Promise.all([load('Kengxxiao/ArknightsGameData', 'zh_CN'), load('PuppiizSunniiz/ArknightsGameData_YoStar', 'en_US'), fs.readFile('data/community-stage-catalogue.json', 'utf8').then(JSON.parse)]);
const artResponse = await fetchAsset(`https://raw.githubusercontent.com/arkpedia/${gameArt.repository}/${gameArt.revision}/sources/is-game-art.json`, { signal: AbortSignal.timeout(30000) });
if (!artResponse.ok) throw new Error('Pinned IS artwork manifest is unavailable');
const art = await artResponse.json();
const requirements = JSON.parse(await fs.readFile('config/is-ending-requirements.json', 'utf8')).endings;
const topics = projectIs(cn, global, stages, art, requirements);
// Where the CDN stores each folder of the pinned art. A file a revision did not change is stored
// once, under the revision that introduced it, and the pin's readiness receipt says which folders
// those are. The pages need that for every icon, in every build (the browser-test build loads no
// build-wide media map), so it travels with the theme: only the folders a theme uses, a few lines.
const receiptResponse = await fetchAsset(`https://assets.arkpedia.net/__ready/${gameArt.repository}/${gameArt.revision}`, { signal: AbortSignal.timeout(30000) });
if (!receiptResponse.ok) throw new Error(`Game art revision ${gameArt.revision} is not published on the CDN yet (HTTP ${receiptResponse.status})`);
const receipt = await receiptResponse.json();
if (receipt.repository !== gameArt.repository || receipt.revision !== gameArt.revision) throw new Error('Game art readiness receipt names another revision');
const delivery = receipt.native ? { [gameArt.repository]: { [gameArt.revision]: receipt.native } } : {};
const storedFor = (paths: (string | undefined)[]) => {
  const stored: Record<string, string> = {};
  for (const path of paths) {
    if (!path || !path.startsWith('content-art/')) continue;
    const revision = mediaRevision(delivery, gameArt.repository, gameArt.revision, path, true);
    if (revision !== gameArt.revision) stored[path.slice(0, path.lastIndexOf('/'))] = revision;
  }
  return stored;
};
for (const topic of topics) {
  const stored = storedFor([...Object.values(topic.sections).flat().flatMap(r => [r.imageKind === 'map' ? undefined : r.image, r.cg]), ...(topic.resources ?? []).map(r => r.image), ...Object.values(topic.tabIcons ?? {}), ...(topic.keyArt?.art ?? []), topic.keyArt?.figure, topic.keyArt?.logo]);
  if (Object.keys(stored).length) topic.stored = stored;
}
if (!topics.length || topics.some(t => !t.name || !t.sections.items.length || !t.sections.stages.length)) throw new Error('Incomplete IS catalogue; keeping the previous deployment');
await fs.mkdir('public/_is', { recursive: true });
for (const topic of topics) await fs.writeFile(`public/_is/${topic.id}.json`, JSON.stringify(topic));
await fs.writeFile('public/_is/manifest.json', JSON.stringify(topics.map(({ sections, ...topic }) => ({ ...topic, counts: Object.fromEntries(Object.entries(sections).map(([k, v]) => [k, v.length])) }))));
console.log(`IS reference: ${topics.length} themes, Global records preferred over CN by identity`);

}
main().catch(error => { console.error(error); process.exitCode = 1; });
