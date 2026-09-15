import { GetStaticProps } from 'next';
import Head from 'next/head';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useEffect, useMemo, useState } from 'react';
import { UMBRELLA_MEMBERS, UMBRELLA_DESCRIPTIONS } from '@/lib/techniques/autoTechniques';
import { buildTechniqueGroups, TechniqueGroup, TechniqueEntry } from '@/lib/techniques/buildTechniqueGroups';

/** Wraps every case-insensitive occurrence of `keyword` within `text` in 
 * a highlight span, for the table view's "highlight the word that was
 * searched" requirement. Returns the plain text unchanged if there's no
 * keyword to highlight (manually-authored techniques, or branch-matched
 * entries where a keyword was never the reason for the match). */
function highlightKeyword(text: string | null, keyword: string | null, keywordEnd: string | null) {
  if (!text) return null;
  if (!keyword) return text;
  const lowerText = text.toLowerCase();
  const idx = lowerText.indexOf(keyword.toLowerCase());
  if (idx === -1) return text;
  let start = idx;
  let end = idx + keyword.length;
  if (keywordEnd) {
    const idxEnd = lowerText.indexOf(keywordEnd.toLowerCase());
    if (idxEnd !== -1) {
      // Take whichever match comes first as the span start, in case the
      // "hp" word actually appears before the verb in the sentence
      // (e.g. "Max HP recovers over time").
      start = Math.min(idx, idxEnd);
      end = Math.max(idx + keyword.length, idxEnd + keywordEnd.length);
    }
  }
  // Expand outward to the full word boundaries around the span, so a
  // keyword that's a substring of a longer word (e.g. "restore" inside
  // "restores") highlights the whole word, not just the matched part.
  while (start > 0 && /\w/.test(text[start - 1])) start--;
  while (end < text.length && /\w/.test(text[end])) end++;
  return (
    <>
      <Head><title>Techniques — Arkpedia</title></Head>

      {text.slice(0, start)}
      <span className="technique-table-highlight">{text.slice(start, end)}</span>
      {text.slice(end)}
    </>
  );
}

/** For statPattern matches (DEF/RES/ATK/ASPD/Movement Speed/Hit Rate
 * Down): highlights matchedKeyword and matchedKeywordEnd as two
 * INDEPENDENT spans, not one continuous range -- the words between
 * them (e.g. "of enemies around the Curse Doll by") are never meant
 * to highlight, unlike Self-Sustain's full-span mode.
 *
 * Finds every occurrence of both keyword and keywordEnd, then picks
 * the CLOSEST pair -- not just the first occurrence of each
 * independently, which would wrongly grab an unrelated earlier
 * occurrence when the stat word appears multiple times in the same
 * text (e.g. Thumpy has "DEF +135%" early and the genuine "DEF...-30"
 * much later; naive indexOf finds the first "DEF", which isn't the
 * one detection actually matched). Also naturally handles the
 * reversed "-30% RES" order, since it doesn't assume keyword always
 * comes before keywordEnd. */
function highlightTwoSeparately(text: string | null, keyword: string | null, keywordEnd: string | null) {
  if (!text) return null;
  if (!keyword) return text;
  // Case-sensitive on purpose: keyword/keywordEnd are exact-case
  // extracts from this very same text (guaranteed by per-level
  // detection), so searching case-sensitively finds the genuine match
  // instead of an earlier unrelated lowercase substring -- e.g. "def"
  // inside "defined" would otherwise be found first and wrongly
  // highlighted ahead of the real "DEF -35%" later in the sentence.
  function allIndices(needle: string): number[] {
    const out: number[] = [];
    let i = -1;
    while ((i = text!.indexOf(needle, i + 1)) !== -1) out.push(i);
    return out;
  }

  const kwPositions = allIndices(keyword);
  if (kwPositions.length === 0) return text;

  function expandWord(start: number, length: number): [number, number] {
    let s = start;
    let e = start + length;
    while (s > 0 && /\w/.test(text![s - 1])) s--;
    while (e < text!.length && /\w/.test(text![e])) e++;
    return [s, e];
  }

  if (!keywordEnd) {
    const [s, e] = expandWord(kwPositions[0], keyword.length);
    return (
      <>
        {text.slice(0, s)}
        <span className="technique-table-highlight">{text.slice(s, e)}</span>
        {text.slice(e)}
      </>
    );
  }

  const endPositions = allIndices(keywordEnd);
  let best: { kp: number; ep: number; gap: number } | null = null;
  for (const kp of kwPositions) {
    for (const ep of endPositions) {
      const gap = Math.abs(ep - kp);
      if (!best || gap < best.gap) best = { kp, ep, gap };
    }
  }
  if (!best) {
    const [s, e] = expandWord(kwPositions[0], keyword.length);
    return (
      <>
        {text.slice(0, s)}
        <span className="technique-table-highlight">{text.slice(s, e)}</span>
        {text.slice(e)}
      </>
    );
  }

  const [kwStart, kwEnd] = expandWord(best.kp, keyword.length);
  const numStart = best.ep;
  const numEnd = best.ep + keywordEnd.length; // numbers already have a natural boundary at the leading "-", no word-expansion needed

  if (kwStart < numStart) {
    return (
      <>
        {text.slice(0, kwStart)}
        <span className="technique-table-highlight">{text.slice(kwStart, kwEnd)}</span>
        {text.slice(kwEnd, numStart)}
        <span className="technique-table-highlight">{text.slice(numStart, numEnd)}</span>
        {text.slice(numEnd)}
      </>
    );
  }
  return (
    <>
      {text.slice(0, numStart)}
      <span className="technique-table-highlight">{text.slice(numStart, numEnd)}</span>
      {text.slice(numEnd, kwStart)}
      <span className="technique-table-highlight">{text.slice(kwStart, kwEnd)}</span>
      {text.slice(kwEnd)}
    </>
  );
}

interface Props {
  groups: TechniqueGroup[];
}

/** Renders one technique group's content -- the group name/definition
 * header, the Show Table toggle, and either the icon-grid view or the
 * table view. Shared between standalone (non-umbrella) groups and
 * umbrella member groups, since both need identical rendering. */
function TechniqueGroupCard({
  group,
  showTable,
  onToggleTable,
}: {
  group: TechniqueGroup;
  showTable: boolean;
  onToggleTable: () => void;
}) {
  return (
    <div className="technique-group">
      <div className="technique-group-header-row">
        <h3 className="technique-group-name">{group.name}</h3>
        <button type="button" className="ghost technique-table-toggle" onClick={onToggleTable}>
          {showTable ? 'Show Icons' : 'Show Table'}
        </button>
      </div>
      {group.definition && <p className="technique-group-definition">{group.definition}</p>}
      {showTable ? (
        <div className="technique-table-grid">
          {(() => {
            const branchEntries = group.entries.filter((e) => e.viaBranch);
            const normalEntries = group.entries.filter((e) => !e.viaBranch);
            const branchGroups = new Map<string, TechniqueEntry[]>();
            for (const e of branchEntries) {
              const key = e.branchName || 'Unknown';
              if (!branchGroups.has(key)) branchGroups.set(key, []);
              branchGroups.get(key)!.push(e);
            }
            return (
              <>
                {Array.from(branchGroups.entries()).map(([branchName, entries]) => (
                  <div key={branchName} className="technique-table-branch-section">
                    <div className="technique-table-branch-header">
                      {entries[0].branchIconPath && (
                        <Image src={entries[0].branchIconPath} alt={branchName} width={20} height={20} />
                      )}
                      <span>{branchName}</span>
                    </div>
                    <div className="technique-table-branch-operators">
                      {entries.map((e) => (
                        <Link prefetch={false} key={e.operatorName} href={`/operators/${encodeURIComponent(e.operatorName)}`} className="technique-table-operator">
                          <Image src={e.operatorIconPath} alt={e.operatorName} width={32} height={32} />
                          <span>{e.operatorName}</span>
                        </Link>
                      ))}
                    </div>
                  </div>
                ))}
                {normalEntries.flatMap((e) =>
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
                        <span className="technique-table-desc-col">
                          {b.highlightSeparately
                            ? highlightTwoSeparately(b.sourceText, b.matchedKeyword, b.matchedKeywordEnd)
                            : highlightKeyword(b.sourceText, b.matchedKeyword, b.matchedKeywordEnd)}
                        </span>
                      </div>
                    );
                  })
                )}
              </>
            );
          })()}
        </div>
      ) : (
        <div className="technique-group-entries">
          {group.entries.map((e, i) => {
            const MAX_VISIBLE_BADGES = 3;
            const overflow = e.badges.length > MAX_VISIBLE_BADGES;
            const visibleBadges = overflow ? e.badges.slice(0, MAX_VISIBLE_BADGES - 1) : e.badges;
            const overflowCount = e.badges.length - visibleBadges.length;
            return (
              <Link prefetch={false}
                key={`${e.operatorName}-${i}`}
                href={`/operators/${encodeURIComponent(e.operatorName)}`}
                className="technique-entry"
                aria-label={`${e.operatorName} — ${e.badges.map((b) => b.label).join(', ')}`}
              >
                <div className="technique-entry-icons">
                  <Image src={e.operatorIconPath} alt={e.operatorName} width={56} height={56} className="technique-entry-operator-icon" />
                  {e.hasM3MainPriority && (
                    <span className="technique-entry-priority-badge" aria-label="M3 main priority">
                      👍
                    </span>
                  )}
                  {e.viaBranch ? (
                    e.branchIconPath && (
                      <div className="technique-entry-badge-row">
                        <Image src={e.branchIconPath} alt="branch" width={22} height={22} className="technique-entry-badge-icon" />
                      </div>
                    )
                  ) : (
                    e.badges.length > 0 && (
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
                    )
                  )}
                </div>
                <span className="technique-entry-name">{e.operatorName}</span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function TechniquesPage({ groups }: Props) {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [showTableGroups, setShowTableGroups] = useState<Set<string>>(new Set());
  const [activeFilter, setActiveFilter] = useState<string>('all');
  // Per-umbrella sub-filter -- e.g. within Statuses, further narrow
  // down to just "Bind" or "Slow" etc. Keyed by umbrella name; missing
  // entries default to 'all'.
  const [umbrellaSubFilters, setUmbrellaSubFilters] = useState<Record<string, string>>({});

  // Deep-link support -- a link like /techniques?q=Burn (e.g. from the
  // "See more" box on an operator's own page) lands already filtered
  // to that specific technique, via the same search box a normal user
  // would type into. router.isReady guards against reading query
  // params before Next.js has actually parsed them on first render.
  useEffect(() => {
    if (!router.isReady) return;
    const q = router.query.q;
    if (typeof q === 'string' && q) setSearch(q);
  }, [router.isReady, router.query.q]);

  function setUmbrellaSubFilter(umbrellaName: string, value: string) {
    setUmbrellaSubFilters((prev) => ({ ...prev, [umbrellaName]: value }));
  }

  function toggleTable(name: string) {
    setShowTableGroups((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  const searched = useMemo(() => {
    if (!search.trim()) return groups;
    const q = search.trim().toLowerCase();
    return groups.filter(
      (g) => g.name.toLowerCase().includes(q) || g.entries.some((e) => e.operatorName.toLowerCase().includes(q))
    );
  }, [groups, search]);

  // Filter buttons: one per umbrella (that has data) + one per
  // standalone (non-umbrella-member) technique -- not one per umbrella
  // MEMBER, since clicking the umbrella button reveals all its members
  // at once rather than needing a button per sub-category.
  const filterButtonNames = useMemo(() => {
    const umbrellasWithData = new Set(groups.filter((g) => g.umbrellaNames.length > 0).flatMap((g) => g.umbrellaNames));
    const standaloneNames = groups.filter((g) => g.umbrellaNames.length === 0).map((g) => g.name);
    return [...Array.from(umbrellasWithData), ...standaloneNames].sort((a, b) => a.localeCompare(b));
  }, [groups]);

  // Groups the (already search-filtered) list into display blocks: an
  // umbrella block bundles its member groups together under one
  // heading (in the umbrella's canonical member order), a standalone
  // block is just the one group. Sorted by block name so umbrella
  // blocks interleave alphabetically with standalone technique names,
  // same as before.
  interface DisplayBlock {
    blockName: string;
    isUmbrella: boolean;
    memberGroups: TechniqueGroup[];
  }

  const blocks: DisplayBlock[] = useMemo(() => {
    const byName = new Map<string, TechniqueGroup>(searched.map((g) => [g.name, g]));
    const umbrellaBlocks: DisplayBlock[] = Object.entries(UMBRELLA_MEMBERS)
      .map(([umbrella, members]) => ({
        blockName: umbrella,
        isUmbrella: true,
        memberGroups: members.map((m) => byName.get(m)).filter((g): g is TechniqueGroup => !!g && g.entries.length > 0),
      }))
      .filter((b) => b.memberGroups.length > 0);
    const standaloneBlocks: DisplayBlock[] = searched
      .filter((g) => g.umbrellaNames.length === 0)
      .map((g) => ({ blockName: g.name, isUmbrella: false, memberGroups: [g] }));
    return [...umbrellaBlocks, ...standaloneBlocks].sort((a, b) => a.blockName.localeCompare(b.blockName));
  }, [searched]);

  const displayBlocks = activeFilter === 'all' ? blocks : blocks.filter((b) => b.blockName === activeFilter);

  return (
    <main className="main-wide">
      <div className="op-page-header-search">
        <Link prefetch={false} href="/operators" className="op-back-to-roster-btn" aria-label="Back to operators">
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" width="16" height="16">
            <path d="M12 4 L6 10 L12 16" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span>Operators</span>
        </Link>
        <input
          type="text"
          placeholder="Search techniques or operators..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="op-header-search-input"
        />
      </div>

      <section className="op-section">
        <h1>Techniques</h1>
        <p className="hint" style={{ marginBottom: 16 }}>
          Every named technique across every operator&apos;s skills, grouped by name. {groups.length} technique
          {groups.length === 1 ? '' : 's'} total.
        </p>

        <div className="technique-filter-row">
          <button
            type="button"
            className={`technique-filter-btn${activeFilter === 'all' ? ' active' : ''}`}
            onClick={() => {
              setActiveFilter('all');
              setSearch('');
            }}
          >
            Show All
          </button>
          {filterButtonNames.map((name) => (
            <button
              key={name}
              type="button"
              className={`technique-filter-btn${activeFilter === name ? ' active' : ''}`}
              onClick={() => setActiveFilter(name)}
            >
              {name}
            </button>
          ))}
        </div>

        {displayBlocks.length === 0 && <p className="hint">No technique matches your search.</p>}

        <div className="technique-group-list">
          {displayBlocks.map((block) =>
            block.isUmbrella ? (
              <div key={block.blockName} className="technique-umbrella-section">
                <h2 className="technique-umbrella-heading">{block.blockName}</h2>
                {UMBRELLA_DESCRIPTIONS[block.blockName] && (
                  <p className="technique-umbrella-description">{UMBRELLA_DESCRIPTIONS[block.blockName]}</p>
                )}
                <div className="technique-filter-row technique-subfilter-row">
                  <button
                    type="button"
                    className={`technique-filter-btn technique-subfilter-btn${(umbrellaSubFilters[block.blockName] || 'all') === 'all' ? ' active' : ''}`}
                    onClick={() => setUmbrellaSubFilter(block.blockName, 'all')}
                  >
                    All
                  </button>
                  {block.memberGroups.map((group) => (
                    <button
                      key={group.name}
                      type="button"
                      className={`technique-filter-btn technique-subfilter-btn${umbrellaSubFilters[block.blockName] === group.name ? ' active' : ''}`}
                      onClick={() => setUmbrellaSubFilter(block.blockName, group.name)}
                    >
                      {group.name}
                    </button>
                  ))}
                </div>
                {block.memberGroups
                  .filter((group) => (umbrellaSubFilters[block.blockName] || 'all') === 'all' || umbrellaSubFilters[block.blockName] === group.name)
                  .map((group) => (
                    <TechniqueGroupCard
                      key={group.name}
                      group={group}
                      showTable={showTableGroups.has(group.name)}
                      onToggleTable={() => toggleTable(group.name)}
                    />
                  ))}
              </div>
            ) : (
              <TechniqueGroupCard
                key={block.blockName}
                group={block.memberGroups[0]}
                showTable={showTableGroups.has(block.blockName)}
                onToggleTable={() => toggleTable(block.blockName)}
              />
            )
          )}
        </div>
      </section>
    </main>
  );
}


export const getStaticProps: GetStaticProps<Props> = async () => {
  const groups = buildTechniqueGroups();
  return { props: { groups } };
};