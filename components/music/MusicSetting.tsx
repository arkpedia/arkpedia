import { useEffect, useId, useRef } from 'react';
import XButton from '@/components/ui/XButton';
import InfoIcon from '@/components/ui/InfoIcon';
import { useAnchoredPopover } from '@/components/ui/useAnchoredPopover';

/**
 * One of the player's settings: a checkbox, and an ⓘ that opens a short note on what it changes.
 * Data saver (DataSaverSetting) and Endfield music (MusicGameSetting) are both drawn by it, so
 * the two explain themselves the same way.
 *
 * The note floats above the page without resizing its header or containing menu.
 * It stays nested in the menu's DOM so focus and outside clicks belong to the
 * correct disclosure; Escape closes the note before the menu.
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
  const { open, setOpen, close, buttonRef: infoRef, menuRef: noteRef, menuStyle } = useAnchoredPopover(320, 'end');
  const id = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const name = `About ${topic}`;

  function dismiss() {
    close();
    infoRef.current?.focus({ preventScroll: true });
  }

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus({ preventScroll: true });
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
        <div id={id} ref={noteRef} className="action-popover music-setting-note" style={{ ...menuStyle, position: 'fixed' }} role="dialog" aria-label={name}>
          <p>{about}</p>
          <XButton ref={closeRef} dense label={`Close about ${topic}`} onClick={dismiss} />
        </div>
      )}
    </div>
  );
}
