import assert from 'node:assert/strict';
import { test } from 'node:test';
import { computeTagCombos, getRecruitmentTagCategories } from '../lib/gacha/recruitmentCalc';
import { getRecruitmentPageProps } from '../lib/gacha/recruitmentPageData';
import { DEFAULT_RECRUITMENT_VIEW, readRecruitmentView, recruitmentViewHash } from '../lib/gacha/recruitmentViewState';

test('a pop-out URL restores tags, filter, view and search', () => {
  const state = {
    selectedTags: ['Top Operator', 'DPS', 'Crowd-Control'],
    showAllPossibilities: true,
    activeSection: 'cheatsheet' as const,
    cheatSheetSearch: 'DPS + Healing & Support',
  };
  assert.deepEqual(readRecruitmentView(recruitmentViewHash(state), state.selectedTags), state);
  assert.equal(recruitmentViewHash(DEFAULT_RECRUITMENT_VIEW), '');
  assert.deepEqual(readRecruitmentView('', []), DEFAULT_RECRUITMENT_VIEW);
});

test('a restored selection rejects unknown tags, deduplicates, and caps at five', () => {
  const tags = ['Guard', 'DPS', 'Melee', 'Healing', 'Defense', 'Support'];
  const hash = '#tag=unknown&tag=Guard&tag=Guard&tag=DPS&tag=Melee&tag=Healing&tag=Defense&tag=Support&view=bad&all=true';
  assert.deepEqual(readRecruitmentView(hash, tags), { ...DEFAULT_RECRUITMENT_VIEW, selectedTags: tags.slice(0, 5) });
  assert.equal(readRecruitmentView(`#q=${'x'.repeat(1000)}`, []).cheatSheetSearch.length, 100);
});

test('both recruitment views use the compact real operator pool and retain calculator rules', async () => {
  const result = await getRecruitmentPageProps({});
  assert.ok('props' in result);
  const { operators, guaranteedCombos4, guaranteedCombos5 } = await result.props;
  assert.ok(operators.length > 100);
  assert.ok(guaranteedCombos4.length && guaranteedCombos5.length);
  assert.doesNotThrow(() => JSON.stringify(result));
  assert.deepEqual(Object.keys(operators[0]).sort(), ['class', 'isFuture', 'name', 'position', 'rarity', 'tags']);
  const allowedTags = Object.values(getRecruitmentTagCategories(operators)).flat();
  assert.ok(allowedTags.includes('Robot'));
  assert.ok(computeTagCombos(['Robot'], operators)[0].operators.some((operator) => operator.rarity === 1));
  const normal = computeTagCombos(['Guard', 'DPS', 'Melee', 'Healing', 'Defense'], operators);
  assert.ok(normal.length);
  assert.ok(normal.every((combo) => combo.tags.length <= 3 && combo.operators.every((operator) => operator.rarity !== 6)));
  const top = computeTagCombos(['Top Operator', 'DPS'], operators);
  assert.ok(top.some((combo) => combo.tags.includes('Top Operator')));
  assert.ok(top.filter((combo) => combo.tags.includes('Top Operator')).every((combo) => combo.operators.every((operator) => operator.rarity === 6)));
});
