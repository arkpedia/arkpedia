import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// @ts-expect-error Node publication scripts are plain JavaScript.
import { MIRRORS } from '../content/pin-upstream.mjs';
// @ts-expect-error Node publication scripts are plain JavaScript.
import { declaredStages, STAGE_DEFINITIONS } from '../content/run-stage.mjs';
// @ts-expect-error Node publication scripts are plain JavaScript.
import { contentInput } from '../content/release-input.mjs';

const runner = path.resolve('scripts/content/run-stage.mjs');
/* A scratch tree with a little of data/ and public/, where every case runs the stage runner
   as the refresh does: one process per stage, in the tree's own directory. */
function withTree(use: (tree: ReturnType<typeof scratch>) => void) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'arkpedia-stages-'));
  try { use(scratch(root)); } finally { fs.rmSync(root, { recursive: true, force: true }); }
}
function scratch(root: string) {
  const write = (file: string, text: string) => {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), text);
  };
  write('data/records/a.json', '{"a":1}\n');
  write('data/records/b.json', '{"b":1}\n');
  write('public/index.json', '[]\n');
  // Whatever the calling job has pinned or started is not this tree's business.
  const clean = Object.fromEntries(Object.entries(process.env).filter(([name]) => !/^ARKPEDIA_(PIN_|PINS_INJECTED$|STAGE_RUN$)|^GITHUB_/.test(name)));
  const cli = (args: string[], env: Record<string, string> = {}) => {
    const result = spawnSync(process.execPath, [runner, ...args], { cwd: root, encoding: 'utf8', env: { ...clean, ...env } as NodeJS.ProcessEnv });
    return { status: result.status, output: result.stdout + result.stderr };
  };
  // A stage whose command is a short node program run in the tree.
  const stage = (name: string, options: string[], program: string, env: Record<string, string> = {}) =>
    cli(['run', name, ...options, '--', process.execPath, '-e', program], env);
  return {
    root, write, cli, stage,
    read: (file: string) => fs.existsSync(path.join(root, file)) ? fs.readFileSync(path.join(root, file), 'utf8') : null,
    report: () => JSON.parse(fs.readFileSync(path.join(root, 'data/stage-report.json'), 'utf8')),
  };
}
const edits = `const fs = require('fs');
fs.writeFileSync('data/records/a.json', '{"a":2}\\n');
fs.rmSync('data/records/b.json');
fs.mkdirSync('data/new/deep', { recursive: true });
fs.writeFileSync('data/new/deep/c.json', '{}');
fs.writeFileSync('public/index.json', '[1]\\n');`;

test('a failed stage has its changes under data/ and public/ put back, and the run carries on', () => {
  withTree(tree => {
    assert.equal(tree.cli(['begin']).status, 0);
    const outside = path.join(tree.root, 'downloads/table.json');
    tree.write('downloads/table.json', 'before');
    const failed = tree.stage('broken', ['--output', outside], `${edits}
      require('fs').writeFileSync(${JSON.stringify(outside)}, 'half written');
      process.stderr.write('  0%\\r 50%\\r100%\\n');
      console.log('fetching the table'); console.error('HTTP 404 for the table'); process.exit(22);`);
    assert.equal(failed.status, 0, 'a failed stage that is not an invariant does not stop the refresh');
    assert.match(failed.output, /== broken: FAILED \(exited 22; 6 file\(s\) under data\/ and public\/ restored, stages that need it are skipped/);
    assert.equal(tree.read('data/records/a.json'), '{"a":1}\n');
    assert.equal(tree.read('data/records/b.json'), '{"b":1}\n');
    assert.equal(tree.read('public/index.json'), '[]\n');
    assert.equal(fs.existsSync(path.join(tree.root, 'data/new')), false, 'directories the stage created are gone');
    assert.equal(tree.read('downloads/table.json'), 'before', 'a declared output outside data/ and public/ is restored too');
    // What needs it is skipped; what does not still runs, and keeps what it writes.
    assert.match(tree.stage('dependent', ['--needs', 'broken'], 'process.exit(0)').output, /dependent: skipped \(needs broken, which failed\)/);
    assert.equal(tree.stage('independent', [], `require('fs').writeFileSync('data/records/a.json', '{"a":3}\\n')`).status, 0);
    assert.equal(tree.read('data/records/a.json'), '{"a":3}\n');
    assert.match(tree.stage('second-hand', ['--needs', 'independent,dependent'], 'process.exit(0)').output, /needs dependent, which was skipped/);
    const { stages } = tree.report();
    assert.deepEqual(stages.map((entry: any) => [entry.stage, entry.status]),
      [['broken', 'failed'], ['dependent', 'skipped'], ['independent', 'ok'], ['second-hand', 'skipped']]);
    assert.equal(stages[0].exit, 'exited 22');
    assert.match(stages[0].error, /fetching the table\nHTTP 404 for the table|HTTP 404 for the table\nfetching the table/);
    assert.match(stages[0].error, /^100%$/m, 'a redrawn progress line keeps only what a terminal would show');
    assert.doesNotMatch(stages[0].error, /\r/);
    assert.equal(stages[0].restored, 6);
    assert.ok(stages.every((entry: any) => Number.isInteger(entry.durationMs) && entry.durationMs >= 0));
    // The summary: a daily run ends green after an ordinary failure; a manual run does not.
    const end = tree.cli(['end']);
    assert.equal(end.status, 0);
    assert.match(end.output, /failed {2}broken [\d.]+s -- exited 22: /);
    assert.equal(tree.cli(['end', '--strict']).status, 1);
  });
});

test('a stage that crashes is summed up by its cause, not by the version line Node ends a crash with', () => {
  withTree(tree => {
    tree.cli(['begin']);
    tree.stage('catalogue', [], `throw new TypeError('fetch failed', { cause: Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:1'), { code: 'ECONNREFUSED' }) })`);
    const [crash] = tree.report().stages;
    assert.match(crash.error, /^Node\.js v\d/m, 'the crash output as Node prints it');
    assert.match(tree.cli(['end']).output, /failed {2}catalogue [\d.]+s -- exited 1: \[cause\]: Error: connect ECONNREFUSED 127\.0\.0\.1:1$/m);
  });
});

test('only an invariant stage stops the run, when it fails or cannot run', () => {
  withTree(tree => {
    tree.cli(['begin']);
    assert.equal(tree.stage('checkout', ['--invariant'], `${edits} process.exit(1)`).status, 1);
    assert.equal(tree.read('data/records/a.json'), '{"a":1}\n', 'its changes are put back all the same');
    tree.stage('source', [], 'process.exit(3)');
    assert.equal(tree.stage('gate', ['--invariant', '--needs', 'source'], 'process.exit(0)').status, 1);
    assert.equal(tree.cli(['end']).status, 1);
    assert.deepEqual(tree.report().stages.map((entry: any) => [entry.stage, entry.status, entry.invariant ?? false]),
      [['checkout', 'failed', true], ['source', 'failed', false], ['gate', 'skipped', true]]);
  });
});

test('a stage that hangs is stopped at its time limit and treated as failed', () => {
  withTree(tree => {
    tree.cli(['begin']);
    const hung = tree.stage('hung', ['--timeout-minutes', '0.01'], `require('fs').writeFileSync('data/records/a.json', 'partial'); setTimeout(() => {}, 60000);`);
    assert.equal(hung.status, 0);
    assert.equal(tree.read('data/records/a.json'), '{"a":1}\n');
    assert.equal(tree.report().stages[0].exit, 'timed out after 0.01 min');
    // A command that cannot start at all is a failure like any other.
    assert.equal(tree.cli(['run', 'missing', '--', 'arkpedia-no-such-command']).status, 0);
    assert.equal(tree.report().stages[1].exit, 'could not start');
  });
});

/* The stage data's shape in small: a build that writes records, a raw index and a shared
   file, stages derived from it, and one that finishes the index in place. */
const build = `const fs = require('fs');
fs.writeFileSync('data/records/a.json', '{"a":"built"}\\n');
fs.writeFileSync('data/records/b.json', '{"b":"built"}\\n');
fs.writeFileSync('data/records/new.json', '{"new":true}\\n');
fs.mkdirSync('data/maps/deep', { recursive: true });
fs.writeFileSync('data/maps/deep/m.json', '{}');
fs.writeFileSync('data/shared.json', '"built"');
fs.writeFileSync('public/index.json', '["raw"]\\n');`;

test('a stage that fails while finishing an earlier stage\'s output in place takes that stage and all derived from it back', () => {
  withTree(tree => {
    tree.cli(['begin']);
    // Before the build, and outside what it derives: what this changed is not taken back.
    assert.equal(tree.stage('before', [], `require('fs').writeFileSync('data/records/b.json', '{"b":"before"}\\n')`).status, 0);
    assert.equal(tree.stage('dataset', [], build).status, 0);
    assert.equal(tree.stage('derived', ['--needs', 'dataset'], `require('fs').writeFileSync('data/derived.json', '[]')`).status, 0);
    assert.equal(tree.stage('no-change', ['--needs', 'derived'], 'process.exit(0)').status, 0);
    // Independent of the build, and it changes the shared file after the build did.
    assert.equal(tree.stage('unrelated', [], `const fs = require('fs'); fs.writeFileSync('data/other.json', '1'); fs.writeFileSync('data/shared.json', '"unrelated"');`).status, 0);
    // The enrichment: half of the index written, then a record shape it does not know.
    const failed = tree.stage('index', ['--needs', 'dataset', '--output', 'public/index.json'], `
      require('fs').writeFileSync('public/index.json', '[{"slug":"a",');
      console.error('unknown record shape'); process.exit(1);`);
    assert.equal(failed.status, 0, 'it is no invariant, so the refresh carries on');
    assert.match(failed.output, /== index failed, so dataset, derived, no-change were rolled back: \d+ file\(s\) under data\/ and public\/ as they were before them; kept, as a later stage changed them: data\/shared\.json \(changed since by unrelated\)/);
    assert.equal(tree.read('public/index.json'), '[]\n', 'the index as published, not the build\'s raw one');
    assert.equal(tree.read('data/records/a.json'), '{"a":1}\n');
    assert.equal(tree.read('data/records/b.json'), '{"b":"before"}\n', 'as it was before the build, not before the run');
    assert.equal(tree.read('data/records/new.json'), null);
    assert.equal(tree.read('data/derived.json'), null);
    assert.equal(fs.existsSync(path.join(tree.root, 'data/maps')), false, 'directories the build created are gone');
    assert.equal(tree.read('data/other.json'), '1');
    assert.equal(tree.read('data/shared.json'), '"unrelated"');
    // Whatever needs a stage that was rolled back does not run on what is left.
    assert.match(tree.stage('late', ['--needs', 'dataset'], 'process.exit(0)').output, /late: skipped \(needs dataset, which was rolled back\)/);
    assert.match(tree.stage('enemies', ['--needs', 'index'], 'process.exit(0)').output, /enemies: skipped \(needs index, which failed\)/);
    const { stages } = tree.report();
    assert.deepEqual(stages.map((entry: any) => [entry.stage, entry.status]), [['before', 'ok'], ['dataset', 'rolled-back'], ['derived', 'rolled-back'],
      ['no-change', 'rolled-back'], ['unrelated', 'ok'], ['index', 'failed'], ['late', 'skipped'], ['enemies', 'skipped']]);
    assert.equal(stages[1].reason, 'rolled back: index failed before finishing in place what dataset wrote');
    assert.match(tree.cli(['end']).output, /rolled-back dataset [\d.]+s -- rolled back: index failed/);
  });
});

test('a stage skipped before it could finish an earlier stage\'s output in place rolls that stage back too', () => {
  withTree(tree => {
    tree.cli(['begin']);
    tree.stage('dataset', [], build);
    tree.stage('names', [], 'process.exit(4)');
    const skipped = tree.stage('index', ['--needs', 'dataset,names', '--output', 'public/index.json'], `require('fs').writeFileSync('public/index.json', '[1]')`);
    assert.equal(skipped.status, 0);
    assert.equal(tree.read('public/index.json'), '[]\n');
    assert.equal(tree.read('data/records/a.json'), '{"a":1}\n');
    assert.deepEqual(tree.report().stages.map((entry: any) => entry.status), ['rolled-back', 'failed', 'skipped']);
  });
});

test('a declared output nothing it needs has written costs only the failing stage\'s own changes', () => {
  withTree(tree => {
    tree.cli(['begin']);
    tree.stage('dataset', [], build);
    // It needs nothing, so the index the build wrote is not its to finish.
    tree.stage('solo', ['--output', 'public/index.json'], `require('fs').writeFileSync('public/index.json', '[2]'); process.exit(1)`);
    assert.equal(tree.read('public/index.json'), '["raw"]\n');
    assert.equal(tree.read('data/records/a.json'), '{"a":"built"}\n');
    assert.deepEqual(tree.report().stages.map((entry: any) => entry.status), ['ok', 'failed']);
  });
});

test('a stage that leaves an image under public/ no asset repository publishes fails alone', () => {
  withTree(tree => {
    tree.cli(['begin']);
    tree.write('data/assets/external-asset-index.json', '{"files":["item-icons/published.png"]}\n');
    // check:assets refuses the file, so exiting 0 with it there would block the whole release.
    const copied = tree.stage('item-icons', [], `const fs = require('fs');
      fs.mkdirSync('public/item-icons', { recursive: true });
      fs.writeFileSync('public/item-icons/act99side_token_new.png', 'png');
      fs.writeFileSync('data/records/a.json', '{"a":2}\\n');`);
    assert.equal(copied.status, 0, 'a stage that is not an invariant never stops the run');
    assert.match(copied.output, /item-icons: FAILED \(wrote unpublished media under public\//);
    assert.equal(tree.read('public/item-icons/act99side_token_new.png'), null);
    assert.equal(tree.read('data/records/a.json'), '{"a":1}\n', 'what the stage wrote goes back with it');
    const [entry] = tree.report().stages;
    assert.equal(entry.status, 'failed');
    assert.match(entry.error, /check:assets refuses these: public\/item-icons\/act99side_token_new\.png; stage them outside public\//);
    // An image the asset repositories publish (a local copy of one) is not the release's problem.
    assert.equal(tree.stage('published', [], `const fs = require('fs');
      fs.mkdirSync('public/item-icons', { recursive: true });
      fs.writeFileSync('public/item-icons/published.png', 'png');`).status, 0);
    assert.deepEqual(tree.report().stages.map((stage: any) => stage.status), ['failed', 'ok']);
  });
});

test('an invariant that fails keeps what it wrote under --keep, and nothing else', () => {
  withTree(tree => {
    tree.cli(['begin']);
    tree.write('data/quarantine.json', '{"version":1,"entries":[]}\n');
    const gate = tree.stage('completeness', ['--invariant', '--keep', 'data/quarantine.json'], `const fs = require('fs');
      fs.writeFileSync('data/quarantine.json', '{"version":1,"entries":["today"]}\\n');
      fs.writeFileSync('data/records/a.json', 'half');
      console.error('Content publication blocked'); process.exit(1);`);
    assert.equal(gate.status, 1);
    assert.match(gate.output, /what it wrote to data\/quarantine\.json is kept/);
    assert.equal(tree.read('data/quarantine.json'), '{"version":1,"entries":["today"]}\n', 'the day\'s holds reach the issue and the evidence');
    assert.equal(tree.read('data/records/a.json'), '{"a":1}\n');
    assert.equal(tree.stage('outside', ['--keep', '../elsewhere'], 'process.exit(0)').status, 2, '--keep only takes a path under data/ or public/');
  });
  // The first day: data main has no quarantine file yet, so the gate creates the one it keeps.
  withTree(tree => {
    tree.cli(['begin']);
    const gate = tree.stage('completeness', ['--invariant', '--keep', 'data/quarantine.json'], `const fs = require('fs');
      fs.writeFileSync('data/quarantine.json', '{"version":1,"entries":["first day"]}\\n');
      fs.mkdirSync('data/gate', { recursive: true });
      fs.writeFileSync('data/gate/half.json', '{}');
      console.error('Content publication blocked'); process.exit(1);`);
    assert.equal(gate.status, 1);
    assert.equal(tree.read('data/quarantine.json'), '{"version":1,"entries":["first day"]}\n', 'a file the gate created survives its failure');
    assert.equal(tree.read('data/gate/half.json'), null, 'what it created elsewhere does not');
    assert.equal(fs.existsSync(path.join(tree.root, 'data/gate')), false);
  });
});

test('every stage that did not run to the end keeps a dated quarantine entry until it does', () => {
  withTree(tree => {
    const quarantine = () => JSON.parse(tree.read('data/quarantine.json')!).entries
      .map(({ key, stage, action, reason, firstSeen }: any) => ({ key, stage, action, reason, firstSeen }));
    const day = (now: string, stages: [string, string[], string][]) => {
      tree.cli(['begin']);
      for (const [name, options, program] of stages) tree.stage(name, options, program);
      return tree.cli(['end'], { ARKPEDIA_NOW: now });
    };
    // A clean run where there is no quarantine file (a local refresh) does not start one.
    day('2026-09-19T20:00:00Z', [['lyrics', [], 'process.exit(0)']]);
    assert.equal(tree.read('data/quarantine.json'), null);
    // Another stage's entry, which the runner never touches.
    tree.write('data/quarantine.json', `${JSON.stringify({ version: 1, entries: [{ key: 'banner:X', stage: 'catalogue', reason: 'no art', action: 'published-partial', firstSeen: '2026-09-01', lastSeen: '2026-09-01' }] })}\n`);
    day('2026-09-20T20:00:00Z', [['charwords', [], 'process.exit(22)'], ['voices', ['--needs', 'charwords'], 'process.exit(0)'], ['lyrics', [], 'process.exit(0)']]);
    assert.deepEqual(quarantine(), [
      { key: 'banner:X', stage: 'catalogue', action: 'published-partial', reason: 'no art', firstSeen: '2026-09-01' },
      { key: 'stage:charwords', stage: 'refresh', action: 'kept-previous', reason: 'failed or timed out; the run\'s stage report says how', firstSeen: '2026-09-20' },
      { key: 'stage:voices', stage: 'refresh', action: 'kept-previous', reason: 'skipped: needs charwords, which did not run to the end', firstSeen: '2026-09-20' },
    ]);
    // Still failing four days on: the same entry, the first day it failed kept.
    day('2026-09-24T20:00:00Z', [['charwords', [], 'process.exit(22)'], ['voices', [], 'process.exit(0)']]);
    assert.deepEqual(quarantine().slice(1), [{ key: 'stage:charwords', stage: 'refresh', action: 'kept-previous', reason: 'failed or timed out; the run\'s stage report says how', firstSeen: '2026-09-20' }]);
    // A run of only some stages leaves the others' entries alone; a stage that recovers drops its own.
    day('2026-09-25T20:00:00Z', [['lyrics', [], 'process.exit(1)']]);
    assert.deepEqual(quarantine().slice(1).map((entry: any) => [entry.key, entry.firstSeen]), [['stage:charwords', '2026-09-20'], ['stage:lyrics', '2026-09-25']]);
    day('2026-09-26T20:00:00Z', [['charwords', [], 'process.exit(0)'], ['lyrics', [], 'process.exit(0)']]);
    assert.deepEqual(quarantine().map((entry: any) => entry.key), ['banner:X']);
  });
});

test('a stage that keeps failing publishes the same source every day, however each day fails; the stage report keeps how', () => {
  withTree(tree => {
    // What the release would publish of this tree: export.mjs lists data/ and public/ through
    // git, which leaves out what .gitignore names (the stage report), and hashes the rest into
    // the content id the publish step compares.
    fs.copyFileSync('.gitignore', path.join(tree.root, '.gitignore'));
    assert.equal(spawnSync('git', ['init', '-q'], { cwd: tree.root }).status, 0);
    const published = () => {
      const listed = spawnSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z', 'data', 'public'], { cwd: tree.root, encoding: 'utf8' });
      const files = listed.stdout.split('\0').filter(Boolean).sort();
      return { files, content: contentInput({ generator: 'test', sourceHashes: Object.fromEntries(files.map(file =>
        [file, createHash('sha256').update(fs.readFileSync(path.join(tree.root, file))).digest('hex')])) }) };
    };
    tree.write('data/quarantine.json', '{"version":1,"entries":[]}\n');
    const hang = 'setTimeout(() => {}, 60000)';
    // One outage, three days: a download answers 5xx (curl exits 22), hangs past its limit, then
    // is refused (7); another stage times out, exits 1, then is killed; a stage that finishes an
    // earlier one's output in place fails, hangs, then exits 3, taking that stage back each day.
    const days: [string, [string[], string][]][] = [
      ['2026-09-20T20:00:00Z', [[[], 'process.exit(22)'], [['--timeout-minutes', '0.01'], hang], [[], 'process.exit(1)']]],
      ['2026-09-21T20:00:00Z', [[['--timeout-minutes', '0.01'], hang], [[], 'process.exit(1)'], [['--timeout-minutes', '0.01'], hang]]],
      ['2026-09-22T20:00:00Z', [[[], 'process.exit(7)'], [[], "process.kill(process.pid, 'SIGKILL')"], [[], 'process.exit(3)']]],
    ];
    const seen = days.map(([now, [charwords, lyrics, index]]) => {
      tree.cli(['begin']);
      tree.stage('charwords', charwords[0], charwords[1]);
      tree.stage('voices', ['--needs', 'charwords'], 'process.exit(0)');
      tree.stage('lyrics', lyrics[0], lyrics[1]);
      tree.stage('dataset', [], build);
      tree.stage('index', ['--needs', 'dataset', '--output', 'public/index.json', ...index[0]], `require('fs').writeFileSync('public/index.json', '[1]'); ${index[1]}`);
      tree.stage('late', ['--needs', 'dataset'], 'process.exit(0)');
      assert.equal(tree.cli(['end'], { ARKPEDIA_NOW: now }).status, 0);
      return { quarantine: tree.read('data/quarantine.json'), ...published(), report: tree.report().stages };
    });
    // How each day failed is in the stage report, which is not published.
    assert.deepEqual(seen.map(day => day.report.find((entry: any) => entry.stage === 'charwords').exit), ['exited 22', 'timed out after 0.01 min', 'exited 7']);
    assert.deepEqual(seen.map(day => day.report.find((entry: any) => entry.stage === 'lyrics').exit), ['timed out after 0.01 min', 'exited 1', 'killed by SIGKILL']);
    assert.deepEqual(seen.map(day => day.report.find((entry: any) => entry.stage === 'index').exit), ['exited 1', 'timed out after 0.01 min', 'exited 3']);
    assert.ok(seen.every(day => day.report.find((entry: any) => entry.stage === 'dataset').status === 'rolled-back'));
    assert.ok(seen.every(day => day.files.includes('data/quarantine.json') && !day.files.includes('data/stage-report.json')), 'the stage report stays out of the published source');
    // The published source is the same, byte for byte, every day of the outage: no new release.
    assert.equal(seen[1].quarantine, seen[0].quarantine);
    assert.equal(seen[2].quarantine, seen[0].quarantine);
    assert.deepEqual(seen.map(day => day.content), Array(3).fill(seen[0].content));
    assert.deepEqual(JSON.parse(seen[0].quarantine!).entries.map(({ key, reason, firstSeen }: any) => [key, reason, firstSeen]), [
      ['stage:charwords', 'failed or timed out; the run\'s stage report says how', '2026-09-20'],
      ['stage:dataset', 'rolled back: index did not finish in place what dataset wrote', '2026-09-20'],
      ['stage:index', 'failed or timed out; the run\'s stage report says how', '2026-09-20'],
      ['stage:late', 'skipped: needs dataset, which did not run to the end', '2026-09-20'],
      ['stage:lyrics', 'failed or timed out; the run\'s stage report says how', '2026-09-20'],
      ['stage:voices', 'skipped: needs charwords, which did not run to the end', '2026-09-20'],
    ]);
  });
});

test('the entry of a stage the refresh no longer declares is dropped; one it still declares is kept', () => {
  withTree(tree => {
    const held = () => JSON.parse(tree.read('data/quarantine.json')!).entries.map((entry: any) => [entry.key, entry.firstSeen]);
    // The two files that declare the refresh's stages, as the runner reads them.
    const declare = (workflow: string[], script: string[]) => {
      tree.write('.github/workflows/prepare-content.yml', `        run: |\n${workflow.map(name => `          stage ${name} -- node scripts/${name}.mjs`).join('\n')}\n`);
      tree.write('scripts/sync/refresh-stage-data.sh', `${script.map(name => `stage ${name} --needs stage-dataset -- node scripts/${name}.mjs`).join('\n')}\n`);
    };
    const day = (now: string, stages: [string, string][]) => {
      tree.cli(['begin']);
      for (const [name, program] of stages) tree.stage(name, [], program);
      return tree.cli(['end'], { ARKPEDIA_NOW: now });
    };
    declare(['old-name', 'charwords'], ['item-icons']);
    day('2026-09-20T20:00:00Z', [['old-name', 'process.exit(1)'], ['charwords', 'process.exit(22)'], ['item-icons', 'process.exit(3)']]);
    assert.deepEqual(held(), [['stage:charwords', '2026-09-20'], ['stage:item-icons', '2026-09-20'], ['stage:old-name', '2026-09-20']]);
    // Renamed while failing. A run of only some stages (a correction, a refresh of the stage
    // data alone) keeps what the refresh still declares, and drops the old name.
    declare(['new-name', 'charwords'], ['item-icons']);
    day('2026-09-21T20:00:00Z', [['new-name', 'process.exit(0)']]);
    assert.deepEqual(held(), [['stage:charwords', '2026-09-20'], ['stage:item-icons', '2026-09-20']]);
    // Dropped from the refresh altogether, while still failing.
    declare(['new-name', 'charwords'], []);
    assert.equal(day('2026-09-22T20:00:00Z', [['charwords', 'process.exit(22)']]).status, 0);
    assert.deepEqual(held(), [['stage:charwords', '2026-09-20']]);
  });
  // The runner reads the stage names the refresh really declares, all of them.
  assert.deepEqual([...declaredStages(process.cwd())].sort(), [...new Set(refreshStages().map(stage => stage.name))].sort());
  // Every file that runs stages is one the runner reads the names from.
  const runsStages = (dir: string): string[] => fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === 'tests' ? [] : runsStages(file);
    return /\.(ya?ml|sh)$/.test(entry.name) && /run-stage\.mjs run|^\s*stage\(\) \{/m.test(fs.readFileSync(file, 'utf8')) ? [file] : [];
  });
  assert.deepEqual([...runsStages('.github'), ...runsStages('scripts')].sort(), [...STAGE_DEFINITIONS].sort());
});

test('every stage gets the pinned mirror commits, and a pin already set wins', () => {
  withTree(tree => {
    tree.cli(['begin']);
    const kengxxiao = 'a'.repeat(40), yuanyan = 'b'.repeat(40), mine = 'c'.repeat(40);
    tree.write('data/upstream.lock.json', JSON.stringify({ version: 1, repositories: {
      'Kengxxiao/ArknightsGameData': { branch: 'master', commit: kengxxiao },
      'yuanyan3060/ArknightsGameResource': { branch: 'main', commit: yuanyan },
      'PuppiizSunniiz/ArknightsGameData_YoStar': { branch: 'main', commit: null },
    } }));
    const print = `for (const name of ['ARKPEDIA_PIN_KENGXXIAO_ARKNIGHTSGAMEDATA', 'ARKPEDIA_PIN_YUANYAN3060_ARKNIGHTSGAMERESOURCE',
      'ARKPEDIA_PIN_PUPPIIZSUNNIIZ_ARKNIGHTSGAMEDATA_YOSTAR', 'ARKPEDIA_PINS_INJECTED']) console.log(name + '=' + (process.env[name] ?? ''))`;
    const output = tree.stage('pins', [], print, { ARKPEDIA_PIN_YUANYAN3060_ARKNIGHTSGAMERESOURCE: mine }).output;
    assert.match(output, new RegExp(`ARKPEDIA_PIN_KENGXXIAO_ARKNIGHTSGAMEDATA=${kengxxiao}`));
    assert.match(output, new RegExp(`ARKPEDIA_PIN_YUANYAN3060_ARKNIGHTSGAMERESOURCE=${mine}`));
    assert.match(output, /ARKPEDIA_PIN_PUPPIIZSUNNIIZ_ARKNIGHTSGAMEDATA_YOSTAR=\n/);
    assert.match(output, /ARKPEDIA_PINS_INJECTED=ARKPEDIA_PIN_KENGXXIAO_ARKNIGHTSGAMEDATA\n/);
  });
});

test('a stage name twice in one run is a mistake in the refresh, not a skipped stage', () => {
  withTree(tree => {
    tree.cli(['begin']);
    tree.stage('once', [], 'process.exit(0)');
    const again = tree.stage('once', [], 'process.exit(0)');
    assert.equal(again.status, 2);
    assert.match(again.output, /Stage once already ran in this run/);
    assert.equal(tree.cli(['run', 'no-command', '--needs', 'x']).status, 2);
  });
});

/* The stages of the daily refresh in the order they run: the workflow's refresh step, with
   refresh-stage-data.sh's stages where the step calls it. */
function refreshStages() {
  const stagesOf = (text: string) => {
    const joined = text.replace(/\\\n\s*/g, ' ');
    return [...joined.matchAll(/^\s*(stage [^\n]*|bash scripts\/sync\/refresh-stage-data\.sh)$/gm)].map(match => match[1]);
  };
  const workflow = fs.readFileSync('.github/workflows/prepare-content.yml', 'utf8');
  const step = workflow.slice(workflow.indexOf('- name: Refresh supported upstream records'), workflow.indexOf('- name: Validate and compile data'));
  // Run on its own, the script starts a run and pins first; inside the daily one it does not.
  const script = fs.readFileSync('scripts/sync/refresh-stage-data.sh', 'utf8');
  const standalone = script.match(/^if \[ -z "\$\{ARKPEDIA_STAGE_RUN:-\}" \]; then\n([\s\S]*?)^fi\n/m);
  assert.ok(standalone, 'refresh-stage-data.sh has a block for running on its own');
  assert.match(standalone[1], /run-stage\.mjs begin\n\s*stage pin-upstream -- node scripts\/content\/pin-upstream\.mjs\n/);
  assert.match(script, /\nif \[ -n "\$standalone" \]; then node scripts\/content\/run-stage\.mjs end --strict; fi\n$/);
  const inner = stagesOf(script.replace(standalone[0], ''));
  return stagesOf(step).flatMap(line => line.startsWith('bash ') ? inner : [line]).map(line => {
    const words = line.split(/\s+/);
    const options = words.slice(0, words.indexOf('--'));
    const needs = options.flatMap((word, i) => word === '--needs' ? options[i + 1].split(',') : []);
    const values = (option: string) => options.flatMap((word, i) => word === option ? [options[i + 1]] : []);
    return { name: words[1], needs, invariant: options.includes('--invariant'), outputs: values('--output'), keep: values('--keep'),
      command: words.slice(words.indexOf('--') + 1).join(' ') };
  });
}
/* Every file the refresh's stages run: the scripts their commands name, the npm scripts and
   shell scripts those call, and the local modules they import. */
function refreshScripts() {
  const npm = JSON.parse(fs.readFileSync('package.json', 'utf8')).scripts as Record<string, string>;
  const files = new Set<string>();
  const commands = (text: string) => {
    for (const [, name] of text.matchAll(/npm run ([\w:-]+)/g)) if (npm[name]) commands(npm[name]);
    for (const [file] of text.matchAll(/scripts\/[\w./-]+\.(?:mjs|js|ts|py|sh)\b/g)) visit(file);
  };
  const visit = (file: string) => {
    if (files.has(file) || !fs.existsSync(file)) return;
    files.add(file);
    const text = fs.readFileSync(file, 'utf8');
    if (file.endsWith('.py')) {
      for (const [, name] of text.matchAll(/^(?:from|import) (\w+)/gm)) visit(path.join(path.dirname(file), `${name}.py`));
    } else if (file.endsWith('.sh')) commands(text);
    else {
      for (const [, spec] of text.matchAll(/(?:from|import\()\s*'(\.{1,2}\/[^']+)'/g)) {
        const at = path.join(path.dirname(file), spec);
        const found = [at, `${at}.ts`, `${at}.mjs`, `${at}.js`].find(candidate => fs.existsSync(candidate) && fs.statSync(candidate).isFile());
        if (found) visit(found);
      }
    }
  };
  for (const stage of refreshStages()) commands(stage.command);
  return [...files].sort();
}
test('every script a refresh stage runs reads the game-data mirrors at the run\'s pinned commit', () => {
  const scripts = refreshScripts();
  // What the walk has to find: stage scripts, npm and shell indirection, local imports.
  for (const file of ['scripts/sync/sync-catalogue.mjs', 'scripts/sync/sync-content-inventory.mjs', 'scripts/build/build-pull-sources.ts',
    'scripts/build/build-operator-voices.mjs', 'scripts/sync/publish-catalogue-assets.py', 'scripts/imports/import-reward-icons.py', 'scripts/imports/quarantine.py']) {
    assert.ok(scripts.includes(file), `${file} is part of the refresh`);
  }
  const host = /raw\.githubusercontent\.com|api\.github\.com\/repos/;
  for (const file of scripts.filter(file => file !== 'scripts/content/pin-upstream.mjs')) {
    const text = fs.readFileSync(file, 'utf8');
    for (const { repository } of MIRRORS as { repository: string }[]) {
      const moving = new RegExp(`(?:raw\\.githubusercontent\\.com|api\\.github\\.com/repos)/${repository.replace(/[.]/g, '\\.')}/(?:commits/)?(?:main|master)\\b`);
      assert.doesNotMatch(text, moving, `${file} reads ${repository} at its moving branch; ${PINNED_ADVICE}`);
      if (text.includes(repository) && host.test(text)) {
        assert.match(text, /pinnedRef\(|pinnedCommit\(|ARKPEDIA_PIN_/, `${file} reads ${repository} without the commit this run pinned; ${PINNED_ADVICE}`);
      }
    }
  }
});

/*
 * The CN tables come from ONE mirror at ONE commit per run: the source the upstream-cn stage
 * settled on (scripts/content/cn-tables.mjs), which may be neither Kengxxiao nor its pin. A
 * stage reads them from the checkout that stage composed, or by URL from cnTableUrl() or
 * cnTables(). One that names a CN mirror's tables itself -- at that mirror's pin, as the check
 * above asks of any other mirror -- reads another mirror, or another commit, than the rest of
 * the run on a day upstream-cn fell back, or fails against the mirror that is down. Only the two
 * scripts that settle the source may name it.
 */
const CN_TABLE_ADVICE = 'build a CN table\'s URL from cnTableUrl() or cnTables() (Python and shell: node scripts/content/pin-upstream.mjs cn-table-url <file>), or read it from .cache/upstream/cn-resource/gamedata';
const PINNED_ADVICE = `for a CN table, ${CN_TABLE_ADVICE}; for any other file, build the URL from pinnedRef() (Python: the ARKPEDIA_PIN_ variable)`;
const CN_TABLE_SETTLERS = ['scripts/content/pin-upstream.mjs', 'scripts/content/cn-tables.mjs'];
/** How a script's text reads a CN table other than from the source the run settled on. */
function cnTablesNotSettled(text: string): string[] {
  const problems: string[] = [];
  // Kengxxiao serves the refresh nothing but CN tables: naming it, or its pin, is reading them there.
  if (/Kengxxiao\/ArknightsGameData|KENGXXIAO_ARKNIGHTSGAMEDATA/i.test(text)) problems.push('names Kengxxiao/ArknightsGameData, which serves the refresh nothing but CN tables');
  // Which sources there are, and where each is checked out, is cn-tables.mjs's to know.
  if (/\bCN_TABLE_SOURCES\b|\bTABLE_CHECKOUTS\b|\.cache\/upstream\/cn-tables/.test(text)) problems.push('reads the CN table sources or their checkouts, not the tables the run settled on');
  // yuanyan3060's art (item/, map/) at its pin is right; anything under its gamedata/ is a CN table.
  if (/yuanyan3060\/ArknightsGameResource(?:\$\{[^}]*\}|\{[^}]*\}|[\w.@/-])*?\/gamedata\b/i.test(text)) problems.push('reads a CN table from yuanyan3060/ArknightsGameResource by itself');
  // A URL to any gamedata/ folder but Global's (en/, en_US/) is a CN table, however the rest is built.
  const url = /(?:raw\.githubusercontent\.com|api\.github\.com\/repos|cdn\.jsdelivr\.net\/gh|github\.com)\/(?:\$\{[^}]*\}|\{[^}]*\}|[^\s'"`{}])*/g;
  for (const [address] of text.matchAll(url)) {
    if (/(?<!\/en|\/en_US)\/gamedata(?=\/|$)/.test(address)) problems.push(`builds a URL to a CN table: ${address}`);
  }
  // The same through pin-upstream's raw-url command or rawUrl(), or a checkout of its own.
  for (const line of text.replace(/\\\n\s*/g, ' ').split('\n')) {
    if (/raw-url|rawUrl\(|upstream\.sh|upstream_sync/.test(line) && /(?:^|[\s'"`,])(?:zh_CN\/)?gamedata(?=[/\s'"`,]|$)/.test(line)) {
      problems.push(`reads a CN table at a mirror's pin: ${line.trim()}`);
    }
  }
  return problems;
}
test('no refresh script reads a CN table from one mirror or at its pin, only from the tables upstream-cn settled on', () => {
  const texts = [
    ...refreshScripts().filter(file => !CN_TABLE_SETTLERS.includes(file)).map(file => [file, fs.readFileSync(file, 'utf8')]),
    ...refreshStages().map(stage => [`stage ${stage.name}`, stage.command]),
  ];
  assert.ok(texts.some(([file]) => file === 'scripts/imports/import-reward-icons.py') && texts.some(([file]) => file === 'stage charwords'));
  const problems = texts.flatMap(([file, text]) => cnTablesNotSettled(text).map(problem => `${file} ${problem}; ${CN_TABLE_ADVICE}`));
  assert.deepEqual(problems, []);
});
test('the CN table check catches every way a script could read a CN table by itself, and passes art, Global and the settled source', () => {
  const pin = "${pinnedRef('yuanyan3060/ArknightsGameResource')}";
  const caught = [
    // The review's own mutation of sync-reward-names.mjs.
    `export const CN_TABLE = \`https://raw.githubusercontent.com/yuanyan3060/ArknightsGameResource/${pin}/gamedata/excel/item_table.json\`;`,
    "const url = `https://raw.githubusercontent.com/Kengxxiao/ArknightsGameData/${pinnedRef('Kengxxiao/ArknightsGameData')}/zh_CN/gamedata/excel/${file}`;",
    "const ref = process.env.ARKPEDIA_PIN_KENGXXIAO_ARKNIGHTSGAMEDATA || 'master';",
    "const [primary] = CN_TABLE_SOURCES; const base = `https://raw.githubusercontent.com/${primary.repository}/${pinnedRef(primary.repository)}/${primary.folder}`;",
    "const REPO = 'yuanyan3060/ArknightsGameResource'; fetch(`https://raw.githubusercontent.com/${REPO}/${pinnedRef(REPO)}/gamedata/levels/obt/main/level_main_01-01.json`);",
    "RAW = f'https://raw.githubusercontent.com/yuanyan3060/ArknightsGameResource/{CN_REF}/gamedata/excel'",
    "RAW = f'https://raw.githubusercontent.com/{REPO}/{ref}/gamedata'",
    "const base = `https://cdn.jsdelivr.net/gh/${repo}@${ref}/zh_CN/gamedata/excel`;",
    'curl "$(node scripts/content/pin-upstream.mjs raw-url yuanyan3060/ArknightsGameResource gamedata/excel/item_table.json)"',
    "rawUrl(root, repository, 'gamedata/excel/item_table.json')",
    'bash scripts/lib/upstream.sh cn-own https://github.com/yuanyan3060/ArknightsGameResource.git main \\\n  gamedata/excel gamedata/levels',
    "const table = JSON.parse(fs.readFileSync('.cache/upstream/cn-tables-fallback/gamedata/excel/item_table.json'));",
  ];
  for (const text of caught) assert.ok(cnTablesNotSettled(text).length, `not caught: ${text}`);
  const passed = [
    "const SOURCE = `https://raw.githubusercontent.com/yuanyan3060/ArknightsGameResource/${pinnedRef('yuanyan3060/ArknightsGameResource')}/item`;",
    "ITEM_ART = f'https://raw.githubusercontent.com/yuanyan3060/ArknightsGameResource/{CN_REF}/item'",
    "const RAW = `https://raw.githubusercontent.com/ArknightsAssets/ArknightsGamedata/${pinnedRef('ArknightsAssets/ArknightsGamedata')}/en/gamedata/excel`;",
    'curl "$(node scripts/content/pin-upstream.mjs raw-url PuppiizSunniiz/ArknightsGameData_YoStar en_US/gamedata/excel/charword_table.json)"',
    'bash scripts/lib/upstream.sh en-gamedata https://github.com/ArknightsAssets/ArknightsGamedata.git default \\\n  en/gamedata/excel en/gamedata/levels',
    "cn: cnTableUrl('excel/charword_table.json', env),",
    "const url = `https://raw.githubusercontent.com/${repo}/${revision}/${folder}/excel/${file}`;",
    "const CN = `${process.env.ARKPEDIA_CN || '.cache/upstream/cn-resource'}/gamedata/excel`;",
    "RAW_CN = subprocess.run(['node', PIN_UPSTREAM, 'cn-table-url', 'excel'], capture_output=True, text=True).stdout.strip()",
  ];
  for (const text of passed) assert.deepEqual(cnTablesNotSettled(text), [], text);
});
test('the daily refresh runs every command as a uniquely named stage that needs only earlier ones', () => {
  const stages = refreshStages();
  const seen = new Set<string>();
  for (const stage of stages) {
    assert.ok(!seen.has(stage.name), `${stage.name} is named once`);
    for (const need of stage.needs) assert.ok(seen.has(need), `${stage.name} needs ${need}, which must run before it`);
    seen.add(stage.name);
  }
  // The pin comes first, so every later stage reads the same commits, and then the CN tables,
  // before the catalogue or anything else reads one (scripts/content/cn-tables.mjs).
  assert.deepEqual(stages.slice(0, 2).map(stage => [stage.name, stage.command]), [
    ['pin-upstream', 'node scripts/content/pin-upstream.mjs'], ['upstream-cn', 'node scripts/content/cn-tables.mjs']]);
  // Only what no release can do without is an invariant: the game tables (CN from any of its
  // mirrors, EN) and the completeness gate. Every importer, wiki reader and downloader failing
  // costs its stage -- the CN art too, which only one mirror carries.
  assert.deepEqual(stages.filter(stage => stage.invariant).map(stage => stage.name), ['upstream-cn', 'upstream-en', 'completeness']);
  const art = stages.find(stage => stage.name === 'upstream-cn-art')!;
  assert.deepEqual([art.invariant, art.command], [false, 'node scripts/content/cn-tables.mjs art']);
  assert.ok(stages.find(stage => stage.name === 'item-icons')!.needs.includes('upstream-cn-art'), 'item-icons keeps its records on a day without the art');
  // Not cc-stages: skipped, it would take the whole stage build back with it (--output), and
  // it needs the art only for renders the image repository does not publish yet.
  assert.ok(!stages.find(stage => stage.name === 'cc-stages')!.needs.includes('upstream-cn-art'));
  // Run on its own, the stage-data refresh settles the CN tables itself, right after its pin.
  assert.match(fs.readFileSync('scripts/sync/refresh-stage-data.sh', 'utf8'),
    /stage pin-upstream -- node scripts\/content\/pin-upstream\.mjs\n(?:\s*#[^\n]*\n)*\s*stage upstream-cn --invariant --timeout-minutes \d+ -- node scripts\/content\/cn-tables\.mjs\nfi\n/);
  assert.equal(stages.at(-1)!.name, 'completeness');
  for (const script of ['sync-catalogue.mjs', 'import_ra_maps.py', 'import-nation-marks.py', 'sync-recurring-banners.mjs', 'import-reward-icons.py', 'import-item-icons.mjs', 'charword_table.json']) {
    assert.ok(stages.some(stage => stage.command.includes(script) && !stage.invariant), `${script} runs in a stage that is not an invariant`);
  }
  // The three steps that finish the stage build's own files in place say so, so that one
  // failing takes the build back with it instead of publishing its raw output (the index
  // with every variant and every excluded mode, CC# labels, RA stages without their maps).
  const of = (name: string) => stages.find(stage => stage.name === name)!;
  for (const [name, output] of [['stage-index', 'public/stages-index.json'], ['cc-stages', 'data/stages-content.json'], ['ra-maps', 'data/stages']]) {
    assert.ok(of(name).needs.includes('stage-dataset') && of(name).outputs.includes(output), `${name} --needs stage-dataset --output ${output}`);
  }
  // The completeness gate's holds are true whether or not an invariant stops the release.
  assert.deepEqual(of('completeness').keep, ['data/quarantine.json']);
  // No command of the refresh runs outside a stage.
  const step = fs.readFileSync('.github/workflows/prepare-content.yml', 'utf8').split('- name: Refresh supported upstream records')[1].split('- name: Validate and compile data')[0];
  const run = step.slice(step.indexOf('run: |') + 'run: |'.length).replace(/\\\n\s*/g, ' ').split('\n').map(line => line.trim()).filter(line => line && !line.startsWith('#'));
  const plumbing = /^(set -euo pipefail|stage\(\) \{.*\}|node scripts\/content\/run-stage\.mjs begin|trap .*|supplemental_charwords=.*|supplement=.*|if \[ ! -s "\$supplement" \].*|bash scripts\/sync\/refresh-stage-data\.sh)$/;
  for (const line of run) assert.ok(line.startsWith('stage ') || plumbing.test(line), `outside a stage: ${line}`);
});
