import { withContentPage } from '@/lib/content/server';
import { GetStaticProps } from 'next';
import Head from 'next/head';
import Image from '@/components/content/ContentImage';
import Link from 'next/link';
import { useMemo, useState, type ReactNode } from 'react';
import PageHeader from '@/components/ui/PageHeader';
import SearchInput from '@/components/ui/SearchInput';
import { useHeightFloor } from '@/components/ui/useHeightFloor';
import { getAllOperators } from '@/lib/operators/operators';
import { getSkillList } from '@/lib/operators/operatorTypes';
import { getOperatorIconPath } from '@/lib/operators/operatorIcon';
import { getSkillIconPath } from '@/lib/operators/operatorIconPaths';
import { SYNERGY_CLASS_NAMES, findSynergyMatches, isSynergyExcluded, findKeywordSpan } from '@/lib/techniques/synergyDetection';
import { operatorBelongsToFaction } from '@/lib/operators/factionAliases';

const PAGE_SIZE = 10;

/** Wraps the genuine, word-boundary match of `keyword` within `text`
 * in a highlight span -- e.g. searching for "Guard" correctly skips
 * over "Vanguard" and finds the real, separate "Guard" mention
 * elsewhere in the text, rather than a plain substring search locking
 * onto "guard" embedded inside "Vanguard". */
function highlightKeyword(text: string | null, keyword: string | null) {
  if (!text) return null;
  if (!keyword) return text;
  const span = findKeywordSpan(text, keyword);
  if (!span) return text;
  const { start, end } = span;
  return (
    <>
      {text.slice(0, start)}
      <span className="technique-table-highlight">{text.slice(start, end)}</span>
      {text.slice(end)}
    </>
  );
}

interface SynergyBadge {
  label: string; // skill name, or "T1"/"T2" for talents
  skillIconPath: string | null;
  talentLabel: string | null;
  sourceText: string | null;
  matchedKeyword: string | null; // the faction/class name itself, for highlighting in the table view
}

interface SynergyOperatorEntry {
  operatorName: string;
  operatorIconPath: string;
  rarity: number | null;
  isContributor: boolean; // true if this operator's OWN skill/talent grants the buff to this faction/class
  badges: SynergyBadge[]; // one per skill/talent that mentions the faction/class -- empty for non-contributor members
}

interface SynergyGroup {
  name: string;
  type: 'faction' | 'class';
  entries: SynergyOperatorEntry[]; // contributors (rarity desc) first, then remaining members (rarity desc)
}

interface Props {
  groups: SynergyGroup[];
}

export default function SynergiesPage({ groups }: Props) {
  const [search, setSearch] = useState('');
  const [showTableGroups, setShowTableGroups] = useState<Set<string>>(new Set());
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  function toggleTable(key: string) {
    setShowTableGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }
  function toggleExpanded(key: string) {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const filtered = useMemo(() => {
    if (!search.trim()) return groups;
    const q = search.trim().toLowerCase();
    return groups.filter(
      (g) => g.name.toLowerCase().includes(q) || g.entries.some((e) => e.operatorName.toLowerCase().includes(q))
    );
  }, [groups, search]);

  return (
    <>
      <Head><title>Synergies — Arkpedia</title></Head>
      <PageHeader
        eyebrow={<><Link prefetch={false} href="/operators">Operators</Link>{' // Faction and class buffs'}</>}
        title="Synergies"
        sub={<>
          Factions and classes that at least one operator&apos;s skill or talent grants a buff to. {groups.length} synergy
          {groups.length === 1 ? '' : 'ies'} total.
        </>}
        actions={
          <SearchInput
            className="technique-search"
            label="Search synergies or operators"
            placeholder="Search synergies or operators..."
            value={search}
            onChange={setSearch}
          />
        }
      />
      <main>
      <section className="op-section">
        {filtered.length === 0 && <p className="hint">No synergy matches your search.</p>}

        <div className="technique-group-list">
          {filtered.map((group) => {
            const key = `${group.type}-${group.name}`;
            const showTable = showTableGroups.has(key);
            const contributors = group.entries.filter((e) => e.isContributor);
            const expanded = expandedGroups.has(key);
            const visibleEntries = expanded ? group.entries : group.entries.slice(0, PAGE_SIZE);
            const hasMore = group.entries.length > PAGE_SIZE;

            return (
              <SynergyGroupFrame key={key} floorKey={key}>
                <div className="technique-group-header-row">
                  <h2 className="technique-group-name">
                    {group.name} <span className="hint">({group.type})</span>
                  </h2>
                  <button type="button" className="ghost btn-sm technique-table-toggle" aria-pressed={showTable} onClick={() => toggleTable(key)}>
                    {showTable ? 'Show icons' : 'Show table'}
                  </button>
                </div>

                {showTable ? (
                  <div className="technique-table-grid">
                    {contributors.flatMap((e) =>
                      e.badges.map((b, bi) => {
                        const isLong = (b.sourceText?.length || 0) > 70;
                        return (
                          <div key={`${e.operatorName}-${bi}`} className={`technique-table-row${isLong ? ' technique-table-row-wrap' : ''}`}>
                            <Link prefetch={false} href={`/operators/${encodeURIComponent(e.operatorName)}`} className="technique-table-operator">
                              <Image src={e.operatorIconPath} alt={e.operatorName} width={32} height={32} />
                              <span>{e.operatorName}</span>
                              {b.skillIconPath ? (
                                <Image src={b.skillIconPath} alt={b.label} width={20} height={20} />
                              ) : (
                                <span className="technique-entry-badge-talent">{b.talentLabel}</span>
                              )}
                            </Link>
                            <span className="technique-table-desc-col">{highlightKeyword(b.sourceText, b.matchedKeyword)}</span>
                          </div>
                        );
                      })
                    )}
                  </div>
                ) : (
                  <>
                    <div className="technique-group-entries">
                      {visibleEntries.map((e) => {
                        const MAX_VISIBLE_BADGES = 3;
                        const overflow = e.badges.length > MAX_VISIBLE_BADGES;
                        const visibleBadges = overflow ? e.badges.slice(0, MAX_VISIBLE_BADGES - 1) : e.badges;
                        const overflowCount = e.badges.length - visibleBadges.length;
                        return (
                          <Link prefetch={false}
                            key={e.operatorName}
                            href={`/operators/${encodeURIComponent(e.operatorName)}`}
                            className="technique-entry"
                            aria-label={e.isContributor ? `${e.operatorName} — ${e.badges.map((b) => b.label).join(', ')}` : e.operatorName}
                          >
                            <div className="technique-entry-icons">
                              <Image
                                src={e.operatorIconPath}
                                alt={e.operatorName}
                                width={56}
                                height={56}
                                className="technique-entry-operator-icon"
                              />
                              {e.badges.length > 0 && (
                                <div className="technique-entry-badge-row">
                                  {visibleBadges.map((b, bi) =>
                                    b.skillIconPath ? (
                                      <Image key={bi} src={b.skillIconPath} alt={b.label} width={22} height={22} className="technique-entry-badge-icon" />
                                    ) : (
                                      <span key={bi} className="technique-entry-badge-talent">
                                        {b.talentLabel}
                                      </span>
                                    )
                                  )}
                                  {overflow && <span className="technique-entry-badge-overflow">+{overflowCount}</span>}
                                </div>
                              )}
                            </div>
                            <span className="technique-entry-name">{e.operatorName}</span>
                          </Link>
                        );
                      })}
                    </div>
                    {hasMore && (
                      <button type="button" className="ghost btn-sm technique-more" aria-expanded={expanded} onClick={() => toggleExpanded(key)}>
                        {expanded ? 'Show less' : `Show more (${group.entries.length - PAGE_SIZE} more)`}
                      </button>
                    )}
                  </>
                )}
              </SynergyGroupFrame>
            );
          })}
        </div>
      </section>
      </main>
    </>
  );
}

/**
 * One synergy's block. A component of its own for the height floor: "Show table" and
 * "Show less" both shorten the block, and near the foot of the page that leaves the
 * document too short for the reader's scroll position -- the browser clamps it and
 * the button just pressed jumps down the screen. The floor holds what the position
 * needs and gives it back as the reader scrolls up (components/ui/useHeightFloor).
 */
function SynergyGroupFrame({ floorKey, children }: { floorKey: string; children: ReactNode }) {
  const floor = useHeightFloor(floorKey);
  return (
    <div className="technique-group" ref={floor.ref}>
      {children}
      {floor.spacer}
    </div>
  );
}

export const getStaticProps: GetStaticProps<Props> = withContentPage<Props>("/synergies", async () => {
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

  const groups: SynergyGroup[] = Array.from(groupMap.entries())
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

  return { props: { groups } };
});