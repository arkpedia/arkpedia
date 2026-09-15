import type { StrongholdData, StrongholdOperator } from './stronghold';
import { foldName } from './strongholdPrice';

/**
 * How each alliance is actually played, as opposed to what it mechanically does.
 *
 * The companion's own advice is derived: it reads the parsed attribute text, works out
 * what a purchase would add to the alliances you have switched on, and ranks by that.
 * That answers "which of these is worth the most stacks" and it cannot answer the
 * questions a run is actually lost on -- how far to push the Dispatch Center before
 * spending, which operator the whole plan is waiting for, which single unit carries a
 * pivot from one alliance to another. None of that is in the data; it is knowledge of
 * the mode, so it lives here as data of its own and the algorithm reads it.
 *
 * Every name is resolved against the roster at build time (see assertPlaybook), because
 * a plan naming an operator the season does not have is worse than no plan: it sends
 * the player hunting something the shop will never offer.
 *
 * A UNIT AND ITS ALTER ARE TWO OPERATORS. Nine pairs sit in this roster -- Texas and
 * Texas the Omertosa, Lappland and Lappland the Decadenza, Specter and
 * Specter the Unchained, Executor, Exusiai, Pramanix, Skadi, Swire, SilverAsh. Six of
 * them are named on BOTH halves by the plans below, at different tiers and for
 * different reasons, and the alter is never the base promoted -- three copies of
 * Lappland make a Tier III Lappland, not a Tier VI Lappland the Decadenza. Name
 * resolution is exact equality on the folded name, never a prefix match, so the two
 * can never collapse into one; the care needed is in the prose, where it is easy to
 * write a sentence that implies they are the same unit.
 *
 * AND AN ALTER IS WRITTEN IN FULL -- "Lappland the Decadenza" or "Lappland Alter",
 * never the suffix on its own, and never the base name on its own when no operator of
 * that name is in the roster (Blaze the Igniting Spark is here; her base unit is not,
 * so the short form names a unit that does not exist in this mode).
 */

/**
 * A condition on the board, as data rather than as a function.
 *
 * Data because every operator name in this file is checked against the season's roster
 * at build time (see assertPlaybook), and a name buried inside a closure cannot be
 * checked. A guard is walked like everything else here.
 *
 * Deliberately tiny. Most sequencing needs no guard at all: the steps of a plan are
 * written in order and a step is only reached once the ones before it are done, so
 * "then, hunt for Ptilopsis/Saria" is expressed by writing it after the hunt it
 * follows. A guard is for the cases where that is not enough -- a stage that turns on
 * something in a DIFFERENT kind of step (Victoria's second Dispatch race waits on
 * Mint, which is a hunt) or on the Dispatch Center rather than on the roster
 * (Precision's swap).
 */
export type Guard =
  /** The board holds at least one of these. */
  | { has: string[] }
  /** The Dispatch Center is at this level or above. */
  | { dispatch: number }
  /** That alliance has enough different members on the board to be switched on. */
  | { active: string }
  | { not: Guard }
  | { and: Guard[] };

/**
 * One line of a recipe.
 *
 * The recipes are numbered lists in which the later bullets presuppose the earlier
 * ones -- "get Gladiia, THEN hunt Ptilopsis/Saria", "race to Dispatch III, hunt Mint,
 * ... race to Dispatch V, hunt Horn". A step is one of those bullets, and which of
 * them the run is on is worked out from the board every time rather than stored.
 *
 * DERIVED, NEVER STORED. The player edits their roster by hand with the plus and minus
 * buttons -- they mis-tap, they sell, they correct a count three rounds later. A stage
 * remembered in state would survive the board that justified it and go on giving
 * advice for a run that is no longer happening. Recomputing costs nothing and cannot
 * drift.
 */
export type Step =
  /** How far to push the Dispatch Center, and the level that still reaches it because
   *  three copies combine into the tier above. "Race to Dispatch IV (or Dispatch III
   *  with triple copy chase)" is `{ to: 4, from: 3 }`. */
  | { kind: 'dispatch'; to: number; from: number; why?: string; when?: Guard }
  /** Opened with rather than hunted -- a first pick that shapes the rest, and one that
   *  expires: past the opening rounds the shop has moved on. Any one of them will do. */
  | { kind: 'start'; take: string[]; why?: string; when?: Guard }
  /** What the run is FOR. Not done until every name is held, unless `any`. */
  | { kind: 'hunt'; take: string[]; why?: string; any?: boolean; when?: Guard }
  /** Worth taking when offered, never worth waiting for. The "on the way" of a recipe. */
  | { kind: 'stray'; take: string[]; why?: string; any?: boolean; when?: Guard }
  /** The third copy is the point. Urgent only in the window where it is reachable. */
  | { kind: 'chase'; take: string[]; why: string; when?: Guard }
  /** What to swap or add when running this alliance beside another. */
  | { kind: 'pivot'; with: string; take: string[]; why?: string; when?: Guard }
  /** A defence strategy the plan turns on. Chosen once at setup, never bought. */
  | { kind: 'strategy'; take: string[]; why?: string; when?: Guard };

export interface AlliancePlan {
  /** As the roster spells it -- resolved through foldName, so 'AEgir' finds 'Ægir'. */
  alliance: string;
  /** The recipe, in the order it is played. */
  steps: Step[];
  /** Alliances this one wants beside it. */
  pairs?: string[];
  /** Items, where the plan turns on one. */
  items?: string[];
  /**
   * What the plan cannot be run without, as groups where ANY one member satisfies the
   * group. The guide is full of alternatives -- Kazimierz opens with "Gravel and/or
   * Blemishine", Investor wants "Mountain or SilverAsh the Reignfrost" -- and treating
   * those as individually mandatory would call a plan dead when it still has its other
   * half. Left unset, it is derived from the first start step and the first hunt step,
   * because the steps are written in priority order.
   */
  crucial?: string[][];
  /**
   * Who to want once the alliance's own milestone is paying.
   *
   * Every Core activates at 3 and then pays AGAIN at 5 or 6 different operators, and
   * the second bonus is not generic -- Laterano's is "all [Laterano] Operators gain
   * increased ATK when any [Laterano] Operator spends 1 bullet", which is worth
   * nothing to a squad that spends no bullets. Once the milestone is met, the
   * operators that exploit it are worth more than the ones that merely stack.
   *
   * The count itself is NOT here: it is read off the alliance's effect text at build
   * time (see StrongholdAlliance.milestones), because it is already written there.
   * Only the affinity is curated, because only the affinity is a reading.
   */
  milestone?: {
    /** What the bonus turns on, in the player's terms. */
    wants: string;
    /** Operators that supply it. Checked against the roster like every other name. */
    prefer: string[];
  };
  /** The parts that are a sentence rather than a list. */
  notes?: string[];
}

export const PLAYBOOK: AlliancePlan[] = [
  {
    alliance: 'Ægir',
    steps: [
      { kind: 'dispatch', to: 4, from: 3 },
      { kind: 'hunt', take: ['Gladiia'], why: 'She farms Skadi, Specter and Underflow, so she comes before the units she produces' },
      { kind: 'stray', take: ['Skadi', 'Specter', 'Underflow'] },
      /* The units are the means; the stacks are the point. A copied Gladiia hands you
         another Skadi, Specter or Underflow each Rest Phase, and those are what feed
         the pile -- Specter is +3 Ægir on her own, and the devour at the start of
         battle adds stacks equal to the Tier of whatever it eats. */
      /* Ptilopsis alone. Gladiia fires <When entering Rest Phase> and Ptilopsis copies
         exactly that; Saria copies <When Rest Phase ends>, which is a different phase
         and never Gladiia's. */
      { kind: 'hunt', take: ['Ptilopsis'], why: 'Copies Gladiia to farm more stacks' },
      /* "to beef THEM early" -- them being Mizuki and Ulpianus themselves. Both are
         Self-Beneficial and both SPEND Ægir: +1% ATK per 3 stacks for Mizuki, per 2
         for Ulpianus, doubled once promoted. They add nothing to the alliance; they
         cash it. Which is what makes early the point -- the buff is a running total of
         every stack added after they arrive, so a round earlier is a round more. */
      { kind: 'hunt', take: ['Mizuki', 'Ulpianus'], why: 'They cash Ægir stacks into their own ATK, so the earlier the better' },
      { kind: 'hunt', take: ['Specter the Unchained'], why: 'Stacks more' },
    ],
  },
  {
    alliance: 'Kazimierz',
    steps: [
      { kind: 'start', take: ['Gravel', 'Blemishine'], why: 'Gravel redeploys with Resilient, Blemishine with Raid' },
      { kind: 'chase', take: ['Fartooth'], why: 'Stacks with Gravel' },
      { kind: 'chase', take: ['Młynar'], why: 'Beefs his ATK' },
      { kind: 'chase', take: ['Degenbrecher'], why: 'Stacks harder' },
      { kind: 'hunt', take: ['Nearl the Radiant Knight'], why: 'Double Raid with Blemishine' },
      { kind: 'pivot', with: 'Resilient', take: ['Gravel'] },
      { kind: 'pivot', with: 'Raid', take: ['Blemishine'] },
    ],
    pairs: ['Resilient', 'Raid'],
  },
  {
    alliance: 'Kjerag',
    steps: [
      { kind: 'dispatch', to: 4, from: 3 },
      { kind: 'hunt', take: ['SilverAsh'] },
      { kind: 'stray', take: ['Harold', 'Pramanix', 'Gnosis'] },
      { kind: 'chase', take: ['SilverAsh the Reignfrost'], why: 'Stacks with SilverAsh, Gnosis, Pramanix and Pramanix the Prerita' },
      { kind: 'hunt', take: ['Swire the Elegant Wit', 'Tin Man'], why: 'Trigger <When obtained> Kjerag units harder' },
      { kind: 'chase', take: ['Pramanix the Prerita'], why: 'Beefs her ATK' },
      { kind: 'chase', take: ['Degenbrecher'], why: 'Stacks harder' },
    ],
    pairs: ['Investor'],
  },
  {
    alliance: 'Laterano',
    steps: [
      { kind: 'dispatch', to: 4, from: 3 },
      { kind: 'hunt', take: ['Archetto', 'Mostima'] },
      /* Gated off once Mostima is in, because the step below then names these three
         outright -- and saying "take Executor if offered" beside "surround Mostima
         with Executor" is one line of the pop-out spent twice. */
      { kind: 'stray', take: ['Executor', 'Insider', 'Sankta Miksaparato'], when: { not: { has: ['Mostima'] } } },
      {
        kind: 'hunt',
        take: ['Sankta Miksaparato', 'Executor', 'Executor the Ex Foedere', 'Insider', 'Lemuen', 'Exusiai the New Covenant'],
        when: { has: ['Mostima'] },
        why: 'Surround Mostima with these',
      },
      { kind: 'chase', take: ['Lemuen'], why: 'Stacks harder' },
      { kind: 'chase', take: ['Exusiai the New Covenant'], why: 'Pure power' },
    ],
    /* The three whose own text turns on spending bullets, which is the condition the
       six-operator bonus pays for. Read off the roster rather than guessed: these are
       the operators the data itself says spend ammo. */
    milestone: {
      wants: 'ammo spent',
      prefer: ['Executor the Ex Foedere', 'Lemuen', 'Mostima'],
    },
  },
  {
    alliance: 'Sargon',
    steps: [
      { kind: 'dispatch', to: 3, from: 2 },
      { kind: 'hunt', take: ['Papyrus', 'Philae'] },
      /* Gated on the alliance being off rather than merely listed: these three are
         what switch Sargon on, and once it is on they are ordinary strays. */
      { kind: 'stray', take: ['Estelle', 'Bubble', 'Minimalist'], when: { not: { active: 'Sargon' } }, why: 'These are what switch the alliance on' },
      { kind: 'chase', take: ['Gavial the Invincible'], why: 'Stacks harder' },
      { kind: 'chase', take: ['Titi'], why: 'Stacks harder' },
      { kind: 'stray', take: ['Pepe', 'Passenger'], why: 'Optional firepower' },
    ],
    pairs: ['Swift'],
  },
  {
    alliance: 'Siracusa',
    steps: [
      { kind: 'start', take: ['Lappland'], why: 'Cheap Tier II opener. Refresh the shop manually to gain stacks' },
      { kind: 'dispatch', to: 5, from: 4 },
      { kind: 'hunt', take: ['Aroma', 'Angelina', 'Vigil', 'Warfarin'] },
      { kind: 'stray', take: ['Vulpisfoglia', 'Texas', 'Provence'] },
      { kind: 'chase', take: ['Lappland the Decadenza'], why: 'Hard chase. Or pair with Doctor Hologram' },
    ],
    pairs: ['Marvel'],
    items: ['Doctor Hologram'],
  },
  {
    /* The two-stage plan, and the one the old single `dispatch` field could not hold.
       Both races are real, and the second must not be advertised before Mint is in --
       racing to V for a Horn you have no Mint to stack beside is the wrong run. */
    alliance: 'Victoria',
    steps: [
      { kind: 'dispatch', to: 3, from: 2 },
      { kind: 'hunt', take: ['Mint'] },
      { kind: 'stray', take: ['Vendela', 'Harold', 'Rockrock'], why: 'Help Mint stack harder' },
      { kind: 'dispatch', to: 5, from: 4, when: { has: ['Mint'] } },
      { kind: 'hunt', take: ['Horn'], when: { has: ['Mint'] } },
      { kind: 'stray', take: ['Bagpipe', 'Catherine', 'Blaze the Igniting Spark'], when: { has: ['Mint'] }, why: 'Help Mint and Horn stack harder' },
      { kind: 'stray', take: ['Kjera', 'Carnelian'], why: 'Worth considering for their item drops' },
      { kind: 'stray', take: ['Reed the Flame Shadow', 'Vina Victoria'], why: 'Optional firepower' },
    ],
    /* Victoria's bonus is conditional all the way down -- the base pays "Operators
       CARRYING EQUIPMENT deal more damage" and the six-operator bonus pays them again
       -- and Catherine is the only operator in the roster who hands out equipment. She
       adds no stacks, which is why an arithmetic reading of her row called her a body
       making up the numbers. She is the condition the alliance is built on. */
    milestone: {
      wants: 'equipment carried',
      prefer: ['Catherine'],
    },
  },
  {
    alliance: 'Yan',
    steps: [
      { kind: 'start', take: ['Grain Buds'], why: 'Also the Agile pivot' },
      { kind: 'hunt', take: ['Hoshiguma', 'Blaze the Igniting Spark', 'Record Keeper', 'Dusk'] },
      { kind: 'stray', take: ['Swire the Elegant Wit', 'Tin Man', 'SilverAsh the Reignfrost', 'Mountain'], why: 'Trigger <When obtained> Yan units harder' },
      { kind: 'chase', take: ['Yu'], why: 'More Hoshiguma, Blaze the Igniting Spark and Record Keeper' },
      { kind: 'stray', take: ['Ptilopsis', 'Saria'], why: 'Make Yu generate more units' },
      { kind: 'stray', take: ['Qiubai'], why: 'Optional' },
    ],
    pairs: ['Investor'],
  },

  /* --- the add-ons ------------------------------------------------------- */
  {
    alliance: 'Aid',
    steps: [
      { kind: 'hunt', take: ['Podenco', 'Vendela', 'Perfumer'], why: 'Race the three for early stacking' },
      { kind: 'pivot', with: 'Victoria', take: ['Vendela'] },
      { kind: 'pivot', with: 'Kjerag', take: ['Kjera'] },
      { kind: 'pivot', with: 'Sargon', take: ['Carnelian'] },
    ],
    // Any of the three starts the stacking, so none of them alone is fatal.
    crucial: [['Podenco', 'Vendela', 'Perfumer']],
    notes: ['Race the three for early stacking, then swap them out towards whichever faction you are pivoting to.'],
  },
  {
    alliance: 'Agile',
    steps: [
      { kind: 'hunt', take: ['Tippi', 'Ayerscarpe'], any: true, why: 'Either one triggers the early stacking' },
      { kind: 'pivot', with: 'Yan', take: ['Grain Buds'] },
      { kind: 'pivot', with: 'Kjerag', take: ['Gnosis'] },
      { kind: 'pivot', with: 'Laterano', take: ['Archetto'] },
      { kind: 'pivot', with: 'Victoria', take: ['Catherine'] },
    ],
    crucial: [['Tippi', 'Ayerscarpe']],
    notes: ['The pivots are additions rather than swaps.'],
  },
  {
    alliance: 'Resilient',
    steps: [
      { kind: 'hunt', take: ['Liskarm', 'Gravel'], why: 'Both, for early stacking' },
      { kind: 'pivot', with: 'Victoria', take: ['Bagpipe'] },
      { kind: 'pivot', with: 'Ægir', take: ['Specter the Unchained'] },
      { kind: 'pivot', with: 'Raid', take: ['Surtr'] },
    ],
    crucial: [['Liskarm', 'Gravel']],
    notes: ['Liskarm is the one you swap out when pivoting; Gravel stays.'],
  },
  {
    alliance: 'Raid',
    steps: [
      { kind: 'hunt', take: ['Humus', 'Blemishine'], why: 'Both, for early stacking' },
      { kind: 'pivot', with: 'Ægir', take: ['Skadi'] },
      { kind: 'pivot', with: 'Siracusa', take: ['Texas the Omertosa'] },
      { kind: 'pivot', with: 'Resilient', take: ['Surtr'] },
    ],
    crucial: [['Humus', 'Blemishine']],
    notes: ['Either of the two can be swapped out, or the pivot unit simply added.'],
  },
  {
    alliance: 'Arcane',
    steps: [
      { kind: 'dispatch', to: 5, from: 4 },
      { kind: 'hunt', take: ['Dusk', 'Aroma'] },
      { kind: 'hunt', take: ['Ptilopsis', 'Saria'], any: true, why: 'Stack Dusk and Aroma harder' },
      { kind: 'stray', take: ['Lucilla'] },
    ],
    // Dusk and Aroma are the plan; Ptilopsis and Saria only stack them.
    crucial: [['Dusk'], ['Aroma']],
  },
  {
    alliance: 'Precision',
    steps: [
      { kind: 'hunt', take: ['Executor'], why: 'Triggers the early stacking' },
      /* They are placeholders, and the step below is where they are swapped out -- so
         they stop being worth taking at exactly the level that replaces them. */
      { kind: 'stray', take: ['Caper', 'Indigo'], any: true, when: { not: { dispatch: 4 } } },
      { kind: 'dispatch', to: 4, from: 3 },
      /* The swap, and the second thing the old shape could not hold: it is not a later
         hunt, it is a hunt that only exists once the Dispatch Center can sell it. */
      {
        kind: 'hunt',
        take: ['Kroos the Keen Glint', 'Leonhardt'],
        when: { dispatch: 4 },
        why: 'Swap Caper or Indigo out for these two and pair them together',
      },
      { kind: 'chase', take: ['Titi'], why: 'Stacks even harder' },
      { kind: 'pivot', with: 'Sargon', take: ['Titi', 'Passenger'] },
      { kind: 'pivot', with: 'Laterano', take: ['Executor', 'Lemuen'] },
      { kind: 'pivot', with: 'Yan', take: ['Kroos the Keen Glint'] },
      { kind: 'pivot', with: 'Kazimierz', take: ['Fartooth'] },
      { kind: 'pivot', with: 'Kjerag', take: ['Snow Hunter'] },
      { kind: 'pivot', with: 'Victoria', take: ['Reed the Flame Shadow'] },
    ],
  },
  {
    alliance: 'Durable',
    steps: [
      { kind: 'hunt', take: ['Vetochki', 'Cuora'], why: 'Both, for early stacking' },
      { kind: 'pivot', with: 'Kjerag', take: ['Matterhorn'] },
      { kind: 'pivot', with: 'Kazimierz', take: ['Ashlock'] },
      { kind: 'pivot', with: 'Sargon', take: ['Bubble'] },
      { kind: 'pivot', with: 'Ægir', take: ['Skadi'] },
      { kind: 'pivot', with: 'Laterano', take: ['Sankta Miksaparato'] },
    ],
    crucial: [['Vetochki', 'Cuora']],
    notes: ['Cuora is the one you swap out when pivoting; Vetochki stays.'],
  },
  {
    alliance: 'Foresight',
    steps: [
      { kind: 'hunt', take: ['Silence'], why: 'Triggers the early stacking' },
      { kind: 'dispatch', to: 4, from: 3 },
      { kind: 'hunt', take: ['Ines'] },
      { kind: 'stray', take: ['Pramanix', 'Swire', 'Bagpipe'], why: 'Silence needs these to function at all' },
      { kind: 'hunt', take: ['Ptilopsis', 'Saria'], any: true, why: 'Stack Silence and Ines harder' },
      { kind: 'chase', take: ['Santalla'], why: 'Stacks even harder' },
      { kind: 'pivot', with: 'Kjerag', take: ['Pramanix'] },
      { kind: 'pivot', with: 'Yan', take: ['Swire'] },
      { kind: 'pivot', with: 'Victoria', take: ['Bagpipe'] },
      { kind: 'pivot', with: 'Laterano', take: ['Executor the Ex Foedere'] },
    ],
  },
  {
    alliance: 'Investor',
    steps: [
      { kind: 'hunt', take: ['Swire the Elegant Wit', 'Tin Man'] },
      { kind: 'hunt', take: ['Mountain', 'SilverAsh the Reignfrost'], any: true, why: 'Either one is what truly triggers the alliance' },
    ],
    // Swire and Tin Man are both wanted; the trigger is either of the other two.
    crucial: [['Swire the Elegant Wit'], ['Tin Man'], ['Mountain', 'SilverAsh the Reignfrost']],
    pairs: ['Yan', 'Kjerag'],
  },
  {
    alliance: 'Harmony',
    steps: [
      { kind: 'strategy', take: ['Damazti Cluster'] },
      {
        kind: 'hunt',
        take: ['Saria', 'Rosmontis', 'Entelechia', 'Yu', 'Suzuran', 'Eyjafjalla the Hvít Aska', 'Lumen'],
        any: true,
        why: 'The usual targets. Any desired Tier V or VI operator works',
      },
    ],
    items: ['Damazti Isomorph'],
    // The listed units are examples, not requirements, so no ban on them breaks Harmony.
    crucial: [],
    notes: [
      'Set up rather than hunted. The Damazti Cluster strategy hands you a Damazti Isomorph every 5 rounds; equip it beside the item that matches your core faction and the operator holding both is treated as a member of that alliance.',
    ],
  },
];

/** Dispatch tiers in order, so one can be compared. NOT by string length: that sorts
 *  V before II and IV before III. */
const TIER_ORDER = ['I', 'II', 'III', 'IV', 'V', 'VI'];

/**
 * Cheapest first, always.
 *
 * A row of portraits is read left to right, and what the player wants from it first is
 * what the Dispatch Center can hand them NOW. Sorting by tier puts the answer to that
 * at the start of every row, and puts the Tier VI you are saving towards at the end of
 * it, which is the order the run happens in.
 */
export function byTier(a: StrongholdOperator, b: StrongholdOperator): number {
  return TIER_ORDER.indexOf(a.tier) - TIER_ORDER.indexOf(b.tier)
    || a.operator.localeCompare(b.operator);
}

/**
 * Names the guide uses that the roster spells differently. Keyed by folded form.
 * Kept deliberately short: an alias is a place for a mistake to hide, so anything
 * that can be written the roster's way is written the roster's way.
 */
const ALIASES: Record<string, string> = {
  'swire alter': 'Swire the Elegant Wit',
};

const byFold = (name: string) => ALIASES[foldName(name)] ?? name;

/** The operator names a step names. A strategy step names a leader, not an operator,
 *  so it is not one of these -- it is checked against the strategy list instead. */
function opNamesIn(step: Step): string[] {
  if (step.kind === 'strategy' || step.kind === 'dispatch') return [];
  return step.take;
}

/** Operator names a guard mentions, so they are checked like every other name here. */
function guardNames(guard: Guard | undefined): string[] {
  if (!guard) return [];
  if ('has' in guard) return guard.has;
  if ('not' in guard) return guardNames(guard.not);
  if ('and' in guard) return guard.and.flatMap(guardNames);
  return [];
}

/** Alliance names a guard mentions. */
function guardAlliances(guard: Guard | undefined): string[] {
  if (!guard) return [];
  if ('active' in guard) return [guard.active];
  if ('not' in guard) return guardAlliances(guard.not);
  if ('and' in guard) return guard.and.flatMap(guardAlliances);
  return [];
}

/** Every operator name a plan mentions, in one list. */
export function namesIn(plan: AlliancePlan): string[] {
  return [
    ...plan.steps.flatMap((st) => [...opNamesIn(st), ...guardNames(st.when)]),
    ...(plan.milestone?.prefer ?? []),
  ].map(byFold);
}



/**
 * The alliances a player can actually set out to BUILD.
 *
 * Narrower than the full list on purpose, and only for screens that ask someone to
 * choose. Three of them are not alliances you pursue, they are things that happen:
 * Elite counts the operators you have combined, Solo pays only while exactly one of
 * them is out, and Assist Operator is who the game lent you. Each arrives as a
 * consequence of a run rather than as a plan for one, and offering them beside Kjerag
 * invites aiming at something that cannot be aimed at.
 *
 * It lives here rather than beside alliancesForPicker because stronghold.ts reads the
 * datasets off disk, so importing it into anything that renders drags  into the
 * browser bundle. This is a filter over an array and needs none of that.
 *
 * The wiki still lists all three, because the wiki describes the mode rather than
 * helping you play a run of it, and a mechanic left undocumented is a different kind
 * of wrong.
 */
/* Solo and Assist Operator came back for the ban list: Texas is Solo AND Siracusa, so
   with Solo unbannable she could never drop out however much was banned. Elite stays
   out -- it is the count of combined operators, not a thing to build or refuse. */
const NOT_AIMED_AT = ['Elite'];

export function buildableAlliances<T extends { alliance: string }>(rows: T[]): T[] {
  return rows.filter((a) => !NOT_AIMED_AT.includes(a.alliance));
}

/**
 * Fails the build rather than the run.
 *
 * A plan that names an operator this season does not have sends the player hunting
 * something the shop can never offer, and it would do so silently -- the name simply
 * would not match anything and the advice would quietly omit it. Better to not build.
 */
export function assertPlaybook(data: StrongholdData): void {
  const ops = new Set(data.operators.map((o) => foldName(o.operator)));
  const items = new Set(data.items.map((i) => foldName(i.name)));
  const alliances = new Set(data.alliances.map((a) => foldName(a.alliance)));
  const strategies = new Set(data.strategies.map((x) => foldName(x.leader)));
  const bad: string[] = [];

  for (const plan of PLAYBOOK) {
    if (!alliances.has(foldName(plan.alliance))) bad.push(`alliance "${plan.alliance}"`);
    for (const n of namesIn(plan)) {
      if (!ops.has(foldName(n))) bad.push(`${plan.alliance}: operator "${n}"`);
    }
    for (const i of plan.items ?? []) {
      if (!items.has(foldName(i))) bad.push(`${plan.alliance}: item "${i}"`);
    }
    for (const st of plan.steps) {
      if (st.kind === 'strategy') {
        for (const leader of st.take) {
          if (!strategies.has(foldName(leader))) bad.push(`${plan.alliance}: strategy "${leader}"`);
        }
      }
      /* An alliance named by a pivot or by an `active` guard is checked too. A guard
         on an alliance the season renamed would silently never pass, which is the
         same class of quiet failure as a misspelt operator. */
      for (const a of [
        ...(st.kind === 'pivot' ? [st.with] : []),
        ...guardAlliances(st.when),
      ]) {
        if (!alliances.has(foldName(a))) bad.push(`${plan.alliance}: alliance "${a}"`);
      }
    }
    for (const p of plan.pairs ?? []) {
      if (!alliances.has(foldName(p))) bad.push(`${plan.alliance}: pairs with "${p}"`);
    }
  }
  if (bad.length) {
    throw new Error(`Stronghold playbook does not match the roster:\n  ${bad.join('\n  ')}`);
  }
}

/* --- what the chosen strategy pays you to do --------------------------------- */

export interface StrategyNudge {
  /** Alliances the strategy literally pays you to buy into. */
  favours?: string[];
  /** Duplicates come easier, so a triple copy chase is cheaper than usual. */
  chases?: boolean;
  /** 'spread' rewards many active alliances, 'focus' rewards exactly one. */
  breadth?: 'spread' | 'focus';
  /** The clause this was read off, so the advice can quote the reason. */
  why: string;
}

/**
 * Strategies whose effect changes what is worth buying, keyed by folded leader.
 *
 * Only the ones that say so outright. Most of the 36 are about surviving, funds or
 * the battle itself, and inventing a shopping preference from those would be guessing
 * dressed as advice -- they are simply absent, and absent means neutral. Every entry
 * here paraphrases its own effect text and nothing more.
 */
export const STRATEGY_NUDGES: Record<string, StrategyNudge> = {
  sciurus: { favours: ['Kjerag'], why: 'First Kjerag op each round costs 1 Fund' },
  harold: { favours: ['Victoria'], why: 'A Victoria op every 2 rounds from round 4' },
  paganini: { favours: ['Laterano'], why: '55 Funds spent gives a Tier IV+ Laterano' },
  clementia: { favours: ['Ægir'], why: 'A defeated Ægir op refunds its stacks' },
  'mlynar': { favours: ['Kazimierz'], why: 'Each Kazimierz op refunds a Fund' },
  chiave: { favours: ['Siracusa'], why: 'Every 6 refreshes grants a Siracusa op' },
  /* The three the table was missing. A squad that pays for an alliance is the closest
     thing to a decision already made, so each one names the alliance it points at. */
  pepe: { favours: ['Sargon'], why: 'The squad points at Sargon' },
  narantuya: { favours: ['Sargon'], why: 'The squad points at Sargon' },
  orchid: { chases: true, why: 'Every refresh offers 2 of the same op' },
  'du yaoye': { favours: ['Yan'], chases: true, why: 'First two refreshes each round are duplicates' },
  dusk: { chases: true, why: 'Duplicates on the field get +30% ATK' },
  amiya: { breadth: 'spread', why: '3/4/5 alliances give +20/30/40% ATK and HP' },
  yu: { breadth: 'focus', why: 'Round 8: +36 stacks to one alliance, +12 if more' },
};

/** The nudge for a chosen strategy, if it has one. */
export function nudgeFor(strategy: string | null | undefined): StrategyNudge | null {
  if (!strategy) return null;
  return STRATEGY_NUDGES[foldName(strategy)] ?? null;
}
