import { execFileSync } from 'node:child_process';
import { COMMIT, REPOSITORIES } from '../../workers/assets/contract.mjs';

// No credentials: releases may only adopt public revisions the reader can already serve.
const plan = JSON.parse(execFileSync(process.execPath, ['scripts/content/asset-mirror-plan.mjs'], {
  encoding: 'utf8', timeout: 120_000, maxBuffer: 2_000_000,
}));
const seen = new Set();
for (const { repository, revision } of plan) {
  if (!REPOSITORIES.has(repository) || !COMMIT.test(revision)) throw new Error('Invalid public asset readiness plan');
  const identity = `${repository}/${revision}`;
  if (seen.has(identity)) continue;
  seen.add(identity);
  const response = await fetch(`https://assets.arkpedia.net/__ready/${identity}`, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`R2 mirror is not ready: ${identity} (${response.status}). Run the public-assets mirror before deploying.`);
  const receipt = await response.json();
  if (receipt.version !== 1 || receipt.repository !== repository || receipt.revision !== revision || receipt.files <= 0) throw new Error(`Invalid R2 readiness receipt: ${identity}`);
  plan.push(...(receipt.references || []));
  console.log(`R2 ready: ${identity} (${receipt.files} files)`);
}
