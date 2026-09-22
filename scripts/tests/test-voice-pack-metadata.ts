import test from 'node:test';
import assert from 'node:assert/strict';
// @ts-expect-error Pure Node helper shared with the voice importer.
import { actorAliases, normalizeVoicePack } from '../lib/voice-pack-metadata.mjs';
const table = (type: string, name: string) => ({ voiceLangDict: { phantom: { dict: { [type]: { cvName: [name] } } } } });
test('native Japanese actor names link to the existing Global credit without changing English collaboration audio', () => {
  const aliases = actorAliases(table('JP', '石田彰'), [table('JP', 'Akira Ishida')]);
  const pack = { id: 'linkage', label: 'Collaboration', actors: ['石田彰'], status: 'current', audioTemplate: 'https://raw.githubusercontent.com/arkpedia/arkpedia-voice-japanese/main/current/makoto/{voiceId}.mp3' };
  assert.equal(normalizeVoicePack(pack, aliases).label, 'Japanese');
  assert.deepEqual(normalizeVoicePack(pack, aliases).actors, ['Akira Ishida']);
  const english = normalizeVoicePack({ ...pack, actors: ['English actor'], audioTemplate: pack.audioTemplate.replace('voice-japanese', 'voice-english') }, aliases);
  assert.equal(english.label, 'English');
  assert.deepEqual(english.actors, ['English actor']);
  assert.equal(english.id, 'linkage');
  const ambiguous = actorAliases(table('JP', '石田彰'), [table('JP', 'Akira Ishida'), table('JP', 'Different actor')]);
  assert.deepEqual(normalizeVoicePack(pack, ambiguous).actors, ['石田彰']);
});
