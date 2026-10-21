import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { test } from 'node:test';

test('a cold credit builder refuses missing source data instead of publishing empty lists', () => {
  // Use a separate process: other page tests populate getAllOperators' module cache,
  // which concealed the production failure when they changed to a directory without data/.
  execFileSync(process.execPath, ['--import', 'tsx', '-e', `
    const assert = require('node:assert/strict');
    const fs = require('node:fs');
    const os = require('node:os');
    const path = require('node:path');
    const cwd = process.cwd();
    const modulePath = path.join(cwd, 'lib/operators/creditDatabase.ts');
    const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'credit-database-no-data-'));
    try {
      process.chdir(empty);
      const { creditDatabase } = require(modulePath);
      for (const kind of ['artists', 'voice-actors']) {
        assert.throws(() => creditDatabase(kind), /no operator credits in the source data/);
      }
    } finally {
      process.chdir(cwd);
      fs.rmSync(empty, { recursive: true, force: true });
    }
  `], { cwd: process.cwd(), stdio: 'pipe' });
});

test('a release from before the filters renders: its { people } upgrades, placeholders to Uncredited', async () => {
  const { upgradeCreditProps } = await import('../../lib/operators/creditDatabase');
  const old = { people: [
    { name: '-', operators: [{ name: 'Miss.Christine', icon: '/a.webp', credits: ['Japanese'] }] },
    { name: 'Abby Trott', operators: [{ name: 'Kafka', icon: '/k.webp', credits: ['English'] }] },
  ] };
  const next = upgradeCreditProps(old);
  assert.deepEqual(next.people, [{ name: 'Abby Trott', operators: [{ name: 'Kafka', credits: ['English'] }] }]);
  assert.deepEqual(next.uncredited, [{ name: 'Miss.Christine', credits: ['Japanese'] }]);
  assert.deepEqual(next.operators.map(op => [op.name, op.icon, op.rarity]), [['Kafka', '/k.webp', null], ['Miss.Christine', '/a.webp', null]]);
  // A current release passes through untouched.
  assert.equal(upgradeCreditProps(next), next);
});
