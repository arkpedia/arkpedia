import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { getAllOperators } from '../../lib/operators/operators';
import { loadOperatorForms, namedOperators, decideForms, formsTablesPresent, gameTable } from '../build/base-skill-forms';
import type { BaseSkillEffectsTable, SkillCondition } from '../../lib/base/baseSkillEffects';
import table from '../../lib/base/base-skill-effects.json';

/*
 * An operator with an alternate form counts exactly the forms a skill text tags (scripts/build/base-skill-forms.ts):
 * a glossary term's whole list, or the single form the string names. Held here for the skills around Ines, Hoederer,
 * W and Wiš'adel, on the table always and on the game text where the tables are on disk.
 */
const ROOT = path.resolve(import.meta.dirname, '../..');
const entries = (table as unknown as BaseSkillEffectsTable).entries;
const OPERATOR_CONDITIONS = new Set(['roomHas', 'baseHas', 'ccHas', 'inTradingPost', 'inFactory', 'inPowerPlant', 'inDormitory', 'inReceptionRoom', 'trainerIs', 'targetIs']);
/** The operators a condition names (a branch or recipe family is a name too, but no operator). */
const names = (c: SkillCondition | undefined): string[] => !c ? [] : c.type === 'all' ? c.of.flatMap(names) : 'name' in c && OPERATOR_CONDITIONS.has(c.type) ? [c.name, ...('forms' in c ? c.forms ?? [] : [])] : [];
const namedBy = (id: string) => entries[id].effects.flatMap((x) => [...names(x.when), ...names(x.suppressedBy?.when), ...(x.name ? [x.name] : [])]);
const conditions = (id: string) => entries[id].effects.flatMap((x) => x.when ? [x.when] : []);

test("Hoederer's Starting From Scratch α pays for Ines alone", () => {
  assert.deepEqual(conditions('trade_ord_par&per[000]'), [{ type: 'baseHas', name: 'Ines' }]);
  assert.deepEqual(namedBy('trade_ord_par&per[000]'), ['Ines']);
});

test("Hoederer's Starting From Scratch β pays for Ines and for W, the original, never for Wiš'adel", () => {
  assert.deepEqual(conditions('trade_ord_par&per[001]'), [{ type: 'baseHas', name: 'Ines' }, { type: 'baseHas', name: 'W' }]);
  assert.deepEqual(namedBy('trade_ord_par&per[001]'), ['Ines', 'W']);
  assert.ok(!JSON.stringify(entries['trade_ord_par&per[001]']).includes("Wiš'adel"), 'the entry never mentions Wiš\'adel');
});

test("Ines' Personnel Management β and Shadow Gathering name no operator", () => {
  assert.deepEqual(namedBy('hire_spd[001]'), []);
  assert.deepEqual(namedBy('meet_spd_hast[000]'), []);
  assert.equal(entries['meet_spd_hast[000]'].custom?.handler, 'ramp');
});

test("Wiš'adel's Conspirator α and β need Ines in the Reception Room and Hoederer in a Trading Post, by those exact names", () => {
  for (const [id, limit] of [['control_meeting&ord[000]', 1], ['control_meeting&ord[001]', 2]] as const) {
    assert.deepEqual(entries[id].effects, [
      { kind: 'ccReceptionClueSpeed', value: 0.05, when: { type: 'inReceptionRoom', name: 'Ines' } },
      { kind: 'perTradingPostOrderLimit', value: limit, name: 'Hoederer' },
    ], id);
  }
});

test('forms sit only where a glossary term wraps the name: Lemuen (cc.angel), Tomimi (cc.gvial, the target and the preference)', () => {
  const withForms = Object.values(entries).filter((e) => e.effects.some((x) => names(x.when).length > 1 || names(x.suppressedBy?.when).length > 1) || e.interaction?.preferredTargetForms).map((e) => e.buffId).sort();
  assert.deepEqual(withForms, ['dorm_rec_single_P[001]', 'trade_ord_spd&multiPar[100]']);
  assert.deepEqual(entries['dorm_rec_single_P[001]'].interaction, { preferredTarget: 'Gavial', preferredTargetForms: ['Gavial the Invincible'] });
});

test('every operator a condition names is a record name, written as the game writes it', () => {
  const known = new Set(getAllOperators().map((o) => o.name));
  for (const e of Object.values(entries)) for (const x of e.effects) for (const n of [...names(x.when), ...names(x.suppressedBy?.when)]) assert.ok(known.has(n), `${e.buffId}: ${n}`);
});

const present = formsTablesPresent(ROOT);
test('the game text: Hoederer β tags W plain in EN and CN, so W alone; Wiš\'adel is W\'s only other form', { skip: !present && 'the glossary and character tables are not on disk' }, async () => {
  const forms = await loadOperatorForms(ROOT, getAllOperators());
  const en = await gameTable<{ buffs: Record<string, { description: string }> }>(ROOT, 'en', 'building_data.json');
  const cn = await gameTable<{ buffs: Record<string, { description: string }> }>(ROOT, 'cn', 'building_data.json');
  const text = (id: string) => [en.data.buffs[id]?.description, cn.data.buffs[id]?.description] as const;
  assert.match(text('trade_ord_par&per[001]')[0], /<@cc\.kw>W<\/>/, 'EN tags W plain');
  assert.match(text('trade_ord_par&per[001]')[1], /<@cc\.kw>W<\/>/, 'CN tags W plain');
  const named = namedOperators(forms, ...text('trade_ord_par&per[001]')).map((n) => decideForms(forms, n));
  assert.deepEqual(named, [
    { name: 'Ines', term: null, forms: ['Ines'], notCounted: [] },
    { name: 'W', term: null, forms: ['W'], notCounted: ["Wiš'adel"] },
  ]);
  assert.deepEqual(forms.familyOf.get('char_113_cqbw')?.map((f) => [f.id, f.en, f.cn]), [['char_113_cqbw', 'W', 'W'], ['char_1035_wisdel', "Wiš'adel", '维什戴尔']]);
  assert.deepEqual(namedOperators(forms, ...text('trade_ord_par&per[000]')).map((n) => decideForms(forms, n)), [{ name: 'Ines', term: null, forms: ['Ines'], notCounted: [] }]);
  for (const id of ['control_meeting&ord[000]', 'control_meeting&ord[001]']) assert.deepEqual(namedOperators(forms, ...text(id)).map((n) => decideForms(forms, n)), [
    { name: 'Ines', term: null, forms: ['Ines'], notCounted: [] }, { name: 'Hoederer', term: null, forms: ['Hoederer'], notCounted: [] },
  ], id);
  for (const id of ['hire_spd[001]', 'meet_spd_hast[000]']) assert.deepEqual(namedOperators(forms, ...text(id)), [], id);
  // The two terms, and the families the owner asked about, from the data alone.
  assert.deepEqual(namedOperators(forms, ...text('trade_ord_spd&multiPar[100]')).map((n) => decideForms(forms, n)), [{ name: 'Exusiai', term: 'cc.angel', forms: ['Exusiai', 'Exusiai the New Covenant'], notCounted: [] }]);
  assert.deepEqual(namedOperators(forms, ...text('dorm_rec_single_P[001]')).map((n) => decideForms(forms, n)), [{ name: 'Gavial', term: 'cc.gvial', forms: ['Gavial', 'Gavial the Invincible'], notCounted: [] }]);
  assert.deepEqual(forms.familyOf.get(forms.byEn.get('Yato')!.id)?.map((f) => f.en), ['Yato', 'Kirin R Yato'], "Kirin R Yato is Yato's alternate");
  for (const name of ['Kirara', 'Rosmontis', 'Pozëmka', 'Ines', 'Hoederer']) assert.equal(forms.familyOf.has(forms.byEn.get(name)!.id), false, `${name} has no alternate`);
  // Texts that disagree: the same family named by different members is an error (CN decides, by an override); a
  // name one language tags and the other does not is noted.
  const split = namedOperators(forms, 'with <@cc.kw>Texas</>', '当与<@cc.kw>缄默德克萨斯</>在同一个贸易站时').map((n) => decideForms(forms, n));
  assert.deepEqual(split.map((d) => [d.name, d.error?.replace(/,.*/, '')]), [['Texas', 'EN names Texas where CN names Texas the Omertosa'], ['Texas the Omertosa', 'CN names Texas the Omertosa where EN names Texas']]);
  assert.deepEqual(namedOperators(forms, 'with <@cc.kw>Texas</>', '无').map((n) => decideForms(forms, n)), [{ name: 'Texas', term: null, forms: ['Texas'], notCounted: ['Texas the Omertosa'], note: 'EN names "Texas" where the CN text does not' }]);
  assert.deepEqual(namedOperators(forms, 'with <@cc.kw>Texas</>', undefined).map((n) => decideForms(forms, n)), [{ name: 'Texas', term: null, forms: ['Texas'], notCounted: ['Texas the Omertosa'] }], 'no CN text: nothing to disagree with');
});

test('the table carries every named operator the way the game text reads, EN and CN agreeing', { skip: !present && 'the glossary and character tables are not on disk' }, async () => {
  const forms = await loadOperatorForms(ROOT, getAllOperators());
  const en = await gameTable<{ buffs: Record<string, { description: string }> }>(ROOT, 'en', 'building_data.json');
  const cn = await gameTable<{ buffs: Record<string, { description: string }> }>(ROOT, 'cn', 'building_data.json');
  let checked = 0;
  for (const e of Object.values(entries)) {
    for (const n of namedOperators(forms, en.data.buffs[e.buffId]?.description, cn.data.buffs[e.buffId]?.description)) {
      const d = decideForms(forms, n);
      assert.equal(d.note, undefined, `${e.buffId}: ${d.note}`);
      assert.equal(d.error, undefined, `${e.buffId}: ${d.error}`);
      for (const c of conditions(e.buffId)) if ('name' in c && c.name === d.name) { assert.deepEqual([...names(c)].sort(), [...d.forms].sort(), `${e.buffId}: ${c.type} ${d.name}`); checked++; }
    }
  }
  assert.ok(checked >= 13, `${checked} conditions checked`);
});
