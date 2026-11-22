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
  write('data/operator-translations.json', {});
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
    cwd: dir, encoding: 'utf8', env: { ...process.env, ARKPEDIA_EN_EXCEL: dir, ARKPEDIA_CN_EXCEL: dir, TSX_TSCONFIG_PATH: path.join(root, 'tsconfig.json') },
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

test('the pinned CN source catches translation errors, wrong hit tags and missing modules before Global release', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'technique-cn-release-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  for (const sub of ['en', 'cn', 'data/operators-6star']) fs.mkdirSync(path.join(dir, sub), { recursive: true });
  const put = (filename: string, value: unknown) => fs.writeFileSync(path.join(dir, filename + '.json'), JSON.stringify(value));
  const accuracy = '使周围敌人的物理和法术命中率-20%';
  const invisible = '在集成战略中，可以攻击隐匿敌人';
  const text = 'Enemies have -20% Physical and Arts hit rate';
  const translated = 'Can attack Invisible enemies in Integrated Strategies';
  const cnOnly = { internalName: 'char_new', sourceRegion: 'CN', name: 'New arrival', rarity: 6,
    talents: [{ name: 'Smoke', rows: [{ description: text }], technique: [{ name: 'Hit Rate Down' }] }] };
  const global = { internalName: 'char_global', name: 'Global operator', rarity: 6, trait: 'Deals Arts damage',
    modules: [{ name: 'ISW-α: Module', type: 'Upgrade', stages: [{ stage: 'Stage 1', effectText: invisible }] }] };
  const overlay = { char_global: { strings: { [invisible]: translated }, translator: 'Arkpedia' } };
  for (const region of ['en', 'cn']) {
    put(region + '/char_patch_table', {patchChars: { char_form: {} }});
    put(region + '/skill_table', { unused: {} });
    put(region + '/character_table', region === 'en' ? { char_global: { description: global.trait } } :
      { char_global: { description: accuracy }, char_new: { talents: [{ candidates: [{ description: accuracy }] }] } });
    put(region + '/uniequip_table', { charEquip: { char_global: region === 'cn' ? ['cn_mod'] : [] }, equipDict: { cn_mod: { typeIcon: 'isw-a' } } });
    put(region + '/battle_equip_table', region === 'en' ? { unused: {} } : { cn_mod: { phases: [{ parts: [{ overrideTraitDataBundle: { candidates: [{ additionalDescription: invisible }] } }] }] } });
  }
  put('data/operator-translations', overlay);
  put('data/operators-6star/new', cnOnly);
  put('data/operators-6star/global', global);
  const run = () => spawnSync(process.execPath, ['--import', require.resolve('tsx'), audit, '--strict'], {
    cwd: dir, encoding: 'utf8', env: { ...process.env, ARKPEDIA_EN_EXCEL: path.join(dir, 'en'), ARKPEDIA_CN_EXCEL: path.join(dir, 'cn'), TSX_TSCONFIG_PATH: path.join(root, 'tsconfig.json') },
  });
  const clean = run();
  assert.equal(clean.status, 0, clean.stdout + clean.stderr);
  assert.match(clean.stdout, /1 CN-only operators and 1 CN-only modules/);

  overlay.char_global.strings[invisible] = 'Can attack Camouflaged enemies';
  put('data/operator-translations', overlay);
  cnOnly.talents[0].technique[0].name = 'Hit Reduction';
  put('data/operators-6star/new', cnOnly);
  const wrong = run();
  assert.equal(wrong.status, 1);
  assert.match(wrong.stdout, /New arrival \[CN Talent 1\] record indicates Hit Reduction, Chinese wording indicates Hit Rate Down/);
  assert.match(wrong.stdout, /Global operator \[CN cn_mod Stage 1\] game only: Reveal Invisibility/);

  put('data/operators-6star/global', { ...global, modules: [] });
  assert.match(run().stdout, /Global operator \[CN cn_mod\] module missing/);
  fs.unlinkSync(path.join(dir, 'cn', 'battle_equip_table.json'));
  assert.match(run().stderr, /ENOENT.*battle_equip_table/);
});
