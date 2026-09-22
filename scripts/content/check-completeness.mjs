import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const safe = name => name.replace(/[\\/*?:"<>|]/g, '').trim();
const words = ['', 'one', 'two', 'three', 'four', 'five', 'six'];
export function checkCompleteness({ inventory, operators, skins, banners, events, bundles = [], assets }) {
  const errors = [];
  const byId = new Map(operators.map(op => [op.internalName, op]));
  const names = new Set(operators.flatMap(op => [op.name, op.recordName]));
  const skinIds = new Set();
  const asset = (file, context) => { if (!assets.has(file)) errors.push(`${context}: missing asset ${file}`); };
  for (const expected of inventory.operators) {
    const op = byId.get(expected.id);
    if (!op || op.error) { errors.push(`CN operator missing: ${expected.id} (${expected.name})`); continue; }
    if (!op.stats?.phases?.length) errors.push(`${op.name}: missing stats`);
    const stem = `${words[op.rarity]}-star-`;
    asset(`${stem}icons/${safe(op.name)} - Base.webp`, op.name);
    asset(`${stem}skins/${safe(op.name)} - Base.webp`, op.name);
  }
  for (const skin of skins) {
    if (!skin.skinId) errors.push(`Outfit has no source identity: ${skin.model} / ${skin.name}`);
    else if (skinIds.has(skin.skinId)) errors.push(`Duplicate outfit identity: ${skin.skinId}`);
    else skinIds.add(skin.skinId);
    if (!names.has(skin.model)) errors.push(`Outfit operator missing: ${skin.model} / ${skin.name}`);
  }
  for (const skin of inventory.skins) {
    if (!skinIds.has(skin.id)) errors.push(`CN outfit missing: ${skin.id} (${skin.name})`);
  }
  for (const banner of banners) {
    for (const name of [...(banner.six_stars ?? []), ...(banner.rate_up_six_stars ?? []), ...(banner.five_stars ?? []), ...(banner.four_stars ?? [])]) {
      if (!names.has(name)) errors.push(`Banner operator missing: ${banner.name} / ${name}`);
    }
  }
  for (const expected of inventory.events ?? []) if (!events.some(e=>e.activityId===expected.id)) errors.push(`Discovered event missing: ${expected.name}`);
  for (const expected of inventory.banners ?? []) if (!banners.some(b=>b.cnPoolId===expected.id)) errors.push(`Discovered banner missing: ${expected.name}`);
  for (const bundle of bundles) {
    if (!events.some(event => bundle.eventId ? event.activityId === bundle.eventId : event.name === bundle.event)) errors.push(`Bundle event missing: ${bundle.event}`);
    for (const name of bundle.banners ?? []) if (!banners.some(banner => bundle.bannerIds?.length ? bundle.bannerIds.includes(banner.cnPoolId) : banner.name === name)) errors.push(`Bundle banner missing: ${name}`);
    for (const id of bundle.operators ?? []) if (!byId.has(id)) errors.push(`Bundle operator missing: ${id}`);
    for (const id of bundle.skins ?? []) if (!skinIds.has(id)) errors.push(`Bundle outfit missing: ${id}`);
    for (const file of bundle.assets ?? []) asset(file, bundle.event);
  }
  return errors;
}

export function readCompletenessInputs(root = process.cwd()) {
  const read = file => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
  const operators = fs.readdirSync(path.join(root, 'data')).filter(dir => /^operators-\dstar$/.test(dir))
    .flatMap(dir => fs.readdirSync(path.join(root, 'data', dir)).filter(file => file.endsWith('.json'))
      .map(file => ({ ...read(`data/${dir}/${file}`), recordName: file.slice(0, -5) })));
  const eventFiles = fs.readdirSync(path.join(root, 'data/events')).filter(file => /^events_\d+\.json$/.test(file));
  const assetIndex = fs.existsSync(path.join(root, 'data/assets/external-asset-index.json'))
    ? read('data/assets/external-asset-index.json').files : read('data/public-asset-index.json').files;
  const remote = fs.existsSync(path.join(root, 'data/operator-asset-overrides.json')) ? Object.keys(read('data/operator-asset-overrides.json')) : [];
  return { inventory: read('data/content-inventory.json'), operators, skins: read('data/skins.json'),
    banners: read('data/headhunting_banners.json'), events: eventFiles.flatMap(file => read(`data/events/${file}`)),
    bundles: read('data/content-bundles.json'), assets: new Set([...assetIndex, ...remote]) };
}
export function assertCompleteness(root) {
  const input = readCompletenessInputs(root);
  const errors = checkCompleteness(input);
  if (errors.length) throw new Error(`Content publication blocked:\n${errors.map(error => `- ${error}`).join('\n')}`);
  console.log(`Coverage verified: ${input.inventory.operators.length} CN operators, ${input.inventory.skins.length} CN outfits, banner references and release bundles`);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) assertCompleteness(process.argv[2]);
