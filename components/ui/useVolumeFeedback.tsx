import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import VolumeIcon from './VolumeIcon';

/** Shared music-style readout, visible while dragging and briefly after a change. */
export default function useVolumeFeedback(volume: number) {
  const [visible, setVisible] = useState(false);
  const dragging = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearTimer = () => { if (timer.current) clearTimeout(timer.current); };
  const show = () => {
    clearTimer(); setVisible(true);
    if (!dragging.current) timer.current = setTimeout(() => setVisible(false), 800);
  };
  const release = () => { dragging.current = false; show(); };
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const events = {
    onPointerDown: () => { dragging.current = true; show(); },
    onPointerUp: release, onPointerCancel: release, onLostPointerCapture: release,
    onBlur: () => { clearTimer(); dragging.current = false; setVisible(false); },
  };
  const output = visible ? createPortal(<output className="volume-feedback" aria-hidden="true">
    <VolumeIcon muted={volume === 0} size={26} />{volume}%
  </output>, document.body) : null;
  return { show, events, output };
}
