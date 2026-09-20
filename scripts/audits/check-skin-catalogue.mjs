/** Operator galleries and the shared catalogue must not drift apart: otherwise
 * new outfits have artwork but disappear from the skins page and pull planner. */
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const catalogue = JSON.parse(readFileSync(join(root, 'data/skins.json'), 'utf8'));
const published = new Set(JSON.parse(readFileSync(join(root, 'data/assets/external-asset-index.json'), 'utf8')).files);
const keys = new Set();
const errors = [];
for (const skin of catalogue) {
  const key = `${skin.model} / ${skin.name}`;
  if (keys.has(key)) errors.push(`Duplicate catalogue entry: ${key}`);
  keys.add(key);
  if (skin.image && /^\/(?:one|two|three|four|five|six)-star-skins\/[^/]+\.webp$/.test(skin.image)) {
    for (const asset of [skin.image, skin.image.replace('-star-skins/', '-star-icons/')]) {
      if (!published.has(asset.slice(1))) errors.push(`Missing published outfit artwork: ${asset}`);
    }
  }
}
for (const folder of readdirSync(join(root, 'data')).filter(name => /^operators-\dstar$/.test(name))) {
  for (const file of readdirSync(join(root, 'data', folder)).filter(name => name.endsWith('.json'))) {
    const operator = JSON.parse(readFileSync(join(root, 'data', folder, file), 'utf8'));
    for (const name of operator.skins || []) {
      const key = `${operator.name} / ${name}`;
      if (!keys.has(key)) errors.push(`Missing skin metadata: ${key}`);
    }
  }
}
if (errors.length) {
  console.error(`${errors.length} skin catalogue issue(s):\n${errors.join('\n')}\nAdd the verified release, price/reward method, and artwork to data/skins.json.`);
  process.exitCode = 1;
} else console.log(`Skin catalogue covers every operator outfit (${keys.size} entries).`);
