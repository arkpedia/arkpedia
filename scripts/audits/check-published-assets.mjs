import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { clipUrl, hasRecording } from '../../lib/operators/voiceRecording.mjs';

const read = async file => JSON.parse(await fs.readFile(new URL(`../../${file}`, import.meta.url), 'utf8'));
const revisions = await read('data/assets/revisions.json');
const index = await read('data/assets/external-asset-index.json');
const cdn = await read('config/asset-delivery.json');
// Fetch through the same template the site emits, so this verifies what readers load.
const url = (repo, path) => cdn.template.replace('{repository}', repo).replace('{revision}', revisions[repo]).replace('{path}', path.split('/').map(encodeURIComponent).join('/'));
async function download(address) {
  const response = await fetch(address, { signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`${response.status}: ${address}`);
  return Buffer.from(await response.arrayBuffer());
}
for (const [repo, sha] of Object.entries(revisions)) {
  if (!/^[a-f0-9]{40}$/.test(sha)) throw new Error(`Unpinned repository: ${repo}`);
}
const manifests = await Promise.all(['arkpedia-image-assets', 'arkpedia-skin-assets'].map(async repo => ({
  repo, manifest: JSON.parse(await download(url(repo, 'asset-manifest.json'))),
})));
const files = new Map(manifests.flatMap(({ repo, manifest }) => Object.entries(manifest.files).map(([path, row]) => [path, { repo, ...row }])));
const missing = index.files.filter(path => !files.has(path));
if (missing.length) throw new Error(`Published revision is missing ${missing.length} files: ${missing.slice(0, 15).join(', ')}`);
// Download one deterministic sample from EVERY category, plus each responsive format.
// Public asset CI verifies the complete manifest; app CI verifies the delivery path.
const samples = new Map();
for (const path of [...index.files].sort()) {
  const category = path.split('/')[0];
  if (!samples.has(category)) samples.set(category, { path, ...files.get(path) });
}
const skin = manifests[1];
const artwork = Object.values(skin.manifest.files).find(row => row.original && row.variants);
if (!artwork) throw new Error('No responsive artwork in published manifest');
for (const row of [artwork.original, ...Object.values(artwork.variants).map(widths => Object.values(widths)[0])]) {
  samples.set(row.path, { ...row, repo: skin.repo });
}
// Small batches avoid rate spikes against the public host.
const rows = [...samples.values()];
for (let offset = 0; offset < rows.length; offset += 4) {
  await Promise.all(rows.slice(offset, offset + 4).map(async row => {
    const bytes = await download(url(row.repo, row.path));
    if (bytes.length !== row.bytes || createHash('sha256').update(bytes).digest('hex') !== row.sha256) {
      throw new Error(`Published file differs from manifest: ${row.repo}/${row.path}`);
    }
  }));
}
const palette = JSON.parse(await download(url('arkpedia-color-palette', 'palettes/community-overrides.json')));
if (!palette || typeof palette !== 'object') throw new Error('Invalid palette JSON');
for (const repo of Object.keys(revisions).filter(repo => repo.startsWith('arkpedia-voice-'))) {
  const source = JSON.parse(await download(url(repo, 'source.json')));
  if (!source.sourceCommit) throw new Error(`Missing voice provenance: ${repo}`);
}
// Every clip an operator page offers in a legacy voice pack, asked for the way readers ask.
// A legacy pack was recorded before the actor changed and may lack lines (Exusiai's legacy
// English has no CN_043), so the voice builder narrows availablePacks to the files each
// legacy folder holds; this fails if the page would still offer one that is not there.
// Current packs are whole-game dumps and are covered by their revision records above.
const voices = await read('data/operator-voice-lines.json');
const clips = [];
for (const [charId, operator] of Object.entries(voices.operators)) {
  for (const pack of operator.packs.filter(pack => pack.status === 'legacy' && pack.audioTemplate)) {
    const match = pack.audioTemplate.match(/^https:\/\/raw\.githubusercontent\.com\/arkpedia\/(arkpedia-voice-[a-z]+)\/(?:main|[a-f0-9]{40})\/(.+)$/);
    if (!match || !revisions[match[1]]) throw new Error(`${charId} ${pack.id}: legacy voice template outside the pinned voice repositories: ${pack.audioTemplate}`);
    for (const line of operator.lines) {
      if (hasRecording(line, pack)) clips.push({ where: `${charId} ${pack.id} ${line.id}`, repo: match[1], path: decodeURIComponent(clipUrl(match[2], line.id)) });
    }
  }
}
const absent = [];
for (let offset = 0; offset < clips.length; offset += 8) {
  await Promise.all(clips.slice(offset, offset + 8).map(async clip => {
    const address = url(clip.repo, clip.path);
    const response = await fetch(address, { method: 'HEAD', signal: AbortSignal.timeout(30000) });
    if (response.status === 404) absent.push(clip.where);
    else if (!response.ok) throw new Error(`${response.status}: ${address}`);
  }));
}
if (absent.length) {
  throw new Error(`Operator pages offer ${absent.length} legacy voice clip(s) the pinned voice repositories do not have: ${absent.sort().slice(0, 15).join(', ')}. `
    + 'Rebuild the voice lines (npm run voices:refresh), which leaves a clip out of availablePacks when its legacy folder lacks it.');
}
console.log(`Verified ${index.files.length} published image paths, ${rows.length} file hashes, palette JSON, all five voice revision records and ${clips.length} legacy voice clips.`);
