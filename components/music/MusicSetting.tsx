import { useEffect, useId, useRef, useState } from 'react';
import XButton from '@/components/ui/XButton';
import InfoIcon from '@/components/ui/InfoIcon';

/**
 * One of the player's settings: a checkbox, and an ⓘ that opens a short note on what it changes.
 * Data saver (DataSaverSetting) and Endfield music (MusicGameSetting) are both drawn by it, so
 * the two explain themselves the same way.
 *
 * The note opens in place, under the row, inside whatever holds the setting (the player's ⋯
 * menu): a panel of its own would take the focus out of that menu and close it. In the music
 * pages' header (`header`) the same note opens under the row over the page instead, so it moves
 * neither the title nor Playlists beside it. Escape, a press outside the note and its × close it;
 * Escape and × give focus back to the ⓘ, and Escape goes no further (a menu around it stays open).
 */
export default function MusicSetting({ label, topic, checked, onChange, about, header = false }: {
  label: string;
  /** What the ⓘ and its note are named after "About": "data saver", "Endfield music". */
  topic: string;
  checked: boolean;
  onChange: (on: boolean) => void;
  /** The note's text: what the setting changes, in the reader's words. */
  about: string;
  header?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const infoRef = useRef<HTMLButtonElement>(null);
  const noteRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const name = `About ${topic}`;

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
    <div className={`music-setting${header ? ' music-setting-header' : ''}`} onKeyDown={event => {
      if (!open || event.key !== 'Escape') return;
      // The note only: a menu it sits in stays open.
      event.preventDefault();
      event.stopPropagation();
      event.nativeEvent.stopImmediatePropagation();
      dismiss();
    }}>
      <div className="music-setting-row">
        <label className="check"><input type="checkbox" checked={checked} onChange={event => onChange(event.target.checked)} />{label}</label>
        <button ref={infoRef} type="button" className="btn-bare music-setting-info-btn" aria-label={name}
          aria-expanded={open} aria-controls={open ? id : undefined} onClick={() => setOpen(value => !value)}>
          <InfoIcon />
        </button>
      </div>
      {open && (
        <div id={id} ref={noteRef} className="music-setting-note" role="dialog" aria-label={name}>
          <p>{about}</p>
          <XButton ref={closeRef} dense label={`Close about ${topic}`} onClick={dismiss} />
        </div>
      )}
    </div>
  );
}
