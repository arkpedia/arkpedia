import assert from 'node:assert/strict';
import { test } from 'node:test';
import { accountFromGame, ownedFilter, parseAccount } from '../../lib/account/accountStore';
import { portraitPath } from '../../lib/account/portraits';

const MAP = { version: 1 as const, chars: {
  char_300_phenxi: { name: 'Fiammetta', rarity: 6, modules: {} },
  char_002_amiya: { name: 'Amiya', modules: {} },
  char_1001_amiya2: { name: 'Amiya (Guard)', modules: {} },
} };

test('an account gives the operators it owns by name, its outfits by skin id and the stages it cleared', () => {
  const record = accountFromGame({
    status: { nickName: 'Doctor', nickNumber: '1234', level: 120, registerTs: 1580712160, secretary: 'char_002_amiya', resume: ' yes ', uid: 11311084, avatar: { type: 'ICON', id: 'avatar_special_41' } },
    nameCardStyle: { skin: { selected: 'nc_moon_1' } },
    social: { assistCharList: [{ charInstId: 1, skillIndex: 2 }, null, { charInstId: 99 }, { charInstId: 2 }], medalBoard: { type: 'CUSTOM', custom: '1' } },
    medal: { custom: { customs: { 1: { layout: [{ id: 'medal_a', pos: [6, 12] }, { id: 'medal_b', pos: [9, 9] }] } } } },
    troop: { chars: {
      1: { charId: 'char_300_phenxi', level: 60, evolvePhase: 2, potentialRank: 5, skin: 'char_300_phenxi@summer#1' },
      2: { charId: 'char_002_amiya', currentTmpl: 'char_1001_amiya2', tmpl: { char_002_amiya: { skinId: 'char_002_amiya#1+' }, char_1001_amiya2: { skinId: 'char_1001_amiya2#2' } } },
      3: { charId: 'char_9999_brandnew', skin: 'char_9999_brandnew#1' },
      4: { charId: 'char_300_phenxi', skin: '../../etc' },
    } },
    skin: { characterSkins: { 'char_300_phenxi@summer#1': 1, 'char_002_amiya@winter#1': 1 } },
    // The game's stage states: 0 opened, 1 played, 2 cleared, 3 cleared with every star.
    dungeon: { stages: { main_00: { state: 0 }, main_01: { state: 1 }, main_02: { state: 2 }, main_03: { state: 3 } } },
  }, MAP, new Date('2026-10-01T12:00:00Z'));
  assert.deepEqual(record, {
    version: 1, server: 'en', importedAt: '2026-10-01T12:00:00.000Z', doctor: 'Doctor#1234',
    // Amiya's forms each by their own name; one with no record yet is left out.
    operators: ['Amiya', 'Amiya (Guard)', 'Fiammetta'],
    skins: ['char_002_amiya@winter#1', 'char_300_phenxi@summer#1'],
    cleared: ['main_02', 'main_03'],
    // The outfit each wears, Amiya's forms each their own; anything not a skin id is left out.
    outfits: { Amiya: 'char_002_amiya#1+', 'Amiya (Guard)': 'char_1001_amiya2#2', Fiammetta: 'char_300_phenxi@summer#1' },
    profile: { level: 120, registeredAt: '2020-02-03T06:42:40.000Z', secretary: 'Amiya', bio: 'yes', uid: '11311084', avatar: 'avatar_special_41', nameCard: 'nc_moon_1', hired: 4,
      // The support units by the troop's own records; a slot with no operator behind it is left out.
      supports: [{ name: 'Fiammetta', rarity: 6, level: 60, elite: 2, potential: 6, skill: 3, skin: 'char_300_phenxi@summer#1' },
        // Amiya lends the form she is in, in that form's outfit.
        { name: 'Amiya (Guard)', rarity: null, level: 1, elite: 0, potential: 1, skill: null, skin: 'char_1001_amiya2#2' }],
      medals: [{ id: 'medal_a', x: 6, y: 12 }, { id: 'medal_b', x: 9, y: 9 }] },
  });
  assert.deepEqual(parseAccount(JSON.stringify(record)), record);
});

test("an outfit's portrait is named as arkpedia-image-assets publishes it (sync_profile_art.py's portrait_name)", () => {
  assert.equal(portraitPath('char_1013_chen2@boc#6'), '/profile-portraits/char_1013_chen2_boc_6.webp');
  assert.equal(portraitPath('char_1013_chen2#2'), '/profile-portraits/char_1013_chen2_2.webp');
  assert.equal(portraitPath('char_002_amiya#1+'), '/profile-portraits/char_002_amiya_1p.webp');
});

test('a stored record is read back only when it is a whole one', () => {
  const good = { version: 1, server: 'en', importedAt: '2026-10-01T12:00:00.000Z', doctor: null, operators: [], skins: [], cleared: [] };
  assert.deepEqual(parseAccount(JSON.stringify(good)), good);
  for (const broken of [null, '', '{', '[]', JSON.stringify({ ...good, version: 2 }), JSON.stringify({ ...good, operators: 'Amiya' }), JSON.stringify({ ...good, skins: [1] })]) {
    assert.equal(parseAccount(broken), null, String(broken));
  }
  assert.deepEqual(['owned', 'missing', 'banana', ''].map(ownedFilter), ['owned', 'missing', 'all', 'all']);
});
