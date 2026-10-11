import assert from 'node:assert/strict';
import { test } from 'node:test';
import { recommendation, ratingPoints, pointLabel, rankByRecommendation, type SelectorCandidate } from '../../lib/selectors/scoring';
import { buildSelectorCatalogue, damageTypes } from '../../lib/selectors/catalogue';
import snapshot from '../../data/selector-catalogue.json';
import { getAllOperators } from '../../lib/operators/operators';
import fs from 'node:fs';
import ratings from '../../config/selector-ratings.json';
import { importAuthorRatings } from '../../lib/selectors/ratings';
const candidate: SelectorCandidate = { name: 'Test', id: 'char_test', caster: false, arts: false, trueDamage: false, kukkikaze: 6.6, community: 6.5, mainSkills: 1, subSkills: 1, isModule: false, raModule: false };
test('ticket order follows displayed totals, including negative, quarter and personalized points', () => {
  const operators = ['Negative', 'Zero', 'Quarter', 'Zulu', 'Alpha', 'Missing'].map(name => ({ name }));
  const base = recommendation(candidate, [candidate], null);
  const scores = Object.fromEntries([['Negative', -1], ['Zero', 0], ['Quarter', .25], ['Zulu', 2], ['Alpha', 2]].map(([name, total]) => [name, { ...base, total: Number(total) }]));
  assert.deepEqual(rankByRecommendation(operators, scores).map(op => op.name), ['Alpha', 'Zulu', 'Quarter', 'Zero', 'Negative', 'Missing']);
  const personalized = { ...scores, Negative: { ...base, total: 3, personalized: true } };
  assert.equal(rankByRecommendation(operators, personalized)[0].name, 'Negative');
  assert.deepEqual(rankByRecommendation(operators), operators);
  assert.deepEqual(operators.map(op => op.name), ['Negative', 'Zero', 'Quarter', 'Zulu', 'Alpha', 'Missing']);
});
test('rating brackets and community rounding cover every boundary', () => {
  for (const [value, expected] of [[5.8,-1],[6.2,-1],[6.3,0],[6.5,0],[6.6,1],[6.8,1],[6.9,2],[7.2,2],[6.85,2]]) assert.equal(ratingPoints(value), expected);
  for (const value of [null, NaN, 7.3, 5.7]) assert.equal(ratingPoints(value), null);
});
test('missing community doubles author points; zero community points are present', () => {
  assert.equal(recommendation(candidate, [candidate], null).total, 2.25);
  assert.equal(recommendation({ ...candidate, community: null }, [candidate], null).total, 3.25);
  assert.equal(recommendation({ ...candidate, kukkikaze: null }, [candidate], null).complete, true);
});
test('missing author doubles community bracket points without doubling other bonuses', () => {
  for (const [value, points] of [[6.0,-2],[6.4,0],[6.7,2],[7.1,4]]) {
    const op = { ...candidate, kukkikaze: null, community: value };
    const score = recommendation(op, [op], null);
    assert.deepEqual(score.lines[0], { label: 'Community rating ×2 (no Kukkikaze rating)', points });
    assert.equal(score.total, points + 1.25);
    assert.equal(score.complete, true);
  }
  const absent = { ...candidate, kukkikaze: null, community: null };
  assert.equal(recommendation(absent, [absent], null).total, 1.25);
  assert.equal(recommendation(absent, [absent], null).complete, false);
});
test('Nasti uses the community-only fallback without filling her author rating', () => {
  const nasti = snapshot.candidates.find(op => op.name === 'Nasti')!;
  assert.equal(nasti.kukkikaze, null);
  const score = recommendation(nasti, snapshot.candidates, null);
  assert.deepEqual(score.lines[0], { label: 'Community rating ×2 (no Kukkikaze rating)', points: 2 });
  assert.equal(score.complete, true);
});
test('account coverage bonuses require an imported account and exact six-star roster ownership', () => {
  const op = { ...candidate, arts: true, trueDamage: true, kukkikaze: 7.1, isModule: true, raModule: true };
  const base = recommendation(op, [op], null);
  assert.equal(base.personalized, false);
  assert.equal(recommendation(op, [op], []).total, base.total + 3);
  const casters = Array.from({length: 4}, (_, i) => ({ ...candidate, name: `Caster ${i}`, id: `caster_${i}`, caster: true, kukkikaze: 6.4 }));
  assert.equal(recommendation(op, [op, ...casters], casters.slice(0,3).map(c => c.name)).total, base.total + 3);
  assert.equal(recommendation(op, [op, ...casters], casters.map(c => c.name)).total, base.total + 2);
  assert.equal(recommendation(op, [op], [op.name]).total, base.total + 2); // owned true dealer blocks that coverage bonus; self is not another Game-Destroyer
  const unknown = { ...candidate, name: 'Unrated', id: 'unrated', kukkikaze: null };
  assert.equal(recommendation(op, [op, unknown], [unknown.name]).complete, false);
  assert.equal(recommendation(op, [op, unknown], [unknown.name]).total, base.total + 2);
  const other = { ...op, name: 'Other', id: 'other' };
  assert.equal(recommendation(op, [op, other], [other.name]).total, base.total + 1);
});
test('score colors retain negative and quarter points', () => {
  const bad = { ...candidate, mainSkills: 0, subSkills: 0, kukkikaze: 5.8, community: 6.2 };
  assert.equal(recommendation(bad, [bad], null).tone, 'negative');
  assert.equal(recommendation(candidate, [candidate], null).tone, 'middle');
  const great = { ...candidate, kukkikaze: 7.2, community: 7.1 };
  assert.equal(recommendation(great, [great], null).tone, 'great');
  assert.equal(pointLabel(2), '+2');
  assert.equal(pointLabel(-1), '-1');
  assert.equal(pointLabel(0), '0');
  assert.equal(pointLabel(2.25), '+2.25');
});
test('current guide shares all three event ticket pools and official artwork', () => {
  const { cards, tickets, candidates } = buildSelectorCatalogue();
  assert.equal(cards.length, 3);
  assert.deepEqual(Object.values(tickets).map(t => t.operators.length), [8,35,48]);
  assert.ok(cards.every(c => c.imagePath));
  for (const t of Object.values(tickets)) for (const op of t.operators) assert.ok(candidates.some(c => c.name === op.name));
  assert.equal(candidates.find(c => c.name === 'Passenger')?.raModule, true);
  assert.equal(candidates.find(c => c.name === 'Mizuki')?.isModule, true);
  assert.equal(candidates.find(c => c.name === 'Stainless')?.raModule, false); // CRA is a branch module, not RA
  assert.ok(candidates.some(c => c.mainSkills > 0 && c.subSkills > 0));
});
test('damage classification includes Arts guards and summons, excludes a pure healer', () => {
  const roster = getAllOperators();
  assert.equal(damageTypes(roster.find(o => o.name === 'Surtr')!).arts, true);
  assert.equal(damageTypes(roster.find(o => o.name === "Kal'tsit")!).trueDamage, true);
  assert.equal(damageTypes(roster.find(o => o.name === 'Shining')!).arts, false);
  assert.equal(damageTypes(roster.find(o => o.name === 'Shining')!).trueDamage, false);
});

test('deploy fallback carries resolvable current ticket pools', () => {
  assert.deepEqual(Object.keys(snapshot.tickets), Object.keys(buildSelectorCatalogue().tickets));
  for (const ticket of Object.values(snapshot.tickets)) for (const op of ticket.operators) assert.ok(snapshot.candidates.some(candidate => candidate.name === op.name));
});

test('the supplied sheet resolves every row to a stable ID, preserves blanks and includes the corrected Ling rating', () => {
  const operators = getAllOperators().filter(op => op.rarity === 6).map(op => ({ name: op.name, id: op.internalName! }));
  const imported = importAuthorRatings(fs.readFileSync('config/selector-ratings.csv', 'utf8'), operators);
  assert.deepEqual(imported.ratings, ratings.ratings);
  assert.deepEqual(imported.unrated, ratings.unrated);
  assert.equal(Object.keys(imported.ratings).length, 122);
  assert.equal(imported.unrated.length, 4);
  const catalogue = buildSelectorCatalogue();
  for (const ticket of Object.values(catalogue.tickets)) for (const selectable of ticket.operators) {
    const op = catalogue.candidates.find(op => op.name === selectable.name)!;
    assert.notEqual(ratingPoints(op.kukkikaze), null, `${op.name} has a valid supplied rating`);
  }
  assert.equal(catalogue.candidates.find(op => op.name === 'Ling')?.kukkikaze, 6.7);
  assert.equal(catalogue.candidates.find(op => op.name === 'Blemishine')?.kukkikaze, 6.3);
  assert.equal(catalogue.candidates.find(op => op.name === 'Młynar')?.kukkikaze, 6.8);
  assert.equal(catalogue.candidates.find(op => op.name === 'Wiš\'adel')?.kukkikaze, 7.1);
  assert.equal(catalogue.candidates.find(op => op.name === 'Nasti')?.kukkikaze, null);
});

test('rating imports reject unmatched names, duplicate operators and invalid scores', () => {
  const operators = [{ name: 'Ling', id: 'char_ling' }];
  assert.throws(() => importAuthorRatings('Ling;6.7\nling;6.6', operators), /duplicate/);
  assert.throws(() => importAuthorRatings('Unknown;6.7', operators), /unknown operator/);
  assert.throws(() => importAuthorRatings('Ling;5.7', operators), /invalid score/);
  assert.throws(() => importAuthorRatings('Ling;NaN', operators), /invalid score/);
  assert.throws(() => importAuthorRatings('Ling;6.7;extra', operators), /expected name;score/);
});

test('the content release regenerates the selector catalogue after hydration and before tests', () => {
  const workflow = fs.readFileSync('.github/workflows/prepare-content.yml', 'utf8');
  const compile = workflow.slice(workflow.indexOf('- name: Validate and compile data'), workflow.indexOf('- name: Publish the validated public release'));
  assert.ok(compile.indexOf('npx tsx scripts/build/build-selector-catalogue.ts') >= 0);
  assert.ok(compile.indexOf('npx tsx scripts/build/build-selector-catalogue.ts') < compile.indexOf('npm test'));
});
