import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { getOperatorIconPath, OPERATOR_PORTRAIT_PLACEHOLDER } from '../../lib/operators/operatorIcon';
import farmingFixture from './fixtures/people-farming.json';
import operatorFixture from './fixtures/operator-costs.json';
import { emptyCatalogue, fixtureMaterials } from './fixtures/catalogue';
import assert from 'node:assert/strict';
// @ts-expect-error Node publication scripts are plain JavaScript.
import { checkCompleteness, COLLECTIONS, countDrops, hasRecordedRelease, missingEnemyIcons, parseAllowShrink, recordedRelease, reviewCompleteness, writeQuarantine } from '../content/check-completeness.mjs';
// @ts-expect-error Node import scripts are plain JavaScript.
import { buildEventFarming } from '../sync/sync-event-farming.mjs';
import { activeEventFarming, getEventFarmingMaterials } from '../../lib/farming/eventFarming';
import { operatorRelease } from '../../lib/operators/operatorAvailability';

type Hold = { key: string; action: string; reason: string };
/* One made-up collaboration, complete: a CN operator with its outfit, the event and banner
   the catalogue discovered for it, their published art, and the bundle that ties them.
   Frozen here so no case depends on what the day's refresh left in data/. */
function collaboration() {
  const op = Object.assign(structuredClone(operatorFixture.operator), {
    name: 'Test Operator', internalName: 'char_9990_test', stats: { phases: [{ elite: 0 }] } });
  return emptyCatalogue({
    inventory: { operators: [{ id: 'char_9990_test', name: '测试' }], skins: [{ id: 'char_9990_test@test#1', name: '测试服' }],
      events: [{ id: 'act99side', name: 'Test Event' }], banners: [{ id: 'LINKAGE_99_0_1', name: 'Test Banner' }] },
    operators: [op],
    skins: [{ skinId: 'char_9990_test@test#1', model: 'Test Operator', name: 'Test Outfit' }],
    events: [{ name: 'Test Event', activityId: 'act99side', poster: '/event-poster/Test Event.webp', rewards: [{ items: [{ name: 'Test Token', cnName: '测试币' }] }] }],
    banners: [{ name: 'Test Banner', cnPoolId: 'LINKAGE_99_0_1', six_stars: ['Test Operator'], banner_image: '/headhunting-banner-images/Test Banner.webp' }],
    bundles: [{ event: 'Test Event', eventId: 'act99side', banners: ['Test Banner'], bannerIds: ['LINKAGE_99_0_1'],
      operators: ['char_9990_test'], skins: ['char_9990_test@test#1'], assets: ['skill-icons/Test Operator - Test Skill.webp'] }],
    assets: new Set(['six-star-icons/Test Operator - Base.webp', 'six-star-skins/Test Operator - Base.webp',
      'material-icons/Test Token.webp', 'skill-icons/Test Operator - Test Skill.webp',
      'event-poster/Test Event.webp', 'headhunting-banner-images/Test Banner.webp']),
    palettes: new Set(['/six-star-skins/Test Operator - Base.webp']),
  });
}
const holds = (catalogue: object): Hold[] => {
  const { errors, quarantine } = reviewCompleteness(catalogue);
  assert.deepEqual(errors, [], 'a missing record or picture never blocks the release');
  return quarantine;
};
test('an operator who costs a material the planner\'s catalogue lacks is held back, not the release', () => {
  const op = Object.assign(structuredClone(operatorFixture.operator), { name: 'Closure Test', internalName: 'char_9991_clstst' });
  // Concentrated Power Unit, which Closure costs, before the catalogue had it.
  op.promotion[1].cost.push({ name: 'Concentrated Power Unit', quantity: 5 });
  op.skills.skillList[0].cost.m3.push({ name: 'Electrode Unit', quantity: 6 });
  const held = holds(emptyCatalogue({ operators: [op] }));
  assert.deepEqual(held.map(h => [h.key, h.action]), [['operator:char_9991_clstst', 'published-partial']]);
  assert.match(held[0].reason, /^Closure Test: costs Concentrated Power Unit, Electrode Unit, which data\/material-catalogue\.json does not have, so \/planner cannot hold or craft them/);
  // Potential tokens are not planner costs, so a token alone never trips it.
  const tokenOnly = Object.assign(structuredClone(operatorFixture.operator), { potential: { totalCost: [{ name: 'Nobody\'s Token', quantity: 5 }] } });
  assert.deepEqual(holds(emptyCatalogue({ operators: [tokenOnly] })), []);
  // Once the catalogue has them, nothing is held.
  assert.deepEqual(holds(emptyCatalogue({ operators: [op], materials: { order: [...fixtureMaterials.order, 'Concentrated Power Unit', 'Electrode Unit'] } })), []);
  // And without a catalogue at all the review refuses to run rather than hold everyone.
  assert.throws(() => reviewCompleteness({ ...emptyCatalogue({ operators: [op] }), materials: undefined }), /needs the material catalogue/);
});

test('a complete collaboration passes with nothing held back', () => {
  assert.deepEqual(reviewCompleteness(collaboration()), { errors: [], quarantine: [], allowed: [] });
});
test('a missing record or picture quarantines that one record and blocks nothing', () => {
  for (const [edit, key, action, reason] of [
    [(c: any) => { c.operators = []; }, 'operator:char_9990_test', 'omitted-new', /CN operator missing: char_9990_test/],
    [(c: any) => { delete c.operators[0].stats; }, 'operator:char_9990_test', 'published-partial', /Test Operator: missing stats/],
    [(c: any) => { c.assets.delete('six-star-icons/Test Operator - Base.webp'); }, 'operator:char_9990_test', 'published-partial', /missing asset six-star-icons\/Test Operator - Base\.webp/],
    [(c: any) => { c.skins = []; }, 'skin:char_9990_test@test#1', 'omitted-new', /CN outfit missing: char_9990_test@test#1/],
    [(c: any) => { c.skins[0].model = 'Nobody'; }, 'skin:char_9990_test@test#1', 'published-partial', /Outfit operator missing: Nobody/],
    [(c: any) => { c.events = []; }, 'event:act99side', 'omitted-new', /Discovered event missing: Test Event/],
    [(c: any) => { c.assets.delete('material-icons/Test Token.webp'); }, 'event:act99side', 'published-partial', /^Test Event: 1 reward icon not published: material-icons\/Test Token\.webp$/],
    [(c: any) => { c.banners = []; }, 'banner:LINKAGE_99_0_1', 'omitted-new', /Discovered banner missing: Test Banner/],
    [(c: any) => { c.banners[0].six_stars = ['Unknown Operator']; }, 'banner:LINKAGE_99_0_1', 'published-partial', /Banner operator missing: Test Banner \/ Unknown Operator/],
    [(c: any) => { c.assets.delete('headhunting-banner-images/Test Banner.webp'); }, 'banner:LINKAGE_99_0_1', 'published-partial', /Test Banner: missing asset headhunting-banner-images\/Test Banner\.webp/],
    // A banner the catalogue created from the client has no key art until the wiki's upload.
    [(c: any) => { c.banners[0].banner_image = null; }, 'banner:LINKAGE_99_0_1', 'published-partial', /Test Banner: no key art yet/],
    [(c: any) => { delete c.banners[0].cnPoolId; c.banners[0].globalPoolId = 'SINGLE_EN_99_0_1'; c.assets.delete('headhunting-banner-images/Test Banner.webp'); }, 'banner:SINGLE_EN_99_0_1', 'published-partial', /missing asset/],
    [(c: any) => { c.banners[0].banner_image = `https://raw.githubusercontent.com/arkpedia/arkpedia-image-assets/${'a'.repeat(40)}/headhunting-banner-images/Gone%20Banner.webp`; }, 'banner:LINKAGE_99_0_1', 'published-partial', /missing asset headhunting-banner-images\/Gone Banner\.webp/],
    [(c: any) => { c.assets.delete('event-poster/Test Event.webp'); }, 'event:act99side', 'published-partial', /Test Event: missing asset event-poster\/Test Event\.webp/],
    [(c: any) => { c.assets.delete('skill-icons/Test Operator - Test Skill.webp'); }, 'bundle:act99side', 'published-partial', /Test Event: missing asset skill-icons/],
  ] as const) {
    const catalogue = collaboration();
    edit(catalogue);
    const held = holds(catalogue);
    assert.ok(held.some(entry => entry.key === key && entry.action === action && reason.test(entry.reason)), `${key} ${action}: ${JSON.stringify(held)}`);
  }
  // A whole collaboration missing is held back record by record, and the bundle says so too.
  const empty = collaboration();
  Object.assign(empty, { operators: [], skins: [], events: [], banners: [] });
  assert.deepEqual([...new Set(holds(empty).map(entry => entry.key))].sort(),
    ['banner:LINKAGE_99_0_1', 'bundle:act99side', 'event:act99side', 'operator:char_9990_test', 'skin:char_9990_test@test#1']);
});
test('a dated operator whose published art has no palette is held, since the palette game leaves it out', () => {
  // Gallus², Rhodes Island Recon and Chestnut's Elite 2 art sat out of /games/color-palette
  // that way while nothing made palettes (lib/minigames/data.ts drops them without a word).
  const base = '/six-star-skins/Test Operator - Base.webp', elite = '/six-star-skins/Test Operator - Elite 2.webp';
  const palette = (edit: (c: any) => void) => { const c = collaboration(); edit(c); return holds(c).filter(entry => /palette/.test(entry.reason)); };
  const noBase = palette(c => { c.palettes = new Set(); });
  assert.deepEqual(noBase.map(entry => [entry.key, entry.action]), [['operator:char_9990_test', 'published-partial']]);
  assert.equal(noBase[0].reason, 'Test Operator: six-star-skins/Test Operator - Base.webp has no palette in data/color-palettes.json, so /games/color-palette leaves Test Operator out');
  // From 4 stars the Elite 2 art is played too, once it is published.
  const noElite = palette(c => { c.assets.add(elite.slice(1)); });
  assert.deepEqual(noElite.map(entry => entry.reason), ["Test Operator: six-star-skins/Test Operator - Elite 2.webp has no palette in data/color-palettes.json, so /games/color-palette leaves Test Operator's Elite 2 art out"]);
  assert.deepEqual(palette(c => { c.assets.add(elite.slice(1)); c.palettes.add(elite); }), []);
  // Art not published yet is the asset holds' business (and Amiya's forms never get Elite 2 art).
  assert.deepEqual(palette(c => { c.assets.delete(base.slice(1)); c.palettes = new Set(); }), []);
  // Below 4 stars there is no Elite 2 art to play.
  assert.deepEqual(palette(c => { c.operators[0].rarity = 3; c.assets.add('three-star-skins/Test Operator - Elite 2.webp'); c.assets.add('three-star-skins/Test Operator - Base.webp'); c.palettes = new Set(['/three-star-skins/Test Operator - Base.webp']); }), []);
  // The game plays dated operators only, released or not yet: an undated one waits for its date.
  const undated = (c: any) => { c.operators[0].isFuture = true; c.operators[0].characterInfo['Release Date'] = null; c.palettes = new Set(); };
  assert.deepEqual(palette(undated), []);
  assert.equal(palette(c => { undated(c); c.operators[0].releaseAt = '2027-01-01T03:00:00Z'; }).length, 1);
  assert.throws(() => reviewCompleteness({ ...collaboration(), palettes: undefined }), /needs the palette catalogue/);
});
test('an album whose release date is not written YYYY/MM/DD is held, and blocks nothing', () => {
  // Sorted as text, "October 8, 2025" ranked above every 2026 album in Recently added, and a
  // blank date left the album out of it. The album sync writes YYYY/MM/DD; this catches the rest.
  const album = (albumId: string, releaseDate: unknown) => ({ albumId, albumName: `专辑${albumId}`, albumAltName: `Album ${albumId}`, releaseDate });
  const held = holds(emptyCatalogue({ albums: [album('1', '2026/09/03'), album('2', 'October 8, 2025'), album('3', ''),
    album('4', '2026/02/30'), album('5', '2026-09-03'), album('6', undefined)] }));
  assert.deepEqual(held.map(entry => `${entry.key} ${entry.action}`),
    ['album:2 published-partial', 'album:3 published-partial', 'album:4 published-partial', 'album:5 published-partial', 'album:6 published-partial']);
  assert.equal(held[0].reason, 'Album 2: release date "October 8, 2025" is not written YYYY/MM/DD');
  assert.equal(held[1].reason, 'Album 3: no release date, so Recently added leaves it out');
  assert.equal(held[2].reason, 'Album 4: release date "2026/02/30" is not written YYYY/MM/DD');
});
test('malformed hand-written records and outfit identities still block the release', () => {
  const blocked = (edit: (c: any) => void) => { const c = collaboration(); edit(c); return reviewCompleteness(c).errors.join('\n'); };
  assert.match(blocked(c => { c.operators[0].potential.totalCost = [[{ name: 'Token', quantity: 5 }]]; }), /Test Operator: potential\.totalCost is not a flat/);
  assert.match(blocked(c => { Object.assign(c.operators[0], { sourceRegion: 'CN' }); c.operators[0].characterInfo['Release Date'] = null; }),
    /Test Operator: CN record has no release date and is not marked isFuture/);
  assert.match(blocked(c => { delete c.skins[0].skinId; }), /Outfit has no source identity: Test Operator \/ Test Outfit/);
  assert.match(blocked(c => { c.skins.push({ ...c.skins[0] }); }), /Duplicate outfit identity: char_9990_test@test#1/);
});
test('a collection that shrank by more than 2% since the loaded data blocks the release', () => {
  const baseline = { operators: 100, skins: 100, events: 100, banners: 100, enemies: 100, stages: 100 };
  assert.deepEqual(countDrops(baseline, { ...baseline, stages: 98, banners: 250 }), []);
  assert.deepEqual(countDrops(baseline, { ...baseline, stages: 97 }), ['stages shrank from 100 to 97 records (more than 2%) since the data this run loaded']);
  for (const name of Object.keys(baseline)) assert.equal(countDrops(baseline, { ...baseline, [name]: 0 }).length, 1, name);
  // Only through reviewCompleteness, and only when a baseline was recorded.
  const catalogue = { ...collaboration(), counts: { ...baseline, events: 50 } };
  assert.deepEqual(reviewCompleteness(catalogue).errors, []);
  assert.match(reviewCompleteness({ ...catalogue, baseline }).errors.join('\n'), /events shrank from 100 to 50/);
  // What the published site is built from, not only the records: the list and grid rows,
  // the maps, the voice lines, the songs, the recruitable pool, the planner's banners.
  for (const name of ['stageRows', 'enemyRows', 'stageContents', 'stageMaps', 'voiceOperators', 'songs', 'recruitment', 'pullBanners', 'deployOperators']) {
    assert.ok(COLLECTIONS.includes(name), name);
    assert.deepEqual(countDrops({ [name]: 1000 }, { [name]: 500 }), [`${name} shrank from 1000 to 500 records (more than 2%) since the data this run loaded`]);
  }
});
test('a shrink the maintainer names in allow_shrink goes through for that run, and still says so', () => {
  const baseline = { operators: 100, stageRows: 3800, stages: 4100 };
  const catalogue = { ...collaboration(), baseline, counts: { operators: 100, stageRows: 3000, stages: 4100 } };
  const blocked = reviewCompleteness(catalogue);
  assert.deepEqual(blocked.errors, ['stageRows shrank from 3800 to 3000 records (more than 2%) since the data this run loaded',
    'If that shrink is intended (records removed on purpose), run Prepare content release by hand with allow_shrink=stageRows; it lets them through for that run only. Otherwise find the stage that lost them.']);
  const through = reviewCompleteness({ ...catalogue, allowShrink: ['stageRows'] });
  assert.deepEqual(through.errors, []);
  assert.deepEqual(through.allowed, ['stageRows shrank from 3800 to 3000 records (more than 2%) since the data this run loaded; allowed for this run by allow_shrink']);
  // Only the collection named: another one that shrank still blocks.
  assert.match(reviewCompleteness({ ...catalogue, counts: { ...catalogue.counts, operators: 50 }, allowShrink: ['stageRows'] }).errors[0], /^operators shrank from 100 to 50/);
  // A name that is no collection is a mistake to hear about, not a silent no-op.
  assert.match(reviewCompleteness({ ...catalogue, allowShrink: ['stageRow'] }).errors[0], /^allow_shrink names no collection: stageRow \(the collections: operators, /);
  assert.deepEqual(parseAllowShrink(' stageRows, songs  enemies,'), ['stageRows', 'songs', 'enemies']);
  assert.deepEqual(parseAllowShrink(undefined), []);
});
test('every step of the release job that runs the gate hears allow_shrink, and only a dispatch can set it', () => {
  const workflow = fs.readFileSync('.github/workflows/prepare-content.yml', 'utf8');
  assert.match(workflow, /\n {4}inputs:\n[\s\S]*\n {6}allow_shrink:\n {8}description: [^\n]+\n {8}default: ''\n {8}type: string\n/);
  const steps = workflow.slice(workflow.indexOf('\n    steps:\n')).split(/\n {6}- (?=name:|uses:|run:)/)
    .filter(step => /node scripts\/content\/check-completeness\.mjs(?! --record-baseline)/.test(step));
  assert.equal(steps.length, 2, 'the refresh (as its completeness stage) and the compile step');
  for (const step of steps) assert.match(step, /\n {10}ARKPEDIA_ALLOW_SHRINK: \$\{\{ inputs\.allow_shrink \}\}\n/, step.split('\n')[0]);
});
test('quarantine entries follow the shared file format and keep their first day', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'arkpedia-quarantine-'));
  try {
    const file = path.join(root, 'data/quarantine.json');
    fs.mkdirSync(path.dirname(file));
    // Another stage's entries, which this stage must leave exactly as they are.
    const catalogue = { key: 'banner:SINGLE_77_0_1', stage: 'catalogue', reason: 'unknown operator', action: 'omitted-new', sourceRef: 'https://example.invalid/row', firstSeen: '2026-09-01' };
    // As written before 2026-09, with the lastSeen no writer keeps any more.
    fs.writeFileSync(file, JSON.stringify({ version: 1, entries: [{ ...catalogue, lastSeen: '2026-09-02' }] }));
    writeQuarantine(root, 'completeness', [
      { key: 'operator:b', action: 'published-partial', reason: 'B: missing asset one' },
      { key: 'operator:a', action: 'omitted-new', reason: 'CN operator missing: a' },
      { key: 'operator:b', action: 'published-partial', reason: 'B: missing asset two' },
    ], new Date('2026-09-20T23:59:00Z'));
    writeQuarantine(root, 'completeness', [
      { key: 'operator:b', action: 'published-partial', reason: 'B: missing asset two' },
      { key: 'enemy:c', action: 'published-partial', reason: 'C: icon not published yet' },
    ], new Date('2026-09-22T00:01:00Z'));
    const text = fs.readFileSync(file, 'utf8');
    assert.ok(text.endsWith('}\n') && text.includes('\n  "entries": ['), 'two-space JSON with a trailing newline');
    assert.deepEqual(JSON.parse(text), { version: 1, entries: [
      catalogue,
      { key: 'enemy:c', stage: 'completeness', reason: 'C: icon not published yet', action: 'published-partial', firstSeen: '2026-09-22' },
      { key: 'operator:b', stage: 'completeness', reason: 'B: missing asset two', action: 'published-partial', firstSeen: '2026-09-20' },
    ] });
    // The same holds a day later write the same bytes: the file is a release input.
    writeQuarantine(root, 'completeness', [
      { key: 'operator:b', action: 'published-partial', reason: 'B: missing asset two' },
      { key: 'enemy:c', action: 'published-partial', reason: 'C: icon not published yet' },
    ], new Date('2026-09-23T00:01:00Z'));
    assert.equal(fs.readFileSync(file, 'utf8'), text);
    writeQuarantine(root, 'completeness', [], new Date('2026-09-24T00:00:00Z'));
    assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')).entries, [catalogue]);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
/* A data tree holding only what the enemy checks read: a listed stage fielding two
   enemies, and an unlisted stage fielding a third that nothing needs. `edit` takes away
   whatever a case is about before the release gate runs on the tree; `baseline` records
   the counts the release job takes right after loading the data, before the edit; `omit` names
   files the loaded data does not have. */
function enemyGate(edit: (tree: { records: { slug: string; name: string; icon: string }[]; index: string[]; icons: string[] }) => void, baseline = false, env: Record<string, string> = {}, omit: string[] = []) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'arkpedia-completeness-'));
  try {
    const tree = {
      records: [{ slug: 'slug-a', name: 'Slug A', icon: '/enemies-icons/Slug A.webp' }, { slug: 'slug-b', name: 'Slug B', icon: '/enemies-icons/Slug B.webp' }],
      index: ['slug-a', 'slug-b'],
      icons: ['enemies-icons/Slug A.webp', 'enemies-icons/Slug B.webp'],
    };
    const write = (file: string, data: unknown) => {
      if (omit.includes(file)) return;
      fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
      fs.writeFileSync(path.join(root, file), JSON.stringify(data));
    };
    const { ARKPEDIA_ALLOW_SHRINK: _, GITHUB_ACTIONS: __, ...inherited } = process.env;
    const gate = (...args: string[]) => spawnSync(process.execPath, ['scripts/content/check-completeness.mjs', root, ...args], { encoding: 'utf8', env: { ...inherited, ...env } });
    const writeTree = () => {
      write('data/assets/external-asset-index.json', { files: tree.icons });
      write('data/enemies/Test Event.json', { enemies: tree.records });
      write('public/enemies-index.json', tree.index.map(slug => ({ slug })));
    };
    for (const file of ['data/skins.json', 'data/headhunting_banners.json', 'data/content-bundles.json', 'data/events/events_2026.json']) write(file, []);
    write('data/event-stores.json', { events: {} });
    write('data/event-rewards.json', { events: {} });
    write('data/content-inventory.json', { operators: [], skins: [] });
    write('data/skin-availability-windows.json', { entries: [] });
    write('data/material-catalogue.json', { version: 1, order: ['EXP'], groups: [], items: {} });
    write('data/color-palettes.json', { version: 2, artworks: {}, unavailable: [] });
    write('data/stages/test-1.json', { slug: 'test-1', enemies: { by_rank: { normal: [{ slug: 'slug-a' }] }, conditional: { by_rank: { elite: [{ slug: 'slug-b' }] } } } });
    write('data/stages/unlisted.json', { slug: 'unlisted', enemies: { by_rank: { normal: [{ slug: 'slug-unlisted' }] } } });
    write('public/stages-index.json', [{ slug: 'test-1' }]);
    writeTree();
    if (baseline) assert.equal(gate('--record-baseline').status, 0);
    edit(tree);
    writeTree();
    const run = gate('--now', '2026-09-20');
    const quarantine = path.join(root, 'data/quarantine.json');
    return { status: run.status, output: run.stdout + run.stderr,
      held: fs.existsSync(quarantine) ? JSON.parse(fs.readFileSync(quarantine, 'utf8')).entries : null };
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}
test('the baseline is recorded on loaded data the event stages have not written yet, and the review still needs it', () => {
  // A dev run loads data main, which has no event-stores.json or event-rewards.json until a run of
  // this code has published them; the baseline step (asserted inside enemyGate) must not stop it.
  const run = enemyGate(() => {}, true, {}, ['data/event-stores.json', 'data/event-rewards.json']);
  assert.notEqual(run.status, 0);
  assert.match(run.output, /needs the event stores \(data\/event-stores\.json\)/);
});

test('a stage enemy with no record, grid row or icon is quarantined, and the release still goes out', () => {
  const complete = enemyGate(() => {});
  assert.equal(complete.status, 0, complete.output);
  assert.match(complete.output, /and 2 stage enemies/);
  assert.doesNotMatch(complete.output, /not published yet|quarantined/);
  // Nothing to hold, in a tree with no quarantine file: none is started (the file belongs to arkpedia-data).
  assert.equal(complete.held, null);
  // A new enemy whose icon the image sync has not published yet: the sync finds new icons
  // in the published records, so withholding the record would deadlock.
  const iconless = enemyGate(tree => { tree.icons = ['enemies-icons/Slug A.webp']; });
  assert.equal(iconless.status, 0, iconless.output);
  assert.match(iconless.output, /1 enemy icon\(s\) not published yet.*\n {2}enemies-icons\/Slug B\.webp\n/);
  assert.deepEqual(iconless.held, [{ key: 'enemy:slug-b', stage: 'completeness', reason: 'Slug B: icon enemies-icons/Slug B.webp not published yet',
    action: 'published-partial', firstSeen: '2026-09-20' }]);
  // With no record or no grid row only its stage links 404: the stage is published, the
  // enemy is named in the quarantine, and nothing else is held back.
  const unrecorded = enemyGate(tree => { tree.records = tree.records.filter(record => record.slug !== 'slug-b'); });
  assert.equal(unrecorded.status, 0, unrecorded.output);
  assert.match(unrecorded.output, /enemy:slug-b \(published-partial\): Stage enemy has no record: slug-b \(fielded in test-1\)/);
  assert.deepEqual(unrecorded.held.map((entry: Hold) => entry.key), ['enemy:slug-b']);
  const unindexed = enemyGate(tree => { tree.index = ['slug-b']; });
  assert.equal(unindexed.status, 0, unindexed.output);
  assert.match(unindexed.held[0].reason, /Stage enemy missing from enemies-index\.json: slug-a \(fielded in test-1\)/);
});
test('the release gate blocks a collection that lost records since the data was loaded', () => {
  // Half of the enemy records gone: far more than one late record, so it is not quarantined.
  const shrunk = enemyGate(tree => { tree.records = tree.records.slice(0, 1); }, true);
  assert.equal(shrunk.status, 1, shrunk.output);
  assert.match(shrunk.output, /Content publication blocked:\n- enemies shrank from 2 to 1 records/);
  // The quarantine is still written, so the day's issue names the enemy too.
  assert.deepEqual(shrunk.held.map((entry: Hold) => entry.key), ['enemy:slug-b']);
  // The grid losing its rows is a drop too, whatever the records say.
  const gridless = enemyGate(tree => { tree.index = []; }, true);
  assert.equal(gridless.status, 1, gridless.output);
  assert.match(gridless.output, /- enemyRows shrank from 2 to 0 records/);
  assert.match(gridless.output, /run Prepare content release by hand with allow_shrink=enemyRows/);
  const unchanged = enemyGate(() => {}, true);
  assert.equal(unchanged.status, 0, unchanged.output);
  assert.match(unchanged.output, /no collection shrank by more than 2% \(operators 0\u21920, skins 0\u21920, events 0\u21920, banners 0\u21920, enemies 2\u21922, stages 2\u21922, stageRows 1\u21921, enemyRows 2\u21922, stageContents 0\u21920, /);
  // Named in allow_shrink, the same shrink goes out, with a warning in the log and on the run.
  const allowed = enemyGate(tree => { tree.records = tree.records.slice(0, 1); }, true, { ARKPEDIA_ALLOW_SHRINK: 'enemies', GITHUB_ACTIONS: 'true' });
  assert.equal(allowed.status, 0, allowed.output);
  assert.match(allowed.output, /::warning title=Collection allowed to shrink::enemies shrank from 2 to 1 records \(more than 2%\) since the data this run loaded; allowed for this run by allow_shrink/);
  assert.match(allowed.output, /no collection shrank by more than 2% but the ones allow_shrink names/);
});
test('unpublished enemy icons are listed once each and in order, and never count as errors', () => {
  const icon = (name: string) => `/enemies-icons/${name}.webp`;
  const enemyRecords = new Map([['b', { name: 'B', icon: icon('B') }], ['b-elite', { name: 'B', icon: icon('B') }],
    ['a', { name: 'A', icon: icon('A') }], ['no-icon', { name: 'No icon yet' }], ['published', { name: 'P', icon: icon('P') }]]);
  const catalogue = emptyCatalogue({ stageEnemies: new Map([...enemyRecords.keys()].map(slug => [slug, 'test-1'])), enemyRecords,
    enemyIndex: new Set(enemyRecords.keys()), assets: new Set(['enemies-icons/P.webp']) });
  assert.deepEqual(missingEnemyIcons(catalogue), ['enemies-icons/A.webp', 'enemies-icons/B.webp']);
  assert.deepEqual(holds(catalogue).map(entry => entry.key), ['enemy:a', 'enemy:b', 'enemy:b-elite']);
  // checkCompleteness still lists every gap, blocking or not, one message each.
  assert.equal(checkCompleteness(catalogue).length, 3);
});
// Surtr's cost lists, frozen in a fixture: the live record may change with any refresh.
const costRecord = () => structuredClone(operatorFixture.operator);
const withOperator = (edit: (op: any) => void, op: any = costRecord()) => {
  edit(op);
  return checkCompleteness(emptyCatalogue({ operators: [op] })).join('\n');
};
test('publication rejects nested or malformed material cost lists', () => {
  assert.equal(withOperator(() => {}), '');
  // The hand-written Persona shape that crashed the image sync.
  assert.match(withOperator(op => { op.potential.totalCost = [[{ name: "Surtr's Token", quantity: 5 }]]; }),
    /Surtr: potential\.totalCost is not a flat/);
  for (const [edit, expected] of [
    [(op: any) => { op.promotion[0].cost = [op.promotion[0].cost]; }, /Surtr: promotion\[0\]\.cost is not a flat/],
    [(op: any) => { op.skills.skillCost['2'] = [op.skills.skillCost['2']]; }, /Surtr: skillCost\.2 is not a flat/],
    [(op: any) => { op.skills.skillList[0].cost.m1 = [op.skills.skillList[0].cost.m1]; }, /Surtr: skills\[0\]\.cost\.m1 is not a flat/],
    [(op: any) => { op.modules[1].stages[0].cost = [op.modules[1].stages[0].cost]; }, /Surtr: modules\[1\]\.stages\[0\]\.cost is not a flat/],
    [(op: any) => { op.potential.totalCost = { name: "Surtr's Token", quantity: 5 }; }, /Surtr: potential\.totalCost is not a flat/],
    [(op: any) => { op.potential.totalCost = [{ name: "Surtr's Token", quantity: '5' }]; }, /Surtr: potential\.totalCost is not a flat/],
  ] as const) assert.match(withOperator(edit), expected);
  assert.equal(withOperator(op => { op.potential.totalCost = []; }), '');
});
test('a CN record without a release date must be marked as future', () => {
  // A made-up CN-only record, so the case does not end when a real one reaches Global.
  const cnRecord = () => Object.assign(costRecord(), { name: 'Unreleased CN operator', internalName: 'char_9999_cnonly', sourceRegion: 'CN', isFuture: true });
  const withCnRecord = (edit: (op: any) => void) => withOperator(edit, cnRecord());
  const released = /Unreleased CN operator: CN record has no release date and is not marked isFuture/;
  assert.match(withCnRecord(op => { delete op.isFuture; op.characterInfo['Release Date'] = null; }), released);
  assert.match(withCnRecord(op => { op.isFuture = false; op.characterInfo['Release Date'] = ''; }), released);
  assert.match(withCnRecord(op => { delete op.isFuture; op.characterInfo['Release Date'] = 'TBA'; }), released);
  assert.equal(withCnRecord(op => { op.isFuture = true; op.characterInfo['Release Date'] = null; }), '');
  // A dated record follows its date. Once Global launches it reads as released even
  // while the EN mirror still lags, so the guard must not block that release.
  assert.equal(withCnRecord(op => { delete op.isFuture; op.characterInfo['Release Date'] = '2026/09/01'; }), '');
  assert.equal(withCnRecord(op => { delete op.isFuture; delete op.sourceRegion; op.characterInfo['Release Date'] = null; }), '');
});
test('a released operator without its Standard and Kernel Headhunting fields is held: no banner pool can have it', () => {
  // The fields cannot be inferred from a release: 45 6★ are rightly in neither pool.
  assert.match(withOperator(op => { op.howToObtain = null; }), /^Surtr: released on Global, but its record has no Standard Headhunting or Kernel Headhunting field \("Yes" or "No" under howToObtain\)/);
  assert.match(withOperator(op => { delete op.howToObtain['Kernel Headhunting']; }), /^Surtr: released on Global, but its record has no Kernel Headhunting field/);
  // Not on Global yet: a CN-only record (Clementia, Homebound and de Toledo have none), or a Global day still ahead.
  assert.equal(withOperator(op => { op.howToObtain = null; Object.assign(op, { sourceRegion: 'CN', isFuture: true }); op.characterInfo['Release Date'] = null; }), '');
  assert.equal(withOperator(op => { op.howToObtain = null; op.characterInfo['Release Date'] = '2026/12/01'; }), '');
});
test('the official Kernel pool lists reach the completeness stage: a record they contradict is held, and the release still goes out', () => {
  // Post 4814's permit range lists Surtr among every 6★ in Kernel Headhunting on 2026-10-09.
  const post = JSON.parse(fs.readFileSync('scripts/tests/fixtures/official-news/4814.json', 'utf8'));
  const standard = costRecord();
  standard.howToObtain = { ...standard.howToObtain, 'Standard Headhunting': 'Yes', 'Kernel Headhunting': 'No' };
  const { errors, quarantine } = reviewCompleteness(emptyCatalogue({ operators: [standard], officialNews: [post] }));
  assert.deepEqual(errors, []);
  const surtr = (quarantine as Hold[]).filter(hold => hold.key === 'operator:char_350_surtr');
  // Once for the permit's range and once for Kernel Locating #13, which the same post announces.
  assert.deepEqual(surtr.map(hold => [hold.action, /^Surtr: the (.+?) in https:\/\/www\.arknights\.global\/news\/4814 has it in Kernel Headhunting by (\S+), but its record says Standard Headhunting "Yes" and Kernel Headhunting "No"/.exec(hold.reason)?.slice(1)]),
    [['published-partial', ['Top Operator Transfer Permit - Kernel range', '2026/10/09']], ['published-partial', ['Kernel Locating opening 2026/10/20', '2026/10/20']]]);
  // As recorded (kernel-exclusive since 2024/12/17), Surtr passes.
  assert.deepEqual((reviewCompleteness(emptyCatalogue({ operators: [costRecord()], officialNews: [post] })).quarantine as Hold[]).filter(hold => hold.key.startsWith('operator:')), []);
});
test('the release-date guard makes the same call as the site', () => {
  const edges = [null, '', '  ', 'TBA', '2026/10/04', '2026-2-30', '2026/13/01', 'October 4, 2026']
    .map(date => ({ characterInfo: { 'Release Date': date } }));
  const exact = ['2026-10-14T03:00:00Z', '2026-10-14T10:00:00+08:00', '2026-10-14T03:00:00', 'soon']
    .map(releaseAt => ({ releaseAt, characterInfo: { 'Release Date': null } }));
  for (const op of [operatorFixture.operator, ...edges, ...exact, { characterInfo: null }] as any[]) {
    assert.equal(hasRecordedRelease(op), operatorRelease(op) !== null, JSON.stringify({ releaseAt: op.releaseAt, date: op.characterInfo?.['Release Date'] }));
    assert.equal(recordedRelease(op), operatorRelease(op)?.at ?? null, JSON.stringify({ releaseAt: op.releaseAt, date: op.characterInfo?.['Release Date'] }));
  }
});
test('home farming is limited to battle windows, independently of shop closing times', () => {
  const materials = getEventFarmingMaterials(farmingFixture.drops);
  const now = Date.parse('2026-09-22T12:00:00Z');
  const pairs = activeEventFarming(materials, now).map(m => [m.name, m.stages.map(s => s.label).join(',')]);
  assert.deepEqual(pairs.sort(), [['Aketon', 'PA-7'], ['Crystalline Component', 'PA-8'], ['Sugar Pack', 'PA-6']]);
  const sample = materials.flatMap(m => m.stages.map(s => ({ ...m, stages: [s] }))).find(m => m.stages[0].label === 'PA-6')!;
  const { startAt, endAt } = sample.stages[0];
  assert.equal(activeEventFarming([sample], Date.parse(startAt!) - 1).length, 0);
  assert.equal(activeEventFarming([sample], Date.parse(startAt!)).length, 1);
  assert.equal(activeEventFarming([sample], Date.parse(endAt!) - 1).length, 1);
  assert.equal(activeEventFarming([sample], Date.parse(endAt!)).length, 0);
});
test('farming importer ignores shop currency, first clears, CN guesses and non-repeatable stages', () => {
  const stage = { stageType: 'ACTIVITY', difficulty: 'NORMAL', canBattleReplay: true, code: 'TEST-8',
    stageDropInfo: { displayRewards: [{ type: 'MATERIAL', id: 'material', dropType: 'NORMAL' },
      { type: 'MATERIAL', id: 'first', dropType: 'COMPLETE' }, { type: 'ACTIVITY_ITEM', id: 'currency', dropType: 'NORMAL' }] } };
  const items = { items: Object.fromEntries(['material', 'first', 'currency'].map(id => [id, { name: id, rarity: 'TIER_3', classifyType: 'MATERIAL' }])) };
  const tables = { stages: { valid: stage, unknown: stage, firstOnly: { ...stage, canBattleReplay: false } },
    stageValidInfo: { valid: { startTs: 100, endTs: 200 }, firstOnly: { startTs: 100, endTs: 200 } } };
  assert.deepEqual(buildEventFarming(tables, items), [{ stageId: 'valid', stage: 'TEST-8', itemId: 'material', material: 'material', startAt: '1970-01-01T00:01:40.000Z', endAt: '1970-01-01T00:03:21.000Z' }]);
});

test('a new runtime CN record can use published portrait art without a website rebuild',()=>{
  assert.equal(getOperatorIconPath({name:'Future imported operator',rarity:6}),'/six-star-icons/Future%20imported%20operator%20-%20Base.webp');
  // The server marks a record whose portrait the release's asset index lacks; the browser
  // shows the image repository's placeholder, never a path with no file behind it.
  assert.equal(getOperatorIconPath({name:'Unverified placeholder',rarity:6,portraitPending:true}),OPERATOR_PORTRAIT_PLACEHOLDER);
});

test('a released operator\'s missing skill icon is the icon coverage audit\'s hold, not a second one here', () => {
  // check-icon-coverage.ts holds it (stage 'icons', isOperatorReleased, the pages' path rules);
  // a second 'operator:<id>' entry here once came with its own path rule and its own release test.
  const op = Object.assign(structuredClone(operatorFixture.operator), { name: 'Icon Test', internalName: 'char_9992_icon',
    baseSkills: [{ name: 'Pharmacology α', facility: 'Workshop', eliteLevel: 'Base', description: 'x' }] });
  assert.deepEqual(holds(emptyCatalogue({ operators: [op] })).filter(h => /skill-icons/.test(h.reason)), []);
});

test('a Joint Operation or an Orienteering Global does not have yet holds no CN lineup or art while Global confirmation is pending', () => {
  const banner = (extra: object) => ({ name: 'Orienteering #8', pull_type: 'orienteering', cnPoolId: 'SPECIAL_77_0_4', six_stars: ['Unknown Operator'], banner_image: '/headhunting-banner-images/Orienteering 8.webp', ...extra });
  const keys = (extra: object) => {
    const catalogue = collaboration();
    (catalogue as any).banners.push(banner(extra));
    return holds(catalogue).filter(entry => entry.key === 'banner:SPECIAL_77_0_4').map(entry => entry.reason);
  };
  // Its art is Global's upload only, and its lineup is not shown: neither is held.
  assert.deepEqual(keys({}), []);
  assert.deepEqual(keys({ global_date: '2026/10/18–2026/11/01' }), [], 'a forecast Global date is not Global\'s');
  // Once Global's client carries it, it is a banner like any other.
  assert.equal(keys({ globalPoolId: 'SPECIAL_EN_42_0_1' }).length, 2);
});

test('/schedule\'s table sanitizes forecast lineups and its event panel requires Global confirmation', () => {
  const source = fs.readFileSync('pages/schedule.tsx', 'utf8');
  assert.match(source, /headhunting_banners: async \(\) => \(\(await import\('@\/data\/headhunting_banners\.json'\)\)\.default as HeadhuntingBanner\[\]\)\.map\(globalBannerPreview\)/);
  assert.match(source, /getBannerForEvent\(displayEvent\.name, confirmedGlobalRange\(displayEvent\.global\), banners\.filter\(\(banner\) => !waitsForGlobal\(banner\)\)\)/);
});
