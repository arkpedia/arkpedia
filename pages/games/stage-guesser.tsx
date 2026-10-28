import { useContentUrl } from '@/lib/content/context';
import PageMeta from '@/components/layout/PageMeta';
import { withContentPage } from '@/lib/content/server';
import type { GetStaticProps } from 'next';
import fs from 'fs';
import path from 'path';
import Image from '@/components/content/ContentImage';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import GameLinks, { GamesEyebrow } from '@/components/minigames/GameLinks';
import PageHeader from '@/components/ui/PageHeader';
import SegmentedControl from '@/components/ui/SegmentedControl';
import SearchInput from '@/components/ui/SearchInput';
import StageAnswer from '@/components/minigames/StageAnswer';
import StageLayoutMap from '@/components/minigames/StageLayoutMap';
import StageTileLegend from '@/components/minigames/StageTileLegend';
import { normalizeAnswer, pickNext } from '@/lib/minigames/logic';
import { guessStage, newStageRound, revealStageHint, filterStagePool, StageEntry, StageCatalogue, StageAnswer as StageAnswerEntry, StageGroup, StagePool, StageLayout, StageQuestion, StageSearchMode, STAGE_HINT_AT, STAGE_HINTS, STAGE_MISTAKES } from '@/lib/minigames/stageGuesser';
import common from '@/styles/games/minigames.module.css';
import styles from '@/styles/games/stage-guesser.module.css';
import { fetchAsset } from '@/lib/assets/assetRetry';

interface Props { catalogueUrl: string; groups: StageGroup[]; counts: { all: number; classic: number } }
const COLLECTIONS: { id: StagePool; label: string }[] = [
  { id: 'classic', label: 'Classics' }, { id: 'all', label: 'All' },
  { id: 'custom', label: 'Custom' },
];
const HINT_NAMES = ['In-game image', 'Chapter or event'];

export default function StageGuesser({ catalogueUrl, groups, counts }: Props) {
  const contentUrl = useContentUrl();
  const [searchMode, setSearchMode] = useState<StageSearchMode>('connections');
  const [collection, setCollection] = useState<StagePool>('classic');
  const [questions, setQuestions] = useState<StageEntry[]>([]);
  const [answers, setAnswers] = useState<StageAnswerEntry[]>([]);
  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);
  const [groupSearch, setGroupSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [typing, setTyping] = useState(false);
  const [target, setTarget] = useState<(StageQuestion & StageEntry) | null>(null);
  const loadingRef = useRef(false);
  const [round, setRound] = useState(newStageRound);
  const [roundNumber, setRoundNumber] = useState(0);
  const [recent, setRecent] = useState<string[]>([]);
  const [notice, setNotice] = useState('');
  const [mapFailed, setMapFailed] = useState(false);
  const [selectedTile, setSelectedTile] = useState<number | null>(null);
  const [mapView, setMapView] = useState<'layout' | 'image'>('layout');
  const roundRef = useRef<HTMLElement>(null);
  const eligibleCount = collection === 'custom' ? groups.filter((g) => selectedGroups.includes(g.id)).reduce((n, g) => n + g.count, 0) : counts[collection];
  const visibleGroups = groups.filter((g) => normalizeAnswer(g.label).includes(normalizeAnswer(groupSearch)));
  const bySlug = useMemo(() => new Map(answers.map((answer) => [answer.slug, answer])), [answers]);
  const playing = round.status === 'playing';
  const hintsShown = playing ? round.hints : STAGE_HINTS;

  useEffect(() => {
    if (!roundNumber) return;
    roundRef.current?.focus({ preventScroll: true });
    roundRef.current?.scrollIntoView({ block: 'start' });
  }, [roundNumber]);

  useEffect(() => {
    if (!typing) return;
    if (!window.matchMedia('(max-width: 800px)').matches) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const viewport = window.visualViewport;
    const update = () => {
      roundRef.current?.style.setProperty('--keyboard-height', `${viewport?.height ?? window.innerHeight}px`);
      roundRef.current?.style.setProperty('--keyboard-top', `${viewport?.offsetTop ?? 0}px`);
    };
    update();
    viewport?.addEventListener('resize', update);
    viewport?.addEventListener('scroll', update);
    return () => { document.body.style.overflow = previousOverflow; viewport?.removeEventListener('resize', update); viewport?.removeEventListener('scroll', update); };
  }, [typing]);

  async function startRound() {
    if (loadingRef.current) return;
    loadingRef.current = true; setLoading(true); setLoadError('');
    try {
      let catalogue = questions;
      if (!catalogue.length) {
        const response = await fetchAsset(contentUrl(catalogueUrl));
        if (!response.ok) throw new Error('catalogue');
        const data = await response.json() as StageCatalogue;
        catalogue = data.entries;
        setQuestions(catalogue); setAnswers(data.answers);
      }
      const next = pickNext(filterStagePool(catalogue, collection, selectedGroups), recent, (question) => question.slug);
      if (!next) throw new Error('empty');
      const response = await fetchAsset(contentUrl(next.layoutUrl));
      if (!response.ok) throw new Error('layout');
      const layout = await response.json() as StageLayout;
      if (!layout.rows || !layout.cols || !Array.isArray(layout.tileGrid)) throw new Error('layout');
      setTarget({ ...next, layout }); setRound(newStageRound()); setNotice(''); setMapFailed(false); setMapView('layout'); setSelectedTile(null); setTyping(false);
      setRecent((previous) => [...previous, next.slug].slice(-30));
      setRoundNumber((previous) => previous + 1);
    } catch { setLoadError('The stage could not load. Check your connection and try again.'); }
    finally { setLoading(false); loadingRef.current = false; }
  }
  function guess(slug: string) {
    if (!target) return;
    const equivalent = bySlug.get(slug)?.mapKey === target.mapKey;
    const next = guessStage(round, equivalent ? target.slug : slug, target.slug);
    if (next.status !== 'playing') setTyping(false);
    setRound(next);
    if ((next.hints > round.hints && round.hints === 0) || next.status !== 'playing') setMapView('image');
    setNotice(next === round ? 'You already tried that stage. No guess used.'
      : next.status === 'won' ? equivalent && slug !== target.slug ? 'Accepted: that stage has the same tile layout.' : 'Stage identified!'
      : next.status === 'lost' ? 'No guesses left. Here is the stage.'
      : `${bySlug.get(slug)?.code} is not this stage.${next.hints > round.hints ? next.hints === 1 ? ' In-game image unlocked.' : ' Chapter or event revealed below.' : ''}`);
  }

  return <>
    <PageMeta title="Stage Guesser" description="Recognize Arknights stages from their maps. Play iconic classics, all available maps, or your own chapter and event selection, with image and chapter hints." path="/games/stage-guesser" />
    <PageHeader eyebrow={<GamesEyebrow />} title="Stage Guesser" sub="You have fought here before. Can you name the stage?" actions={<GameLinks />} />
    <main className={common.page}>
      {!target ? <section className={`op-section ${common.panel} ${common.setup}`} aria-labelledby="stage-setup-title">
        <div className={styles.setupGrid}>
          <div className={styles.setupMain}>
            <div className={common.intro}><h2 id="stage-setup-title">Know the battlefield?</h2><p className={common.muted}>Recognize a stage from its tile layout. Start with familiar maps, take on the full catalogue, or choose the chapters and events you know.</p></div>
            <fieldset className={styles.collections} disabled={loading}><legend>Choose your collection</legend>
              <SegmentedControl label="Collection" value={collection} options={COLLECTIONS.map(({ id, label }) => ({ value: id, label }))} onChange={setCollection} />
              <p className={common.muted}>{collection === 'classic' ? `${counts.classic} handpicked story and event stages, from early tutorials to memorable bosses and tough challenges.` : collection === 'custom' ? 'Build your own pool from any combination of sources.' : 'Every eligible map in the database, including story, events, supplies, Annihilation and other modes.'}</p>
            </fieldset>
            {collection === 'custom' && <fieldset className={styles.custom} disabled={loading}><legend>Choose sources</legend>
              <SearchInput id="stage-groups" label="Find chapters or events" value={groupSearch} onChange={setGroupSearch} placeholder="Roaring Flare, Under Tides…" />
              <div className={styles.groupActions}><button type="button" className="ghost" onClick={() => setSelectedGroups((previous) => [...new Set([...previous, ...visibleGroups.map((g) => g.id)])])}>Select {groupSearch ? 'matching' : 'all'}</button><button type="button" className="ghost" onClick={() => setSelectedGroups([])}>Clear selection</button><span>{selectedGroups.length} sources selected</span></div>
              <div className={styles.groupList}>{visibleGroups.map((g) => <label key={g.id} className="check"><input type="checkbox" checked={selectedGroups.includes(g.id)} onChange={(e) => setSelectedGroups((previous) => e.target.checked ? [...previous, g.id] : previous.filter((id) => id !== g.id))} /><span>{g.label}<small>{g.kind.replace(/_/g, ' ')} · {g.count} stages</small></span></label>)}{!visibleGroups.length && <p>No matching chapters or events.</p>}</div>
            </fieldset>}
            <div className={common.start}><span className={common.muted}>{`${eligibleCount} stages selected`}</span><button type="button" className="primary" disabled={!eligibleCount || loading} onClick={startRound}>{loading ? 'Loading map…' : 'Start guessing'}</button></div>
            {loadError && <p role="alert">{loadError}</p>}
          </div>
          <aside className={styles.instructions} aria-labelledby="stage-rules-title">
            <h3 id="stage-rules-title">How to play</h3>
            <p>Start with the layout. After two wrong guesses, see the in-game image. After three, reveal the chapter or event.</p>
            <p>You have five wrong guesses. You can also reveal hints yourself without spending a guess.</p>
            <p>Released Global stages with a usable layout and image. Includes standalone H stages; duplicate difficulty and rerun maps count once. Maps that look identical accept either stage.</p>
          </aside>
        </div>
      </section> : <section className={`${common.round} ${styles.round} ${typing && playing ? styles.typing : ''}`} ref={roundRef} tabIndex={-1} aria-label="Stage challenge">
        {typing && playing && <div className={styles.typingBar}><span>{STAGE_MISTAKES - round.wrong.length} guesses left</span><button type="button" className="ghost btn-sm" onMouseDown={(e) => e.preventDefault()} onClick={() => { document.getElementById('stage-answer')?.blur(); setTyping(false); }}>Done typing</button></div>}
        <div className={common.roundTop}><h2>{playing ? 'Which stage is this?' : round.status === 'won' ? 'Stage identified' : 'The answer'}</h2><span>Round {roundNumber} · {COLLECTIONS.find((entry) => entry.id === collection)?.label}</span></div>
        <div className={styles.layout}>
          <div className={styles.mapColumn}>
            <SegmentedControl className={styles.mapViews} label="Map view" value={mapView === 'image' && !mapFailed ? 'image' : 'layout'}
              options={[{ value: 'layout', label: 'Layout' }, { value: 'image', label: 'In-game image', disabled: mapFailed || hintsShown < 1 }]}
              onChange={setMapView} />
            <figure className={styles.mapFigure}>
              <div className={`${styles.mapFrame} ${mapView === 'layout' || mapFailed ? styles.layoutFrame : ''}`}>
                {mapView === 'image' && hintsShown >= 1 && !mapFailed
                  ? <Image key={target.slug} src={target.image} alt={playing ? 'In-game map to identify' : `${target.code} — ${target.name} map`} fill sizes="(max-width: 800px) 100vw, 650px" onError={() => { setMapFailed(true); setMapView('layout'); }} />
                  : <StageLayoutMap layout={target.layout} selectedTile={selectedTile} onSelect={(index) => setSelectedTile(selectedTile === index ? null : index)} />}
              </div>
              <figcaption>{mapView === 'image' && !mapFailed ? 'In-game image' : 'Arkpedia layout'}{!playing && <> · {target.version}</>}</figcaption>
            </figure>
            {(mapView === 'layout' || mapFailed) && <StageTileLegend key={roundNumber} layout={target.layout} selected={selectedTile} onSelect={setSelectedTile} />}
            {mapFailed && <p className={styles.mapError} role="alert">The in-game image could not load. You can keep guessing from the layout or reveal the next hint.</p>}
            {!playing && <p className={styles.context}>{target.reason}</p>}
          </div>
          <div className={styles.playColumn}>
            {playing ? <>
              <div className={styles.attempts} aria-label={`${STAGE_MISTAKES - round.wrong.length} wrong guesses remaining`}>
                <strong>{STAGE_MISTAKES - round.wrong.length}</strong><span>wrong guesses remaining</span>
              </div>
              <StageAnswer key={roundNumber} stages={answers} onGuess={guess} onTypingChange={setTyping} mode={searchMode} onModeChange={setSearchMode} />
              <p className={styles.notice} role="status">{notice || 'You can guess any Global stage, including stages outside this quiz collection.'}</p>
              {round.wrong.length > 0 && <ul className={common.wrong} aria-label="Incorrect guesses">{round.wrong.map((slug) => <li key={slug}>{bySlug.get(slug)?.code}</li>)}</ul>}
              <div className={styles.hintControl}>
                <button type="button" disabled={round.hints >= STAGE_HINTS} onClick={() => { setRound(revealStageHint(round)); if (round.hints === 0) setMapView('image'); setNotice(`${HINT_NAMES[round.hints]} hint revealed. No guess used.`); }}>{round.hints < STAGE_HINTS ? `Reveal hint: ${HINT_NAMES[round.hints]}` : 'All hints revealed'}</button>
                <small>{round.hints < STAGE_HINTS ? `${HINT_NAMES[round.hints]} unlocks after ${STAGE_HINT_AT[round.hints]} wrong guesses, or reveal it now.` : 'Both hints revealed.'}</small>
              </div>
            </> : <div className={styles.answer} role="status">
              {notice.startsWith('Accepted:') && <p>{notice}</p>}<strong className={styles.code}>{target.code}</strong><h3>{target.name}</h3>
              <p>{round.status === 'won' ? `Found with ${round.wrong.length} wrong ${round.wrong.length === 1 ? 'guess' : 'guesses'} and ${round.hints} ${round.hints === 1 ? 'hint' : 'hints'}.` : round.status === 'lost' ? 'Five wrong guesses. Try another battlefield.' : 'Answer revealed. Try another battlefield.'}</p>
              <Link href={`/stages/browse?s=${encodeURIComponent(target.slug)}`} prefetch={false} className="btn">Explore this stage</Link>
            </div>}
            <div className={styles.hints} aria-label="Stage hints" aria-live="polite">
              {hintsShown >= 2 && <section><h3>Chapter or event</h3><p>{target.source}</p></section>}
            </div>
          </div>
        </div>
        {loadError && <p role="alert">{loadError}</p>}
        <div className={styles.footer}>
          {playing ? <button type="button" className="ghost" onClick={() => { setRound({ ...round, status: 'revealed' }); setMapView('image'); setNotice('Answer revealed.'); }}>Reveal answer</button> : <button type="button" className="primary" disabled={loading} onClick={startRound}>{loading ? 'Loading map…' : 'Next stage'}</button>}
          <button type="button" className="ghost" disabled={loading} onClick={() => { setTarget(null); setTyping(false); setLoadError(''); }}>Change collection</button>
        </div>
      </section>}
    </main>
  </>;
}
export const getStaticProps: GetStaticProps<Props> = withContentPage<Props>("/games/stage-guesser", async () => ({ props: JSON.parse(fs.readFileSync(path.join(process.cwd(), 'public/stage-guesser/manifest.json'), 'utf8')) as Props }));
