import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const root = process.cwd();
const audit = path.join(root, 'scripts/audits/audit-techniques-vs-gamedata.ts');

test('a new operator and module pass with matching evidence and block on incorrect sources', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'technique-release-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const operators = path.join(dir, 'data/operators-6star');
  fs.mkdirSync(operators, { recursive: true });
  const write = (filename: string, data: unknown) => fs.writeFileSync(path.join(dir, filename), JSON.stringify(data));
  const hit = 'Enemies have -20% Physical and Arts hit rate';
  const reveal = 'Reveals Invisible enemies within range';
  const character = { talents: [{ candidates: [{ isHideTalent: true }] }, { candidates: [{ name: 'Cloud I', description: hit }] }] };
  write('character_table.json', { char_test: character });
  write('char_patch_table.json', { patchChars: { char_alternate: {} } });
  write('skill_table.json', { unused: {} });
  write('uniequip_table.json', { charEquip: { char_test: ['equip_test'] }, equipDict: { equip_test: { typeIcon: 'TEST-X' } } });
  write('battle_equip_table.json', { equip_test: { phases: [{ parts: [{ overrideTraitDataBundle: { candidates: [{ additionalDescription: reveal }] } }] }] } });
  const op = {
    internalName: 'char_test', name: 'New operator', rarity: 6,
    talents: [{ name: 'Cloud', rows: [{ name: 'Cloud I', description: hit }], technique: [{ name: 'Hit Rate Down' }] }],
    modules: [{ moduleId: 'equip_test', type: 'Upgrade', stages: [{ stage: 'Stage 1', effectText: reveal }] }],
  };
  const run = () => spawnSync(process.execPath, ['--import', require.resolve('tsx'), audit, '--strict'], {
    cwd: dir, encoding: 'utf8', env: { ...process.env, ARKPEDIA_EN_EXCEL: dir, TSX_TSCONFIG_PATH: path.join(root, 'tsconfig.json') },
  });
  write('data/operators-6star/New.json', op);
  const clean = run();
  assert.equal(clean.status, 0, clean.stderr + clean.stdout);

  op.talents[0].technique[0].name = 'Hit Reduction';
  op.modules[0].stages[0].effectText = 'Increases ATK';
  write('data/operators-6star/New.json', op);
  const wrong = run();
  assert.equal(wrong.status, 1, wrong.stderr);
  assert.match(wrong.stdout, /New operator \[Cloud\] tagged Hit Reduction, wording indicates Hit Rate Down/);
  assert.match(wrong.stdout, /New operator \[TEST-X Stage 1\] game only: Reveal Invisibility/);

  op.modules = [];
  write('data/operators-6star/New.json', op);
  assert.match(run().stdout, /New operator \[equip_test\] module missing from operator record/);

  fs.unlinkSync(path.join(dir, 'char_patch_table.json'));
  assert.notEqual(run().status, 0, 'missing reference tables must stop publication');
});
