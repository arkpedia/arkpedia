import assert from 'node:assert/strict';
import test from 'node:test';
import { chibiTapVoices } from '../../lib/operators/chibiVoice';
import type { OperatorVoiceData } from '../../lib/operators/operatorVoices';
const voice = (): OperatorVoiceData => ({ textLocale: 'en', packs: [{ id: 'en', label: 'English', actors: ['Fixture actor'], status: 'current', audioTemplate: '/voices/base/{voiceId}.wav' }], lines: ['CN_034', 'CN_036'].map((id, order) => ({ id, title: order ? 'Trust Tap' : 'Tap', text: null, category: 'profile', status: 'current', unlock: null, order })) });
test('normal and trust taps select distinct current recordings', () => { const v = chibiTapVoices(voice(), 'Base'); assert.equal(v.tap?.url, '/voices/base/CN_034.wav'); assert.equal(v.trust?.url, '/voices/base/CN_036.wav'); });
test('outfit and shared outfit labels select their own voice set, not the base recording', () => { const d = voice(); d.skinVoices = [{ ...voice(), id: 'skin', label: 'Elite 2, First outfit, Second outfit', skinIds: ['char_fixture#2'], packs: [{ ...d.packs[0], audioTemplate: '/voices/outfit/{voiceId}.wav' }] }]; for (const name of ['Elite 2', 'First outfit', 'Second outfit']) assert.equal(chibiTapVoices(d, name).trust?.url, '/voices/outfit/CN_036.wav'); assert.equal(chibiTapVoices(d, 'Base').trust?.url, '/voices/base/CN_036.wav'); });
test('missing or unavailable recordings stay silent and legacy recordings are not selected', () => { const d = voice(); d.lines[0].availablePacks = ['jp']; assert.equal(chibiTapVoices(d, 'Base').tap, undefined); d.packs[0].status = 'legacy'; assert.deepEqual(chibiTapVoices(d, 'Base'), { tap: undefined, trust: undefined }); assert.deepEqual(chibiTapVoices(null, 'Base'), {}); });
test('language choices contain only current recorded tap packs', () => {
  const data = voice();
  data.packs.push({ ...data.packs[0], id: 'jp', label: 'Japanese', audioTemplate: '/voices/jp/{voiceId}.wav' },
    { ...data.packs[0], id: 'kr', label: 'Korean', audioTemplate: null });
  const languages = chibiTapVoices(data, 'Base').languages!;
  assert.deepEqual(languages.map(pack => pack.id), ['en', 'jp']);
  assert.equal(languages[1].tap?.url, '/voices/jp/CN_034.wav');
});
