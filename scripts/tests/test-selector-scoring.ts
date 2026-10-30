import assert from 'node:assert/strict';
import { test } from 'node:test';
import { recommendation as scoreRecommendation, combinedRecommendation, ratingPoints, pointLabel, rankByRecommendation, DEFAULT_SELECTOR_PREFERENCES, selectorCoverage as coverage, isSuperMeta as superMeta, type SelectorCandidate } from '../../lib/selectors/scoring';
import { buildSelectorCatalogue, damageTypes, hasTalentReveal } from '../../lib/selectors/catalogue';
import snapshot from '../../data/selector-catalogue.json';
import { getAllOperators } from '../../lib/operators/operators';
import fs from 'node:fs';
import ratings from '../../data/selector-ratings.json';
import { importAuthorRatings } from '../../lib/selectors/ratings';
import { operators as superMetaOperators } from '../../data/selector-super-meta.json';
const recommendation = (candidate: SelectorCandidate, roster: SelectorCandidate[], owned: readonly string[] | null, preferences = DEFAULT_SELECTOR_PREFERENCES) => scoreRecommendation(candidate, roster, owned, preferences, superMetaOperators);
const selectorCoverage = (roster: SelectorCandidate[], owned: readonly string[] | null) => coverage(roster, owned, superMetaOperators);
const isSuperMeta = (candidate: SelectorCandidate) => superMeta(candidate, superMetaOperators);
const candidate: SelectorCandidate = { name: 'Test', id: 'char_test', caster: false, supporter: false, talentReveal: false, arts: false, trueDamage: false, kukkikaze: 6.6, community: 6.5, mainSkills: 1, subSkills: 1, isModule: false, raModule: false };
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
test('gradual rating points and community rounding cover every boundary', () => {
  for (const [value, expected] of [[5.8,-1.25],[5.9,-1],[6.0,-.75],[6.1,-.5],[6.2,-.25],[6.3,0],[6.4,.25],[6.5,.5],[6.6,.75],[6.7,1],[6.8,1.25],[6.9,1.5],[7.0,1.75],[7.1,2],[7.2,2],[7.15,2],[6.84,1.25],[6.85,1.5]]) assert.equal(ratingPoints(value), expected);
  for (const value of [null, NaN, 7.3, 5.7]) assert.equal(ratingPoints(value), null);
});
test('missing community doubles author points; community contributes gradual points', () => {
  assert.equal(recommendation(candidate, [candidate], null).total, 1.75);
  assert.equal(recommendation({ ...candidate, community: null }, [candidate], null).total, 2);
  assert.equal(recommendation({ ...candidate, kukkikaze: null }, [candidate], null).complete, true);
});
test('missing author doubles community points without doubling other bonuses', () => {
  for (const [value, points] of [[6.0,-1.5],[6.3,0],[6.4,.5],[6.7,2],[7.1,4]]) {
    const op = { ...candidate, kukkikaze: null, community: value };
    const score = recommendation(op, [op], null);
    assert.deepEqual(score.lines[0], { label: 'Community rating ×2 (no Kukkikaze rating)', points });
    assert.equal(score.total, points + .5);
    assert.equal(score.complete, true);
  }
  const absent = { ...candidate, kukkikaze: null, community: null };
  assert.equal(recommendation(absent, [absent], null).total, .5);
  assert.equal(recommendation(absent, [absent], null).complete, false);
});
test('Nasti uses the community-only fallback without filling her author rating', () => {
  const nasti = snapshot.candidates.find(op => op.name === 'Nasti')!;
  assert.equal(nasti.kukkikaze, null);
  const score = recommendation(nasti, snapshot.candidates, null);
  assert.deepEqual(score.lines[0], { label: 'Community rating ×2 (no Kukkikaze rating)', points: 1.5 });
  assert.equal(score.complete, true);
});
test('account coverage defaults use exact six-star roster ownership', () => {
  const op = { ...candidate, arts: true, trueDamage: true, kukkikaze: 7.1, isModule: true, raModule: true };
  const base = recommendation(op, [op], null);
  assert.equal(base.personalized, false);
  assert.equal(recommendation(op, [op], []).total, base.total + 2);
  const casters = Array.from({length: 4}, (_, i) => ({ ...candidate, name: `Caster ${i}`, id: `caster_${i}`, caster: true, kukkikaze: 6.4 }));
  assert.equal(recommendation(op, [op, ...casters], casters.slice(0,3).map(c => c.name)).total, base.total + 2);
  assert.equal(recommendation(op, [op, ...casters], casters.map(c => c.name)).total, base.total + 1.5);
  const supporter = { ...candidate, name: 'Supporter', id: 'supporter', supporter: true };
  const mixed = [...casters.slice(0, 3), supporter];
  assert.equal(recommendation(op, [op, ...mixed], mixed.map(c => c.name)).total, base.total + 1.5);
  assert.equal(recommendation(op, [op, ...mixed], mixed.slice(1).map(c => c.name)).total, base.total + 2);
  assert.equal(recommendation(op, [op], [op.name]).total, base.total + .5); // owning a True dealer and a 7.0+ operator blocks both coverage bonuses
  const unknown = { ...candidate, name: 'Unrated', id: 'unrated', kukkikaze: null };
  assert.equal(recommendation(op, [op, unknown], [unknown.name]).complete, false);
  assert.equal(recommendation(op, [op, unknown], [unknown.name]).total, base.total + 1);
  const other = { ...op, name: 'Other', id: 'other' };
  assert.equal(recommendation(op, [op, other], [other.name]).total, base.total + .5);
});
test('score colors retain negative and quarter points', () => {
  const bad = { ...candidate, mainSkills: 0, subSkills: 0, kukkikaze: 5.8, community: 6.2 };
  assert.equal(recommendation(bad, [bad], null).tone, 'negative');
  assert.equal(recommendation(candidate, [candidate], null).tone, 'middle');
  const great = { ...candidate, kukkikaze: 7.2, community: 7.1, mainSkills: 2 };
  assert.equal(recommendation(great, [great], null).tone, 'great');
  assert.equal(pointLabel(2), '+2');
  assert.equal(pointLabel(-1), '-1');
  assert.equal(pointLabel(0), '0');
  assert.equal(pointLabel(2.25), '+2.25');
});
test('current guide shares all three event ticket pools and official artwork', () => {
  const { cards, tickets, candidates } = buildSelectorCatalogue();
  assert.equal(cards.length, 5);
  assert.deepEqual(Object.values(tickets).map(t => t.operators.length), [6,8,35,48,9]);
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

test('only base-talent invisibility reveal earns one quarter point', () => {
  const roster = getAllOperators();
  for (const name of ['SilverAsh', 'Ines']) assert.equal(hasTalentReveal(roster.find(o => o.name === name)!), true, name);
  for (const name of ['Magallan', 'Schwarz', 'Elysium']) assert.equal(hasTalentReveal(roster.find(o => o.name === name)!), false, name);
  const silverAsh = roster.find(o => o.name === 'SilverAsh')!;
  assert.equal(hasTalentReveal({ ...silverAsh, talents: [] }), false); // modules cannot replace a missing base talent
  const moduleOnly = { ...silverAsh, talents: [], modules: [{ type: 'Upgrade' as const, stages: [{ stage: '3', attributesIncreased: null, effectLabel: 'Talent upgrade', effectText: 'Reveals Invisible enemies within range' }] }] };
  assert.equal(hasTalentReveal(moduleOnly), false);
  const reveal = { ...candidate, talentReveal: true };
  const base = recommendation(candidate, [candidate], null);
  assert.equal(recommendation(reveal, [reveal], null).total, base.total + .25);
  assert.equal(recommendation({ ...reveal, kukkikaze: null }, [reveal], null).lines.find(l => l.label === 'Invisibility reveal talent')?.points, .25);
  assert.deepEqual(buildSelectorCatalogue().candidates.filter(op => op.talentReveal).map(op => op.name).sort(), ['Ines', 'SilverAsh']);
});

test('personalization overrides coverage without needing an account and never adds reveal twice', () => {
  const op = { ...candidate, arts: true, trueDamage: true, talentReveal: true, kukkikaze: 7.1, subSkills: 3 };
  const base = recommendation(op, [op], null);
  const manual = { ...DEFAULT_SELECTOR_PREFERENCES, subSkills: true, arts: true, trueDamage: true, gameDestroyer: true, reveal: true };
  const score = recommendation(op, [op], null, manual);
  assert.equal(score.total, base.total + 2.3);
  assert.equal(score.lines.find(l => l.label.includes('sub priority'))?.points, .3);
  assert.equal(score.lines.filter(l => l.label === 'Invisibility reveal talent').length, 1);
  assert.equal(recommendation(op, [op], null, { ...manual, reveal: false }).total, score.total - .25);
  assert.equal(recommendation(op, [op], [op.name]).lines.some(l => l.label === 'Invisibility reveal talent'), false);
  assert.equal(recommendation(op, [op], [op.name], manual).total, score.total);
  const unknown = { ...candidate, name: 'Unknown', id: 'unknown', kukkikaze: null };
  assert.equal(selectorCoverage([unknown], [unknown.name]).gameDestroyer, null);
  assert.equal(recommendation(op, [unknown], [unknown.name]).complete, false);
  assert.equal(recommendation(op, [unknown], [unknown.name], { ...DEFAULT_SELECTOR_PREFERENCES, gameDestroyer: true }).complete, true);
});


test('explicit super-meta members earn coverage below 7.0 and block coverage when owned', () => {
  const names = ['Ines', 'Ela', 'Lemuen', 'Eyjafjalla the Hvít Aska', 'Ascalon', 'Lappland the Decadenza', 'Logos', 'Yu', 'Ulpianus', 'Exusiai the New Covenant', "Wiš'adel", 'Tragodia'];
  for (const name of names) {
    const op = snapshot.candidates.find(op => op.name === name)!;
    assert.ok(op, name);
    assert.equal(isSuperMeta(op), true, name);
    const base = recommendation(op, snapshot.candidates, null);
    const manual = recommendation(op, snapshot.candidates, null, { ...DEFAULT_SELECTOR_PREFERENCES, gameDestroyer: true });
    assert.equal(manual.total, base.total + 1, name);
    assert.equal(selectorCoverage(snapshot.candidates, [name]).gameDestroyer, false, name);
    assert.equal(recommendation(op, snapshot.candidates, [name]).lines.some(line => line.label.startsWith('Super-meta coverage')), false, name);
  }
  for (const name of ['Eyjafjalla', 'Exusiai', 'Chongyue', 'SilverAsh']) {
    assert.equal(isSuperMeta(snapshot.candidates.find(op => op.name === name)!), false, name);
  }
  assert.equal(isSuperMeta({ ...candidate, kukkikaze: 7.0 }), true);
  assert.equal(isSuperMeta({ ...candidate, kukkikaze: 6.9 }), false);
  const ines = { ...snapshot.candidates.find(op => op.name === 'Ines')!, kukkikaze: null };
  assert.equal(selectorCoverage([ines], ['Ines']).gameDestroyer, false);
});


test('mode preferences award one point each for matching IS and RA modules', () => {
  const base = recommendation(candidate, [candidate], null).total;
  for (const isModule of [false, true]) for (const raModule of [false, true]) {
    const op = { ...candidate, isModule, raModule };
    for (const likesIS of [false, true]) for (const likesRA of [false, true]) {
      const score = recommendation(op, [op], null, { ...DEFAULT_SELECTOR_PREFERENCES, likesIS, likesRA });
      assert.equal(score.total, base + Number(isModule && likesIS) + Number(raModule && likesRA));
      assert.equal(score.personalized, likesIS || likesRA);
    }
    assert.equal(recommendation(op, [op], null).total, base);
  }
});


test('rating and main-skill toggles are independent, including absent ratings', () => {
  const prefs = { ...DEFAULT_SELECTOR_PREFERENCES, kukkikazeRating: false, communityRating: false, mainSkills: false, reveal: false };
  const off = recommendation(candidate, [candidate], null, prefs);
  assert.equal(off.total, 0);
  assert.equal(off.complete, true);
  assert.equal(off.personalized, true);
  assert.equal(recommendation(candidate, [candidate], null, { ...prefs, kukkikazeRating: true }).total, .75);
  assert.equal(recommendation(candidate, [candidate], null, { ...prefs, communityRating: true }).total, .5);
  assert.equal(recommendation(candidate, [candidate], null, { ...prefs, mainSkills: true }).total, .5);
  const missing = { ...candidate, community: null };
  assert.equal(recommendation(missing, [missing], null, { ...prefs, kukkikazeRating: true }).total, 1.5);
  assert.equal(recommendation(missing, [missing], null, { ...prefs, communityRating: true }).complete, false);
});

test('beginner pool and newcomer pools are complete and sum all three personalized scores', () => {
  const { tickets, candidates } = buildSelectorCatalogue();
  assert.deepEqual(tickets['Top Operator Transfer Permit - Starter'].operators.map(op => op.name), ['Blaze', 'Exusiai', 'SilverAsh', 'Saria', 'Mountain', 'Thorns']);
  const pools = tickets['Newcomer Special Headhunting Pack'].pools!;
  assert.deepEqual(pools.map(pool => pool.operators.map(op => op.name)), [
    ['Ascalon', 'Typhon', "Ho'olheyak"], ['Lemuen', 'Nymph', 'Jessica the Liberated'], ['Goldenglow', 'Reed the Flame Shadow', 'Gnosis'],
  ]);
  for (const preferences of [DEFAULT_SELECTOR_PREFERENCES, { ...DEFAULT_SELECTOR_PREFERENCES, mainSkills: false, subSkills: true, likesIS: true, likesRA: true }]) {
    const scores = Object.fromEntries(candidates.map(op => [op.name, recommendation(op, candidates, ['Ascalon'], preferences)]));
    for (const pool of pools) {
      const score = combinedRecommendation(pool.operators, scores);
      assert.equal(score.total, Math.round(pool.operators.reduce((sum, op) => sum + scores[op.name].total, 0) * 100) / 100);
      assert.equal(score.lines.length, 3);
    }
    assert.equal(combinedRecommendation(pools[0].operators, { ...scores, Ascalon: { ...scores.Ascalon, complete: false } }).complete, false);
  }
});
