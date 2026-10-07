import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { getAllOperators } from '../../lib/operators/operators';
import { createElement, Fragment } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import voiceData from '../../data/operator-voice-lines.json';
import { renderGameText } from '../../components/ui/HighlightedText';
import { getCurrentOperatorVoiceCredits, type OperatorVoiceData, type OperatorVoiceSet } from '../../lib/operators/operatorVoices';
import { clipUrl } from '../../lib/operators/voiceRecording.mjs';

const operators = voiceData.operators as Record<string, OperatorVoiceData>;
const getSkinVoiceSets = (operator: OperatorVoiceData) => operator.skinVoices ?? [];
/** Every voice set on the site: each operator's own and each outfit's. */
const everySet = Object.entries(operators).flatMap(([id, operator]) => [
  [id, operator as OperatorVoiceSet] as const,
  ...getSkinVoiceSets(operator).map(set => [`${id} ${set.id}`, set as OperatorVoiceSet] as const),
]);

test('voice manifest covers the operator roster', () => {
  const ids = getAllOperators().filter(op => op.internalName).map(op => op.internalName!);
  assert.deepEqual(Object.keys(operators).sort(), [...new Set(ids)].sort());
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
  // Jacinta: a CN release ships Japanese and Mandarin, and Global adds its own packs later.
  const jacinta = operators.char_4237_jcinta;
  for (const id of ['jp', 'cn']) assert.ok(jacinta.packs.some(pack => pack.id === id), id);
  assert.ok(jacinta.packs.every(pack => pack.audioTemplate?.includes('arkpedia/arkpedia-voice-')));
  assert.ok(jacinta.packs.filter(pack => pack.status === 'current').every(pack => pack.audioTemplate?.endsWith('/{voiceIdLower}.mp3')));
});

test('the current Global operators include English transcripts and EN/KR recordings', () => {
  for (const operatorId of ['char_1051_headb2', 'char_4223_botany', 'char_4224_turdus']) {
    const operator = operators[operatorId];
    assert.equal(operator.textLocale, 'en', `${operatorId} still uses a fallback transcript`);
    assert.ok(operator.lines.every(line => line.status === 'unused' || line.text), `${operatorId} has a blank current transcript`);
    assert.ok(operator.packs.some(pack => pack.id === 'en'), `${operatorId} has no English recording pack`);
    assert.ok(operator.packs.some(pack => pack.id === 'kr'), `${operatorId} has no Korean recording pack`);
  }

  assert.deepEqual(
    Object.fromEntries(operators.char_4223_botany.packs
      .filter(pack => ['en', 'jp', 'cn', 'kr', 'rus'].includes(pack.id))
      .map(pack => [pack.id, pack.actors])),
    {
      en: ['Nana Sarkisyan'],
      jp: ['Aki Orita'],
      cn: ['Yixuan Hu'],
      kr: ['Kim Jin-ah'],
      rus: ['Nana Sarkisyan'],
    },
  );

  for (const operatorId of ['char_4123_ela', 'char_4124_iana', 'char_4125_rdoc', 'char_4126_fuze']) {
    const linkage = operators[operatorId].packs.find(pack => pack.id === 'linkage');
    assert.ok(linkage?.audioTemplate?.includes('arkpedia-voice-english'), `${operatorId} uses the wrong collaboration audio repository`);
  }
});

test('generated voice credits replace stale credits embedded in operator records', () => {
  assert.deepEqual(getCurrentOperatorVoiceCredits('char_4223_botany', { English: 'Old actor' }), {
    English: 'Nana Sarkisyan',
    Japanese: 'Aki Orita',
    Chinese: 'Yixuan Hu',
    Korean: 'Kim Jin-ah',
    Russian: 'Nana Sarkisyan',
  });
  assert.deepEqual(getCurrentOperatorVoiceCredits('missing', { English: 'Fallback actor' }), { English: 'Fallback actor' });
});

test('voice transcript markup is supported and rendered safely', () => {
  const unsupported = everySet.flatMap(([operatorId, operator]) => operator.lines.flatMap(line => {
    const tags = line.text?.match(/<\/?[a-z][^>]*>/gi) ?? [];
    return tags.filter(tag => !/^<\/?i>$/i.test(tag)).map(tag => `${operatorId}: ${tag}`);
  }));
  assert.deepEqual(unsupported, []);

  const html = renderToStaticMarkup(createElement(Fragment, null, ...renderGameText('<i>Aj-aj-aj,</i>')));
  assert.equal(html, '<em>Aj-aj-aj,</em>');
  assert.equal(
    renderToStaticMarkup(createElement(Fragment, null, ...renderGameText('<script>alert(1)</script>'))),
    '&lt;script&gt;alert(1)&lt;/script&gt;',
  );
});

test('Persona voice credits share Japanese actor identities with existing operators', () => {
  for (const id of ['char_4217_makoto', 'char_4218_aigis', 'char_4219_yukari', 'char_4220_kormr']) {
    assert.equal(operators[id].packs.find(pack => pack.id === 'linkage')?.label, 'Japanese');
  }
  const makoto = operators.char_4217_makoto.packs.find(pack => pack.id === 'linkage')!;
  assert.deepEqual(makoto.actors, ['Akira Ishida']);
  for (const id of ['char_250_phatom', 'char_1042_phatm2']) {
    assert.deepEqual(operators[id].packs.find(pack => pack.id === 'jp')!.actors, makoto.actors);
  }
});

test('CN-only voice headings are English while the original Chinese dialogue remains available', () => {
  // Every operator still on its Chinese transcript -- the Persona collaborators among
  // them -- until Global's English replaces it, which the refresh does on its own.
  const chinese = everySet.filter(([, operator]) => operator.textLocale === 'zh-CN');
  assert.deepEqual(operators.char_4217_makoto.lines.slice(0, 4).map(line => line.title), ['Appointed as Assistant', 'Talk 1', 'Talk 2', 'Talk 3']);
  for (const [id, operator] of chinese) {
    const lines = operator.lines.filter(line => line.status !== 'unused');
    assert.ok(lines.length > 0 && lines.every(line => line.title && !/\p{Script=Han}/u.test(line.title)), `${id} has a Chinese heading`);
    assert.match(lines[0].text ?? '', /\p{Script=Han}/u, id);
  }
});

/* Outfits with a voice of their own (skin_table voiceId), which the menu offers after the
   operator's own packs. Each is a set of lines filed under the operator, read from the
   folder named after the set's word key. */
test('outfit voice sets carry their own lines and recordings', () => {
  const sets = Object.fromEntries(Object.entries(operators).flatMap(([id, operator]) => getSkinVoiceSets(operator).map(set => [set.id, { ...set, operator: id }])));
  // Red Countess: her own text, all 38 lines, in all four languages.
  const countess = sets['char_1012_skadi2_iteration#2'];
  assert.equal(countess.operator, 'char_1012_skadi2');
  assert.equal(countess.label, 'Red Countess');
  assert.deepEqual(countess.skinIds, ['char_1012_skadi2@iteration#2']);
  assert.equal(countess.textLocale, 'en');
  assert.equal(countess.lines.length, 38);
  assert.deepEqual(countess.packs.map(pack => pack.id), ['en', 'jp', 'cn', 'kr']);
  const base = operators.char_1012_skadi2.lines;
  assert.ok(countess.lines.filter(line => base.find(row => row.id === line.id)?.text !== line.text).length > 30, 'the outfit has its own text');
  assert.equal(clipUrl(countess.packs[0].audioTemplate, 'CN_001'), 'https://raw.githubusercontent.com/arkpedia/arkpedia-voice-english/main/current/char_1012_skadi2_iteration%232/cn_001.mp3');

  // One set shared by the Elite 2 art and three outfits names every one of them.
  const mudrock = getSkinVoiceSets(operators.char_311_mudrok);
  assert.deepEqual(mudrock.map(set => set.id), ['char_311_mudrok#1']);
  assert.equal(mudrock[0].label, 'Elite 2, Silent Night DN06, Rubble, Obsidian');
  assert.deepEqual([...mudrock[0].skinIds].sort(), ['char_311_mudrok#2', 'char_311_mudrok@ambienceSynesthesia#2', 'char_311_mudrok@summer#6', 'char_311_mudrok@wild#10']);
  // The Elite 2 art's set: its table lists the 27 home-screen lines, and its folders hold all
  // 38 clips. The other 11 (in battle, tap) are recorded again, never played: Unused rows,
  // each a recording distinct from the operator's own, offered where a folder holds it.
  const xiaohei = getSkinVoiceSets(operators.char_4067_lolxh);
  assert.equal(xiaohei[0].label, 'Elite 2');
  assert.equal(xiaohei[0].lines.filter(line => line.status === 'current').length, 27);
  assert.ok(!xiaohei[0].lines.some(line => /^CN_02[0-8]$/.test(line.id) && line.status === 'current'));
  const unused = xiaohei[0].lines.filter(line => line.status === 'unused');
  assert.deepEqual(unused.map(line => line.id), ['CN_020', 'CN_021', 'CN_022', 'CN_023', 'CN_024', 'CN_025', 'CN_026', 'CN_027', 'CN_028', 'CN_034', 'CN_036']);
  for (const line of unused) {
    assert.deepEqual([line.category, line.text, line.availablePacks], ['unused', null, ['cn', 'jp']], line.id);
    // Titled as the operator's own line of that id, so the two lists agree.
    assert.equal(line.title, operators.char_4067_lolxh.lines.find(row => row.id === line.id)?.title, line.id);
  }
  // The retired Shalem's outfit plays the current Shalem's own lines: not an outfit set.
  assert.deepEqual(getSkinVoiceSets(operators.char_4025_aprot2), []);
  assert.equal(operators.char_512_aprot, undefined);
});

test('every outfit voice set is complete, distinct and points at its own folders', () => {
  let count = 0;
  for (const [id, operator] of Object.entries(operators)) {
    const seen = new Set<string>();
    for (const set of getSkinVoiceSets(operator)) {
      count++;
      assert.notEqual(set.id, id, `${id}: an outfit set is the operator's own`);
      assert.ok(!seen.has(set.id), `${id}: ${set.id} twice`);
      seen.add(set.id);
      assert.ok(set.label && set.skinIds.length, `${id} ${set.id} names no outfit`);
      assert.ok(set.lines.length > 0 && set.packs.length > 0, `${id} ${set.id} is empty`);
      assert.equal(new Set(set.lines.map(line => line.id)).size, set.lines.length, `${id} ${set.id} has duplicate line IDs`);
      for (const pack of set.packs) {
        assert.equal(pack.status, 'current', `${id} ${set.id} ${pack.id}`);
        // The '#' in a set's word key is encoded, or the browser would cut the address there.
        assert.ok(pack.audioTemplate?.includes(`/current/${encodeURIComponent(set.id)}/`), `${id} ${set.id} ${pack.id}: ${pack.audioTemplate}`);
        assert.ok(!pack.audioTemplate?.includes('#'), `${id} ${set.id} ${pack.id}: raw # in ${pack.audioTemplate}`);
      }
      for (const line of set.lines) {
        if (line.status === 'unused') {
          // A recording in the set's folders that its table has no line for: never given text,
          // and only a voice line's clip (Red Countess's fx_023.mp3 skill sounds are none).
          assert.match(line.id, /^CN_\d/, `${id} ${set.id} ${line.id}`);
          assert.ok(line.text === null && line.category === 'unused' && line.availablePacks?.length, `${id} ${set.id} ${line.id}`);
        } else {
          assert.ok(line.status === 'current' && line.text, `${id} ${set.id} ${line.id} has no transcript`);
        }
      }
    }
  }
  assert.ok(count >= 16, `only ${count} outfit voice sets`);
});

/* The builder end to end on tiny tables: which skins become a set, how a shared set is
   named, which text and folders a set reads, and a set folder short a clip. */
test('the voice builder groups outfits by voice set and offers only recorded clips', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'arkpedia-outfit-voices-'));
  try {
    const write = (file: string, value: unknown) => { fs.writeFileSync(path.join(root, file), JSON.stringify(value)); return path.join(root, file); };
    const word = (wordKey: string, charId: string, voiceId: string, voiceText: string) => [`${wordKey}_${voiceId}`, { wordKey, charId, voiceId, voiceText, voiceTitle: `Line ${voiceId}`, voiceIndex: Number(voiceId.slice(3)), lockDescription: null }];
    const lang = (wordKey: string, charId: string, types: string[]) => [wordKey, { charId, dict: Object.fromEntries(types.map(type => [type, { cvName: [`${type} actor`], voicePath: null }])) }];
    const table = (words: [string, object][], langs: [string, object][]) => ({ charWords: Object.fromEntries(words), voiceLangDict: Object.fromEntries(langs) });
    const en = write('en.json', table([
      word('char_311_mudrok', 'char_311_mudrok', 'CN_001', 'Masked.'), word('char_311_mudrok', 'char_311_mudrok', 'CN_002', 'Masked two.'),
      word('char_311_mudrok#1', 'char_311_mudrok', 'CN_001', 'Unmasked.'), word('char_311_mudrok#1', 'char_311_mudrok', 'CN_002', 'Unmasked two.'),
      word('char_4025_aprot2', 'char_4025_aprot2', 'CN_001', 'Shalem.'),
    ] as [string, object][], [
      lang('char_311_mudrok', 'char_311_mudrok', ['EN', 'JP']), lang('char_311_mudrok#1', 'char_311_mudrok', ['EN', 'JP']), lang('char_4025_aprot2', 'char_4025_aprot2', ['JP']),
    ] as [string, object][]));
    // A set only CN has yet: its Chinese text, the base set's fallback.
    const cn = write('cn.json', table([
      word('char_1012_skadi2', 'char_1012_skadi2', 'CN_001', '深海。'), word('char_1012_skadi2_iteration#2', 'char_1012_skadi2', 'CN_001', '红女爵。'),
    ] as [string, object][], [lang('char_1012_skadi2', 'char_1012_skadi2', ['JP']), lang('char_1012_skadi2_iteration#2', 'char_1012_skadi2', ['JP'])] as [string, object][]));
    const skin = (charId: string, voiceId: string | null, skinName: string | null) => ({ charId, voiceId, voiceType: voiceId ? 'ALL' : 'NONE', displaySkin: { skinName } });
    const enSkins = write('en-skins.json', { charSkins: {
      'char_311_mudrok#2': skin('char_311_mudrok', 'char_311_mudrok#1', null),
      'char_311_mudrok@summer#6': skin('char_311_mudrok', 'char_311_mudrok#1', 'Silent Night DN06'),
      'char_311_mudrok@wild#10': skin('char_311_mudrok', 'char_311_mudrok#1', 'Rubble'),
      'char_512_aprot#1': skin('char_512_aprot', 'char_4025_aprot2', null),
      'char_4025_aprot2#1': skin('char_4025_aprot2', null, null),
    } });
    const cnSkins = write('cn-skins.json', { charSkins: { 'char_1012_skadi2@iteration#2': skin('char_1012_skadi2', 'char_1012_skadi2_iteration#2', '红女爵') } });
    const empty = write('empty.json', {});
    const assets = write('assets.json', { voice: ['char_311_mudrok', 'char_311_mudrok#1', 'char_4025_aprot2', 'char_1012_skadi2', 'char_1012_skadi2_iteration#2'], voice_cn: [], voice_custom: [], voice_en: ['char_311_mudrok', 'char_311_mudrok#1'], voice_kr: [] });
    // The outfit's Japanese folder lacks CN_002: that line is not offered in Japanese. Both
    // folders hold a CN_020 the set's table has no line for (an Unused row), and a skill
    // sound, which is no line.
    const listings = write('listings.json', {
      'arkpedia-voice-japanese/current/char_311_mudrok#1': ['cn_001.mp3', 'cn_020.mp3', 'fx_023.mp3'],
      'arkpedia-voice-english/current/char_311_mudrok#1': ['cn_001.mp3', 'cn_002.mp3', 'cn_020.mp3', 'fx_023.mp3'],
    });
    fs.mkdirSync(path.join(root, 'tlvr'));
    const output = path.join(root, 'voices.json');
    const run = spawnSync(process.execPath, ['scripts/build/build-operator-voices.mjs'], { encoding: 'utf8', env: { ...process.env,
      ARKPEDIA_EN_CHARWORDS: en, ARKPEDIA_EN_SUPPLEMENTAL_CHARWORDS: empty, ARKPEDIA_CN_CHARWORDS: cn, ARKPEDIA_EN_SKINS: enSkins, ARKPEDIA_CN_SKINS: cnSkins,
      ARKPEDIA_VOICE_INDEX: empty, ARKPEDIA_TLVR_DIR: path.join(root, 'tlvr'), ARKPEDIA_VOICE_ASSET_INDEX: assets,
      ARKPEDIA_VOICE_LEGACY_INDEX: listings, ARKPEDIA_VOICE_OUTPUT: output } });
    assert.equal(run.status, 0, run.stderr);
    const built = JSON.parse(fs.readFileSync(output, 'utf8')).operators;

    // The operator's own voice is untouched, and the outfits' set is one set naming all three.
    assert.deepEqual(built.char_311_mudrok.lines.map((line: { text: string }) => line.text), ['Masked.', 'Masked two.']);
    const [mudrock, ...others] = built.char_311_mudrok.skinVoices;
    assert.deepEqual(others, []);
    assert.equal(mudrock.id, 'char_311_mudrok#1');
    assert.equal(mudrock.label, 'Elite 2, Silent Night DN06, Rubble');
    assert.deepEqual(mudrock.skinIds, ['char_311_mudrok#2', 'char_311_mudrok@summer#6', 'char_311_mudrok@wild#10']);
    assert.equal(mudrock.textLocale, 'en');
    assert.deepEqual(mudrock.lines.map((line: { text: string }) => line.text), ['Unmasked.', 'Unmasked two.', null]);
    assert.deepEqual(mudrock.lines[2], { id: 'CN_020', title: 'Unused recording CN_020', text: null, category: 'unused', status: 'unused', unlock: null, order: 2000, availablePacks: ['en', 'jp'] });
    assert.deepEqual(mudrock.packs.map((pack: { id: string; audioTemplate: string }) => [pack.id, pack.audioTemplate]), [
      ['en', 'https://raw.githubusercontent.com/arkpedia/arkpedia-voice-english/main/current/char_311_mudrok%231/{voiceIdLower}.mp3'],
      ['jp', 'https://raw.githubusercontent.com/arkpedia/arkpedia-voice-japanese/main/current/char_311_mudrok%231/{voiceIdLower}.mp3'],
    ]);
    assert.equal(mudrock.lines[0].availablePacks, undefined);
    assert.deepEqual(mudrock.lines[1].availablePacks, ['en']);

    // CN's outfit, named by the site (data/skins.json), in Chinese until Global has it.
    const [countess] = built.char_1012_skadi2.skinVoices;
    assert.equal(countess.label, 'Red Countess');
    assert.equal(countess.textLocale, 'zh-CN');
    assert.equal(countess.lines[0].text, '红女爵。');
    // A skin of another record borrowing this operator's own lines adds nothing.
    assert.equal(built.char_4025_aprot2.skinVoices, undefined);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
