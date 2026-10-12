import assert from 'node:assert/strict';
import { test } from 'node:test';
import { accountFromGame, ownedFilter, parseAccount } from '../../lib/account/accountStore';
import { portraitPath, profileArtPath, assistantArtPath, assistantCatalogue, assistantIconPath, avatarSources, cardOutfits } from '../../lib/account/portraits';

const MAP = { version: 1 as const, chars: {
  char_300_phenxi: { name: 'Fiammetta', rarity: 6, modules: {} },
  char_002_amiya: { name: 'Amiya', modules: {} },
  char_1001_amiya2: { name: 'Amiya (Guard)', modules: {} },
} };

test('an account gives the operators it owns by name, its outfits by skin id and the stages it cleared', () => {
  const record = accountFromGame({
    status: { nickName: 'Doctor', nickNumber: '1234', level: 120, registerTs: 1580712160, secretary: 'char_002_amiya', secretarySkinId: 'char_002_amiya@winter#1', resume: ' yes ', uid: 11311084, avatar: { type: 'ICON', id: 'avatar_special_41' } },
    nameCardStyle: { skin: { selected: 'nc_moon_1', tmpl: { nc_moon_1: 3 } }, componentOrder: ['module_assist', 'module_sign', 'module_unknown', 'module_equip'] },
    social: { assistCharList: [{ charInstId: 1, skillIndex: 2 }, null, { charInstId: 99 }, { charInstId: 2 }], medalBoard: { type: 'CUSTOM', custom: '1' } },
    medal: { custom: { customs: { 1: { layout: [{ id: 'medal_a', pos: [6, 12] }, { id: 'medal_b', pos: [9, 9] }] } } } },
    troop: { chars: {
      1: { charId: 'char_300_phenxi', level: 60, evolvePhase: 2, potentialRank: 5, skin: 'char_300_phenxi@summer#1',
        skills: [{ skillId: 'skchr_phenxi_1', specializeLevel: 0 }, { skillId: 'skchr_phenxi_2', specializeLevel: 2 }, { skillId: 'skchr_phenxi_3', specializeLevel: 3 }],
        currentEquip: 'uniequip_002_phenxi',
        equip: { uniequip_001_phenxi: { level: 1, locked: 0 }, uniequip_002_phenxi: { level: 3, locked: 0 }, uniequip_003_phenxi: { level: 1, locked: 1 } } },
      2: { charId: 'char_002_amiya', currentTmpl: 'char_1001_amiya2', tmpl: { char_002_amiya: { skinId: 'char_002_amiya#1+' }, char_1001_amiya2: { skinId: 'char_1001_amiya2#2' } } },
      3: { charId: 'char_9999_brandnew', skin: 'char_9999_brandnew#1' },
      4: { charId: 'char_300_phenxi', skin: '../../etc' },
    } },
    skin: { characterSkins: { 'char_300_phenxi@summer#1': 1, 'char_002_amiya@winter#1': 1 } },
    // The game's stage states: 0 opened, 1 played, 2 cleared, 3 cleared with every star.
    dungeon: { stages: { main_00: { state: 0 }, main_01: { state: 1 }, main_02: { state: 2 }, main_03: { state: 3 } } },
    // Annihilation: a map counts once every kill-count reward is claimed.
    campaignsV2: { instances: { camp_r_01: { maxKills: 400, rewardStatus: [1, 1, 1] }, camp_r_02: { maxKills: 250, rewardStatus: [1, 0, 0] }, camp_r_03: { rewardStatus: [] } } },
  }, MAP, 'en', new Date('2026-10-01T12:00:00Z'));
  assert.deepEqual(record, {
    version: 1, rewardClaims: { known: [], claimed: [] }, server: 'en', importedAt: '2026-10-01T12:00:00.000Z', doctor: 'Doctor#1234',
    // Amiya's forms each by their own name; one with no record yet is left out.
    operators: ['Amiya', 'Amiya (Guard)', 'Fiammetta'],
    skins: ['char_002_amiya@winter#1', 'char_300_phenxi@summer#1'],
    cleared: ['main_02', 'main_03'],
    annihilation: ['camp_r_01'],
    // The outfit each wears, Amiya's forms each their own; anything not a skin id is left out.
    outfits: { Amiya: 'char_002_amiya#1+', 'Amiya (Guard)': 'char_1001_amiya2#2', Fiammetta: 'char_300_phenxi@summer#1' },
    wallet: { orundum: 0, originitePrime: 0, permits: 0, yellowCerts: 0, monthlyCardUntil: null },
    profile: { level: 120, registeredAt: '2020-02-03T06:42:40.000Z', secretary: 'Amiya', bio: 'yes', uid: '11311084', avatar: 'avatar_special_41', avatarType: 'ICON', nameCard: 'nc_moon_1',
      // The card style's variant, the assistant's outfit, the panels the page knows in the
      // player's order, and the Module panel's counts (the Original and a locked one are not).
      nameCardVariant: 3, secretarySkin: 'char_002_amiya@winter#1', panels: ['module_assist', 'module_sign', 'module_equip'],
      modules: { collected: 1, stage3: 1, operators: 1 },
      hired: 4,
      // The support units by the troop's own records; a slot with no operator behind it is left out.
      // Whether every skill is at M3 (the game's badge): Fiammetta's second is at M2, so not.
      supports: [{ name: 'Fiammetta', rarity: 6, level: 60, elite: 2, potential: 6, skill: 3, allMastered: false, module: 'uniequip_002_phenxi', skillId: 'skchr_phenxi_3', skin: 'char_300_phenxi@summer#1' },
        // Amiya lends the form she is in, in that form's outfit.
        { name: 'Amiya (Guard)', rarity: null, level: 1, elite: 0, potential: 1, skill: null, allMastered: false, module: null, skillId: null, skin: 'char_1001_amiya2#2' }],
      medals: [{ id: 'medal_a', x: 6, y: 12 }, { id: 'medal_b', x: 9, y: 9 }] },
  });
  assert.deepEqual(parseAccount(JSON.stringify(record)), record);
});

test("an outfit's portrait is named as arkpedia-image-assets publishes it (sync_profile_art.py's portrait_name)", () => {
  assert.equal(portraitPath('char_1013_chen2@boc#6'), '/profile-portraits/char_1013_chen2_boc_6.webp');
  assert.equal(portraitPath('char_1013_chen2#2'), '/profile-portraits/char_1013_chen2_2.webp');
  assert.equal(portraitPath('char_002_amiya#1+'), '/profile-portraits/char_002_amiya_1p.webp');
  // The files are lower case where the ids are not, on a case-sensitive host.
  assert.equal(portraitPath('char_4193_lemuen@ambienceSynesthesia#7'), '/profile-portraits/char_4193_lemuen_ambiencesynesthesia_7.webp');
  assert.equal(profileArtPath('profile-namecards', 'nc_as2026_TheAphasic-bg'), '/profile-namecards/nc_as2026_theaphasic-bg.webp');
});

test('a stored record is read back only when it is a whole one', () => {
  const good = { version: 1, server: 'en', importedAt: '2026-10-01T12:00:00.000Z', doctor: null, operators: [], skins: [], cleared: [] };
  assert.deepEqual(parseAccount(JSON.stringify(good)), good);
  for (const broken of [null, '', '{', '[]', JSON.stringify({ ...good, version: 2 }), JSON.stringify({ ...good, operators: 'Amiya' }), JSON.stringify({ ...good, skins: [1] })]) {
    assert.equal(parseAccount(broken), null, String(broken));
  }
  assert.deepEqual(['owned', 'missing', 'banana', ''].map(ownedFilter), ['owned', 'missing', 'all', 'all']);
});

test("the import keeps what the account holds to pull with, for the Pull Planner's resources", () => {
  const now = new Date('2026-10-02T12:00:00Z');
  const status = { diamondShard: 12345, androidDiamond: 87, iosDiamond: 87, gachaTicket: 3, tenGachaTicket: 2, hggShard: 412, lggShard: 9000, monthlySubscriptionEndTime: 1793491200 };
  assert.deepEqual(accountFromGame({ status }, MAP, 'en', now).wallet,
    { orundum: 12345, originitePrime: 87, permits: 23, yellowCerts: 412, monthlyCardUntil: '2026-11-01T00:00:00.000Z' });
  // A server that splits Originite Prime into paid and free says so; no card is null.
  assert.deepEqual(accountFromGame({ status: { payDiamond: 10, freeDiamond: 5, androidDiamond: 99, monthlySubscriptionEndTime: 0 } }, MAP, 'en', now).wallet,
    { orundum: 0, originitePrime: 15, permits: 0, yellowCerts: 0, monthlyCardUntil: null });
  // Stored and read back; a bad amount reads as none, never as a number it is not.
  const record = accountFromGame({ status }, MAP, 'en', now);
  assert.deepEqual(parseAccount(JSON.stringify(record))!.wallet, record.wallet);
  const bad = { ...record, wallet: { orundum: -5, originitePrime: 'lots', permits: 1.5, yellowCerts: 1e12, monthlyCardUntil: 'soon' } };
  assert.deepEqual(parseAccount(JSON.stringify(bad))!.wallet, { orundum: 0, originitePrime: 0, permits: 0, yellowCerts: 0, monthlyCardUntil: null });
});

test('a support unit wears the M3 badge only when every one of its skills is at Mastery 3', () => {
  const user = (levels: number[]) => ({
    social: { assistCharList: [{ charInstId: 1, skillIndex: 0 }] },
    troop: { chars: { 1: { charId: 'char_300_phenxi', level: 90, evolvePhase: 2, potentialRank: 0, skills: levels.map((specializeLevel) => ({ specializeLevel })) } } },
  });
  const badge = (levels: number[]) => accountFromGame(user(levels), MAP, 'en').profile!.supports![0].allMastered;
  assert.equal(badge([3, 3, 3]), true);
  assert.equal(badge([3, 3]), true, 'a two-skill operator with both at M3');
  assert.equal(badge([3, 3, 2]), false, 'the lent skill at M3 is not enough');
  assert.equal(badge([]), false, 'no skills, no badge');
  // A record from the first build kept the lent skill's mastery: no badge until a new import.
  const old = { version: 1, server: 'en', importedAt: '2026-10-02T12:00:00.000Z', doctor: null, operators: [], skins: [], cleared: [],
    profile: { level: 1, registeredAt: null, secretary: null, bio: null, supports: [{ name: 'Ascalon', rarity: 6, level: 60, elite: 2, potential: 1, skill: 2, mastery: 3, skin: null }] } };
  const unit = parseAccount(JSON.stringify(old))!.profile!.supports![0] as unknown as Record<string, unknown>;
  assert.equal(unit.mastery, undefined);
  assert.equal(unit.allMastered, undefined);
});

test('a support unit shown full length draws its module\'s mark and its skill\'s icon, as the image repository names them', async () => {
  const { moduleMarkPath, skillIconPath } = await import('../../lib/account/portraits');
  assert.equal(moduleMarkPath('uniequip_002_ascln', { uniequip_002_ascln: 'amb-x' }), '/profile-modules/amb-x.webp');
  assert.equal(moduleMarkPath('uniequip_009_none', { uniequip_002_ascln: 'amb-x' }), null);
  assert.equal(skillIconPath('skchr_ascln_2', {}), '/profile-skills/skchr_ascln_2.webp');
  // A skill that shares another's icon: its bracketed index is a suffix in the file's name.
  assert.equal(skillIconPath('skchr_midn_1', { skchr_midn_1: 'skcom_enchant[1]' }), '/profile-skills/skcom_enchant_1.webp');
});

/* The card's avatar (lib/account/portraits.ts avatarSources): the pictures to try in order. The
   game stores status.avatar as { type, id }, and for the "Assistant Operator" avatar the id is the
   assistant's skin id (the client's PlayerAvatarUtil._GetAvatarIconFromAssistant(skinId)), not
   display_meta_table's menu entry avatar_ass_01. The first build of the card kept only the id and
   took avatar_ass_01 for the assistant's, so every real assistant avatar asked for
   /profile-avatars/char_1019_siege2@epoque#50.webp, a file that cannot exist: an empty box. */
const AVATAR_CHARS = { char_1019_siege2: { name: 'Vina Victoria', rarity: 6 }, char_421_crow: { name: 'La Pluma', rarity: 5 }, char_002_amiya: { name: 'Amiya', rarity: 5 } };
// Glorious Path's illustration the catalogue files by its brand (/skin-images/EPOQUE - Glorious
// Path.webp): the icon is by operator and outfit name.
const OUTFIT_NAMES = new Map([['char_1019_siege2@epoque#50', 'Glorious Path']]);
const VINA_OUTFIT = '/six-star-icons/Vina Victoria - Glorious Path.webp', VINA_BASE = '/six-star-icons/Vina Victoria - Base.webp';
const imported = (avatar: unknown, secretarySkinId: unknown = 'char_1019_siege2@epoque#50') => {
  const status: Record<string, unknown> = { secretary: 'char_1019_siege2', secretarySkinId };
  if (avatar !== undefined) status.avatar = avatar;
  const profile = accountFromGame({ status }, { version: 1, chars: { char_1019_siege2: { name: 'Vina Victoria', rarity: 6, modules: {} } } }, 'en').profile!;
  return { profile, sources: avatarSources(profile, AVATAR_CHARS, OUTFIT_NAMES) };
};

test('an imported "Assistant Operator" avatar is the assistant in the outfit it wears, then its Base icon', () => {
  // The game's shape: type ASSISTANT, the assistant's skin id. The type is kept with the id.
  const outfit = imported({ type: 'ASSISTANT', id: 'char_1019_siege2@epoque#50' });
  assert.equal(outfit.profile.avatarType, 'ASSISTANT');
  assert.equal(outfit.profile.avatar, 'char_1019_siege2@epoque#50');
  assert.deepEqual(outfit.sources, [VINA_OUTFIT, VINA_BASE]);
  // In its default art, promoted: the Elite 2 icon.
  assert.deepEqual(imported({ type: 'ASSISTANT', id: 'char_1019_siege2#2' }, 'char_1019_siege2#2').sources, ['/six-star-icons/Vina Victoria - Elite 2.webp', VINA_BASE]);
  // The skin id the avatar holds comes first; the assistant's own outfit, if it differs, next.
  assert.deepEqual(imported({ type: 'ASSISTANT', id: 'char_1019_siege2#2' }).sources, ['/six-star-icons/Vina Victoria - Elite 2.webp', VINA_OUTFIT, VINA_BASE]);
  // An id that is not a skin id (none, empty, the menu's avatar_ass_01): the assistant's outfit.
  for (const id of [undefined, '', 'avatar_ass_01']) {
    assert.deepEqual(imported({ type: 'ASSISTANT', id }).sources, [VINA_OUTFIT, VINA_BASE], `id ${JSON.stringify(id)}`);
  }
  // An outfit the catalogue does not name yet: the operator's Base icon, never a missing file.
  assert.deepEqual(imported({ type: 'ASSISTANT', id: 'char_1019_siege2@unknown#9' }, 'char_1019_siege2@unknown#9').sources, [VINA_BASE]);
  assert.deepEqual(avatarSources({ avatarType: 'ASSISTANT', avatar: 'char_421_crow@unknown#3', secretarySkin: null }, AVATAR_CHARS, OUTFIT_NAMES), ['/five-star-icons/La Pluma - Base.webp']);
  // No skin id anywhere: the assistant's Base icon by name; an operator the map lacks: nothing.
  assert.deepEqual(avatarSources({ avatarType: 'ASSISTANT', avatar: null, secretarySkin: null, secretary: 'La Pluma' }, AVATAR_CHARS, OUTFIT_NAMES), ['/five-star-icons/La Pluma - Base.webp']);
  assert.deepEqual(avatarSources({ avatarType: 'ASSISTANT', avatar: 'char_9999_brandnew#1', secretarySkin: 'char_9999_brandnew#1' }, AVATAR_CHARS, OUTFIT_NAMES), []);
});

test('an imported icon avatar is drawn from profile-avatars, and none or the default type is the default avatar', () => {
  assert.deepEqual(imported({ type: 'ICON', id: 'avatar_special_41' }).sources, ['/profile-avatars/avatar_special_41.webp']);
  // Mixed case in the game's id, lower case on the asset host.
  assert.deepEqual(imported({ type: 'ICON', id: 'avatar_activity_PL' }).sources, ['/profile-avatars/avatar_activity_pl.webp']);
  // A new account sends "avatar": {} or none at all; DEFAULT and NONE draw the default whatever
  // the id: the game shows display_meta_table's defaultAvatarId, avatar_def_01.
  for (const avatar of [{}, undefined, { type: 'DEFAULT' }, { type: 'DEFAULT', id: 'avatar_special_41' }, { type: 'NONE' }, { type: 'ICON' }, { type: 'ICON', id: '../../etc' }]) {
    assert.deepEqual(imported(avatar).sources, ['/profile-avatars/avatar_def_01.webp'], JSON.stringify(avatar));
  }
  assert.equal(imported({}).profile.avatarType, null);
  // A type the game may add later is not kept; its id still says what it is.
  assert.equal(imported({ type: 'SOMETHING', id: 'avatar_dyn_02' }).profile.avatarType, null);
  assert.deepEqual(imported({ type: 'SOMETHING', id: 'avatar_dyn_02' }).sources, ['/profile-avatars/avatar_dyn_02.webp']);
});

test('a record imported before the avatar type was kept draws the same, without a new import', () => {
  const stored = (avatar: string | null, secretarySkin: string | null = 'char_1019_siege2@epoque#50') => {
    const profile = parseAccount(JSON.stringify({ version: 1, server: 'en', importedAt: '2026-10-05T12:00:00.000Z', doctor: null, operators: [], skins: [], cleared: [],
      profile: { level: 120, registeredAt: null, secretary: 'Vina Victoria', bio: null, uid: '1', avatar, nameCard: null, secretarySkin } }))!.profile!;
    assert.equal('avatarType' in profile, false, 'absent, not null: the record says nothing of it');
    return avatarSources(profile, AVATAR_CHARS, OUTFIT_NAMES);
  };
  // What the old import kept of the assistant avatar: its skin id. The bug: a profile-avatars path.
  assert.deepEqual(stored('char_1019_siege2@epoque#50'), [VINA_OUTFIT, VINA_BASE]);
  // The record's assistant by name (Vina Victoria) after the skin it holds, should that fail.
  assert.deepEqual(stored('char_421_crow#1', null), ['/five-star-icons/La Pluma - Base.webp', VINA_BASE]);
  // Amiya's Elite 1 art: a "+" in the skin id, which the stored record keeps. Read as anything
  // but a skin id it is /profile-avatars/char_002_amiya#1+.webp again, the empty box of the bug.
  assert.deepEqual(stored('char_002_amiya#1+', null), ['/five-star-icons/Amiya - Elite 1.webp', '/five-star-icons/Amiya - Base.webp', VINA_BASE]);
  // The site's own test records of #217 held the menu's id.
  assert.deepEqual(stored('avatar_ass_01'), [VINA_OUTFIT, VINA_BASE]);
  assert.deepEqual(stored('avatar_special_41'), ['/profile-avatars/avatar_special_41.webp']);
  // None kept: the old import's {} or no avatar, the default.
  assert.deepEqual(stored(null), ['/profile-avatars/avatar_def_01.webp']);
  // A new record keeps its type through the round trip.
  const record = accountFromGame({ status: { avatar: { type: 'ASSISTANT', id: 'char_1019_siege2@epoque#50' }, secretarySkinId: 'char_1019_siege2@epoque#50' } }, MAP, 'en', new Date('2026-10-08T00:00:00Z'));
  assert.equal(parseAccount(JSON.stringify(record))!.profile!.avatarType, 'ASSISTANT');
  assert.equal(parseAccount(JSON.stringify({ ...record, profile: { ...record.profile, avatarType: 'BOGUS' } }))!.profile!.avatarType, null);
});

test("the assistant's icon and illustration name a default art by its form: Base, Amiya's Elite 1, Elite 2", () => {
  assert.equal(assistantIconPath('char_002_amiya#1', AVATAR_CHARS, OUTFIT_NAMES), '/five-star-icons/Amiya - Base.webp');
  // Amiya at Elite 1 has art of her own ("#1+"), drawn as Base until 2026-10.
  assert.equal(assistantIconPath('char_002_amiya#1+', AVATAR_CHARS, OUTFIT_NAMES), '/five-star-icons/Amiya - Elite 1.webp');
  assert.equal(assistantArtPath('char_002_amiya#1+', AVATAR_CHARS, new Map()), '/five-star-skins/Amiya - Elite 1.webp');
  assert.equal(assistantIconPath('char_1019_siege2#2', AVATAR_CHARS, OUTFIT_NAMES), '/six-star-icons/Vina Victoria - Elite 2.webp');
  assert.equal(assistantArtPath('char_1019_siege2#2', AVATAR_CHARS, new Map()), '/six-star-skins/Vina Victoria - Elite 2.webp');
  assert.equal(assistantIconPath('char_unknown#1', AVATAR_CHARS, OUTFIT_NAMES), null);
});

test("an outfit's icon is named without the characters a file name cannot hold, as the icon folders file it", () => {
  // As the catalogue spells three live outfits ('"Afternoon Teatime"', 'Liberté//Échec'): the
  // folders file them as "Afternoon Teatime" and "LibertéÉchec".
  const names = new Map([['char_421_crow@quoted#2', '"Tea Time"'], ['char_421_crow@slashed#3', 'Day//Night'], ['char_421_crow@both#4', ' "Out/In" ']]);
  assert.equal(assistantIconPath('char_421_crow@quoted#2', AVATAR_CHARS, names), '/five-star-icons/La Pluma - Tea Time.webp');
  assert.equal(assistantIconPath('char_421_crow@slashed#3', AVATAR_CHARS, names), '/five-star-icons/La Pluma - DayNight.webp');
  assert.equal(assistantIconPath('char_421_crow@both#4', AVATAR_CHARS, names), '/five-star-icons/La Pluma - OutIn.webp');
  assert.deepEqual(avatarSources({ avatarType: 'ASSISTANT', avatar: 'char_421_crow@both#4' }, AVATAR_CHARS, names), ['/five-star-icons/La Pluma - OutIn.webp', '/five-star-icons/La Pluma - Base.webp']);
  // An operator's own name too: the Base icon of one named with a "/" or a '"'.
  const chars = { char_9001_odd: { name: 'Odd/"Name"', rarity: 4 } };
  assert.equal(assistantIconPath('char_9001_odd#1', chars, new Map()), '/four-star-icons/OddName - Base.webp');
});

test('the account page and the icon audit read the outfits through one mapping: names and art by skin id', () => {
  // The catalogue as data/skins.json and getAllSkins() hold it: an outfit without a skin id is
  // no assistant's.
  const outfits = cardOutfits([
    { name: 'Glorious Path', skinId: 'char_1019_siege2@epoque#50', image: '/skin-images/EPOQUE - Glorious Path.webp' },
    { name: 'Not in the game yet', image: '/skin-images/Somewhere.webp' },
    { name: '"Tea Time"', skinId: 'char_421_crow@quoted#2' },
  ]);
  assert.deepEqual(outfits, [
    { id: 'char_1019_siege2@epoque#50', image: '/skin-images/EPOQUE - Glorious Path.webp', name: 'Glorious Path' },
    { id: 'char_421_crow@quoted#2', image: null, name: '"Tea Time"' },
  ]);
  const { chars, outfitNames, outfitArt } = assistantCatalogue({ chars: AVATAR_CHARS }, outfits);
  assert.equal(chars, AVATAR_CHARS);
  // Keyed by skin id, each to the outfit's name (the icon's) or its illustration.
  assert.deepEqual([...outfitNames], [['char_1019_siege2@epoque#50', 'Glorious Path'], ['char_421_crow@quoted#2', '"Tea Time"']]);
  assert.deepEqual([...outfitArt], [['char_1019_siege2@epoque#50', '/skin-images/EPOQUE - Glorious Path.webp']]);
  assert.deepEqual(avatarSources({ avatarType: 'ASSISTANT', avatar: 'char_1019_siege2@epoque#50' }, chars, outfitNames), [VINA_OUTFIT, VINA_BASE]);
  assert.equal(assistantIconPath('char_421_crow@quoted#2', chars, outfitNames), '/five-star-icons/La Pluma - Tea Time.webp');
  assert.equal(assistantArtPath('char_1019_siege2@epoque#50', chars, outfitArt), '/skin-images/EPOQUE - Glorious Path.webp');
  // The illustration map in the names' place names an icon no folder has: the card would fall
  // back to the Base icon for every outfit, and the audit check files that do not exist.
  assert.notEqual(assistantIconPath('char_1019_siege2@epoque#50', chars, outfitArt), VINA_OUTFIT);
  assert.equal(assistantIconPath('char_421_crow@quoted#2', chars, outfitArt), null);
});
