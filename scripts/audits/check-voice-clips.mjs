import fs from 'node:fs/promises';
import { clipUrl, hasRecording } from '../../lib/operators/voiceRecording.mjs';

/*
 * Every clip an operator page offers in a legacy voice pack, asked for the way readers ask.
 * A legacy pack was recorded before the actor changed and may lack lines (Exusiai's legacy
 * English has no CN_043), so the voice builder narrows availablePacks to the files each
 * legacy folder holds; this fails if the page would still offer one that is not there.
 * Current packs are whole-game dumps and are covered by their revision records, which
 * check-published-assets.mjs verifies.
 *
 * A check of data/operator-voice-lines.json, which the voices stage rebuilds, so it is not
 * part of check-published-assets.mjs: the asset-revisions stage runs that one on the day's
 * new pins, before the voices stage, and failed there on the lines the voices stage was
 * about to narrow. `npm run check:published-assets` runs both, in app CI and in the release
 * job's Validate step, after every refresh stage.
 */
const read = async file => JSON.parse(await fs.readFile(new URL(`../../${file}`, import.meta.url), 'utf8'));
const revisions = await read('data/assets/revisions.json');
const cdn = await read('config/asset-delivery.json');
// Fetch through the same template the site emits, so this verifies what readers load.
const url = (repo, path) => cdn.template.replace('{repository}', repo).replace('{revision}', revisions[repo]).replace('{path}', path.split('/').map(encodeURIComponent).join('/'));
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
// Small batches avoid rate spikes against the public host.
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
console.log(`Verified ${clips.length} legacy voice clips.`);
