import fs from 'node:fs';
import path from 'node:path';
import { assetFileNames } from '../lib/public-assets.mjs';

const published = new Set(assetFileNames('stages-images'));
const missing = [];
for (const file of fs.readdirSync('data/stages').filter(file => file.endsWith('.json'))) {
  const stage = JSON.parse(fs.readFileSync(path.join('data/stages', file), 'utf8'));
  if (published.has(`${stage.slug}.webp`) && !stage.preview) missing.push(stage.slug);
}
if (missing.length) {
  throw new Error(`${missing.length} stages lost an already-published preview: ${missing.slice(0, 20).join(', ')}`);
}
console.log('Stage records preserve their published previews.');
