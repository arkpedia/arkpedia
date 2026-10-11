import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import { certificateMonths, certificateSpending, certShopPurchase } from '../../lib/pulls/incomeSettings';
import { serverClockAt } from '../../lib/time/serverReset';
import { readRecruitmentView, recruitmentViewHash } from '../../lib/gacha/recruitmentViewState';
import { summonStats, type Summon } from '../../lib/operators/summonStats';
import { skillTechniques } from '../../lib/techniques/autoTechniques';

test('monthly yellow certificates buy complete sequential tiers and spend holdings only once', () => {
  for (const [budget, spent, pulls] of [[9, 0, 0], [10, 10, 1], [27, 10, 1], [28, 28, 3], [68, 68, 8], [138, 138, 18], [258, 258, 38], [999, 258, 38]]) assert.deepEqual(certShopPurchase(budget), { spent, pulls });
  const from = new Date('2026-10-08T12:00Z'), to = new Date('2027-01-15T12:00Z');
  assert.deepEqual(certificateMonths(from, to), ['2026-10', '2026-11', '2026-12', '2027-01']);
  const result = certificateSpending(from, to, 300, { '2026-10': 258, '2026-11': 0, '2026-12': 68, '2027-01': 258 });
  assert.equal(result.pulls, 42); assert.equal(result.spent, 296); assert.equal(result.left, 4);
  assert.equal(result.rows[1].pulls, 0); assert.equal(result.rows[2].pulls, 3); assert.equal(result.rows[2].short, 40);
  assert.equal(certificateSpending(from, new Date('2026-11-15T12:00Z'), 1000, { '2026-12': 258 }).pulls, 0);
  assert.equal(certificateSpending(from, to, 1000, {}).pulls, 0);
});
test('server reset changes at exactly 04:00 and JP/KR share UTC+9', () => {
  const before = new Date('2026-10-08T18:59Z'), at = new Date('2026-10-08T19:00Z');
  assert.equal(serverClockAt(before, 'jp').clock, '03:59');
  assert.equal(serverClockAt(before, 'jp').reset, at.getTime());
  assert.equal(serverClockAt(at, 'jp').reset, at.getTime() + 86_400_000);
  assert.deepEqual(serverClockAt(at, 'jp'), serverClockAt(at, 'kr'));
  assert.equal(serverClockAt(at, 'en').clock, '12:00');
  assert.equal(serverClockAt(new Date('2026-10-08T10:59Z'), 'en').reset, Date.parse('2026-10-08T11:00Z'));
});
test('localized tags retain canonical selection and pop-out text preferences', () => {
  const state = { selectedTags: ['Guard', 'DPS'], showAllPossibilities: false, activeSection: 'calculator' as const, cheatSheetSearch: '', language: 'jp' as const, textSize: 20 };
  assert.deepEqual(readRecruitmentView(recruitmentViewHash(state), state.selectedTags), state);
  assert.equal(readRecruitmentView('#lang=bogus&size=999', []).textSize, 22);
  const labels = JSON.parse(fs.readFileSync('data/recruitment-tag-labels.json', 'utf8')).tags;
  for (const tag of Object.keys(labels)) for (const lang of ['en', 'jp', 'kr', 'cn']) assert.ok(labels[tag][lang], `${tag}/${lang}`);
  assert.equal(labels.Guard.jp, '前衛タイプ'); assert.equal(labels.Guard.kr, '가드'); assert.equal(labels.Guard.cn, '近卫干员');
});
test('concrete summon stats interpolate within the selected promotion and clamp levels', () => {
  const all = JSON.parse(fs.readFileSync('data/operator-summons.json', 'utf8')) as Record<string, Summon[]>;
  const mon3tr = all.char_003_kalts.find(summon => summon.id === 'token_10002_kalts_mon3tr')!;
  assert.equal(summonStats(mon3tr, 2, 90).maxHp, 5433);
  assert.equal(summonStats(mon3tr, 2, 1000).maxHp, 5433);
  assert.equal(summonStats(mon3tr, 2, 1).maxHp, 4292);
  for (const summons of Object.values(all)) for (const summon of summons) for (const phase of summon.phases) for (const frame of phase.frames) for (const value of Object.values(frame.stats)) assert.ok(Number.isFinite(value), summon.id);
});
test('recovery techniques use the skill recovery field rather than words in its description', () => {
  const op = { name: 'Example', rarity: 6, branch: 'Lord', class: 'Guard' };
  for (const recoveryType of ['Offensive Recovery', 'Defensive Recovery']) assert.ok(skillTechniques(op, { levels: [], recoveryType }).some(tech => tech.name === recoveryType));
  assert.ok(!skillTechniques(op, { levels: [], recoveryType: 'Auto Recovery' }).some(tech => tech.name?.includes('Recovery')));
});
test('reviewed acquisition corrections keep Steward out of pure recruitment', () => {
  for (const [name, folder, head] of [['Steward', '3star', 'Yes'], ['Adnachiel', '3star', 'No'], ['Purestream', '4star', 'No'], ['Estelle', '4star', 'No']]) {
    const op = JSON.parse(fs.readFileSync(`data/operators-${folder}/${name}.json`, 'utf8'));
    assert.equal(op.howToObtain.Recruitment, 'Yes'); assert.equal(op.howToObtain['Standard Headhunting'], head); assert.equal(op.howToObtain['Kernel Headhunting'], head);
  }
});
