import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { getBaseStats, getTrustBonus, clampInteger, STAT_KEYS, OperatorStats, StatPhase } from '../lib/operators/operatorStats';
import { Operator } from '../lib/operators/operatorTypes';
import { readCsv } from './lib/operator-csv';
import { getBaseSkillIconPath, getSkillIconPath } from '../lib/operators/operatorIconPaths';
import { getOperatorIconPath } from '../lib/operators/operatorIcon';
import { getOperatorSearchResults } from '../lib/operators/operatorSearch';

const operators: Operator[] = [1, 2, 3, 4, 5, 6].flatMap(star => {
  const dir = `data/operators-${star}star`;
  return fs.readdirSync(dir).filter(file => file.endsWith('.json')).map(file => JSON.parse(fs.readFileSync(`${dir}/${file}`, 'utf8')));
});
const op = (name: string) => { const found = operators.find(row => row.name === name); assert(found); return found; };
const stats = (name: string) => { const found = op(name).stats; assert(found); return found; };

test('all roster records have complete, finite stats and nonempty archives', () => {
  assert.equal(operators.length, 427);
  for (const operator of operators) {
    assert(operator.stats?.phases.length, operator.name);
    assert(operator.files?.length, operator.name);
    for (const phase of operator.stats.phases) {
      for (let level = phase.minLevel; level <= phase.maxLevel; level++) {
        assert(STAT_KEYS.every(key => Number.isFinite(getBaseStats(phase, level)[key])), `${operator.name} E${phase.elite} L${level}`);
      }
    }
    assert(operator.files.every(file => file.section && file.unlock && file.description), operator.name);
  }
});

test('promotion costs use the flat material list consumed by operator pages', () => {
  for (const operator of operators) {
    for (const tier of operator.promotion) {
      assert(Array.isArray(tier.cost), `${operator.name} ${tier.tier}`);
      for (const material of tier.cost) {
        assert.equal(typeof material.name, 'string', `${operator.name} ${tier.tier}`);
        assert(Number.isFinite(Number(material.quantity)), `${operator.name} ${material.name}`);
      }
    }
  }
  assert.deepEqual(op('Amiya').promotion[0].cost.find(item => item.name === 'LMD'), { name: 'LMD', quantity: 20000 });
});

test('Amiya promotion endpoints, mid-level rounding, and promotion-dependent costs', () => {
  const phases = stats('Amiya').phases;
  assert.deepEqual(getBaseStats(phases[0], 1), { hp: 699, atk: 276, def: 48, res: 10, redeploy: 70, dp: 18, block: 1, interval: 1.6 });
  assert.deepEqual(getBaseStats(phases[0], 2), { hp: 704, atk: 278, def: 49, res: 10, redeploy: 70, dp: 18, block: 1, interval: 1.6 });
  assert.equal(getBaseStats(phases[1], 1).dp, 20);
  assert.equal(getBaseStats(phases[2], 80).atk, 612);
});

test('level limits, single-level phases, and supplied exceptions', () => {
  const phase = stats('Exusiai').phases[0];
  assert.deepEqual(getBaseStats(phase, -10), phase.base);
  assert.deepEqual(getBaseStats(phase, 999), phase.max);
  assert.deepEqual(getBaseStats(phase, NaN), phase.base);
  const single: StatPhase = { ...phase, minLevel: 1, maxLevel: 1, max: phase.base };
  assert.deepEqual(getBaseStats(single, 50), phase.base);
  const exception = { ...phase, overrides: { '2': { atk: 999 } } };
  assert.equal(getBaseStats(exception, 2).atk, 999);
  assert.equal(clampInteger(6.9, 1, 10), 6);
  assert.equal(clampInteger(Infinity, 1, 10), 1);
});

test('trust uses battle phases, rounds the bonus, and caps at 100%', () => {
  const amiya = stats('Amiya');
  assert.deepEqual(getTrustBonus(amiya, 0), { hp: 0, atk: 0, def: 0 });
  assert.deepEqual(getTrustBonus(amiya, 50), { hp: 100, atk: 35, def: 0 });
  assert.deepEqual(getTrustBonus(amiya, 100), { hp: 200, atk: 70, def: 0 });
  assert.deepEqual(getTrustBonus(amiya, 200), getTrustBonus(amiya, 100));
  assert.deepEqual(getTrustBonus(amiya, -1), getTrustBonus(amiya, 0));
  assert.deepEqual(getTrustBonus(amiya, NaN), getTrustBonus(amiya, 0));
  const exusiai = stats('Exusiai');
  assert.equal(getTrustBonus(exusiai, 1).atk, 0);
  assert.equal(getTrustBonus(exusiai, 2).atk, 2);
  assert.equal(getTrustBonus(exusiai, 3).atk, 2);
  assert.equal(getTrustBonus(exusiai, 99).atk, 88);
  assert.equal(getTrustBonus(exusiai, 100).atk, 90);
  const zero: OperatorStats = { ...amiya, trust: { hp: 0, atk: 0, def: 0 } };
  assert.deepEqual(getTrustBonus(zero, 200), { hp: 0, atk: 0, def: 0 });
});

test('rarity and class forms keep their own promotion limits and files', () => {
  assert.deepEqual(stats('Lancet-2').phases.map(phase => phase.maxLevel), [30]);
  assert.deepEqual(stats('Kroos').phases.map(phase => phase.maxLevel), [40, 55]);
  for (const [name, form] of [['Amiya', 'Caster'], ['Amiya (Guard)', 'Guard'], ['Amiya (Medic)', 'Medic']]) {
    assert(op(name).files!.every(file => file.section.includes(form)), name);
  }
  assert(!op('Amiya (Guard)').files!.some(file => file.section.includes('Clinical Analysis (Medic)')));
  assert(!op('Amiya (Medic)').files!.some(file => file.section.includes('Clinical Analysis (Caster / Guard)')));
  assert.notEqual(stats('Amiya (Medic)').phases[2].max.atk, stats('Amiya').phases[2].max.atk);
  assert.equal(op('Raidian').internalName, 'char_4195_radian');
  assert.equal(op('Mechanist').internalName, 'char_4230_mcnist');
});

test('CSV parser preserves paragraph breaks, quotes and Unicode, and rejects malformed data', () => {
  assert.deepEqual(readCsv('\uFEFFname,text\r\nAmiya,"Line one, then ""quoted""\r\n\r\n■■■"\r\n'), [{ name: 'Amiya', text: 'Line one, then "quoted"\r\n\r\n■■■' }]);
  assert.throws(() => readCsv('name,text\na,"unfinished'));
  assert.throws(() => readCsv('name,text\na,b,c'));
  assert.throws(() => readCsv('name,name\na,b'));
});

// Optional full parity audit against the original supplied CSV (never needed in CI).
if (process.env.OPERATOR_STATS_CSV) {
  test('every imported level matches the supplied CSV across all eight stats', () => {
    const byId = new Map(operators.map(operator => [operator.internalName, operator]));
    const columns = { hp: 'max_hp', atk: 'attack', def: 'defense', res: 'resistance', redeploy: 'redeploy_time', dp: 'dp_cost', block: 'block_count', interval: 'attack_interval' };
    let count = 0;
    for (const row of readCsv(fs.readFileSync(process.env.OPERATOR_STATS_CSV!, 'utf8'))) {
      const operator = byId.get(row.character_id);
      if (!operator) continue;
      const phase = operator.stats!.phases.find(item => item.elite === Number(row.elite));
      assert(phase);
      const actual = getBaseStats(phase, Number(row.level));
      for (const key of STAT_KEYS) assert.equal(actual[key], Number(row[columns[key]]), `${operator.name} E${row.elite} L${row.level} ${key}`);
      count++;
    }
    assert.equal(count, 82090);
  });
}

test('skill image URLs encode Unicode and URL delimiters before image optimization', () => {
  for (const [path, filename] of [
    [getBaseSkillIconPath('Thorns the Lodestar', 'Metalwork α'), '/base-skill-icons/Thorns the Lodestar - Metalwork α.webp'],
    [getSkillIconPath('Amiya', 'Tactical Chant γ'), '/skill-icons/Amiya - Tactical Chant γ.webp'],
  ]) {
    assert(path);
    assert(!/[^\x00-\x7f]/.test(path));
    assert.equal(decodeURIComponent(path), filename);
  }
  const path = getSkillIconPath('Test #1', 'A & B 50%');
  assert(path);
  assert.equal(new URL(path, 'http://localhost').hash, '');
  assert.equal(decodeURIComponent(path), '/skill-icons/Test #1 - A & B 50%.webp');
});

test('operator portraits preserve names through URL encoding for every rarity and future icons', () => {
  for (const operator of operators) {
    const icon = getOperatorIconPath(operator);
    const parsed = new URL(icon, 'http://localhost');
    assert(!/[^\x00-\x7f]/.test(icon), operator.name);
    assert.equal(parsed.hash, '');
    assert.equal(parsed.search, '');
    const name = operator.name.replace(/[\\/*?:"<>|]/g, '').trim();
    assert.equal(decodeURIComponent(parsed.pathname.split('/').pop()!), operator.isFuture ? `${operator.name}.webp` : `${name} - Base.webp`);
  }
  assert.equal(getOperatorIconPath(op("Wiš'adel")), "/six-star-icons/Wi%C5%A1'adel%20-%20Base.webp");
  const future = getOperatorIconPath({ name: 'Test é #1 & 50%', rarity: 6, isFuture: true });
  assert.equal(decodeURIComponent(future), '/future_operator_icons/Test é #1 & 50%.webp');
  assert.equal(new URL(future, 'http://localhost').hash, '');
});

test('operator quick search accepts plain spellings, accents, apostrophes and partial names', () => {
  for (const [query, expected] of [
    ['wisadel', "Wiš'adel"], ['WIŠ’ADEL', "Wiš'adel"], ['mlynar', 'Młynar'],
    [' MŁYNAR ', 'Młynar'], ['pozemka', 'Pozëmka'], ['kaltsit', "Kal'tsit"],
    ['chen', "Ch'en"], ['hoolheyak', "Ho'olheyak"], ['hv it', ''],
    ['hvit aska', 'Eyjafjalla the Hvít Aska'], ['wis', "Wiš'adel"],
  ]) {
    if (expected) assert(getOperatorSearchResults(operators, query).some(op => op.name === expected), query);
    else assert.deepEqual(getOperatorSearchResults(operators, query), []);
  }
  assert.deepEqual(getOperatorSearchResults([op('Młynar')], 'mlynar'), [op('Młynar')]);
  assert.deepEqual(getOperatorSearchResults(operators, '   '), []);
  assert.deepEqual(getOperatorSearchResults(operators, "'"), []);
  assert.deepEqual(getOperatorSearchResults(operators, 'not-an-operator-name'), []);
});

test('operator quick search ranks normalized prefixes first without mutating its input', () => {
  const candidates = [{name:'Franka'}, {name:'Ansel'}, {name:'Manticore'}, {name:'Andreana'}];
  assert.deepEqual(getOperatorSearchResults(candidates, 'an').map(op => op.name), ['Andreana', 'Ansel', 'Franka', 'Manticore']);
  assert.equal(candidates[0].name, 'Franka');
  assert.equal(getOperatorSearchResults(operators, 'a').length, 8);
});

// Activation duration and the duration of a thrown unit are different game fields.
import { getSkillTiming, SkillTiming } from '../lib/operators/skillTiming';
import SKILL_TIMINGS from '../data/skill-timings.json';
import { getSkillList } from '../lib/operators/operatorTypes';

test('Thorns the Lodestar displays level-specific target-effect durations', () => {
  const operator = op('Thorns the Lodestar');
  const timing = SKILL_TIMINGS.operators[operator.internalName as keyof typeof SKILL_TIMINGS.operators] as SkillTiming[][];
  const expected = [[5, 8], [10, 15], [18, 23]];
  getSkillList(operator).forEach((skill, index) => {
    for (const [levelIndex, seconds] of [[0, expected[index][0]], [9, expected[index][1]]]) {
      assert.deepEqual(getSkillTiming(skill.levels[levelIndex], skill, timing[index][levelIndex]), { label: 'Target effect', value: `${seconds}s` });
    }
  });
});

test('skill timings preserve finite and infinite durations without inventing missing data', () => {
  const skill = getSkillList(op('Thorns'))[2];
  const level = { ...skill.levels[9], description: null };
  assert.deepEqual(getSkillTiming({ ...level, duration: '∞' }, skill, { kind: 'instant' }), { label: 'Duration', value: '∞' });
  assert.deepEqual(getSkillTiming({ ...level, duration: 30 }, skill, { kind: 'effect', seconds: 5 }), { label: 'Duration', value: '30s' });
  assert.deepEqual(getSkillTiming({ ...level, duration: '–' }, skill, { kind: 'ammo' }), { label: 'Duration', value: 'Ammo-based' });
  assert.deepEqual(getSkillTiming({ ...level, duration: '–' }, skill, null), { label: 'Duration', value: '—' });
});

test('supplemental timings match the operator skill slots and level counts', () => {
  for (const operator of operators) {
    const timings = SKILL_TIMINGS.operators[operator.internalName as keyof typeof SKILL_TIMINGS.operators];
    if (!timings) continue;
    const skills = getSkillList(operator);
    assert.equal(timings.length, skills.length, operator.name);
    timings.forEach((levels, index) => {
      assert.equal(levels.length, skills[index].levels.length, `${operator.name} S${index + 1}`);
      for (const timing of levels) {
        if (timing && 'seconds' in timing) assert(typeof timing.seconds === 'number' && Number.isFinite(timing.seconds) && timing.seconds > 0);
      }
    });
  }
});

test('indefinite skills do not become instant when the scraped duration is empty', () => {
  for (const name of ['Fiammetta', 'Vina Victoria', 'Marcille']) {
    const skill = getSkillList(op(name)).find(skill => skill.levels.some(level => /Unlimited duration/i.test(level.description ?? '')))!;
    assert(skill, name);
    assert.deepEqual(getSkillTiming(skill.levels[0], skill, { kind: 'instant' }), { label: 'Duration', value: '∞' });
  }
});
