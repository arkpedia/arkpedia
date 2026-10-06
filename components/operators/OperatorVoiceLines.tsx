import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useContentUrl } from '@/lib/content/context';
import SearchInput from '../ui/SearchInput';
import SegmentedControl from '../ui/SegmentedControl';
import StyledSelect from '../ui/StyledSelect';
import { renderGameText } from '../ui/HighlightedText';
// Types only: the module's value import is the whole voice table, which stays on the server.
import type { OperatorVoiceData, OperatorVoiceLine, OperatorVoicePack, OperatorVoiceSet } from '@/lib/operators/operatorVoices';
import { clipUrl, hasRecording } from '@/lib/operators/voiceRecording.mjs';
import styles from './OperatorVoiceLines.module.css';

function formatTime(value: number) {
  if (!Number.isFinite(value)) return '0:00';
  const minutes = Math.floor(value / 60);
  const seconds = Math.floor(value % 60).toString().padStart(2, '0');
  return `${minutes}:${seconds}`;
}

function PlayIcon({ paused }: { paused: boolean }) {
  return paused ? (
    <svg aria-hidden="true" viewBox="0 0 16 16"><path d="m5 3 8 5-8 5V3Z" /></svg>
  ) : (
    <svg aria-hidden="true" viewBox="0 0 16 16"><path d="M4 3h3v10H4zM9 3h3v10H9z" /></svg>
  );
}

function VolumeIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16">
      <path d="M2 6h3l3-3v10l-3-3H2V6Zm8.3-.8a4 4 0 0 1 0 5.6M12.2 3a7 7 0 0 1 0 10" />
    </svg>
  );
}

function audioUrl(template: string | null, line: OperatorVoiceLine) {
  return clipUrl(template, line.id);
}

const PACK_CODES: Record<string, string> = {
  en: 'EN', jp: 'JP', cn: 'CN', kr: 'KR', spa: 'ES', ita: 'IT', ger: 'DE',
  rus: 'RU', fre: 'FR', cn_topolect: 'ZH', linkage: 'CO',
};

function packCode(id: string) {
  return PACK_CODES[id] ?? PACK_CODES[id.replace(/^old_/, '')] ?? id.replace(/^old_/, '').slice(0, 2).toUpperCase();
}

function packOptionLabel(pack: OperatorVoicePack) {
  return pack.id === 'linkage' ? ({ Japanese: 'JP', English: 'EN', Mandarin: 'CN', Korean: 'KR' }[pack.label] ?? 'CO') : packCode(pack.id);
}

function preferredPackOf(voice: OperatorVoiceSet) {
  return voice.packs.find(pack => pack.id === 'en' && pack.status === 'current')
    ?? voice.packs.find(pack => pack.id === 'jp' && pack.status === 'current')
    ?? voice.packs.find(pack => pack.id === 'cn' && pack.status === 'current')
    ?? voice.packs[0];
}

/* A menu value for an outfit's pack: the set's word key and the pack id. An operator's own
   packs keep their bare id. Word keys are game ids and never hold the separator. */
const SET_SEPARATOR = '::';

const useClientLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

function visibleLines(lines: OperatorVoiceLine[], category: string, query: string) {
  const needle = query.trim().toLocaleLowerCase();
  return lines.filter(line => {
    if (category !== 'all' && line.category !== category) return false;
    return !needle || `${line.title} ${line.text ?? ''}`.toLocaleLowerCase().includes(needle);
  });
}

/** What scrolls the line list: the detail panel on a desktop, the document on a phone. */
function scrollerOf(element: HTMLElement): HTMLElement {
  for (let el = element.parentElement; el && el !== document.body && el !== document.documentElement; el = el.parentElement) {
    if (/(auto|scroll)/.test(getComputedStyle(el).overflowY) && el.scrollHeight > el.clientHeight + 1) return el;
  }
  return (document.scrollingElement as HTMLElement | null) ?? document.documentElement;
}

/** The top of the scroller's visible area, in viewport coordinates. */
function viewTopOf(scroller: HTMLElement) {
  return scroller === document.scrollingElement ? 0 : scroller.getBoundingClientRect().top + scroller.clientTop;
}

/**
 * Where the reader is in the line list, taken in the menu's handler before a voice-set
 * switch replaces the lines: what to keep on screen and how far down the view it sits.
 * `row`: a line on screen that the next set has too (the selected one if it is on screen).
 * `start`: lines on screen, none of them in the next set (the operator's own Unused rows,
 * say), so the next set's list starts where the reader's eyes were, under the player.
 * `end`: the list has scrolled past (the reader is in Guides, below it), so what follows
 * the list stays put and the list shrinks above, out of sight.
 * None of them: the list is still below the view, and nothing on screen changes.
 */
type HeldPlace = {
  scroller: HTMLElement;
  scrollTop: number;
  row?: { id: string; offset: number };
  start?: number;
  end?: number;
};

export default function OperatorVoiceLines({ data }: { data: OperatorVoiceData }) {
  const contentUrl = useContentUrl();
  const preferredPack = preferredPackOf(data);
  const skinVoices = data.skinVoices ?? [];
  // null: the operator's own voice. Otherwise the outfit voice set picked from the menu.
  const [setId, setSetId] = useState<string | null>(null);
  const [packId, setPackId] = useState(preferredPack?.id ?? '');
  const [category, setCategory] = useState('all');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState(data.lines[0]?.id ?? '');
  /* A voice-set switch replaces every line's text: the sets differ in length (Civilight
     Eterna's own voice has 81 rows, Condolence 38) and in text (a Chinese-text set is far
     shorter), so the lines the reader was reading would move off screen, and a shorter list
     would shorten the page under them. The handler notes the row on screen (holdPlace);
     before paint the list is scrolled to put that row back where it was, and only what that
     position still lacks is reserved below the list, fresh, never summed. The reserve melts
     as the reader scrolls back up, the way useSwitchHold's does, and is let go when they
     narrow the list themselves (search, category), which shortens it as it always has.
     A tallest-height floor held up to 4000px of nothing under a short set. */
  const listRef = useRef<HTMLDivElement>(null);
  const reserveRef = useRef<HTMLDivElement>(null);
  const reserveState = useRef<{ px: number; scroller: HTMLElement | null }>({ px: 0, scroller: null });
  const heldPlace = useRef<HeldPlace | null>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [volumeLoaded, setVolumeLoaded] = useState(false);
  const [audioError, setAudioError] = useState('');
  const audioRef = useRef<HTMLAudioElement>(null);
  /* Which play request is the live one. A request the reader has since replaced -- another
     line, another pack or voice set, which pause and reload the element -- rejects its
     play() with an AbortError, and that is no failure of the clip now selected. */
  const playRequestRef = useRef(0);
  const playerRef = useRef<HTMLDivElement>(null);
  const playerAnchorRef = useRef<HTMLDivElement>(null);
  const [playerStuck, setPlayerStuck] = useState(false);

  useEffect(() => {
    const stored = window.localStorage.getItem('arkpedia.voiceVolume');
    const saved = stored === null ? NaN : Number(stored);
    if (Number.isFinite(saved) && saved >= 0 && saved <= 1) setVolume(saved);
    setVolumeLoaded(true);
  }, []);

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume;
    if (volumeLoaded) window.localStorage.setItem('arkpedia.voiceVolume', String(volume));
  }, [volume, volumeLoaded]);

  useEffect(() => {
    let frame = 0;
    const measure = () => {
      frame = 0;
      const player = playerRef.current;
      const anchor = playerAnchorRef.current;
      if (player && anchor) {
        setPlayerStuck(anchor.getBoundingClientRect().top < player.getBoundingClientRect().top - 0.5);
      }
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(measure); };
    // Desktop scrolls the detail panel; mobile scrolls the document.
    document.addEventListener('scroll', schedule, true);
    window.addEventListener('resize', schedule);
    const observer = new ResizeObserver(schedule);
    if (playerRef.current) observer.observe(playerRef.current);
    schedule();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      document.removeEventListener('scroll', schedule, true);
      window.removeEventListener('resize', schedule);
    };
  }, []);

  const activeSet = skinVoices.find(set => set.id === setId) ?? null;
  const voice: OperatorVoiceSet = activeSet ?? data;
  const pack = voice.packs.find(item => item.id === packId) ?? preferredPackOf(voice);
  const selected = voice.lines.find(line => line.id === selectedId) ?? voice.lines[0];
  const selectedHasRecording = hasRecording(selected, pack);
  const hasUnused = voice.lines.some(line => line.status === 'unused');
  const categories = [
    { value: 'all', label: 'All' },
    { value: 'profile', label: 'Profile' },
    { value: 'combat', label: 'Combat' },
    { value: 'special', label: 'Special' },
    ...(hasUnused ? [{ value: 'unused', label: 'Unused' }] : []),
  ];
  const filtered = useMemo(() => visibleLines(voice.lines, category, query), [category, voice.lines, query]);

  function setReserve(px: number, scroller: HTMLElement | null) {
    reserveState.current = { px, scroller };
    if (reserveRef.current) reserveRef.current.style.height = px ? `${px}px` : '';
  }

  useEffect(() => {
    setSetId(null);
    setPackId(preferredPack?.id ?? '');
    setCategory('all');
    setQuery('');
    setSelectedId(data.lines[0]?.id ?? '');
    heldPlace.current = null;
    setReserve(0, null);
  }, [data, preferredPack?.id]);

  /* Before paint, after a voice-set switch: the reader's row back where it was on screen,
     with only what that position lacks reserved below the list. Every position is read as
     an offset into the scroller's content (a box's top less the view's, plus the scroll),
     which is the same whether or not the browser has clamped the scroll yet. */
  useClientLayoutEffect(() => {
    const held = heldPlace.current;
    heldPlace.current = null;
    const list = listRef.current;
    if (!held || !list) return;
    const { scroller } = held;
    const contentTop = (box: DOMRect) => box.top - viewTopOf(scroller) + scroller.scrollTop;
    const rowOf = (id: string) => list.querySelector<HTMLElement>(`li[data-line-id="${CSS.escape(id)}"]`);
    const targetNow = () => {
      if (held.row) {
        const row = rowOf(held.row.id);
        if (row) return contentTop(row.getBoundingClientRect()) - held.row.offset;
      }
      if (held.start !== undefined) return contentTop(list.getBoundingClientRect()) - held.start;
      if (held.end !== undefined) {
        // The list's own end, without the reserve below it: what follows it moves up with it.
        setReserve(0, null);
        return list.getBoundingClientRect().bottom - viewTopOf(scroller) + scroller.scrollTop - held.end;
      }
      return held.scrollTop;
    };
    let placedAt = -1;
    const place = () => {
      const target = Math.max(0, Math.round(targetNow()));
      const short = target + scroller.clientHeight - (scroller.scrollHeight - reserveState.current.px);
      // Under a pixel is rounding, not a shortfall.
      setReserve(short > 1 ? Math.ceil(short) : 0, scroller);
      if (Math.abs(scroller.scrollTop - target) >= 1) scroller.scrollTo({ top: target, behavior: 'instant' as ScrollBehavior });
      placedAt = scroller.scrollTop;
    };
    place();
    // Again on the next frame, by the row rather than the number, for a clamp that lands late
    // -- unless the reader has scrolled since, which is theirs to keep.
    const frame = requestAnimationFrame(() => {
      const clamped = scroller.scrollHeight - scroller.clientHeight < placedAt - 0.5;
      if (Math.abs(scroller.scrollTop - placedAt) < 1 || clamped) place();
    });
    return () => cancelAnimationFrame(frame);
  }, [setId]);

  /* The reserve melts as the reader scrolls back up: never more than their position needs. */
  useEffect(() => {
    const release = () => {
      const { px, scroller } = reserveState.current;
      if (!px || !scroller) return;
      const need = Math.max(0, Math.ceil(scroller.scrollTop + scroller.clientHeight - (scroller.scrollHeight - px)));
      if (need < px) setReserve(need, need ? scroller : null);
    };
    document.addEventListener('scroll', release, true);
    window.addEventListener('resize', release);
    return () => {
      document.removeEventListener('scroll', release, true);
      window.removeEventListener('resize', release);
    };
  }, []);

  useEffect(() => {
    playRequestRef.current++;
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
    }
    setPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    setAudioError('');
  }, [packId, setId]);

  /** The reader's place in the list, before a switch to `next` (HeldPlace). */
  function holdPlace(next: OperatorVoiceSet, nextCategory: string): HeldPlace | null {
    const list = listRef.current;
    if (!list) return null;
    const scroller = scrollerOf(list);
    const viewTop = viewTopOf(scroller);
    const viewBottom = viewTop + scroller.clientHeight;
    // The rows the reader can see: under the player, which sticks over the list.
    const seenFrom = Math.max(viewTop, playerRef.current?.getBoundingClientRect().bottom ?? viewTop);
    const kept = new Set(visibleLines(next.lines, nextCategory, query).map(line => line.id));
    const onScreen = [...list.querySelectorAll<HTMLElement>('li[data-line-id]')].filter(row => {
      const box = row.getBoundingClientRect();
      return box.bottom > seenFrom + 1 && box.top < viewBottom - 1;
    });
    const row = onScreen.find(item => item.dataset.lineId === selected?.id && kept.has(item.dataset.lineId))
      ?? onScreen.find(item => kept.has(item.dataset.lineId ?? ''));
    const place: HeldPlace = { scroller, scrollTop: scroller.scrollTop };
    const box = list.getBoundingClientRect();
    if (row) place.row = { id: row.dataset.lineId!, offset: row.getBoundingClientRect().top - viewTop };
    else if (onScreen.length) place.start = Math.max(box.top, seenFrom) - viewTop;
    // Scrolled past: the edge where what follows the list begins.
    else if (box.bottom <= seenFrom + 1) place.end = box.bottom - viewTop;
    return place;
  }

  /** A menu pick: one of the operator's packs, or an outfit set's. */
  function chooseVoice(value: string) {
    const at = value.indexOf(SET_SEPARATOR);
    const nextSetId = at < 0 ? null : value.slice(0, at);
    const nextPackId = at < 0 ? value : value.slice(at + SET_SEPARATOR.length);
    if (nextSetId !== setId) {
      const next = skinVoices.find(set => set.id === nextSetId) ?? data;
      const nextCategory = category === 'unused' && !next.lines.some(line => line.status === 'unused') ? 'all' : category;
      heldPlace.current = holdPlace(next, nextCategory);
      // The same line in the other voice, where it has one.
      if (!next.lines.some(line => line.id === selected?.id)) setSelectedId(next.lines[0]?.id ?? '');
      if (nextCategory !== category) setCategory(nextCategory);
      setSetId(nextSetId);
    }
    setPackId(nextPackId);
  }

  function narrowCategory(value: string) {
    setReserve(0, null);
    setCategory(value);
  }

  function search(value: string) {
    setReserve(0, null);
    setQuery(value);
  }

  function stopCurrent() {
    const audio = audioRef.current;
    if (!audio) return;
    audio.pause();
    setPlaying(false);
  }

  async function playLine(line: OperatorVoiceLine) {
    const audio = audioRef.current;
    if (!audio) return;
    if (selected?.id === line.id && playing) {
      stopCurrent();
      return;
    }
    const source = hasRecording(line, pack) ? audioUrl(pack?.audioTemplate ?? null, line) : null;
    const request = ++playRequestRef.current;
    setSelectedId(line.id);
    setAudioError('');
    setCurrentTime(0);
    setDuration(0);
    if (!source) {
      setPlaying(false);
      setAudioError('Audio is not available for this recording.');
      return;
    }
    audio.pause();
    audio.src = contentUrl(source);
    audio.load();
    try {
      await audio.play();
      if (request !== playRequestRef.current) return;
      setPlaying(true);
    } catch {
      // Replaced while it loaded: the newer request (or the reset) owns the player now.
      if (request !== playRequestRef.current) return;
      setPlaying(false);
      setAudioError('Audio could not be loaded for this recording.');
    }
  }

  async function toggleSelected() {
    if (!selected) return;
    if (playing) {
      stopCurrent();
      return;
    }
    const audio = audioRef.current;
    if (audio?.src && audio.currentTime > 0) {
      const request = playRequestRef.current;
      try {
        await audio.play();
        if (request === playRequestRef.current) setPlaying(true);
        return;
      } catch {
        // Replaced meanwhile (another pack or voice set): play nothing in its place.
        if (request !== playRequestRef.current) return;
        // Recreate the source below if the browser discarded it.
      }
    }
    await playLine(selected);
  }

  function seek(value: number) {
    const audio = audioRef.current;
    if (!audio || !Number.isFinite(audio.duration)) return;
    audio.currentTime = value;
    setCurrentTime(value);
  }

  const playerMessage = selected && !selectedHasRecording ? `No ${pack?.label ?? 'selected'} recording for this line.` : audioError;
  const packOptions = [
    ...data.packs.map(item => ({
      value: item.id,
      label: packOptionLabel(item),
      group: item.status === 'legacy' ? 'Previous recordings' : 'Current recordings',
    })),
    // One group per outfit voice set, after the operator's own, headed by its outfits.
    ...skinVoices.flatMap(set => set.packs.map(item => ({
      value: `${set.id}${SET_SEPARATOR}${item.id}`,
      label: packOptionLabel(item),
      group: set.label,
    }))),
  ];
  const packValue = activeSet && pack ? `${activeSet.id}${SET_SEPARATOR}${pack.id}` : pack?.id ?? '';

  return (
    <section className={styles.root} aria-labelledby="voice-lines-heading">
      <div className={styles.heading}>
        <h2 id="voice-lines-heading">Voice lines</h2>
        {voice.textLocale !== 'en' && <span className={styles.localeBadge}>Chinese game text</span>}
      </div>

      <div ref={playerAnchorRef} className={styles.playerAnchor} aria-hidden="true" />
      <div ref={playerRef} className={styles.player} data-stuck={playerStuck || undefined} aria-label="Voice line player">
        <div className={styles.packRow}>
          <StyledSelect label="Voice language" align="end" value={packValue} className={styles.packSelect}
            options={packOptions}
            renderValue={option => activeSet
              ? <>{option.label}<span className="visually-hidden">, {activeSet.label} outfit voice</span></>
              : option.label}
            onChange={chooseVoice} />
          <div className={styles.actor}>
            <span>{pack?.status === 'legacy' ? 'Previous voice actor' : 'Voice actor'}</span>
            <strong title={pack?.actors.join(', ') || 'Unknown'}>{pack?.actors.join(', ') || 'Unknown'}</strong>
          </div>
        </div>
        <button type="button" className={styles.mainPlay} onClick={() => void toggleSelected()}
          aria-label={`${playing ? 'Pause' : 'Play'} ${selected?.title ?? 'voice line'}`} disabled={!selectedHasRecording}>
          <PlayIcon paused={!playing} />
        </button>
        <div className={styles.nowPlaying}>
          <strong>{selected?.title ?? 'Select a voice line'}</strong>
          <span className={styles.playerStatus} data-error={!!playerMessage || undefined} aria-live="polite" title={playerMessage || undefined}>
            {playerMessage || (pack && activeSet ? `${pack.label} · ${activeSet.label}` : pack?.label) || 'No recording selected'}
          </span>
        </div>
        <label className={styles.volume} title={`Volume ${Math.round(volume * 100)}%`}>
          <span className="visually-hidden">Volume</span>
          <VolumeIcon />
          <input type="range" min="0" max="1" step="0.05" value={volume}
            onChange={event => setVolume(Number(event.target.value))}
            aria-label="Voice volume" aria-valuetext={`${Math.round(volume * 100)}%`} />
        </label>
        <input className={styles.seek} type="range" min="0" max={duration || 0} step="0.01"
          value={Math.min(currentTime, duration || 0)} onChange={event => seek(Number(event.target.value))}
          aria-label="Audio position" disabled={!duration} />
        <span className={styles.time}>{formatTime(currentTime)} / {formatTime(duration)}</span>
        <audio ref={audioRef} preload="none" onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)}
          onTimeUpdate={event => setCurrentTime(event.currentTarget.currentTime)}
          onLoadedMetadata={event => setDuration(event.currentTarget.duration)}
          onEnded={() => setPlaying(false)}
          onError={event => {
            // A source the reset took away (another pack or voice set) is not a failed clip.
            if (!event.currentTarget.getAttribute('src')) return;
            setPlaying(false);
            setAudioError('Audio could not be loaded for this recording.');
          }} />
      </div>

      <div className={styles.filters}>
        <SearchInput className={styles.search} label="Search voice lines" value={query} onChange={search} placeholder="Search voice lines" />
        <SegmentedControl className={styles.categoryTabs} label="Voice line category" value={category} onChange={narrowCategory}
          options={categories.map(item => ({ value: item.value, label: item.label }))} />
      </div>

      <span className="visually-hidden" aria-live="polite">{filtered.length} {filtered.length === 1 ? 'line' : 'lines'} shown</span>
      <div ref={listRef}>
        <ol className={styles.lines}>
          {filtered.map(line => {
            const isSelected = line.id === selected?.id;
            const canPlay = hasRecording(line, pack);
            return (
              <li key={line.id} className={styles.line} data-line-id={line.id} data-selected={isSelected || undefined}>
                <button type="button" className={styles.linePlay} onClick={() => void playLine(line)}
                  aria-label={canPlay ? `${isSelected && playing ? 'Pause' : 'Play'} ${line.title}` : `No ${pack?.label ?? 'selected'} recording for ${line.title}`}
                  title={canPlay ? undefined : `No ${pack?.label ?? 'selected'} recording`}
                  disabled={!canPlay}>
                  <PlayIcon paused={!(isSelected && playing)} />
                </button>
                <div className={styles.lineCopy}>
                  <div className={styles.lineTitle}>
                    <strong>{line.title}</strong>
                    {line.status === 'unused' && <span className={styles.unused}>Unused</span>}
                    {line.unlock && <span className={styles.unlock}>{line.unlock}</span>}
                  </div>
                  <p lang={voice.textLocale}>{line.text ? renderGameText(line.text) : 'Transcript not present in current game data.'}</p>
                </div>
              </li>
            );
          })}
        </ol>
        {filtered.length === 0 && <p className={styles.empty}>No voice lines match.</p>}
        {/* What a voice-set switch reserves for the reader's position (holdPlace); its
            height is set directly, and is nothing at all most of the time. */}
        <div ref={reserveRef} aria-hidden="true" />
      </div>
    </section>
  );
}
