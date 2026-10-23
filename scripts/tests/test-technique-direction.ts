import assert from 'node:assert/strict';
import test from 'node:test';
import { detectAutoTechniqueMatches } from '../../lib/techniques/autoTechniques';

/*
 * Who an effect lands on decides its technique (lib/techniques/techniqueDirection.ts). The
 * owner, 2026-10-23: "in 'arts damage taken' some operators are included that increase arts
 * damage taken by enemies, while other reduce arts damage taken by the operator. these
 * should be split into 2 categories ... also in arts damage taken, necrass is included for
 * some reason". Each line is the operator's own text from its record (talent rows at their
 * last row, skills at their top level), read the way /techniques and the operator page read
 * them. Fixed strings, never the day's data.
 */
const names = (text: string, operator: string, branch: string | null = null, cls: string | null = null) =>
  detectAutoTechniqueMatches(6, [text], operator, branch, cls).map((m) => m.name);

test('enemies taking more Physical or Arts damage is the "Damage Taken" debuff', () => {
  // W's Talent 2 and Sesa's Talent 1: on their records by hand only, until a rule read them.
  assert.ok(names('Enemies in range take +21% (+3%) Physical damage when Stunned', 'W').includes('Physical Damage Taken'));
  assert.ok(names('When deployed, all blocked enemies take +16% (+2%) Physical damage', 'Sesa').includes('Physical Damage Taken'));
  assert.ok(names('Increases the Arts Damage taken by all blocked enemies by 18% (+3%) when deployed', 'Skyfire').includes('Arts Damage Taken'));
  assert.ok(names('Restores the HP of all nearby allies per second by 35% of Saria\'s ATK The Arts damage taken by nearby enemies +55% and their Movement Speed -60%', 'Saria').includes('Arts Damage Taken'));
  assert.ok(names('Attacks inflict -10 RES and Arts damage taken +165 (+15) on targets for 5s.', 'Logos').includes('Arts Damage Taken'));
});

test('the operator dealing damage is not a damage-taken debuff', () => {
  // Necrass's S3: a hit, nothing more. "take ... Arts damage" was all the rule saw.
  const necrass = names('Passive Effect: Whenever a Servant of Lamentation is created or upgraded, all surrounding enemies take 450% of Necrass\'s ATK as Arts damage', 'Necrass');
  assert.ok(!necrass.includes('Arts Damage Taken'), necrass.join(', '));
  assert.ok(!necrass.includes('Damage Over Time'), necrass.join(', '));
  assert.ok(!names('While being pulled, enemies take Arts damage proportional to the distance traveled', 'Gladiia').includes('Arts Damage Taken'));
  // Damage that keeps landing is Damage Over Time.
  const tinMan = names('Throws an Alchemical Unit. For 10 seconds, enemies around the landing point suffer from -30% Enfeeble and take 75% ATK as Arts damage per second', 'Tin Man');
  assert.ok(tinMan.includes('Damage Over Time') && !tinMan.includes('Arts Damage Taken'), tinMan.join(', '));
});

test('the operator or its allies taking less damage is Damage Reduction', () => {
  const lessing = names('When blocking, take 35% less Physical and Arts damage from enemies not blocked by this unit', 'Lessing');
  assert.deepEqual(lessing.filter((n) => /Damage/.test(n ?? '')), ['Damage Reduction']);
  const viviana = names('Deal +9% (+1%) Arts damage and take -9% (+1%) Physical and Arts damage. Double effect if there is an elite or leader enemy within attack range', 'Viviana');
  assert.ok(viviana.includes('Damage Reduction') && !viviana.includes('Arts Damage Taken'), viviana.join(', '));
  // "(+3%)" is a potential's step, not an increase.
  const bena = names('Substitute deals Arts damage and reduces Physical and Arts damage taken by 43% (+3%)', 'Bena');
  assert.ok(bena.includes('Damage Reduction') && !bena.includes('Arts Damage Taken'), bena.join(', '));
  // Less healing is not less damage (Thorns the Lodestar's S1): that one is damage per second.
  const thorns = names('Throws an Alchemical Unit; for 15 s, ground enemies around the landing point receive 50% less healing and recovery effects, and takes 180% ATK as Arts damage per second', 'Thorns the Lodestar');
  assert.ok(!thorns.includes('Damage Reduction') && thorns.includes('Damage Over Time'), thorns.join(', '));
});

test('healing others is Ally Healing; healing itself stays Self-Sustain', () => {
  assert.deepEqual(names('Restores the HP of all allies by 25 (+5) per second when the skill is not activated', 'Angelina').filter((n) => /Heal|Sustain/.test(n ?? '')), ['Ally Healing']);
  assert.deepEqual(names('Each attack restores 5% HP and has a 25% chance to stun targets for 5 seconds', 'Hoederer').filter((n) => /Heal|Sustain/.test(n ?? '')), ['Self-Sustain']);
  // Both: to Pallas and to the Operator ahead.
  assert.deepEqual(names('Every hit against an enemy restores 45 (+5) HP to Pallas and the Operator on the tile ahead', 'Pallas').filter((n) => /Heal|Sustain/.test(n ?? '')).sort(), ['Ally Healing', 'Self-Sustain']);
  // The operators are the condition, the HP is Yu's own.
  assert.deepEqual(names('When there are at least 4 Operators on the field, recovers 2% (+0.5%) of Max HP per second', 'Yu').filter((n) => /Heal|Sustain/.test(n ?? '')), ['Self-Sustain']);
});

test('a barrier, status resistance or SP handed to others is the allies\' version', () => {
  assert.deepEqual(names('The next heal grants all targets a Barrier that lasts for 5 seconds The barrier can absorb Arts damage equal to 90% of Nightingale\'s ATK', 'Nightingale').filter((n) => /Barrier/.test(n ?? '')), ['Ally Barrier']);
  assert.deepEqual(names('Immediately grants self and Structural Principle a Barrier equal to 10% of Max HP', 'Mechanist').filter((n) => /Barrier/.test(n ?? '')), ['Barrier Generation']);
  assert.deepEqual(names('Targets healed by this unit gain status resistance for 4 seconds', 'Purestream').filter((n) => /Status Resistance/.test(n ?? '')), ['Ally Status Resistance']);
  assert.deepEqual(names('Gains status resistance after being deployed for 12 (-3) seconds', 'Blaze').filter((n) => /Status Resistance/.test(n ?? '')), ['Status Resistance']);
  // Using it grants nothing (Whisperain's talent).
  assert.ok(!names('Allied units with status resistance within this unit\'s Attack Range will restore HP per second equal to 7% (+1%) of Whisperain\'s ATK', 'Whisperain').some((n) => /Status Resistance/.test(n ?? '')));
  assert.deepEqual(names('Every 2.5 seconds when deployed, restores 1 Skill Point to all deployed Sniper allies that have an Offensive Recovery skill.', 'Archetto').filter((n) => /SP /.test(n ?? '')), ['SP Recovery Booster']);
  assert.deepEqual(names('When Operators within Attack Range activate a skill, Record Keeper recovers 1 SP and gains ASPD +16 for 10 (+2) s', 'Record Keeper').filter((n) => /SP /.test(n ?? '')), ['SP Charging']);
  assert.ok(!names('SP recovery is slowed except when blocking enemies', 'Cement').some((n) => /SP /.test(n ?? '')));
});

test('a status or stat on the operator itself is not one it inflicts', () => {
  assert.ok(!names('ATK -5%, but allied Operators within range receive 17% (+2%) more healing', 'Rose Salt').includes('ATK Down'));
  assert.ok(names('ATK +75% for the next hit; The target\'s ATK -40% for 5 seconds', 'Mousse').includes('ATK Down'));
  assert.ok(!names('when attacking, this unit and the Sniper Operator has a 20% chance to Stun themselves for 1.8 seconds', 'Spuria').includes('Stun'));
  assert.ok(!names('When on field, all Kjerag Operators gain Frozen immunity, +80 (+20) DEF, and recover 2% (+0.5%) of Max HP every second', 'SilverAsh the Reignfrost').includes('Cold / Freeze'));
  assert.ok(!names('Receives -12% (+2%) Elemental Injury, and recovers 2 SP when receiving Necrosis', 'Philae').includes('Necrosis'));
  assert.ok(names('Enemies within attack range take 10% ATK as Necrosis per second, and are Slowed for 0.8 seconds', 'Virtuosa').includes('Necrosis'));
});

/*
 * The full sweep of every entry (2026-10-23): words that matched inside other words, SP that
 * is only a condition, and the operator's own HP read as someone else's.
 */
test('a keyword inside another word or mechanic is not the technique', () => {
  // Hold Charges is a skill's stored charges: not a "Charged effect", a Liberator's charge or a bomb.
  assert.ok(names('Can store 3 charge(s)', 'Ceobe').includes('Hold Charges'));
  assert.ok(!names('ATK +60% , DEF +100% Charged effect: Trait effect remains active during the skill', 'Carnelian').includes('Hold Charges'));
  assert.ok(!names('Directly gains +100% charge after deployment', 'Tequila', null, null).includes('Hold Charges'));
  assert.ok(!names('Upon skill activation, places a Cluster Charge on the high-ground tile in front', 'Fuze').includes('Hold Charges'));
  assert.ok(!names('Slightly increase Attack Interval and fire Dragon Arrows that deal 240% ATK as Physical damage', 'Toddifons').includes('Pseudo-Puller'));
  assert.ok(!names('SP recovery is slowed except when blocking enemies', 'Cement').includes('Slow'));
  assert.ok(!names('Organ : ASPD +140 , notes deal Arts damage and fly slower', 'Togawa Sakiko').includes('Slow'));
  assert.ok(!names('The Slumberfoot falls asleep and recovers 14% Max HP every second', 'Blacknight').includes('Sleep'));
  assert.ok(!names('Has a 50% chance to fail, instead Stunning all allied units within range for 5 seconds', 'Conviction').includes('Stun'));
});

test('SP counts only where it is gained, and goes to whoever gains it', () => {
  assert.ok(!names('When this unit\'s skill is not active and SP is less than or equal to half of the maximum, stops attacking and restores 3.5% (+0.5%) Max HP every second', 'Aurora').some((n) => /SP /.test(n ?? '')));
  assert.ok(!names('Can use Equipment Alteration to activate skill when SP is full', 'Hadiya').some((n) => /SP /.test(n ?? '')));
  assert.deepEqual(names('When deployed, increases the SP recovery rate of all Casters by +0.4/second (only the highest effect of this type takes place)', 'Mostima').filter((n) => /SP /.test(n ?? '')), ['SP Recovery Booster']);
  assert.deepEqual(names('In [Tales Within the Sand], SP recovery rate of this unit +0.3/s', 'Kestrel').filter((n) => /SP /.test(n ?? '')), ['SP Charging']);
  assert.deepEqual(names('When this skill is equipped: Device gives an ally Operator 1 SP every 3.5s', 'Stainless').filter((n) => /SP /.test(n ?? '')), ['SP Recovery Booster']);
  // Saria's name is the condition; the SP is the healed ally's.
  assert.deepEqual(names('When Saria restores an ally\'s HP, she also restores 1 extra Skill Point to them', 'Saria').filter((n) => /SP /.test(n ?? '')), ['SP Recovery Booster']);
});

test('the operator\'s own HP is Self-Sustain, however the text puts it', () => {
  const heal = (text: string, op: string) => names(text, op).filter((n) => /Heal|Sustain/.test(n ?? ''));
  assert.deepEqual(heal('Instead of retreating when defeated, recover HP to the max and gain -50% Max HP, +21 (+3) ASPD, and +21% (+3%) DEF', 'Horn'), ['Self-Sustain']);
  assert.deepEqual(heal('ATK +80% , each attack restores HP to this unit equal to 40% of the damage dealt', 'Gavial the Invincible'), ['Self-Sustain']);
  assert.deepEqual(heal('Upon receiving lethal damage, as long as enough DP is available, consumes 5 DP to restore this unit\'s HP to 80% (+10%)', 'Swire the Elegant Wit'), ['Self-Sustain']);
  // SP, and an enemy's HP: no healing at all. Nor a trait that stops healing.
  assert.deepEqual(heal('ATK increased to 125% (+5%) and recover 2 additional SP when hitting an enemy with full HP', 'Puzzle'), []);
  assert.deepEqual(heal('When skill is active, Trait no longer restores HP', 'Misumi Uika'), []);
});
