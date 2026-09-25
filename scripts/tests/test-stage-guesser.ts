import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import StageLayoutMap from '../../components/minigames/StageLayoutMap';
import { getStageGuesserQuestions, isStageGuesserVersion } from '../../lib/minigames/stageGuesserData';
import { guessStage, newStageRound, revealStageHint, resolveStageAnswer, searchStageAnswers, STAGE_HINTS, STAGE_MISTAKES } from '../../lib/minigames/stageGuesser';
import { normalizeAnswer, pickNext } from '../../lib/minigames/logic';
import curated from '../../data/stage-guesser.json';
import { publicFileExists } from '../../lib/assets/publicAssets';
import externalAssets from '../../data/assets/external-asset-index.json';
import tileDescriptions from '../../data/stage-tile-legend.json';
import { GAMES, GAME_PATHS, isGamePath } from '../../lib/minigames/catalogue';

const questions = getStageGuesserQuestions(new Date('2026-09-10T12:00:00Z'));

test('every curated stage is a released playable version with its own published map and source-backed hints', () => {
  assert.equal(questions.length, curated.stages.length);
  assert.equal(new Set(questions.map((q) => normalizeAnswer(q.code))).size, questions.length);
  assert.deepEqual([...new Set(questions.map((q) => q.collection))].sort(), ['event', 'story']);
  for (const q of questions) {
    const stage = JSON.parse(fs.readFileSync(path.join('data/stages', `${q.slug}.json`), 'utf8'));
    assert.ok(isStageGuesserVersion(stage));
    assert.equal(q.name, stage.name);
    const geometry = JSON.parse(fs.readFileSync(path.join('data/stage-geometry', `${q.slug}.json`), 'utf8'));
    for (const key of ['rows', 'cols', 'tileGrid'] as const) assert.deepEqual(q.layout[key], geometry[key]);
    assert.deepEqual(q.layout.tileLegend.map(({ name, description, ...tile }) => tile), geometry.tileLegend);
    for (const tile of q.layout.tileLegend) {
      assert.ok(tile.name && typeof tile.description === 'string');
      const info = (tileDescriptions as Record<string, { name: string; description: string }>)[tile.key];
      if (info) { assert.equal(tile.name, info.name); assert.equal(tile.description, info.description); }
    }
    assert.deepEqual(Object.keys(q.layout).sort(), ['cols', 'rows', 'tileGrid', 'tileLegend']);
    const imagePath = decodeURIComponent(q.image).replace(/^\//, '');
    assert.ok(publicFileExists(imagePath), `Missing stage artwork: ${imagePath}`);
    assert.match((externalAssets.sha256 as Record<string, string>)[imagePath] ?? '', /^[a-f0-9]{64}$/, `Missing artwork fingerprint: ${imagePath}`);
    assert.ok(q.source.includes(stage.content.name));
    assert.ok(q.reason.trim());

  }
  // The curated layouts are build-time inputs; only the lazy catalogue ships to players.
});

test('Global release filtering excludes future stages and includes the release-day boundary', () => {
  assert.equal(getStageGuesserQuestions(new Date('2020-01-15T23:59:59Z')).length, 0);
  const launch = getStageGuesserQuestions(new Date('2020-01-16T00:00:00Z'));
  assert.ok(launch.some((q) => q.code === '1-7'));
  assert.ok(!launch.some((q) => q.collection === 'event'));
  assert.ok(!launch.some((q) => q.code === 'JT8-3'));
});

test('answers support compact codes, Unicode dashes, case and full titles without guessing ambiguous names', () => {
  for (const input of ['jt83', 'JT8–3', ' jt8 3 ', 'Arise, Treading Through Flames']) assert.equal(resolveStageAnswer(input, questions)?.slug, 'jt8-3');
  assert.equal(resolveStageAnswer('sui xiang', questions)?.slug, 'iw-9');
  assert.equal(resolveStageAnswer('not a stage', questions), null);
  assert.equal(resolveStageAnswer(' ', questions), null);
  const ambiguous = [{ slug: 'a', code: 'A-1', name: 'Shared' }, { slug: 'b', code: 'B-1', name: 'Shared' }];
  assert.equal(resolveStageAnswer('Shared', ambiguous), null);
  assert.equal(resolveStageAnswer('b1', ambiguous)?.slug, 'b');
  assert.equal(searchStageAnswers('17', questions)[0].slug, '1-7');
  assert.equal(searchStageAnswers('sui xiang', questions)[0].slug, 'iw-9');
  assert.deepEqual(searchStageAnswers(' ', questions), []);
});

test('wrong guesses progressively unlock hints; duplicates do not spend guesses or hints', () => {
  const initial = newStageRound();
  const first = guessStage(initial, '4-4', '1-7');
  assert.deepEqual(initial, newStageRound(), 'State updates are immutable');
  assert.equal(first.hints, 0, 'The first wrong guess leaves only the layout');
  assert.equal(first.wrong.length, 1);
  assert.equal(guessStage(first, '4-4', '1-7'), first);
  const second = guessStage(first, '4-10', '1-7');
  assert.equal(second.hints, 1, 'The in-game image unlocks at two wrong guesses');
  const third = guessStage(second, '5-10', '1-7');
  assert.equal(third.hints, 2, 'The chapter or event unlocks at three wrong guesses');
  const won = guessStage(second, '1-7', '1-7');
  assert.equal(won.status, 'won');
  assert.equal(won.wrong.length, 2);
  assert.equal(won.hints, 1);
  assert.equal(guessStage(won, '5-10', '1-7'), won);
  assert.equal(revealStageHint(won), won);
});

test('manual hints never spend guesses and subsequent wrong answers cannot hide them', () => {
  let round = newStageRound();
  for (let i = 0; i < STAGE_HINTS; i++) round = revealStageHint(round);
  assert.equal(round.hints, 2);
  assert.deepEqual(round.wrong, []);
  assert.equal(revealStageHint(round), round);
  assert.equal(guessStage(round, '4-10', '1-7').hints, 2);
});

test('five distinct mistakes end a round, including a supplies-only question', () => {
  const target = { slug: 'ce-5' }; // Supply answers remain valid outside Classics.
  const wrong = questions.filter((q) => q.slug !== target.slug).slice(0, STAGE_MISTAKES);
  let round = newStageRound();
  for (const q of wrong) round = guessStage(round, q.slug, target.slug);
  assert.equal(round.status, 'lost');
  assert.equal(round.wrong.length, 5);
  assert.equal(round.hints, 2);
  assert.equal(guessStage(round, target.slug, target.slug), round);
  const revealed = { ...newStageRound(), status: 'revealed' as const };
  assert.equal(guessStage(revealed, target.slug, target.slug), revealed);
  assert.equal(revealStageHint(revealed), revealed);
});

test('small collections cycle without immediate repeats and Stage Guesser joins game navigation', () => {
  const supplies = questions.slice(0, 3);
  const recent = supplies.map((q) => q.slug);
  for (let i = 0; i < 20; i++) assert.notEqual(pickNext(supplies, recent, (q) => q.slug)?.slug, recent.at(-1));
  assert.equal(GAME_PATHS.stage, '/games/stage-guesser');
  assert.equal(GAMES.filter((game) => game.href === GAME_PATHS.stage).length, 1);
  assert.ok(isGamePath(GAME_PATHS.stage));
});


test('the layout draws bottom-origin geometry without routes or identifying labels', () => {
  const layout = { rows: 2, cols: 1, tileLegend: [
    { key: 'tile_start', height: 'low', walkable: true, deployable: 'none', flyable: true },
    { key: 'tile_wall', height: 'high', walkable: false, deployable: 'ranged', flyable: true },
  ], tileGrid: [[0], [1]] };
  const html = renderToStaticMarkup(createElement(StageLayoutMap, { layout }));
  assert.ok(html.includes('viewBox="0 0 60 95"'));
  assert.ok(html.includes('y="49"'), 'Bottom-origin spawn belongs below the high ground');
  assert.ok(html.includes('y="11"'), 'High ground is raised on the top row');
  assert.ok(html.includes('aria-label="Stage layout to identify"'));
  for (const question of questions) {
    const rendered = renderToStaticMarkup(createElement(StageLayoutMap, { layout: question.layout }));
    assert.ok(!rendered.includes('<image') && !rendered.includes('<title'), question.code);
    assert.ok(!rendered.includes(question.name) && !rendered.includes('NaN'), question.code);
  }
});


test('event and chapter search lists every included stage and still requires a specific answer', () => {
  for (const input of ['under tides', 'undertides', 'UNDER TIDES']) {
    const results = searchStageAnswers(input, questions, 'connections');
    assert.equal(results.length, 6);
    assert.deepEqual(results.map((q) => q.code).sort(), ['SV-5', 'SV-6', 'SV-7', 'SV-8', 'SV-9', 'SV-EX-8'].sort());
    assert.equal(resolveStageAnswer(input, questions), null);
    assert.deepEqual(searchStageAnswers(input, questions, 'stages'), []);
  }
  for (const input of ['chapter 8', 'Chapter 08', 'episode 8', 'ep08', 'Roaring Flare']) {
    const results = searchStageAnswers(input, questions, 'connections');
    assert.ok(results.some((q) => q.code === 'JT8-3'));
    assert.ok(results.every((q) => q.chapter === 8));
  }
  assert.deepEqual(searchStageAnswers('chapter 80', questions, 'connections'), []);
  assert.equal(searchStageAnswers('jt83', questions, 'connections')[0].code, 'JT8-3');
  assert.ok(searchStageAnswers('lone trail', questions, 'connections').some((q) => q.code === 'CW-10'));
});

test('full catalogue covers usable released maps and custom unions without shipping layouts in the index', async () => {
  const { buildStageGuesserCatalogue } = await import('../../lib/minigames/stageGuesserData');
  const { filterStagePool } = await import('../../lib/minigames/stageGuesser');
  const { entries, answers, layouts, groups } = buildStageGuesserCatalogue(new Date('2026-09-10T12:00:00Z'));
  assert.ok(entries.length > 1500);
  assert.ok(answers.length > entries.length, 'Answers include stages that cannot be drawn as questions');
  assert.ok(entries.every((entry) => answers.some((answer) => answer.slug === entry.slug && answer.mapKey === entry.mapKey)));
  const outsideQuiz = answers.find((answer) => answer.code === 'DM-ST-1')!;
  assert.ok(outsideQuiz && !entries.some((entry) => entry.slug === outsideQuiz.slug));
  assert.equal(resolveStageAnswer('dmst1', answers)?.slug, outsideQuiz.slug);
  assert.ok(searchStageAnswers('darknights memoir', answers, 'connections').some((answer) => answer.slug === outsideQuiz.slug));
  const outsideClassic = resolveStageAnswer('s3-4', answers)!;
  assert.ok(outsideClassic && !filterStagePool(entries, 'classic', []).some((entry) => entry.slug === outsideClassic.slug));
  const wrong = guessStage(newStageRound(), outsideQuiz.slug, '1-7');
  assert.deepEqual(wrong.wrong, [outsideQuiz.slug]);
  assert.equal(guessStage(wrong, outsideQuiz.slug, '1-7'), wrong);

  assert.equal(filterStagePool(entries, 'all', []).length, entries.length);
  assert.equal(filterStagePool(entries, 'classic', []).length, curated.stages.length);
  assert.deepEqual(filterStagePool(entries, 'custom', []), []);
  assert.equal(new Set(entries.map((e) => `${e.code}:${e.mapKey}`)).size, entries.length, 'No duplicate rerun map/code questions');
  for (const e of entries) {
    const stage = JSON.parse(fs.readFileSync(path.join('data/stages', `${e.slug}.json`), 'utf8'));
    assert.ok(isStageGuesserVersion(stage));
    assert.ok(stage.content.release_date <= '2026-09-10');
    const layout = layouts.get(decodeURIComponent(e.layoutUrl.match(/layouts\/(.+)\.json$/)![1]));
    assert.ok(layout && !('routes' in layout));
    assert.ok(!('layout' in e));
  }
  const selected = groups.filter((g) => g.label.includes('Under Tides') || g.label.startsWith('EP 08'));
  assert.equal(selected.length, 2);
  const custom = filterStagePool(entries, 'custom', selected.map((g) => g.id));
  assert.equal(custom.length, selected.reduce((sum, g) => sum + g.count, 0));
  assert.ok(custom.some((e) => e.code === 'JT8-3') && custom.some((e) => e.code === 'SV-EX-8'));
  // The catalogue's size budgets are scripts/audits/check-payload-budgets.ts.
  assert.equal(buildStageGuesserCatalogue(new Date('2020-01-15T23:59:59Z')).entries.length, 0);
});


test('Classics follows the supplied list, including tutorials and standalone H stages', () => {
  assert.equal(questions.length, curated.stages.length);
  for (const code of ['1-7', '1-12', 'TR-15', '3-7', 'H10-1', 'H14-4', 'H16-4', 'OF-6', 'CB-EX2', 'WB-EX-6', 'HE-EX-8']) {
    assert.ok(questions.some((q) => q.code === code), code);
  }
  for (const code of ['OD-8', 'LS-5', 'Annihilation 3', 'S3-4']) assert.ok(!questions.some((q) => q.code === code));
  assert.equal(questions.filter((q) => q.code === 'JT8-3').length, 1);
  for (const code of ['SV-5', 'SV-6', 'SV-7']) assert.ok(questions.find((q) => q.code === code)?.source.includes('Under Tides'));
  for (let n = 1; n <= 4; n++) for (const suffix of ['A', 'B']) assert.ok(questions.some((q) => q.code === `SN-S-${n}-${suffix}`));
  assert.equal(questions.find((q) => q.code === 'H10-1')?.version, 'Adverse Environment');
  const challenge = JSON.parse(fs.readFileSync('data/stages/1-7_challenge_mode.json', 'utf8'));
  assert.equal(isStageGuesserVersion(challenge), false);
});
