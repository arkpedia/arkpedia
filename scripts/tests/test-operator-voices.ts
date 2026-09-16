import assert from 'node:assert/strict';
import test from 'node:test';
import voiceData from '../../data/operator-voice-lines.json';
import type { OperatorVoiceData } from '../../lib/operators/operatorVoices';

const operators = voiceData.operators as Record<string, OperatorVoiceData>;

test('voice manifest covers the operator roster', () => {
  assert.equal(Object.keys(operators).length, 427);
  for (const [id, operator] of Object.entries(operators)) {
    assert.ok(operator.lines.length > 0, `${id} has no transcript rows`);
    assert.equal(new Set(operator.lines.map(line => line.id)).size, operator.lines.length, `${id} has duplicate line IDs`);
  }
});

test('regional and replaced actors remain separate recording packs', () => {
  assert.ok(operators.char_1039_thorn2.packs.some(pack => pack.id === 'spa' && pack.status === 'current'));
  assert.ok(operators.char_4065_judge.packs.some(pack => pack.id === 'ita' && pack.status === 'current'));
  assert.deepEqual(
    operators.char_204_platnm.packs.find(pack => pack.id === 'old_jp'),
    {
      id: 'old_jp',
      label: 'Legacy JP',
      actors: ['Ai Kayano'],
      status: 'legacy',
      audioTemplate: 'https://raw.githubusercontent.com/arkpedia/arkpedia-voice-japanese/main/legacy/9d94a6083acd5882c35047c33f06aeac978407c5/char_204_platnm/{voiceId}.mp3',
    },
  );
});

test('unused promotion recordings are explicit and never given invented text', () => {
  const unused = operators.char_208_melan.lines.filter(line => line.status === 'unused');
  assert.deepEqual(unused.map(line => line.id), ['CN_006', 'CN_014']);
  assert.ok(unused.every(line => line.text === null && line.category === 'unused'));
});

test('Amiya alternate forms use their own audio path and keep impossible promotions unused', () => {
  const guard = operators.char_1001_amiya2;
  assert.deepEqual(
    guard.lines.find(line => line.id === 'CN_014'),
    {
      id: 'CN_014',
      title: 'Elite Promotion 2',
      text: null,
      category: 'unused',
      status: 'unused',
      unlock: null,
      order: 2001,
      availablePacks: ['cn', 'en'],
    },
  );
  assert.ok(guard.packs.every(pack => pack.audioTemplate?.includes('char_1001_amiya2') ?? true));
});

test('the newest CN operators use recordings from the current asset inventory', () => {
  const jacinta = operators.char_4237_jcinta;
  assert.deepEqual(jacinta.packs.map(pack => pack.id), ['jp', 'cn']);
  assert.ok(jacinta.packs.every(pack => pack.audioTemplate?.includes('arkpedia/arkpedia-voice-')));
  assert.ok(jacinta.packs.every(pack => pack.audioTemplate?.endsWith('/{voiceIdLower}.mp3')));
});
