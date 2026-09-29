import { useEffect, useRef, type ReactNode } from 'react';
import XButton from '@/components/ui/XButton';

/**
 * A record over the page: an enemy's handbook entry opened from Stronghold Protocol's
 * pools or a stage's enemies, the Isomorph's pairings. Centred and capped, scrolling
 * inside itself, with the × kept in its corner.
 *
 * Focus moves in on open so Tab starts inside the record rather than at the top of the
 * page behind it. The backdrop is a sibling rather than a parent: a click-to-dismiss
 * parent swallows every click meant for the box inside it. Escape is heard on the window,
 * not on the box: aria-modal is a promise to assistive tech and not a focus trap, so Tab
 * past the last link puts focus on the body, and a handler on the box would then answer
 * nothing. A page with its own Escape handler stands down while a record is open.
 */
export default function RecordDialog({ label, onClose, className, children }: {
  label: string;
  onClose: () => void;
  /** Sizes one kind of record (.gm-isorecord is narrower). */
  className?: string;
  children: ReactNode;
}) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => { box.current?.focus(); }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="record-dialog-wrap">
      <div className="record-dialog-back" onClick={onClose} aria-hidden="true" />
      <div
        className={`record-dialog${className ? ` ${className}` : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        ref={box}
      >
        <XButton className="record-dialog-shut" onClick={onClose} label={`Close ${label}`} />
        {children}
      </div>
    </div>
  );
}
