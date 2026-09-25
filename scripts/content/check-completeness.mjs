import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseReleaseDate } from '../../lib/music/releaseDate.mjs';
import { unconfirmedOutfitSales } from './outfit-windows.mjs';
import { checkMaterialCatalogue, uncataloguedCosts } from '../../lib/farming/materialCatalogue.mjs';

const safe = name => name.replace(/[\\/*?:"<>|]/g, '').trim();
// A reward name that is a scrape's stand-in for a missing item, not the item.
const PLACEHOLDER = /not found|^\?+$|^(?:tbd|tba|unknown|null|undefined|placeholder|n\/a)$/i;
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
/** The quarantine key of a banner or an event: its client id, else its name, the same keys
 * the catalogue stage reports them under. */
export const bannerKey = banner => `banner:${banner.cnPoolId || banner.globalPoolId || banner.name}`;
export const eventKey = event => `event:${event.activityId || event.name}`;
/** The image-repository path of a record's art: a site path, or a URL pinned to one commit. */
export function artPath(value) {
  if (!value) return null;
  if (!value.startsWith('https://')) return value.replace(/^\//, '');
  const match = new URL(value).pathname.match(/^\/arkpedia\/arkpedia-image-assets\/[a-f0-9]{40}\/(.+)$/);
  return match ? decodeURIComponent(match[1]) : value;
}
/*
 * What stops a release and what only quarantines one record.
 *
 * INVARIANTS block the release: records that are malformed by hand (a nested cost list, a
 * CN record the site would call released), outfit identities that are missing or taken
 * twice, and a collection that shrank by more than 2% since the data this run loaded
 * (countDrops, over every collection in COLLECTIONS), which no single late record
 * explains. A shrink the maintainer intends is let through for one run by naming the
 * collection in allowShrink (the release job's allow_shrink input, ARKPEDIA_ALLOW_SHRINK),
 * and it is still printed as a warning: never silently.
 *
 * Everything else is one record's problem -- a new CN operator or outfit not imported yet,
 * a discovered event or banner the catalogue left out, art (key art too) or a reward icon
 * the image sync has not published, a stage enemy without its record, an album whose
 * release date is not written YYYY/MM/DD -- so it becomes an
 * entry in data/quarantine.json (stage 'completeness') and a line in the daily 'Content
 * quarantined' issue, and the rest of the day's content still goes out. The keys name
 * records by their source ids, the same way every stage's quarantine entries do.
 */
export function reviewCompleteness({ inventory, operators, skins, banners, events, bundles = [], albums = [], assets, skinWindows, now, stageEnemies, enemyRecords, enemyIndex, materials, counts, baseline, allowShrink = [] }) {
  if (!Array.isArray(materials?.order)) throw new Error('reviewCompleteness needs the material catalogue (data/material-catalogue.json)');
  const errors = [], quarantine = [], allowed = [];
  const hold = (key, action, reason) => quarantine.push({ key, action, reason });
  const byId = new Map(operators.map(op => [op.internalName, op]));
  const names = new Set(operators.flatMap(op => [op.name, op.recordName]));
  const skinIds = new Set();
  const missing = file => !assets.has(file);
  // The rule findSkinIconPath applies: an outfit's icon is <Operator> - <Outfit>.webp in a
  // rarity folder, matched by the outfit name alone, ignoring case.
  const outfitIcons = new Set([...assets].map(file => file.match(/^(?:one|two|three|four|five|six)-star-icons\/[^/]*? - (.+)\.webp$/i)?.[1].trim().toLowerCase()).filter(Boolean));
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
    // Every material an operator's upgrades cost has to be one the planner can hold: a cost
    // the catalogue lacks is a bill row no depot tile can ever cover. Liquified Ether
    // Absorber, Concentrated Power Unit, Electrode Unit and Liquified High-Energy Gas sat in
    // three records that way with nothing to say so. /planner leaves the operator out of its
    // picker until the catalogue has them (build-material-catalogue.mjs says why it lacks
    // one: no item id, which data/material-names.json supplies, or no published icon).
    const uncatalogued = uncataloguedCosts(op, materials);
    if (uncatalogued.length) {
      hold(`operator:${op.internalName || op.name}`, 'published-partial', `${op.name}: costs ${uncatalogued.join(', ')}, which data/material-catalogue.json does not have, so /planner cannot hold or craft ${uncatalogued.length === 1 ? 'it' : 'them'} and leaves ${op.name} out of its picker`);
    }
  }
  for (const expected of inventory.operators) {
    const op = byId.get(expected.id), key = `operator:${expected.id}`;
    if (!op || op.error) { hold(key, 'omitted-new', `CN operator missing: ${expected.id} (${expected.name})`); continue; }
    // The operator page leaves out the sections it has no data or art for.
    if (!op.stats?.phases?.length) hold(key, 'published-partial', `${op.name}: missing stats`);
    const stem = `${words[op.rarity]}-star-`;
    for (const file of [`${stem}icons/${safe(op.name)} - Base.webp`, `${stem}skins/${safe(op.name)} - Base.webp`]) {
      if (missing(file)) hold(key, 'published-partial', `${op.name}: missing asset ${file}`);
    }
  }
  for (const skin of skins) {
    if (!skin.skinId) errors.push(`Outfit has no source identity: ${skin.model} / ${skin.name}`);
    else if (skinIds.has(skin.skinId)) errors.push(`Duplicate outfit identity: ${skin.skinId}`);
    else skinIds.add(skin.skinId);
    if (skin.skinId && !names.has(skin.model)) hold(`skin:${skin.skinId}`, 'published-partial', `Outfit operator missing: ${skin.model} / ${skin.name}`);
  }
  for (const skin of inventory.skins) {
    if (!skinIds.has(skin.id)) hold(`skin:${skin.id}`, 'omitted-new', `CN outfit missing: ${skin.id} (${skin.name})`);
  }
  // A new outfit on sale on Global with no confirmed window reads as an estimate on /skins
  // until someone copies the notice's Outfit Store dates. See outfit-windows.mjs.
  // Only a notice has the store's dates; a window synced from the client names activity_table.
  for (const { skin, event, key } of unconfirmedOutfitSales({ skins, events, windows: skinWindows, now })) {
    const notice = /^https:\/\/(?:www\.)?arknights\.global\/news\/\d+\/?$|^https:\/\/(?:x|twitter)\.com\/ArknightsEN\/status\/\d+\/?$/i.test(event.global.timingSource ?? '') ? event.global.timingSource : 'the official notice';
    hold(`skin:${skin.skinId ?? key}`, 'published-partial', `${key}: on sale on Global with ${event.name}, but data/skin-availability-windows.json has no confirmed window for it, so /skins shows an estimate; add the Outfit Store window from ${notice}`);
  }
  for (const banner of banners) {
    for (const name of [...(banner.six_stars ?? []), ...(banner.rate_up_six_stars ?? []), ...(banner.five_stars ?? []), ...(banner.four_stars ?? [])]) {
      if (!names.has(name)) hold(bannerKey(banner), 'published-partial', `Banner operator missing: ${banner.name} / ${name}`);
    }
    // Key art the image repository has not published, or none yet (a banner the catalogue
    // created from the client): the banner goes out without it.
    const art = artPath(banner.banner_image);
    if (!art) hold(bannerKey(banner), 'published-partial', `${banner.name}: no key art yet`);
    else if (missing(art)) hold(bannerKey(banner), 'published-partial', `${banner.name}: missing asset ${art}`);
  }
  for (const event of events) {
    const art = artPath(event.poster);
    if (art && missing(art)) hold(eventKey(event), 'published-partial', `${event.name}: missing asset ${art}`);
  }
  for (const expected of inventory.events ?? []) if (!events.some(e=>e.activityId===expected.id)) hold(eventKey({ activityId: expected.id }), 'omitted-new', `Discovered event missing: ${expected.name}`);
  // Every reward an event page lists needs a real name and a published icon: the page asks
  // for material-icons/<iconName ?? name> (an outfit: its icon in a rarity folder) and leaves
  // out an icon that is not published (rewardIconPath). "Furniture not found", the wiki's
  // placeholder, sat in a store as an item drawing a broken image, and nothing reported it.
  for (const event of events) for (const block of [event.rewards ?? []].flat()) for (const item of block?.items ?? []) {
    const name = typeof item?.name === 'string' ? item.name.trim() : '';
    if (!name || PLACEHOLDER.test(name)) hold(eventKey(event), 'published-partial', `${event.name} reward "${item?.name ?? ''}": a placeholder, not an item name`);
    else if (item.type === 'skin') { if (!outfitIcons.has(name.toLowerCase())) hold(eventKey(event), 'published-partial', `${event.name} reward outfit ${name}: no published outfit icon`); }
    else if (missing(`material-icons/${safe(item.iconName ?? name)}.webp`)) hold(eventKey(event), 'published-partial', `${event.name} reward ${name}: missing asset material-icons/${safe(item.iconName ?? name)}.webp`);
  }
  for (const expected of inventory.banners ?? []) if (!banners.some(b=>b.cnPoolId===expected.id)) hold(bannerKey({ cnPoolId: expected.id }), 'omitted-new', `Discovered banner missing: ${expected.name}`);
  for (const bundle of bundles) {
    const key = `bundle:${bundle.eventId || bundle.event}`;
    if (!events.some(event => bundle.eventId ? event.activityId === bundle.eventId : event.name === bundle.event)) hold(key, 'published-partial', `Bundle event missing: ${bundle.event}`);
    for (const name of bundle.banners ?? []) if (!banners.some(banner => bundle.bannerIds?.length ? bundle.bannerIds.includes(banner.cnPoolId) : banner.name === name)) hold(key, 'published-partial', `Bundle banner missing: ${name}`);
    for (const id of bundle.operators ?? []) if (!byId.has(id)) hold(key, 'published-partial', `Bundle operator missing: ${id}`);
    for (const id of bundle.skins ?? []) if (!skinIds.has(id)) hold(key, 'published-partial', `Bundle outfit missing: ${id}`);
    for (const file of bundle.assets ?? []) if (missing(file)) hold(key, 'published-partial', `${bundle.event}: missing asset ${file}`);
  }
  // Every enemy a listed stage fields needs a record (its detail file is built from it)
  // and a grid row, or its stage links 404. Nothing regenerated either for a month, and a
  // new event shipped 19 enemies with neither; this is what makes that an overdue issue
  // rather than a quiet gap. Only the links break, so the stage itself still publishes.
  for (const [slug, stage] of stageEnemies) {
    if (!enemyRecords.has(slug)) hold(`enemy:${slug}`, 'published-partial', `Stage enemy has no record: ${slug} (fielded in ${stage})`);
    if (!enemyIndex.has(slug)) hold(`enemy:${slug}`, 'published-partial', `Stage enemy missing from enemies-index.json: ${slug} (fielded in ${stage})`);
  }
  // Reported, never blocking: a new enemy's icon arrives with the image sync after its
  // record does, and the sync finds new icons in the published records, so blocking here
  // would deadlock. See missingEnemyIcons.
  const unpublished = new Set(missingEnemyIcons({ enemyRecords, assets }));
  for (const [slug, record] of [...enemyRecords].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
    if (unpublished.has(record.icon?.slice(1))) hold(`enemy:${slug}`, 'published-partial', `${record.name}: icon ${record.icon.slice(1)} not published yet`);
  }
  // An album's release date is what orders Recently added on /music/discover, and it is
  // stored YYYY/MM/DD (lib/music/releaseDate.mjs), the form the album sync writes. A date
  // typed any other way, or a blank the sync had no cover date to fill, is that one album's
  // problem: it is held, and every other album still goes out.
  for (const album of albums) {
    if (parseReleaseDate(album.releaseDate) !== null) continue;
    const title = album.albumAltName || album.albumName || album.albumId;
    hold(`album:${album.albumId}`, 'published-partial', album.releaseDate
      ? `${title}: release date ${JSON.stringify(album.releaseDate)} is not written YYYY/MM/DD`
      : `${title}: no release date, so Recently added leaves it out`);
  }
  const unknown = allowShrink.filter(name => !COLLECTIONS.includes(name));
  if (unknown.length) errors.push(`allow_shrink names no collection: ${unknown.join(', ')} (the collections: ${COLLECTIONS.join(', ')})`);
  if (baseline) {
    const blocked = [];
    for (const drop of shrunk(baseline, counts)) (allowShrink.includes(drop.name) ? allowed : blocked).push(drop);
    errors.push(...blocked.map(dropMessage));
    if (blocked.length) {
      errors.push(`If that shrink is intended (records removed on purpose), run Prepare content release by hand with allow_shrink=${blocked.map(drop => drop.name).join(',')}; it lets them through for that run only. Otherwise find the stage that lost them.`);
    }
  }
  return { errors, quarantine, allowed: allowed.map(drop => `${dropMessage(drop)}; allowed for this run by allow_shrink`) };
}

/** Every gap, blocking or not, one message each: reviewCompleteness says which is which. */
export function checkCompleteness(input) {
  const { errors, quarantine } = reviewCompleteness(input);
  return [...errors, ...quarantine.map(entry => entry.reason)];
}

/*
 * Every published collection a reader would miss half of, counted the same way on the data
 * the run loaded and on what it publishes (collectionCounts):
 *   operators, skins, events, banners       the records themselves
 *   enemies, stages                         enemy and stage records (data/enemies, data/stages)
 *   stageRows, enemyRows                    the stage list and the enemy handbook grid
 *                                           (public/stages-index.json, public/enemies-index.json),
 *                                           which also decide which stage pages get built
 *   stageContents, stageMaps                data/stages-content.json, data/stage-geometry
 *   voiceOperators                          operators with voice lines (data/operator-voice-lines.json)
 *   songs                                   songs across data/albums.json
 *   recruitment                             the recruitable pool (data/recruitment-global.json)
 *   pullBanners                             banners the pull planner knows (data/pull-sources.json)
 *   deployOperators                         operators the map can deploy (public/operator-deploy.json)
 */
export const COLLECTIONS = ['operators', 'skins', 'events', 'banners', 'enemies', 'stages', 'stageRows', 'enemyRows',
  'stageContents', 'stageMaps', 'voiceOperators', 'songs', 'recruitment', 'pullBanners', 'deployOperators'];
export const MAX_DROP = 0.02;
/** The collections that lost more than 2% of their records since the loaded data: never one
 * record's problem, so never quarantined. A source that silently returned half a table is
 * what this catches. */
export function shrunk(baseline, counts) {
  return COLLECTIONS.filter(name => Number.isFinite(baseline?.[name]) && Number.isFinite(counts?.[name]) && counts[name] < baseline[name] * (1 - MAX_DROP))
    .map(name => ({ name, from: baseline[name], to: counts[name] }));
}
const dropMessage = ({ name, from, to }) => `${name} shrank from ${from} to ${to} records (more than ${MAX_DROP * 100}%) since the data this run loaded`;
export const countDrops = (baseline, counts) => shrunk(baseline, counts).map(dropMessage);
/** allow_shrink as the job passes it: names separated by commas or spaces. */
export const parseAllowShrink = value => String(value ?? '').split(/[\s,]+/).filter(Boolean);

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
  const stageFiles = fs.readdirSync(path.join(root, 'data/stages')).filter(file => file.endsWith('.json')).sort();
  const stageEnemies = new Map();
  for (const file of stageFiles) {
    const stage = read(`data/stages/${file}`);
    if (!listed.has(stage.slug)) continue;
    for (const group of [stage.enemies?.by_rank, stage.enemies?.conditional?.by_rank]) {
      for (const entry of Object.values(group ?? {}).flat()) if (entry?.slug && !stageEnemies.has(entry.slug)) stageEnemies.set(entry.slug, stage.slug);
    }
  }
  const enemyRecords = new Map(fs.readdirSync(path.join(root, 'data/enemies')).filter(file => file.endsWith('.json'))
    .flatMap(file => read(`data/enemies/${file}`).enemies.map(enemy => [enemy.slug, { name: enemy.name, icon: enemy.icon }])));
  const input = { inventory: read('data/content-inventory.json'), operators, skins: read('data/skins.json'),
    banners: read('data/headhunting_banners.json'), events: eventFiles.flatMap(file => read(`data/events/${file}`)),
    bundles: read('data/content-bundles.json'), assets: new Set([...assetIndex, ...remote]),
    albums: fs.existsSync(path.join(root, 'data/albums.json')) ? list(read('data/albums.json')) : [],
    skinWindows: read('data/skin-availability-windows.json').entries,
    materials: checkMaterialCatalogue(read('data/material-catalogue.json')),
    stageEnemies, enemyRecords, enemyIndex: new Set(read('public/enemies-index.json').map(row => row.slug)) };
  input.counts = { operators: operators.length, skins: input.skins.length, events: input.events.length,
    banners: input.banners.length, enemies: enemyRecords.size, stages: stageFiles.length, ...collectionCounts(root) };
  const baseline = path.join(root, BASELINE);
  if (fs.existsSync(baseline)) input.baseline = JSON.parse(fs.readFileSync(baseline, 'utf8')).counts;
  return input;
}

/** The other collections' sizes. A file that is missing or not the shape it should be
 * counts 0, so losing it is a drop like any other rather than a collection left unchecked. */
function collectionCounts(root) {
  const size = value => Array.isArray(value) ? value.length : value && typeof value === 'object' ? Object.keys(value).length : 0;
  const of = (file, pick = value => value) => {
    try { return size(pick(JSON.parse(fs.readFileSync(path.join(root, file), 'utf8')))); } catch { return 0; }
  };
  const files = dir => { try { return fs.readdirSync(path.join(root, dir)).filter(file => file.endsWith('.json')).length; } catch { return 0; } };
  let songs = 0;
  try {
    const albums = JSON.parse(fs.readFileSync(path.join(root, 'data/albums.json'), 'utf8'));
    if (Array.isArray(albums)) songs = albums.reduce((total, album) => total + size(album?.songs), 0);
  } catch { /* counts 0 */ }
  return {
    stageRows: of('public/stages-index.json'), enemyRows: of('public/enemies-index.json'),
    stageContents: of('data/stages-content.json'), stageMaps: files('data/stage-geometry'),
    voiceOperators: of('data/operator-voice-lines.json', value => value?.operators), songs,
    recruitment: of('data/recruitment-global.json', value => value?.operators),
    pullBanners: of('data/pull-sources.json', value => value?.banners),
    deployOperators: of('public/operator-deploy.json', value => value?.operators),
  };
}

/* The record counts of the data a run loaded, before any refresh step touched it: what
 * countDrops compares the finished data with. The release job records them right after it
 * loads arkpedia-data (a test holds it to that); without the file there is nothing to
 * compare, as in the application's own CI, which checks the bundled data as it is. */
export const BASELINE = '.cache/content-baseline.json';
export function recordBaseline(root = process.cwd()) {
  const { counts } = readCompletenessInputs(root);
  fs.mkdirSync(path.dirname(path.join(root, BASELINE)), { recursive: true });
  fs.writeFileSync(path.join(root, BASELINE), `${JSON.stringify({ version: 1, counts }, null, 2)}\n`);
  return counts;
}

/*
 * data/quarantine.json, shared by every refresh stage: {"version":1,"entries":[{key, stage,
 * reason, action, sourceRef?, firstSeen}]}, sorted by stage then key, two-space JSON with a
 * trailing newline. A stage that runs replaces all of its own entries with this run's,
 * keeping firstSeen for keys it still reports; other stages' entries are left alone. No
 * entry holds the day it was last reported (lastSeen, dropped wherever the file is
 * written), so a day that holds the same records does not change the file, which is a
 * release input. Written here by format, not through the importers' helper, so the two stay
 * independent. Several problems of one record share an entry, their reasons joined. A tree
 * with no quarantine file and nothing to hold (a local export, the application's own CI)
 * does not start one: the file belongs to arkpedia-data.
 */
export const QUARANTINE = 'data/quarantine.json';
const byCodeUnit = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
export function writeQuarantine(root, stage, found, now = new Date()) {
  const file = path.join(root, QUARANTINE);
  const today = now.toISOString().slice(0, 10);
  if (!fs.existsSync(file) && !found.length) return [];
  const previous = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')).entries ?? [] : [];
  const firstSeen = new Map(previous.filter(entry => entry.stage === stage).map(entry => [entry.key, entry.firstSeen]));
  const mine = new Map();
  for (const { key, action, reason, sourceRef } of found) {
    const entry = mine.get(key);
    if (entry) { if (!entry.reason.split('; ').includes(reason)) entry.reason += `; ${reason}`; continue; }
    mine.set(key, { key, stage, reason, action, ...(sourceRef ? { sourceRef } : {}), firstSeen: firstSeen.get(key) ?? today });
  }
  const entries = [...previous.filter(entry => entry.stage !== stage).map(({ lastSeen: _, ...entry }) => entry), ...mine.values()]
    .sort((a, b) => byCodeUnit(a.stage, b.stage) || byCodeUnit(a.key, b.key));
  fs.writeFileSync(file, `${JSON.stringify({ version: 1, entries }, null, 2)}\n`);
  return [...mine.values()];
}

export function assertCompleteness(root = process.cwd(), { now = new Date(), allowShrink = parseAllowShrink(process.env.ARKPEDIA_ALLOW_SHRINK) } = {}) {
  const input = readCompletenessInputs(root);
  const { errors, quarantine, allowed } = reviewCompleteness({ ...input, allowShrink, now });
  // Written before any throw: the day's holds are true whether or not an invariant stops it.
  // The refresh runs this as a stage with --keep data/quarantine.json, so the runner's
  // restore after that throw leaves them for the day's issue and the failure evidence.
  const held = writeQuarantine(root, 'completeness', quarantine, now);
  if (held.length) {
    const lines = held.map(entry => `  ${entry.key} (${entry.action}): ${entry.reason}`);
    console.warn(`${held.length} record(s) quarantined, published without them or without the piece named (${QUARANTINE}):\n${lines.slice(0, 60).join('\n')}${lines.length > 60 ? `\n  ...and ${lines.length - 60} more` : ''}`);
  }
  // Let through, but never silently: in the log, and as a warning on the run's summary.
  for (const line of allowed) console.warn(process.env.GITHUB_ACTIONS === 'true' ? `::warning title=Collection allowed to shrink::${line}` : `warning: ${line}`);
  if (errors.length) throw new Error(`Content publication blocked:\n${errors.map(error => `- ${error}`).join('\n')}`);
  console.log(`Coverage verified: ${input.inventory.operators.length} CN operators, ${input.inventory.skins.length} CN outfits, banner references, release bundles and ${input.stageEnemies.size} stage enemies`
    + (input.baseline ? `; no collection shrank by more than ${MAX_DROP * 100}%${allowed.length ? ' but the ones allow_shrink names' : ''} (${COLLECTIONS.filter(name => Number.isFinite(input.baseline[name])).map(name => `${name} ${input.baseline[name]}\u2192${input.counts[name]}`).join(', ')})` : ''));
  const icons = missingEnemyIcons(input);
  if (icons.length) console.warn(`${icons.length} enemy icon(s) not published yet -- the image sync must add them:\n${icons.map(file => `  ${file}`).join('\n')}`);
}

function main(argv) {
  let root, now = new Date(), baseline = false;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--now') now = new Date(argv[++i]);
    else if (argv[i] === '--record-baseline') baseline = true;
    else root = argv[i];
  }
  if (Number.isNaN(now.getTime())) throw new Error('--now needs a date');
  if (baseline) {
    const counts = recordBaseline(root);
    console.log(`Loaded data counts recorded in ${BASELINE}: ${COLLECTIONS.map(name => `${counts[name]} ${name}`).join(', ')}`);
  } else assertCompleteness(root, { now });
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main(process.argv.slice(2));
