import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const ACCOUNT = '1ff51c10571eaa9934bc451e1bfdb361';
const DATABASE = '7d9cdfb2-2203-4708-bad5-f357d2c105b2';

export async function verifyPreviewRecovery({ config, accountId, token, fetcher = fetch }) {
  assert.equal(accountId, ACCOUNT, 'Unexpected Cloudflare account');
  assert.equal(config.previews?.vars?.ARKPEDIA_DEPLOYMENT_ROLE, 'staging');
  assert.equal(config.d1_databases, undefined, 'Preview must not bind production D1');
  assert.deepEqual(config.previews.d1_databases, [{ binding: 'ARKPEDIA_ACCOUNTS_DB', database_name: 'arkpedia-preview-accounts', database_id: DATABASE, migrations_dir: 'migrations/accounts' }]);
  assert.ok(token, 'Missing Cloudflare authorization');
  // Use the recovery endpoint directly; Wrangler first requests unrelated database metadata.
  const response = await fetcher(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/d1/database/${DATABASE}/time_travel/bookmark`, {
    headers: { Authorization: `Bearer ${token}` }, redirect: 'error', signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw Error(`Preview recovery check failed (HTTP ${response.status})`);
  const body = await response.json();
  if (!body.success || typeof body.result?.bookmark !== 'string' || !body.result.bookmark.trim()) throw Error('Missing Preview recovery bookmark');
  return { bookmark: body.result.bookmark, databaseId: DATABASE, checkedAt: new Date().toISOString() };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const config = JSON.parse(readFileSync('wrangler.preview.jsonc', 'utf8').replace(/^\/\/.*$/gm, ''));
  const directory = process.env.RUNNER_TEMP;
  assert.ok(directory, 'Missing runner temporary directory');
  const recovery = await verifyPreviewRecovery({ config, accountId: process.env.CLOUDFLARE_ACCOUNT_ID, token: process.env.CLOUDFLARE_API_TOKEN });
  writeFileSync(resolve(directory, 'preview-account-recovery.json'), JSON.stringify(recovery), { mode: 0o600 });
  // D1 migration commands do not resolve bindings nested under `previews`.
  // This temporary, migration-only config contains exactly the checked Preview database.
  writeFileSync(resolve(directory, 'preview-accounts.json'), JSON.stringify({
    name: 'arkpedia-preview-accounts-migrations', account_id: ACCOUNT,
    d1_databases: config.previews.d1_databases.map(database => ({ ...database, migrations_dir: resolve(database.migrations_dir) })),
  }), { mode: 0o600 });
  console.log('Preview recovery bookmark verified');
}
