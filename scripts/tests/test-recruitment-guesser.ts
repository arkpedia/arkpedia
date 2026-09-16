import assert from 'node:assert/strict';
import { test } from 'node:test';
import { gzipSync } from 'node:zlib';
import { computeTagCombos, RecruitableOperator } from '../../lib/gacha/recruitmentCalc';
import { newProgress, normalizeAnswer, pickNext, resolveOperator, submitAnswer } from '../../lib/minigames/logic';
import { buildRecruitmentQuestions } from '../../lib/minigames/recruitmentLogic';
import { getRecruitmentGameData } from '../../lib/minigames/recruitmentData';
import { getAllOperators } from '../../lib/operators/operators';

const game = getRecruitmentGameData();
const op = (name: string, rarity: number, tags = ['DPS'], className = 'Sniper'): RecruitableOperator => ({ name, rarity, tags, class: className, position: 'Ranged', isFuture: false });

test('every recruitment question uses exactly two or three distinct tags and its complete pool has at most three answers', () => {
  const byName = new Map(getAllOperators().map((operator) => [operator.name, operator]));
  const pool = game.operators.map((operator) => byName.get(operator.name)!);
  assert.ok(game.questions.length > 100);
  assert.equal(new Set(game.questions.map((q) => q.id)).size, game.questions.length);
  for (const question of game.questions) {
    assert.ok([2, 3].includes(question.tags.length));
    assert.equal(new Set(question.tags).size, question.tags.length);
    const full = computeTagCombos(question.tags, pool).find((combo) => combo.tags.length === question.tags.length);
    assert.ok(full, question.id);
    assert.deepEqual(question.answers, full.operators.map((operator) => operator.name).sort(), question.id);
    assert.ok(question.answers.length >= 1 && question.answers.length <= 3);
  }
});

test('four matches are rejected even when one is a Robot; narrowing to three remains eligible', () => {
  const pool = [op('One', 3), op('Two', 4), op('Three', 5), op('Robot', 1)];
  assert.equal(buildRecruitmentQuestions(pool).some((q) => q.id === 'DPS|Sniper'), false);
  const questions = buildRecruitmentQuestions(pool.slice(0, 3));
  assert.deepEqual(questions.find((q) => q.id === 'DPS|Sniper')?.answers, ['One', 'Three', 'Two']);
});

test('six-stars require Top Operator and conflicting qualifications never make questions', () => {
  const questions = buildRecruitmentQuestions([op('Five', 5), op('Six', 6)]);
  assert.deepEqual(questions.find((q) => q.id === 'DPS|Sniper')?.answers, ['Five']);
  assert.deepEqual(questions.find((q) => q.id === 'Sniper|Top Operator')?.answers, ['Six']);
  assert.ok(questions.every((q) => !(q.tags.includes('Senior Operator') && q.tags.includes('Top Operator'))));
});

test('all possible recruits must be named; correct answers and duplicates do not spend mistakes', () => {
  const answers = ['One', 'Two', 'Three'];
  let progress = submitAnswer(newProgress(), 'Two', answers);
  assert.equal(progress.status, 'playing');
  assert.equal(progress.wrong.length, 0);
  assert.equal(submitAnswer(progress, 'Two', answers), progress);
  progress = submitAnswer(progress, 'Wrong', answers);
  assert.equal(progress.wrong.length, 1);
  assert.equal(submitAnswer(progress, 'Wrong', answers), progress);
  progress = submitAnswer(progress, 'One', answers);
  assert.equal(progress.status, 'playing');
  progress = submitAnswer(progress, 'Three', answers);
  assert.equal(progress.status, 'won');
  assert.equal(submitAnswer(progress, 'Too late', answers), progress);
});

test('five wrong guesses end the round and keep already-found recruitment answers', () => {
  let progress = submitAnswer(newProgress(), 'One', ['One', 'Two']);
  for (let i = 0; i < 5; i++) progress = submitAnswer(progress, `Wrong${i}`, ['One', 'Two']);
  assert.equal(progress.status, 'lost');
  assert.deepEqual(progress.found, ['One']);
  assert.equal(submitAnswer(progress, 'Two', ['One', 'Two']), progress);
});

test('operator input handles accents, punctuation and known language aliases without conflating alters', () => {
  const operators = [{ name: "Wiš'adel", aliases: ['维什戴尔'], icon: '' }, { name: 'Texas', aliases: ['德克萨斯'], icon: '' }, { name: 'Texas the Omertosa', aliases: ['缄默德克萨斯'], icon: '' }];
  assert.equal(resolveOperator('wisadel', operators)?.name, "Wiš'adel");
  assert.equal(resolveOperator('维什戴尔', operators)?.name, "Wiš'adel");
  assert.equal(resolveOperator('texas', operators)?.name, 'Texas');
  assert.equal(resolveOperator('德克萨斯', operators)?.name, 'Texas');
  assert.equal(resolveOperator('someone else', operators), null);
  assert.equal(normalizeAnswer('Lancet 2'), normalizeAnswer('Lancet-2'));
});

test('small pools cycle without immediate repeats and empty selections are safe', () => {
  const items = [{ name: 'One' }, { name: 'Two' }];
  assert.equal(pickNext(items, ['One'], (i) => i.name)?.name, 'Two');
  assert.equal(pickNext(items, ['One', 'Two'], (i) => i.name)?.name, 'One');
  assert.equal(pickNext([], [], String), null);
});

test('recruitment ships compact data and only released recruitable answers', () => {
  assert.ok(gzipSync(JSON.stringify(game)).length < 30000);
  const names = new Set(game.operators.map(operator => operator.name));
  assert.ok(game.questions.every(q => q.answers.every(name => names.has(name))));
  assert.ok(!names.has('Amiya'));
  assert.ok(names.has('Lancet-2'));
});


test('recruitment guesser never accepts headhunting-only Deepcolor', () => {
  assert.ok(!game.operators.some((operator) => operator.name === 'Deepcolor'));
  assert.ok(game.questions.every((question) => !question.answers.includes('Deepcolor')));
  assert.ok(game.questions.some((question) => question.tags.includes('Summon') && question.answers.includes('Mayer')));
});
