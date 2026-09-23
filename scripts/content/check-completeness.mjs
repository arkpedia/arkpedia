import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const safe = name => name.replace(/[\\/*?:"<>|]/g, '').trim();
const words = ['', 'one', 'two', 'three', 'four', 'five', 'six'];
const list = x => Array.isArray(x) ? x : [];
// Every material list is a flat [{ name, quantity }] list: the site, the tests and the public
// image sync all read it that way. Four hand-written records once nested the potential cost,
// which crashed the image sync, so no record is published with any other shape.
const isCostItem = item => item !== null && typeof item === 'object' && !Array.isArray(item)
  && typeof item.name === 'string' && item.name.trim() !== '' && Number.isFinite(item.quantity);
function costLists(op) {
  const skills = Array.isArray(op.skills) ? op.skills : list(op.skills?.skillList);
  return [
    ['potential.totalCost', op.potential?.totalCost],
    ...list(op.promotion).map((tier, i) => [`promotion[${i}].cost`, tier.cost]),
    ...Object.entries(op.skills?.skillCost ?? {}).map(([level, cost]) => [`skillCost.${level}`, cost]),
    ...skills.flatMap((skill, i) => Object.entries(skill.cost ?? {}).map(([mastery, cost]) => [`skills[${i}].cost.${mastery}`, cost])),
    ...list(op.modules).flatMap((module, i) => list(module.stages).filter(stage => stage.cost !== undefined)
      .map((stage, j) => [`modules[${i}].stages[${j}].cost`, stage.cost])),
  ];
}
/** The same decision as operatorRelease() in lib/operators/operatorAvailability.ts: whether a
 * record carries a release instant at all. A test keeps the two in step. */
export function hasRecordedRelease(op) {
  if (op.releaseAt && /(?:Z|[+-]\d{2}:\d{2})$/i.test(op.releaseAt) && Number.isFinite(Date.parse(op.releaseAt))) return true;
  const raw = op.characterInfo?.['Release Date']?.trim();
  if (!raw) return false;
  const match = raw.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/);
  if (!match) return Number.isFinite(Date.parse(`${raw} UTC`));
  const date = new Date(Date.UTC(+match[1], +match[2] - 1, +match[3]));
  return date.getUTCFullYear() === +match[1] && date.getUTCMonth() === +match[2] - 1 && date.getUTCDate() === +match[3];
}
export function checkCompleteness({ inventory, operators, skins, banners, events, bundles = [], assets, stageEnemies, enemyRecords, enemyIndex }) {
  const errors = [];
  const byId = new Map(operators.map(op => [op.internalName, op]));
  const names = new Set(operators.flatMap(op => [op.name, op.recordName]));
  const skinIds = new Set();
  const asset = (file, context) => { if (!assets.has(file)) errors.push(`${context}: missing asset ${file}`); };
  for (const op of operators) {
    for (const [field, cost] of costLists(op)) {
      if (!Array.isArray(cost) || !cost.every(isCostItem)) errors.push(`${op.name}: ${field} is not a flat [{ name, quantity }] list`);
    }
    // With no release date, isOperatorReleased() falls back to `isFuture !== true`, so an
    // unflagged CN-only record reads as released everywhere. A dated record is left to its
    // date, so a lagging EN mirror after a real Global launch never blocks a release.
    if (op.sourceRegion === 'CN' && op.isFuture !== true && !hasRecordedRelease(op)) {
      errors.push(`${op.name}: CN record has no release date and is not marked isFuture, so the site treats it as released`);
    }
  }
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
  // A reward renamed from its CN name must still resolve to a published icon: the page
  // asks for material-icons/<iconName ?? name>, and a miss renders as a blank square.
  for (const event of events) for (const block of [event.rewards ?? []].flat()) for (const item of block?.items ?? []) {
    if (item.cnName && item.type !== 'skin') asset(`material-icons/${safe(item.iconName ?? item.name)}.webp`, `${event.name} reward ${item.name}`);
  }
  for (const expected of inventory.banners ?? []) if (!banners.some(b=>b.cnPoolId===expected.id)) errors.push(`Discovered banner missing: ${expected.name}`);
  for (const bundle of bundles) {
    if (!events.some(event => bundle.eventId ? event.activityId === bundle.eventId : event.name === bundle.event)) errors.push(`Bundle event missing: ${bundle.event}`);
    for (const name of bundle.banners ?? []) if (!banners.some(banner => bundle.bannerIds?.length ? bundle.bannerIds.includes(banner.cnPoolId) : banner.name === name)) errors.push(`Bundle banner missing: ${name}`);
    for (const id of bundle.operators ?? []) if (!byId.has(id)) errors.push(`Bundle operator missing: ${id}`);
    for (const id of bundle.skins ?? []) if (!skinIds.has(id)) errors.push(`Bundle outfit missing: ${id}`);
    for (const file of bundle.assets ?? []) asset(file, bundle.event);
  }
  // Every enemy a listed stage fields needs a record (its detail file is built from
  // it) and a grid row, or its stage links 404. Nothing regenerated either for a month,
  // and a new event shipped 19 enemies with neither; this is what makes that a failed
  // release rather than a quiet one. Icons are deliberately not checked here -- the
  // image sync publishes them after the data -- see missingEnemyIcons.
  for (const [slug, stage] of stageEnemies) {
    if (!enemyRecords.has(slug)) errors.push(`Stage enemy has no record: ${slug} (fielded in ${stage})`);
    if (!enemyIndex.has(slug)) errors.push(`Stage enemy missing from enemies-index.json: ${slug} (fielded in ${stage})`);
  }
  return errors;
}

/** Enemy icon paths the records point at that the image repository has not published yet. */
export function missingEnemyIcons({ enemyRecords, assets }) {
  return [...new Set([...enemyRecords.values()].map(record => record.icon?.slice(1)).filter(file => file && !assets.has(file)))].sort();
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
  // slug -> the first listed stage that fields it, from the stage records themselves:
  // the same join the enemy builders make, and not their output, which is what is checked.
  const listed = new Set(read('public/stages-index.json').map(row => row.slug));
  const stageEnemies = new Map();
  for (const file of fs.readdirSync(path.join(root, 'data/stages')).filter(file => file.endsWith('.json')).sort()) {
    const stage = read(`data/stages/${file}`);
    if (!listed.has(stage.slug)) continue;
    for (const group of [stage.enemies?.by_rank, stage.enemies?.conditional?.by_rank]) {
      for (const entry of Object.values(group ?? {}).flat()) if (entry?.slug && !stageEnemies.has(entry.slug)) stageEnemies.set(entry.slug, stage.slug);
    }
  }
  const enemyRecords = new Map(fs.readdirSync(path.join(root, 'data/enemies')).filter(file => file.endsWith('.json'))
    .flatMap(file => read(`data/enemies/${file}`).enemies.map(enemy => [enemy.slug, { name: enemy.name, icon: enemy.icon }])));
  return { inventory: read('data/content-inventory.json'), operators, skins: read('data/skins.json'),
    banners: read('data/headhunting_banners.json'), events: eventFiles.flatMap(file => read(`data/events/${file}`)),
    bundles: read('data/content-bundles.json'), assets: new Set([...assetIndex, ...remote]),
    stageEnemies, enemyRecords, enemyIndex: new Set(read('public/enemies-index.json').map(row => row.slug)) };
}
export function assertCompleteness(root) {
  const input = readCompletenessInputs(root);
  const errors = checkCompleteness(input);
  if (errors.length) throw new Error(`Content publication blocked:\n${errors.map(error => `- ${error}`).join('\n')}`);
  console.log(`Coverage verified: ${input.inventory.operators.length} CN operators, ${input.inventory.skins.length} CN outfits, banner references, release bundles and ${input.stageEnemies.size} stage enemies`);
  // Reported, not failed: a new enemy's icon arrives with the image sync after its
  // record does, and a page with a blank tile beats a release withheld for a picture.
  const icons = missingEnemyIcons(input);
  if (icons.length) console.warn(`${icons.length} enemy icon(s) not published yet -- the image sync must add them:\n${icons.map(file => `  ${file}`).join('\n')}`);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) assertCompleteness(process.argv[2]);
