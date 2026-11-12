import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeDescription, rules, mentionedNames, nameIsKnown, foldName, type Buff } from '../build/base-skill-rules';
import { dependencyClassOf, operatorDependency } from '../../lib/base/dependencyClass';
import table from '../../lib/base/base-skill-effects.json';
import { getAllOperators } from '../../lib/operators/operators';
import slots from '../../data/base-skill-slots.json';
import malformed from './fixtures/base-skill-malformed.json';

/*
 * The build's reading of a description (scripts/build/base-skill-rules.ts): typos and odd spacing the game ships
 * must not drop a number, a name it mentions must be one the records know, and every entry's dependency class
 * (the base expert's tie-break order) follows from its shapes.
 */
const buff = (m: { roomType: string; targets: string[]; description: string }): Buff => ({ buffId: 'test[000]', roomType: m.roomType as Buff['roomType'], buffCategory: 'OUTPUT', description: m.description, efficiency: null, targets: m.targets });

test('malformed descriptions read the same numbers as clean ones once normalized', () => {
  for (const m of malformed) {
    const read = rules(buff(m), normalizeDescription(m.description));
    assert.deepEqual(read.effects, m.effects, `${m.why}: ${m.description}`);
  }
});

test('normalization folds spaces, width and quotes without touching the words', () => {
  assert.equal(normalizeDescription('  +30%productivity,and Morale  -0.25per hour '), '+30% productivity, and Morale -0.25 per hour');
  assert.equal(normalizeDescription('Clue search speed +２５％'), 'Clue search speed +25%');
  assert.equal(normalizeDescription('the trainee’s Job Branch'), "the trainee's Job Branch");
});

test('a description that names an operator, a group or a possessive is checked against the records', () => {
  const known = new Set(getAllOperators().flatMap(o => [o.name, ...(o.aliases ?? []), o.faction ?? '', o.class ?? '']).filter(Boolean).map(foldName));
  assert.deepEqual(mentionedNames("When this Operator is assigned to a Power Plant, if Kal'tsit is assigned to the Control Center, increases the drone recovery rate by +5%."), ["Kal'tsit"]);
  assert.deepEqual(mentionedNames('order acquisition efficiency +2% for each Rhine Lab Operator assigned to a Trading Post'), ['Rhine Lab']);
  assert.deepEqual(mentionedNames("Amiya's Morale consumed per hour -0.1"), ['Amiya']);
  assert.ok(nameIsKnown("Kal'tsit", known)); assert.ok(nameIsKnown('Rhine Lab', known)); assert.ok(nameIsKnown('Ursus Student Self-government Group', known));
  assert.ok(nameIsKnown('MŁYNAR', known), 'case and diacritics do not matter');
  assert.ok(!nameIsKnown('Kaltist', known), 'a misspelt operator is unknown');
  assert.ok(!nameIsKnown('Rhine Labs', known), 'a misspelt faction is unknown');
});

test('every entry carries its dependency class, derived from its shapes', () => {
  const entries = (table as { entries: Record<string, Parameters<typeof dependencyClassOf>[0] & { dependency?: string }> }).entries;
  for (const [id, e] of Object.entries(entries)) assert.equal(e.dependency, dependencyClassOf(e), id);
  assert.equal(entries['manu_prod_spd[014]'].dependency, 'alone', 'Familiar Dispatch β: flat');
  assert.equal(entries['manu_prod_spd_bd[400]'].dependency, 'otherFacility', 'Unexpectedly Delicious: Monster Meal from a Dormitory');
  assert.equal(entries['trade_ord_spd&tag[010]'].dependency, 'otherFacility', 'Elite Squad: facilities with Elite operators');
  assert.equal(entries['trade_ord_limit&trade&lv[001]'].dependency, 'facilityLevel', "Rose Salt's Time Is Money: the post's level");
  assert.equal(entries['power_rec_spd_P[000]'].dependency, 'controlCenter', "Kal'tsit in the Control Center");
  assert.equal(entries['control_prod_tra_spd[000]'].dependency, 'otherFacility', 'Wang: Influence against Territory');
});

test("an operator's dependency for a room is the rank of the highest class among their skills there", () => {
  const ops = new Map(getAllOperators().map(o => [o.name, o]));
  assert.equal(operatorDependency(ops.get('Gravel')!, 'Factory', 'Elite 2', slots, 90), 0, 'Gravel: Metalwork β alone');
  assert.equal(operatorDependency(ops.get('Marcille')!, 'Factory', 'Elite 2', slots, 90), 3, "Marcille: Senshi's meal from a Dormitory");
  assert.equal(operatorDependency(ops.get('Zima the Raging Tide')!, 'Factory', 'Elite 2', slots, 90), 1, 'Zima: a roommate from the Ursus students');
  assert.equal(operatorDependency(ops.get('Mantra')!, 'Trading Post', 'Elite 2', slots, 90), 3, 'Mantra: facilities with Elite operators');
});

test('the CN-only skills the audit found read in part now carry their counts and conditions', () => {
  const entries = (table as { entries: Record<string, { effects: unknown[] }> }).entries;
  assert.deepEqual(entries['trade_ord_spd&share[100]'].effects, [{ kind: 'orderEfficiency', value: 0, per: { count: 'room.others', amount: 0.15 } }], 'Тоска: +15% per other working operator');
  assert.deepEqual(entries['dorm_rec_all&unfull[100]'].effects, [{ kind: 'recoveryAll', value: 0.1, per: { count: 'room.belowFullMorale', amount: 0.01 } }], 'Тоска: +0.01 per roommate below full Morale');
  assert.deepEqual(entries['dorm_hireToRecAll[002]'].effects, [{ kind: 'recoveryAll', value: 0.1, per: { count: 'office.extraSlots', amount: 0.05 } }], 'de Toledo: +0.05 per extra recruit slot');
  assert.deepEqual(entries['meet_spd&cost_char[000]'].effects, [{ kind: 'clueSpeed', value: 0.15, when: { type: 'countAtLeast', count: 'room.others', value: 1 } }, { kind: 'selfMorale', value: 1, when: { type: 'countAtLeast', count: 'room.others', value: 1 } }], 'Clementia: only with others in the room');
  assert.deepEqual(entries['meet_spd&sami[210]'].effects, [{ kind: 'clueSpeed', value: 0.1 }, { kind: 'clueSpeed', value: 0.2, when: { type: 'roomHasRoster', roster: 'URSUS_STUDENT_SELF_GOVERNING_GROUP' } }], 'Ольга: +20% with another Ursus student');
});

test("a name the text wraps in a glossary term carries the term's other forms, and only that name", () => {
  const entries = (table as { entries: Record<string, { effects: { when?: { type: string; name?: string; forms?: string[] } }[] }> }).entries;
  assert.deepEqual(entries['trade_ord_spd&multiPar[100]'].effects[1].when, { type: 'roomHas', name: 'Exusiai', forms: ['Exusiai the New Covenant'] }, 'Lemuen: cc.angel');
  assert.deepEqual(entries['dorm_rec_single_P[001]'].effects[1].when, { type: 'targetIs', name: 'Gavial', forms: ['Gavial the Invincible'] }, 'Tomimi: cc.gvial');
  assert.deepEqual(entries['trade_ord_spd_par[000]'].effects[1].when, { type: 'roomHas', name: 'Siege' }, 'Morgan: the Glasgow Gang term lists Siege without wrapping him');
  assert.equal(entries['trade_ord_limit&cost_P[010]'].effects[0].when?.forms, undefined, "Texas: Tacit Understanding's text carries no term");
  const withForms = Object.entries(entries).filter(([, e]) => e.effects.some(x => x.when?.forms)).map(([id]) => id).sort();
  assert.deepEqual(withForms, ['dorm_rec_single_P[001]', 'trade_ord_spd&multiPar[100]'], 'the two operator terms the building data uses');
});
