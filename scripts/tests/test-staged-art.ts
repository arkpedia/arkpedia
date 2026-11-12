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
// @ts-expect-error Node publication scripts are plain JavaScript.
import { adoptions, adoptStagedArt, unadopted } from '../sync/adopt-staged-art.mjs';
// @ts-expect-error Node publication scripts are plain JavaScript.
import { reviewCompleteness, stageMapRows } from '../content/check-completeness.mjs';
import { emptyCatalogue } from './fixtures/catalogue';
import { refreshScripts, refreshStages } from './fixtures/refresh-stages';

const REPO = process.cwd();
const REGISTRY = JSON.parse(fs.readFileSync('config/staged-art.json', 'utf8')).kinds as Record<string, { stage: string; folders: string[]; adopt: string[] }>;

const write = (root: string, file: string, value: unknown) => {
  fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
  fs.writeFileSync(path.join(root, file), typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value));
};
function temporary(run: (root: string) => void) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'arkpedia-staged-art-')));
  try { run(root); } finally { fs.rmSync(root, { recursive: true, force: true }); }
}

/* ---- the registry --------------------------------------------------------------- */

// .cache/ folders the refresh uses for anything but art on its way to the image repository.
const NOT_ART = new Set(['regional-tables', 'upstream', 'catalogue', 'staged-art', 'new-songs', 'stage-snapshot', 'refresh-fingerprint', 'prepared-inputs', 'content-baseline', 'arkgraph-mapping', 'base-audit']);

test('every refresh script here that stages art under .cache/ stages a kind the story-art stage publishes', () => {
  const scripts = refreshScripts();
  assert.ok(scripts.includes('scripts/lib/staged-art.mjs') && scripts.includes('scripts/sync/adopt-staged-art.mjs'), 'the walk reaches the staging helpers');
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
  // The registry is arkpedia-data's too, whose import stages every other kind (its
  // importer/scripts/tests/test-staged-art.ts); here only the story covers, whose source
  // refuses GitHub's runners.
  assert.deepEqual([...found].sort(), ['story-covers']);
});

test('the story-art stage runs after the stage that stages its art, under its own quarantine stage, and the kind adopts by rerunning it', () => {
  const stages = refreshStages();
  const order = stages.map(stage => stage.name);
  const npm = JSON.parse(fs.readFileSync('package.json', 'utf8')).scripts as Record<string, string>;
  const publisher = stages.find(stage => stage.name === 'story-art');
  // Not staged-art: the import's run of the publisher owns that stage's holds.
  assert.equal(publisher?.command, 'env STAGED_ART_STAGE=story-art bash scripts/sync/publish-catalogue-assets.sh --staged');
  assert.deepEqual(publisher.needs, [], 'a failed importer holds back only its own kind, by the stage report');
  for (const [kind, spec] of Object.entries(REGISTRY)) {
    const stage = stages.find(entry => entry.name === spec.stage);
    if (!stage) continue;
    assert.ok(order.indexOf(spec.stage) < order.indexOf('story-art'), `${kind}: ${spec.stage} stages art before story-art publishes it`);
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
    const run = (command: string, args: string[], options: { env: NodeJS.ProcessEnv }) => {
      assert.equal(options.env.ARKPEDIA_ART_ADOPTION, '1', 'adoption updates published availability without downloading another reward-icon batch');
      assert.equal(options.env.PATH, process.env.PATH, 'the importer retains its configured runtime');
      ran.push([command, ...args]); return { status: 0 };
    };
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

// The stage renders' importer, and the stage end to end (driving the item icons' importer), are
// tested with them in arkpedia-data (importer/scripts/tests/test-staged-art.ts).

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
