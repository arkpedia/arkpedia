/*
 * The art the release job's importers fetch: staged under .cache/, published by the staged-art
 * stage (scripts/sync/publish-catalogue-assets.sh --staged) into arkpedia-image-assets, and
 * adopted by the same importers in the same run. Before this, six importers staged art on a
 * runner that was then thrown away, and a person recreated every file by hand -- or nobody
 * did: all 27 stages of People, A People had no map preview two weeks into the event.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
// @ts-expect-error Node import scripts are plain JavaScript.
import { planRenders, renderCandidates } from '../imports/import-stage-renders.mjs';
// @ts-expect-error Node publication scripts are plain JavaScript.
import { adoptions, adoptStagedArt, unadopted } from '../sync/adopt-staged-art.mjs';
// @ts-expect-error Node publication scripts are plain JavaScript.
import { reviewCompleteness, stageMapRows } from '../content/check-completeness.mjs';
import { emptyCatalogue } from './fixtures/catalogue';
import { refreshScripts, refreshStages } from './fixtures/refresh-stages';

const REPO = process.cwd();
const REGISTRY = JSON.parse(fs.readFileSync('config/staged-art.json', 'utf8')).kinds as Record<string, { stage: string; folders: string[]; adopt: string[] }>;
const PIN = '7'.repeat(40);

/** A solid PNG, written here so no case needs an image library. */
function png(width: number, height: number, rgba: [number, number, number, number] = [40, 60, 80, 255]) {
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
    const out = Buffer.alloc(8 + data.length + 4);
    out.writeUInt32BE(data.length, 0);
    body.copy(out, 4);
    out.writeUInt32BE(zlib.crc32(body) >>> 0, 8 + data.length);
    return out;
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 6;
  const row = Buffer.concat([Buffer.from([0]), ...Array.from({ length: width }, () => Buffer.from(rgba))]);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', header),
    chunk('IDAT', zlib.deflateSync(Buffer.concat(Array.from({ length: height }, () => row)))), chunk('IEND', Buffer.alloc(0))]);
}
const gitBlob = (data: Buffer) => execFileSync('git', ['hash-object', '--stdin'], { input: data }).toString().trim();
const write = (root: string, file: string, value: unknown) => {
  fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
  fs.writeFileSync(path.join(root, file), typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value));
};
const readJson = (root: string, file: string) => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
const held = (root: string, stage: string) => (readJson(root, 'data/quarantine.json').entries as { key: string; stage: string }[])
  .filter(entry => entry.stage === stage).map(entry => entry.key);
function temporary(run: (root: string) => void) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'arkpedia-staged-art-')));
  try { run(root); } finally { fs.rmSync(root, { recursive: true, force: true }); }
}

/* ---- the registry --------------------------------------------------------------- */

// .cache/ folders the refresh uses for anything but art on its way to the image repository.
const NOT_ART = new Set(['upstream', 'catalogue', 'staged-art', 'new-songs', 'stage-snapshot', 'refresh-fingerprint', 'prepared-inputs', 'content-baseline', 'arkgraph-mapping']);

test('every refresh script that stages art under .cache/ stages a kind the staged-art stage publishes', () => {
  const scripts = refreshScripts();
  assert.ok(scripts.includes('scripts/imports/staged_art.py') && scripts.includes('scripts/sync/adopt-staged-art.mjs'), 'the walk reaches the staging helpers');
  const found = new Set<string>();
  for (const file of scripts) {
    const text = fs.readFileSync(file, 'utf8');
    for (const [, name] of text.matchAll(/\.cache(?:['"]\s*,\s*['"]|\/)([a-z][a-z-]*)/g)) {
      if (NOT_ART.has(name)) continue;
      assert.ok(REGISTRY[name], `${file} uses .cache/${name}/, which config/staged-art.json does not list: art staged there is never published, and a person recreates every file. Register the kind there, or, if it holds no art, add it to NOT_ART in this test`);
      if (file.startsWith('scripts/imports/') || file.startsWith('scripts/sync/sync-')) {
        assert.match(text, new RegExp(`(?:Staging|beginStaging)\\('${name}'`), `${file} stages ${name} without scripts/imports/staged_art.py or scripts/lib/staged-art.mjs, so the stage has no list of what to publish`);
        found.add(name);
      }
    }
  }
  assert.deepEqual([...found].sort(), Object.keys(REGISTRY).sort(), 'every registered kind is staged by a refresh script');
});

test('the staged-art stage runs after every stage that stages art, and each kind adopts by rerunning its own stage', () => {
  const stages = refreshStages();
  const order = stages.map(stage => stage.name);
  const npm = JSON.parse(fs.readFileSync('package.json', 'utf8')).scripts as Record<string, string>;
  const publisher = stages.find(stage => stage.name === 'staged-art');
  assert.equal(publisher?.command, 'bash scripts/sync/publish-catalogue-assets.sh --staged');
  assert.deepEqual(publisher.needs, [], 'a failed importer holds back only its own kind, by the stage report');
  for (const [kind, spec] of Object.entries(REGISTRY)) {
    const stage = stages.find(entry => entry.name === spec.stage);
    assert.ok(stage, `${kind}: ${spec.stage} is a refresh stage`);
    assert.ok(order.indexOf(spec.stage) < order.indexOf('staged-art'), `${kind}: ${spec.stage} stages art before staged-art publishes it`);
    const script = spec.adopt.find(word => word.startsWith('scripts/'));
    const command = stage.command.replace(/npm run ([\w:-]+)/g, (_, name) => npm[name] ?? name);
    assert.ok(script && command.includes(script), `${kind} adopts with ${spec.adopt.join(' ')}, the script its stage runs (${stage.command})`);
  }
});

test('every folder a kind stages into is one the publisher sizes and the site routes to the image repository', () => {
  const folders = JSON.parse(execFileSync('python3', ['-c', [
    'import importlib.util, json, sys',
    "spec = importlib.util.spec_from_file_location('p', 'scripts/sync/publish-catalogue-assets.py')",
    'p = importlib.util.module_from_spec(spec); spec.loader.exec_module(p)',
    'print(json.dumps(sorted(p.FOLDERS)))'].join('\n')], { encoding: 'utf8' }));
  const routed = JSON.parse(fs.readFileSync('config/asset-folders.json', 'utf8'))['arkpedia-image-assets'];
  for (const [kind, spec] of Object.entries(REGISTRY)) {
    for (const folder of spec.folders) {
      assert.ok(folders.includes(folder), `${kind} stages into ${folder}/, which publish-catalogue-assets.py has no size for`);
      assert.ok(routed.includes(folder), `${kind} stages into ${folder}/, which config/asset-folders.json does not map to arkpedia-image-assets`);
    }
  }
});

test('the adopt pass reruns each kind with anything published once, in the registry order, and refuses an unknown kind', () => {
  assert.deepEqual(adoptions({ files: { 'album-covers/A_cover.webp': 'album-covers', 'stages-images/pa-1.webp': 'stage-renders', 'stages-images/pa-2.webp': 'stage-renders' } }),
    [{ kind: 'stage-renders', files: 2, command: REGISTRY['stage-renders'].adopt }, { kind: 'album-covers', files: 1, command: REGISTRY['album-covers'].adopt }]);
  assert.deepEqual(adoptions({ files: {} }), []);
  assert.throws(() => adoptions({ files: { 'stages-images/x.webp': 'wiki-scrape' } }), /not a staged art kind/);
});

test('nothing is adopted while the adopted revisions lack a file this run published', () => {
  temporary(root => {
    write(root, 'data/assets/external-asset-index.json', { files: ['stages-images/pa-1.webp'] });
    write(root, 'data/quarantine.json', { version: 1, entries: [] });
    const published = { files: { 'stages-images/pa-1.webp': 'stage-renders', 'stages-images/pa-2.webp': 'stage-renders' } };
    write(root, 'published.json', published);
    assert.deepEqual(unadopted(published, root), ['stages-images/pa-2.webp']);
    const ran: string[][] = [];
    const run = (command: string, args: string[]) => { ran.push([command, ...args]); return { status: 0 }; };
    assert.throws(() => adoptStagedArt(path.join(root, 'published.json'), { root, run, log: () => {} }),
      /do not include 1 file\(s\) this run published \(stages-images\/pa-2\.webp\); nothing is adopted/);
    assert.deepEqual(ran, [], 'no importer runs against revisions without its files');
    const check = spawnSync('node', [path.join(REPO, 'scripts/sync/adopt-staged-art.mjs'), '--check', 'published.json'], { cwd: root, encoding: 'utf8' });
    assert.equal(check.status, 1);
    assert.match(check.stderr, /not in the adopted revisions yet: stages-images\/pa-2\.webp/);
    write(root, 'data/assets/external-asset-index.json', { files: ['stages-images/pa-1.webp', 'stages-images/pa-2.webp'] });
    assert.equal(spawnSync('node', [path.join(REPO, 'scripts/sync/adopt-staged-art.mjs'), '--check', 'published.json'], { cwd: root }).status, 0);
    adoptStagedArt(path.join(root, 'published.json'), { root, run, log: () => {} });
    assert.deepEqual(ran, [REGISTRY['stage-renders'].adopt]);
  });
});

/* ---- stage renders -------------------------------------------------------------- */

const STAGES = {
  'main_01-01': { code: '1-1', levelId: 'Obt/Main/level_main_01-01', difficulty: 'NORMAL' },
  'main_01-01#f#': { code: '1-1', levelId: 'Obt/Main/level_main_01-01', difficulty: 'FOUR_STAR' },
  act99side_01: { code: 'ZZ-1', levelId: 'Activities/ACT99side/level_act99side_01', difficulty: 'NORMAL' },
  'act99side_01#f#': { code: 'ZZ-1', levelId: 'Activities/ACT99side/level_act99side_01', difficulty: 'FOUR_STAR' },
  act99side_02: { code: 'ZZ-2', levelId: 'Activities/ACT99side/level_act99side_02_b', difficulty: 'NORMAL' },
  act99side_03: { code: 'ZZ-3', levelId: 'Activities/ACT99side/level_act99side_03', difficulty: 'NORMAL' },
  act99side_04: { code: 'ZZ-4', levelId: 'Activities/ACT99side/level_act99side_04', difficulty: 'NORMAL' },
  act99side_05: { code: 'ZZ-5', levelId: 'Activities/ACT99side/level_act99side_05', difficulty: 'NORMAL' },
};
const RECORDS = [
  ['1-1', 'main_01-01'], ['1-1_challenge_mode', 'main_01-01#f#'], ['zz-1', 'act99side_01'], ['zz-1_challenge_mode', 'act99side_01#f#'],
  ['zz-2', 'act99side_02'], ['zz-3', 'act99side_03'], ['zz-4', 'act99side_04'], ['zz-5', 'act99side_05'],
].map(([slug, id]) => ({ slug, id, code: STAGES[id as keyof typeof STAGES].code, preview: slug === 'zz-5' ? 'images/stages/hand-picked.png' : null,
  geometry: slug, content: { kind: 'event', id: 'act99side', name: 'Test Event' } }));

test('a render is looked for under the canonical stage, the other forms, the level name and the level name with _1', () => {
  assert.deepEqual(renderCandidates('act99side_02', ['act99side_02', 'act99side_02#f#'], STAGES),
    ['act99side_02.png', 'act99side_02_b.png', 'act99side_02_b_1.png']);
});

test('stage renders: a published render reaches every form of its layout, the rest are staged from map/ with their provenance, and publishing clears them', () => {
  temporary(root => {
    write(root, 'en/excel/stage_table.json', { stages: STAGES });
    for (const record of RECORDS) write(root, `data/stages/${record.slug}.json`, record);
    write(root, 'data/assets/external-asset-index.json', { files: ['stages-images/1-1.webp'] });
    const renders = { 'act99side_01.png': png(320, 180), 'act99side_02_b.png': png(320, 180, [1, 2, 3, 255]), 'act99side_03_1.png': png(320, 180, [9, 9, 9, 255]) };
    for (const [name, data] of Object.entries(renders)) write(root, `cn/map/${name}`, data);
    const run = () => {
      const result = spawnSync('node', [path.join(REPO, 'scripts/imports/import-stage-renders.mjs')], { cwd: root, encoding: 'utf8',
        env: { ...process.env, ARKPEDIA_EN: path.join(root, 'en'), ARKPEDIA_CN: path.join(root, 'cn'), ARKPEDIA_PIN_YUANYAN3060_ARKNIGHTSGAMERESOURCE: PIN, ARKPEDIA_NOW: '2026-09-26T12:00:00Z' } });
      assert.equal(result.status, 0, result.stderr);
    };
    run();
    const record = (slug: string) => readJson(root, `data/stages/${slug}.json`);
    assert.equal(record('1-1').preview, 'images/stages/1-1.png');
    assert.equal(record('1-1_challenge_mode').preview, 'images/stages/1-1.png', 'every form of a layout shares its render');
    // Rewritten as the build writes it: compact, every other field where it was.
    assert.equal(fs.readFileSync(path.join(root, 'data/stages/1-1.json'), 'utf8'), JSON.stringify({ ...RECORDS[0], preview: 'images/stages/1-1.png' }));
    assert.equal(record('zz-5').preview, 'images/stages/hand-picked.png', 'a preview once set is never replaced');
    for (const slug of ['zz-1', 'zz-2', 'zz-3', 'zz-4']) assert.equal(record(slug).preview, null, 'no preview names a file readers cannot load yet');
    assert.equal(fs.existsSync(path.join(root, 'public')), false, 'nothing is written under public/, which check:assets refuses');
    const staged = readJson(root, '.cache/stage-renders/staged.json').files;
    const mirror = (file: string) => ({ repository: 'yuanyan3060/ArknightsGameResource', path: `map/${file}`, commit: PIN, blob: gitBlob(renders[file as keyof typeof renders]) });
    assert.deepEqual(Object.fromEntries(Object.entries(staged).map(([target, row]: [string, any]) => [target, [row.file, row.source, row.mirror]])), {
      'stages-images/zz-1.webp': ['zz-1.png', `https://raw.githubusercontent.com/yuanyan3060/ArknightsGameResource/${PIN}/map/act99side_01.png`, mirror('act99side_01.png')],
      'stages-images/zz-2.webp': ['zz-2.png', `https://raw.githubusercontent.com/yuanyan3060/ArknightsGameResource/${PIN}/map/act99side_02_b.png`, mirror('act99side_02_b.png')],
      'stages-images/zz-3.webp': ['zz-3.png', `https://raw.githubusercontent.com/yuanyan3060/ArknightsGameResource/${PIN}/map/act99side_03_1.png`, mirror('act99side_03_1.png')],
    });
    assert.deepEqual(fs.readFileSync(path.join(root, '.cache/stage-renders/zz-2.png')), renders['act99side_02_b.png']);
    assert.deepEqual(held(root, 'stage-renders'), ['stage-render:zz-1', 'stage-render:zz-2', 'stage-render:zz-3']);
    const reason = readJson(root, 'data/quarantine.json').entries.find((entry: { key: string }) => entry.key === 'stage-render:zz-1').reason;
    assert.equal(reason, 'ZZ-1 (Test Event): the in-game render map/act99side_01.png is staged as .cache/stage-renders/zz-1.png, but no run has published it to arkpedia-image-assets as stages-images/zz-1.webp yet; these stages are published without a map preview until one does.');

    // What the staged-art stage does next: publishes them, adopts the revisions, runs this again.
    write(root, 'data/assets/external-asset-index.json', { files: ['stages-images/1-1.webp', 'stages-images/zz-1.webp', 'stages-images/zz-2.webp', 'stages-images/zz-3.webp'] });
    run();
    for (const slug of ['zz-1', 'zz-1_challenge_mode', 'zz-2', 'zz-3']) assert.equal(record(slug).preview, `images/stages/${slug.replace('_challenge_mode', '')}.png`);
    assert.equal(record('zz-4').preview, null);
    assert.deepEqual(held(root, 'stage-renders'), [], 'the entries clear themselves the run the renders are published');
    assert.equal(fs.existsSync(path.join(root, '.cache/stage-renders/staged.json')), false, 'nothing is left to publish');
  });
});

test('stage renders: without the CN art the published ones are still adopted and the waiting entries stay as they were', () => {
  const { adopt, stage } = planRenders({ stages: STAGES, records: RECORDS, published: new Set(['1-1']), mapFiles: null });
  assert.deepEqual([...adopt.keys()].sort(), ['1-1', '1-1_challenge_mode']);
  assert.deepEqual(stage, []);
});

/* ---- the completeness hold ------------------------------------------------------ */

test('a running event\'s listed stage with a map and no preview is held until its render is published', () => {
  const records = [
    { slug: 'zz-1', code: 'ZZ-1', geometry: 'zz-1', preview: null, content: { id: 'act99side', name: 'Test Event' } },
    { slug: 'zz-1_challenge_mode', code: 'ZZ-1', geometry: 'zz-1', preview: null, content: { id: 'act99side', name: 'Test Event' } },
    { slug: 'zz-2', code: 'ZZ-2', geometry: 'zz-2', preview: 'images/stages/zz-2.png', content: { id: 'act99side', name: 'Test Event' } },
    { slug: 'zz-st-1', code: 'ZZ-ST-1', geometry: null, preview: null, content: { id: 'act99side', name: 'Test Event' } },
    { slug: 'ro9-1', code: 'ISW-1', geometry: 'ro9-1', preview: null, content: { id: 'act99side', name: 'Test Event' } },
    { slug: 'old-1', code: 'OLD-1', geometry: 'old-1', preview: null, content: { id: 'act1side', name: 'Old Event' } },
    { slug: 'ex-1', code: 'EX-1', geometry: 'ex-1', preview: null, content: { id: 'act2vmulti', name: 'Excluded Mode' } },
  ];
  const index: { slug: string; variantOf: string | null }[] = [
    ...['zz-1', 'zz-2', 'zz-st-1', 'ro9-1', 'old-1'].map(slug => ({ slug, variantOf: null })), { slug: 'zz-1_challenge_mode', variantOf: 'zz-1' }];
  const windows = { act99side: [1789570800, 1790765999], act1side: [1600000000, 1601000000], act2vmulti: [1789570800, 1790765999] };
  const mappedStages = stageMapRows({ records, index, windows, isNodes: { 'ro9-1': { render: 'ro9_n_1_1.webp' } } });
  const holds = (now: string) => reviewCompleteness(emptyCatalogue({ mappedStages, now: new Date(now) })).quarantine.map((entry: { key: string }) => entry.key);
  // Its challenge-mode form borrows its render; a story stage has no map; an IS node shows its
  // own render; a stage of an excluded mode is not listed, and an old event is not running.
  assert.deepEqual(holds('2026-09-26T12:00:00Z'), ['stage-preview:zz-1']);
  assert.deepEqual(holds('2026-10-01T12:00:00Z'), [], 'held only while the event runs');
  const { quarantine } = reviewCompleteness(emptyCatalogue({ mappedStages, now: new Date('2026-09-26T12:00:00Z') }));
  assert.match(quarantine[0].reason, /^Test Event is running, and ZZ-1 \(zz-1\) has a map but no map preview/);
  assert.throws(() => reviewCompleteness({ ...emptyCatalogue(), mappedStages: undefined }), /needs the listed stages with a map/);
});

/* ---- the stage, end to end ------------------------------------------------------- */

test('the staged-art stage publishes what an importer staged, retries a push that lost a race, adopts it, and publishes nothing the next run', () => {
  temporary(root => {
    const app = path.join(root, 'app'), bare = path.join(root, 'image-assets.git'), shims = path.join(root, 'bin');
    fs.mkdirSync(app);
    // The scripts as the release job runs them, from the app's own tree.
    for (const dir of ['scripts', 'config']) fs.cpSync(path.join(REPO, dir), path.join(app, dir), { recursive: true });
    const icon = png(183, 183, [200, 150, 40, 255]);
    write(app, 'cn/item/act99side_token_new.png', icon);
    write(app, 'data/stages/zz-1.json', { slug: 'zz-1', drops: [{ item: { id: 'act99side_token_new', name: 'New Token' } }] });
    write(app, 'data/item-icons.json', {});
    write(app, 'data/assets/external-asset-index.json', { files: [] });
    write(app, 'data/quarantine.json', `${JSON.stringify({ version: 1, entries: [] }, null, 2)}\n`);
    // The image repository: a manifest, a source map and a validator, as the publisher needs.
    const seed = path.join(root, 'seed');
    execFileSync('git', ['init', '-q', '-b', 'main', seed]);
    write(seed, 'asset-manifest.json', '{"version":1,"files":{}}\n');
    write(seed, 'asset-source-map.json', `${JSON.stringify({ version: 1, sourceRepository: 'https://github.com/yuanyan3060/ArknightsGameResource', files: {} }, null, 2)}\n`);
    write(seed, 'scripts/validate_images.py', 'print("validated")\n');
    write(seed, 'sources/catalogue-imports.json', '{}\n');
    const git = (cwd: string, ...args: string[]) => execFileSync('git', ['-C', cwd, '-c', 'user.name=t', '-c', 'user.email=t@localhost', ...args], { encoding: 'utf8' });
    git(seed, 'add', '-A'); git(seed, 'commit', '-qm', 'seed');
    execFileSync('git', ['clone', '-q', '--bare', seed, bare]);
    git(bare, 'config', 'uploadpack.allowFilter', 'true');
    // Every GitHub address of the image repository leads to the scratch one.
    const gitconfig = path.join(root, 'gitconfig');
    fs.writeFileSync(gitconfig, `[url "file://${bare}"]\n\tinsteadOf = git@github.com:arkpedia/arkpedia-image-assets.git\n\tinsteadOf = https://github.com/arkpedia/arkpedia-image-assets.git\n[protocol "file"]\n\tallow = always\n`);
    // curl: GitHub's SSH keys. git: the first push loses a race -- another job pushes a file of
    // its own first -- as the image sync or a hand publish can. npm run assets:update: the
    // availability index from the scratch repository's manifest, as the real one reads it.
    fs.mkdirSync(shims);
    const shim = (name: string, body: string) => { fs.writeFileSync(path.join(shims, name), body); fs.chmodSync(path.join(shims, name), 0o755); };
    shim('curl', '#!/bin/sh\necho \'{"ssh_keys":[]}\'\n');
    const realGit = execFileSync('which', ['git'], { encoding: 'utf8' }).trim();
    shim('git', `#!/bin/bash
if [[ " $* " == *" push "* ]] && [ ! -e "${root}/raced" ]; then
  touch "${root}/raced"
  ( other="${root}/other" && "${realGit}" clone -q "file://${bare}" "$other" && cd "$other" && printf x > concurrent.txt \\
    && node -e 'const fs=require("fs");const m=JSON.parse(fs.readFileSync("asset-manifest.json"));m.files["material-icons/Concurrent.webp"]={bytes:1,sha256:"0".repeat(64)};fs.writeFileSync("asset-manifest.json",JSON.stringify(m)+"\\n")' \\
    && "${realGit}" add -A && "${realGit}" -c user.name=o -c user.email=o@localhost commit -qm concurrent && "${realGit}" push -q origin HEAD:main )
fi
exec "${realGit}" "$@"
`);
    // The first time after the push GitHub's API still reports the head from before it, as it
    // can for a moment: the index is written from main~1, and the stage has to ask again.
    shim('npm', `#!/bin/sh
[ "$*" = "run assets:update" ] || exit 64
echo x >> "${root}/assets-updates"
rev=main; [ -e "${root}/raced" ] && [ "$(wc -l < "${root}/assets-updates")" -eq 1 ] && rev=main~1
exec node -e 'const {execFileSync}=require("child_process"),fs=require("fs");const m=JSON.parse(execFileSync("git",["-C",process.argv[1],"show",process.argv[2]+":asset-manifest.json"]));fs.writeFileSync("data/assets/external-asset-index.json",JSON.stringify({files:Object.keys(m.files).sort()}))' "${bare}" "$rev"
`);
    const env = { ...process.env, PATH: `${shims}:${process.env.PATH}`, GIT_CONFIG_GLOBAL: gitconfig, GIT_CONFIG_NOSYSTEM: '1',
      ARKPEDIA_CN: path.join(app, 'cn'), ARKPEDIA_PIN_YUANYAN3060_ARKNIGHTSGAMERESOURCE: PIN, ARKPEDIA_NOW: '2026-09-26T20:00:00Z',
      CATALOGUE_IMAGE_DEPLOY_KEY: 'test-key', ARKPEDIA_PUBLISH_BACKOFF_SECONDS: '0' };
    const importer = () => {
      const result = spawnSync('node', ['scripts/imports/import-item-icons.mjs'], { cwd: app, env, encoding: 'utf8' });
      assert.equal(result.status, 0, result.stderr);
    };
    const publish = () => spawnSync('bash', ['scripts/sync/publish-catalogue-assets.sh', '--staged'], { cwd: app, env, encoding: 'utf8' });

    importer();
    assert.deepEqual(held(app, 'item-icons'), ['item-icon:act99side_token_new']);
    write(app, 'data/stage-report.json', { version: 1, stages: [{ stage: 'item-icons', status: 'ok' }] });
    const before = git(bare, 'rev-parse', 'main').trim();
    const result = publish();
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    if (process.env.DEBUG_STAGED_ART) console.log(result.stdout, result.stderr);
    assert.match(result.stderr, /A clone or push did not go through \(attempt 1 of 4\); starting over from the new head/);
    // A stale head is not adopted: it lacked the icon, so the index was asked for again.
    assert.match(result.stderr, /not in the adopted revisions yet: item-icons\/act99side_token_new\.png/);
    assert.match(result.stderr, /The adopted revisions do not include what this run pushed yet \(attempt 1 of 4\)/);
    assert.equal(fs.readFileSync(path.join(root, 'assets-updates'), 'utf8'), 'x\nx\n');

    // Landed on top of the other job's commit, which kept its file and its manifest row.
    const log = git(bare, 'log', '--format=%s', 'main').trim().split('\n');
    assert.deepEqual(log, ['Publish art the content refresh staged', 'concurrent', 'seed']);
    const manifest = JSON.parse(git(bare, 'show', 'main:asset-manifest.json')).files;
    assert.deepEqual(Object.keys(manifest).sort(), ['item-icons/act99side_token_new.png', 'material-icons/Concurrent.webp']);
    assert.deepEqual([manifest['item-icons/act99side_token_new.png'].width, manifest['item-icons/act99side_token_new.png'].height], [183, 183]);
    const published = execFileSync('git', ['-C', bare, 'show', 'main:item-icons/act99side_token_new.png']);
    assert.equal(published.subarray(1, 4).toString('latin1'), 'PNG', 'an item icon is published as the PNG its name says');
    assert.deepEqual(JSON.parse(git(bare, 'show', 'main:asset-source-map.json')).files, {
      'item-icons/act99side_token_new.png': { sourcePath: 'item/act99side_token_new.png', sourceBlob: gitBlob(icon), maxWidth: 183 } });
    assert.deepEqual(JSON.parse(git(bare, 'show', 'main:sources/catalogue-imports.json'))['item-icons/act99side_token_new.png'], {
      url: `https://raw.githubusercontent.com/yuanyan3060/ArknightsGameResource/${PIN}/item/act99side_token_new.png`,
      sha256: execFileSync('shasum', ['-a', '256'], { input: icon }).toString().split(' ')[0], importer: 'item-icons' });
    // Adopted in the same run: the drop maps its icon and the entry is gone.
    assert.deepEqual(readJson(app, 'data/item-icons.json'), { act99side_token_new: 'act99side_token_new.png' });
    assert.deepEqual(held(app, 'item-icons'), []);
    assert.deepEqual(held(app, 'staged-art'), []);
    assert.match(result.stdout, /1 quarantine entry cleared by publishing the staged art:\n {2}- item-icons item-icon:act99side_token_new/);
    assert.notEqual(git(bare, 'rev-parse', 'main').trim(), before);

    // The next run: nothing left to stage, nothing to publish, no commit.
    const head = git(bare, 'rev-parse', 'main').trim();
    importer();
    const again = publish();
    assert.equal(again.status, 0, again.stderr);
    assert.match(again.stdout, /0 staged file\(s\) to publish/);
    assert.equal(git(bare, 'rev-parse', 'main').trim(), head);
  });
});
