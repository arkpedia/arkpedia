import useVolumeFeedback from '@/components/ui/useVolumeFeedback';
import { withContentPage } from '@/lib/content/server';
import PageMeta from '@/components/layout/PageMeta';
import GameLinks, { GamesEyebrow } from '@/components/minigames/GameLinks';
import PageHeader from '@/components/ui/PageHeader';
import SearchInput from '@/components/ui/SearchInput';
import SegmentedControl from '@/components/ui/SegmentedControl';
import type { GetStaticProps } from 'next';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { getSongChoices } from '@/lib/music-guesser/catalogue';
import { buildAnswerIndex, CLIP_SECONDS, clipStage, judgeAnswer, makeAttempt, normalizeTitle, searchAnswers, selectClip } from '@/lib/music-guesser/game';
import type { Round, SongChoice } from '@/lib/music-guesser/game';
import { MusicSetup } from '@/components/music-guesser/MusicSetup';
import { getMusicSelectionCatalogue } from '@/lib/music-guesser/selectionCatalogue';
import { selectMusic } from '@/lib/music-guesser/selection';
import type { MusicGroup } from '@/lib/music-guesser/selection';
import { useMusicSettings } from '@/lib/music-guesser/useMusicSettings';
import { ANSWER_MODES } from '@/lib/music-guesser/options';
import { useSongClip } from '@/lib/music-guesser/useSongClip';
import { useSongQueue } from '@/lib/music-guesser/useSongQueue';
import { useMusicPlayer } from '@/lib/music/musicPlayerContext';
import { useMediaQuery } from '@/lib/hooks/useMediaQuery';
import { serverDate } from '@/lib/time/servers.mjs';
import styles from '@/styles/games/song-guesser.module.css';

/** `now` is the request's clock (contentPageClock). Which groups count as released on
 * Global follows from it at render; the export used to fix that date once. */
export default function SongGuesser({ songs, groups, now }: { songs: SongChoice[]; groups: MusicGroup[]; now: number }) {
  const asOf = useMemo(() => serverDate(new Date(now)), [now]);
  const router = useRouter();
  const [round, setRound] = useState<Round | null>(null);
  const [roundNumber, setRoundNumber] = useState(0);
  const [randomPoint, setRandomPoint] = useState<number | null>(null);
  const roundRef = useRef<HTMLElement>(null);
  const setupScroll = useRef(0);
  const hasRound = Boolean(round);
  const [input, setInput] = useState('');
  const [notice, setNotice] = useState('');
  const [volume, setVolume] = useState(50);
  const volumeFeedback = useVolumeFeedback(volume);
  const { settings, setSettings, ready } = useMusicSettings(groups);
  const { mode } = settings;
  const inputRef = useRef<HTMLInputElement>(null);
  /* On a phone the field sits under the player and the keyboard covers whatever is
     drawn below it, so the suggestions open upward there. */
  const phone = useMediaQuery('(max-width: 480px)');
  const { pausePlayback, playTrackByVideoId } = useMusicPlayer();
  const stage = clipStage(round);
  const isOver = Boolean(round && round.status !== 'playing');
  const eligible = useMemo(() => ready ? selectMusic(songs, groups, settings, asOf) : [], [songs, groups, settings, asOf, ready]);
  const queue = useSongQueue(eligible, round?.song.id, settings.startPosition);
  const clip = useSongClip(round?.song.id, CLIP_SECONDS[stage], volume, queue.cache, randomPoint, settings.startPosition);
  const isClipActive = clip.state === 'playing' || clip.state === 'finding';
  const answers = useMemo(() => buildAnswerIndex(eligible, mode), [eligible, mode]);
  const suggestions = useMemo(() => searchAnswers(answers, input), [answers, input]);
  const rules = ANSWER_MODES.find((item) => item.id === mode)!;

  useEffect(() => { pausePlayback(); }, [pausePlayback]);

  useEffect(() => {
    if (!roundNumber) return;
    if (hasRound) {
      roundRef.current?.scrollIntoView({ block: 'start', behavior: 'instant' });
      // Announce the new surface without opening a phone's software keyboard.
      roundRef.current?.focus({ preventScroll: true });
      if (window.matchMedia('(min-width: 801px)').matches) inputRef.current?.focus({ preventScroll: true });
    } else {
      window.scrollTo({ top: setupScroll.current, behavior: 'instant' });
    }
  }, [roundNumber, hasRound]);

  function start() {
    clip.stop(); pausePlayback();
    const song = queue.takeNext();
    if (!song) return;
    if (!round) setupScroll.current = window.scrollY;
    setRandomPoint(settings.startPosition === 'beginning' ? null : Math.random());
    setRound({ song, attempts: [], clipIndex: 0, status: 'playing' });
    setRoundNumber((number) => number + 1);
    setInput(''); setNotice('');
  }

  function guess(title: string | null) {
    if (!round || round.status !== 'playing') return;
    if (title !== null && judgeAnswer(answers, round.song, title) === 'ambiguous') {
      setNotice('That describes more than one track. Add the stage, music role, or version (such as day or night). No guess used.');
      inputRef.current?.focus(); return;
    }
    const next = makeAttempt(round, title, answers);
    if (next === round) { setNotice('You already tried that answer. Try another or choose a longer clip.'); return; }
    if (next.status !== 'playing') clip.stop();
    setRound(next); setInput(''); setNotice('');
    if (next.status === 'playing' && window.matchMedia('(min-width: 801px)').matches) inputRef.current?.focus();
  }

  function chooseWindow(index: number) {
    if (!round || index === stage) return;
    clip.stop(); setRound(selectClip(round, index));
    setNotice('');
  }

  function listenToFullSong() {
    if (!round?.song.videoId) return;
    clip.stop();
    playTrackByVideoId(round.song.videoId);
    void router.push('/music');
  }

  return <>
    <PageMeta title="Music Guesser" description="Recognize Arknights music from a short clip. Guess with song titles, artists, characters, events, chapters or stages." path="/games/music-guesser" />
    <PageHeader eyebrow={<GamesEyebrow />} title="Music Guesser" sub="Name the track from a few seconds of it."
      actions={<><GameLinks /><Link className={`ghost btn-sm ${styles.libraryLink}`} href="/music" prefetch={false}>Music library</Link></>} />
    <main className={styles.page} data-setup={!round}>
      <div hidden={Boolean(round)}><MusicSetup songs={songs} groups={groups} settings={settings} setSettings={setSettings} asOf={asOf} count={eligible.length} ready={ready} start={start} /></div>
      {round && <section className={styles.console} ref={roundRef} tabIndex={-1} aria-label="Song challenge">
          <div className={styles.listen}>
            <div className={styles.listenHeading}><span>{isOver ? 'Round complete' : `${CLIP_SECONDS[stage]}s clip`}</span><span>{rules.name} · {settings.startPosition === 'beginning' ? 'Beginning' : settings.startPosition === 'middle' ? 'Middle' : 'Random'}</span></div>
            <button type="button" className={`primary ${styles.play}`} onClick={() => { if (isClipActive) clip.stop(); else { pausePlayback(); void clip.play(); } }} disabled={clip.state === 'loading' || clip.state === 'error'} aria-label={isClipActive ? 'Pause clip' : 'Play clip'}>
              <svg viewBox="0 0 32 32" width="32" height="32" fill="currentColor" aria-hidden="true">{isClipActive ? <path d="M8 7h6v18H8zm10 0h6v18h-6z" /> : <path d="m11 6 16 10-16 10z" />}</svg>
            </button>
            <p className={styles.clipLabel} aria-live="polite">{clip.state === 'loading' ? 'Preparing audio…' : clip.state === 'finding' ? 'Finding the music…' : clip.state === 'playing' ? 'Listening…' : clip.state === 'error' ? 'Audio unavailable' : `Play ${CLIP_SECONDS[stage]}-second clip`}</p>
            <div className={styles.seekControl}>
              <input className={styles.seek} type="range" min="0" max={clip.duration} step="0.01" value={clip.progress * clip.duration} disabled={!clip.canSeek} aria-label="Clip position" aria-valuetext={`${(clip.progress * clip.duration).toFixed(1)} of ${clip.duration.toFixed(1)} seconds`} onChange={(event) => clip.seek(Number(event.target.value))} style={{ '--clip-progress': `${clip.progress * 100}%` } as React.CSSProperties} />
              <div className={styles.seekTimes} aria-hidden="true"><span>{(clip.progress * clip.duration).toFixed(1)}s</span><span>{clip.duration}s</span></div>
            </div>
            <SegmentedControl className={styles.stages} label="Clip length" value={stage} onChange={chooseWindow}
              options={CLIP_SECONDS.map((seconds, index) => ({ value: index, label: `${seconds}s`, ariaLabel: `${seconds}-second clip` }))} />
            {volumeFeedback.output}<label className={styles.volume}>Volume<input type="range" min="0" max="100" value={volume} aria-valuetext={`${volume}%`} {...volumeFeedback.events} onChange={(e) => { setVolume(Number(e.target.value)); volumeFeedback.show(); }} /></label>
            {clip.error && <div className={styles.error} role="alert"><p>{clip.error}</p>{clip.state === 'error' && <div><button type="button" onClick={clip.retry}>Retry audio</button><button type="button" onClick={start}>Try another song</button></div>}</div>}
          </div>

          <div className={styles.answer}>
            <div role="status">
              {isOver && <div className={styles.result} data-won={round.status === 'won'}>
                <p>{round.status === 'won' ? 'You found it!' : 'The answer is'}</p>
                <h2>{round.song.altTitle || round.song.title}</h2>
                {round.song.altTitle && round.song.altTitle !== round.song.title && <p className={styles.originalTitle}>{round.song.title}</p>}
                {round.status === 'won' && <p>Identified in {round.attempts.length} {round.attempts.length === 1 ? 'guess' : 'guesses'}.</p>}
                {round.song.artists?.length ? <p className={styles.connectionResult}>{round.song.artists.join(', ')}</p> : null}
                {!round.song.connections?.length && round.song.releaseNames?.length ? <p className={styles.connectionResult}>{round.song.releaseNames.join(' · ')}</p> : null}
                {round.song.connections?.map((connection, index) => <p className={styles.connectionResult} key={index}>{connection.cc ? `${connection.cc.series.toUpperCase()}${connection.cc.number} · ` : ''}{connection.names[0]} · {connection.role}{connection.variant ? ` (${connection.variant})` : ''}{connection.stages?.length ? ` · ${connection.stages[0]}` : ''}</p>)}
                {round.song.ep && <p className={styles.connectionResult}>{round.song.ep.characters[0]} EP{round.song.ep.variant ? ` ${round.song.ep.variant}` : ''}</p>}
                {round.song.videoId
                  ? <button type="button" className={`ghost ${styles.fullSong}`} onClick={listenToFullSong}>Listen to the full song</button>
                  : <a className={`ghost ${styles.fullSong}`} href={`https://monster-siren.hypergryph.com/music/${round.song.id}`} target="_blank" rel="noreferrer">Listen on Monster Siren Records</a>}
                <button type="button" className={`primary ${styles.action}`} onClick={start}>Next song</button>
              </div>}
            </div>
            {!isOver && <>
              <form onSubmit={(e) => { e.preventDefault(); if (normalizeTitle(input)) guess(input); }}>
                <label htmlFor="song-title">Your guess</label>
                <details className={`${styles.disclosure} ${styles.rules}`}><summary>Accepted answers</summary><p>{rules.help}</p><p>{rules.cc}</p></details>
                <div className={styles.inputRow}>
                  <SearchInput id="song-title" inputRef={inputRef} label="Your guess" value={input}
                    onChange={(value) => { setInput(value); setNotice(''); }} placeholder="Song, artist, character, event…"
                    suggestions={suggestions} getKey={(suggestion) => `${suggestion.kind}:${suggestion.value}`}
                    renderSuggestion={(suggestion) => <span className={styles.suggestion}><strong>{suggestion.label}</strong><span>{suggestion.detail}</span></span>}
                    onPick={(suggestion) => guess(suggestion.value)} suggestLabel="Matching answers" upward={phone} />
                  <button type="submit" className={`primary btn-sm ${styles.action}`} disabled={!normalizeTitle(input)}>Guess</button>
                </div>
                <p className={styles.notice} role="status">{notice || (input && !suggestions.length ? 'No suggestions. You can still submit your answer.' : '')}</p>
              </form>
              <button type="button" className={styles.skip} disabled={stage === CLIP_SECONDS.length - 1} onClick={() => chooseWindow(stage + 1)}>{stage < CLIP_SECONDS.length - 1 ? `More music · ${CLIP_SECONDS[stage + 1]}s` : 'Full 30s clip'}</button>
            </>}
            <div className={styles.history} aria-live="polite">{round.attempts.length > 0 && <><h3>Your guesses</h3><ol>{round.attempts.map((attempt, index) => <li key={index} data-outcome={attempt.correct ? 'correct' : 'incorrect'}><span>{attempt.title}</span><span>{attempt.correct ? 'Correct' : 'Incorrect'} · {attempt.seconds}s</span></li>)}</ol></>}</div>
            <div className={styles.roundActions}>
              {!isOver && <button type="button" className="ghost btn-sm" onClick={() => { clip.stop(); setRound({ ...round, status: 'revealed' }); }}>Give up and reveal answer</button>}
              <button type="button" className="ghost btn-sm" onClick={() => { clip.stop(); setRound(null); setInput(''); setNotice(''); }}>Change selection</button>
            </div>
          </div>
      </section>}
      <p className={styles.footer}>Audio from <a href="https://monster-siren.hypergryph.com/" target="_blank" rel="noreferrer">Monster Siren Records</a>.</p>
    </main>
  </>;
}

export const getStaticProps: GetStaticProps = withContentPage("/games/music-guesser", async () => ({
  props: getMusicSelectionCatalogue(getSongChoices()),
}), { revalidate: 3600 });
