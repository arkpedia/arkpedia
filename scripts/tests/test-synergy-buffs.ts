import assert from 'node:assert/strict';
import test from 'node:test';
import { SYNERGY_BUFFS, synergyBuffs } from '../../lib/techniques/synergyBuffs';

/*
 * /synergies' Buff filter reads what a talent, skill or module grants the faction or class
 * from its text (lib/techniques/synergyBuffs.ts). Each line is a record's own wording
 * (2026-10-23), with the buff kinds the faction or class actually gets from it. Fixed
 * strings rather than the day's data: the release job runs npm test against new records,
 * and a new text that reads as Other is a fact about the text, not a failure.
 */
const cases: [text: string, keyword: string, expected: string[]][] = [
  ['When this unit is in the squad, all [Abyssal Hunter] Operators gain +16% (+2%) ATK', 'Abyssal Hunters', ['ATK']],
  ['When deployed, all [Abyssal Hunters] Operators recover 2.5% of Max HP per second and receive 25% less Physical and Arts damage from [Seaborn] enemies', 'Abyssal Hunters', ['HP recovery', 'Protection']],
  ['When this unit is in the squad, all [Abyssal Hunter] Operators gain +22% ATK and +20% Max HP', 'Abyssal Hunters', ['ATK', 'Max HP']],
  ['Increases Max HP by 120 and ATK by 30 after defeating an enemy, stacking up to 10 (+1) times; other [Abyssal Hunter] Operators gain 50% of this boost effect', 'Abyssal Hunters', ['ATK', 'Max HP']],
  ['When Mutsumi Wakaba or her <Substitute> receives Physical or Arts damage, the damage is reduced by 30%, and half of the reduced damage is received as Necrosis ; <Substitute> does not attack and has DEF +24% (+4%) ; whenever Ave Mujica members attack, there is a 20% chance <Substitute> duration shortens by 1s', 'Ave Mujica', ['Other']],
  ['Fever +5 whenever restoring an Ave Mujica member\'s HP; when Ave Mujica members within Attack Range attack, they deal an extra 30% of Uika Misumi\'s ATK as Arts damage', 'Ave Mujica', ['Damage']],
  ['When deployed, all Kazimierz Operators gain 30% Physical Dodge; additionally, generates 3 DP whenever a Kazimierz Operator is deployed', 'Kazimierz', ['Protection', 'DP & redeploy']],
  ['ASPD +12 (+2) ; the same buff is given to a random [Kazimierz] Operator when deployed', 'Kazimierz', ['ASPD']],
  ['When deployed, reduce the Redeployment Time of [Kazimierz] Operators currently on cooldown by 5 seconds', 'Kazimierz', ['DP & redeploy']],
  ['Attacks inflict Cold for 1 second; In Integrated Strategies , when on the field, applies 30% Fragile to all Cold enemies. Frozen enemies receive double the Fragile effect; Cold or Frozen enemies take 5% more Fragile every second up to a maximum of 80%; other Kjerag Operators inflict 4 seconds of Cold to enemies within range on every skill activation', 'Kjerag', ['Other']],
  ['When on field, all Kjerag Operators gain Frozen immunity, +80 (+20) DEF, and recover 2% (+0.5%) of Max HP every second; after being deployed for 15 seconds, DEF and HP recovery effects double', 'Kjerag', ['DEF', 'HP recovery', 'Protection']],
  ['Operators with ammo-type skills gain ATK +13% (+4%) ; effect is doubled for [Laterano] Operators', 'Laterano', ['ATK', 'Ammo']],
  ['Elite or leader enemies who are within a Laterano Operator\'s Attack Range for more than 6 (-2) seconds become Wanted, taking +18% (+3%) more damage from Laterano Operators; Lemuen can attack all Wanted enemies', 'Laterano', ['Damage']],
  ['When deployed, all [Minos] Operators have their ATK increased to 116% when attacking enemies with an HP percentage equal to or lower than their own', 'Minos', ['ATK']],
  ['When in the squad, all [Rhine Lab] Operators have DP cost -2, and the first [Rhine Lab] Operator deployed has an additional -2 (+1) DP Cost', 'Rhine Lab', ['DP & redeploy']],
  ['Minimum DP -4 ( -1 ) when Closure is in the squad; all [Rhodes Island] Operators ATK +4%.', 'Rhodes Island', ['ATK']],
  ['When this unit is in the squad, all [Siracusa] Operators gain +6 (+1) Initial SP', 'Siracusa', ['SP']],
  ['When deployed, allied Defender operators gain +8% DEF', 'Defender', ['DEF']],
  ['When deployed, friendly Defender Operators gain 11% DEF, and this unit additionally gains 6% DEF', 'Defender', ['DEF']],
  ['DEF +70 (+20) ; If a Vanguard or Guard is deployed behind Bison, that Vanguard or Guard gains the same effect.', 'Guard', ['DEF']],
  ['When this unit\'s skill is active, all Medic and Supporter Operators gain +15% Max HP and status resistance', 'Medic', ['Max HP', 'Protection']],
  ['Every 2.5 seconds when deployed, restores 1 Skill Point to all deployed Sniper allies that have an Offensive Recovery skill.', 'Sniper', ['SP']],
  ['When deployed, Ch\'en\'s ammo-based skills have a 22% (+2%) chance to not consume the corresponding ammo for each shot; Other Sniper Operators\' ammo-based skills have a 10% chance instead (only the highest effect of this type will be applied)', 'Sniper', ['Ammo']],
  ['When deployed, grants +8% ATK to this unit and a random deployed [Caster] Operator; In Integrated Strategies , Rosmontis also benefits from [Caster] Collectibles, and when any [Sniper] or [Caster] Operator is deployed, 1 stronger piece of Tactical Equipment with special effects is obtained', 'Sniper', ['Other']],
  ['Carries 3 Reliable Batteries that only take effect on Casters and Supporters (max 2 deployed at once). Equipped units gain +17% (+2%) ATK (lasts for 30 seconds)', 'Caster', ['ATK']],
  ['All [Vanguard] Operators recover 28 (+3) HP per second while Myrtle is deployed', 'Vanguard', ['HP recovery']],
  ['When deployed, increases all Vanguard Operators\' ATK and DEF by 8%, and additionally increases this unit\'s ATK and DEF by 8% [ note 2 ]', 'Vanguard', ['ATK', 'DEF']],
];

test('a synergy text reads as the buffs it grants the faction or class it names', () => {
  for (const [text, keyword, expected] of cases) assert.deepEqual(synergyBuffs(text, keyword), expected, text);
});

test('every text gets at least one kind, in the filter\'s order', () => {
  assert.deepEqual(synergyBuffs(null, 'Kjerag'), ['Other']);
  assert.deepEqual(synergyBuffs('Has no effect worth naming on [Kjerag] Operators', 'Kjerag'), ['Other']);
  for (const [text, keyword] of cases) {
    const tags = synergyBuffs(text, keyword);
    assert.deepEqual(tags, [...tags].sort((a, b) => SYNERGY_BUFFS.indexOf(a) - SYNERGY_BUFFS.indexOf(b)), text);
  }
});
