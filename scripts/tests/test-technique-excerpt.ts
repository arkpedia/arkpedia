import assert from 'node:assert/strict';
import test from 'node:test';
import { techniqueExcerpt } from '../../lib/techniques/techniqueExcerpt';

/*
 * The short form a /techniques record shows unless "Detailed Skill Description" is on
 * (lib/techniques/techniqueExcerpt.ts): the operator's own clause, never a summary written
 * for it. The owner, 2026-10-23: a summarized entry "sometimes even leaves out important
 * details like trigger conditions". Fixed strings.
 */
const badge = (sourceText: string, matchedKeyword: string | null, matchedKeywordEnd: string | null = null, highlightSeparately = false) =>
  ({ sourceText, matchedKeyword, matchedKeywordEnd, highlightSeparately });

test('the clause with the match keeps its number and its condition', () => {
  const text = 'Stops attacking ; Attack Range expands , the effect of this unit\'s second Talent increases to 2 times, and all enemies within Attack Range are Slowed . Heals all ally units within range for 20% of this unit\'s ATK every second';
  assert.equal(techniqueExcerpt(badge(text, 'slow')), 'Attack Range expands , the effect of this unit\'s second Talent increases to 2 times, and all enemies within Attack Range are Slowed .');
  // A stat pattern: the word and the number that belong together, in their clause.
  const thumpy = 'Block count +2 and attacks all blocked enemies; ATK +100% and DEF +135% . Enemies on the conveyor belt take 40% of ATK as Physical damage every second, and their DEF additionally -30 when they trigger a Corrosion burst';
  assert.equal(techniqueExcerpt(badge(thumpy, 'DEF', '-30', true)), 'Enemies on the conveyor belt take 40% of ATK as Physical damage every second, and their DEF additionally -30 when they trigger a Corrosion burst');
  // A decimal point is not a clause break.
  assert.equal(techniqueExcerpt(badge('Attacks inflict Cold for 1 second; Recovers 2.5% of Max HP per second while blocking', 'recover', 'hp')), 'Recovers 2.5% of Max HP per second while blocking');
  // A whole word before a part of one: "SP", not the "sp" in "splash" (Exusiai the New Covenant).
  assert.equal(techniqueExcerpt(badge('Deals 250% of ATK as Physical splash damage at the Delivery Coordinates; deploys the ground Operator with the longest Redeployment Time there, granting that Operator 6 SP', 'sp')), 'deploys the ground Operator with the longest Redeployment Time there, granting that Operator 6 SP');
});

test('no short form where there is nothing to cut, so the full text shows', () => {
  // W's and Sesa's talents: one clause, which is the whole text.
  assert.equal(techniqueExcerpt(badge('Enemies in range take +21% (+3%) Physical damage when Stunned', 'take', 'physical damage')), null);
  assert.equal(techniqueExcerpt(badge('When deployed, all blocked enemies take +16% (+2%) Physical damage', null)), null);
  // A skill credited through the talent it names: no words of the technique in it.
  assert.equal(techniqueExcerpt(badge('Attacks hit 2 enemies; ATK +60% ; Talent 1 activation chance increases to 100%', null)), null);
  assert.equal(techniqueExcerpt(badge('', 'slow')), null);
});
