import { useEffect, useId, useRef, useState } from 'react';
import XButton from '@/components/ui/XButton';
import { useMusicPlayer } from '@/lib/music/musicPlayerContext';

/** What Data saver changes, in the words the ⓘ shows. */
export const DATA_SAVER_ABOUT = 'Songs play from the official Arknights music player, which allows background play, but the files are large. Data saver plays songs from YouTube instead, but background play becomes unavailable.';

/**
 * The player's Data saver setting (lib/music/musicPlayerContext.tsx, setDataSaver): a checkbox,
 * and an ⓘ that opens a short note on what it changes. The note opens in place, under the row,
 * inside whatever holds the setting (the player's ⋯ menu): a panel of its own would take the
 * focus out of that menu and close it. Escape, a press outside the note and its × close it;
 * Escape and × give focus back to the ⓘ, and Escape goes no further (the menu stays open).
 */
export default function DataSaverSetting() {
  const { dataSaver, setDataSaver } = useMusicPlayer();
  const [open, setOpen] = useState(false);
  const id = useId();
  const infoRef = useRef<HTMLButtonElement>(null);
  const noteRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  function dismiss() {
    setOpen(false);
    infoRef.current?.focus({ preventScroll: true });
  }

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus({ preventScroll: true });
    const outside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!noteRef.current?.contains(target) && !infoRef.current?.contains(target)) setOpen(false);
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);

  return (
    <div className="music-data-saver" onKeyDown={event => {
      if (!open || event.key !== 'Escape') return;
      // The note only: the menu it sits in stays open.
      event.stopPropagation();
      event.nativeEvent.stopImmediatePropagation();
      dismiss();
    }}>
      <div className="music-data-saver-row">
        <label className="check"><input type="checkbox" checked={dataSaver} onChange={event => setDataSaver(event.target.checked)} />Data saver</label>
        <button ref={infoRef} type="button" className="btn-bare music-data-saver-info-btn" aria-label="About data saver"
          aria-expanded={open} aria-controls={open ? id : undefined} onClick={() => setOpen(value => !value)}>
          <svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true" focusable="false">
            <circle cx="10" cy="10" r="7.2" />
            <path d="M10 9v4.6" />
            <circle cx="10" cy="6.4" r="0.9" fill="currentColor" stroke="none" />
          </svg>
        </button>
      </div>
      {open && (
        <div id={id} ref={noteRef} className="music-data-saver-note" role="dialog" aria-label="About data saver">
          <p>{DATA_SAVER_ABOUT}</p>
          <XButton ref={closeRef} dense label="Close about data saver" onClick={dismiss} />
        </div>
      )}
    </div>
  );
}
