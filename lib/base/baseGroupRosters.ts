/**
 * Confirmed operator group rosters for base skill calculations.
 * Mirrors the Python group_rosters.py exactly -- same confirmed data,
 * ported to TypeScript for use in the live site's calculation engine.
 *
 * SOUBO_ADVENTURERS is confirmed (user confirmed the inference).
 * ELITE_OPERATOR is confirmed as this exact 7-name list, not "any 6-star".
 */

export const OPERATION_PLATFORM = new Set([
  'Castle-3', 'Lancet-2', 'CONFESS-47', 'Justice Knight', 'PhonoR-0',
  'THRM-EX', 'Friston-3', 'Gallus2',
]);

export const LATERANO = new Set([
  'Ambriel', 'Archetto', 'Arene', 'CONFESS-47', 'Executor',
  'Executor the Ex Foedere', 'Enforcer', 'Fiammetta', 'Insider', 'Lemuen',
  'Mostima', 'Plume', 'Sankta Miksaparato', 'Spuria', 'Virtuosa',
  'Adnachiel',
]);

export const URSUS_STUDENT_SELF_GOVERNING_GROUP = new Set([
  'Zima', 'Zima the Raging Tide', 'Rosa', 'Istina', 'Gummy', 'Leto',
  'Absinthe', 'Delphine',
]);

export const GLASGOW = new Set([
  'Siege', 'Indra', 'Morgan', 'Dagda',
]);

export const KNIGHTS = new Set([
  'Nearl', 'Nearl the Radiant Knight', 'Blemishine', 'Whislash', 'Flametail',
  'Fartooth', 'Ashlock', 'Wild Mane', 'Justice Knight', 'Gravel', 'Viviana',
]);

export const TEAM_RAINBOW = new Set([
  'Ash', 'Tachanka', 'Blitz', 'Fuze', 'Ela', 'Frost', 'Doc', 'Iana',
]);

export const LUNGMEN_GUARD_DEPARTMENT = new Set([
  'Swire', "Ch'en", 'Hoshiguma',
]);

export const ABYSSAL_HUNTERS = new Set([
  'Gladiia', 'Ulpianus', 'Andreana', 'Skadi', 'Specter',
]);

export const KARLAN_TRADE = new Set([
  'SilverAsh', 'SilverAsh the Reignfrost', 'Degenbrecher', 'Gnosis',
  'Courier', 'Matterhorn',
]);

export const MINOS = new Set([
  'Conviction', 'Pallas', 'Erato', 'Sideroca', 'Varkáris', 'Vulcan',
  'Croissant', 'Perfumer', 'Perfumer the Distilled',
]);

export const SARGON = new Set([
  'Beeswax', 'Bubble', 'Papyrus', 'Flint', 'Estelle', 'Eunectes',
  'Gavial', 'Gavial the Invincible', 'Hadiya', 'Kestrel', 'Manticore',
  'Minimalist', 'Narantuya', 'Passenger', 'Pepe', 'Sand Reckoner',
  'Philae', 'Scene', 'Sesa', 'Titi', 'Tomimi', 'Totter', 'Wulfenite',
  'Tuye', 'Carnelian', 'Liskarm', 'Heavyrain', 'Mantra', '12F', 'Spot',
  'Vanilla', 'Taraxacum',
]);

export const DURIN = new Set([
  'Myrtle', 'Minimalist', 'Chestnut', 'Durin', 'Tecno',
]);

export const SUI = new Set([
  'Chongyue', 'Dusk', 'Nian', 'Ling', 'Yu', 'Shu', 'Wang',
]);

export const WANDERING_MEDIC = new Set([
  'Eyjafjalla', 'Harold', 'Honeyberry', 'Mulberry', 'Chestnut',
]);

export const SAMI = new Set([
  'Bibeak', 'Gitano', 'Valarqvin', 'Santalla', 'Typhon', 'Qanipalaat',
]);

export const ALTERNATE_OPERATOR = new Set([
  'Lava the Purgatory', 'Skadi the Corrupting Heart', "Ch'en the Holungday",
  'Nearl the Radiant Knight', 'Kroos the Keen Glint', 'Specter the Unchained',
  'Hibiscus the Purifier', 'Gavial the Invincible', 'Greyy the Lightning Bearer',
  'Texas the Omertosa', 'Reed the Flaming Shadow', 'Kirin R Yato',
  'Rathalos S Noir Corne', 'Silence the Paradigmatic', 'Executor the Ex Foedere',
  'Eyjafjalla the Hvit Aska', 'Swire the Elegant Wit', 'Fang the Fire-Sharpened',
  "Wiš'adel", 'Vina Victoria', 'Lappland the Decadenza', 'Thorns the Lodestar',
  'Blaze the Igniting Spark', 'Exusiai the New Covenant', 'Tragodia',
  'Leizi the Thunderbringer', 'Hoshiguma the Breacher', 'Astgenne the Lightchaser',
  'Pramanix the Prerita', 'SilverAsh the Reignfrost', 'Perfumer the Distilled',
  "Ch'en the Dawnstreak", 'Zima the Raging Tide', "Kal'tsit - Esperanta",
  'Violet Mizutsune Orchid', 'Zinogre S Catapult', 'Angelina the Mellow Wish',
]);

// Confirmed as this exact 7-name list, not "any 6-star operator".
export const ELITE_OPERATOR = new Set([
  'Blaze', 'Blaze the Igniting Spark', 'Logos', 'Mantra', 'Mechanist',
  'Raidian', 'Rosmontis',
]);

// Confirmed inference (see baseResources.ts / resources.py notes).
export const SOUBO_ADVENTURERS = new Set([
  'Kirin R Yato', 'Rathalos S Noir Corne',
]);

// Confirmed by the user. Deliberately does NOT include "Fang the
// Fire-Sharpened" herself -- a different operator from the plain
// "Fang" who IS a member, despite the similar name.
export const A1_DETACHMENT = new Set([
  'Beagle', 'Hibiscus', 'Fang', 'Kroos', 'Lava',
]);

export const BLACKSTEEL_WORLDWIDE = new Set([
  'Jessica', 'Almond', 'Vanilla', 'Franka',
  'Liskarm', 'Surfer',
]);

export const PINUS_SYLVESTRIS = new Set([
  'Flametail', 'Ashlock', 'Wild Mane', 'Justice Knight', 'Fartooth', 'Pinus',
]);

// Confirmed by the user. Deliberately does NOT include "Silence the
// Paradigmatic" (her alter form) -- confirmed excluded, unlike every
// other alter form in this list which IS included alongside their base
// operator.
export const RHINE_LAB = new Set([
  'Astgenne the Lightchaser', 'Dorothy', 'Ifrit', 'Magallan', 'Muelsyse',
  'Nasti', 'Saria',
  'Astgenne', 'Mayer', 'Ptilopsis', 'Silence',
]);
