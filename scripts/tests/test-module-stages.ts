import assert from 'node:assert/strict';
import test from 'node:test';
// @ts-expect-error JavaScript builder shared by the catalogue and the English refresh.
import { moduleStages } from '../sync/module-stages.mjs';
import { getModuleStageEffects } from '../../lib/operators/moduleEffects';

/*
 * The rules module-stages.mjs's header documents, one case each, in the game's own shapes
 * (battle_equip_table phases and parts). lib/operators/moduleEffects.ts reads the labels these
 * write back apart, so their exact format is part of the contract.
 */
type Candidate = Record<string, unknown>;
const trait = (candidates: Candidate[]) => ({ overrideTraitDataBundle: { candidates }, addOrOverrideTalentDataBundle: { candidates: null } });
const talent = (candidates: Candidate[]) => ({ overrideTraitDataBundle: { candidates: null }, addOrOverrideTalentDataBundle: { candidates } });
const stages = (...phases: object[][]) => moduleStages({ uniEquipId: 'uniequip_test', itemCost: {} },
  { phases: phases.map((parts) => ({ attributeBlackboard: [], parts })) }, ['Own Talent'], (id: string) => id);
const effects = (result: { effectLabel: string | null; effectText: string | null }[]) => result.map((s) => [s.effectLabel, s.effectText]);

test('two lines for one talent in one stage: the longer, the operator\'s, is shown', () => {
  const [stage] = stages([talent([
    { name: 'Own Talent', talentIndex: 0, upgradeDescription: 'Invisible for 23 seconds', blackboard: [] },
    { name: 'Own Talent', talentIndex: 0, upgradeDescription: 'Drones gain Invisibility for 23 seconds after deployment', blackboard: [] },
  ])]);
  assert.deepEqual(effects([stage]), [['Own Talent improved', 'Drones gain Invisibility for 23 seconds after deployment']]);
});

test('a summon\'s line without talentIndex is keyed by its name (Nightingale RIN-Y)', () => {
  const [stage] = stages([talent([
    { name: 'Own Talent', upgradeDescription: 'Sanctuary lasts longer', blackboard: [] },
    { name: 'Own Talent', talentIndex: 1, upgradeDescription: 'Sanctuary lasts longer and heals', blackboard: [] },
  ])]);
  assert.deepEqual(effects([stage]), [['Own Talent improved', 'Sanctuary lasts longer and heals']]);
});

test('a talent the module brings is "New talent: X" where it first appears, then "X improved"', () => {
  const line = (value: number) => talent([{ name: 'Module Gift', talentIndex: 2, upgradeDescription: 'ATK +{atk:0%}', blackboard: [{ key: 'atk', value }] }]);
  const result = stages([trait([{ additionalDescription: 'Attacks twice', blackboard: [] }])], [line(0.1)], [line(0.15)]);
  assert.deepEqual(effects(result), [['New trait', 'Attacks twice'], ['New talent: Module Gift', 'ATK +10%'], ['Module Gift improved', 'ATK +15%']]);
});

test('a trait that is only rewritten (overrideDescripton) is "Trait improved"; a repeated Stage 2 trait is left out', () => {
  const rewritten = trait([{ additionalDescription: null, overrideDescripton: 'Attacks deal Arts damage to <@ba.kw>{max_target}</> targets', blackboard: [{ key: 'max_target', value: 2 }] }]);
  const result = stages([rewritten], [rewritten], [rewritten]);
  assert.deepEqual(effects(result), [['Trait improved', 'Attacks deal Arts damage to 2 targets'], [null, null], [null, null]]);
});

test('a keyword written flush against the word before it is spaced, and a bare <Name> is the summon\'s name', () => {
  const [stage] = stages([talent([
    { name: 'Own Talent', talentIndex: 0, upgradeDescription: 'Extends the duration of<$ba.sluggish>Slow</>; <Substitute> deals <@ba.vup>+10%</> damage', blackboard: [] },
  ])]);
  assert.equal(stage.effectText, 'Extends the duration of Slow; Substitute deals +10% damage');
});

test('a stage that changes the trait and a talent together keeps one label per line, and the page splits them back', () => {
  const result = stages([
    trait([{ additionalDescription: 'Gains <@ba.kw>{block}</> Block', blackboard: [{ key: 'block', value: 1 }] }]),
    talent([{ name: 'Own Talent', talentIndex: 0, upgradeDescription: 'DEF +{def}', blackboard: [{ key: 'def', value: 40 }] }]),
  ]);
  assert.deepEqual(effects(result), [['New trait · Own Talent improved', 'Gains 1 Block\nDEF +40']]);
  assert.deepEqual(getModuleStageEffects({ stages: result }, 0), [{ label: 'New trait', text: 'Gains 1 Block' }, { label: 'Own Talent improved', text: 'DEF +40' }]);
});

test('numbers read as gametext.mjs prints them everywhere, and a value the stage does not carry is refused', () => {
  const [stage] = stages([talent([{ name: 'Own Talent', talentIndex: 0, upgradeDescription: 'ATK +{atk:0%}, {-cost} DP', blackboard: [{ key: 'atk', value: 0.125 }, { key: 'cost', value: -2 }] }])]);
  assert.equal(stage.effectText, 'ATK +13%, 2 DP');
  assert.throws(() => stages([talent([{ name: 'Own Talent', talentIndex: 0, upgradeDescription: 'ATK +{atk:0%}', blackboard: [] }])]),
    (error: Error & { kind?: string }) => /uniequip_test Stage 1 talent text is missing atk/.test(error.message) && /module/.test(error.kind ?? ''));
});

test('a Potential 5 line and a hidden talent are not the stage\'s text', () => {
  const [stage] = stages([talent([
    { name: 'Own Talent', talentIndex: 0, upgradeDescription: 'ATK +10%', blackboard: [] },
    { name: 'Own Talent', talentIndex: 0, requiredPotentialRank: 4, upgradeDescription: 'ATK +13% at Potential 5, a longer line', blackboard: [] },
    { name: 'Hidden', talentIndex: 1, isHideTalent: true, upgradeDescription: 'Never shown', blackboard: [] },
  ])]);
  assert.deepEqual(effects([stage]), [['Own Talent improved', 'ATK +10%']]);
});
