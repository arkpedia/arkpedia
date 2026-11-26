#!/usr/bin/env node
/**
 * Select the client map previews to stage for the standard media publisher.
 *   node scripts/imports/import-stage-full-previews.mjs --ccb
 *   node scripts/imports/import-stage-full-previews.mjs --stage main_17-09 --stage wk_kc_6
 *
 * Explicit selection keeps the import bounded. The staged-art publisher records
 * the original URL and SHA-256 and serves the encoded capture from our asset CDN.
 * Prepare a publisher plan from a clean checkout without local browser fixtures:
 *
 *   node scripts/content/run-stage.mjs run stage-full-previews --invariant \
 *     --output .cache/stage-full-previews -- node scripts/imports/import-stage-full-previews.mjs --ccb
 *   python3 scripts/sync/publish-catalogue-assets.py plan-staged .cache/stage-full-previews/publisher-plan.json
 */
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { assetFileNames } from '../lib/public-assets.mjs';
import { beginStaging, imageExtension } from '../lib/staged-art.mjs';

const SOURCE = 'https://torappu.prts.wiki/assets/map_preview';

async function stageFullPreviews(stages) {
  const stems = [...new Set(stages.map(stage => stage.toLowerCase().replace(/^level_/, '')))];
  if (!stems.length || stems.some(stem => !/^[a-z0-9_-]+$/.test(stem))) {
    throw new Error('Select --ccb or one or more valid client stage IDs with --stage.');
  }
  const published = new Set(assetFileNames('stages-images'));
  const pending = stems.map(stem => ({
    name: `${stem}-full.webp`,
    source: `${SOURCE}/${stem}.png`,
  })).filter(row => !published.has(row.name));
  const staging = beginStaging('stage-full-previews');
  for (let offset = 0; offset < pending.length; offset += 4) {
    await Promise.all(pending.slice(offset, offset + 4).map(async row => {
      const response = await fetch(row.source, { signal: AbortSignal.timeout(30_000) });
      if (!response.ok) throw new Error(`${row.source}: HTTP ${response.status}`);
      const bytes = Buffer.from(await response.arrayBuffer());
      if (imageExtension(bytes) !== 'png' || bytes.length < 24
        || bytes.toString('ascii', 12, 16) !== 'IHDR'
        || bytes.readUInt32BE(16) !== 1280 || bytes.readUInt32BE(20) !== 720) {
        throw new Error(`${row.source}: expected a 1280×720 PNG screenshot`);
      }
      staging.stage(`stages-images/${row.name}`, bytes, { source: row.source });
    }));
  }
  staging.commit();
  return { staged: pending.length, published: stems.length - pending.length };
}

async function main() {
  // The adoption step already checked the exact files in the hydrated asset index.
  // Stage details pick them up from that index without rewriting source records.
  if (process.env.ARKPEDIA_ART_ADOPTION === '1') return;
  const { values } = parseArgs({ options: {
    ccb: { type: 'boolean' },
    stage: { type: 'string', multiple: true },
  } });
  const stages = values.stage ?? [];
  if (values.ccb) {
    const { seasons } = JSON.parse(fs.readFileSync('config/ccb-archive.json', 'utf8'));
    stages.push(...seasons.flatMap(season => season.maps.map(map => map.stage)));
  }
  const { staged, published } = await stageFullPreviews(stages);
  console.log(`Full-size stage previews: ${staged} staged, ${published} already published.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href) await main();
