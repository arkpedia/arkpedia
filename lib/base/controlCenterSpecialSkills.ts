import { ResourcePools } from './baseResources';
import type { BaseRosters } from './baseGroupRosters';

export interface ControlCenterContext {
  /** The group rosters (lib/base/baseGroupRosters.ts), from the page's props. */
  rosters: BaseRosters;
  manualValue?: number;
  ccOperatorNames: string[]; // includes self
  // BUILT counts from the player's own layout, for Wang's Expedience --
  // Territory is Factories, Influence is Power Plants + Trading Posts.
  tradingPostCount: number;
  factoryCount: number;
  powerPlantCount: number;
  operatorFaction: (name: string) => string | null;
  // Per-Trading-Post data, needed for skills that scale off THAT
  // specific Trading Post's faction composition (not a highest-only
  // global bonus like the generic Order Efficiency pattern).
  tradingPostFactionCounts: { facilityId: string; operatorNames: string[] }[];
  // Cross-facility presence checks.
  reineInReceptionRoom: (name: string) => boolean;
  operatorInAnyTradingPost: (name: string) => { facilityId: string } | null;
  blacksteelWorldwideCountInFactories: number;
  blacksteelWorldwideFactoryCounts: { factoryId: string; count: number }[]; // per-Factory breakdown, for Jessica the Liberated's Reunion of Old Friends -- her bonus only applies to Factories that actually contain a Blacksteel Worldwide operator, not uniformly to every Factory in the base
  pinusSylvestrisFactoryAssignments: { factoryId: string; product: 'Battle Records' | 'Precious Metals' | null }[];
  abyssalHunterFactoryCounts: { factoryId: string; count: number }[]; // for Gladiia's Special Bonus -- +5%/+10% (Base/Elite 2) per Abyssal Hunter, per specific Factory, ADDITIONALLY scaled by the base-wide AH total (confirmed by the user's own worked examples: 2 AH together in one Factory with a 3rd elsewhere = 2 x 3 x 10%, not just 2 x 10%)
  abyssalHunterTotalInFactories: number; // base-wide AH count across every Factory, used as the second multiplier above
  // Every Factory containing at least one KNIGHTS-roster operator, for
  // Viviana's Control Center skill. Her skill boosts Knight Operators
  // individually ("all Knight Operators... gain productivity +7%"), so a
  // Factory gains 7% per Knight standing in it -- two Knights is +14%,
  // three is +21%. Factory productivity is additive across the operators
  // in the room, so a per-operator bonus lands as a room-level sum;
  // `totalFilled` is carried for display only and must NOT be used to
  // pro-rate the bonus (doing that capped her at a flat +7% whenever
  // every slot happened to be a Knight, which is the bug this fixes).
  factoriesWithKnight: { facilityId: string; knightCount: number; totalFilled: number }[];
  powerPlantOperatorCount: number;
  robotPowerPlantCount: number; // specifically Operation Platform robots in Power Plants, distinct from powerPlantOperatorCount which counts any operator
  officeHrSpeedPercent: number; // Office's CURRENT total HR speed (as a %), needed for Saileach's conditional
  civilightEternaInCC: boolean;
  resourcePools: ResourcePools;
  resourceBonuses: Record<string, number>;
  activeSkillKeys: Set<string>; // "OperatorName|SkillName" for every base skill currently active, base-wide
  abyssalHuntersInNonDormFacilities: number; // Gladiia's Tide Observation: count working elsewhere, increases her drain
  abyssalHuntersRestingAtFullMorale?: number;
  abyssalHuntersRestingInDormitories: number; // Gladiia's Tide Observation: count resting, increases her recovery (assumed full Morale under this simulator's steady-state snapshot, matching the convention used elsewhere)
  eliteLevel: string | null; // needed for skills whose name is identical across elite levels (e.g. Togawa Sakiko's "Plentiful Work Experience"), where the handler key alone can't distinguish which tier is active
  allPlacedNames: string[]; // every operator placed anywhere in the base, for roster-membership counts (e.g. Varkáris's Minos count)
}

export interface ControlCenterSkillResult {
  ccMoraleBonus?: number; // adds to Control Center's own morale relief, stacks
  tradingPostBonusCandidate?: number; // competes for the shared highest-only Trading Post pool
  factoryBonusCandidate?: number; // competes for the shared highest-only Factory pool
  clueCollectionBonusCandidate?: number; // competes for the shared highest-only Clue pool
  dormitoryMoraleRelief?: number; // ONLY affects Dormitories, not every other facility -- "all Operators" type, highest-only among this type
  dormitoryEliteOperatorsRelief?: number; // separate "all Elite Operators" type (Raidian) -- highest-only among this type specifically, doesn't compete with the above
  officeHrSpeedBonus?: number; // cross-facility: adds to Office's HR speed
  factoryPreciousMetalBonusFromCC?: number; // cross-facility: adds to every Factory's Precious-Metal-specific productivity (Togawa Sakiko)
  receptionRoomClueSpeedFromCC?: number; // cross-facility, ADDITIVE (not highest-only) -- adds to Reception Room's Clue Speed (Wiš'adel's Conspirator α/β, whose skill text has no "strongest effect" wording)
  perTradingPostOrderEfficiency?: { facilityId: string; amount: number }[]; // additive, NOT highest-only, applied per specific Trading Post
  perTradingPostOrderLimit?: { facilityId: string; amount: number }[]; // genuinely a different stat from order efficiency -- max held orders, not generation speed
  perFactoryProductivity?: { facilityId: string; amount: number }[]; // targets a SPECIFIC named Factory directly (e.g. Flametail's per-Pinus-Sylvestris-operator's-own-Factory bonus/penalty), not the shared highest-only pool
  trainingSpeedBonus?: number; // highest-only Training Room Specialization speed bonus (Ascalon/Blaze the Igniting Spark/Hoshiguma the Breacher)
  felvine?: number; // Control Center resource generation (Rathalos/Yato)
  ursusSpecialtyBeverage?: number; // Control Center resource generation (Tachanka)
  selfMorale?: number; // Morale consumed per hour, THIS operator only -- not applied room-wide, same pattern as Reception Room's selfMorale
  targetedMoraleEffect?: { targetName: string; amount: number }; // Morale consumed per hour for a SPECIFIC named co-worker, not the handler owner's own (e.g. Misumi Uika/Yūtenji Nyamu's effects on Togawa Sakiko specifically)
  targetedMoraleEffects?: { targetName: string; amount: number }[]; // same idea but for multiple simultaneous targets (e.g. Ela's "every OTHER operator in CC" -- excludes herself, hits everyone else individually)
  note?: string;
}

type Handler = (ctx: ControlCenterContext) => ControlCenterSkillResult;

/** Keyed by "OperatorName|SkillName". Everyone NOT in here with a plain
 * "+0.05 Morale of all Operators in the Control Center" or "all Trading
 * Posts'/Factories' ...' +X%" wording is already handled correctly by
 * the generic regex parser in calcControlCenterEffects. */
export const CONTROL_CENTER_SPECIAL_SKILLS: Record<string, Handler> = {
  'Violet Mizutsune Orchid|Office Person of the Year': () => ({ officeHrSpeedBonus: 0.1 }),
  'Makoto Yuki|Leadership Charisma': () => ({ factoryBonusCandidate: 0.02 }),
  // Per-faction-count-in-CC morale bonuses -- these read "each Operator
  // from [faction] increases Morale... by +0.05/hr", which is NOT a flat
  // +0.05 -- it scales with how many of that faction are in CC.
  'Blitz|Team Rainbow': (ctx) => ({ ccMoraleBonus: 0.05 * ctx.ccOperatorNames.filter((n) => ctx.rosters.TEAM_RAINBOW.has(n)).length }),
  'Frost|Team Rainbow': (ctx) => ({ ccMoraleBonus: 0.05 * ctx.ccOperatorNames.filter((n) => ctx.rosters.TEAM_RAINBOW.has(n)).length }),
  'Tachanka|Team Rainbow': (ctx) => ({ ccMoraleBonus: 0.05 * ctx.ccOperatorNames.filter((n) => ctx.rosters.TEAM_RAINBOW.has(n)).length }),
  'Ash|Team Rainbow': (ctx) => ({ ccMoraleBonus: 0.05 * ctx.ccOperatorNames.filter((n) => ctx.rosters.TEAM_RAINBOW.has(n)).length }),
  'Tachanka|Ursus Specialty Beverage': (ctx) => ({
    ursusSpecialtyBeverage: ctx.ccOperatorNames.filter((n) => ctx.rosters.URSUS_STUDENT_SELF_GOVERNING_GROUP.has(n)).length,
  }),
  'Hibiscus the Purifier|Alternate Operator': (ctx) => ({ ccMoraleBonus: 0.05 * ctx.ccOperatorNames.filter((n) => ctx.rosters.ALTERNATE_OPERATOR.has(n)).length }),
  'Kroos the Keen Glint|Alternate Operator': (ctx) => ({ ccMoraleBonus: 0.05 * ctx.ccOperatorNames.filter((n) => ctx.rosters.ALTERNATE_OPERATOR.has(n)).length }),
  'Lava the Purgatory|Alternate Operator': (ctx) => ({ ccMoraleBonus: 0.05 * ctx.ccOperatorNames.filter((n) => ctx.rosters.ALTERNATE_OPERATOR.has(n)).length }),
  "Ch'en|Integrity & Capability": (ctx) => ({ ccMoraleBonus: 0.05 * ctx.ccOperatorNames.filter((n) => ctx.rosters.LUNGMEN_GUARD_DEPARTMENT.has(n)).length }),
  'Rosa|Student Council President': (ctx) => ({ ccMoraleBonus: 0.05 * ctx.ccOperatorNames.filter((n) => ctx.rosters.URSUS_STUDENT_SELF_GOVERNING_GROUP.has(n)).length }),
  "Hung|Adamantly Easygoing": (ctx) => ({
    ccMoraleBonus: 0.2 * ctx.ccOperatorNames.filter((n) => ctx.operatorFaction(n) === "Lee's Detective Agency").length,
    note: 'Also restores extra Morale specifically for Lee\'s Detective Agency operators -- that per-faction bonus isn\'t modeled, only the flat CC-wide part.',
  }),
  'Gnosis|Hidden Mastermind': (ctx) => ({ ccMoraleBonus: 0.05 * ctx.ccOperatorNames.filter((n) => ctx.rosters.KARLAN_TRADE.has(n)).length }),
  'Gnosis|Precise Calculations': (ctx) => ({
    perTradingPostOrderEfficiency: ctx.tradingPostFactionCounts.map((tp) => ({
      facilityId: tp.facilityId,
      amount: -0.15 * tp.operatorNames.filter((n) => ctx.rosters.KARLAN_TRADE.has(n)).length,
    })),
    perTradingPostOrderLimit: ctx.tradingPostFactionCounts.map((tp) => ({
      facilityId: tp.facilityId,
      amount: 6 * tp.operatorNames.filter((n) => ctx.rosters.KARLAN_TRADE.has(n)).length,
    })),
  }),

  // Conditional contributors to the SAME shared highest-only pools the
  // generic parser already builds -- these only apply under a condition,
  // so they can't just be textually regex-matched the same way.
  'Ascalon|S.W.E.E.P. Supervisor': () => ({ trainingSpeedBonus: 0.05 }),
  'Blaze the Igniting Spark|Best of Buds': () => ({ trainingSpeedBonus: 0.05 }),
  'Hoshiguma the Breacher|Downtown Connections': () => ({ trainingSpeedBonus: 0.05 }),
  'Pudding|Overclock': (ctx) => (ctx.robotPowerPlantCount >= 2 ? { factoryBonusCandidate: 0.02 } : {}),
  "Hoshiguma the Breacher|Camaraderie": (ctx) =>
    ctx.ccOperatorNames.filter((n) => ctx.rosters.LUNGMEN_GUARD_DEPARTMENT.has(n)).length >= 1 ? { factoryBonusCandidate: 0.03 } : {},
  'Kirin R Yato|Leading By Example': (ctx) =>
    ctx.ccOperatorNames.filter((n) => ctx.rosters.SOUBO_ADVENTURERS.has(n)).length >= 2
      ? { factoryBonusCandidate: 0.02 }
      : {},
  'Rathalos S Noir Corne|Esoteric Negotiations': (ctx) =>
    ctx.ccOperatorNames.filter((n) => ctx.rosters.SOUBO_ADVENTURERS.has(n)).length >= 2
      ? { tradingPostBonusCandidate: 0.07 }
      : {},
  'Wang|Expedience': (ctx) => {
    // This used to hard-code the Trading Post branch, on the grounds that
    // Influence (2 Trading Posts + 3 Power Plants = 5) always exceeded
    // Territory (4 Factories) in the fixed layout. The player builds the
    // layout now, so five Factories against two Power Plants flips it and
    // the Factory branch fires instead.
    const territory = ctx.factoryCount;
    const influence = ctx.powerPlantCount + ctx.tradingPostCount;
    return influence >= territory
      ? { tradingPostBonusCandidate: 0.07 }
      : { factoryBonusCandidate: 0.02 };
  },
  'Varkáris|Pride of a Hero α': (ctx) => ({
    clueCollectionBonusCandidate: Math.min(0.2, 0.04 * ctx.allPlacedNames.filter((n) => ctx.rosters.MINOS.has(n)).length),
    selfMorale: ctx.ccOperatorNames.some((n) => n !== 'Varkáris' && ctx.rosters.SARGON.has(n)) ? 0.02 : 0,
    note: 'Minos count excludes Assistants/Activity Room use, which this simulator has no data for -- may overcount slightly.',
  }),
  'Varkáris|Pride of a Hero β': (ctx) => ({
    clueCollectionBonusCandidate: Math.min(0.25, 0.05 * ctx.allPlacedNames.filter((n) => ctx.rosters.MINOS.has(n)).length),
    selfMorale: ctx.ccOperatorNames.some((n) => n !== 'Varkáris' && ctx.rosters.SARGON.has(n)) ? 0.02 : 0,
    note: 'Minos count excludes Assistants/Activity Room use, which this simulator has no data for -- may overcount slightly.',
  }),

  // CC-own-morale pairing bonuses (affect the CC morale pool specifically).
  'Civilight Eterna|King\'s Legacy': (ctx) => (ctx.ccOperatorNames.includes('Amiya') ? { ccMoraleBonus: 0.05 } : {}),
  'Civilight Eterna|"Unfinished Story"': (ctx) => (ctx.ccOperatorNames.includes('Amiya') ? { ccMoraleBonus: 0.1 } : {}),
  // Unconditional +15%, and "Only the strongest effect of this type takes
  // place" -- so it belongs in the highest-only pool rather than being
  // left to the generic parser, which is a separate accumulator that gets
  // added on top of this one.
  'Civilight Eterna|Convergence of Hope': () => ({ clueCollectionBonusCandidate: 0.15 }),
  'Lee|Moment of Respite': (ctx) => (ctx.ccOperatorNames.includes('Aak') ? { ccMoraleBonus: 0.25 } : {}),

  // CC morale CONSUMPTION-increase skills -- wording is "increases the
  // Morale CONSUMPTION of Operators... by +X", the opposite direction
  // from the generic pattern (which expects "increase morale BY +X" to
  // mean less consumption). Special-cased to avoid a sign error.
  'Leizi|Picky': () => ({ ccMoraleBonus: -0.5, note: 'Also slightly increases faction-matched clue likelihood in Reception Room -- non-numeric, not modeled.' }),
  'Aak|Neuroticism': () => ({ ccMoraleBonus: -1.5, note: 'Also slightly increases faction-matched clue likelihood in Reception Room -- non-numeric, not modeled.' }),
  'Ela|Resister': (ctx) => ({
    targetedMoraleEffects: ctx.ccOperatorNames.filter((n) => n !== 'Ela').map((n) => ({ targetName: n, amount: 0.25 })),
    note: 'Also increases off-board clue likelihood -- non-numeric, not modeled.',
  }),

  // Dormitory-SPECIFIC morale relief -- distinct from the flat
  // per-CC-operator relief that applies to every OTHER facility.
  'Kestrel|War Tattoos': () => ({ dormitoryMoraleRelief: 0.05 }),
  'Raidian|Quiet Affection': () => ({ dormitoryEliteOperatorsRelief: 0.1 }),
  'Misumi Uika|Resonant Bond': (ctx) => ({
    dormitoryMoraleRelief: 0.05,
    targetedMoraleEffect: ctx.ccOperatorNames.includes('Togawa Sakiko') ? { targetName: 'Togawa Sakiko', amount: 0.1 } : undefined,
  }),
  'Yūtenji Nyamu|Exitus Acta Probat': (ctx) => {
    const sakikoPresent = ctx.ccOperatorNames.includes('Togawa Sakiko');
    // "Only the strongest effect of this type takes place" -- Misumi
    // Uika's Resonant Bond (+0.1) is the stronger of the two, so when
    // both are active alongside Sakiko Togawa, this one is suppressed
    // rather than stacking on top of it.
    const suppressedByMisumiUika = sakikoPresent && ctx.activeSkillKeys.has('Misumi Uika|Resonant Bond');
    return {
      // Only the MORALE half is conditional on Togawa. The clue bonus is
      // unconditional (confirmed by the user) -- gating both on her meant
      // that without Togawa the handler returned nothing at all, and
      // because a skill in this map is excluded from the generic parser,
      // the 5% then went missing entirely rather than falling back.
      ...(sakikoPresent && !suppressedByMisumiUika
        ? { targetedMoraleEffect: { targetName: 'Togawa Sakiko', amount: 0.05 } }
        : {}),
      // Competes in the highest-only pool with her own Diligent Worker,
      // which is also +5% -- at E2 both skills are live (the E2 does not
      // say "Replaces"), and the room should see 5%, never 10%.
      clueCollectionBonusCandidate: 0.05,
    };
  },
  'Nymph|Wandering Heart': () => ({ dormitoryMoraleRelief: 0.05 }),
  'Raidian|Drip-Fed Care': () => ({}), // this one is CC-wide, not dormitory-specific -- already generic-compatible, listed only for clarity
  'Reed the Flame Shadow|Leader': () => ({ dormitoryMoraleRelief: 0.05 }),

  // Genuine cross-facility effects: per-Trading-Post additive bonuses
  // (NOT the shared highest-only pool -- these scale with THAT specific
  // Trading Post's own faction composition).
  'Delphine|Master Strategist': (ctx) => ({
    perTradingPostOrderEfficiency: ctx.tradingPostFactionCounts.map((tp) => ({
      facilityId: tp.facilityId,
      amount: 0.1 * tp.operatorNames.filter((n) => ctx.rosters.GLASGOW.has(n)).length,
    })),
  }),
  'SilverAsh the Reignfrost|Land of Business': (ctx) => ({
    perTradingPostOrderEfficiency: ctx.tradingPostFactionCounts.map((tp) => ({
      facilityId: tp.facilityId,
      amount: tp.operatorNames.filter((n) => ctx.operatorFaction(n) === 'Kjerag').length >= 3 ? 0.1 : 0,
    })),
  }),
  'Yahata Umiri|Famiglia Approval': (ctx) => ({
    perTradingPostOrderEfficiency: ctx.tradingPostFactionCounts.map((tp) => ({
      facilityId: tp.facilityId,
      amount: 0.05 * tp.operatorNames.filter((n) => ctx.operatorFaction(n) === 'Siracusa').length,
    })),
  }),

  // Cross-facility Factory effects.
  'Flametail|Knights of Pinus Sylvestris': (ctx) => ({
    perFactoryProductivity: ctx.pinusSylvestrisFactoryAssignments
      .filter((f) => f.product === 'Battle Records' || f.product === 'Precious Metals')
      .map((f) => ({ facilityId: f.factoryId, amount: f.product === 'Battle Records' ? 0.1 : -0.1 })),
  }),
  "Jessica the Liberated|Reunion of Old Friends": (ctx) => ({
    selfMorale: 0.5,
    perFactoryProductivity: ctx.blacksteelWorldwideFactoryCounts.map((f) => ({ facilityId: f.factoryId, amount: 0.05 * f.count })),
  }),

  // Cross-facility Reception Room / Trading Post conditional checks.
  'Wiš\'adel|Conspirator α': (ctx) => {
    const tp = ctx.operatorInAnyTradingPost('Hoederer');
    return {
      receptionRoomClueSpeedFromCC: ctx.reineInReceptionRoom('Ines') ? 0.05 : 0,
      perTradingPostOrderLimit: tp ? [{ facilityId: tp.facilityId, amount: 1 }] : [],
    };
  },
  'Wiš\'adel|Conspirator β': (ctx) => {
    const tp = ctx.operatorInAnyTradingPost('Hoederer');
    return {
      receptionRoomClueSpeedFromCC: ctx.reineInReceptionRoom('Ines') ? 0.05 : 0,
      perTradingPostOrderLimit: tp ? [{ facilityId: tp.facilityId, amount: 2 }] : [],
    };
  },
  // Applied in base.tsx's ccMoraleRelief computation rather than returned from
  // here: it has to affect every non-Control-Center facility before any of them
  // run, which this handler is too late to do. The note is only what a player
  // needs -- where the effect shows up -- not how it is wired.
  'Wiš\'adel|Banner of Babel': () => ({
    note: 'Recovers +0.1 Morale/hr for operators in every OTHER building, not just Dormitories (+0.1 more with Civilight Eterna here too), so it shows up in those facilities rather than in this one.',
  }),

  // Office-dependent conditional.
  'Saileach|Infectivity': (ctx) => ({
    officeHrSpeedBonus: ctx.officeHrSpeedPercent < 30 ? 0.2 : 0,
  }),

  // Passion-based skills -- generation is now handled automatically by
  // computeResourcePools() reading which of these skills are present;
  // handlers below just need to report their own flat portions plus any
  // resource-dependent bonus they consume.
  "Misumi Uika|Idol's Aura": () => ({}), // pure Passion generator, no bonus of her own
  'Yahata Umiri|Reliable Companion': () => ({ officeHrSpeedBonus: 0.1 }), // pure Passion generator + flat HR bonus
  'Yūtenji Nyamu|Diligent Worker': () => ({ clueCollectionBonusCandidate: 0.05 }), // pure Passion generator + flat clue bonus
  'Wakaba Mutsumi|Monster of Acting': (ctx) => {
    const suppressedByHalvesOfAWhole =
      ctx.ccOperatorNames.includes('Togawa Sakiko') && ctx.activeSkillKeys.has('Wakaba Mutsumi|Halves of a Whole');
    return {
      selfMorale: suppressedByHalvesOfAWhole ? 0 : ctx.resourceBonuses['Wakaba Mutsumi|Monster of Acting|self_morale_per_hour'] ?? 0,
      tradingPostBonusCandidate: 0.01 * (ctx.resourceBonuses['Wakaba Mutsumi|Monster of Acting|trading_post_order_pct'] ?? 0),
    };
  },
  'Wakaba Mutsumi|Halves of a Whole': () => ({}), // suppression itself is applied inside Monster of Acting's own handler above, since that's where the self-morale value is actually computed
  'Togawa Sakiko|Plentiful Work Experience': (ctx) => {
    const isElite2 = ctx.eliteLevel === 'Elite 2';
    const perPassionKey = isElite2
      ? 'Togawa Sakiko|Plentiful Work Experience|precious_metal_pct_e2'
      : 'Togawa Sakiko|Plentiful Work Experience|precious_metal_pct_base';
    const base = isElite2 ? 0.01 : 0.005;
    return {
      factoryPreciousMetalBonusFromCC: base + (ctx.resourceBonuses[perPassionKey] ?? 0) / 100,
    };
  },
  'Togawa Sakiko|Indomitable Lady': (ctx) => ({
    selfMorale: ctx.resourceBonuses['Togawa Sakiko|Indomitable Lady|self_morale_per_hour'] ?? 0,
  }),

  // Genuinely un-modelable / resource-chain effects -- documented so
  // they're not silently dropped without explanation.
  // Non-numeric clue-board effects: these change WHICH clue is likely, not
  // any speed number, so there is nothing for calcControlCenterEffects to
  // add. Listed so the omission is visible in the breakdown panel instead of
  // the skill silently counting as zero.
  'Heidi|"One Thousand Letters"': () => ({ note: 'Non-numeric effect (raises the Reception Room\'s chance of Glasgow clues) -- not modeled.' }),
  'Leizi|Discernment': () => ({ note: 'Non-numeric effect (favours clues matching the factions in the Reception Room) -- not modeled.' }),
  'Ling|Keep the Wine Flowing': () => ({ note: 'Cancels other Sui Operators\' self-morale-reduction skills in CC -- applied to Sui operators in this room.' }),
  'Ling|"Vast Mountains and Rivers"': () => ({}), // generation now handled by computeResourcePools; the branch itself has no flat bonus of its own
  'Gladiia|Tide Observation': (ctx) => {
    const drainPenalty = 0.5 * ctx.abyssalHuntersInNonDormFacilities;
    const restingCount = ctx.abyssalHuntersRestingInDormitories;
    const restRecovery = 0.5 * restingCount + 0.5 * (ctx.abyssalHuntersRestingAtFullMorale ?? 0);
    return { selfMorale: drainPenalty - restRecovery };
  },
  'Gladiia|Group Hunting α': (ctx) => ({
    ccMoraleBonus: 0.05,
    perFactoryProductivity: ctx.abyssalHunterFactoryCounts.map((f) => ({ facilityId: f.factoryId, amount: Math.min(0.45, 0.05 * f.count * ctx.abyssalHunterTotalInFactories) })),
  }),
  'Młynar|Business Is Business': () => ({ note: 'Facility scope and eligible Control Center skills follow the game glossary; competes with Banner of Babel and Solitary Light, keeping the strongest.' }),
  'Gladiia|Group Hunting β': (ctx) => ({
    ccMoraleBonus: 0.05,
    perFactoryProductivity: ctx.abyssalHunterFactoryCounts.map((f) => ({ facilityId: f.factoryId, amount: Math.min(0.9, 0.1 * f.count * ctx.abyssalHunterTotalInFactories) })),
  }),
  'Viviana|Marigold Poetry Gathering': () => ({ ccMoraleBonus: 0.05 }),
  // +7% per Knight in the Factory, not +7% for the Factory: a room with
  // two Knights gets +14%, three gets +21%. Emitted one entry PER KNIGHT
  // rather than pre-multiplied, which is the same shape Flametail's
  // per-Pinus-Sylvestris skill uses -- the breakdown panel groups a skill's
  // entries and shows the multiplier, so both read as "+7.00% x 3" instead
  // of one skill showing a single opaque block and the other three lines.
  "Viviana|The Candle Knight's Glimmer": (ctx) => ({
    perFactoryProductivity: ctx.factoriesWithKnight.flatMap(({ facilityId, knightCount }) =>
      Array.from({ length: knightCount }, () => ({ facilityId, amount: 0.07 }))
    ),
  }),
  // Applied in base.tsx's effectivePowerPlantCount, for the same reason as
  // Banner of Babel above: every Factory's context needs it before any Factory
  // skill runs.
  'Eunectes|I\'ve Got This': () => ({ note: 'Counts as +2 extra Power Plants while Lancet-2 is in a Power Plant, so it shows up in whichever Factory skills scale with Power Plant count.' }),
  'Chongyue|I am I': () => ({ selfMorale: 0.5 }), // Worldly Plight generation now handled by computeResourcePools
  // Same mechanism as Banner of Babel above -- applied in ccMoraleRelief.
  'Chongyue|Solitary Light': () => ({
    note: 'Recovers +0.05 Morale/hr for operators in every OTHER building, not just Dormitories, and +0.05 more for every 20 Worldly Plight, so it shows up in those facilities rather than in this one.',
  }),
  'Dusk|"Unstirred by Gain"': () => ({ ccMoraleBonus: 0.05 }), // Worldly Plight generation now time-weighted (see resourceState.duskFractionAbove12), not a fixed snapshot
  'Dusk|"Unmoved by Loss"': () => ({ selfMorale: -0.5 }), // "decreases OWN morale consumption" -- self-only, not room-wide. Perception Information generation now time-weighted (see resourceState.duskFractionAbove12)
  'Ash|Intelligence Reserve': () => ({}), // pure Intelligence Reserve generator, no bonus of her own -- generation now handled by computeResourcePools
  'Rathalos S Noir Corne|Teamwork': (ctx) => ({
    felvine: 2 * ctx.ccOperatorNames.filter((n) => ctx.rosters.SOUBO_ADVENTURERS.has(n)).length,
  }),
  'Kirin R Yato|Endurance Recovery': () => ({ selfMorale: 0.5, felvine: 8 }),
};