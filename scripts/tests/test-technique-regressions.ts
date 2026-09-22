import assert from 'node:assert/strict';
import { test } from 'node:test';
import { detectAutoTechniques } from '../../lib/techniques/autoTechniques';
import { findSynergyMatches } from '../../lib/techniques/synergyDetection';
import { buildTechniqueGroups } from '../../lib/techniques/buildTechniqueGroups';
import { buildEnemyStatusOperatorMap, ENEMY_STATUS_TECHNIQUES, ENEMY_STATUSES } from '../../lib/enemies/statusOperators';
import { getAllOperators } from '../../lib/operators/operators';
import { appliesEnemyStatus } from '../../lib/enemies/statusSources';
import { isOperatorReleased } from '../../lib/operators/operatorAvailability';

const techniques = (texts: string[], name = 'Fixture') =>
  detectAutoTechniques(6, texts, name).map((entry) => entry.name);
const factions = ['Ursus', 'Ursus Student Self-Governing Group', 'Glasgow', 'Sui']
  .map((name) => ({ name, type: 'faction' as const }));
const groups = (text: string) => findSynergyMatches(text, factions).map((entry) => entry.name).sort();

test('an operator named Silence does not acquire the Silence status from their own name', () => {
  assert.ok(!techniques(['When Silence is deployed, Medics gain ATK +10%.'], 'Silence').includes('Silence'));
  assert.ok(!techniques(['When Silence the Paradigmatic is deployed, allies gain Shelter.'], 'Silence the Paradigmatic').includes('Silence'));
  assert.ok(techniques(['Disables the special abilities of enemies.'], 'Lappland').includes('Silence'));
});

test('separate skill levels cannot invent an ASPD debuff across their boundary', () => {
  const hazeLevel = 'Max HP -75%; ATK +15%; ASPD +35';
  assert.ok(!techniques([hazeLevel, hazeLevel], 'Haze').includes('ASPD Down'));
  assert.ok(techniques(['ASPD -35 for all enemies in range.']).includes('ASPD Down'));
});

test('ordered technique keywords stay within a sentence or input row', () => {
  assert.ok(!techniques(['Steals DEF from enemies.', 'ATK +20%.']).includes('Steal ATK'));
  assert.ok(!techniques(['Recovers SP; Max HP +20%.']).includes('Self-Sustain'));
  assert.ok(!techniques(['Recovers SP. Max HP +20%.']).includes('Self-Sustain'));
  assert.ok(techniques(['Steals 20 ATK from the enemy.']).includes('Steal ATK'));
});

test('decimal healing amounts remain valid within an ordered technique phrase', () => {
  assert.ok(techniques(['Recovers 2.5% of Max HP per second.'], 'Gladiia').includes('Self-Sustain'));
  assert.ok(techniques(['Restores 4% (+0.5%) max HP per second.'], 'Thorns').includes('Self-Sustain'));
});

test('repeated bracketed faction spelling variants resolve to the full intended group', () => {
  assert.deepEqual(groups('All [Ursus Student Self-government Group] operators gain ATK. [Ursus Student Self-government Group] operators also gain DEF.'), ['Ursus Student Self-Governing Group']);
});

test('a standalone faction mention survives beside a different resolved bracket', () => {
  assert.deepEqual(groups('Ursus operators and [Ursus Student Self-government Group] operators gain ATK.'), ['Ursus', 'Ursus Student Self-Governing Group']);
});

test('Glasgow Gang keeps its actual Glasgow faction match', () => {
  assert.deepEqual(groups('All [Glasgow Gang] operators gain ATK.'), ['Glasgow']);
});

test('short editorial brackets never become a fuzzy faction match', () => {
  assert.deepEqual(groups('An unrelated description [ sic ].'), []);
  assert.deepEqual(groups('All [Sui] operators gain ATK.'), ['Sui']);
});

test('enemy status recommendations come from the shared technique index', () => {
  const statusOperators = buildEnemyStatusOperatorMap(buildTechniqueGroups());
  for (const [status, technique] of Object.entries(ENEMY_STATUS_TECHNIQUES)) {
    const group = statusOperators[status as keyof typeof statusOperators];
    assert.ok(group, `${status} should resolve to ${technique}`);
    assert.equal(group?.technique, technique);
    assert.ok((group?.operators.length ?? 0) > 0);
    assert.ok((group?.operators.length ?? 0) <= 4);
  }
});

test('enemy status recommendations remain populated after filtering to released operators', () => {
  const releasedNames = new Set(getAllOperators()
    .filter(operator => isOperatorReleased(operator))
    .map(operator => operator.name));
  const statusOperators = buildEnemyStatusOperatorMap(buildTechniqueGroups(), releasedNames);
  for (const status of ENEMY_STATUSES) {
    assert.ok(statusOperators[status as keyof typeof statusOperators], `${status} should have a released operator`);
  }
});


test('module status badges use the actual module code and expose mode restrictions', () => {
  const map = buildEnemyStatusOperatorMap(buildTechniqueGroups(), undefined, 500);
  const angelina = map.Levitate!.operators.find(op => op.name === 'Angelina');
  assert.equal(angelina?.sourceLabel, 'Module ISW-α (Stage 3) · Integrated Strategies');
  assert.equal(map.Sleep!.operators.find(op => op.name === 'Blemishine')?.sourceLabel, 'Skill 2');
  assert.equal(map.Sleep!.operators.find(op => op.name === 'Erato')?.sourceLabel, 'Skill 1');
  assert.equal(map.Sleep!.operators.find(op => op.name === 'Blacknight')?.sourceLabel, 'Skill 2');
  assert.ok(!map.Stun!.operators.some(op => ['Bryophyta', 'Conviction'].includes(op.name)), 'self/allied stun is not an enemy application');
});


test('status source checks distinguish applying a status from immunity, synergy, and self effects', () => {
  for (const [status, text] of [
    ['Sleep', 'Can attack Sleeping enemies; increases ATK when attacking Sleeping enemies'],
    ['Sleep', 'Puts herself to Sleep for 5 seconds'],
    ['Stun', 'Immune to Stun'],
    ['Stun', 'After skill ends, Stuns self for 5s'],
    ['Stun', 'Stunning all allied units within range for 5 seconds'],
    ['Frozen', 'All allied Operators gain Frozen immunity'],
    ['Levitate', 'Levitated enemies take more Arts damage'],
  ]) assert.equal(appliesEnemyStatus(status, text), false, text);
  assert.equal(appliesEnemyStatus('Stun', 'Stuns hit targets for 1 second; then Stuns self for 5s'), true);
  assert.equal(appliesEnemyStatus('Sleep', 'Puts herself to Sleep; puts nearby enemies to Sleep'), true);
});


test('all displayed enemy statuses have sources, including Disarm and Paralysis', () => {
  assert.deepEqual(Object.keys(ENEMY_STATUS_TECHNIQUES), [...ENEMY_STATUSES]);
  const map = buildEnemyStatusOperatorMap(buildTechniqueGroups(), undefined, 500);
  assert.equal(map.Disarm!.technique, 'Frighten');
  assert.equal(map.Disarm!.operators.find(op => op.name === 'Degenbrecher')?.sourceLabel, 'Talent 1');
  assert.ok(map.Disarm!.operators.some(op => op.name === 'Laios'));
  assert.equal(map.Paralysis!.technique, 'Nervous Impairment');
  assert.equal(map.Paralysis!.operators.find(op => op.name === 'Tragodia')?.sourceLabel, 'Talent 1');
  assert.ok(map.Paralysis!.operators.some(op => op.name === 'Cairn'));
  assert.equal(map.Paralysis!.operators.find(op => op.name === 'Thorns')?.sourceLabel, 'Module LOR-Δ (Stage 1)', 'buildup comes from the trait, not the Stage 3 burst synergy');
});

test('Disarm and Paralysis sources exclude synergy and amplification', () => {
  assert.ok(appliesEnemyStatus('Disarm', 'Frighten the target for 5s'));
  assert.ok(appliesEnemyStatus('Disarm', 'Enemies blocked during skill are Frightened'));
  assert.ok(!appliesEnemyStatus('Disarm', 'Ignores 30% DEF when attacking Frightened targets'));
  assert.ok(appliesEnemyStatus('Paralysis', 'Attacks deal an additional 30% of ATK as Nervous Impairment'));
  assert.ok(appliesEnemyStatus('Paralysis', 'When enemies attack, they take 70 points of Nervous Impairment'));
  assert.ok(!appliesEnemyStatus('Paralysis', 'Targets receive 1.8 x more Nervous Impairment during the Bind'));
  assert.ok(!appliesEnemyStatus('Paralysis', 'Enemies under the burst effect of Nervous Impairment have ASPD -16'));
});
