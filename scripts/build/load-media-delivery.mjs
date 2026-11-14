// Build-only fallback for independently pinned application art and bundled pages.
// Live pages carry their own immutable map; no per-image lookup is introduced.
import fs from 'node:fs/promises';
import { assetReferences } from '../../workers/assets/contract.mjs';
import { validateMediaDelivery } from '../../lib/assets/mediaDelivery.mjs';
import { fetchAsset } from '../../lib/assets/githubRetry.mjs';

const maps = {};
if (process.env.ARKPEDIA_CONTENT_DISABLED !== '1') {
  const pins = new Map(Object.entries(JSON.parse(await fs.readFile('data/assets/revisions.json', 'utf8'))));
  const refs = [...pins].map(([repository, revision]) => ({ repository, revision }));
  for (const path of ['data/dynamic-art.json', 'data/chibi-art.json', 'data/medal-set-layouts.json', 'config/event-entrances.json', 'config/community-project-art.json']) {
    refs.push(...assetReferences(await fs.readFile(path, 'utf8')));
  }
  const project = JSON.parse(await fs.readFile('config/community-project-art.json', 'utf8'));
  refs.push({ repository: project.repository, revision: project.revision });
  await Promise.all([...new Map(refs.map(ref => [`${ref.repository}/${ref.revision}`, ref])).values()].map(async ({ repository, revision }) => {
    const response = await fetchAsset(`https://assets.arkpedia.net/__ready/${repository}/${revision}`, { signal: AbortSignal.timeout(20_000) });
    if (!response.ok) throw Error(`Bundled media not ready: ${repository}/${revision} (${response.status})`);
    const chunks = []; let length = 0;
    if (!response.body) throw Error('Empty bundled media readiness');
    for await (const bytes of response.body) {
      length += bytes.length;
      if (length > 1_000_000) throw Error('Oversized bundled media readiness');
      chunks.push(bytes);
    }
    const ready = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (ready.version !== 1 || ready.repository !== repository || ready.revision !== revision) throw Error('Invalid bundled media readiness');
    if (ready.native) { maps[repository] ??= {}; maps[repository][revision] = ready.native; }
  }));
}
validateMediaDelivery(maps);
await fs.mkdir('.cache', { recursive: true });
await fs.writeFile('.cache/native-media-delivery.json', JSON.stringify(maps));
console.log(`Bundled native media maps: ${Buffer.byteLength(JSON.stringify(maps))} bytes`);
