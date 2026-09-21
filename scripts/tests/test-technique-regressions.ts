import assert from 'node:assert/strict';
import { test } from 'node:test';
import { detectAutoTechniques } from '../../lib/techniques/autoTechniques';
import { findSynergyMatches } from '../../lib/techniques/synergyDetection';
import { buildTechniqueGroups } from '../../lib/techniques/buildTechniqueGroups';
import { buildEnemyStatusOperatorMap, ENEMY_STATUS_TECHNIQUES } from '../../lib/enemies/statusOperators';

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
