import test from 'node:test';
import assert from 'node:assert/strict';
import { artworkVoicePack, artworkVoicePacks } from '../../lib/skins/artworkVoices';
import { getOperatorVoiceData, type OperatorVoiceData } from '../../lib/operators/operatorVoices';

test('all four published special illustrations have every dialogue action in all current languages', () => {
  for (const [operator, skin, folder] of [
    ['char_003_kalts', 'char_003_kalts@sale#14', 'char_003_kalts'],
    ['char_1001_amiya2', 'char_1001_amiya2@sale#16', 'char_1001_amiya2'],
    ['char_1041_angel2', 'char_1041_angel2@iteration#6', 'char_1041_angel2_iteration%236'],
    ['char_124_kroos', 'char_124_kroos@sale#14', 'char_124_kroos'],
  ]) {
    const packs = artworkVoicePacks(getOperatorVoiceData(operator), skin);
    assert.deepEqual(packs.map(pack => pack.id), ['en', 'jp', 'cn', 'kr'], skin);
    for (const pack of packs) {
      // All four controllers author Talk 1–3, promotion 1–2 and trust 1–3.
      for (let line = 2; line <= 9; line++) {
        const id = `CN_${String(line).padStart(3, '0')}`;
        assert.ok(pack.voices.some(voice => voice.id === id), `${skin}: ${pack.id} ${id}`);
      }
      assert.ok(pack.voices.every(voice => voice.url.includes(`/current/${folder}/`)));
    }
  }
});

test('voice languages respect missing clips and never substitute base recordings for a skin voice set', () => {
  const line = { id: 'CN_002', title: 'Talk 1', text: null, category: 'profile', status: 'current', unlock: null, order: 0 } as const;
  const pack = (id: string, status: 'current' | 'legacy' = 'current') => ({ id, label: id, actors: [], status, audioTemplate: `https://example.com/${id}/{voiceIdLower}.mp3` });
  const data: OperatorVoiceData = { textLocale: 'en', lines: [line], packs: [pack('en')], skinVoices: [{
    id: 'outfit', label: 'Outfit', skinIds: ['outfit'], textLocale: 'en',
    lines: [{ ...line, availablePacks: ['jp', 'custom'] }],
    packs: [pack('en'), pack('jp'), pack('it'), pack('old_jp', 'legacy'), { ...pack('cn'), audioTemplate: null }],
  }] };
  const packs = artworkVoicePacks(data, 'outfit');
  assert.deepEqual(packs.map(p => p.id), ['jp', 'it']);
  assert.equal(packs[0].voices[0].url, 'https://example.com/jp/cn_002.mp3');
  assert.equal(artworkVoicePack(packs, 'it')?.id, 'it');
  assert.equal(artworkVoicePack(packs, 'en')?.id, 'jp');
  assert.deepEqual(artworkVoicePacks(data, 'other').map(p => p.id), ['en']);
  assert.deepEqual(artworkVoicePacks(null, 'outfit'), []);
  assert.equal(artworkVoicePack([], 'cn'), undefined);
});
