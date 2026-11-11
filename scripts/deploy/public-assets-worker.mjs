import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const UUID = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
export function uploadedAssetVersion(output, worker = 'arkpedia-assets') {
  assert.ok(['arkpedia-assets', 'arkpedia-data-assets'].includes(worker), 'Unexpected public asset Worker');
  if (output.length > 1_000_000) throw new Error('Oversized Wrangler output');
  const versions = output.trim().split('\n').filter(Boolean).map(line => JSON.parse(line))
    .filter(record => record.type === 'version-upload' && record.version === 1 && record.worker_name === worker);
  if (versions.length !== 1 || !UUID.test(versions[0].version_id || '')) throw new Error('Expected exactly one arkpedia-assets version upload');
  return versions[0].version_id;
}

export async function main() {
  const configPath = 'workers/assets/wrangler.jsonc';
  const config = JSON.parse(await readFile(configPath, 'utf8'));
  assert.equal(config.name, 'arkpedia-assets');
  assert.equal(config.account_id, '1ff51c10571eaa9934bc451e1bfdb361');
  assert.deepEqual(config.r2_buckets, [{ binding: 'PUBLIC_ASSETS', bucket_name: 'arkpedia-public-assets' }]);
  await mkdir('.cache', { recursive: true });
  const output = resolve(`.cache/public-assets-version-${randomUUID()}.jsonl`);
  const run = args => execFileSync(process.execPath, ['node_modules/wrangler/bin/wrangler.js', ...args], {
    stdio: 'inherit', env: { ...process.env, WRANGLER_OUTPUT_FILE_PATH: output },
  });
  // Publish through version APIs. DNS and the existing custom-domain route stay
  // managed separately, so the CI token needs no zone or DNS permissions.
  run(['versions', 'upload', '--name', 'arkpedia-assets', '--config', configPath]);
  const version = uploadedAssetVersion(await readFile(output, 'utf8'));
  run(['versions', 'deploy', `${version}@100%`, '--name', 'arkpedia-assets', '--yes', '--config', configPath]);
  const pins = JSON.parse(await readFile('data/assets/revisions.json', 'utf8'));
  const response = await fetch(`https://assets.arkpedia.net/arkpedia/arkpedia-image-assets/${pins['arkpedia-image-assets']}/six-star-icons/Surtr%20-%20Base.webp`, {
    method: 'HEAD', signal: AbortSignal.timeout(30_000),
  });
  assert.equal(response.status, 200, 'Existing public asset domain must remain available');
  assert.match(response.headers.get('x-arkpedia-assets') || '', /^R2(?:-HIT)?$/);
  await writeFile('.cache/public-assets-deployment.json', JSON.stringify({
    worker: config.name, version, source: process.env.GITHUB_SHA || null, domain: 'assets.arkpedia.net', verified: true,
  }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
