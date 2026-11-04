/**
 * The hand-written part of the base skill table (lib/base/baseSkillEffects.ts): what the game text
 * states in words the rules in build-base-skill-effects.ts cannot read -- a count, a condition, an
 * interaction with another skill -- written as data, keyed by the handler key the calculator used to
 * find the skill ("Operator|Skill", resolved to buff ids through the operator records, under the
 * operator's name or a former one) or by a buff id outright where one key covered two steps.
 *
 * GENERIC_IS_RIGHT lists the keys the calculator once had a handler for whose text the rules read
 * correctly on their own; the build only checks that each still names a record skill.
 */
import type { SkillCondition, SkillCountSource, SkillEffect, SkillEffectKind, SkillInteraction } from '../../lib/base/baseSkillEffects';

/** An effect as written here: a suppressing skill is named by its handler key, resolved to a buff id by the build. */
export type OverrideEffect = Omit<SkillEffect, 'suppressedBy'> & { suppressedBy?: { key: string; when?: SkillCondition } };

export interface SkillOverride {
  effects?: OverrideEffect[];
  custom?: { handler: string; params?: Record<string, number> };
  interaction?: SkillInteraction;
  note?: string;
  /** The game states the effect without a number; nothing to compute. */
  nonNumeric?: true;
}

const e = (kind: SkillEffectKind, value: number, more: Partial<OverrideEffect> = {}): OverrideEffect => ({ kind, value, ...more });
const counted = (kind: SkillEffectKind, value: number, count: SkillCountSource, amount: number, more: Partial<OverrideEffect> & { step?: number; maxCount?: number } = {}): OverrideEffect => {
  const { step, maxCount, ...rest } = more;
  return { kind, value, per: { count, amount, ...(step ? { step } : {}), ...(maxCount !== undefined ? { maxCount } : {}) }, ...rest };
};
const when = (kind: SkillEffectKind, value: number, condition: SkillCondition, more: Partial<OverrideEffect> = {}): OverrideEffect => ({ kind, value, when: condition, ...more });
const roomHas = (name: string): SkillCondition => ({ type: 'roomHas', name });
const roomHasRoster = (roster: string): SkillCondition => ({ type: 'roomHasRoster', roster });
const ccHas = (name: string): SkillCondition => ({ type: 'ccHas', name });
const baseHas = (name: string): SkillCondition => ({ type: 'baseHas', name });
const alone: SkillCondition = { type: 'alone' };
const clueExchange: SkillCondition = { type: 'clueExchange' };
const atLeast = (count: SkillCountSource, value: number): SkillCondition => ({ type: 'countAtLeast', count, value });
const GOLD = 'Precious Metals' as const, EXP = 'Battle Records' as const;
const ramp = (base: number, perHour: number, cap: number) => ({ handler: 'ramp', params: { base, perHour, cap } });
const TAILORING_LOWER: SkillOverride = { effects: [e('selfMorale', -0.25)], interaction: { goldOrderTier: 'lower' } };
const TAILORING_HIGHER: SkillOverride = { effects: [e('selfMorale', -0.25)], interaction: { goldOrderTier: 'higher' } };
const faction = (count: SkillCountSource, amount: number) => counted('ccMorale', 0, count, amount);
const PROFESSIONAL_ETHICS = (value: number): SkillOverride => ({ effects: [when('clueSpeed', value, alone), when('selfMorale', 1, alone)] });
const ALL_CLASSES = ['PIONEER', 'WARRIOR', 'TANK', 'SNIPER', 'CASTER', 'MEDIC', 'SUPPORT', 'SPECIAL'];
const ANY_RECIPE = ['F_BUILDING', 'F_EVOLVE', 'F_SKILL', 'F_ASC'];
const MENTAL_TRAINING: SkillOverride = { effects: [], nonNumeric: true, note: 'The next mastery must start after this trainer has trained the same trainee for 5 consecutive hours. Leaving before it starts clears the prepared reduction.' };

/** Keys whose text the generic rules already read exactly as the handler computed them. */
export const GENERIC_IS_RIGHT: readonly string[] = [
  // Reception Room: flat clue speed plus a likelihood effect the game gives no number for.
  'Caper|Clue Search α', 'Astesia|Astrology', 'Courier|Courier', 'Jessica|Liaison', 'Breeze|Fallen Noble', 'Cantabile|Overlook Nothing β',
  'Franka|B.P.R.S.', 'Indra|Arraigner', 'Istina|Military Advisor', 'Kjera|Snow Watcher', 'Mostima|Messenger - Penguin Logistics',
  'Angelina|Messenger - Rhodes Island', 'Saria|Watchman', 'Aegis|Cross-Disciplinary Communication',
  // Reception Room: likelihood only.
  'Angelina the Mellow Wish|Veteran Messenger', 'Windscoot|On the Alert', 'Odda|Secret Clue', "Ho'olheyak|Bibliography Consultant",
  'U-Official|Conspicuous Investigator', 'May|Royal Detective (Self Proclaimed)', 'Absinthe|Secret Inquiry', 'Absinthe|Screening',
  'Cantabile|Overlook Nothing α', 'Elysium|Correspondent', 'Elysium|Pioneer', 'Harold|Making Friends', 'Kjera|Kjeragandr',
  'Matsukiri|The Art of Deduction', 'Mountain|Columbian History', 'Puzzle|Intel Analysis', 'Quercus|Sound of the Wind',
  'Quercus|Information Collation', "Ch'en the Dawnstreak|Drifting Wanderer",
  // Office: flat HR speed plus a per-contact clue likelihood.
  'Delphine|Old Acquaintances, New Friends', 'Mountain|Insider', 'Rosa|Prestige',
  // Control Center: likelihood only, or a plain "+0.05 to all in the Control Center".
  'Heidi|"One Thousand Letters"', 'Leizi|Discernment', 'Raidian|Drip-Fed Care',
  // Dormitory: the plain self / all-operators / single-target recovery the rules read.
  'Crackborne|A Rare Rest', 'Thumpy|Rabbit Holes Everywhere', 'Koromaru|Fluffy Comfort', 'Kroos|Solitude', 'Estelle|Solitude', 'Frostleaf|Solitude',
  'Andreana|Solitude', 'Andreana|Hard to Avoid', 'GreyThroat|Solitude', 'Harmonie|Solitude', 'Lunacub|Lazy Cub', 'Reed|Solitude', 'Specter|Solitude',
  'Specter|Craze', 'Skadi|Solitude', 'Skadi|Elegy', 'Ethan|Concealed Gourmet', 'Hellagur|Release', 'Myrtle|Leader', 'Podenco|Nourish the Soul',
  'Amiya|Violin Solo', 'April|Inspiration', 'Bobbing|Listener', 'Cairn|Bedtime Stories', 'Doc|Altruism', 'Grain Buds|Rural Flute', 'Nightingale|Inspiration',
  'Nightingale|Lady of the Lamp', 'Nymph|Meditative Rites α', 'Nymph|Meditative Rites β', 'Perfumer the Distilled|Gentle Spirit', 'Sora|Idol',
  'Vendela|Aroma Convalescence α', 'Warmy|Cookout α', 'Warmy|Cookout β', 'Zima|Leader', 'Zima|General Z', 'Haruka|Celebrity Effect', 'Siege|Leader',
  'Siege|Lionheart', 'Lancet-2|Medical Service', 'Ansel|Thoughtfulness', 'Conviction|Apocalypse', 'Hibiscus|Thoughtfulness', 'Meteor|Thoughtfulness',
  'Myrrh|Thoughtfulness', 'Podenco|Thoughtfulness', 'Podenco|Convalescence', 'Gracebearer|Canticle of Grace', 'Grain Buds|Thoughtfulness',
  'Honeyberry|Psychological Counseling', 'Saileach|Victorian Literature', 'Shining|Thoughtfulness', 'Shining|Mercy', 'Exusiai the New Covenant|Natural Optimist',
  'Beagle|Liveliness', 'Cardigan|Liveliness', 'Jackie|Liveliness', 'Popukar|Harmony', 'Aciddrop|Give me five', 'Gummy|Cooking', 'Savage|Cooking',
  'Mousse|Baking', "Cliffheart|Explorer's Passion", 'Insider|Donut Party', 'Nearl|Followers', 'Pramanix|Karlan Saintess',
  'Durin|Laziness', 'Durin|Sleepiness', 'Ambriel|Laziness', 'Bagpipe|Madrigal', 'Fartooth|"Homecoming"', 'Hellagur|Break Loose', 'Hellagur|Absolution', 'Muelsyse|Natural Beauty',
  // Trading Post / Factory: flat numbers the rules read.
  'Degenbrecher|Intimidate', 'Degenbrecher|Imposing Presence',
];

export const OVERRIDES: Record<string, SkillOverride> = {
  // ---------------------------------------------------------------- Trading Post
  "Violet Mizutsune Orchid|A Captain's Resolve": { effects: [e('orderLimit', 3), counted('orderEfficiency', 0, 'tradingPosts.roster:BUBBLE_KINGDOM_HUNTERS', 0.2)] },
  'Terra Research Commission|Lovable Felynes': { effects: [counted('orderEfficiency', 0.05, 'resource:felvine', 0.03), e('orderLimit', 2)] },
  'U-Official|Naive Negotiator': { effects: [e('orderEfficiency', 0.1)], interaction: { trade: { fixedGold: 2 } } },
  'Bena|Tailoring α': TAILORING_LOWER, 'Bibeak|Tailoring α': TAILORING_LOWER, 'Paprika|Tailoring α': TAILORING_LOWER, 'Shamare|Tailoring α': TAILORING_LOWER,
  'Kafka|Handicrafts α': TAILORING_LOWER, "Diamante|Appraiser's Eyes": TAILORING_LOWER,
  'Bibeak|Tailoring β': TAILORING_HIGHER, 'Paprika|Tailoring β': TAILORING_HIGHER, 'Kafka|Handicrafts β': TAILORING_HIGHER, "Diamante|Appraiser's Means": TAILORING_HIGHER,
  'Jaye|Street Economics': { custom: { handler: 'jayeStreetEconomics', params: { perOrder: 0.04 } }, effects: [] },
  'Jaye|Basic Needs': { custom: { handler: 'jayeBasicNeeds', params: { perOrder: 0.04, limitPerTenPercent: 1 } }, effects: [] },
  'Quartz|Precise Scheduling': { effects: [counted('orderEfficiency', 0.3, 'base.distinctFactoryProducts', 0.02)] },
  'Lappland|Hidden Purpose α': { effects: [when('selfMorale', -0.1, roomHas('Texas')), when('orderLimit', 2, roomHas('Texas'))] },
  'Lappland|Hidden Purpose β': { effects: [when('selfMorale', -0.1, roomHas('Texas')), when('orderLimit', 4, roomHas('Texas'))] },
  'Texas|Feud': { effects: [when('selfMorale', 0.3, roomHas('Lappland')), when('orderEfficiency', 0.65, roomHas('Lappland'))] },
  'Texas|Tacit Understanding': { effects: [when('selfMorale', -0.3, roomHas('Exusiai'))] },
  'Lemuen|Amicus': { effects: [e('orderEfficiency', 0.2), when('orderEfficiency', 0.25, roomHas('Exusiai')), when('orderEfficiency', 0.25, roomHas('Exusiai the New Covenant'))] },
  'Exusiai the New Covenant|Same-City Express Order': { effects: [counted('orderEfficiency', 0, 'room.roster:LATERANO', 0.15)] },
  'Morgan|Gang Compass': { effects: [counted('orderEfficiency', 0, 'room.roster:GLASGOW', 0.2), when('orderEfficiency', 0.35, roomHas('Siege'))] },
  'Vina Victoria|Resolution on Foreign Trade β': { effects: [e('orderEfficiency', 0.3), when('orderEfficiency', 0.1, roomHasRoster('GLASGOW'))] },
  'Firewhistle|Advocate': { effects: [counted('orderEfficiency', 0, 'room.others', 0.15)] },
  'Kichisei|Hard-Working Manager α': { effects: [counted('orderEfficiency', 0, 'room.others', 0.1)] },
  'Kichisei|Hard-Working Manager β': { effects: [counted('orderEfficiency', 0, 'room.others', 0.2)] },
  'Firewhistle|Warm-Up': { effects: [e('roomMorale', -0.1)] },
  'Chilchuck|Familiar Flavors': { effects: [counted('orderEfficiency', 0, 'resource:monsterMeal', 0.01)] },
  'Wind Chimes|Hell and High Water': { effects: [counted('selfMorale', -0.1, 'resource:worldlyPlight', -0.01, { step: 10 })] },
  'Wind Chimes|Distant Letter': { effects: [counted('selfMorale', -0.1, 'resource:worldlyPlight', -0.02, { step: 10 })] },
  'Tuye|Logistics Planning α': { effects: [counted('orderEfficiency', 0.05, 'base.goldLines', 0.15, { step: 4 })] },
  'Tuye|Logistics Planning β': { effects: [counted('orderEfficiency', 0.05, 'base.goldLines', 0.15, { step: 2 })] },
  'Pozëmka|Sales Promotions': { effects: [counted('orderEfficiency', 0, 'base.goldLines', 0.05)] },
  'Kirara|Order Flow Visualization α': { effects: [e('orderEfficiency', 0.05), counted('resource', 0, 'base.goldFactories', 2, { step: 4, name: 'goldLines' })] },
  'Kirara|Order Flow Visualization β': { effects: [e('orderEfficiency', 0.05), counted('resource', 0, 'base.goldFactories', 2, { step: 2, name: 'goldLines' })] },
  "Jacinta|An Heiress's Eye": TAILORING_LOWER, 'Mitm|Know the Ropes': TAILORING_LOWER,
  'Pozëmka|Zeruertza Resident': { effects: [counted('resource', 0, 'base.roster:DURIN', 1, { name: 'goldLines', maxCount: 4 })] },
  'Mr. Nothing|"Obvious Deception"': { effects: [counted('resource', 0, 'base.dormOperators', 1, { name: 'worldlyPlight' }), counted('orderEfficiency', 0, 'resource:worldlyPlight', 0.01)] },
  'Ebenholz|Musicianship': { effects: [counted('resource', 0, 'base.dormOperators', 1, { name: 'perceptionInformation' }), e('resource', 0, { name: 'soundlessResonanceFromPerception' })] },
  'Ebenholz|Lingering Melody': { effects: [counted('orderEfficiency', 0, 'resource:soundlessResonance', 0.01, { step: 4 })] },
  'Ebenholz|Harmony Astray': { effects: [counted('orderEfficiency', 0, 'resource:soundlessResonance', 0.01, { step: 2 })] },
  'Rose Salt|Time Is Money': { effects: [counted('orderLimit', 0, 'level.room', 1)] },
  'Pepe|All-Rounder': { effects: [counted('orderLimit', 0, 'level.room', 1)] },
  'Archetto|Pious Fundraising α': { effects: [counted('orderEfficiency', 0, 'base.dormLevels', 0.01)] },
  'Archetto|Pious Fundraising β': { effects: [counted('orderEfficiency', 0, 'base.dormLevels', 0.02)] },
  'Mitm|Gifted Adviser': { effects: [counted('orderEfficiency', 0.15, 'level.receptionRoom', 0.05, { cap: 0.3 })] },
  'Vigil|New City Trade': { effects: [counted('orderEfficiency', 0.25, 'level.receptionRoom', 0.05, { cap: 0.4 })] },
  'Bellone|Famiglia Business α': { effects: [e('orderEfficiency', 0.25), when('orderEfficiency', 0.05, baseHas('Vigil'))] },
  'Bellone|Famiglia Business β': { effects: [e('orderEfficiency', 0.3), when('orderEfficiency', 0.1, baseHas('Vigil'))] },
  'Bellone|Outstanding Debt': { effects: [when('orderLimit', 2, roomHas('Vigil')), when('selfMorale', -0.1, roomHas('Vigil'))] },
  'Shamare|Whispers': { effects: [counted('orderEfficiency', 0, 'room.others', 0.45), e('selfMorale', 0.25)], interaction: { overridesOthers: true } },
  'Snowsant|Heavenly Reward α': { custom: { handler: 'snowsant', params: { perStep: 0.05, step: 0.05, cap: 0.25 } }, effects: [] },
  'Snowsant|Heavenly Reward β': { custom: { handler: 'snowsant', params: { perStep: 0.05, step: 0.05, cap: 0.35 } }, effects: [] },
  "Degenbrecher|Champion's Bearing": { custom: { handler: 'perOthersOrderLimit', params: { perStep: 0.25, step: 5, cap: 1, beforeLimitChanges: 1 } }, effects: [] },
  'Swire the Elegant Wit|Investment Solicitations': { custom: { handler: 'perOthersOrderLimit', params: { perStep: 0.04, step: 1 } }, effects: [] },
  // "Every facility in the Base with a Sui Operator assigned (excluding Assistants and Activity Rooms)": Dormitories are
  // facilities, as Elite Squad and 'Terra's Ark' count them with the same words.
  "Taraxacum|'The Best of Students!'": { effects: [counted('orderEfficiency', 0, 'base.facilitiesWithRoster:SUI', 0.04, { maxCount: 5 })] },
  'Underflow|Envoy To Land α': { effects: [e('orderEfficiency', 0.25), when('orderEfficiency', 0.05, baseHas('Ulpianus'))] },
  'Underflow|Envoy To Land β': { effects: [e('orderEfficiency', 0.3), when('orderEfficiency', 0.1, baseHas('Ulpianus'))] },
  'Mantra|Elite Squad': { effects: [counted('orderEfficiency', 0.25, 'base.facilitiesWithRoster:ELITE_OPERATOR', 0.02, { maxCount: 10 })] },
  'Hoederer|Starting From Scratch α': { effects: [e('orderEfficiency', 0.25), when('orderEfficiency', 0.05, baseHas('Ines'))] },
  'Hoederer|Starting From Scratch β': { effects: [e('orderEfficiency', 0.3), when('orderEfficiency', 0.05, baseHas('Ines')), when('orderEfficiency', 0.05, baseHas('W'))] },
  'Proviso|Contract Law': { effects: [], nonNumeric: true, note: 'Defines a Defaulted trade (under 4 Pure Gold) for Damages for Breach.' },
  'Proviso|Damages for Breach α': { effects: [], interaction: { trade: { defaultedGoldBonus: 1 } } },
  'Proviso|Damages for Breach β': { effects: [], interaction: { trade: { defaultedGoldBonus: 2 } } },
  'Tequila|Investment α': { effects: [e('selfMorale', -0.25)], interaction: { trade: { lmdBonusAbove3: 250 } } },
  'Tequila|Investment β': { effects: [e('selfMorale', -0.25)], interaction: { trade: { lmdBonusAbove3: 500 } } },
  'Pepe|Insightful': { effects: [], interaction: { trade: { order: 'pepe' } } },

  // Training Room.
  'Yu|Sharing the Joy': { effects: [counted('trainingSpeed', 0, 'resource:worldlyPlight', 0.01, { targets: ALL_CLASSES }), e('trainingMorale', 1, { targets: ALL_CLASSES })] },
  'Zuo Le|Think Before Acting': { effects: [when('trainingTimeFactor', 0, { type: 'all', of: [{ type: 'masteryLevel', value: 1 }, { type: 'instantTrainingReady' }] }, { targets: ['WARRIOR'] })], note: 'Consumes accumulated Martial Arts to finish a Guard M1 immediately when the counter is ready.' },
  'train_spd_reduceTime[000]': MENTAL_TRAINING, 'train_spd_reduceTime[001]': MENTAL_TRAINING,
  'Talulah|火旁新事': { effects: [when('trainingSpeed', 0.45, { type: 'traineeBranch', name: 'Primal Guard' }, { targets: ['WARRIOR'] }), when('trainingSpeed', 0.45, { type: 'traineeBranch', name: 'Primal Caster' }, { targets: ['CASTER'] })] },

  // Workshop.
  'Stainless|Heart to Heart': { effects: [counted('recipeMorale', 0, 'dorm.moraleBelow:12', -1, { step: 10, targets: ['F_EVOLVE'], when: { type: 'recipeCostIs', value: 4 } })] },
  'Catherine|Model Efficient Worker β': { effects: [e('byproductChance', 0.5, { targets: ANY_RECIPE }), when('byproductChance', 0.1, { type: 'inDormitory', name: 'Stainless' }, { targets: ANY_RECIPE })] },
  'Frost|Mechanical Engineering': { effects: [e('byproductChance', 0.5, { targets: ANY_RECIPE }), counted('byproductChance', 0, 'resource:intelligenceReserve', 0.05, { targets: ANY_RECIPE }), when('byproductChance', 0.15, atLeast('resource:ursusBeverage', 4), { targets: ANY_RECIPE })] },
  'Luo Xiaohei|Catform': { effects: [when('recipeMoraleFactor', 0.25, { type: 'recipeCostAtLeast', value: 4 }, { targets: ANY_RECIPE })] },
  'Nine-Colored Deer|Causality': { custom: { handler: 'causality', params: { threshold: 40, maxCost: 4 } }, effects: [] },
  'Nine-Colored Deer|Karma': { custom: { handler: 'karma', params: { threshold: 80, cost: 8 } }, effects: [] },
  'Thorns|"Explosion Arts"': { custom: { handler: 'explosionArts', params: { perFailures: 2 } }, effects: [] },
  'Blemishine|Careful Planning': { effects: [e('recipeLmdFree', 1, { targets: ['F_EVOLVE'] })] },
  'Homebound|Light at the Fingertips': { effects: [when('byproductChance', 0.9, { type: 'recipeFamily', name: 'chiral refractor' }, { targets: ['F_EVOLVE'] }), when('byproductChance', 0.9, { type: 'recipeFamily', name: 'rephasic enantiomer' }, { targets: ['F_EVOLVE'] })] },
  'Closure|Special Order': { effects: [e('orderEfficiency', 0.1)], interaction: { trade: { order: 'closure' } } },

  // ---------------------------------------------------------------- Factory
  'Makoto Yuki|The Meaning of Bonds': { effects: [counted('productivity', 0.2, 'base.roster:SEES', 0.05, { maxCount: 4 })] },
  'Viy|Artisan': { effects: [counted('productivity', 0, 'level.trainingRoom', 0.1, { cap: 0.3 })] },
  'Mechanist|I Slept Already': { custom: { handler: 'afterHours', params: { afterHours: 12, value: 0.1 } }, effects: [] },
  'Terra Research Commission|Trusty Buddies': { effects: [counted('productivity', 0.05, 'resource:felvine', 0.01), e('capacity', 8)] },
  'Fang|Hothead': { custom: ramp(0.2, 0.01, 0.25), effects: [] },
  'Kroos|Slowcoach': { custom: ramp(0.15, 0.02, 0.25), effects: [] },
  'Scene|Time-Lapse Photography': { custom: ramp(0.15, 0.02, 0.25), effects: [] },
  'Ceobe|Right Now': { custom: ramp(0.2, 0.01, 0.25), effects: [] },
  'Aroma|Routine Cleaning': { custom: ramp(0.02, 0.02, 0.2), effects: [] },
  'Click|Editing β': { effects: [e('capacity', 15, { product: EXP })] },
  'Scene|Editing α': { effects: [e('capacity', 12, { product: EXP })] },
  'Executor the Ex Foedere|Reasonable Utilization': { effects: [e('capacity', 4, { product: EXP })] },
  'Click|Vlog': { effects: [e('selfMorale', -0.25, { product: EXP })] },
  'Purestream|Renewable Energy': { effects: [counted('productivity', 0, 'base.tradingPosts', 0.2, { product: GOLD })], interaction: { exemptFromOverride: true }, note: 'Counts Trading Post facilities, staffed or not.' },
  'Thorns the Lodestar|Essence Transmutation Byproduct': { effects: [counted('productivity', 0, 'base.tradingPosts', 0.03, { product: GOLD })], interaction: { exemptFromOverride: true }, note: 'Counts Trading Post facilities, staffed or not.' },
  'Alanna|Master of Machines α': { effects: [counted('productivity', 0, 'base.robotsInPowerPlants', 0.05, { product: GOLD })], interaction: { exemptFromOverride: true } },
  'Alanna|Master of Machines β': { effects: [counted('productivity', 0, 'base.robotsInPowerPlants', 0.1, { product: GOLD })], interaction: { exemptFromOverride: true } },
  'Alanna|"Here to Help!"': { effects: [when('productivity', 0.15, roomHas('Warmy'), { product: GOLD })] },
  'Leto|Through Thick and Thin': { effects: [when('productivity', 0.35, { type: 'inTradingPost', name: 'Gummy' }, { product: EXP })] },
  "Miss.Christine|Fancy Feast's Reward": { effects: [when('productivity', 0.3, roomHas('Tragodia'), { product: EXP })] },
  'Bryophyta|Occupational Experience': { effects: [counted('productivity', 0, 'room.skillCategory:Metalwork', 0.05)] },
  'Mizuki|Consciousness Agreement': { effects: [counted('productivity', 0, 'room.skillCategory:Standardization', 0.05)] },
  'Dorothy|Applied Originium Arts Theory': { effects: [counted('productivity', 0, 'room.skillCategory:Rhine Tech', 0.05)] },
  "Astgenne the Lightchaser|Explorer's Backpack": { effects: [counted('capacity', 0, 'room.skillCategory:Rhine Tech', 5)] },
  'Highmore|Consciousness Compatibility': { effects: [], nonNumeric: true, interaction: { reclassifiesSkills: true } },
  'Almond|Big Responsibilities': { effects: [counted('productivity', 0, 'base.roster:BLACKSTEEL_WORLDWIDE', 0.02, { product: GOLD, maxCount: 3 }), counted('selfMorale', 0, 'base.roster:BLACKSTEEL_WORLDWIDE', -0.15, { maxCount: 3 })], note: 'Assistants and Activity Room users are not excluded; the planner has no such data.' },
  'Nasti|Costly Construction': { effects: [counted('productivity', 0, 'base.roster:RHINE_LAB', 0.03, { product: GOLD, maxCount: 5 })] },
  'Fang the Fire-Sharpened|Time of Reunion': { effects: [counted('productivity', 0, 'room.roster:A1_DETACHMENT', 0.1)] },
  'Narantuya|Union of Desert Bandits': { effects: [counted('productivity', 0, 'base.dormLevels', 0.01, { product: GOLD })], interaction: { exemptFromOverride: true } },
  'Snegurochka|Scientific Restructuring': { effects: [counted('capacity', 0, 'room.operators', 5)], interaction: { overridesOthers: true } },
  'Snegurochka|Workflow Optimization': { effects: [counted('productivity', 0, 'room.operators', 0.1), counted('capacity', 0, 'room.operators', 5)], interaction: { overridesOthers: true } },
  'Windflit|Automation α': { effects: [counted('productivity', 0, 'base.powerPlants', 0.05)], interaction: { overridesOthers: true } },
  'Eunectes|Automation α': { effects: [counted('productivity', 0, 'base.powerPlants', 0.05)], interaction: { overridesOthers: true } },
  'Passenger|Automation α': { effects: [counted('productivity', 0, 'base.powerPlants', 0.05)], interaction: { overridesOthers: true } },
  'Eunectes|Automation β': { effects: [counted('productivity', 0, 'base.powerPlants', 0.1)], interaction: { overridesOthers: true } },
  'Weedy|Automation β': { effects: [counted('productivity', 0, 'base.powerPlants', 0.1)], interaction: { overridesOthers: true } },
  'Weedy|Bionic Seadragon': { effects: [counted('productivity', 0, 'base.powerPlants', 0.15)], interaction: { overridesOthers: true } },
  'Bubble|Bigger is Better!': { custom: { handler: 'bubble', params: { perPointUpTo15: 0.01, perPointAbove: 0.03 } }, effects: [], note: 'Takes priority over Vermeil\'s Recycling in the same Factory.' },
  'Vermeil|Recycling': { custom: { handler: 'vermeil', params: { perPoint: 0.02 } }, effects: [], note: 'Contributes nothing while Bubble is in the same Factory.' },
  'Waai Fu|Cooperative Will': { custom: { handler: 'waaiFu', params: { perStep: 0.05, step: 0.05, cap: 0.4 } }, effects: [], note: 'Overridden by Gladiia\'s Group Hunting in the Control Center.' },
  'Waai Fu|Team Spirit': { effects: [], nonNumeric: true, interaction: { immuneToRoomMorale: true } },
  'Jieyun|Always on the Move': { effects: [counted('productivity', 0, 'resource:witchcraftCrystal', 0.01)] },
  'Jieyun|Of Death and Rebirth': { effects: [counted('productivity', 0, 'resource:witchcraftCrystal', 0.02)] },
  'Jieyun|Ancient Witchcraft': { effects: [e('resource', 0, { name: 'witchcraftCrystalFromWorldlyPlight' })] },
  'Minimalist|Machine Assistance α': { effects: [counted('productivity', 0, 'resource:engineeringRobots', 0.05, { step: 16 })] },
  'Minimalist|Machine Assistance β': { effects: [counted('productivity', 0, 'resource:engineeringRobots', 0.05, { step: 8 })] },
  'Minimalist|Graphic Design': { effects: [counted('resource', 0, 'base.facilityLevels', 1, { name: 'engineeringRobots', maxCount: 64 })] },
  'Fuze|Silent and Hardworking': { effects: [e('productivity', 0.2), counted('capacity', 0, 'resource:ursusBeverage', 2)] },
  'Marcille|Unexpectedly Delicious': { effects: [counted('productivity', 0, 'resource:monsterMeal', 0.01)] },
  'Rosmontis|Psychokinesis': { effects: [counted('productivity', 0, 'resource:chainOfThought', 0.01, { step: 2 })] },
  'Rosmontis|Manifestation of Consciousness': { effects: [counted('productivity', 0, 'resource:chainOfThought', 0.01)] },
  'Rosmontis|Extrasensory': { effects: [counted('resource', 0, 'base.dormOperators', 1, { name: 'perceptionInformation' }), e('resource', 0, { name: 'chainOfThoughtFromPerception' })] },
  'Shu|Where Stalks Grow Deep, Autumn Reaps': { effects: [counted('productivity', 0, 'resource:worldlyPlight', 0.01, { step: 3 })] },
  'Zima the Raging Tide|Friends Forever': { effects: [e('productivity', 0.3, { product: EXP }), when('productivity', 0.1, roomHasRoster('URSUS_STUDENT_SELF_GOVERNING_GROUP'), { product: EXP })] },
  'Totter|Blurry Vision': { custom: { handler: 'totterBlurryVision', params: { base: 0.3, stepPer4: 0.05 } }, effects: [] },
  'Totter|Blizzard Outside': { custom: { handler: 'totterBlizzardOutside', params: { threshold: 12, productivity: 0.1, capacity: 6 } }, effects: [] },

  // ---------------------------------------------------------------- Power Plant
  'GALLUS²|Clucktivation Mechanism': { effects: [when('droneRate', 0.05, atLeast('powerPlants.rosterOthers:OPERATION_PLATFORM', 1))] },
  'Aegis|Mechanical Engineering': { effects: [e('droneRate', 0.15), when('droneRate', 0.05, { type: 'inFactory', name: 'Makoto Yuki' })] },
  'CONFESS-47|Now Under Maintenance': { effects: [when('droneRate', 0.05, atLeast('powerPlants.rosterOthers:LATERANO', 1))] },
  'Friston-3|"Pleasant Conversation"': { effects: [when('droneRate', 0.05, ccHas("Kal'tsit"))] },
  'Justice Knight|"Beep beep, activate!"': { effects: [e('factoryOfOperator', 0.05, { name: 'Wild Mane' })] },
  'PhonoR-0|Incantation Resonance': { effects: [when('droneRate', 0.05, { type: 'trainerIs', name: 'Logos' })] },
  'THRM-EX|Enthusiasm': { effects: [e('selfMorale', -0.52)] },
  'Greyy the Lightningbearer|Line Patrol Frame': { effects: [counted('droneRate', 0, 'base.maxDroneCapacity', 0.001, { cap: 0.25 })], note: '235 drones of capacity are 23.5%, not 23%: the game does not round the count down to tens.' },
  'Greyy the Lightningbearer|Dawnlight': { effects: [when('powerPlantCount', 1, { type: 'countAtMost', count: 'otherPowerPlants.roster:OPERATION_PLATFORM', value: 0 })] },
  'Muelsyse|Ecological Section Director': { effects: [counted('droneRate', 0.1, 'base.rosterOthers:RHINE_LAB', 0.03, { maxCount: 5 })] },
  'Philae|River Resonance': { effects: [counted('droneRate', 0, 'base.dormLevels', 0.005)] },
  'Spuria|Technology Exchange α': { custom: ramp(0.1, 0.01, 0.15), effects: [] },
  'Spuria|Technology Exchange β': { custom: ramp(0.15, 0.01, 0.2), effects: [] },
  'Spuria|Take-Away Fruit Tarts': { effects: [e('selfMorale', -0.3)] },

  // ---------------------------------------------------------------- Reception Room
  'Rhodes Island Recon|Stealth Expert': { effects: [when('clueSpeed', 0.1, ccHas('Violet Mizutsune Orchid'))], note: 'Also favours missing clues.' },
  'Angelina the Mellow Wish|My Own Wish': { effects: [when('clueSpeed', 0.5, alone), when('selfMorale', 2, alone)] },
  "Koromaru|Koromaru's Gratitude": { effects: [when('clueSpeed', 0.3, clueExchange)] },
  'Caper|Innocent Smile': { effects: [when('clueSpeed', 0.3, clueExchange)] },
  'Cairn|Special Methods Consultant': { effects: [when('clueSpeed', 0.3, clueExchange)] },
  'Harmonie|Double Agent': { effects: [when('clueSpeed', 0.5, alone), when('selfMorale', 2, alone)] },
  'Kazemaru|Proficient Artistry': { effects: [when('clueSpeed', 0.35, alone)] },
  'Odda|"Professional Ethics" α': PROFESSIONAL_ETHICS(0.15), "Ho'olheyak|\"Professional Ethics\" α": PROFESSIONAL_ETHICS(0.15),
  'Odda|"Professional Ethics" β': PROFESSIONAL_ETHICS(0.35), "Ho'olheyak|\"Professional Ethics\" β": PROFESSIONAL_ETHICS(0.35),
  'Surfer|Networking Expert': { effects: [e('clueSpeed', 0.1), when('clueSpeed', 0.15, roomHasRoster('BLACKSTEEL_WORLDWIDE')), when('selfMorale', 0.5, roomHasRoster('BLACKSTEEL_WORLDWIDE'))] },
  'Surfer|Information Gathering': { effects: [e('clueSpeed', 0.1), when('clueSpeed', 0.2, roomHasRoster('BLACKSTEEL_WORLDWIDE'))] },
  'Valarqvin|Foresight': { effects: [e('clueSpeed', 0.1), when('clueSpeed', 0.15, roomHas('Typhon')), when('selfMorale', 0.5, roomHas('Typhon'))] },
  'Valarqvin|Pilgrimage to the Future': { effects: [e('clueSpeed', 0.1), when('clueSpeed', 0.15, roomHas('Typhon')), when('selfMorale', 0.5, roomHas('Typhon'))], note: 'Also shifts which clues are likely to turn up, which is not a speed number -- only the search-speed half is modeled.' },
  'Typhon|Icefield Navigation': { effects: [e('clueSpeed', 0.1), when('clueSpeed', 0.05, roomHasRoster('SAMI')), when('selfMorale', 0.5, roomHasRoster('SAMI'))] },
  "Vulpisfoglia|Assassin's Holiday": { effects: [when('clueSpeed', 0.3, roomHas('Suzuran'))] },
  'Sankta Miksaparato|Eternal Youth': { effects: [when('clueSpeed', 0.1, { type: 'inDormitory', name: 'Fiammetta' })] },
  'Windscoot|Making Friends': { effects: [counted('clueSpeed', 0, 'office.extraSlots', 0.05)] },
  'Iana|Intel Expert': { effects: [counted('clueSpeed', 0.05, 'resource:intelligenceReserve', 0.05)] },
  "Ch'en the Dawnstreak|Chivalrous Hero": { effects: [counted('clueSpeed', 0.2, 'resource:worldlyPlight', 0.01, { step: 10 })] },
  'Laios|Gourmand': { effects: [counted('clueSpeed', 0, 'resource:monsterMeal', 0.02)] },
  'Ines|Shadow Gathering': { custom: ramp(0.2, 0.02, 0.3), effects: [] },
  'Ripresa|Professional Manager α': { effects: [when('clueSpeed', 0.15, alone), when('selfMorale', 1, alone)] },
  'Ripresa|Professional Manager β': { effects: [when('clueSpeed', 0.35, alone), when('selfMorale', 1, alone)] },

  // ---------------------------------------------------------------- Office
  "Kal'tsit Esperanta|'Terra's Ark'": { effects: [counted('hrSpeed', 0.3, 'base.facilitiesWithRoster:ELITE_OPERATOR', 0.04, { maxCount: 5 })] },
  'Blitz|Linguistics': { effects: [counted('hrSpeed', 0.2, 'resource:intelligenceReserve', 0.05), counted('hrSpeed', 0, 'resource:ursusBeverage', 0.05)] },
  'Tin Man|Maylander Detective α': { effects: [counted('hrSpeed', 0.05, 'base.dormLevels', 0.01)] },
  'Tin Man|Maylander Detective β': { effects: [counted('hrSpeed', 0.05, 'base.dormLevels', 0.02)] },
  'Lin|Meritocracy': { effects: [counted('hrSpeed', 0, 'office.extraSlots', 0.1)] },
  'Qanipalaat|Rescue Team - Preserve Strength': { effects: [e('hrSpeed', 0.35), counted('selfMorale', 0, 'office.extraSlots', -0.1)] },
  'Insider|Networking': { effects: [e('hrSpeed', 0.3), counted('ccReceptionClueSpeed', 0, 'office.extraSlots', 0.05)] },
  'Mr. Nothing|Nosy': { effects: [e('hrSpeed', 0.35), counted('ccReceptionClueSpeed', 0, 'office.extraSlots', 0.05)] },
  "Tsukinogi|Empath's Insight": { effects: [e('hrSpeed', 0.35), counted('ccReceptionClueSpeed', 0, 'office.extraSlots', 0.05)] },
  "Ukusik|'Extra, Extra!'": { effects: [e('hrSpeed', 0.3), counted('ccReceptionClueSpeed', 0, 'office.extraSlots', 0.05)] },
  'Ukusik|Law of the Streets': { effects: [e('hrSpeed', 0.35), counted('ccReceptionClueSpeed', 0, 'office.extraSlots', 0.05)] },
  'Pramanix the Prerita|Yearning for the Snow Realm': { effects: [e('hrSpeed', 0.35), e('selfMorale', -0.25), when('hrSpeed', 0.1, ccHas('SilverAsh the Reignfrost'))] },
  "Bassline|Drawing the Heart's Voice": { effects: [counted('resource', 0, 'office.extraSlots', 15, { name: 'soundlessResonance' })] },
  'Mulberry|Rescue Team - Post-Catastrophe Census': { effects: [counted('resource', 0, 'office.extraSlots', 10, { name: 'worldlyPlight' })] },
  'Whisperain|Itinerant': { effects: [e('hrSpeed', 0.2), counted('resource', 0, 'office.extraSlots', 10, { name: 'memoryFragments' })] },
  'Whisperain|Memory Seeker': { effects: [e('resource', 0, { name: 'perceptionFromMemoryFragments' })], note: 'Wipes Memory Fragments and Perception Information when her Morale runs out; the steady-state planner does not model the reset.' },

  // ---------------------------------------------------------------- Dormitory
  'Rhodes Island Recon|Hunting Helper': { effects: [e('recoverySingle', 0.55), when('recoverySingle', 0.45, { type: 'targetInRoster', roster: 'SOUBO_ADVENTURERS' }), when('recoverySingle', 0.45, { type: 'targetInRoster', roster: 'BUBBLE_KINGDOM_HUNTERS' })] },
  'Bobbing|Conversationalist': { effects: [counted('recoveryAll', 0.2, 'room.belowFullMorale', 0.01)] },
  'Cairn|Bucket List': { effects: [counted('recoveryAll', 0.15, 'level.room', 0.02)] },
  'Penance|Fellow Travelers': { effects: [counted('recoveryAll', 0.15, 'office.extraSlots', 0.05)] },
  'Entelechia|Flawless Heart α': { effects: [counted('recoveryAll', 0.1, 'office.extraSlots', 0.05)] },
  'Entelechia|Flawless Heart β': { effects: [counted('recoveryAll', 0.1, 'office.extraSlots', 0.1)] },
  'Perfumer the Distilled|Pure Breath': { effects: [when('recoveryAll', 0.1, { type: 'recipientMoraleBelow', value: 20 })] },
  'Vendela|Aroma Convalescence β': { effects: [e('recoveryAll', 0.15), when('recoveryAll', 0.1, { type: 'recipientMoraleBelow', value: 18 })] },
  'Senshi|Veteran Cook': { effects: [e('recoveryAll', 0.15)], interaction: { recipientBonus: { roster: 'LAIOS_PARTY', amount: 0.15 } } },
  'Eyjafjalla the Hvít Aska|Volcanic Hot Springs Bath': { effects: [counted('recoveryAll', 0, 'base.roster:WANDERING_MEDIC', 0.06, { maxCount: 4 })] },
  "Yu|I'll Cook Your Favorite": { effects: [counted('recoveryAll', 0, 'base.roster:SUI', 0.06, { maxCount: 4 })] },
  'Lumen|Glimmering Glow α': { effects: [counted('recoveryAll', 0.1, 'base.powerPlants', 0.05)] },
  'Lumen|Glimmering Glow β': { effects: [counted('recoveryAll', 0.15, 'base.powerPlants', 0.05)] },
  'Virtuosa|Soundless Resonance': { effects: [counted('resource', 0, 'room.operators', 1, { name: 'soundlessResonance' })] },
  'Virtuosa|Wordless Anthem': { effects: [counted('recoveryAll', 0.2, 'resource:soundlessResonance', 0.01, { step: 5 })] },
  'Morgan|No.1 Practice Partner': { effects: [], nonNumeric: true, interaction: { providerBonus: { provider: 'Siege', roster: 'GLASGOW', amount: 0.3 } } },
  'Fiammetta|Self-Discipline': { effects: [e('recoveryExclusive', 2)] },
  'Fiammetta|Communal Suffering': { effects: [], nonNumeric: true, note: 'Swaps Morale with the previous occupant at full Morale: a one-off exchange, not a rate.' },
  "Indigo|Poisoner's Friend": { effects: [e('recoverySingle', 0.55), when('recoverySingle', 0.45, { type: 'targetIs', name: 'Blue Poison' })] },
  'Czerny|Adagio': { effects: [e('recoverySingle', 0.65), counted('resource', 0, 'level.room', 1, { name: 'measure' })] },
  'Czerny|Walking the Keyboard': { effects: [e('resource', 0, { name: 'perceptionFromMeasure' })] },
  'Iris|Bedtime Story': { effects: [e('recoveryAll', 0.1), counted('resource', 0, 'level.room', 1, { name: 'dreamland' })] },
  'Iris|Sleep Talking': { effects: [e('resource', 0, { name: 'perceptionFromDreamland' })] },
  "Senshi|Senshi's Diner": { effects: [counted('resource', 0, 'level.room', 1, { name: 'monsterMeal' })] },
  'Santalla|Born of the Biting Cold': { effects: [e('recoverySingle', 0.55), when('recoverySingle', 0.45, { type: 'targetInRoster', roster: 'SAMI' })] },
  'Tomimi|Barbecue Master': { effects: [e('recoverySingle', 0.55), when('recoverySingle', 0.45, { type: 'targetIs', name: 'Gavial' })], interaction: { preferredTarget: 'Gavial' } },
  'Schwarz|Make Tea': { effects: [e('recoverySingle', 0.55), when('recoverySingle', 0.45, { type: 'targetIs', name: 'Ceylon' })], interaction: { preferredTarget: 'Ceylon' } },
  'Exusiai the New Covenant|Funny Holy City Stories': { effects: [e('recoverySingle', 0.55), when('recoverySingle', 0.45, { type: 'targetInRoster', roster: 'LATERANO' })] },
  'Coldshot|Wet Your Whistles': { effects: [e('recoveryDistributed', 0.8)] },
  'Akkord|Fugue Amalgamation': { effects: [counted('recoverySelf', 0.7, 'room.others', 0.05)] },
  'Arene|Searching for Solitude': { effects: [counted('recoverySelf', 0.7, 'room.others', 0.05)] },

  // ---------------------------------------------------------------- Control Center
  "Zima the Raging Tide|'Got It, Boss!'": { effects: [e('selfMorale', 0.5), counted('ccClueSpeed', 0, 'reception.roster:URSUS_STUDENT_SELF_GOVERNING_GROUP', 0.1)] },
  'Violet Mizutsune Orchid|Office Person of the Year': { effects: [e('ccHrSpeed', 0.1)] },
  'Makoto Yuki|Leadership Charisma': { effects: [e('ccFactoryProductivity', 0.02)] },
  'Blitz|Team Rainbow': { effects: [faction('cc.roster:TEAM_RAINBOW', 0.05)] }, 'Frost|Team Rainbow': { effects: [faction('cc.roster:TEAM_RAINBOW', 0.05)] },
  'Tachanka|Team Rainbow': { effects: [faction('cc.roster:TEAM_RAINBOW', 0.05)] }, 'Ash|Team Rainbow': { effects: [faction('cc.roster:TEAM_RAINBOW', 0.05)] },
  'Tachanka|Ursus Specialty Beverage': { effects: [counted('resource', 0, 'cc.roster:URSUS_STUDENT_SELF_GOVERNING_GROUP', 1, { name: 'ursusBeverage' })] },
  'Hibiscus the Purifier|Alternate Operator': { effects: [faction('cc.roster:ALTERNATE_OPERATOR', 0.05)] },
  'Kroos the Keen Glint|Alternate Operator': { effects: [faction('cc.roster:ALTERNATE_OPERATOR', 0.05)] },
  'Lava the Purgatory|Alternate Operator': { effects: [faction('cc.roster:ALTERNATE_OPERATOR', 0.05)] },
  "Ch'en|Integrity & Capability": { effects: [faction('cc.roster:LUNGMEN_GUARD_DEPARTMENT', 0.05)] },
  'Rosa|Student Council President': { effects: [faction('cc.roster:URSUS_STUDENT_SELF_GOVERNING_GROUP', 0.05)] },
  'Hung|Adamantly Easygoing': { effects: [faction("cc.faction:Lee's Detective Agency", 0.2)], note: 'The extra recovery for Lee\'s Detective Agency operators themselves is not modelled.' },
  'Gnosis|Hidden Mastermind': { effects: [faction('cc.roster:KARLAN_TRADE', 0.05)] },
  'Gnosis|Precise Calculations': { effects: [counted('perTradingPostOrderEfficiency', 0, 'tp.roster:KARLAN_TRADE', -0.15), counted('perTradingPostOrderLimit', 0, 'tp.roster:KARLAN_TRADE', 6)] },
  'Ascalon|S.W.E.E.P. Supervisor': { effects: [e('ccTrainingSpeed', 0.05)] },
  'Blaze the Igniting Spark|Best of Buds': { effects: [e('ccTrainingSpeed', 0.05)] },
  'Hoshiguma the Breacher|Downtown Connections': { effects: [e('ccTrainingSpeed', 0.05)] },
  'Pudding|Overclock': { effects: [when('ccFactoryProductivity', 0.02, atLeast('base.robotsInPowerPlants', 2))] },
  'Hoshiguma the Breacher|Camaraderie': { effects: [when('ccFactoryProductivity', 0.03, atLeast('cc.roster:LUNGMEN_GUARD_DEPARTMENT', 1))] },
  'Kirin R Yato|Leading By Example': { effects: [when('ccFactoryProductivity', 0.02, atLeast('cc.roster:SOUBO_ADVENTURERS', 2))] },
  'Rathalos S Noir Corne|Esoteric Negotiations': { effects: [when('ccOrderEfficiency', 0.07, atLeast('cc.roster:SOUBO_ADVENTURERS', 2))] },
  'Wang|Expedience': { effects: [when('ccOrderEfficiency', 0.07, { type: 'influenceAtLeastTerritory' }), when('ccFactoryProductivity', 0.02, { type: 'territoryAboveInfluence' })] },
  'Varkáris|Pride of a Hero α': { effects: [counted('ccClueSpeed', 0, 'base.roster:MINOS', 0.04, { cap: 0.2 }), when('selfMorale', 0.02, atLeast('cc.rosterOthers:SARGON', 1))] },
  'Varkáris|Pride of a Hero β': { effects: [counted('ccClueSpeed', 0, 'base.roster:MINOS', 0.05, { cap: 0.25 }), when('selfMorale', 0.02, atLeast('cc.rosterOthers:SARGON', 1))] },
  "Civilight Eterna|King's Legacy": { effects: [when('ccMorale', 0.05, ccHas('Amiya'))] },
  'Civilight Eterna|"Unfinished Story"': { effects: [when('ccMorale', 0.1, ccHas('Amiya'))] },
  'Civilight Eterna|Convergence of Hope': { effects: [e('ccClueSpeed', 0.15)] },
  'Lee|Moment of Respite': { effects: [when('ccMorale', 0.25, ccHas('Aak'))] },
  'Leizi|Picky': { effects: [e('ccMorale', -0.5)], note: 'Also favours clues of the Reception Room\'s factions.' },
  'Aak|Neuroticism': { effects: [e('ccMorale', -1.5)], note: 'Also favours clues of the Reception Room\'s factions.' },
  'Ela|Resister': { effects: [e('targetMorale', 0.25, { name: '*others' })], note: 'Also favours clues not on the board.' },
  'Kestrel|War Tattoos': { effects: [e('ccDormRecovery', 0.05)] },
  'Raidian|Quiet Affection': { effects: [e('ccDormEliteRecovery', 0.1)] },
  'Misumi Uika|Resonant Bond': { effects: [e('ccDormRecovery', 0.05), when('targetMorale', 0.1, ccHas('Togawa Sakiko'), { name: 'Togawa Sakiko' })] },
  'Yūtenji Nyamu|Exitus Acta Probat': { effects: [when('targetMorale', 0.05, ccHas('Togawa Sakiko'), { name: 'Togawa Sakiko', suppressedBy: { key: 'Misumi Uika|Resonant Bond' } }), e('ccClueSpeed', 0.05)] },
  'Nymph|Wandering Heart': { effects: [e('ccDormRecovery', 0.05)] },
  'Reed the Flame Shadow|Leader': { effects: [e('ccDormRecovery', 0.05)] },
  'Delphine|Master Strategist': { effects: [counted('perTradingPostOrderEfficiency', 0, 'tp.roster:GLASGOW', 0.1)] },
  'SilverAsh the Reignfrost|Land of Business': { effects: [when('perTradingPostOrderEfficiency', 0.1, atLeast('tp.faction:Kjerag', 3))] },
  'Yahata Umiri|Famiglia Approval': { effects: [counted('perTradingPostOrderEfficiency', 0, 'tp.faction:Siracusa', 0.05)] },
  'Flametail|Knights of Pinus Sylvestris': { effects: [counted('perFactoryProductivity', 0, 'factory.roster:PINUS_SYLVESTRIS', 0.1, { product: EXP }), counted('perFactoryProductivity', 0, 'factory.roster:PINUS_SYLVESTRIS', -0.1, { product: GOLD })] },
  'Jessica the Liberated|Reunion of Old Friends': { effects: [e('selfMorale', 0.5), counted('perFactoryProductivity', 0, 'factory.roster:BLACKSTEEL_WORLDWIDE', 0.05)] },
  "Wiš'adel|Conspirator α": { effects: [when('ccReceptionClueSpeed', 0.05, { type: 'inReceptionRoom', name: 'Ines' }), e('perTradingPostOrderLimit', 1, { name: 'Hoederer' })] },
  "Wiš'adel|Conspirator β": { effects: [when('ccReceptionClueSpeed', 0.05, { type: 'inReceptionRoom', name: 'Ines' }), e('perTradingPostOrderLimit', 2, { name: 'Hoederer' })] },
  "Wiš'adel|Banner of Babel": { effects: [e('ccOtherRoomsRecovery', 0.1), when('ccOtherRoomsRecovery', 0.1, ccHas('Civilight Eterna'))], note: 'Recovers Morale for operators in every other building; the strongest of Banner of Babel, Solitary Light and Business Is Business applies.' },
  'Chongyue|Solitary Light': { effects: [counted('ccOtherRoomsRecovery', 0.05, 'resource:worldlyPlight', 0.05, { step: 20 })], note: 'Recovers Morale for operators in every other building; the strongest of Banner of Babel, Solitary Light and Business Is Business applies.' },
  'Młynar|Business Is Business': { custom: { handler: 'mlynar', params: { ownRooms: 0.1, perControlCenterSkill: 0.05 } }, effects: [], note: 'Power Plants, Office and Reception Room recover +0.1, every building +0.05 per qualifying Control Center skill; competes with Banner of Babel and Solitary Light.' },
  'Saileach|Infectivity': { effects: [when('ccHrSpeed', 0.2, { type: 'officeHrBelow', value: 30 })] },
  "Misumi Uika|Idol's Aura": { effects: [counted('resource', 0, 'base.dormOperators', 1, { name: 'passion' })] },
  'Yahata Umiri|Reliable Companion': { effects: [e('resource', 10, { name: 'passion' }), e('ccHrSpeed', 0.1)] },
  'Yūtenji Nyamu|Diligent Worker': { effects: [e('resource', 10, { name: 'passion' }), e('ccClueSpeed', 0.05)] },
  'Wakaba Mutsumi|Monster of Acting': { effects: [e('resource', 20, { name: 'passion' }), counted('selfMorale', 0, 'resource:passion', 0.01, { step: 8, suppressedBy: { key: 'Wakaba Mutsumi|Halves of a Whole', when: ccHas('Togawa Sakiko') } }), counted('ccOrderEfficiency', 0, 'resource:passion', 0.01, { step: 8 })] },
  'Wakaba Mutsumi|Halves of a Whole': { effects: [], nonNumeric: true, note: 'With Togawa Sakiko in the Control Center, Monster of Acting costs her no Morale.' },
  'control_prod_bd_spd[000]': { effects: [counted('ccPreciousMetalProductivity', 0.005, 'resource:passion', 0.005, { step: 20 })] },
  'control_prod_bd_spd[010]': { effects: [counted('ccPreciousMetalProductivity', 0.01, 'resource:passion', 0.01, { step: 20 })] },
  'Togawa Sakiko|Indomitable Lady': { effects: [when('selfMorale', 0.05, atLeast('resource:passion', 40))] },
  'Ling|Keep the Wine Flowing': { effects: [], nonNumeric: true, interaction: { cancelsSuiSelfDrain: true } },
  'Ling|"Vast Mountains and Rivers"': { custom: { handler: 'moraleGated', params: { above12WorldlyPlight: 15, below12PerceptionInformation: 10 } }, effects: [] },
  'Gladiia|Tide Observation': { custom: { handler: 'tideObservation', params: { drainPerWorker: 0.5, recoveryPerResting: 0.5, recoveryPerFull: 0.5 } }, effects: [] },
  'Gladiia|Group Hunting α': { effects: [e('ccMorale', 0.05)], custom: { handler: 'abyssalGroupHunting', params: { amount: 0.05, cap: 0.45 } } },
  'Gladiia|Group Hunting β': { effects: [e('ccMorale', 0.05)], custom: { handler: 'abyssalGroupHunting', params: { amount: 0.1, cap: 0.9 } } },
  'Viviana|Marigold Poetry Gathering': { effects: [e('ccMorale', 0.05)] },
  "Viviana|The Candle Knight's Glimmer": { effects: [counted('perFactoryProductivity', 0, 'factory.roster:KNIGHTS', 0.07)] },
  "Eunectes|I've Got This": { effects: [when('powerPlantCount', 2, { type: 'inPowerPlant', name: 'Lancet-2' })] },
  'Chongyue|I am I': { effects: [e('selfMorale', 0.5), counted('resource', 0, 'base.workersOfRoster:SUI', 5, { name: 'worldlyPlight', maxCount: 5 })] },
  'Dusk|"Unstirred by Gain"': { effects: [e('ccMorale', 0.05)], custom: { handler: 'moraleGated', params: { below12WorldlyPlight: 15 } } },
  'Dusk|"Unmoved by Loss"': { effects: [e('selfMorale', -0.5)], custom: { handler: 'moraleGated', params: { above12PerceptionInformation: 10 } } },
  'Ash|Intelligence Reserve': { effects: [counted('resource', 0, 'cc.roster:TEAM_RAINBOW', 1, { name: 'intelligenceReserve' })] },
  'Rathalos S Noir Corne|Teamwork': { effects: [counted('resource', 0, 'cc.roster:SOUBO_ADVENTURERS', 2, { name: 'felvine' })] },
  'Kirin R Yato|Endurance Recovery': { effects: [e('selfMorale', 0.5), e('resource', 8, { name: 'felvine' })] },
};
