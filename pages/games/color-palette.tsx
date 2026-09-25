import { withContentPage } from '@/lib/content/server';
import { pinAssetUrl } from '@/lib/assets/revisions';
import type { GetStaticProps } from 'next';
import Head from 'next/head';
import Image from '@/components/content/ContentImage';
import Link from 'next/link';
import { CSSProperties, useEffect, useMemo, useRef, useState } from 'react';
import GameLinks, { GamesEyebrow } from '@/components/minigames/GameLinks';
import PageHeader from '@/components/ui/PageHeader';
import SegmentedControl from '@/components/ui/SegmentedControl';
import Rarity, { rarityLevel } from '@/components/ui/Rarity';
import OperatorAnswer from '@/components/minigames/OperatorAnswer';
import RoundFeedback from '@/components/minigames/RoundFeedback';
import { applyCommunityPaletteOverrides, CommunityPaletteOverrides, getPaletteCatalogue } from '@/lib/minigames/data';
import { newProgress, PaletteMode, PaletteOperator, pickNext, playablePalettes, submitAnswer } from '@/lib/minigames/logic';
import styles from '@/styles/games/minigames.module.css';

/** `now` is the request's clock (contentPageClock); who is released follows from it. */
interface Props { operators: PaletteOperator[]; now: number }
const COLOR_LABELS = ['Hair', 'Clothing 1', 'Clothing 2', 'Skin / clothing 3', 'Accent'];
const MODES: { value: PaletteMode; label: string; description: string }[] = [
  { value: 'base', label: 'Base Skin', description: 'The original operator artwork.' },
  { value: 'elite2', label: 'Elite 2 Skin', description: 'The artwork unlocked at Elite 2.' },
];

export default function PaletteGame({ operators: catalogue, now }: Props) {
  const operators = useMemo(() => playablePalettes(catalogue, now), [catalogue, now]);
  const [mode, setMode] = useState<PaletteMode>('base');
  const [target, setTarget] = useState<PaletteOperator | null>(null);
  const [progress, setProgress] = useState(newProgress);
  const [notice, setNotice] = useState('');
  const [hintsUsed, setHintsUsed] = useState(0);
  const [recent, setRecent] = useState<string[]>([]);
  const [roundNumber, setRoundNumber] = useState(0);
  const roundRef = useRef<HTMLElement>(null);
  const eligible = useMemo(() => operators.filter((operator) => operator[mode]), [operators, mode]);
  const artwork = target?.[mode];
  const playing = progress.status === 'playing';
  const modeLabel = mode === 'base' ? 'Base Skin' : 'Elite 2 Skin';

  useEffect(() => {
    if (!roundNumber) return;
    roundRef.current?.focus({ preventScroll: true });
    roundRef.current?.scrollIntoView({ block: 'start' });
  }, [roundNumber]);
  function startRound() {
    const next = pickNext(eligible, recent, (operator) => `${mode}:${operator.name}`);
    if (!next) return;
    setTarget(next); setProgress(newProgress()); setNotice(''); setHintsUsed(0);
    setRecent((current) => [...current, `${mode}:${next.name}`].slice(-30));
    setRoundNumber((current) => current + 1);
  }
  function guess(name: string) {
    if (!target) return;
    const next = submitAnswer(progress, name, [target.name]);
    setProgress(next);
    setNotice(next === progress ? 'You already tried that operator. No guess used.' : next.status === 'won' ? 'That’s the operator!' : `${name} isn’t the operator. Try again.`);
  }
  function changeMode() {
    setTarget(null); setHintsUsed(0); setProgress(newProgress()); setNotice('');
  }
  return <>
    <Head><title>Color Palette — Arkpedia</title><meta name="description" content="Guess Arknights operators from five colors in their Base or Elite 2 artwork. No purchasable outfits." /></Head>
    <PageHeader eyebrow={<GamesEyebrow />} title="Color Palette" sub="Five colors. One operator." actions={<GameLinks />} />
    <main className={styles.page}>
      {!target ? <section className={`op-section ${styles.panel} ${styles.setup}`} aria-labelledby="palette-setup-title">
        <div className={styles.intro}><h2 id="palette-setup-title">Know them by their colors?</h2><p className={styles.muted}>Name the operator from their artwork colors. You have five guesses, with optional rarity and class hints.</p></div>
        <div className={styles.intro}>
          <SegmentedControl label="Artwork mode" value={mode} options={MODES.map(({ value, label }) => ({ value, label }))} onChange={setMode} />
          <p className={styles.muted}>{MODES.find((entry) => entry.value === mode)?.description}</p>
        </div>
        <details className={`${styles.disclosure} ${styles.rules}`}><summary>How the five colors are chosen</summary><p>From left to right: hair, clothing 1, clothing 2, skin or clothing 3, then an accent or prominent item. The fourth color uses skin when it covers a substantial visible area; otherwise, it uses another clothing color. When hair is covered or absent, the first color comes from visible headgear, fur, or shell.</p></details>
        <p className={styles.muted}>Only released Global operators. Purchasable outfits are never included.</p>
        <div className={styles.start}><span className={styles.muted}>{eligible.length} operators</span><button type="button" className="primary" disabled={!eligible.length} onClick={startRound}>Start guessing</button></div>
      </section> : artwork && <section className={`op-section ${styles.round}`} ref={roundRef} tabIndex={-1} aria-label="Palette challenge">
        <div className={styles.roundTop}><h2>{playing ? 'Who is this operator?' : progress.status === 'won' ? 'Operator identified' : 'The answer'}</h2><span>{modeLabel} · Round {roundNumber}</span></div>
        <figure className={styles.paletteClues}>
          <div className={styles.palette} role="img" aria-label={`Five-color palette: ${artwork.colors.map((color, i) => `${COLOR_LABELS[i]}: ${color}`).join('; ')}`}>
            {artwork.colors.map((color, i) => <span key={i} className={styles.swatch} aria-hidden="true" style={{ '--swatch-color': color } as CSSProperties} />)}
          </div>
          <figcaption className={styles.paletteLabels} aria-hidden="true">{COLOR_LABELS.map((label) => <span key={label}>{label}</span>)}</figcaption>
        </figure>
        {(playing || hintsUsed > 0) && <div className={styles.paletteHints}>
          {playing && <div className={styles.hintControls}>
            <button type="button" disabled={hintsUsed >= 2} aria-describedby="palette-hint-help" onClick={() => setHintsUsed((current) => Math.min(2, current + 1))}>{hintsUsed === 0 ? 'Hint 1: rarity' : hintsUsed === 1 ? 'Hint 2: class' : 'Both hints revealed'}</button>
            <p id="palette-hint-help" className={styles.muted}>Optional. Hints don’t use guesses.</p>
          </div>}
          <div aria-live="polite" aria-atomic="true">
            {hintsUsed > 0 && <dl className={styles.revealedHints} aria-label="Revealed hints">
              <div><dt>Rarity</dt><dd>{target.rarity ? <Rarity n={rarityLevel(target.rarity)} format="stars" /> : 'Unknown'}</dd></div>
              {hintsUsed > 1 && <div><dt>Class</dt><dd>{target.class || 'Unknown'}</dd></div>}
            </dl>}
          </div>
        </div>}
        {playing ? <>
          <OperatorAnswer key={roundNumber} operators={eligible} onGuess={guess} />
          <RoundFeedback progress={progress} notice={notice} />
          <div className={styles.actions}><button type="button" className="ghost" onClick={() => { setProgress({ ...progress, status: 'revealed' }); setNotice('Answer revealed.'); }}>Reveal answer</button><button type="button" className="ghost" onClick={changeMode}>Change mode</button></div>
        </> : <>
          <div className={styles.reveal}>
            <Image className={styles.artwork} src={encodeURI(artwork.image)} alt={`${target.name} — ${modeLabel}`} width={500} height={500} sizes="(max-width: 600px) 90vw, 440px" />
            <div className={styles.revealText}><h2>{target.name}</h2><p className={styles.muted}>{progress.status === 'won' ? `Found in ${progress.wrong.length + 1} ${progress.wrong.length ? 'guesses' : 'guess'}.` : progress.status === 'lost' ? 'No guesses left. Try another palette.' : 'Compare the colors with the original artwork.'} {hintsUsed ? `${hintsUsed} ${hintsUsed === 1 ? 'hint' : 'hints'} used.` : 'No hints used.'}</p><Link href={`/operators/${encodeURIComponent(target.name)}`} prefetch={false} className="btn">View operator</Link></div>
          </div>
          <div className={styles.actions}><button type="button" className="primary" onClick={startRound}>Next palette</button><button type="button" className="ghost" onClick={changeMode}>Change mode</button></div>
        </>}
      </section>}
    </main>
  </>;
}
export const getStaticProps: GetStaticProps<Props> = withContentPage<Props>("/games/color-palette", async () => {
  let overrides: CommunityPaletteOverrides = {};
  try {
    const response = await fetch(
      pinAssetUrl('https://raw.githubusercontent.com/arkpedia/arkpedia-color-palette/main/palettes/community-overrides.json'),
      { signal: AbortSignal.timeout(5000) },
    );
    if (response.ok) {
      const payload = await response.json() as { version?: number; overrides?: CommunityPaletteOverrides };
      if (payload.version === 1 && payload.overrides && typeof payload.overrides === 'object') overrides = payload.overrides;
    }
  } catch {
    // The generated catalog remains a complete offline fallback if GitHub is
    // temporarily unavailable while Arkpedia is building.
  }
  return { props: { operators: applyCommunityPaletteOverrides(getPaletteCatalogue(), overrides) } };
});
