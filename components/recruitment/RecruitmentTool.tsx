import { useReleaseTable } from '@/lib/content/context';
import SegmentedControl from '@/components/ui/SegmentedControl';
import Head from 'next/head';
import Image from '@/components/content/ContentImage';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import PipWindow, { isOperaBrowser, pipSupported, usePipWindow } from '@/components/ui/PipWindow';
import ThemeToggle from '@/components/layout/ThemeToggle';
import PageHeader from '@/components/ui/PageHeader';
import Tabs, { tabPanelProps } from '@/components/ui/Tabs';
import { useSwitchHold } from '@/components/ui/useSwitchHold';
import SearchInput from '@/components/ui/SearchInput';
import Rarity, { rarityLevel } from '@/components/ui/Rarity';
import { computeTagCombos, getRecruitmentTagCategories, type GuaranteedCombo, type RecruitableOperator, type TagCombo } from '@/lib/gacha/recruitmentCalc';
import type { RecruitmentProps } from '@/lib/gacha/recruitmentPageData';
import { DEFAULT_RECRUITMENT_VIEW, MAX_RECRUITMENT_TAGS, readRecruitmentView, recruitmentViewHash, type RecruitmentViewState } from '@/lib/gacha/recruitmentViewState';
import { getOperatorIconPath } from '@/lib/operators/operatorIcon';
import type { OperatorPreviewItem } from '@/components/operators/OperatorPreview';

const OperatorPreview = dynamic(() => import('@/components/operators/OperatorPreview').then(module => module.OperatorPreview), { ssr: false });

const POPOUT_SIZE = { width: 480, height: 760 };

/** Opera GX opens a Document PiP window that does not stay on top (isOperaBrowser). */
export const OPERA_POPOUT_NOTICE = 'Opera GX pop-outs do not stay on top of other windows. Use another browser for Always on Top.';

export default function RecruitmentTool({ operators, guaranteedCombos4, guaranteedCombos5, compact = false }: RecruitmentProps & { compact?: boolean }) {
  const [view, setView] = useState(DEFAULT_RECRUITMENT_VIEW);
  const [ready, setReady] = useState(false);
  const [popupBlocked, setPopupBlocked] = useState(false);
  const [supportsPinnedWindow, setSupportsPinnedWindow] = useState(false);
  const [operaBrowser, setOperaBrowser] = useState(false);
  const [operaPopoutAttempted, setOperaPopoutAttempted] = useState(false);
  const popupRef = useRef<Window | null>(null);
  const pipRef = useRef<Window | null>(null);
  const pip = usePipWindow(POPOUT_SIZE, 'recruit-pip-body');
  const [preview, setPreview] = useState<{ item: OperatorPreviewItem; inPip: boolean } | null>(null);
  const closePreview = useCallback(() => setPreview(null), []);
  useEffect(() => { if (!pip.isOpen) setPreview(current => current?.inPip ? null : current); }, [pip.isOpen]);
  /* The Anti-Page Jump hold for the view tabs (useSwitchHold): the calculator is half the
     cheat sheet's height, and Guarantee cheat sheet -> Calculator from the tab row clamped
     the reader 143px up at 1440. The page's own copy only: the pop-out window scrolls on
     its own, and one ref cannot follow two copies. */
  const viewHold = useSwitchHold('recruitment');

  useEffect(() => {
    // Opera is offered the regular window even though it has the API: its pinned
    // window does not stay on top, so the notice below says so instead.
    const opera = isOperaBrowser(navigator);
    setOperaBrowser(opera);
    setSupportsPinnedWindow(!opera && pipSupported() && !window.matchMedia('(pointer: coarse)').matches);
  }, []);

  useEffect(() => {
    if (pip.error) setSupportsPinnedWindow(false);
  }, [pip.error]);
  const { selectedTags, showAllPossibilities, activeSection, cheatSheetSearch } = view;
  const TAG_LABELS = useReleaseTable<{ tags: Record<string, Record<string, string>> }>('recruitment-tag-labels');
  const tagLabel = useCallback((tag: string) => (TAG_LABELS.tags as Record<string, Record<string, string>>)[tag]?.[view.language ?? 'en'] ?? tag, [view.language, TAG_LABELS]);
  const categories = useMemo(() => getRecruitmentTagCategories(operators), [operators]);
  const allowedTags = useMemo(() => Object.values(categories).flat(), [categories]);

  useEffect(() => {
    const restore = () => setView(readRecruitmentView(window.location.hash, allowedTags));
    restore();
    setReady(true);
    window.addEventListener('hashchange', restore);
    return () => window.removeEventListener('hashchange', restore);
  }, [allowedTags]);

  useEffect(() => {
    if (!ready) return;
    const hash = recruitmentViewHash(view);
    if (window.location.hash !== hash) {
      // Preserve Next's history entry. Replacing avoids a Back step for every tag.
      window.history.replaceState(window.history.state, '', `${window.location.pathname}${window.location.search}${hash}`);
    }
  }, [view, ready]);

  useEffect(() => {
    pipRef.current = pip.win;
    if (!pip.win) return;
    const doc = pip.win.document;
    doc.title = 'Recruitment — Arkpedia';
    doc.documentElement.lang = 'en';
    const syncTheme = () => {
      const theme = document.documentElement.getAttribute('data-theme');
      if (theme) doc.documentElement.setAttribute('data-theme', theme);
      else doc.documentElement.removeAttribute('data-theme');
    };
    syncTheme();
    const observer = new MutationObserver(syncTheme);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, [pip.win]);

  useEffect(() => () => { pipRef.current?.close(); }, []);

  const combos = useMemo(() => computeTagCombos(selectedTags, operators), [selectedTags, operators]);
  const visibleCombos = showAllPossibilities ? combos : combos.filter((combo) => !comboShouldBeHidden(combo.operators));
  const multiTagCombos = sortByRarityPriority(visibleCombos.filter((combo) => combo.tags.length > 1));
  const singleTagCombos = sortByRarityPriority(visibleCombos.filter((combo) => combo.tags.length === 1));

  const cheatSheetGroups = useMemo(() => {
    // Each target floor has its own minimal combinations; merge by tag set.
    const unique = new Map<string, GuaranteedCombo>();
    for (const combo of [...guaranteedCombos4, ...guaranteedCombos5]) {
      const tags = [...combo.tags].sort((a, b) => a.localeCompare(b));
      if (!unique.has(tags.join('|'))) unique.set(tags.join('|'), { ...combo, tags });
    }
    const groups = new Map<string, GuaranteedCombo[]>();
    const query = cheatSheetSearch.trim().toLowerCase();
    for (const combo of unique.values()) {
      if (query && !combo.tags.some((tag) => `${tag} ${tagLabel(tag)}`.toLowerCase().includes(query))) continue;
      const primary = combo.tags[0];
      if (!groups.has(primary)) groups.set(primary, []);
      groups.get(primary)!.push(combo);
    }
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([tag, entries]) => ({
      tag,
      entries: entries.sort((a, b) => cheatSheetTier(a) - cheatSheetTier(b) || a.operatorCount - b.operatorCount),
    }));
  }, [guaranteedCombos4, guaranteedCombos5, cheatSheetSearch, tagLabel]);

  function updateView(update: Partial<RecruitmentViewState>) {
    setView((current) => ({ ...current, ...update }));
  }

  function toggleTag(tag: string) {
    setView((current) => ({
      ...current,
      selectedTags: current.selectedTags.includes(tag)
        ? current.selectedTags.filter((value) => value !== tag)
        : current.selectedTags.length < MAX_RECRUITMENT_TAGS ? [...current.selectedTags, tag] : current.selectedTags,
    }));
  }

  function openPopout() {
    setPopupBlocked(false);
    if (operaBrowser) setOperaPopoutAttempted(true);
    if (pip.win && !pip.win.closed) { pip.win.focus(); return; }
    if (popupRef.current && !popupRef.current.closed) { popupRef.current.focus(); return; }
    if (supportsPinnedWindow) {
      void pip.open();
      return;
    }
    // Keep this synchronous with the click so browsers can grant the popup.
    try {
      popupRef.current = window.open(`/recruitment/popout${recruitmentViewHash(view)}`, 'arkpedia-recruitment', 'popup,width=480,height=760,resizable=yes,scrollbars=yes');
      if (popupRef.current) {
        pip.clearError();
        popupRef.current.focus();
      }
      else setPopupBlocked(true);
    } catch {
      setPopupBlocked(true);
    }
  }

  function returnToPage() {
    pip.close();
    window.focus();
  }

  function renderTool(isCompact: boolean, inPip = false) {
    const otherPage = `${isCompact ? '/recruitment' : '/recruitment/popout'}${recruitmentViewHash(view)}`;
    const openPreview = (operator: RecruitableOperator) => setPreview({ inPip, item: { name: operator.name, rarity: operator.rarity ?? 6, icon: getOperatorIconPath(operator) } });
    return (
      <div className={`recruit-page${isCompact ? ' recruit-page-compact' : ''}`} style={{ '--recruit-text-size': `${view.textSize ?? 14}px` } as CSSProperties}>
        {isCompact ? (
          /* The pop-out and the always-on-top window are full-bleed by design: a
             narrow window beside the game, so they keep a compact header of their own. */
          <header className="recruit-header">
            <div className="recruit-heading">
              <Image src="/item-icons/recruitment_permit.png" alt="" width={30} height={30} />
              <div>
                <h1>Recruitment</h1>
                <p>Arkpedia</p>
              </div>
            </div>
            <div className="recruit-window-actions">
              {inPip ? <button type="button" className="ghost btn-sm" onClick={returnToPage}>Return to page</button> : (
                <>
                  <ThemeToggle />
                  <Link prefetch={false} className="ghost btn-sm" href={otherPage}>Full page</Link>
                </>
              )}
            </div>
          </header>
        ) : (
          <PageHeader
            eyebrow="Rhodes Island // Recruitment Office"
            title="Recruitment"
            sub="Find the best combination in your five tags."
          />
        )}

        <main className="recruit-main">
          {!isCompact && operaPopoutAttempted && (
            <p className="recruit-window-notice" role="status">{OPERA_POPOUT_NOTICE}</p>
          )}
          {!isCompact && popupBlocked && (
            <p className="recruit-window-notice" role="status">
              The window could not open. Allow pop-ups for Arkpedia, or{' '}
              <a href={otherPage} target="_blank" rel="noopener noreferrer">open the compact view in a new tab</a>.
            </p>
          )}
          {!isCompact && pip.error && !popupBlocked && (
            <p className="recruit-window-notice" role="status">
              {pip.error}{' '}
              <button type="button" className="recruit-text-button" onClick={openPopout}>Open a regular window</button>.
            </p>
          )}
          {!isCompact && pip.isOpen && (
            <p className="recruit-window-notice" role="status">
              Pop-out is open. Tags and results stay in sync.{' '}
              <button type="button" className="recruit-text-button" onClick={returnToPage}>Close pop-out</button>
            </p>
          )}
          {isCompact && !inPip && (operaBrowser
            ? <p className="recruit-window-notice" role="status">{OPERA_POPOUT_NOTICE}</p>
            : <p className="recruit-compact-note">Keep this window beside your game. This view does not stay on top.</p>)}

          <div className="recruit-preferences">
            <SegmentedControl label="Tag language" value={view.language ?? 'en'} options={['en', 'jp', 'kr', 'cn'].map(value => ({ value: value as 'en' | 'jp' | 'kr' | 'cn', label: value.toUpperCase() }))} onChange={language => updateView({ language })} />
            <label>Text size <input type="range" aria-label="Recruitment text size" min="12" max="22" step="1" value={view.textSize ?? 14} onChange={e => updateView({ textSize: Number(e.target.value) })} />{view.textSize ?? 14}px</label>
            {!isCompact && <button type="button" className="ghost btn-sm recruit-popout-button" onClick={openPopout}
              title={pip.isOpen ? 'Focus pop-out' : supportsPinnedWindow ? 'Open an always-on-top window' : 'Open a regular window; it will not stay on top'}>
              <PopoutIcon /> Pop-out
            </button>}
          </div>
          <div className="recruit-toolbar">
            <Tabs
              label="Recruitment view"
              id="recruit-view"
              value={activeSection}
              onChange={(section) => { if (!inPip) viewHold.capture(); updateView({ activeSection: section }); }}
              options={[{ value: 'calculator', label: 'Calculator' }, { value: 'cheatsheet', label: 'Guarantee cheat sheet' }]}
            />
            {!isCompact && <span className="recruit-pool-count">{operators.length} recruitable operators</span>}
          </div>

          <div ref={inPip ? undefined : viewHold.ref} style={inPip ? undefined : viewHold.style}>
          {activeSection === 'calculator' ? (
            <div className="recruit-workspace" {...tabPanelProps('recruit-view', 'calculator')}>
              <section className="recruit-picker op-section" aria-labelledby="recruit-picker-title">
                <div className="recruit-section-heading">
                  <h2 id="recruit-picker-title">Your tags {isCompact && <span className="recruit-selection-count">{selectedTags.length}/5</span>}</h2>
                  <button type="button" className="ghost btn-sm" disabled={!selectedTags.length} onClick={() => updateView({ selectedTags: [] })}>Clear tags</button>
                </div>
                <p className="recruit-help" id="recruit-selection-help">
                  {selectedTags.length === MAX_RECRUITMENT_TAGS ? 'All five selected. Remove a tag to change it.' : 'Select up to five tags from your recruitment slot.'}
                </p>
                {!isCompact && <div className="recruit-selection" role="group" aria-label={`${selectedTags.length} of ${MAX_RECRUITMENT_TAGS} tags selected`}>
                  {Array.from({ length: MAX_RECRUITMENT_TAGS }, (_, index) => selectedTags[index] ? (
                    <button type="button" key={index} onClick={() => toggleTag(selectedTags[index])} aria-label={`Remove ${selectedTags[index]}`}>
                      <span>{tagLabel(selectedTags[index])}</span><span aria-hidden="true">×</span>
                    </button>
                  ) : <span key={index} className="recruit-empty-slot" aria-hidden="true">+</span>)}
                </div>}
                <div className="recruit-tag-groups" aria-describedby="recruit-selection-help">
                  <TagRow label="Qualification" options={categories.qualifications} selectedTags={selectedTags} onToggle={toggleTag} tagLabel={tagLabel} />
                  <TagRow label="Position" options={categories.positions} selectedTags={selectedTags} onToggle={toggleTag} tagLabel={tagLabel} />
                  <TagRow label="Class" options={categories.classes} selectedTags={selectedTags} onToggle={toggleTag} tagLabel={tagLabel} />
                  <TagRow label="Traits" options={categories.tags} selectedTags={selectedTags} onToggle={toggleTag} tagLabel={tagLabel} />
                </div>
                <p className="recruit-picker-footnote">Explore five available tags. Each result uses up to three.</p>
              </section>

              <section className="recruit-results op-section" aria-labelledby="recruit-results-title">
                <div className="recruit-section-heading">
                  <h2 id="recruit-results-title">Possible recruits</h2>
                  <span className="recruit-result-count" role="status">{visibleCombos.length} {visibleCombos.length === 1 ? 'combination' : 'combinations'}</span>
                </div>
                <label className="check recruit-results-filter">
                  <input type="checkbox" checked={!showAllPossibilities} onChange={(event) => updateView({ showAllPossibilities: !event.target.checked })} />
                  Prioritize 4★+ and Robots
                </label>
                {!selectedTags.length ? (
                  <div className="recruit-empty-state">
                    <Image src="/item-icons/recruitment_permit.png" alt="" width={72} height={72} />
                    <h3>Start with the tags you see</h3>
                    <p>Choose your available tags to compare operators and spot the combinations worth keeping.</p>
                    <button type="button" className="ghost btn-sm" onClick={() => updateView({ activeSection: 'cheatsheet' })}>Browse guaranteed combinations</button>
                  </div>
                ) : !visibleCombos.length ? (
                  <div className="recruit-empty-state">
                    <h3>{combos.length ? 'No priority combinations' : 'No matching operators'}</h3>
                    <p>{combos.length ? 'These combinations include 3★ operators or only 2★ operators. Show all possibilities to inspect the full pool.' : 'Clear your tags and try another selection.'}</p>
                    {combos.length > 0 && <button type="button" className="ghost btn-sm" onClick={() => updateView({ showAllPossibilities: true })}>Show all possibilities</button>}
                  </div>
                ) : (
                  <>
                    {multiTagCombos.length > 0 && <ComboGroup title="Combined tags" combos={multiTagCombos} hideTwoStars={!showAllPossibilities} onPreview={openPreview} tagLabel={tagLabel} />}
                    {singleTagCombos.length > 0 && <ComboGroup title="Single tags" combos={singleTagCombos} hideTwoStars={!showAllPossibilities} onPreview={openPreview} tagLabel={tagLabel} />}
                  </>
                )}
              </section>
            </div>
          ) : (
            <section className="recruit-cheatsheet op-section" {...tabPanelProps('recruit-view', 'cheatsheet')}>
              <div className="recruit-section-heading">
                <h2 id="recruit-sheet-title">Tags worth keeping</h2>
                <span className="recruit-sheet-legend"><span className="recruit-rarity-5">5★</span><span className="recruit-rarity-4">4★+</span></span>
              </div>
              <p className="recruit-help">Find a tag you have, then look for its pairings. Select a combination to see its operators.</p>
              <SearchInput id="recruit-sheet-search" label="Search tags" className="recruit-search" placeholder="Try DPS, Healing, Nuker…" value={cheatSheetSearch} onChange={(value) => updateView({ cheatSheetSearch: value.slice(0, 100) })} />
              <p className="recruit-sheet-count" role="status">{cheatSheetGroups.reduce((count, group) => count + group.entries.length, 0)} combinations</p>
              {cheatSheetGroups.length ? cheatSheetGroups.map(({ tag, entries }) => (
                <div key={tag} className="recruit-sheet-row">
                  <h3>{tagLabel(tag)}</h3>
                  <div className="recruit-sheet-pairings">
                    {entries.map((entry) => (
                      <button key={entry.tags.join('|')} type="button" className={`btn-bare recruit-sheet-pairing ${entry.minRarity >= 5 ? 'recruit-rarity-5' : 'recruit-rarity-4'}`} aria-label={`Show ${entry.tags.join(' + ')} operators, ${entry.minRarity >= 5 ? '5 star' : '4 star or higher'}`} onClick={() => updateView({ selectedTags: entry.tags, activeSection: 'calculator', showAllPossibilities: false })}>
                        <span>{entry.tags.length === 1 ? 'This tag alone' : `+ ${entry.tags.slice(1).map(tagLabel).join(' + ')}`}</span>
                        <span>{entry.minRarity >= 5 ? '5★' : '4★+'}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )) : (
                <div className="recruit-empty-state">
                  <h3>No combinations found</h3>
                  <p>Try another tag name or clear your search.</p>
                  <button type="button" className="ghost btn-sm" onClick={() => updateView({ cheatSheetSearch: '' })}>Clear search</button>
                </div>
              )}
              <p className="recruit-picker-footnote">Only the smallest combinations for each rarity are listed. Senior Operator and Top Operator already specify their rarity.</p>
            </section>
          )}
          </div>
        </main>
        {preview?.inPip === inPip && <OperatorPreview key={preview.item.name} item={preview.item} onClose={closePreview} nativeModal />}
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>{`${compact ? 'Recruitment pop-out' : 'Recruitment'} — Arkpedia`}</title>
        <meta name="description" content="Compare Arknights recruitment tag combinations, look up guaranteed recruits, and pop out a compact calculator beside your game." />
        {compact && <meta name="robots" content="noindex" />}
      </Head>
      {renderTool(compact)}
      {pip.isOpen && <PipWindow host={pip.host}>{renderTool(true, true)}</PipWindow>}
    </>
  );
}

// Preserve the calculator's existing priorities: 3★ risk hides the combination;
// Robots remain useful, and a pool made entirely of hidden 2★ has nothing to show.
function comboShouldBeHidden(operators: RecruitableOperator[]): boolean {
  return operators.some((operator) => operator.rarity === 3) || operators.every((operator) => operator.rarity === 2);
}

function cheatSheetTier(combo: GuaranteedCombo): number {
  return combo.minRarity >= 5 ? 0 : combo.maxRarity >= 5 ? 1 : 2;
}

function getComboRarityInfo(operators: RecruitableOperator[]): { colorClass: string; priority: number } {
  const rarities = operators.map((operator) => operator.rarity).filter((rarity): rarity is number => rarity != null);
  const allSame = (rarity: number) => rarities.length > 0 && rarities.every((value) => value === rarity);
  if (rarities.includes(6)) return { colorClass: 'recruit-rarity-6', priority: 0 };
  if (allSame(5)) return { colorClass: 'recruit-rarity-5', priority: 1 };
  if (allSame(4)) return { colorClass: 'recruit-rarity-4', priority: 2 };
  if (allSame(1)) return { colorClass: 'recruit-rarity-1', priority: 3 };
  if (allSame(3)) return { colorClass: 'recruit-rarity-3', priority: 4 };
  if (allSame(2)) return { colorClass: 'recruit-rarity-2', priority: 5 };
  return { colorClass: '', priority: 6 };
}

function sortByRarityPriority(combos: TagCombo[]): TagCombo[] {
  return [...combos].sort((a, b) => getComboRarityInfo(a.operators).priority - getComboRarityInfo(b.operators).priority);
}

function TagRow({ label, options, selectedTags, onToggle, tagLabel }: { tagLabel: (tag: string) => string; label: string; options: string[]; selectedTags: string[]; onToggle: (tag: string) => void }) {
  return (
    <fieldset className="recruit-tag-row">
      <legend>{label}</legend>
      <div className="recruit-tag-picker">
        {options.map((tag) => (
          <button key={tag} type="button" className="filter-chip" aria-pressed={selectedTags.includes(tag)} disabled={!selectedTags.includes(tag) && selectedTags.length >= MAX_RECRUITMENT_TAGS} onClick={() => onToggle(tag)}>
            {tagLabel(tag)}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function ComboGroup({ title, combos, hideTwoStars, onPreview, tagLabel }: { tagLabel: (tag: string) => string; title: string; combos: TagCombo[]; hideTwoStars: boolean; onPreview: (operator: RecruitableOperator) => void }) {
  return (
    <div className="recruit-combo-block">
      <h3 className="recruit-combo-heading">{title}</h3>
      {combos.map((combo) => <ComboRow key={combo.tags.join('|')} combo={combo} hideTwoStars={hideTwoStars} onPreview={onPreview} tagLabel={tagLabel} />)}
    </div>
  );
}

function ComboRow({ combo, hideTwoStars, onPreview, tagLabel }: { tagLabel: (tag: string) => string; combo: TagCombo; hideTwoStars: boolean; onPreview: (operator: RecruitableOperator) => void }) {
  const { colorClass } = getComboRarityInfo(combo.operators);
  const sorted = combo.operators.filter((operator) => !hideTwoStars || operator.rarity !== 2).sort((a, b) => (a.rarity || 0) - (b.rarity || 0));
  const rarities = sorted.map((operator) => operator.rarity).filter((rarity): rarity is number => rarity != null);
  const min = Math.min(...rarities);
  const max = Math.max(...rarities);
  return (
    <div className={`recruit-combo-row ${colorClass}`}>
      <div className="recruit-combo-summary">
        <div className="recruit-combo-tags">
          {combo.tags.map((tag, index) => <span key={tag}>{index > 0 && <span className="recruit-combo-plus">+</span>}{tagLabel(tag)}</span>)}
        </div>
        <span className="recruit-combo-range">{min === max ? `${min}★` : `${min}–${max}★`}</span>
      </div>
      <div className="recruit-combo-operators">
        {sorted.map((operator) => (
          <button type="button" key={operator.name} className="btn-bare recruit-combo-op" data-rarity={operator.rarity ? rarityLevel(operator.rarity) : undefined} aria-label={`View ${operator.name} details`} aria-haspopup="dialog" onClick={() => onPreview(operator)}>
            <Image src={getOperatorIconPath(operator)} alt="" width={28} height={28} />
            <span>{operator.name}</span>
            {operator.rarity ? <Rarity n={rarityLevel(operator.rarity)} className="recruit-combo-op-rarity" /> : null}
          </button>
        ))}
      </div>
    </div>
  );
}

function PopoutIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M14 3h7v7m0-7L11 13" /><path d="M10 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5" /></svg>;
}
