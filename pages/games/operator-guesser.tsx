import NumberInput from '@/components/ui/NumberInput';
import PageMeta from '@/components/layout/PageMeta';
import { withContentPage } from '@/lib/content/server';
import GameLinks, { GamesEyebrow } from '@/components/minigames/GameLinks';
import PageHeader from '@/components/ui/PageHeader';
import SegmentedControl from '@/components/ui/SegmentedControl';
import SearchInput from '@/components/ui/SearchInput';
import Rarity, { rarityLevel } from '@/components/ui/Rarity';
import { useHeightFloor } from '@/components/ui/useHeightFloor';
import { GetStaticProps } from 'next';
import Image from '@/components/content/ContentImage';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { getAllOperators } from '@/lib/operators/operators';
import { isOperatorReleased, operatorRelease } from '@/lib/operators/operatorAvailability';
import { getOperatorIconPath } from '@/lib/operators/operatorIcon';
import { getAllSkins } from '@/lib/skins/skins';
import { GuesserOperator } from '@/lib/operators/operatorTypes';
import { toGuesserOperator } from '@/lib/guesser/guesserPageData';
import { matchesSearch, searchRelevance } from '@/lib/search/searchNormalize';
import { buildHintPool, pickRandomOperator, shuffle, NOT_AVAILABLE, GuesserSkin } from '@/lib/guesser/guesserLogic';
import { Hint, ALL_HINT_TYPES, HINT_GROUPS, HintType, ThemedLevel, THEMED_MODES } from '@/lib/guesser/guesserTypes';

import styles from '@/styles/games/guesser.module.css';
import { operatorHref } from '@/lib/operators/operatorHref';

interface Props {
  operators: GuesserOperator[];
  skins: GuesserSkin[];
}


type GameStatus = 'notStarted' | 'playing' | 'won' | 'lost' | 'gaveUp';

const NO_REPEAT_ROUNDS = 50;

export default function GuesserPage({ operators, skins }: Props) {
  const realOperators = useMemo(
    () =>
      // The reader's clock: the answer pool is only used once a round starts, after hydration.
      operators.filter((operator) => operatorRelease(operator) !== null && isOperatorReleased(operator, Date.now())),
    [operators]
  );

  const [recentNames, setRecentNames] = useState<string[]>([]);

  function recordRecentOperator(name: string) {
    setRecentNames((current) => [...current, name].slice(-NO_REPEAT_ROUNDS));
  }

  const [hintOrder, setHintOrder] = useState<HintType[]>(
    () => ALL_HINT_TYPES.map((h) => h.type)
  );
  const [hintMode, setHintMode] = useState<'randomized' | 'ordered' | 'themed'>('randomized');
  const [themedLevel, setThemedLevel] = useState<ThemedLevel | null>(null);
  const [target, setTarget] = useState<GuesserOperator | null>(null);
  const [hintPool, setHintPool] = useState<Hint[]>([]);
  const [revealedCount, setRevealedCount] = useState(1);
  const [wrongGuesses, setWrongGuesses] = useState<string[]>([]);
  const [status, setStatus] = useState<GameStatus>('notStarted');
  const [input, setInput] = useState('');
  const [maxGuesses, setMaxGuesses] = useState(10);
  const [hintsPerGuess, setHintsPerGuess] = useState(1);
  // Vasebreaker: only the first hint auto-reveals; the rest stay hidden
  // until tapped individually (any order), free of cost, never
  // auto-advancing on a wrong guess. Not available in Themed mode,
  // which already reveals its whole curated set at once. Kept as a
  // separate index set rather than reusing revealedCount, since normal
  // mode's reveal is always a contiguous prefix but Vasebreaker's can
  // be revealed out of order.
  const [vasebreakerMode, setVasebreakerMode] = useState(false);
  const [vasebreakerRevealOrder, setVasebreakerRevealOrder] = useState<number[]>([]);
  const answerFieldRef = useRef<HTMLElement>(null);
  const roundRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const zoomRef = useRef<HTMLDialogElement>(null);
  /* "Customize hints" is controlled rather than a bare <details>, so closing it is a
     React render: the height floor below only sees what React renders, and a native
     toggle would shorten the page with nothing watching. */
  const [customizeOpen, setCustomizeOpen] = useState(false);
  /* Closing the hint list takes ~470px (1440) / ~800px (390) off the page; a reader
     who closes it from below would be clamped up the screen. The floor holds the
     place and hands the space back as they scroll up. Per hint mode, because a mode
     change swaps the whole section. */
  const configurationFloor = useHeightFloor(hintMode);
  const [zoomedHintImage, setZoomedHintImage] = useState<{ src: string; label: string } | null>(null);

  useEffect(() => {
    const dialog = zoomRef.current;
    if (zoomedHintImage && !dialog?.open) dialog?.showModal();
    if (!zoomedHintImage && dialog?.open) dialog.close();
  }, [zoomedHintImage]);

  useEffect(() => {
    if (status !== 'playing') return;
    if (window.matchMedia('(min-width: 801px)').matches) inputRef.current?.focus({ preventScroll: true });
    roundRef.current?.scrollIntoView({ block: 'start' });
  }, [status, target]);

  function toggleHintType(type: HintType) {
    if (hintMode === 'randomized') {
      // Randomized: each hint toggles independently, no order to
      // preserve or truncate -- clicking one shouldn't affect any
      // other hint's selected state.
      setHintOrder((current) =>
        current.includes(type) ? current.filter((t) => t !== type) : [...current, type]
      );
      return;
    }
    setHintOrder((current) => {
      const idx = current.indexOf(type);
      if (idx === -1) {
        // Not yet selected -- clicking adds it as the next hint in order.
        return [...current, type];
      }
      // Already selected -- clicking it again pulls the order back down
      // to end here, dropping everything that was ordered after it.
      return current.slice(0, idx + 1);
    });
  }

  function selectAllHints() {
    setHintOrder(ALL_HINT_TYPES.map((h) => h.type));
  }

  function deselectAllHints() {
    setHintOrder([]);
  }

  const selectedThemedMode = useMemo(() => THEMED_MODES.find((m) => m.level === themedLevel) || null, [themedLevel]);

  const enabledTypes = useMemo(() => {
    if (hintMode === 'themed') {
      return new Set(selectedThemedMode ? selectedThemedMode.hints.map((h) => h.type) : []);
    }
    return new Set(hintOrder);
  }, [hintMode, hintOrder, selectedThemedMode]);

  const eligibleOperators = useMemo(() => {
    if (hintMode === 'themed') {
      if (!selectedThemedMode) return [];
      // Every themed category must have a real hint for this operator.
      return realOperators.filter((op) => {
        const pool = buildHintPool(op, enabledTypes, skins);
        return selectedThemedMode.hints.every((h) => pool.some((hint) => hint.type === h.type && hint.value !== NOT_AVAILABLE));
      });
    }
    return realOperators.filter((op) => buildHintPool(op, enabledTypes, skins).length > 0);
  }, [realOperators, enabledTypes, skins, hintMode, selectedThemedMode]);

  const pickableOperators = useMemo(() => {
    const recentSet = new Set(recentNames);
    const notRecent = eligibleOperators.filter((op) => !recentSet.has(op.name));
    // Fall back to the full eligible set if excluding recent ones would
    // leave nothing to pick from -- otherwise very restrictive hint
    // settings could deadlock the game entirely.
    return notRecent.length > 0 ? notRecent : eligibleOperators;
  }, [eligibleOperators, recentNames]);

  function startRound() {
    if (pickableOperators.length === 0) return;
    const next = pickRandomOperator(pickableOperators);
    const pool = buildHintPool(next, enabledTypes, skins);
    let orderedPool: Hint[];
    if (hintMode === 'themed') {
      // Cap any type marked takeAll:false down to a single instance
      // (e.g. Hard's skin/talent/base-skill names), so a multi-skin
      // operator doesn't flood the themed set with every skin name --
      // the mode calls for exactly one of each listed type.
      const takeOneTypes = new Set((selectedThemedMode?.hints || []).filter((h) => !h.takeAll).map((h) => h.type));
      const seenOnce = new Set<HintType>();
      const filtered = pool.filter((hint) => {
        if (!takeOneTypes.has(hint.type)) return true;
        if (seenOnce.has(hint.type)) return false;
        seenOnce.add(hint.type);
        return true;
      });
      // buildHintPool returns its results pre-shuffled, so without this
      // the themed set would show in random order instead of the order
      // the theme itself lists its hints in.
      const themeOrder = (selectedThemedMode?.hints || []).map((h) => h.type);
      orderedPool = filtered.sort((a, b) => themeOrder.indexOf(a.type) - themeOrder.indexOf(b.type));
    } else if (hintMode === 'ordered') {
      orderedPool = [...pool].sort((a, b) => hintOrder.indexOf(a.type) - hintOrder.indexOf(b.type));
    } else {
      orderedPool = shuffle(pool);
    }
    setTarget(next);
    setHintPool(orderedPool);
    // Themed shows its whole curated set at once, not progressively.
    // Vasebreaker always starts at exactly 1 -- hintsPerGuess doesn't apply in that mode.
    setRevealedCount(
      hintMode === 'themed' ? orderedPool.length : vasebreakerMode ? Math.min(1, orderedPool.length) : Math.min(hintsPerGuess, orderedPool.length)
    );
    setVasebreakerRevealOrder(vasebreakerMode && orderedPool.length > 0 ? [0] : []);
    setWrongGuesses([]);
    setStatus('playing');
    setInput('');
    recordRecentOperator(next.name);
  }

  const wrongCount = wrongGuesses.length;

  const suggestions = useMemo(() => {
    if (!input.trim()) return [];
    return realOperators
      .filter((o) => matchesSearch(o.name, input))
      .sort((a, b) => searchRelevance(a.name, input) - searchRelevance(b.name, input))
      .slice(0, 8);
  }, [input, realOperators]);

  function submitGuess(guessName: string) {
    if (status !== 'playing' || !target) return;
    setInput('');
    inputRef.current?.focus({ preventScroll: true });

    if (guessName.toLowerCase() === target.name.toLowerCase()) {
      setStatus('won');
      return;
    }

    const nextWrong = [...wrongGuesses, guessName];
    setWrongGuesses(nextWrong);

    if (nextWrong.length >= maxGuesses) {
      setStatus('lost');
      return;
    }
    // Vasebreaker: hints are only ever revealed by manually tapping
    // them -- never automatically advanced on a wrong guess. (Themed
    // mode already has revealedCount === hintPool.length from the
    // start, so this is naturally a no-op there regardless.)
    if (!vasebreakerMode && revealedCount < hintPool.length) {
      setRevealedCount((c) => Math.min(c + hintsPerGuess, hintPool.length));
    }
  }

  /** Vasebreaker only: reveals a specific hint slot on tap, free of
   * cost -- doesn't touch guesses, wrongGuesses, or status at all. */
  function revealHintManually(index: number) {
    if (status !== 'playing' || !vasebreakerMode) return;
    setVasebreakerRevealOrder((current) => (current.includes(index) ? current : [...current, index]));
  }

  function giveUp() {
    setStatus('gaveUp');
  }

  function changeSettings() {
    // Clears the previous round's leftover state (target, hints,
    // revealed answer, play-again button) since opening settings means
    // starting a new round once they're done configuring -- otherwise
    // the old round's answer stays visible underneath the settings panel.
    setStatus('notStarted');
    setTarget(null);
    setHintPool([]);
    setRevealedCount(1);
    setVasebreakerRevealOrder([]);
    setWrongGuesses([]);
    setInput('');
  }

  const isOver = status === 'won' || status === 'lost' || status === 'gaveUp';

  const shownCount = vasebreakerMode ? vasebreakerRevealOrder.length : revealedCount;
  const remaining = maxGuesses - wrongCount;
  const modeLabel = hintMode === 'themed' ? `${selectedThemedMode?.label || 'Themed'} theme` : hintMode === 'ordered' ? 'Ordered' : 'Randomized';
  // The field's own Enter picks a highlighted suggestion (or the only one); the
  // submit button and a plain Enter fall back to an exact name.
  const candidate = suggestions.find((op) => op.name.toLowerCase() === input.trim().toLowerCase())
    || (suggestions.length === 1 ? suggestions[0] : null);
  const shownIndices = vasebreakerMode
    ? [...vasebreakerRevealOrder].reverse()
    : Array.from({ length: revealedCount }, (_, i) => i);
  if (!vasebreakerMode && hintMode !== 'themed') shownIndices.reverse();

  return (
    <>
      <PageMeta title="Operator Guesser" description="Identify Arknights operators from their skills, stories and profiles. Choose your hints or try a themed challenge." path="/games/operator-guesser" />
      <PageHeader eyebrow={<GamesEyebrow />} title="Operator Guesser" sub="Name the operator from their skills, stories and profile."
        actions={<>
          {(!vasebreakerMode || status === 'notStarted') && <GameLinks />}
          {status !== 'notStarted' && <span className="badge">{modeLabel}{vasebreakerMode ? ' · Vasebreaker' : ''}</span>}
        </>} />
      <main className={styles.page}>

        {status === 'notStarted' ? (
          <div className={styles.setup}>
            <div className={styles.roundSetup} aria-label="Round settings">
              <SegmentedControl label="Hint order" value={hintMode}
                options={GAME_MODES.map((mode) => ({ value: mode.id, label: mode.label, icon: <ModeIcon mode={mode.id} />, title: mode.description }))}
                onChange={(mode) => { setHintMode(mode); setCustomizeOpen(mode === 'ordered'); if (mode === 'themed') setVasebreakerMode(false); }} />
              <div className={styles.setupControls}>
              <label className={styles.numberSetting}>
                <span>Guesses</span>
                <NumberInput className={styles.number} min={1} max={30} value={maxGuesses} onFocus={(e) => e.target.select()} onClick={(e) => e.currentTarget.select()} onChange={(e) => setMaxGuesses(Math.max(1, Math.min(30, Number(e.target.value) || 1)))} />
              </label>
              {hintMode !== 'themed' && (
                <div className={styles.revealSetting}>
                  <SegmentedControl label="Reveal hints" value={vasebreakerMode ? 'vasebreaker' : 'automatic'}
                    options={[{ value: 'automatic', label: 'Automatic' }, { value: 'vasebreaker', label: 'Vasebreaker' }]}
                    onChange={(value) => setVasebreakerMode(value === 'vasebreaker')} />
                </div>
              )}
              {hintMode !== 'themed' && !vasebreakerMode && (
                <label className={styles.numberSetting}>
                  <span>Hints / guess</span>
                  <NumberInput className={styles.number} min={1} max={10} value={hintsPerGuess} onFocus={(e) => e.target.select()} onClick={(e) => e.currentTarget.select()} onChange={(e) => setHintsPerGuess(Math.max(1, Math.min(10, Number(e.target.value) || 1)))} />
                </label>
              )}
              <div className={styles.startArea}>
                <button type="button" className="primary btn-sm" onClick={startRound} disabled={eligibleOperators.length === 0 || (hintMode === 'themed' && !themedLevel)}>Start round</button>

              </div>
              </div>
              {eligibleOperators.length === 0 && <p className={styles.availability} role="status">{hintMode === 'themed' && !themedLevel ? 'Pick a theme to begin.' : 'Select hints with matching operators.'}</p>}
            </div>
            <section ref={configurationFloor.ref} className={`op-section ${styles.configuration}`} aria-labelledby="guesser-mode-heading">
              <h2 id="guesser-mode-heading">Hints</h2>

              {hintMode === 'themed' ? (
                <div>
                  <h3>Pick a theme</h3>
                  <p className={styles.supporting}>Each theme reveals its fixed set of hints at the start.</p>
                  <div className={styles.themes} role="group" aria-label="Theme">
                    {THEMED_MODES.map((mode) => (
                      <button key={mode.level} type="button" className={`btn-bare pick-card ${styles.theme}`} aria-pressed={themedLevel === mode.level} onClick={() => setThemedLevel(mode.level)}>
                        <strong>{mode.label}<span aria-hidden="true">{themedLevel === mode.level ? '✓' : '+'}</span></strong>
                        <span>{mode.hints.map((h) => ALL_HINT_TYPES.find((t) => t.type === h.type)?.label).join(' · ')}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <details className={styles.disclosure} open={customizeOpen}>
                  <summary onClick={(event) => { event.preventDefault(); setCustomizeOpen((open) => !open); }}>
                    <span>Customize hints</span><span className="filter-chip-count">{hintOrder.length} selected</span>
                  </summary>
                  <div className={styles.customizeBody}>
                    <p className={styles.supporting}>
                      {hintMode === 'ordered'
                        ? 'Select hints in the order you want them. Selecting a chosen hint keeps the sequence up to that point.'
                        : 'Choose which clues can appear. A wrong guess reveals more hints.'}
                    </p>
                    <div className={styles.selectionTools}>
                      <button type="button" className="ghost" onClick={selectAllHints}>Select all</button>
                      <button type="button" className="ghost" onClick={deselectAllHints}>Clear selection</button>
                    </div>
                    {HINT_GROUPS.map((group) => (
                      <fieldset className={styles.hintGroup} key={group.label}>
                        <legend>{group.label}</legend>
                        <div className={styles.categories}>
                          {ALL_HINT_TYPES.filter((hint) => group.types.includes(hint.type)).map((hint) => {
                            const orderIndex = hintOrder.indexOf(hint.type);
                            const selected = orderIndex !== -1;
                            return (
                              <button key={hint.type} type="button" className={`filter-chip ${styles.category}`} aria-pressed={selected} onClick={() => toggleHintType(hint.type)}>
                                <span className={styles.check} aria-hidden="true">{selected ? hintMode === 'ordered' ? orderIndex + 1 : '✓' : ''}</span>
                                {hint.label}
                              </button>
                            );
                          })}
                        </div>
                      </fieldset>
                    ))}
                  </div>
                </details>
              )}
              {configurationFloor.spacer}
            </section>
          </div>
        ) : target && (
          <div className={styles.round} data-vasebreaker={vasebreakerMode} data-finished={isOver} ref={roundRef}>
            <section className={styles.evidence} aria-labelledby="hints-heading">
              <div className={`op-section ${styles.hintsHeader}`}>
                <div><h2 id="hints-heading">Your clues</h2>{!vasebreakerMode && <p>{hintMode === 'themed' ? 'All hints for this theme are revealed.' : 'Newest clues appear first.'}</p>}</div>
                <span className={styles.hintCount}>{shownCount}<span> / {hintPool.length} revealed</span></span>
              </div>
              {vasebreakerMode && <div className={styles.clueGrid} role="group" aria-label="Reveal a clue">
                {hintPool.map((hint, index) => {
                  const revealed = vasebreakerRevealOrder.includes(index);
                  return <button key={index} type="button" className={`btn-bare ${styles.clueTile}`}
                    aria-label={`${hint.label}, clue ${index + 1}${revealed ? ', revealed' : ', reveal'}`}
                    aria-disabled={revealed || isOver} data-revealed={revealed}
                    onClick={() => { if (!revealed && !isOver) revealHintManually(index); }}>
                    <span>{hint.label}</span><span aria-hidden="true">{revealed ? '✓' : '+'}</span>
                  </button>;
                })}
              </div>}
              <div className={styles.hints} aria-live={vasebreakerMode ? 'polite' : undefined} aria-relevant="additions">
                {shownIndices.map((index) => <HintCard key={index} hint={hintPool[index]} onZoom={setZoomedHintImage} />)}
              </div>
              {!vasebreakerMode && shownCount < hintPool.length && !isOver && (
                <p className={styles.moreHints}>{hintPool.length - shownCount} clues still hidden. Your next wrong guess reveals up to {hintsPerGuess} more.</p>
              )}
            </section>

            <aside className={styles.answerPanel} ref={answerFieldRef} aria-label="Your answer">
              <div role="status" className={styles.roundStatus}>
                <span>{isOver ? 'Guesses used' : 'Guesses remaining'}</span>
                <strong className={remaining <= 2 && !isOver ? styles.lastAttempts : undefined}>{isOver ? wrongCount + (status === 'won' ? 1 : 0) : remaining}<small> / {maxGuesses}</small></strong>
              </div>
              {!isOver && (
                <>
                  <div className={styles.identity}><UnknownOperator /><div><h2>Who is it?</h2><p>Choose an operator to make a guess.</p></div></div>
                  <form className={styles.guessForm} onSubmit={(e) => { e.preventDefault(); if (candidate) submitGuess(candidate.name); }}>
                    <label htmlFor="guesser-input">Operator name</label>
                    <SearchInput id="guesser-input" inputRef={inputRef} label="Operator name" name="guess" value={input} onChange={setInput}
                      placeholder="Search operators…"
                      suggestions={suggestions} getKey={(op) => op.name}
                      renderSuggestion={(op) => <><Image src={getOperatorIconPath(op)} alt="" width={32} height={32} /><span>{op.name}</span></>}
                      onPick={(op) => submitGuess(op.name)} suggestLabel="Matching operators" emptyText="No matching operators. Try another name." />
                    <button type="submit" className={`primary btn-sm ${styles.submit}`} disabled={!candidate}>Guess operator</button>
                  </form>
                </>
              )}
              <div role="status">
                {isOver && (
                  <div className={styles.result} data-outcome={status}>
                    <p className={styles.resultHeading}>{status === 'won' ? 'Operator identified' : status === 'lost' ? 'Out of guesses' : 'Answer revealed'}</p>
                    <Link prefetch={false} href={operatorHref(target.name, null)} className={styles.answerCard}>
                      <Image className={target.rarity ? `tier-${rarityLevel(target.rarity)}` : undefined} src={getOperatorIconPath(target)} alt="" width={88} height={88} />
                      <span><strong>{target.name}</strong><span className={styles.answerMeta}>{target.rarity ? <><Rarity n={rarityLevel(target.rarity)} /> · </> : null}{target.class}</span><small>View operator profile</small></span>
                    </Link>
                    <p>{status === 'won' ? `Found with ${wrongCount + 1} ${wrongCount === 0 ? 'guess' : 'guesses'} and ${shownCount} ${shownCount === 1 ? 'clue' : 'clues'}.` : 'Try another operator, or adjust the challenge.'}</p>
                  </div>
                )}
              </div>
              {isOver && <div className={styles.resultActions}><button type="button" className="primary" onClick={startRound}>Play again</button><button type="button" onClick={changeSettings}>Change settings</button></div>}
              <div className={styles.history} data-empty={wrongCount === 0}>
                <h3>Previous guesses{wrongCount > 0 && <span>{wrongCount}</span>}</h3>
                <div role="status">
                  {wrongGuesses.length > 0 ? <ol>{wrongGuesses.map((name, i) => <li key={`${i}-${name}`}><span>{name}</span><span aria-label="Incorrect">×</span></li>)}</ol> : <p>No guesses yet.</p>}
                </div>
              </div>
              {!isOver && <button type="button" className={`ghost ${styles.giveUp}`} onClick={giveUp}>Give up and reveal answer</button>}
            </aside>
          </div>
        )}
      </main>
      <dialog ref={zoomRef} className={styles.zoom} aria-label="Enlarged skill icon" onCancel={() => setZoomedHintImage(null)} onClose={() => setZoomedHintImage(null)} onClick={(e) => { if (e.target === e.currentTarget) setZoomedHintImage(null); }}>
        {zoomedHintImage && <div className={styles.zoomBody}><button type="button" className="ghost" onClick={() => setZoomedHintImage(null)}>Close image</button><Image src={zoomedHintImage.src} alt={zoomedHintImage.label} width={360} height={360} sizes="(max-width: 480px) 80vw, 360px" /><p>{zoomedHintImage.label}</p></div>}
      </dialog>
    </>
  );
}

const GAME_MODES = [
  { id: 'randomized', label: 'Randomized', description: 'A different mix of clues each round.' },
  { id: 'ordered', label: 'Ordered', description: 'Choose the sequence of your hints.' },
  { id: 'themed', label: 'Themed', description: 'A fixed set of clues. Pick your difficulty.' },
] as const;

function ModeIcon({ mode }: { mode: typeof GAME_MODES[number]['id'] }) {
  return <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {mode === 'randomized' ? <><path d="M3 6h3c4 0 8 12 12 12h3M3 18h3c4 0 8-12 12-12h3M18 3l3 3-3 3M18 15l3 3-3 3" /></> : mode === 'ordered' ? <><path d="M9 5h12M9 12h12M9 19h12" /><circle cx="3" cy="5" r="1" /><circle cx="3" cy="12" r="1" /><circle cx="3" cy="19" r="1" /></> : <><path d="m12 2 10 5-10 5L2 7l10-5ZM2 12l10 5 10-5M2 17l10 5 10-5" /></>}
  </svg>;
}

function UnknownOperator() {
  return <div className={styles.unknownPortrait} aria-hidden="true"><svg viewBox="0 0 80 96" fill="none"><path d="M5 18V5h13M62 5h13v13M5 78v13h13M62 91h13V78" stroke="currentColor" /><circle cx="40" cy="33" r="14" fill="currentColor" opacity=".16" /><path d="M14 77c0-18 10-29 26-29s26 11 26 29" fill="currentColor" opacity=".16" /><text x="40" y="70" textAnchor="middle" fill="currentColor" fontSize="40" fontFamily="var(--font-display)">?</text></svg></div>;
}

function HintCard({ hint, onZoom }: { hint: Hint; onZoom: (image: { src: string; label: string }) => void }) {
  return <article className={styles.hintCard}>
    <h3>{hint.label}</h3>
    {hint.isImage ? <button type="button" className={`btn-bare ${styles.imageHint}`} onClick={() => onZoom({ src: hint.value, label: hint.label })} aria-label={`Enlarge ${hint.label}`}><Image src={hint.value} alt={hint.label} width={56} height={56} /><span>Enlarge icon</span></button> : <p>{hint.value}</p>}
  </article>;
}

export const getStaticProps: GetStaticProps<Props> = withContentPage<Props>("/games/operator-guesser", async () => {
  const operators = getAllOperators().map(toGuesserOperator);
  const skins: GuesserSkin[] = getAllSkins().map((s) => ({
    name: s.name,
    model: s.model,
    illustrator: s.illustrator,
  }));
  return {
    props: { operators, skins },
  };
});
