import fs from 'node:fs';
import path from 'node:path';

// Prepare non-secret binding configuration only; never creates a database or deploys.
const args = process.argv.slice(2);
const allowed = new Set(['--config', '--database-id', '--database-name', '--origin']);
const values = new Map();
for (let index = 0; index < args.length; index += 2) {
  const key = args[index], value = args[index + 1];
  if (!allowed.has(key) || values.has(key) || !value || value.startsWith('--')) throw new Error('Pass each required option once: --config, --database-id, --database-name, --origin.');
  values.set(key, value);
}
if (values.size !== allowed.size) throw new Error('Pass --config, --database-id, --database-name and --origin explicitly.');
const filename = fs.realpathSync(path.resolve(values.get('--config')));
const relative = path.relative(fs.realpathSync(process.cwd()), filename);
if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)
  || !/\.jsonc?$/.test(filename)) throw new Error('Configuration must be an existing JSON/JSONC file inside this checkout.');
const id = values.get('--database-id'), name = values.get('--database-name'), origin = values.get('--origin');
if (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(id) || !/^[a-z0-9-]+$/i.test(name)) throw new Error('Pass a database UUID and explicit database name.');
const url = new URL(origin);
if (url.protocol !== 'https:' || url.origin !== origin) throw new Error('Pass the exact HTTPS account origin, without a path or trailing slash.');
let text = fs.readFileSync(filename, 'utf8');
if (/"ARKPEDIA_DEPLOYMENT_ROLE"\s*:\s*"staging"/.test(text) || /wrangler\.staging\.jsonc$/.test(filename)) throw new Error('Isolated staging must remain account-free.');
if (!/"d1_databases":\s*\[\s*\]/.test(text)) throw new Error('D1 is absent or already configured. Review an existing binding rather than replacing it.');
if (/"vars"\s*:/.test(text) && !text.includes(`"ARKPEDIA_AUTH_URL": "${origin}"`)) throw new Error('Set ARKPEDIA_AUTH_URL in the existing vars block to the exact reviewed origin first.');
text = text.replace(/"d1_databases":\s*\[\s*\]/, `"d1_databases": ${JSON.stringify([{
  binding: 'ARKPEDIA_ACCOUNTS_DB', database_name: name, database_id: id, migrations_dir: 'migrations/accounts',
}], null, 2)}`);
if (!/"vars"\s*:/.test(text)) {
  if (!/"observability"\s*:/.test(text)) throw new Error('Add an explicit vars block with ARKPEDIA_AUTH_URL to this configuration first.');
  text = text.replace(/"observability"\s*:/, `"vars": ${JSON.stringify({ ARKPEDIA_AUTH_URL: origin })},\n  "observability":`);
}
fs.writeFileSync(filename, text);
console.log('Prepared the non-secret D1 binding and exact login origin. Review the diff; no database, secret, migration or deployment was changed remotely.');
