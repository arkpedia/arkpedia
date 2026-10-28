import { formatSeconds } from '@/lib/ui/formatSeconds';
import { useMusicPlayback } from '@/lib/music/musicPlayerContext';

/** Keys that move a range input; a Tab through it must not re-seek (an audible stutter). */
const SEEK_KEYS = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'];

/**
 * The seek bar with its clock, in the corner player and the transport bar. The only part of
 * either that follows the song's clock (lib/music/playbackPosition.ts): it subscribes here, so
 * the player around it renders only when the song or the controls change.
 */
export default function SeekBar({ className }: { className: string }) {
  const { currentTime, duration, handleSeekChange, handleSeekCommit, setSeeking } = useMusicPlayback();
  return (
    <div className={className}>
      <span className="music-time">{formatSeconds(currentTime)}</span>
      <input type="range" min={0} max={duration || 0} step={1} value={currentTime}
        onChange={event => handleSeekChange(Number(event.target.value))}
        onMouseDown={() => setSeeking(true)} onTouchStart={() => setSeeking(true)}
        onMouseUp={event => handleSeekCommit(Number(event.currentTarget.value))}
        onTouchEnd={event => handleSeekCommit(Number(event.currentTarget.value))}
        // Keyboard seeking: the arrow keys fire onChange (which only moves the displayed time,
        // handleSeekChange) and no mouse or touch event, so the player itself seeks on key-up.
        onKeyUp={event => { if (SEEK_KEYS.includes(event.key)) handleSeekCommit(Number(event.currentTarget.value)); }}
        className="music-seek" aria-label="Seek" aria-valuetext={`${formatSeconds(currentTime)} of ${formatSeconds(duration)}`} />
      <span className="music-time">{formatSeconds(duration)}</span>
    </div>
  );
}
