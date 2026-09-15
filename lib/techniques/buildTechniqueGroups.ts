import { getAllOperators } from '@/lib/operators/operators';
import { getSkillList } from '@/lib/operators/operatorTypes';
import { getOperatorIconPath } from '@/lib/operators/operatorIcon';
import { getSkillIconPath } from '@/lib/operators/operatorIconPaths';
import { detectAutoTechniqueMatches, UMBRELLA_MEMBERS, MEMBER_TO_UMBRELLA, AutoTechniqueMatch } from '@/lib/techniques/autoTechniques';
import { getBranchIconPath } from '@/lib/operators/classBranchIcons';
import techniqueDefinitionsData from '@/data/techniques_definitions.json';

const techniqueDefinitions = techniqueDefinitionsData as Record<string, string>;

export interface TechniqueBadge {
  label: string; // for the tooltip -- skill name, or "T1"/"T2" for talents
  skillIconPath: string | null;
  talentLabel: string | null; // "T1"/"T2" etc -- shown as text instead of an icon
  sourceText: string | null; // the operator's own skill/talent description text where the match was found -- shown in the table view
  matchedKeyword: string | null; // the specific word highlighted within sourceText -- null for manually-authored techniques (nothing to highlight) or branch-matched entries
  matchedKeywordEnd: string | null; // for a two-group requireAllOf match (e.g. Self-Sustain's verb + "hp"), the second word -- highlights the full span from matchedKeyword through matchedKeywordEnd instead of just the one word
  highlightSeparately: boolean; // true for statPattern matches (DEF/RES/ATK/ASPD/Movement Speed Down) -- matchedKeyword and matchedKeywordEnd render as two independent highlights instead of one continuous span
}

export interface TechniqueEntry {
  operatorName: string;
  operatorIconPath: string;
  branchIconPath: string | null;
  branchName: string | null;
  viaBranch: boolean; // true only if this operator matched because of an includeBranches rule, not keyword text -- decides per-entry whether to show the branch icon or the normal skill/talent badges
  rarity: number | null; // for sorting -- higher rarity operators show first within a group
  badges: TechniqueBadge[]; // one per skill/talent occurrence -- usually 1, can be several if the same technique appears on multiple skills/talents
  // True if ANY badge in this entry came from a skill whose M3
  // recommendation priority is "main" (sub priority doesn't count) --
  // shown as a thumbs-up badge and used as a sort tiebreak after
  // rarity. Talents/modules never set this (only skills carry M3
  // priority), so it's a no-op for every group besides AFK's members.
  hasM3MainPriority: boolean;
}

export interface TechniqueGroup {
  name: string;
  definition: string | null;
  entries: TechniqueEntry[];
  umbrellaNames: string[]; // e.g. "RES Down" -> ["Stats Debuff", "Enhance Arts Damage"] -- a technique can belong to multiple umbrella sections at once, or none (empty array) if standalone
}

// Module-level cache -- the underlying operator roster is fixed for the
// whole build (getAllOperators() itself is already memoized), so this
// expensive full-roster scan only needs to run once per build no matter
// how many different pages (techniques.tsx, every operator detail page)
// call this same function.
let cachedGroups: TechniqueGroup[] | null = null;

export function buildTechniqueGroups(): TechniqueGroup[] {
  if (cachedGroups) return cachedGroups;

  const operators = getAllOperators();
  // techniqueName -> operatorName -> entry (with its accumulating badges)
  const groupMap = new Map<string, Map<string, TechniqueEntry>>();
  // techniqueName -> every description seen for it -- if they're all the
  // same (true for every auto-detected rule, and for manually-authored
  // techniques that repeat identical text across operators), that
  // shared description can be shown under the group heading even
  // without a separate entry in techniques_definitions.json.
  const descriptionsSeen = new Map<string, Set<string>>();

  function addBadge(techName: string, techDescription: string | null, viaBranch: boolean, op: { name: string }, operatorIconPath: string, branchIconPath: string | null, branchName: string | null, rarity: number | null, badge: TechniqueBadge, isTalentTier: boolean, isM3Main: boolean = false) {
    if (!groupMap.has(techName)) groupMap.set(techName, new Map());
    const opMap = groupMap.get(techName)!;
    if (!opMap.has(op.name)) opMap.set(op.name, { operatorName: op.name, operatorIconPath, branchIconPath, branchName, viaBranch: false, rarity, badges: [], hasM3MainPriority: false });
    const entry = opMap.get(op.name)!;
    if (isTalentTier) {
      // A previous talent tier (e.g. T1-T5) already matched this same
      // technique for this operator -- since talents process in T1
      // through T6 order, drop the earlier tier's badge so only the
      // highest matching tier survives, instead of showing every tier
      // as a separate badge.
      const priorTalentBadgeIdx = entry.badges.findIndex((b) => b.talentLabel !== null);
      if (priorTalentBadgeIdx !== -1) entry.badges.splice(priorTalentBadgeIdx, 1);
    }
    entry.badges.push(badge);
    if (viaBranch) entry.viaBranch = true; // sticky -- once true (matched via branch on any occurrence), stays true for this operator's whole entry
    if (isM3Main) entry.hasM3MainPriority = true; // sticky -- same idea, one qualifying skill is enough
    if (techDescription) {
      if (!descriptionsSeen.has(techName)) descriptionsSeen.set(techName, new Set());
      descriptionsSeen.get(techName)!.add(techDescription);
    }
  }

  const ORDINAL_WORDS = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth'];
  // Resolves a talent-ordinal reference to a 0-based index -- handles
  // both "second Talent" (ordinal word, "Talent" after) and "Talent 1"
  // (numeric digit, "Talent" before, 1-based in the text) forms, since
  // operators' actual skill text uses either depending on the writer.
  function resolveTalentReference(text: string): number | null {
    const ordinalMatch = text.match(/\b(first|second|third|fourth|fifth|sixth)\s+talent\b/i);
    if (ordinalMatch) return ORDINAL_WORDS.indexOf(ordinalMatch[1].toLowerCase());
    const numericMatch = text.match(/\btalent\s+(\d)\b/i);
    if (numericMatch) return parseInt(numericMatch[1], 10) - 1;
    return null;
  }

  for (const op of operators) {
    const operatorIconPath = getOperatorIconPath(op);
    const branchIconPath = getBranchIconPath(op.branch);

    // Talents process FIRST now, building a per-talent-index map of
    // which techniques each one matched -- skills below need this to
    // detect cross-references (e.g. a skill saying "the effect of this
    // unit's second Talent increases..." should adopt whatever the
    // second talent matched, even though the skill's own text never
    // contains the actual search term itself).
    const talentTechniquesByIndex = new Map<number, Set<string>>();
    // Aggregates every technique name detected via ANY talent for this
    // operator (across manual + auto-detected), so module scanning
    // below can skip a match already covered by a talent -- talent
    // takes precedence when the same technique appears in both.
    const talentDetectedNames = new Set<string>();
    (op.talents || []).forEach((talent, ti) => {
      const manualTechs = (talent.technique || []).map((t) => ({ ...t, viaBranch: false, matchedKeyword: null as string | null, matchedKeywordEnd: null as string | null, highlightSeparately: false, sourceText: t.description }));
      // Same per-level fix as skills above, using talent rows instead.
      const seenTalentNames = new Set<string>();
      const autoTechs: (AutoTechniqueMatch & { sourceText: string | null })[] = [];
      for (let ri = talent.rows.length - 1; ri >= 0; ri--) {
        const rowText = talent.rows[ri].description;
        const rowMatches = detectAutoTechniqueMatches(op.rarity, [rowText], op.name, op.branch, op.class, true);
        for (const m of rowMatches) {
          if (!m.name || seenTalentNames.has(m.name)) continue;
          seenTalentNames.add(m.name);
          autoTechs.push({ ...m, sourceText: rowText });
        }
      }
      talentTechniquesByIndex.set(ti, new Set());
      for (const tech of [...manualTechs, ...autoTechs]) {
        if (!tech.name) continue;
        talentDetectedNames.add(tech.name);
        talentTechniquesByIndex.get(ti)!.add(tech.name);
        addBadge(tech.name, tech.description, tech.viaBranch, op, operatorIconPath, branchIconPath, op.branch, op.rarity, {
          label: `T${ti + 1}`,
          skillIconPath: null,
          talentLabel: `T${ti + 1}`,
          sourceText: tech.sourceText,
          matchedKeyword: tech.matchedKeyword,
          matchedKeywordEnd: tech.matchedKeywordEnd,
          highlightSeparately: tech.highlightSeparately,
        }, true);
      }
    });

    for (const skill of getSkillList(op)) {
      const manualTechs = (skill.techniques || []).map((t) => ({ ...t, viaBranch: false, matchedKeyword: null as string | null, matchedKeywordEnd: null as string | null, highlightSeparately: false, sourceText: t.description }));
      // Sub priority doesn't count -- only an M3 recommendation
      // explicitly marked "main" priority qualifies a skill's badges
      // for the thumbs-up / sort-priority treatment.
      const isM3Main = (skill.recommendation || []).some((r) => r.mastery === 'm3' && r.priority === 'main');
      // Run detection per-level (highest to lowest), keeping the FIRST
      // (highest) level where each technique name matches -- guarantees
      // the displayed sourceText actually contains the matched tokens.
      // Previously detection ran on all levels combined while always
      // displaying the highest level's text regardless of which level
      // the match actually came from, so a match found only in an
      // earlier level (different wording/numbers) would get badged
      // against text that didn't contain it at all, breaking
      // highlighting or wrongly attributing the technique entirely.
      const seenSkillNames = new Set<string>();
      const autoTechs: (AutoTechniqueMatch & { sourceText: string | null })[] = [];
      let referencedTalentText: string | null = null;
      for (let li = skill.levels.length - 1; li >= 0; li--) {
        const levelText = skill.levels[li].description;
        const levelMatches = detectAutoTechniqueMatches(op.rarity, [levelText], op.name, op.branch, op.class);
        for (const m of levelMatches) {
          if (!m.name || seenSkillNames.has(m.name)) continue;
          seenSkillNames.add(m.name);
          autoTechs.push({ ...m, sourceText: levelText });
        }
        // Detect a talent-ordinal reference ("second Talent" or
        // "Talent 1") in the highest level's own text where it's
        // found -- used below to cross-adopt that talent's matched
        // techniques.
        if (!referencedTalentText && levelText && resolveTalentReference(levelText) !== null) {
          referencedTalentText = levelText;
        }
      }
      for (const tech of [...manualTechs, ...autoTechs]) {
        if (!tech.name) continue;
        addBadge(tech.name, tech.description, tech.viaBranch, op, operatorIconPath, branchIconPath, op.branch, op.rarity, {
          label: skill.name || '',
          skillIconPath: getSkillIconPath(op.name, skill.name),
          talentLabel: null,
          sourceText: tech.sourceText,
          matchedKeyword: tech.matchedKeyword,
          matchedKeywordEnd: tech.matchedKeywordEnd,
          highlightSeparately: tech.highlightSeparately,
        }, false, isM3Main);
      }
      // Cross-reference: this skill mentions "Nth Talent" by name --
      // adopt whatever techniques that talent matched, so the skill
      // shows up alongside the talent under the same technique(s),
      // even though the skill's own text never contains the actual
      // search term. No highlighting here, since there's genuinely
      // nothing to highlight in the skill's own text for these.
      if (referencedTalentText) {
        const talentIdx = resolveTalentReference(referencedTalentText);
        const referencedNames = talentIdx !== null && talentIdx >= 0 ? talentTechniquesByIndex.get(talentIdx) : null;
        if (referencedNames) {
          for (const techName of referencedNames) {
            if (seenSkillNames.has(techName)) continue; // already added directly above -- don't duplicate
            const techDescription = techniqueDefinitions[techName] || null;
            addBadge(techName, techDescription, false, op, operatorIconPath, branchIconPath, op.branch, op.rarity, {
              label: skill.name || '',
              skillIconPath: getSkillIconPath(op.name, skill.name),
              talentLabel: null,
              sourceText: referencedTalentText,
              matchedKeyword: null,
              matchedKeywordEnd: null,
              highlightSeparately: false,
            }, false);
          }
        }
      }
    }

    // Modules also get scanned, but only Stage 1 ("New trait") and
    // Stage 3 ("[Talent] improved") -- Stage 2 is skipped entirely.
    // Greek letter is inferred from the Upgrade-type module's order
    // (first = alpha, second = beta, ...) since the data's own `name`
    // field isn't populated for any operator currently on file -- this
    // matches the game's real convention in the vast majority of
    // cases, but isn't verified per-operator.
    const GREEK_LETTERS = ['α', 'β', 'γ', 'δ', 'ε'];
    let upgradeModuleIndex = 0;
    for (const mod of op.modules || []) {
      if (mod.type !== 'Upgrade') continue;
      const greekLetter = GREEK_LETTERS[upgradeModuleIndex] || `#${upgradeModuleIndex + 1}`;
      upgradeModuleIndex++;
      // Stage 3 before Stage 1 -- if the same technique matches both
      // stages of this module (e.g. a talent-improvement at Stage 3
      // repeating similar wording to the Stage 1 trait), only the
      // higher stage produces a badge, not both.
      const orderedStages = [...mod.stages].sort((a, b) => (a.stage === 'Stage 3' ? -1 : 1) - (b.stage === 'Stage 3' ? -1 : 1));
      const seenModuleNames = new Set<string>();
      for (const s of orderedStages) {
        if (s.stage !== 'Stage 1' && s.stage !== 'Stage 3') continue;
        if (!s.effectText) continue;
        const matches = detectAutoTechniqueMatches(op.rarity, [s.effectText], op.name, op.branch, op.class);
        for (const m of matches) {
          if (!m.name) continue;
          if (talentDetectedNames.has(m.name)) continue; // talent takes precedence -- already covered, don't double count
          if (seenModuleNames.has(m.name)) continue; // already badged from this module's higher stage
          seenModuleNames.add(m.name);
          addBadge(m.name, m.description, m.viaBranch, op, operatorIconPath, branchIconPath, op.branch, op.rarity, {
            label: `Module ${greekLetter} (${s.stage})`,
            skillIconPath: null,
            talentLabel: greekLetter,
            sourceText: s.effectText,
            matchedKeyword: m.matchedKeyword,
            matchedKeywordEnd: m.matchedKeywordEnd,
            highlightSeparately: m.highlightSeparately,
          }, false);
        }
      }
    }
  }

  const groups: TechniqueGroup[] = Array.from(groupMap.entries()).map(([name, opMap]) => {
    const seen = descriptionsSeen.get(name);
    // For umbrella members, only trust a shared description when EVERY
    // entry agrees (same rule Damage Negation used on its old separate
    // page) -- for regular auto-detected techniques a rule-level
    // definition already exists in techniqueDefinitions, so this only
    // matters for manually-authored ones.
    const sharedDescription = seen && seen.size === 1 ? Array.from(seen)[0] : null;
    // Talents show before skills, then higher rarity shows before
    // lower within each group -- an operator counts as "has a talent
    // match" if ANY of their badges came from a talent tier.
    const entries = Array.from(opMap.values()).sort((a, b) => {
      if (a.hasM3MainPriority !== b.hasM3MainPriority) return a.hasM3MainPriority ? -1 : 1;
      const aHasTalent = a.badges.some((bd) => bd.talentLabel !== null);
      const bHasTalent = b.badges.some((bd) => bd.talentLabel !== null);
      if (aHasTalent !== bHasTalent) return aHasTalent ? -1 : 1;
      return (b.rarity ?? 0) - (a.rarity ?? 0);
    });
    return {
      name,
      definition: techniqueDefinitions[name] || sharedDescription || null,
      entries,
      umbrellaNames: MEMBER_TO_UMBRELLA[name] || [],
    };
  });

  cachedGroups = groups;
  return groups;
}