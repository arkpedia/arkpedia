import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

/** Seed only records absent from the hydrated release. Never replace newer published data. */
export async function pullOperatorText(root = process.cwd(), fetchImpl = fetch) {
  const pin = JSON.parse(fs.readFileSync(path.join(root, 'config/operator-text-source.json'), 'utf8'));
  if (pin.repository !== 'arkpedia/arkpedia-data' || !/^[a-f0-9]{40}$/.test(pin.revision)) throw Error('Invalid operator text source');
  const pending = [];
  for (const name of ['operator-translations.json', 'combat-keywords.json']) {
    const destination = path.join(root, 'data', name);
    if (fs.existsSync(destination)) continue;
    const response = await fetchImpl(`https://raw.githubusercontent.com/${pin.repository}/${pin.revision}/source/data/${name}`, { signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw Error(`Operator text source ${name}: HTTP ${response.status}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    if (createHash('sha256').update(bytes).digest('hex') !== pin.files[name]) throw Error(`Operator text checksum mismatch: ${name}`);
    JSON.parse(bytes.toString('utf8'));
    pending.push([destination, bytes]);
  }
  for (const [destination, bytes] of pending) {
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, bytes);
  }
  return pending.length;
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  pullOperatorText().then(count => console.log(`Seeded ${count} missing operator text record(s) from the checked source.`)).catch(error => { console.error(error.message); process.exitCode = 1; });
}
