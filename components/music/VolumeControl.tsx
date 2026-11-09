import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import TransportIcon from './TransportIcons';

/** A brief volume HUD stays clear of the player's controls and the reader's finger. */
export default function VolumeControl({ volume, onChange, onToggleMute }: { volume: number; onChange: (volume: number) => void; onToggleMute: () => void }) {
  const [visible, setVisible] = useState(false);
  const dragging = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearTimer = () => { if (timer.current) clearTimeout(timer.current); };
  const show = () => {
    clearTimer();
    setVisible(true);
    if (!dragging.current) timer.current = setTimeout(() => setVisible(false), 800);
  };
  const release = () => { dragging.current = false; show(); };
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  return <span className="music-volume-control">
    <button type="button" className="btn-bare music-volume-icon" aria-label={volume === 0 ? 'Unmute' : 'Mute'} title={volume === 0 ? 'Unmute' : 'Mute'} aria-pressed={volume === 0} onClick={() => { onToggleMute(); show(); }}><TransportIcon name={volume === 0 ? 'muted' : 'volume'} size={20} /></button>
    <span className="music-volume-slider">
      <input type="range" min={0} max={100} step={1} value={volume} onChange={event => { onChange(Number(event.target.value)); show(); }}
        onPointerDown={() => { dragging.current = true; show(); }} onPointerUp={release}
        onPointerCancel={release} onLostPointerCapture={release}
        onBlur={() => { clearTimer(); dragging.current = false; setVisible(false); }}
        className="music-volume" aria-label="Volume" aria-valuetext={`${volume}%`} />
    </span>
    {visible && createPortal(<output className="music-volume-percent" aria-hidden="true"><TransportIcon name={volume === 0 ? 'muted' : 'volume'} size={26} />{volume}%</output>, document.body)}
  </span>;
}
