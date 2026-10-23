import { getAllOperators } from '@/lib/operators/operators';
import { getSkillList } from '@/lib/operators/operatorTypes';
import { getOperatorIconPath } from '@/lib/operators/operatorIcon';
import { getSkillIconPath } from '@/lib/operators/operatorIconPaths';
import { SYNERGY_CLASS_NAMES, findSynergyMatches, isSynergyExcluded } from '@/lib/techniques/synergyDetection';
import { operatorBelongsToFaction } from '@/lib/operators/factionAliases';

/* /synergies' records, moved out of the page (pages/synergies.tsx) unchanged so its parts
   can be tested. The shape is what every published release of the page carries: the page
   reads a release compiled by older code as well as its own (test-previous-release-props),
   so the buff kinds and emblems the page shows are worked out from these fields, never
   added to them. */

export interface SynergyBadge {
  label: string; // skill name, or "T1"/"T2" for talents
  skillIconPath: string | null;
  talentLabel: string | null;
  sourceText: string | null;
  matchedKeyword: string | null; // the faction/class name itself, for highlighting in the table view
}

export interface SynergyOperatorEntry {
  operatorName: string;
  operatorIconPath: string;
  rarity: number | null;
  isContributor: boolean; // true if this operator's OWN skill/talent grants the buff to this faction/class
  badges: SynergyBadge[]; // one per skill/talent that mentions the faction/class -- empty for non-contributor members
}

export interface SynergyGroup {
  name: string;
  type: 'faction' | 'class';
  entries: SynergyOperatorEntry[]; // contributors (rarity desc) first, then remaining members (rarity desc)
}

export function buildSynergyGroups(): SynergyGroup[] {
  const operators = getAllOperators();

  const factionNames = new Set<string>();
  for (const op of operators) {
    if (op.faction) factionNames.add(op.faction);
    (op.umbrellaFactions || []).forEach((f) => factionNames.add(f));
    (op.connectedFactions || []).forEach((f) => factionNames.add(f));
  }
  const allSearchNames: { name: string; type: 'faction' | 'class' }[] = [
    ...Array.from(factionNames).map((name) => ({ name, type: 'faction' as const })),
    ...SYNERGY_CLASS_NAMES.map((name) => ({ name, type: 'class' as const })),
  ];

  // groupKey -> operatorName -> entry
  const groupMap = new Map<string, Map<string, SynergyOperatorEntry>>();

  function addBadge(groupKey: string, op: { name: string }, operatorIconPath: string, rarity: number | null, badge: SynergyBadge) {
    if (!groupMap.has(groupKey)) groupMap.set(groupKey, new Map());
    const opMap = groupMap.get(groupKey)!;
    if (!opMap.has(op.name)) opMap.set(op.name, { operatorName: op.name, operatorIconPath, rarity, isContributor: true, badges: [] });
    opMap.get(op.name)!.badges.push(badge);
  }

  for (const op of operators) {
    const operatorIconPath = getOperatorIconPath(op);

    for (const skill of getSkillList(op)) {
      const highestLevelText = skill.levels.length > 0 ? skill.levels[skill.levels.length - 1].description : null;
      if (!highestLevelText) continue;
      for (const { name, type, matchedTerm } of findSynergyMatches(highestLevelText, allSearchNames)) {
        const groupKey = `${type}-${name}`;
        if (isSynergyExcluded(groupKey, op.name)) continue;
        addBadge(groupKey, op, operatorIconPath, op.rarity, {
          label: skill.name || '',
          skillIconPath: getSkillIconPath(op.name, skill.name),
          talentLabel: null,
          sourceText: highestLevelText,
          matchedKeyword: matchedTerm,
        });
      }
    }
    (op.talents || []).forEach((talent, ti) => {
      const lastRowText = talent.rows.length > 0 ? talent.rows[talent.rows.length - 1].description : null;
      if (!lastRowText) return;
      for (const { name, type, matchedTerm } of findSynergyMatches(lastRowText, allSearchNames)) {
        const groupKey = `${type}-${name}`;
        if (isSynergyExcluded(groupKey, op.name)) continue;
        addBadge(groupKey, op, operatorIconPath, op.rarity, {
          label: `T${ti + 1}`,
          skillIconPath: null,
          talentLabel: `T${ti + 1}`,
          sourceText: lastRowText,
          matchedKeyword: matchedTerm,
        });
      }
    });

    // Modules also get scanned, same as techniques.tsx does -- only
    // Stage 1 ("New trait") and Stage 3 ("[Talent] improved"), Stage 2
    // is skipped entirely. Greek letter inferred from the Upgrade-type
    // module's own order (first = alpha, second = beta, ...), matching
    // the same convention used there. Stage 3 checked before Stage 1
    // so a technique matching both stages of the same module only
    // badges once, against the higher stage.
    const GREEK_LETTERS = ['α', 'β', 'γ', 'δ', 'ε'];
    let upgradeModuleIndex = 0;
    for (const mod of op.modules || []) {
      if (mod.type !== 'Upgrade') continue;
      const greekLetter = GREEK_LETTERS[upgradeModuleIndex] || `#${upgradeModuleIndex + 1}`;
      upgradeModuleIndex++;
      const orderedStages = [...mod.stages].sort((a, b) => (a.stage === 'Stage 3' ? -1 : 1) - (b.stage === 'Stage 3' ? -1 : 1));
      const seenModuleGroupKeys = new Set<string>();
      for (const s of orderedStages) {
        if (s.stage !== 'Stage 1' && s.stage !== 'Stage 3') continue;
        if (!s.effectText) continue;
        for (const { name, type, matchedTerm } of findSynergyMatches(s.effectText, allSearchNames)) {
          const groupKey = `${type}-${name}`;
          if (isSynergyExcluded(groupKey, op.name)) continue;
          if (seenModuleGroupKeys.has(groupKey)) continue; // already badged from this module's higher stage
          seenModuleGroupKeys.add(groupKey);
          addBadge(groupKey, op, operatorIconPath, op.rarity, {
            label: `Module ${greekLetter} (${s.stage})`,
            skillIconPath: null,
            talentLabel: greekLetter,
            sourceText: s.effectText,
            matchedKeyword: matchedTerm,
          });
        }
      }
    }
  }

  // Add every remaining faction/class member who isn't already a
  // contributor, so the group shows the full roster that benefits,
  // not just the operator(s) granting the buff.
  for (const { name, type } of allSearchNames) {
    const groupKey = `${type}-${name}`;
    if (!groupMap.has(groupKey)) continue; // no contributor found -- skip entirely, per "if there's a hit"
    const opMap = groupMap.get(groupKey)!;
    for (const op of operators) {
      if (opMap.has(op.name)) continue;
      if (isSynergyExcluded(groupKey, op.name)) continue;
      // "Rhodes Island Recon" is itself an operator's name, whose own
      // faction field is literally "Rhodes Island" -- but they aren't
      // meant to be a synergy member of that faction.
      if (op.name === 'Rhodes Island Recon' && groupKey === 'faction-Rhodes Island') continue;
      const belongs = type === 'class' ? op.class === name : operatorBelongsToFaction(op, name);
      if (!belongs) continue;
      opMap.set(op.name, { operatorName: op.name, operatorIconPath: getOperatorIconPath(op), rarity: op.rarity, isContributor: false, badges: [] });
    }
  }

  return Array.from(groupMap.entries())
    .map(([groupKey, opMap]) => {
      const [type, ...nameParts] = groupKey.split('-');
      const name = nameParts.join('-');
      const entries = Array.from(opMap.values()).sort((a, b) => {
        if (a.isContributor !== b.isContributor) return a.isContributor ? -1 : 1;
        return (b.rarity ?? 0) - (a.rarity ?? 0);
      });
      return { name, type: type as 'faction' | 'class', entries };
    })
    .sort((a, b) => {
      if (a.type !== b.type) return a.type === 'faction' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
}
