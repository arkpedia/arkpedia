#!/usr/bin/env node
// GET only. A completed import is not proof that the channel's users receive it.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { releaseDeployments } from '../deploy/deploy-targets.mjs';
const digest = bytes => createHash('sha256').update(bytes).digest('hex');

async function pageProps(origin, route, fetch) {
  const response = await fetch(`${origin}${route}`, { cache: 'no-store', signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error(`${origin}${route}: HTTP ${response.status}`);
  const html = await response.text();
  const match = /<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/.exec(html);
  if (!match) throw new Error(`${origin}: stage page has no Next payload`);
  return JSON.parse(match[1]).props?.pageProps;
}

export async function checkServedStages({ origin, manifest, examples = [], fetch = globalThis.fetch }) {
  const props = await pageProps(origin, '/stages/browse', fetch);
  const served = props?.__contentRelease;
  if (served?.release !== manifest.release) throw new Error(`${origin}: stale stage page, expected ${manifest.release}, served ${served?.release ?? 'bundled fallback'}`);
  // Read the same immutable index URL the page gives the client; verify the bytes
  // against this run's compiled manifest, not merely a 200 or a plausible count.
  const file = manifest.files['stages-index.json'];
  if (!file) throw new Error('Prepared release has no stages-index.json');
  const base = new URL(served.baseUrl);
  if (base.protocol !== 'https:' || base.hostname !== 'raw.githubusercontent.com' || !base.pathname.startsWith('/arkpedia/arkpedia-data/')) throw new Error('Stage page has an unexpected content origin');
  const indexResponse = await fetch(`${served.baseUrl}/${file.path}`, { cache: 'no-store', signal: AbortSignal.timeout(20000) });
  if (!indexResponse.ok) throw new Error(`Served stage index: HTTP ${indexResponse.status}`);
  const bytes = Buffer.from(await indexResponse.arrayBuffer());
  if (bytes.length !== file.bytes || digest(bytes) !== file.sha256) throw new Error('Served stage index differs from prepared release');
  const index = JSON.parse(bytes.toString());
  if (!Array.isArray(index) || !index.length) throw new Error('Served stage index is empty');
  for (const example of examples) {
    const route = `/stages/content/${encodeURIComponent(example.id)}`;
    const content = await pageProps(origin, route, fetch);
    if (content?.__contentRelease?.release !== manifest.release || content?.release !== example.release_date) {
      throw new Error(`${origin}${route}: stale stage content/date`);
    }
  }
  return { origin, release: served.release, stages: index.length, sha256: file.sha256 };
}

export async function verifyServedStages({ manifest, examples = [], deployments, fetch, sleep = ms => new Promise(resolve => setTimeout(resolve, ms)), attempts = 13, log = console.log }) {
  if (!deployments.length) throw new Error('No live deployment for this content channel');
  const results = [];
  for (const { url } of deployments) {
    let last;
    for (let attempt = 1; attempt <= attempts; attempt++) {
      try { const result = await checkServedStages({ origin: url, manifest, examples, fetch }); results.push(result); log(JSON.stringify(result)); last = null; break; }
      catch (error) { last = error; if (attempt < attempts) await sleep(10000); }
    }
    if (last) throw last;
  }
  return results;
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const file = process.argv[2];
  if (!file) throw new Error('usage: check-served-stages.mjs <prepared manifest>');
  const contents = Object.values(JSON.parse(fs.readFileSync(path.resolve(path.dirname(file), '../source/data/stages-content.json'))));
  const examples = ['story', 'event'].flatMap(kind => contents.filter(row => row.kind === kind && row.release_date)
    .sort((a, b) => b.release_date.localeCompare(a.release_date)).slice(0, 1));
  verifyServedStages({ manifest: JSON.parse(fs.readFileSync(file)), examples, deployments: releaseDeployments() })
    .catch(error => { console.error(`Stage publication verification failed: ${error.message}`); process.exitCode = 1; });
}
