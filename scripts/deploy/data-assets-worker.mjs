import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { uploadedAssetVersion } from './public-assets-worker.mjs';

export async function main(args = process.argv.slice(2)) {
  assert.ok(args.length === 0 || args.length === 1 && args[0] === '--verify-only', 'Expected no arguments or --verify-only');
  const verifyOnly = args[0] === '--verify-only';
  const configPath = 'workers/assets/wrangler.data.jsonc';
  const config = JSON.parse(await readFile(configPath, 'utf8'));
  assert.equal(config.name, 'arkpedia-data-assets');
  assert.equal(config.account_id, '1ff51c10571eaa9934bc451e1bfdb361');
  assert.deepEqual(config.r2_buckets, [{ binding: 'PUBLIC_ASSETS', bucket_name: 'arkpedia-public-assets-direct' }]);
  assert.deepEqual(config.routes, [], 'This isolated deployment must not change production routes');
  const get = async url => {
    const r = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(30_000) });
    assert.equal(r.status, 200, 'Required public release input unavailable'); return r;
  };
  const root = 'https://raw.githubusercontent.com/arkpedia/arkpedia-data';
  const pointer = await (await get(`${root}/live/current.json`)).json();
  assert.match(pointer.revision, /^[a-f0-9]{40}$/); assert.match(pointer.manifestSha256, /^[a-f0-9]{64}$/);
  const expected = Buffer.from(await (await get(`${root}/${pointer.revision}/release/manifest.json`)).arrayBuffer());
  assert.equal(createHash('sha256').update(expected).digest('hex'), pointer.manifestSha256);
  await mkdir('.cache', { recursive: true });
  const output = resolve(`.cache/data-assets-version-${randomUUID()}.jsonl`);
  const run = args => execFileSync(process.execPath, ['node_modules/wrangler/bin/wrangler.js', ...args], {
    stdio: 'inherit', env: { ...process.env, WRANGLER_OUTPUT_FILE_PATH: output },
  });
  let version = null;
  if (!verifyOnly) {
    run(['versions', 'upload', '--name', config.name, '--config', configPath]);
    version = uploadedAssetVersion(await readFile(output, 'utf8'), config.name);
    run(['versions', 'deploy', `${version}@100%`, '--name', config.name, '--yes', '--config', configPath]);
  }
  const origin = 'https://arkpedia-data-assets.cloudflare-1ff.workers.dev';
  const response = await get(`${origin}/arkpedia/arkpedia-data/${pointer.revision}/release/manifest.json`);
  assert.equal(response.headers.get('x-arkpedia-storage'), 'arkpedia-public-assets-direct');
  assert.match(response.headers.get('content-type') || '', /application\/json/);
  assert.ok(Buffer.from(await response.arrayBuffer()).equals(expected), 'New-bucket reader differs from the approved GitHub release');
  const ready = await get(`${origin}/__ready/arkpedia-data/${pointer.revision}`);
  assert.equal(ready.headers.get('x-arkpedia-storage'), 'arkpedia-public-assets-direct'); await ready.body?.cancel();
  await writeFile('.cache/data-assets-deployment.json', JSON.stringify({ observedAt: new Date().toISOString(),
    worker: config.name, version, source: process.env.GITHUB_SHA || null, origin, bucket: 'arkpedia-public-assets-direct',
    verifiedRevision: pointer.revision, manifestSha256: pointer.manifestSha256,
    mode: verifyOnly ? 'verification-only' : 'deployment-and-verification', productionRoutesChanged: false }, null, 2));
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
