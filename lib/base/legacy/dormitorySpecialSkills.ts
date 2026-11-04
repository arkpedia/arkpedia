import { nonDefaultRecruitSlots } from './baseResources';
import type { BaseRosters } from '../baseGroupRosters';

export interface DormitorySkillContext {
  /** The group rosters (lib/base/baseGroupRosters.ts), from the page's props. */
  rosters: BaseRosters;
  officeLevel: number;
  moraleByOperator?: Readonly<Record<string, number>>;
  manualValue?: number;
  sameRoomOperatorNames: string[]; // includes self, in SLOT ORDER (left to right)
  filledCountThisRoom: number;
  dormitoryLevel: number; // Actual room level.
  // The operator who WOULD receive this operator's single-target bonus if
  // it wins the highest-only comparison against every other single-target
  // skill in the room -- null if there's no other operator to target.
  // Since this simulator assumes every operator starts at full Morale
  // when placed (confirmed), everyone in a room is always tied for
  // lowest Morale at that moment, so the target is always simply the
  // leftmost OTHER operator in the room (confirmed tie-break rule) --
  // base.tsx resolves this per-operator before calling the handler, so
  // handlers with a target-specific conditional (e.g. Indigo) can just
  // read it directly rather than re-deriving it themselves.
  targetIfSelected: string | null;
  wanderingMedicCountBaseWide: number; // Eyjafjalla's own skill caps this at 4 itself -- pass the raw count, the handler applies the cap
  suiCountBaseWide: number; // Yu's own skill caps this at 4 itself -- pass the raw count, the handler applies the cap
  soundlessResonanceTotal: number; // base-wide Soundless Resonance pool total -- Virtuosa's own E2 skill scales off this
  powerPlantCount: number; // BUILT Power Plants in the player's layout -- Lumen's Glimmering Glow scales off it, and the layout is no longer fixed at 3
}

export interface DormitorySkillResult {
  conditionalGroupBonus?: { below: number; amount: number };
  distributedBonus?: { recipients: string[]; amount: number };
  exclusiveRecovery?: number;
  selfMoraleRecovery?: number; // decimal, adds to (or subtracts from) THIS operator's own recovery rate
  allOperatorsBonus?: number; // adds to the baseline for EVERY operator in the same Dormitory, including this one
  allOthersBonus?: number; // adds to the baseline for every OTHER operator in the same Dormitory, excluding this one (use alongside selfMoraleRecovery for skills that grant a different amount to themselves)
  // This operator's contribution to the SEPARATE "restores Morale to
  // ANOTHER operator whose Morale isn't full" exclusivity group -- a
  // DIFFERENT highest-only group from allOperatorsBonus above (that one
  // is "everyone gets it", this one is "one specific other operator gets
  // it"). Only the single strongest singleTargetBonus in the room
  // actually applies, and only to ITS OWN associated targetIfSelected
  // (see DormitorySkillContext) -- not to whoever happens to have the
  // globally-lowest value.
  singleTargetBonus?: number;
  note?: string;
}

type Handler = (ctx: DormitorySkillContext) => DormitorySkillResult;

/** Numeric recovery plus explicit conditional and one-off effects. */

/** Some single-target skills override the normal leftmost-tiebreak rule
 * entirely -- if their specific named target is present in the room,
 * that operator takes precedence regardless of slot position (still
 * subject to the same "everyone assumed full Morale" simplification,
 * just with a fixed preferred recipient instead of "leftmost"). Confirmed:
 * Schwarz -> Ceylon (who has no Dormitory skill of her own), Tomimi ->
 * Gavial. base.tsx checks this before falling back to the leftmost-other
 * default.
 */
export const DORMITORY_PREFERRED_TARGET: Record<string, string> = {
  Schwarz: 'Ceylon',
  Tomimi: 'Gavial',
};

export const DORMITORY_SPECIAL_SKILLS: Record<string, Handler> = {
  'Rhodes Island Recon|Hunting Helper': ctx => ({ singleTargetBonus: 0.55 + (ctx.targetIfSelected && (ctx.rosters.SOUBO_ADVENTURERS.has(ctx.targetIfSelected) || ctx.rosters.BUBBLE_KINGDOM_HUNTERS.has(ctx.targetIfSelected)) ? 0.45 : 0) }),
  'Crackborne|Rare Respite': () => ({ selfMoraleRecovery: 0.55 }),
  'Thumpy|Rabbit Holes Everywhere': () => ({ selfMoraleRecovery: 0.7 }),
  'Koromaru|Fluffy Comfort': () => ({ allOperatorsBonus: 0.1 }),
  'Kroos|Solitude': () => ({ selfMoraleRecovery: 0.7 }),
  'Estelle|Solitude': () => ({ selfMoraleRecovery: 0.7 }),
  'Frostleaf|Solitude': () => ({ selfMoraleRecovery: 0.7 }),
  'Andreana|Solitude': () => ({ selfMoraleRecovery: 0.7 }),
  'Andreana|Hard to Avoid': () => ({ selfMoraleRecovery: 0.85 }),
  'GreyThroat|Solitude': () => ({ selfMoraleRecovery: 0.7 }),
  'Harmonie|Solitude': () => ({ selfMoraleRecovery: 0.7 }),
  'Lunacub|Lazy Cub': () => ({ selfMoraleRecovery: 0.7 }),
  'Reed|Solitude': () => ({ selfMoraleRecovery: 0.7 }),
  'Specter|Solitude': () => ({ selfMoraleRecovery: 0.7 }),
  'Specter|Craze': () => ({ selfMoraleRecovery: 0.85 }),
  'Skadi|Solitude': () => ({ selfMoraleRecovery: 0.7 }),
  'Skadi|Elegy': () => ({ selfMoraleRecovery: 1 }),
  'Ethan|Concealed Gourmet': () => ({ selfMoraleRecovery: 0.75 }),
  'Hellagur|Release': () => ({ selfMoraleRecovery: 0.55 }),

  // --- "Restores +X to all Operators" -- simply adds X to the
  // baseline for everyone in the room. Recruit-slot/Dormitory-level
  // scaling uses the confirmed constants (4 extra recruit slots,
  // Level 5 Dormitory always).
  'Durin|Laziness': () => ({ selfMoraleRecovery: -0.1, allOperatorsBonus: 0.2 }),
  'Durin|Sleepiness': () => ({ selfMoraleRecovery: -0.1, allOperatorsBonus: 0.25 }),
  'Ambriel|Laziness': () => ({ selfMoraleRecovery: -0.1, allOperatorsBonus: 0.2 }),
  'Myrtle|Leader': () => ({ allOperatorsBonus: 0.15 }),
  "Podenco|Nourish the Soul": () => ({ allOperatorsBonus: 0.15 }),
  'Amiya|Violin Solo': () => ({ allOperatorsBonus: 0.15 }),
  'April|Inspiration': () => ({ allOperatorsBonus: 0.1 }),
  'Bobbing|Listener': () => ({ allOperatorsBonus: 0.15 }),
  'Bobbing|Conversationalist': (ctx) => ({
    allOperatorsBonus: 0.2 + 0.01 * ctx.sameRoomOperatorNames.filter(n => (ctx.moraleByOperator?.[n] ?? 0) < 24).length,
  }),
  'Cairn|Bedtime Stories': () => ({ allOperatorsBonus: 0.15 }),
  'Cairn|Bucket List': (ctx) => ({ allOperatorsBonus: 0.15 + 0.02 * ctx.dormitoryLevel }), // + per Dormitory level, assumed Level 5
  'Doc|Altruism': () => ({ allOperatorsBonus: 0.2 }),
  'Grain Buds|Rural Flute': () => ({ allOperatorsBonus: 0.15 }),
  'Iris|Bedtime Story': () => ({ allOperatorsBonus: 0.1 }),
  'Nightingale|Inspiration': () => ({ allOperatorsBonus: 0.1 }),
  'Nightingale|Lady of the Lamp': () => ({ allOperatorsBonus: 0.2 }),
  'Nymph|Meditative Rites α': () => ({ allOperatorsBonus: 0.15 }),
  'Nymph|Meditative Rites β': () => ({ allOperatorsBonus: 0.2 }),
  'Penance|Fellow Travelers': (ctx) => ({ allOperatorsBonus: 0.15 + 0.05 * nonDefaultRecruitSlots(ctx.officeLevel) }),
  'Perfumer the Distilled|Gentle Spirit': () => ({ allOperatorsBonus: 0.15 }),
  'Perfumer the Distilled|Pure Breath': () => ({ conditionalGroupBonus: { below: 20, amount: 0.1 } }),
  'Sora|Idol': () => ({ allOperatorsBonus: 0.15 }),
  'Senshi|Veteran Cook': () => ({ allOperatorsBonus: 0.15 }), // Recipient-specific +0.15 is combined with this provider before highest-only selection.
  'Vendela|Aroma Convalescence α': () => ({ allOperatorsBonus: 0.15 }),
  'Vendela|Aroma Convalescence β': () => ({ allOperatorsBonus: 0.15, conditionalGroupBonus: { below: 18, amount: 0.1 } }),
  'Warmy|Cookout α': () => ({ allOperatorsBonus: 0.15 }),
  'Warmy|Cookout β': () => ({ allOperatorsBonus: 0.2 }),
  'Zima|Leader': () => ({ allOperatorsBonus: 0.15 }),
  'Zima|General Z': () => ({ allOperatorsBonus: 0.2 }),
  'Haruka|Celebrity Effect': () => ({ allOperatorsBonus: 0.15 }),
  'Siege|Leader': () => ({ allOperatorsBonus: 0.15 }),
  'Siege|Lionheart': () => ({ allOperatorsBonus: 0.2 }),
  'Entelechia|Flawless Heart α': (ctx) => ({ allOperatorsBonus: 0.1 + 0.05 * nonDefaultRecruitSlots(ctx.officeLevel) }),
  'Entelechia|Flawless Heart β': (ctx) => ({ allOperatorsBonus: 0.1 + 0.1 * nonDefaultRecruitSlots(ctx.officeLevel) }),

  // --- All-operators, scaling with a base-wide faction/facility count.
  // Confirmed caps: 4 for both Eyjafjalla and Yu (their own skill text,
  // not the earlier verbal "5" -- trusting the exact text here).
  'Eyjafjalla the Hvít Aska|Volcanic Hot Springs Bath': (ctx) => ({
    allOperatorsBonus: 0.06 * Math.min(4, ctx.wanderingMedicCountBaseWide),
  }),
  "Yu|I'll Cook Your Favorite": (ctx) => ({
    allOperatorsBonus: 0.06 * Math.min(4, ctx.suiCountBaseWide),
  }),
  'Lumen|Glimmering Glow α': (ctx) => ({ allOperatorsBonus: 0.1 + 0.05 * ctx.powerPlantCount }),
  'Lumen|Glimmering Glow β': (ctx) => ({ allOperatorsBonus: 0.15 + 0.05 * ctx.powerPlantCount }),
  'Virtuosa|Soundless Resonance': () => ({}), // pure Soundless Resonance generator (1 per Operator in her own room), no Morale-recovery effect of her own -- generation handled by computeResourcePools in baseResources.ts
  'Virtuosa|Wordless Anthem': (ctx) => ({
    allOperatorsBonus: 0.2 + 0.01 * Math.floor(ctx.soundlessResonanceTotal / 5),
  }),

  // --- Self gets one amount, everyone ELSE in the room gets a
  // different (smaller) amount -- two separate fields since they're
  // not the same number.
  'Bagpipe|Madrigal': () => ({ selfMoraleRecovery: 0.55, allOthersBonus: 0.1 }),
  'Fartooth|"Homecoming"': () => ({ selfMoraleRecovery: 0.55, allOthersBonus: 0.1 }),
  'Hellagur|Break Loose': () => ({ allOthersBonus: 0.1 }),
  'Hellagur|Absolution': () => ({ selfMoraleRecovery: 0.55, allOthersBonus: 0.1 }),
  'Muelsyse|Natural Beauty': () => ({ selfMoraleRecovery: 0.55, allOthersBonus: 0.1 }),

  // --- "Restores +X Morale per hour to ANOTHER Operator whose Morale
  // is not full" -- a SEPARATE highest-only exclusivity group from
  // allOperatorsBonus above. Confirmed: since every operator is assumed
  // to start at full Morale when placed, the target is always the
  // leftmost OTHER operator in the room (base.tsx resolves this via
  // ctx.targetIfSelected before comparing which skill wins).
  'Lancet-2|Medical Service': () => ({ singleTargetBonus: 0.65 }),
  'Ansel|Thoughtfulness': () => ({ singleTargetBonus: 0.55 }),
  'Beagle|Liveliness': () => ({ singleTargetBonus: 0.2, selfMoraleRecovery: 0.4 }),
  'Cardigan|Liveliness': () => ({ singleTargetBonus: 0.2, selfMoraleRecovery: 0.4 }),
  'Conviction|Apocalypse': () => ({ singleTargetBonus: 0.7 }),
  'Hibiscus|Thoughtfulness': () => ({ singleTargetBonus: 0.55 }),
  'Popukar|Harmony': () => ({ singleTargetBonus: 0.4, selfMoraleRecovery: 0.2 }),
  // Morgan's bonus is Siege's to give, not hers, and it lands on a roster
  // this simulator doesn't track per-Dormitory; the two Fiammetta skills are
  // a recovery override and a Morale swap, neither of which is a rate this
  // model can express. Documented rather than left silently at zero.
  'Morgan|No.1 Practice Partner': () => ({ note: 'Siege grants +0.3/hr more to Glasgow operators when both are in this Dormitory.' }),
  'Fiammetta|Self-Discipline': () => ({ exclusiveRecovery: 2, note: 'Recovers exactly 2 Morale/hr; all other recovery sources are suppressed.' }),
  'Fiammetta|Communal Suffering': () => ({ note: 'Swaps Morale with the previous Operator in the Dormitory when at Full Morale -- a one-off exchange, not a per-hour rate.' }),
  'Aciddrop|Give me five': () => ({ singleTargetBonus: 0.35, selfMoraleRecovery: 0.35 }),
  'Gummy|Cooking': () => ({ singleTargetBonus: 0.35, selfMoraleRecovery: 0.35 }),
  "Indigo|Poisoner's Friend": (ctx) => ({
    singleTargetBonus: ctx.targetIfSelected === 'Blue Poison' ? 0.55 + 0.45 : 0.55,
  }),
  'Jackie|Liveliness': () => ({ singleTargetBonus: 0.2, selfMoraleRecovery: 0.4 }),
  'Meteor|Thoughtfulness': () => ({ singleTargetBonus: 0.55 }),
  'Mousse|Baking': () => ({ singleTargetBonus: 0.3, selfMoraleRecovery: 0.3 }),
  'Myrrh|Thoughtfulness': () => ({ singleTargetBonus: 0.55 }),
  'Podenco|Thoughtfulness': () => ({ singleTargetBonus: 0.55 }),
  'Podenco|Convalescence': () => ({ singleTargetBonus: 0.65 }),
  "Cliffheart|Explorer's Passion": () => ({ singleTargetBonus: 0.25, selfMoraleRecovery: 0.5 }),
  'Gracebearer|Canticle of Grace': () => ({ singleTargetBonus: 0.7 }),
  'Grain Buds|Thoughtfulness': () => ({ singleTargetBonus: 0.55 }),
  'Honeyberry|Psychological Counseling': () => ({ singleTargetBonus: 0.7 }),
  'Czerny|Adagio': () => ({ singleTargetBonus: 0.65 }), // also generates Measure (5, assuming Level 5 Dormitory) -- handled in baseResources.ts, not here
  'Insider|Donut Party': () => ({ singleTargetBonus: 0.4, selfMoraleRecovery: 0.4 }),
  'Nearl|Followers': () => ({ singleTargetBonus: 0.5, selfMoraleRecovery: 0.25 }),
  'Pramanix|Karlan Saint': () => ({ singleTargetBonus: 0.5, selfMoraleRecovery: 0.25 }),
  'Savage|Cooking': () => ({ singleTargetBonus: 0.35, selfMoraleRecovery: 0.35 }),
  'Saileach|Victorian Literature': () => ({ singleTargetBonus: 0.7 }),
  'Shining|Thoughtfulness': () => ({ singleTargetBonus: 0.55 }),
  'Shining|Mercy': () => ({ singleTargetBonus: 0.75 }),

  // --- Single-target, with an EXTRA bonus if the (pre-determined)
  // target belongs to a specific faction, or a genuinely specific named
  // operator (checked via DORMITORY_PREFERRED_TARGET, see below).
  'Santalla|Born of the Biting Cold': (ctx) => ({
    singleTargetBonus: ctx.targetIfSelected && ctx.rosters.SAMI.has(ctx.targetIfSelected) ? 0.55 + 0.45 : 0.55,
  }),
  'Tomimi|Barbecue Master': (ctx) => ({
    singleTargetBonus: ctx.targetIfSelected === 'Gavial' ? 0.55 + 0.45 : 0.55,
  }),
  'Schwarz|Make Tea': (ctx) => ({
    singleTargetBonus: ctx.targetIfSelected === 'Ceylon' ? 0.55 + 0.45 : 0.55,
  }),
  'Exusiai the New Covenant|Natural Optimist': () => ({ singleTargetBonus: 0.55 }),
  'Exusiai the New Covenant|Funny Holy City Stories': (ctx) => ({
    singleTargetBonus: ctx.targetIfSelected && ctx.rosters.LATERANO.has(ctx.targetIfSelected) ? 0.55 + 0.45 : 0.55,
  }),

  'Coldshot|Wet Your Whistles': (ctx) => {
    const recipients = ctx.sameRoomOperatorNames.filter(n => (ctx.moraleByOperator?.[n] ?? 0) < 24);
    return { distributedBonus: { recipients, amount: recipients.length ? 0.8 / recipients.length : 0 } };
  },

  // --- Self-scaling with roommate count -- NOT single-target, NOT
  // "all operators": purely the skill-holder's OWN recovery rate,
  // scaling with how many OTHER operators share the room.
  'Akkord|Fugue Amalgamation': (ctx) => ({ selfMoraleRecovery: 0.7 + 0.05 * Math.max(0, ctx.filledCountThisRoom - 1) }),
  'Arene|Searching for Solitude': (ctx) => ({ selfMoraleRecovery: 0.7 + 0.05 * Math.max(0, ctx.filledCountThisRoom - 1) }),
};