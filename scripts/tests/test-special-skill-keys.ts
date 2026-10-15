import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanSkillName } from '../../lib/base/activeBaseSkills';
import { SPECIAL_SKILL_BUFFS, specialSkillKey, specialSkillKeysOfBuff } from '../../lib/base/specialSkillKeys';
import { buildSpecialSkillBuffs, readOperatorRecords, specialSkillKeys } from '../build/build-special-skill-buffs';

/*
 * The base calculator finds every special skill by key, "Operator|Skill", and the key by the
 * game's buff id and the operator's former names when Global renamed the operator or the skill
 * (lib/base/specialSkillKeys.ts). On 2026-10-14 four handlers and Closure's special orders
 * stopped matching without a word, because the keys were names alone. These hold the map
 * complete and true, on whichever data this runs against: the bundled snapshot in Check, the
 * night's refresh in the content run.
 */
const operators = readOperatorRecords(process.cwd()).filter((op) => !/^Amiya \(/.test(op.name)) as
  { name: string; aliases?: string[]; baseSkills?: { name: string | null; buffId?: string }[] | null }[];
const keys = specialSkillKeys();
const operatorOf = (key: string) => key.slice(0, key.indexOf('|'));

test('every handler key and every named check has its buff ids, and the map lists nothing else', () => {
  assert.deepEqual(Object.keys(SPECIAL_SKILL_BUFFS).sort(), keys, 'run: npx tsx scripts/build/build-special-skill-buffs.ts');
  for (const key of keys) assert.ok(SPECIAL_SKILL_BUFFS[key].length > 0, key);
  // What the build script would write from this data: the same map. A key whose name the data
  // has gives the buff ids the record has; a renamed one keeps the map's while a record holds it.
  const { buffs, unmatched } = buildSpecialSkillBuffs(keys, operators, SPECIAL_SKILL_BUFFS as Record<string, string[]>);
  assert.deepEqual(unmatched, [], 'keys that name no record and whose buff no record carries');
  assert.deepEqual(buffs, SPECIAL_SKILL_BUFFS, 'run: npx tsx scripts/build/build-special-skill-buffs.ts');
});

test('every handler is reached from its operator\'s record, under whatever names the record has today', () => {
  const reached = new Set<string>();
  for (const op of operators) for (const skill of op.baseSkills ?? []) {
    const key = specialSkillKey(op.name, skill, op.aliases);
    if (!(key in SPECIAL_SKILL_BUFFS)) continue;
    // Only ever the operator's own key, under its name or a former one.
    assert.ok([op.name, ...(op.aliases ?? [])].includes(operatorOf(key)), `${op.name} / ${skill.name} resolved to another operator's ${key}`);
    reached.add(key);
  }
  // A key no record reaches is a handler nothing runs: its operator was renamed without the old
  // name in the record's aliases (the catalogue adds it on every rename), or its buff left the game.
  const orphaned = keys.filter((key) => !reached.has(key)).map((key) => `${key} (${SPECIAL_SKILL_BUFFS[key].join(', ')})`);
  assert.deepEqual(orphaned, [], 'handler keys no operator record reaches: add the former name to the record\'s aliases, or re-key the handler');
});

test('a skill another operator\'s handler shares a buff with keeps its own text parsing', () => {
  // Clue Search α: one buff, ten holders on 2026-10-15, and only Caper's has a handler.
  const [shared] = SPECIAL_SKILL_BUFFS['Caper|Clue Search α'];
  assert.deepEqual(specialSkillKeysOfBuff(shared), ['Caper|Clue Search α']);
  const others = operators.filter((op) => op.name !== 'Caper' && op.baseSkills?.some((skill) => skill.buffId === shared));
  assert.ok(others.length > 0, `other holders of ${shared}`);
  for (const op of others) for (const skill of op.baseSkills!.filter((s) => s.buffId === shared)) {
    assert.equal(specialSkillKey(op.name, skill, op.aliases), `${op.name}|${cleanSkillName(skill.name)}`, op.name);
  }
});

test('a Global rename of any operator and all of its base skills keeps every handler', () => {
  for (const op of operators) {
    const renamed = `${op.name} (Global name)`;
    for (const skill of op.baseSkills ?? []) {
      const before = specialSkillKey(op.name, skill, op.aliases);
      if (!(before in SPECIAL_SKILL_BUFFS)) continue;
      const after = specialSkillKey(renamed, { name: `${cleanSkillName(skill.name)} (Global name)`, buffId: skill.buffId }, [op.name, ...(op.aliases ?? [])]);
      assert.equal(after, before, `${op.name} / ${skill.name}`);
      // A skill renamed under the same operator name.
      assert.equal(specialSkillKey(op.name, { name: `${cleanSkillName(skill.name)} (Global name)`, buffId: skill.buffId }, op.aliases), before, `${op.name} / ${skill.name}`);
    }
  }
});

test('the key is the name when it is known, else the buff\'s under the operator\'s names', () => {
  // 2026-10-14: GALLUS² (Gallus² on CN) and its Clucktivation Mechanism (our Poultry Motivation).
  assert.equal(specialSkillKey('GALLUS²', { name: 'Clucktivation Mechanism', buffId: 'power_rec_spd_ext&tag[000]' }, ['Gallus²']), 'Gallus²|Poultry Motivation');
  assert.equal(specialSkillKey('Closure', { name: 'Special Order', buffId: 'trade_ord_closure[000]' }), 'Closure|Special Orders');
  assert.equal(specialSkillKey("Kal'tsit Esperanta", { name: "'Terra's Ark'", buffId: 'hire_spd_tag[000]' }, ["Kal'tsit - Esperanta"]), "Kal'tsit - Esperanta|The Ark of Terra");
  assert.equal(specialSkillKey('Pramanix', { name: 'Karlan Saintess', buffId: 'dorm_rec_single&oneself[021]' }), 'Pramanix|Karlan Saint');
  assert.equal(specialSkillKey('Crackborne', { name: 'A Rare Rest', buffId: 'dorm_rec_oneself[040]' }), 'Crackborne|Rare Respite');
  // Without the former name an operator rename has no way back: it stays unknown, never guessed.
  assert.equal(specialSkillKey('GALLUS²', { name: 'Clucktivation Mechanism', buffId: 'power_rec_spd_ext&tag[000]' }), 'GALLUS²|Clucktivation Mechanism');
  // A hand-built skill (the calculator's synthetic test workers) has no buff id.
  assert.equal(specialSkillKey('Reference input 1', { name: 'Reference rate' }), 'Reference input 1|Reference rate');
  assert.equal(specialSkillKey('Closure', { name: 'Special OrdersReplacesNothing' }), 'Closure|Special Orders');
  assert.equal(specialSkillKey('Somebody', { name: 'Something', buffId: 'not_a_buff[000]' }), 'Somebody|Something');
});
