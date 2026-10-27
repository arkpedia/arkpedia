import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import XButton from './XButton';
import { useAnchoredPopover } from './useAnchoredPopover';

/** A small, non-modal record beside its trigger, without changing page layout. */
export default function RecordPopover({ label, name, trigger, className, children }: {
  label: string; name: string; trigger: ReactNode; className?: string; children: ReactNode;
}) {
  const { open, setOpen, close, buttonRef, menuRef, menuStyle } = useAnchoredPopover(320);
  const id = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (open) closeRef.current?.focus({ preventScroll: true }); }, [open]);
  function dismiss() { close(); buttonRef.current?.focus({ preventScroll: true }); }
  return <>
    <button ref={buttonRef} type="button" className={`btn-bare ${className ?? ''}`}
      aria-label={label} aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? id : undefined}
      onClick={() => setOpen(value => !value)}>{trigger}</button>
    {open && createPortal(<div id={id} ref={menuRef} role="dialog" aria-label={name}
      className="record-popover" style={menuStyle}
      onKeyDown={event => {
        if (event.key === 'Tab' && event.target === closeRef.current) {
          // Resume normal page order from the trigger instead of the portal's DOM position.
          close(); buttonRef.current?.focus({ preventScroll: true });
        }
      }}
      onBlur={event => { if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget as Node) && event.relatedTarget !== buttonRef.current) close(); }}>
      <div className="record-popover-heading">
        <strong>{name}</strong>
        <XButton ref={closeRef} label="Close source preview" onClick={dismiss} />
      </div>
      {children}
    </div>, document.body)}
  </>;
}
