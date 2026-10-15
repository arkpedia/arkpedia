import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { hasRecording, preferredRecordingPack } from '../../lib/operators/voiceRecording.mjs';
// @ts-expect-error Shared Node importer helper.
import { mergeVoicePacks } from '../lib/voice-pack-metadata.mjs';

// ArknightsAssets/ArknightsGamedata 3aaa25b649fed5dedad9527602826dc487ea07d8,
// en/gamedata/excel/charword_table.json. No inferred names or translations.
const credits = {
  char_4228_closur: { EN: ['Carla Tassara'], KR: ['Min Ah'] },
  char_4225_tanya: { EN: ['Anna Moleva'], KR: ['Lee Ja-young'] },
  char_4226_veen: { EN: ['Egor Zhirnov'], KR: ['Choi Hyun-sik'] },
  char_1052_kalts2: { EN: ['Sura Siu'], KR: ['Han Chae-eon'] },
  char_4227_gallus: { EN: ['Amber Hood'], KR: ['Yang Eun-han'] },
};

test('new operator credits survive absent audio, partial sources, renamed enums and subsequent refreshes', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'arkpedia-voice-credit-refresh-'));
  try {
    const write = (file: string, value: unknown) => { const at = path.join(root, file); fs.writeFileSync(at, JSON.stringify(value)); return at; };
    const words = Object.fromEntries(Object.keys(credits).map(charId => [`${charId}_CN_001`, { charId, wordKey: charId, voiceId: 'CN_001', voiceTitle: 'Assigned as Assistant', voiceText: 'Fixture transcript', voiceIndex: 1 }]));
    const lang = (dict: Record<string, string[]>) => ({ dict: Object.fromEntries(Object.entries(dict).map(([type, cvName]) => [type, { cvName }])) });
    const enTable = { charWords: words, voiceLangDict: Object.fromEntries(Object.entries(credits).map(([id, dict]) => [id, lang(dict)])) };
    enTable.voiceLangDict.char_4228_closur.dict.KR.cvName = [];
    const en = write('en.json', enTable);
    const supplement = write('supplement.json', { voiceLangDict: { char_4228_closur: lang({ KR: ['Min Ah'] }) } });
    const cnTable = { voiceLangDict: { char_4228_closur: lang({ JP: ['沼仓爱美'], CN_MANDARIN: ['侯小菲'], CN_TOPOLECT: ['Regional actor'], 11: ['Spanish actor'] }) } };
    const cn = write('cn.json', cnTable);
    const empty = write('empty.json', {});
    const assets = write('assets.json', { voice: [], voice_cn: [], voice_en: [], voice_kr: [], voice_custom: [] });
    fs.mkdirSync(path.join(root, 'tlvr'));
    const output = path.join(root, 'output.json');
    const run = () => {
      const result = spawnSync(process.execPath, ['scripts/build/build-operator-voices.mjs'], { encoding: 'utf8', env: { ...process.env,
        ARKPEDIA_EN_CHARWORDS: en, ARKPEDIA_EN_SUPPLEMENTAL_CHARWORDS: supplement, ARKPEDIA_CN_CHARWORDS: cn,
        ARKPEDIA_EN_SKINS: empty, ARKPEDIA_CN_SKINS: empty, ARKPEDIA_VOICE_INDEX: empty,
        ARKPEDIA_TLVR_DIR: path.join(root, 'tlvr'), ARKPEDIA_VOICE_ASSET_INDEX: assets,
        ARKPEDIA_VOICE_LEGACY_INDEX: empty, ARKPEDIA_VOICE_OUTPUT: output } });
      assert.equal(result.status, 0, result.stderr);
      return JSON.parse(fs.readFileSync(output, 'utf8')).operators;
    };
    const first = run();
    for (const [id, dict] of Object.entries(credits)) for (const [type, names] of Object.entries(dict)) {
      const pack = first[id].packs.find((pack: { id: string }) => pack.id === type.toLowerCase());
      assert.deepEqual(pack.actors, type === 'KR' && id === 'char_4228_closur' ? ['Min Ah'] : names);
      assert.equal(pack.audioTemplate, null, 'a credit must not invent a playable URL');
    }
    const own = first.char_4228_closur.packs;
    assert.deepEqual(own.find((p: { id: string }) => p.id === 'jp').actors, ['沼仓爱美'], 'no guessed romanization');
    assert.equal(own.find((p: { id: string }) => p.id === 'spa').label, 'Spanish');
    assert.ok(own.some((p: { id: string }) => p.id === 'cn_topolect'));
    assert.deepEqual(run(), first, 'identical input is idempotent');
    const renamed = structuredClone(cnTable) as any;
    renamed.voiceLangDict.char_4228_closur.dict.SPA = renamed.voiceLangDict.char_4228_closur.dict[11];
    delete renamed.voiceLangDict.char_4228_closur.dict[11];
    write('cn.json', renamed);
    assert.deepEqual(run(), first);
    renamed.voiceLangDict.char_4228_closur.dict[11] = { ...renamed.voiceLangDict.char_4228_closur.dict.SPA, voiceLangType: 'SPA' };
    delete renamed.voiceLangDict.char_4228_closur.dict.SPA;
    write('cn.json', renamed);
    assert.deepEqual(run(), first);
    enTable.voiceLangDict.char_4228_closur.dict.EN.cvName = ['Fixture replacement actor'];
    write('en.json', enTable);
    write('assets.json', { voice_en: ['char_4228_closur'], voice_custom: ['char_4228_closur'] });
    const next = run().char_4228_closur.packs;
    assert.deepEqual(next.find((p: { id: string }) => p.id === 'en').actors, ['Fixture replacement actor']);
    assert.match(next.find((p: { id: string }) => p.id === 'en').audioTemplate, /voice-english/);
    assert.match(next.find((p: { id: string }) => p.id === 'spa').audioTemplate, /voice-regional/);
    assert.deepEqual(next.find((p: { id: string }) => p.id === 'kr').actors, ['Min Ah']);
    assert.equal(next.find((p: { id: string }) => p.id === 'kr').audioTemplate, null);
    assert.deepEqual(run().char_4228_closur.packs, next);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('audio fallback preserves preferred actor spelling and keeps recording languages separate', () => {
  const pack = (id: string, actors: string[], audioTemplate: string | null) => ({ id, actors, audioTemplate, label: id, status: 'current' });
  assert.deepEqual(mergeVoicePacks([pack('jp', ['Verified spelling'], null)], [pack('jp', ['Native spelling'], 'recorded'), pack('en', ['Separate actor'], null)]),
    [pack('jp', ['Verified spelling'], 'recorded'), pack('en', ['Separate actor'], null)]);
});

test('a newly credited language without audio does not displace a playable default or offer playback', () => {
  const en = { id: 'en', status: 'current' as const, audioTemplate: null };
  const jp = { id: 'jp', status: 'current' as const, audioTemplate: 'recorded' };
  assert.equal(preferredRecordingPack([en, jp]), jp);
  assert.equal(hasRecording({ id: 'CN_001' }, en), false);
  assert.equal(hasRecording({ id: 'CN_001' }, jp), true);
  assert.equal(preferredRecordingPack([en]), en);
  const available = { ...en, audioTemplate: 'recorded' };
  assert.equal(preferredRecordingPack([available, jp]), available);
});
