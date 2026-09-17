import assert from 'node:assert/strict';
import test from 'node:test';
import { gzipSync } from 'node:zlib';
import { getAllOperators } from '../../lib/operators/operators';
import { getSkillList } from '../../lib/operators/operatorTypes';
import type { GuesserOperator } from '../../lib/operators/operatorTypes';
import { getAllSkins } from '../../lib/skins/skins';
import { buildHintPool } from '../../lib/guesser/guesserLogic';
import { ALL_HINT_TYPES, HINT_GROUPS, THEMED_MODES } from '../../lib/guesser/guesserTypes';
import type { Hint, HintType } from '../../lib/guesser/guesserTypes';
import { toGuesserOperator } from '../../lib/guesser/guesserPageData';

const operators = getAllOperators();
const skins = getAllSkins().map(({ name, model, illustrator }) => ({ name, model, illustrator }));
const allTypes = ALL_HINT_TYPES.map(({ type }) => type);
const sortHints = (hints: Hint[]) => hints.map((hint) => JSON.stringify(hint)).sort();

function assertSameHints(full: GuesserOperator, compact: GuesserOperator, types: HintType[]) {
  // Illustrator selection and hint ordering are randomized. Give each
  // input the same random sequence so we compare data, not two draws.
  function seededHints(op: GuesserOperator) {
    const originalRandom = Math.random;
    let seed = 29;
    Math.random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
    try {
      return sortHints(buildHintPool(op, new Set(types), skins));
    } finally {
      Math.random = originalRandom;
    }
  }
  assert.deepEqual(
    seededHints(compact),
    seededHints(full),
    `${full.name}: ${types.join(', ')}`,
  );
}

test('every operator retains every hint and themed hint pool after serialization', () => {
  assert.ok(operators.length > 400, 'exercise the real operator catalogue');
  for (const op of operators) {
    const compact: GuesserOperator = JSON.parse(JSON.stringify(toGuesserOperator(op), (key, value) => {
      assert.notEqual(value, undefined, `${op.name}.${key} must be serializable by Next.js`);
      return value;
    }));
    assert.equal(compact.characterInfo?.['Release Date'], op.characterInfo?.['Release Date']);
    assertSameHints(op, compact, allTypes);
    for (const type of allTypes) assertSameHints(op, compact, [type]);
    for (const mode of THEMED_MODES) assertSameHints(op, compact, mode.hints.map(({ type }) => type));
  }
});

test('array and nested skill schemas retain first M3 and last talent description semantics', () => {
  const original = operators.find((op) => getSkillList(op).some((skill) => skill.levels.length > 1))!;
  const skills = getSkillList(original);
  const first = skills[0];
  const levels = [
    { ...first.levels[0], mastery: 3, description: 'First M3 description' },
    { ...first.levels[0], mastery: 3, description: 'Second M3 description' },
  ];
  for (const skillData of [
    [{ ...first, levels }],
    { skillList: [{ ...first, levels }], skillCost: null },
    [],
  ]) {
    const op = {
      ...original,
      skills: skillData,
      talents: [
        { name: 'Talent', rows: [
          { stage: null, potential: null, description: 'Earlier description' },
          { stage: null, potential: null, description: null },
        ] },
        { name: null, rows: [] },
      ],
      basicInfo: null,
      characterInfo: null,
      characterVoices: null,
      ep: { Main: 'Main song', 'Co-star': 'Other song' },
    };
    assertSameHints(op, JSON.parse(JSON.stringify(toGuesserOperator(op))), allTypes);
  }
});

test('the guesser stays within its initial data budget', () => {
  const payload = JSON.stringify({ operators: operators.map(toGuesserOperator), skins });
  const raw = Buffer.byteLength(payload);
  const gzip = gzipSync(payload).length;
  // Allow modest catalogue growth while catching accidental full-record imports.
  assert.ok(raw < 850 * 1024, `raw payload: ${raw} bytes`);
  assert.ok(gzip < 160 * 1024, `gzip payload: ${gzip} bytes`);
  console.log(`Guesser page props: ${raw} bytes raw, ${gzip} bytes gzip`);
});


test('Base Skill Name uses unique Base facility skills, redacts names, and never falls back to Skill 1', () => {
  const op = { ...operators[0], name: 'Fixture', baseSkills: [
    { name: 'Factory Guidance' }, { name: 'Factory Guidance' }, { name: 'Fixture Logistics' }, { name: null },
  ] };
  const hints = buildHintPool(op, new Set(['baseSkillName']));
  assert.deepEqual(hints.map((hint) => hint.value).sort(), ['Factory Guidance', '███████ Logistics'].sort());
  const missing = buildHintPool({ ...op, baseSkills: [] }, new Set(['baseSkillName']));
  assert.equal(missing.length, 1); assert.match(missing[0].value, /Not available/);
  const amiya = operators.find((operator) => operator.name === 'Amiya')!;
  assert.deepEqual(buildHintPool(toGuesserOperator(amiya), new Set(['baseSkillName'])).map((hint) => hint.value).sort(), ['Agreement', 'Violin Solo']);
});

test('CN and KR voice actors survive projection, including Mandarin-only and missing voice data', () => {
  for (const [voices, chinese, korean] of [
    [{ Chinese: 'Chinese actor', Korean: 'Korean actor' }, 'Chinese actor', 'Korean actor'],
    [{ Mandarin: 'Mandarin actor', Cantonese: 'Regional actor' }, 'Mandarin actor', null],
    [{ 'Mandarin & Nankinese': 'Combined actor' }, 'Combined actor', null],
    [{}, null, null],
  ] as const) {
    const projected = toGuesserOperator({ ...operators[0], characterVoices: voices });
    const hints = buildHintPool(projected, new Set(['cnVA', 'krVA']));
    for (const [type, expected] of [['cnVA', chinese], ['krVA', korean]]) {
      const hint = hints.find((item) => item.type === type)!;
      if (expected) assert.equal(hint.value, expected); else assert.match(hint.value, /Not available/);
    }
  }
});

test('current voice packs override stale operator-record credits', () => {
  const botani = operators.find((operator) => operator.internalName === 'char_4223_botany')!;
  assert.deepEqual(botani.characterVoices, {
    English: 'Nana Sarkisyan',
    Japanese: 'Aki Orita',
    Chinese: 'Yixuan Hu',
    Korean: 'Kim Jin-ah',
    Russian: 'Nana Sarkisyan',
  });
});

test('hint groups cover every selectable hint once, with Base skills separated from identity and creator metadata', () => {
  const grouped = HINT_GROUPS.flatMap((group) => group.types);
  assert.equal(grouped.length, new Set(grouped).size);
  assert.deepEqual([...grouped].sort(), [...allTypes].sort());
  const groupOf = (type: HintType) => HINT_GROUPS.find((group) => group.types.includes(type))?.label;
  assert.equal(groupOf('baseSkillName'), 'Game Systems');
  for (const type of ['ep', 'operatorRecord', 'paradoxSimulation'] as const) assert.equal(groupOf(type), 'Identity');
  for (const type of ['cnVA', 'krVA', 'jpVA', 'enVA', 'illustrator'] as const) assert.equal(groupOf(type), 'Meta');
});
