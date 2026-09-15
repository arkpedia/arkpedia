import { SkillTechnique } from '../operators/operatorTypes';

/** Each rule scans skill/talent description text for any of its
 * keywords, and if found (within the given rarity range), generates a
 * shared technique entry automatically -- named after the rule itself,
 * so every operator matching the same rule groups together under one
 * heading on the Techniques page, exactly like a manually-authored
 * technique would.
 *
 * Confirmed rules (all rarities):
 *   - "Fragile" -> "Standard Fragility": "Increases all types of damage
 *     taken by a certain amount (cannot stack, only highest applies)."
 *   - "Physical Fragility": "Increases physical damage taken by a
 *     certain amount (cannot stack, only highest applies)."
 *   - "Arts Fragility": "Increases arts damage taken by a certain
 *     amount (cannot stack, only highest applies)."
 *   - "Elemental Fragility": "Increases elemental damage taken by a
 *     certain amount (cannot stack, only highest applies)."
 *
 * These four are a special case on the Techniques page -- rather than
 * appearing as four separate groups, they're presented under one
 * "Fragility" umbrella section on the same page (pages/techniques.tsx)
 * since they interact with each other (same-type doesn't stack,
 * different-type stacks multiplicatively).
 *
 * Statuses (all rarities, no restriction given for this category):
 *   - "Bind"/"Binds": "Unable to move, can still be shifted,
 *     and can still attack and use special abilities."
 *   - "Stun": "Unable to move, attack, or use special abilities, can
 *     remove Low-Hovering statuses."
 *   - "Levitate": "Unable to move, attack, or use special abilities,
 *     becomes an aerial enemy. Enemies with weight 3 or above gets half
 *     the levitation time."
 *   - "Lure": "Move enemies to a specific position taking precedence
 *     over their taken route, but cannot be blocked."
 *   - "Fear": "Move away from the unit taking precedence over their
 *     taken route, but cannot be blocked."
 *   - "Cold"/"Freeze"/"Frozen" -> "Cold / Freeze": "After being hit by
 *     two Cold or one Freeze, become frozen. Unable to move, attack, or
 *     use special skills, -15 RES."
 *   - "Sleep": "Unable to move, attack, use special abilities, be
 *     attacked unless a unit bypasses this status."
 *   - "Weightless": "Lowers weight of enemies by 1, cannot be
 *     stacked."
 *   - "Silence"/"disable": "Disable special abilities of enemies if possible."
 *
 * Same special-case treatment as Fragility -- one "Statuses" umbrella
 * section on the same Techniques page instead of separate groups.
 */
interface AutoTechniqueRule {
  keywords?: string[]; // matches if ANY of these appear -- mutually exclusive with requireAllOf
  requireAllOf?: string[][]; // AND-of-ORs matching -- every inner group needs at least one match. E.g. [['recover','recovers','restore','restores'], ['hp']] means (recover-family) AND (hp) must BOTH be present. Word-boundary matched, so short keywords like "sp" don't false-positive inside longer words like "ASPD".
  requireOrdered?: boolean; // for a 2-group requireAllOf, the first group's match must occur BEFORE the last group's match -- e.g. "recovers 20 DP... restores the HP" has an unrelated "recovers" before the real "restores...HP" pair; without order-awareness the wrong (earlier, unrelated) verb gets picked for both validity and highlighting. Picks the CLOSEST valid before/after pair, not just the first occurrence of each.
  maxGap?: number; // caps how far apart (in characters) the requireOrdered pair can be -- without this, a generic word like "take" with no closer match could still pair with a distant, unrelated occurrence of the second group. Omit for unlimited (Self-Sustain's recover/hp pairing has no such risk since both are specific enough).
  statPattern?: string; // matches "{statPattern} ... -{number}%?" within the same clause (e.g. "DEF ... -50%") -- for stat-debuff searches. Distinct from requireAllOf/requireOrdered: only highlightSeparately controls how the two pieces render, since the text between them (e.g. "of enemies around the Curse Doll by") isn't meant to be highlighted, unlike Self-Sustain's full-span highlight.
  highlightSeparately?: boolean; // renders matchedKeyword and matchedKeywordEnd as two independent highlighted spans instead of highlighting the whole range between them
  skillsOnly?: boolean; // this rule only ever scans skill text -- talent text is skipped entirely for this rule, regardless of keyword match
  excludeWords?: string[]; // words stripped from the text before matching -- e.g. "stunned" contains "stun" as a substring but doesn't count as the Stun status itself
  excludePatterns?: RegExp[]; // same idea as excludeWords, but for patterns with variable text that a plain string can't cover
  exemptOperators?: string[]; // these operators skip excludeWords entirely -- for cases where the general exclusion would incorrectly disqualify a specific operator who genuinely has the effect
  excludeOperators?: string[]; // these operators NEVER match this rule, regardless of keyword -- the opposite direction from exemptOperators, for a specific operator whose text happens to contain the keyword in an unrelated sense
  excludeBranches?: string[]; // operators of these branches never match this rule, regardless of keyword -- e.g. actual Push Stroker-branch pushers shouldn't count as "Pseudo-Pusher"
  includeBranches?: string[]; // operators of these branches ALWAYS match this rule, regardless of keyword -- for cases where the effect is real but the text doesn't literally contain any of the rule's keywords (e.g. lifesteal-based branches describing HP drain without saying "recovers"/"restore")
  excludeClasses?: string[]; // operators of these classes never match this rule, regardless of keyword -- distinct from excludeBranches (class is the broader category, e.g. "Medic", branch is the narrower one within it, e.g. "Multi-target Medic")
  showBranchIcon?: boolean; // display the operator's branch icon as the badge instead of the skill/talent icon -- for techniques where the branch itself is the relevant grouping, not which specific skill/talent triggered it
  name: string;
  description: string;
  minRarity: number;
  maxRarity: number;
}

/** Word-boundary test for a single keyword against already-lowercased
 * text -- e.g. "sp" as a bare substring would match inside "ASPD"
 * (Attack Speed), which has nothing to do with Skill Points. \b on
 * both sides prevents that, at the cost of needing both the singular
 * and pluralized/conjugated forms listed explicitly in requireAllOf's
 * groups (word-boundary "restore" does NOT match "restores", since the
 * boundary fails right at the trailing "s"). */
function wordMatches(lowerText: string, keyword: string): boolean {
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`\\b${escaped}\\b`, 'i').test(lowerText);
}

/** For order-aware rules: finds every position where any word in
 * startWords occurs, and every position where any word in endWords
 * occurs, then returns the CLOSEST pair where a start genuinely comes
 * before an end -- not just the first occurrence of each independently,
 * which would pick up an unrelated earlier verb (e.g. Wanqing's DP-
 * related "recovers" occurring before the real "restores...HP" pair
 * later in the same sentence). Returns null if no valid ordering
 * exists at all (e.g. every "hp" mention comes before every verb). */
/* A clause break is ';' or a full stop that is not a decimal point. The digit guard is
   not optional: Gladiia's talent reads "recover 2.5% of Max HP per second", and without
   it the '.' in 2.5 ends the clause between "recover" and "Max HP", taking her
   Self-Sustain with it -- along with Thorns's "restores 4% (+0.5%) max HP", SilverAsh
   the Reignfrost's and Yu's. Four real matches for five false ones is not a fix. The
   same care the stat patterns already take with a minus sign attached to a digit. */
const CLAUSE_BREAK = /[;]|(?<![0-9])\.(?![0-9])/;

function findClosestOrderedPair(
  lowerText: string,
  startWords: string[],
  endWords: string[],
  maxGap?: number
): { startWord: string; startIdx: number; endWord: string; endIdx: number } | null {
  const starts: { word: string; idx: number }[] = [];
  for (const w of startWords) {
    const re = new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
    let m;
    while ((m = re.exec(lowerText))) starts.push({ word: w, idx: m.index });
  }
  const ends: { word: string; idx: number }[] = [];
  for (const w of endWords) {
    const re = new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
    let m;
    while ((m = re.exec(lowerText))) ends.push({ word: w, idx: m.index });
  }
  let best: { startWord: string; startIdx: number; endWord: string; endIdx: number; gap: number } | null = null;
  for (const s of starts) {
    for (const e of ends) {
      if (s.idx < e.idx) {
        const gap = e.idx - s.idx;
        if (maxGap !== undefined && gap > maxGap) continue;
        /* The pair must sit in ONE clause. Without this the window is pure character
           distance, so a start word at the end of one skill level pairs with an end
           word at the start of the next -- the same seam that gave Haze ASPD Down,
           reached by a different rule. Joining the levels with ' ; ' fixed statPattern,
           which already stops at '.' and ';', and left these five: Crackborne
           Self-Sustain, Surfer Steal ASPD, Ines Steal ATK, and Viviana both Steal ATK
           and Steal DEF. A phrase that means one thing does not span two sentences. */
        if (CLAUSE_BREAK.test(lowerText.slice(s.idx, e.idx))) continue;
        if (!best || gap < best.gap) best = { startWord: s.word, startIdx: s.idx, endWord: e.word, endIdx: e.idx, gap };
      }
    }
  }
  return best;
}

/** For statPattern rules (DEF/RES/ATK/ASPD/Movement Speed/Hit Rate
 * Down): finds the closest "{statWord} ... -{number}%?" pair within
 * the same clause (bounded by . or ; so it doesn't reach across
 * unrelated sentences), OR the reversed "-{number}%? {statWord}"
 * pattern when the number sits directly in front (e.g. "inflicts
 * -30% RES"). Returns the stat word's own text and the number's own
 * text separately -- unlike findClosestOrderedPair's span use, the
 * words BETWEEN them (e.g. "of enemies around the Curse Doll by")
 * are never meant to highlight, only the two tokens themselves.
 * Returns null if no valid match.
 *
 * The four abbreviations (ATK/DEF/RES/ASPD) must match EXACT
 * uppercase in the ORIGINAL (non-lowercased) text -- rigid by design,
 * since the game consistently writes them that way and this avoids
 * any accidental case-insensitive false positive. "movement speed"
 * and "hit rate" stay case-insensitive since they're full phrases,
 * not all-caps abbreviations, and the game doesn't write them in all
 * caps. */
const RIGID_STAT_WORDS = ['ATK', 'DEF', 'RES', 'ASPD'];
// Every word that could plausibly own a nearby minus-number and cause
// a false attribution to a DIFFERENT stat word searched for -- this
// includes every stat-debuff concept itself (so ATK doesn't claim a
// number that actually belongs to Movement Speed, and vice versa) AND
// known unrelated concepts like "Cost" (DP cost reduction, e.g. "ATK
// +15%, Cost -3" -- the -3 belongs to Cost, not ATK, even though
// Cost isn't a stat-debuff technique itself), "redeployment time"
// (e.g. "ATK +120%, redeployment time -40%"), and "targets healed"
// (e.g. "ATK +140%, targets healed -1" -- a healing-target counter,
// not a stat-debuff technique itself, just needs to be recognized so
// it doesn't get misattributed to a nearby stat).
const ALL_INTERFERE_WORDS = ['ATK', 'DEF', 'RES', 'ASPD', 'movement speed', 'hit rate', 'cost', 'redeployment time', 'targets healed'];

function findStatMinusNumber(originalText: string, statWord: string): { statMatch: string; numberMatch: string } | null {
  const isRigid = RIGID_STAT_WORDS.includes(statWord);
  const escaped = statWord.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const flags = isRigid ? 'g' : 'gi';
  // The minus sign must NOT be directly attached to a letter/digit --
  // fixes unit names like "Cherry-3" being misread as a "-3" stat
  // modifier (confirmed: Mitm's own summon is literally named that).
  const forwardPattern = new RegExp(`\\b(${escaped})\\b([^.;]*?)(?<![a-zA-Z0-9])(-\\d+%?)`, flags);
  const reversedPattern = new RegExp(`(-\\d+%?)\\s*\\b(${escaped})\\b`, flags);

  function isInterfered(between: string): boolean {
    const others = ALL_INTERFERE_WORDS.filter((w) => w.toUpperCase() !== statWord.toUpperCase() && new RegExp(`\\b${w}\\b`, 'i').test(between));
    // Reject only if the OTHER word found isn't immediately adjacent
    // (connected by just "and"/"," with nothing else) -- that's a
    // coordinated compound subject sharing the same trailing modifier
    // (e.g. "ATK and DEF... by -50%" reduces both), as opposed to
    // "ATK [unrelated clause] DEF -30" where the number genuinely
    // belongs to DEF alone, not ATK.
    return others.some((w) => {
      const idx = between.search(new RegExp(`\\b${w}\\b`, 'i'));
      const beforeOther = between.slice(0, idx).trim();
      return !/^(and|,)?$/i.test(beforeOther);
    });
  }

  // Rejects a forward-pattern candidate when the matched number is
  // immediately followed by a DIFFERENT stat word -- that means the
  // number genuinely belongs to THAT stat via the reversed pattern
  // (e.g. "-30% RES", "-35% DEF"), not the one currently being
  // searched forward. Without this, "...ATK as Arts damage... inflicts
  // -30% RES..." would wrongly let ATK's forward search grab RES's own
  // "-30%", since nothing between ATK and the number itself signals
  // interference -- the giveaway only appears AFTER the number.
  function isOwnedByFollowingStat(numberEndIdx: number): boolean {
    const after = originalText.slice(numberEndIdx, numberEndIdx + 20);
    return ALL_INTERFERE_WORDS.some((w) => w.toUpperCase() !== statWord.toUpperCase() && new RegExp(`^\\s*\\b${w}\\b`, 'i').test(after));
  }

  let m: RegExpExecArray | null;
  while ((m = forwardPattern.exec(originalText))) {
    const numberEndIdx = m.index + m[0].length;
    if (isOwnedByFollowingStat(numberEndIdx)) continue;
    if (!isInterfered(m[2])) return { statMatch: m[1], numberMatch: m[3] };
  }
  const rm = reversedPattern.exec(originalText);
  if (rm) return { statMatch: rm[2], numberMatch: rm[1] };
  return null;
}

export const FRAGILITY_TECHNIQUE_NAMES = ['Standard Fragility', 'Physical Fragility', 'Arts Fragility', 'Elemental Fragility'];
export const STATUS_TECHNIQUE_NAMES = ['Bind', 'Stun', 'Levitate', 'Lure', 'Fear', 'Cold / Freeze', 'Sleep', 'Weightless', 'Silence', 'Teleport', 'Frighten', 'Slow'];
export const DAMAGE_NEGATION_TECHNIQUE_NAMES = ['Invulnerable', 'Immortality', 'Invisibility', 'Camouflage', 'damage-instance shields'];
export const STATS_DEBUFF_TECHNIQUE_NAMES = ['DEF Down', 'RES Down', 'ATK Down', 'ASPD Down', 'Movement Speed Down', 'Hit Rate Down'];
export const ENHANCE_ARTS_DAMAGE_TECHNIQUE_NAMES = ['RES Down', 'Arts Fragility', 'Arts Damage Taken', 'Standard Fragility', 'Cold / Freeze', 'Burn'];
export const ENHANCE_PHYSICAL_DAMAGE_TECHNIQUE_NAMES = ['DEF Down', 'Physical Fragility', 'Physical Damage Taken', 'Standard Fragility', 'Steal DEF'];
export const ELEMENTAL_DAMAGE_TECHNIQUE_NAMES = ['Burn', 'Necrosis', 'Nervous Impairment'];
export const STEAL_TECHNIQUE_NAMES = ['Steal ATK', 'Steal ASPD', 'Steal DEF'];
// The old catch-all "AFK" technique (embedded directly per-skill in
// each operator's own data, like every umbrella member here) was split
// into these four based on how the skill actually goes "infinite" --
// see scripts/migrate-afk-technique.js for the exact rules used to
// reassign every operator who previously had plain "AFK".
export const AFK_TECHNIQUE_NAMES = ['Manually-Activated', 'Self-Activated', 'Offensive Recovery', 'Defensive Recovery'];

// Umbrella name -> its member technique names, in the canonical display
// order (not alphabetical) -- e.g. Fragility always shows Standard,
// Physical, Arts, Elemental in that order regardless of how the member
// groups themselves happen to sort. Shared between the Techniques page
// (which renders these as sections) and the operator detail page
// (which needs to know whether a given technique belongs to an
// umbrella with its own definition, to show that alongside it).
export const UMBRELLA_MEMBERS: Record<string, string[]> = {
  Fragility: FRAGILITY_TECHNIQUE_NAMES,
  Statuses: STATUS_TECHNIQUE_NAMES,
  'Damage Negation': DAMAGE_NEGATION_TECHNIQUE_NAMES,
  'Stats Debuff': STATS_DEBUFF_TECHNIQUE_NAMES,
  'Enhance Arts Damage': ENHANCE_ARTS_DAMAGE_TECHNIQUE_NAMES,
  'Enhance Physical Damage': ENHANCE_PHYSICAL_DAMAGE_TECHNIQUE_NAMES,
  'Elemental Damage': ELEMENTAL_DAMAGE_TECHNIQUE_NAMES,
  Steal: STEAL_TECHNIQUE_NAMES,
  AFK: AFK_TECHNIQUE_NAMES,
};
// Umbrella name -> its own description -- only umbrellas with real
// stacking/interaction rules that aren't obvious from their members
// alone have one (Enhance Arts Damage, Elemental Damage, Steal).
export const UMBRELLA_DESCRIPTIONS: Record<string, string> = {
  'Enhance Arts Damage':
    'Same fragility cannot be stacked, only highest amount is taken, different ones can, but RES Down and Arts Damage Taken can stack.',
  'Elemental Damage': 'Explodes for 1000 Elemental Damage to Normal and 2000 to Elites and Leaders.',
  Steal: 'Takes the stat away from the enemy and inherit for themselves (if the unit has capped out steal bonus, other enemies can still be debuffed).',
  AFK: 'Use this skill for a drop-and-forget or a hands-free experience',
};
// technique name -> every umbrella it belongs to -- a technique can
// belong to more than one umbrella at once (e.g. RES Down is a member
// of both Stats Debuff and the cross-cutting Enhance Arts Damage), so
// this is multi-valued rather than a single umbrella name.
export const MEMBER_TO_UMBRELLA: Record<string, string[]> = {};
for (const [umbrella, members] of Object.entries(UMBRELLA_MEMBERS)) {
  for (const m of members) {
    if (!MEMBER_TO_UMBRELLA[m]) MEMBER_TO_UMBRELLA[m] = [];
    MEMBER_TO_UMBRELLA[m].push(umbrella);
  }
}

const AUTO_TECHNIQUE_RULES: AutoTechniqueRule[] = [
  {
    keywords: ['Fragile'],
    name: 'Standard Fragility',
    description: 'Increases all types of damage taken by a certain amount (cannot stack, only highest applies).',
    minRarity: 1,
    maxRarity: 6,
  },
  {
    keywords: ['Physical Fragility'],
    name: 'Physical Fragility',
    description: 'Increases physical damage taken by a certain amount (cannot stack, only highest applies).',
    minRarity: 1,
    maxRarity: 6,
  },
  {
    keywords: ['Arts Fragility'],
    name: 'Arts Fragility',
    description: 'Increases arts damage taken by a certain amount (cannot stack, only highest applies).',
    minRarity: 1,
    maxRarity: 6,
  },
  {
    keywords: ['Elemental Fragility'],
    name: 'Elemental Fragility',
    description: 'Increases elemental damage taken by a certain amount (cannot stack, only highest applies).',
    minRarity: 1,
    maxRarity: 6,
  },
  {
    keywords: ['Bind', 'Binds'],
    name: 'Bind',
    description: 'Unable to move, can still be shifted, and can still attack and use special abilities.',
    minRarity: 1,
    maxRarity: 6,
  },
  {
    keywords: ['Stun'],
    excludeWords: ['stunned'],
    exemptOperators: ['Spuria', 'Manticore'],
    name: 'Stun',
    description: 'Unable to move, attack, or use special abilities, can remove Low-Hovering statuses.',
    minRarity: 1,
    maxRarity: 6,
  },
  {
    keywords: ['Levitate'],
    name: 'Levitate',
    description: 'Unable to move, attack, or use special abilities, becomes an aerial enemy. Enemies with weight 3 or above gets half the levitation time.',
    minRarity: 1,
    maxRarity: 6,
  },
  {
    keywords: ['Lure'],
    name: 'Lure',
    description: 'Move enemies to a specific position taking precedence over their taken route, but cannot be blocked.',
    minRarity: 1,
    maxRarity: 6,
  },
  {
    keywords: ['Fear'],
    name: 'Fear',
    description: 'Move away from the unit taking precedence over their taken route, but cannot be blocked.',
    minRarity: 1,
    maxRarity: 6,
  },
  {
    keywords: ['Cold', 'Freeze', 'Frozen'],
    excludeOperators: ['Lee'],
    name: 'Cold / Freeze',
    description: 'After being hit by two Cold or one Freeze, become frozen. Unable to move, attack, or use special skills, -15 RES.',
    minRarity: 1,
    maxRarity: 6,
  },
  {
    keywords: ['Sleep'],
    name: 'Sleep',
    description: 'Unable to move, attack, use special abilities, be attacked unless a unit bypasses this status.',
    minRarity: 1,
    maxRarity: 6,
  },
  {
    keywords: ['Weightless'],
    name: 'Weightless',
    description: 'Lowers weight of enemies by 1, cannot be stacked.',
    minRarity: 1,
    maxRarity: 6,
  },
  {
    keywords: ['Silence', 'disable'],
    name: 'Silence',
    description: 'Disable special abilities of enemies if possible.',
    minRarity: 1,
    maxRarity: 6,
  },
  {
    keywords: ['teleport'],
    name: 'Teleport',
    description: 'Teleport units to a specific location.',
    minRarity: 1,
    maxRarity: 6,
  },
  {
    keywords: ['frighten'],
    name: 'Frighten',
    description: 'Disarms the enemy being blocked, making them unable to attack.',
    minRarity: 1,
    maxRarity: 6,
  },
  {
    keywords: ['slow'],
    name: 'Slow',
    description: 'Reduce the movement speed of the enemies by 80% (does not reduce further with other slow applications, but can add to the slow time. Can stack with movement speed down applications).',
    minRarity: 1,
    maxRarity: 6,
  },
  {
    requireAllOf: [
      ['recover', 'recovers', 'restore', 'restores'],
      ['hp'],
    ],
    requireOrdered: true,
    excludeClasses: ['Medic'],
    includeBranches: ['Reaper', 'Juggernaut', 'Soloblade', 'Guardian'],
    showBranchIcon: true,
    name: 'Self-Sustain',
    description: 'Recovers HP on their own without the use of other healers.',
    minRarity: 1,
    maxRarity: 6,
  },
  {
    requireAllOf: [['sp', 'skill point', 'skill points']],
    name: 'SP Charging',
    description: 'Provides more SP to self or others.',
    minRarity: 1,
    maxRarity: 6,
  },
  {
    keywords: ['push', 'bump', 'knock'],
    excludeBranches: ['Push Stroker'],
    name: 'Pseudo-Pusher',
    description: "Can behave like a 'pusher'.",
    minRarity: 1,
    maxRarity: 6,
  },
  {
    keywords: ['pull', 'drag'],
    excludeBranches: ['Hookmaster'],
    name: 'Pseudo-Puller',
    description: "Can behave like a 'puller'.",
    minRarity: 1,
    maxRarity: 6,
  },
  {
    keywords: ['barrier'],
    name: 'Barrier Generation',
    description: 'Gains barrier that acts like a second HP bar, needing to reach 0 before affecting their HP.',
    minRarity: 1,
    maxRarity: 6,
  },
  {
    keywords: ['deactivate'],
    excludeOperators: ['Terra Research Commission'],
    name: 'Skill Control',
    description: 'Disable the skill to allow quicker subsequent uses.',
    minRarity: 1,
    maxRarity: 6,
  },
  {
    keywords: ['switch', 'swap'],
    excludeOperators: ['Breeze', 'Beehunter', 'SilverAsh the Reignfrost'],
    excludeBranches: ['Dollkeeper'],
    name: 'Switch State',
    description: 'Allows you to switch different forms of this unit.',
    minRarity: 1,
    maxRarity: 6,
  },
  {
    keywords: ['ammo'],
    skillsOnly: true,
    name: 'Ammo-based Skills',
    description: 'Skill has a specified number of ammunition to be used before ending.',
    minRarity: 1,
    maxRarity: 6,
  },
  {
    keywords: ['charges', 'charge'],
    includeBranches: ['Mystic Caster'],
    name: 'Hold Charges',
    description: 'Holds the charge(s) until the enemies are within range to be used.',
    minRarity: 1,
    maxRarity: 6,
  },
  {
    statPattern: 'DEF',
    highlightSeparately: true,
    excludeOperators: ['SilverAsh', 'Mountain', 'Matoimaru', 'Istina'],
    name: 'DEF Down',
    description: "Lower enemies' DEF.",
    minRarity: 1,
    maxRarity: 6,
  },
  {
    statPattern: 'RES',
    highlightSeparately: true,
    name: 'RES Down',
    description: "Lower enemies' RES.",
    minRarity: 1,
    maxRarity: 6,
  },
  {
    statPattern: 'ATK',
    highlightSeparately: true,
    name: 'ATK Down',
    description: "Lower enemies' ATK.",
    minRarity: 1,
    maxRarity: 6,
  },
  {
    statPattern: 'ASPD',
    highlightSeparately: true,
    excludeOperators: ['Perfumer'],
    name: 'ASPD Down',
    description: "Lower enemies' ASPD.",
    minRarity: 1,
    maxRarity: 6,
  },
  {
    statPattern: 'movement speed',
    highlightSeparately: true,
    name: 'Movement Speed Down',
    description: "Lower enemies' Movement Speed.",
    minRarity: 1,
    maxRarity: 6,
  },
  {
    statPattern: 'hit rate',
    highlightSeparately: true,
    name: 'Hit Rate Down',
    description: "Lower enemies' hit rate.",
    minRarity: 1,
    maxRarity: 6,
  },
  {
    keywords: ['overload', 'Charged'],
    name: 'Overload / Charged',
    description: 'Skill enters a second state that is stronger than the first.',
    minRarity: 1,
    maxRarity: 6,
  },
  {
    keywords: ['status resistance'],
    name: 'Status Resistance',
    description: 'Reduces the duration of negative statuses received by 50%.',
    minRarity: 1,
    maxRarity: 6,
  },
  {
    keywords: ['arts damage taken'],
    excludePatterns: [/reduces[^.;]*?arts damage taken/gi],
    name: 'Arts Damage Taken',
    description: 'Increase the arts damage taken by enemies.',
    minRarity: 1,
    maxRarity: 6,
  },
  {
    // Same technique, different phrasing -- "Enemies in range take +18%
    // Arts damage when Stunned" instead of "Arts damage taken +18%".
    requireAllOf: [
      ['take', 'takes'],
      ['arts damage'],
    ],
    requireOrdered: true,
    maxGap: 30,
    name: 'Arts Damage Taken',
    description: 'Increase the arts damage taken by enemies.',
    minRarity: 1,
    maxRarity: 6,
  },
  {
    keywords: ['burn'],
    excludeOperators: ['Tachanka', 'Firewhistle'],
    name: 'Burn',
    description: 'Deals 7000 Elemental Damage, RES -20 for 10 seconds (recovery time).',
    minRarity: 1,
    maxRarity: 6,
  },
  {
    keywords: ['necrosis'],
    name: 'Necrosis',
    description: 'Deals 800 Elemental Damage per second over 15s. Inflicts Enfeeble which reduces ATK by 50% but decays over the 15s (recovery time).',
    minRarity: 1,
    maxRarity: 6,
  },
  {
    keywords: ['nervous impairment'],
    name: 'Nervous Impairment',
    description: 'Deals an instant 6000 Elemental Damage and 3 stacks of Paralysis, recovers in 10 seconds.',
    minRarity: 1,
    maxRarity: 6,
  },
  {
    requireAllOf: [
      ['steal', 'steals'],
      ['atk'],
    ],
    requireOrdered: true,
    excludeOperators: ['Exusiai the New Covenant'],
    name: 'Steal ATK',
    description: 'Takes ATK away from the enemy and inherit for themselves. After reaching cap steal bonus, other enemies may still be debuffed.',
    minRarity: 1,
    maxRarity: 6,
  },
  {
    requireAllOf: [
      ['steal', 'steals'],
      ['aspd'],
    ],
    requireOrdered: true,
    excludeOperators: ['Exusiai the New Covenant'],
    name: 'Steal ASPD',
    description: 'Takes ASPD away from the enemy and inherit for themselves. After reaching cap steal bonus, other enemies may still be debuffed.',
    minRarity: 1,
    maxRarity: 6,
  },
  {
    requireAllOf: [
      ['steal', 'steals'],
      ['def'],
    ],
    requireOrdered: true,
    excludeOperators: ['Exusiai the New Covenant'],
    name: 'Steal DEF',
    description: 'Takes DEF away from the enemy and inherit for themselves. After reaching cap steal bonus, other enemies may still be debuffed.',
    minRarity: 1,
    maxRarity: 6,
  },
];

/** Scans the given text(s) for every confirmed keyword rule that applies
 * to this rarity, returning any auto-generated technique entries found.
 * Multiple source texts (e.g. every SkillLevel's description, or every
 * TalentRow's description) can be passed at once -- a match in ANY of
 * them counts, since the keyword might only appear at certain skill
 * levels or promotion stages. Each rule matches on ANY of its keywords,
 * not all of them -- e.g. Bind matches "Bind", "Bound", or "Binds".
 * excludeWords are stripped from the text first, so a rule's keyword
 * doesn't false-positive off a different word that merely contains it
 * as a substring (e.g. "stunned" containing "stun") -- UNLESS this
 * operator is listed in that rule's exemptOperators, in which case the
 * stripping is skipped and the original text is matched as-is.
 * excludeBranches rejects the rule entirely for operators of that
 * branch, regardless of keyword match (e.g. actual Push Stroker/
 * Hookmaster operators don't count as "Pseudo-Pusher"/"Pseudo-Puller").
 * excludeClasses does the same at the class level (e.g. Medic-class
 * operators don't count as "Self-Sustain" -- they recover HP as their
 * defining trait, not as a bonus self-sufficiency effect).
 * excludePatterns works like excludeWords but for variable text a plain
 * string can't cover (e.g. "recovers 5 DP" vs "recovers 10 DP" -- DP
 * recovery isn't HP self-sustain, regardless of the number).
 *
 * viaBranch on each match is true only when includeBranches is what
 * caused the match (not the keyword text) -- callers that care about
 * showing a branch icon instead of a skill/talent badge (e.g. the
 * Techniques page's Self-Sustain group) should check this PER MATCH,
 * not apply it to every operator in the group uniformly: an operator
 * who matched via genuine "recovers"/"restore" text should still show
 * their actual skill/talent, not their branch, since the branch had
 * nothing to do with why they matched.
 *
 * matchedKeyword is the specific keyword that was actually found in the
 * text -- null when viaBranch is true, since there's no keyword to
 * point to in that case. For a requireAllOf rule with multiple groups
 * (e.g. Self-Sustain's verb group + "hp" group), matchedKeyword is the
 * FIRST group's match and matchedKeywordEnd is the LAST group's match --
 * together they let the Techniques page's table view highlight the
 * whole span from the verb through "HP", not just the single verb
 * word. For a single-group rule, matchedKeywordEnd is null and only
 * the one word gets highlighted. */
export interface AutoTechniqueMatch extends SkillTechnique {
  viaBranch: boolean;
  matchedKeyword: string | null;
  matchedKeywordEnd: string | null;
  highlightSeparately: boolean; // true for statPattern rules (DEF/RES/ATK Down) -- matchedKeyword and matchedKeywordEnd should render as two independent highlights, not a continuous span
}

export function detectAutoTechniqueMatches(
  rarity: number | null,
  texts: (string | null | undefined)[],
  /* REQUIRED, not optional, and that is the point. Removing the operator's own name
     from the text before the keyword search is what keeps Silence out of the Silence
     status -- and an optional parameter is exactly how that protection goes missing at
     one call site while every other one keeps it, with nothing to report it. Every
     caller passes a name today; making it required means the compiler says so if one
     ever stops. Pass null only where there genuinely is no operator. */
  operatorName: string | null,
  branch?: string | null,
  operatorClass?: string | null,
  isTalent?: boolean
): AutoTechniqueMatch[] {
  if (rarity === null) return [];
  const rawTexts = texts.filter((t): t is string => !!t);
  /* Joined with a CLAUSE BREAK, not a space. The separate strings a caller hands in --
     one per skill level, one per talent row -- are separate sentences, and a bare space
     asserts they are one. statPattern then reads straight across the seam: Haze's skill
     is "Max HP -75% ; ATK +15% ; ASPD +35" at every level, and level N's trailing "ASPD
     +35" landing next to level N+1's leading "Max HP -75%" made "ASPD ... -75%", so the
     operator page credited her with ASPD Down while the techniques page, which passes
     one level at a time, did not. `;` is what those patterns already treat as the end
     of a clause, so this says out loud what the caller meant. */
  const combinedOriginal = rawTexts.join(' ; '); // preserves original casing -- needed for statPattern's rigid ATK/DEF/RES/ASPD capitalization requirement
  const combinedRaw = combinedOriginal.toLowerCase();
  if (!combinedRaw) return [];
  const ownName = operatorName ? operatorName.toLowerCase() : null;
  const matches: AutoTechniqueMatch[] = [];
  for (const rule of AUTO_TECHNIQUE_RULES) {
    if (rarity < rule.minRarity || rarity > rule.maxRarity) continue;
    if (isTalent && rule.skillsOnly) continue;
    if (operatorName && rule.excludeOperators?.includes(operatorName)) continue;
    if (branch && rule.excludeBranches?.includes(branch)) continue;
    if (operatorClass && rule.excludeClasses?.includes(operatorClass)) continue;
    if (branch && rule.includeBranches?.includes(branch)) {
      matches.push({ name: rule.name, description: rule.description, viaBranch: true, matchedKeyword: null, matchedKeywordEnd: null, highlightSeparately: false });
      continue;
    }
    const isExempt = !!operatorName && !!rule.exemptOperators?.includes(operatorName);
    let combined = combinedRaw;
    if (!isExempt) {
      if (rule.excludeWords) {
        for (const excluded of rule.excludeWords) {
          combined = combined.split(excluded.toLowerCase()).join(' ');
        }
      }
      if (rule.excludePatterns) {
        for (const pattern of rule.excludePatterns) {
          combined = combined.replace(pattern, ' ');
        }
      }
    }
    if (rule.requireAllOf) {
      if (rule.requireOrdered && rule.requireAllOf.length === 2) {
        // Order-aware: the first group's word must genuinely occur
        // BEFORE the last group's word, using the closest such valid
        // pair -- not just "both words present somewhere", which would
        // wrongly validate (and highlight) off an unrelated earlier
        // occurrence of the first group's word.
        const pair = findClosestOrderedPair(combined, rule.requireAllOf[0], rule.requireAllOf[1], rule.maxGap);
        if (pair) {
          matches.push({
            name: rule.name,
            description: rule.description,
            viaBranch: false,
            matchedKeyword: pair.startWord,
            matchedKeywordEnd: pair.endWord,
            highlightSeparately: false,
          });
        }
      } else {
        // Every group needs at least one word-boundary match -- e.g.
        // (recover-family) AND (hp) both present, not just either alone.
        let allGroupsMatched = true;
        let firstMatchedKeyword: string | null = null;
        let lastMatchedKeyword: string | null = null;
        for (const group of rule.requireAllOf) {
          const found = group.find((kw) => wordMatches(combined, kw));
          if (!found) {
            allGroupsMatched = false;
            break;
          }
          if (firstMatchedKeyword === null) firstMatchedKeyword = found;
          lastMatchedKeyword = found;
        }
        if (allGroupsMatched) {
          matches.push({
            name: rule.name,
            description: rule.description,
            viaBranch: false,
            matchedKeyword: firstMatchedKeyword,
            matchedKeywordEnd: lastMatchedKeyword !== firstMatchedKeyword ? lastMatchedKeyword : null,
            highlightSeparately: false,
          });
        }
      }
    } else if (rule.statPattern) {
      const found = findStatMinusNumber(combinedOriginal, rule.statPattern);
      if (found) {
        matches.push({
          name: rule.name,
          description: rule.description,
          viaBranch: false,
          matchedKeyword: found.statMatch,
          matchedKeywordEnd: found.numberMatch,
          highlightSeparately: true,
        });
      }
    } else if (rule.keywords) {
      /* An operator's own name is not a status. Silence's talent reads "when Silence is
         deployed", so searching her own text for the keyword "Silence" filed her under
         the Silence status -- and her alter with her. The name is removed before the
         keyword search only; statPattern above is unaffected, since a name carries no
         stat and no number. */
      const searchable = ownName ? combined.split(ownName).join(' ') : combined;
      const matchedKeyword = rule.keywords.find((kw) => searchable.includes(kw.toLowerCase())) || null;
      if (matchedKeyword) {
        matches.push({ name: rule.name, description: rule.description, viaBranch: false, matchedKeyword, matchedKeywordEnd: null, highlightSeparately: false });
      }
    }
  }
  return matches;
}

/** Thin wrapper around detectAutoTechniqueMatches for every call site
 * that doesn't care about the branch-vs-keyword distinction -- drops
 * the extra viaBranch/matchedKeyword fields to stay a plain
 * SkillTechnique[]. */
export function detectAutoTechniques(
  rarity: number | null,
  texts: (string | null | undefined)[],
  operatorName: string | null,
  branch?: string | null,
  operatorClass?: string | null,
  isTalent?: boolean
): SkillTechnique[] {
  return detectAutoTechniqueMatches(rarity, texts, operatorName, branch, operatorClass, isTalent).map(({ name, description }) => ({ name, description }));
}