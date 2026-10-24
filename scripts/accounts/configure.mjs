import fs from 'node:fs';

// Only non-secret values go into wrangler.jsonc. Run from the repository root.
const args = process.argv.slice(2);
const option = name => args[args.indexOf(name) + 1];
const id = args.includes('--database-id') ? option('--database-id') : '';
const name = args.includes('--database-name') ? option('--database-name') : 'arkpedia-accounts-dev';
const origin = args.includes('--origin') ? option('--origin') : '';
if (!/^[a-f0-9-]{36}$/i.test(id) || !/^[a-z0-9-]+$/i.test(name)) throw new Error('Pass --database-id UUID and --database-name NAME.');
const url = new URL(origin);
if (url.protocol !== 'https:' || url.origin !== origin) throw new Error('Pass --origin https://your-worker.example with no trailing slash or path.');
const filename = 'wrangler.jsonc';
let text = fs.readFileSync(filename, 'utf8');
if (!/"d1_databases":\s*\[\s*\]/.test(text)) throw new Error('D1 is already configured. Edit its binding deliberately rather than overwriting it.');
if (/"vars"\s*:/.test(text) && !text.includes(`"ARKPEDIA_AUTH_URL": "${origin}"`)) throw new Error('Set ARKPEDIA_AUTH_URL in the existing vars block to the same origin first.');
text = text.replace(/"d1_databases":\s*\[\s*\]/, `"d1_databases": ${JSON.stringify([{
  binding: 'ARKPEDIA_ACCOUNTS_DB', database_name: name, database_id: id, migrations_dir: 'migrations/accounts',
}], null, 2)}`);
if (!/"vars"\s*:/.test(text)) text = text.replace('"observability":', `"vars": ${JSON.stringify({ ARKPEDIA_AUTH_URL: origin })},\n  "observability":`);
fs.writeFileSync(filename, text);
console.log('Configured the D1 binding and login origin. Add Worker secrets, apply migrations, then deploy.');
