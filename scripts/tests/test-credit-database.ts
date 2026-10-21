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

test('a release compiled before the name rule renders one card per person', async () => {
  const { upgradeCreditProps } = await import('../../lib/operators/creditDatabase');
  const entry = (name: string, credit = 'Operator artwork') => ({ name, icon: null, credits: [credit] });
  const people = [
    { name: 'Lowro & Studio Montagne', operators: [entry('Bellone')] },
    { name: 'Studio Montagne', operators: [entry('Aegis')] },
    { name: 'ASK', operators: [entry('Surtr', 'Colorful Wonderland CW03')] },
    { name: 'Ask', operators: [entry('Surtr'), entry('Entelechia')] },
    { name: '〇亻 (credited as "Ubisoft" in-game)', operators: [entry('Ela')] },
    { name: '〇亻', operators: [entry('Mitm')] },
  ];
  const expected = [
    { name: 'Ask', operators: [{ name: 'Entelechia', credits: ['Operator artwork'] }, { name: 'Surtr', credits: ['Colorful Wonderland CW03', 'Operator artwork'] }] },
    { name: 'Lowro', operators: [{ name: 'Bellone', credits: ['Operator artwork'] }] },
    { name: 'Studio Montagne', operators: [{ name: 'Aegis', credits: ['Operator artwork'] }, { name: 'Bellone', credits: ['Operator artwork'] }] },
    { name: '〇亻', operators: [{ name: 'Ela', credits: ['Operator artwork'] }, { name: 'Mitm', credits: ['Operator artwork'] }] },
  ].sort((a, b) => a.name.localeCompare(b.name));
  // The shape from before the filters, and the current shape with the old names.
  assert.deepEqual(upgradeCreditProps({ people }).people, expected);
  const current = upgradeCreditProps({ people: [] });
  const withOldNames = { ...current, people: people.map(p => ({ name: p.name, operators: p.operators.map(({ name, credits }) => ({ name, credits })) })) };
  assert.deepEqual(upgradeCreditProps(withOldNames).people, expected);
});
