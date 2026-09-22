import test from 'node:test';
import assert from 'node:assert/strict';
// @ts-expect-error Pure Node helper shared with the voice importer.
import { englishVoiceTitles, englishVoiceTitle } from '../lib/voice-line-titles.mjs';

test('CN dialogue uses shared Global headings without replacing special or existing English titles', () => {
  const titles = englishVoiceTitles([{ charWords: {
    assistant: { voiceId: 'CN_001', voiceTitle: 'Appointed as Assistant' },
    talk: { voiceId: 'CN_002', voiceTitle: 'Talk 1' },
    combat: { voiceId: 'CN_025', voiceTitle: 'In Battle 1' },
    combat2: { voiceId: 'CN_025', voiceTitle: 'In Battle 1' },
    special: { voiceId: 'CN_025', voiceTitle: 'During Combat' },
    ambiguous: { voiceId: 'SPECIAL', voiceTitle: 'First variant' },
    ambiguous2: { voiceId: 'SPECIAL', voiceTitle: 'Second variant' },
  } }]);
  assert.equal(englishVoiceTitle('CN_001', '任命助理', titles), 'Appointed as Assistant');
  assert.equal(englishVoiceTitle('CN_002', '交谈1', titles), 'Talk 1');
  assert.equal(englishVoiceTitle('CN_025', '作战中1', titles), 'In Battle 1');
  assert.equal(englishVoiceTitle('CN_025', 'During Combat', titles), 'During Combat');
  assert.equal(englishVoiceTitle('CN_999', '特殊语音', titles), '特殊语音');
  assert.equal(englishVoiceTitle('SPECIAL', '特殊语音', titles), '特殊语音');
});
