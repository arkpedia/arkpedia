import { useEffect, useMemo, useRef, useState } from 'react';
import { useContentUrl } from '@/lib/content/context';
import StyledSelect from '../ui/StyledSelect';
import { OperatorVoiceData, OperatorVoiceLine } from '@/lib/operators/operatorVoices';
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

function audioUrl(template: string | null, line: OperatorVoiceLine) {
  return template
    ?.replace('{voiceId}', encodeURIComponent(line.id))
    .replace('{voiceIdLower}', encodeURIComponent(line.id.toLowerCase())) ?? null;
}

const PACK_CODES: Record<string, string> = {
  en: 'EN', jp: 'JP', cn: 'CN', kr: 'KR', spa: 'ES', ita: 'IT', ger: 'DE',
  rus: 'RU', fre: 'FR', cn_topolect: 'ZH', linkage: 'CO',
};

function packCode(id: string) {
  return PACK_CODES[id] ?? PACK_CODES[id.replace(/^old_/, '')] ?? id.replace(/^old_/, '').slice(0, 2).toUpperCase();
}

function hasRecording(line: OperatorVoiceLine | undefined, pack: OperatorVoiceData['packs'][number] | undefined) {
  if (!line || !pack || !pack.audioTemplate) return false;
  if (!line.availablePacks) return true;
  if (line.availablePacks.includes(pack.id)) return true;
  return pack.status === 'current'
    && line.availablePacks.includes('custom')
    && !['en', 'jp', 'cn', 'kr'].includes(pack.id);
}

export default function OperatorVoiceLines({ data }: { data: OperatorVoiceData }) {
  const contentUrl = useContentUrl();
  const preferredPack = data.packs.find(pack => pack.id === 'en' && pack.status === 'current')
    ?? data.packs.find(pack => pack.id === 'jp' && pack.status === 'current')
    ?? data.packs.find(pack => pack.id === 'cn' && pack.status === 'current')
    ?? data.packs[0];
  const [packId, setPackId] = useState(preferredPack?.id ?? '');
  const [category, setCategory] = useState('all');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState(data.lines[0]?.id ?? '');
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [audioError, setAudioError] = useState('');
  const audioRef = useRef<HTMLAudioElement>(null);
  const playerRef = useRef<HTMLDivElement>(null);
  const playerAnchorRef = useRef<HTMLDivElement>(null);
  const [playerStuck, setPlayerStuck] = useState(false);

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

  const pack = data.packs.find(item => item.id === packId) ?? preferredPack;
  const selected = data.lines.find(line => line.id === selectedId) ?? data.lines[0];
  const selectedHasRecording = hasRecording(selected, pack);
  const hasUnused = data.lines.some(line => line.status === 'unused');
  const categories = [
    { value: 'all', label: 'All' },
    { value: 'profile', label: 'Profile' },
    { value: 'combat', label: 'Combat' },
    { value: 'special', label: 'Special' },
    ...(hasUnused ? [{ value: 'unused', label: 'Unused' }] : []),
  ];
  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return data.lines.filter(line => {
      if (category !== 'all' && line.category !== category) return false;
      return !needle || `${line.title} ${line.text ?? ''}`.toLocaleLowerCase().includes(needle);
    });
  }, [category, data.lines, query]);

  useEffect(() => {
    setPackId(preferredPack?.id ?? '');
    setCategory('all');
    setQuery('');
    setSelectedId(data.lines[0]?.id ?? '');
  }, [data, preferredPack?.id]);

  useEffect(() => {
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
  }, [packId]);

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
      setPlaying(true);
    } catch {
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
      try {
        await audio.play();
        setPlaying(true);
        return;
      } catch {
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

  return (
    <section className={styles.root} aria-labelledby="voice-lines-heading">
      <div className={styles.heading}>
        <h2 id="voice-lines-heading">Voice lines</h2>
        {data.textLocale !== 'en' && <span className={styles.localeBadge}>Chinese game text</span>}
      </div>

      <div className={styles.packRow}>
        <StyledSelect label="Voice language" value={pack?.id ?? ''} className={styles.packSelect}
          options={data.packs.map(item => ({
            value: item.id,
            label: packCode(item.id),
            group: item.status === 'legacy' ? 'Previous recordings' : 'Current recordings',
          }))}
          onChange={setPackId} />
        <div className={styles.actor}>
          <span>{pack?.status === 'legacy' ? 'Previous voice actor' : 'Voice actor'}</span>
          <strong>{pack?.actors.join(', ') || 'Unknown'}</strong>
        </div>
      </div>

      <div ref={playerAnchorRef} aria-hidden="true" />
      <div ref={playerRef} className={styles.player} data-stuck={playerStuck || undefined} aria-label="Voice line player">
        <button type="button" className={styles.mainPlay} onClick={() => void toggleSelected()}
          aria-label={`${playing ? 'Pause' : 'Play'} ${selected?.title ?? 'voice line'}`} disabled={!selectedHasRecording}>
          <PlayIcon paused={!playing} />
        </button>
        <div className={styles.nowPlaying}>
          <strong>{selected?.title ?? 'Select a voice line'}</strong>
          <span className={styles.playerStatus} data-error={!!playerMessage || undefined} aria-live="polite" title={playerMessage || undefined}>
            {playerMessage || pack?.label || 'No recording selected'}
          </span>
        </div>
        <input className={styles.seek} type="range" min="0" max={duration || 0} step="0.01"
          value={Math.min(currentTime, duration || 0)} onChange={event => seek(Number(event.target.value))}
          aria-label="Audio position" disabled={!duration} />
        <span className={styles.time}>{formatTime(currentTime)} / {formatTime(duration)}</span>
        <audio ref={audioRef} preload="none" onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)}
          onTimeUpdate={event => setCurrentTime(event.currentTarget.currentTime)}
          onLoadedMetadata={event => setDuration(event.currentTarget.duration)}
          onEnded={() => setPlaying(false)}
          onError={() => { setPlaying(false); setAudioError('Audio could not be loaded for this recording.'); }} />
      </div>

      <div className={styles.filters}>
        <label className={styles.search}>
          <span className="visually-hidden">Search voice lines</span>
          <svg aria-hidden="true" viewBox="0 0 16 16"><circle cx="7" cy="7" r="4.5" /><path d="m10.5 10.5 3 3" /></svg>
          <input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search voice lines" />
        </label>
        <div className={styles.categoryTabs} role="group" aria-label="Voice line category">
          {categories.map(item => (
            <button key={item.value} type="button" aria-pressed={category === item.value}
              onClick={() => setCategory(item.value)}>{item.label}</button>
          ))}
        </div>
      </div>

      <span className="visually-hidden" aria-live="polite">{filtered.length} {filtered.length === 1 ? 'line' : 'lines'} shown</span>
      <ol className={styles.lines}>
        {filtered.map(line => {
          const isSelected = line.id === selected?.id;
          const canPlay = hasRecording(line, pack);
          return (
            <li key={line.id} className={styles.line} data-selected={isSelected || undefined}>
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
                <p lang={data.textLocale}>{line.text || 'Transcript not present in current game data.'}</p>
              </div>
            </li>
          );
        })}
      </ol>
      {filtered.length === 0 && <p className={styles.empty}>No voice lines match.</p>}
    </section>
  );
}
