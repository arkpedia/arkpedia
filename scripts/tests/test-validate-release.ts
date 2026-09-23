import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const surtr = JSON.parse(fs.readFileSync('data/operators-6star/Surtr.json', 'utf8'));
const assets = Object.fromEntries(['image-assets', 'skin-assets', 'color-palette', 'voice-english', 'voice-japanese', 'voice-korean', 'voice-mandarin', 'voice-regional']
  .map(repo => [`arkpedia-${repo}`, 'a'.repeat(40)]));
// Validates a release holding one edited operator record and returns the error it stops
// on. The release has no source hashes, so a record that passes the record checks stops
// at the next check, 'Source records changed without regenerating the release'.
function validate(edit: (op: any) => void) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'arkpedia-release-'));
  try {
    const op = structuredClone(surtr);
    edit(op);
    fs.mkdirSync(path.join(root, 'release'));
    fs.mkdirSync(path.join(root, 'source/data/operators-6star'), { recursive: true });
    fs.writeFileSync(path.join(root, 'release/manifest.json'), JSON.stringify({ schema: 2, release: 'b'.repeat(64), generator: 'c'.repeat(40), assets, pages: {}, files: {} }));
    fs.writeFileSync(path.join(root, 'source/data/operators-6star/Surtr.json'), JSON.stringify(op));
    const run = spawnSync(process.execPath, ['scripts/content/validate-release.mjs', root], { encoding: 'utf8' });
    assert.notEqual(run.status, 0);
    return run.stderr;
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

test('the release validator refuses nested costs and undated operators before they reach data main', () => {
  const passes = /Source records changed without regenerating the release/;
  assert.match(validate(() => {}), passes);
  assert.match(validate(op => { op.potential.totalCost = []; }), passes);
  assert.match(validate(op => { op.characterInfo['Release Date'] = ''; op.isFuture = true; }), passes);
  // The hand-written Persona shape that crashed the image sync, and its relatives.
  assert.match(validate(op => { op.potential.totalCost = [[{ name: "Surtr's Token", quantity: 5 }]]; }), /Surtr\.json: potential\.totalCost\[0\] must be \{ name, quantity \}/);
  assert.match(validate(op => { op.promotion[0].cost = [op.promotion[0].cost]; }), /Surtr\.json: promotion\[0\]\.cost\[0\] must be/);
  assert.match(validate(op => { op.skills.skillList[0].cost.m1 = [op.skills.skillList[0].cost.m1]; }), /Surtr\.json: skills\.skillList\[0\]\.cost\.m1\[0\] must be/);
  assert.match(validate(op => { op.modules[1].stages[0].cost[0].quantity = '5'; }), /Surtr\.json: modules\[1\]\.stages\[0\]\.cost\[0\] must be/);
  // With neither a date nor the flag, the site lists the operator as released today.
  assert.match(validate(op => { op.characterInfo['Release Date'] = null; delete op.isFuture; }), /Surtr\.json: needs a Global 'Release Date'/);
});
