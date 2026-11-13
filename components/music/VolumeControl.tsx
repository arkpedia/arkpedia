import useVolumeFeedback from '@/components/ui/useVolumeFeedback';
import TransportIcon from './TransportIcons';

/** A brief volume HUD stays clear of the player's controls and the reader's finger. */
export default function VolumeControl({ volume, onChange, onToggleMute }: { volume: number; onChange: (volume: number) => void; onToggleMute: () => void }) {
  const { show, events, output } = useVolumeFeedback(volume);
  return <span className="music-volume-control">
    <button type="button" className="btn-bare music-volume-icon" aria-label={volume === 0 ? 'Unmute' : 'Mute'} title={volume === 0 ? 'Unmute' : 'Mute'} aria-pressed={volume === 0} onClick={() => { onToggleMute(); show(); }}><TransportIcon name={volume === 0 ? 'muted' : 'volume'} size={20} /></button>
    <span className="music-volume-slider">
      <input type="range" min={0} max={100} step={1} value={volume} onChange={event => { onChange(Number(event.target.value)); show(); }}
        {...events}
        className="music-volume" aria-label="Volume" aria-valuetext={`${volume}%`} />
    </span>
    {output}
  </span>;
}
