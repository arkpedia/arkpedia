import { usePagePlayback } from '@/lib/music/pageAudioPlayback';

const labels = { loading: 'Loading…', playing: 'Playing', paused: 'Paused', blocked: 'Ready to play', error: 'Unavailable' };

/** Page audio is visible here without taking over the personal player's controls or queue. */
export default function BackgroundMusicNowPlaying() {
  const playback = usePagePlayback();
  if (!playback) return null;
  return <div className="music-widget-background" role="group" aria-label="Background music">
    <div className="music-widget-text">
      <span className="music-widget-artist">Background music · {labels[playback.status]}</span>
      <span className="music-widget-title" title={playback.title}>{playback.title}</span>
    </div>
    {playback.needsPlay && <button type="button" className="ghost filter-chip" onClick={playback.play} aria-label="Play background music">Play</button>}
  </div>;
}
