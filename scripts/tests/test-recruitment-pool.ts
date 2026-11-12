import assert from 'node:assert/strict';
import test from 'node:test';
import snapshot from '../../data/recruitment-global.json';
import { getAllOperators } from '../../lib/operators/operators';
import { getGlobalRecruitmentOperators } from '../../lib/gacha/recruitmentPool';
import { getRecruitmentPageProps } from '../../lib/gacha/recruitmentPageData';
import { getRecruitmentGameData } from '../../lib/minigames/recruitmentData';

test('both recruitment tools use the same reviewed Global roster and tags', async () => {
  // The roster is written by arkpedia-data's importer (its scripts/sync/sync-recruitment.mjs),
  // which refuses to file a recruit whose fields differ from the English game data. The same
  // comparison here is what catches the site's own operator records drifting from it.
  const operatorsById = new Map(getAllOperators().map(operator => [operator.internalName, operator]));
  for (const recruit of snapshot.operators) {
    const operator = operatorsById.get(recruit.id);
    assert.ok(operator, `No local operator for ${recruit.id}`);
    for (const field of ['rarity', 'class', 'position'] as const) assert.equal(operator[field], recruit[field], `${operator.name}: ${field}`);
    assert.deepEqual([...(operator.tags || [])].sort(), recruit.tags, `${operator.name}: tags`);
  }
  assert.equal(new Set(snapshot.operators.map(operator => operator.id)).size, snapshot.operators.length);
  const result = await getRecruitmentPageProps({});
  assert.ok('props' in result);
  const { operators } = await result.props;
  const game = getRecruitmentGameData();
  const names = operators.map(operator => operator.name).sort();
  assert.deepEqual(names, game.operators.map(operator => operator.name).sort());
  assert.deepEqual(names, getGlobalRecruitmentOperators().map(operator => operator.name).sort());
  assert.ok(!names.includes('Deepcolor'));
  assert.ok(names.includes('Mayer') && names.includes('Beanstalk'));
  assert.ok(game.questions.every(question => question.answers.every(name => names.includes(name))));
});
