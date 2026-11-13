import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fetchAsset } from '../../lib/assets/githubRetry.mjs';
import { assetReferences } from '../../workers/assets/contract.mjs';

// GitHub remains the release authority. Only immutable, verified payloads move to R2.
async function json(url, limit) {
  const response = await fetchAsset(url, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`Cannot plan mirror: HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > limit) throw new Error('Mirror plan input too large');
  return { value: JSON.parse(bytes), bytes };
}
const root = 'https://raw.githubusercontent.com/arkpedia/arkpedia-data';
const { value: pointer } = await json(`${root}/live/current.json`, 2048);
if (!/^[a-f0-9]{40}$/.test(pointer.revision) || !/^[a-f0-9]{64}$/.test(pointer.manifestSha256)) throw new Error('Invalid live pointer');
const { value: manifest, bytes } = await json(`${root}/${pointer.revision}/release/manifest.json`, 5_000_000);
if (createHash('sha256').update(bytes).digest('hex') !== pointer.manifestSha256 || manifest.release !== pointer.release) throw new Error('Live manifest integrity failure');
const bundled = JSON.parse(await readFile('data/assets/revisions.json', 'utf8'));
const projectArt = JSON.parse(await readFile('config/community-project-art.json', 'utf8'));
const isArt = JSON.parse(await readFile('config/is-game-art.json', 'utf8'));
const entries = [[isArt.repository, isArt.revision], [projectArt.repository, projectArt.revision], ...Object.entries(bundled), ...Object.entries(manifest.assets), ['arkpedia-data', pointer.revision]];
for (const path of ['data/dynamic-art.json', 'data/chibi-art.json', 'data/medal-set-layouts.json', 'config/community-project-art.json']) {
  for (const ref of assetReferences(await readFile(path, 'utf8'))) entries.push([ref.repository, ref.revision]);
}
console.log(JSON.stringify([...new Map(entries.map(([repository, revision]) => [`${repository}/${revision}`, { repository, revision }])).values()], null, 2));
