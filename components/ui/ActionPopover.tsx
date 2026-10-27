import { useEffect, useId, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useAnchoredPopover } from './useAnchoredPopover';

/** A non-modal disclosure: ordinary links/buttons keep their native Tab behavior. */
export default function ActionPopover({ label, trigger, children, className = '', width = 260, align = 'start', onOpen, navigation = false }: {
  label: string; trigger: ReactNode; children: ReactNode; className?: string; width?: number; align?: 'start' | 'end'; onOpen?: () => void; navigation?: boolean;
}) {
  const { open, setOpen, close, buttonRef, menuRef, menuStyle } = useAnchoredPopover(width, align);
  const id = useId();
  useEffect(() => {
    if (open) menuRef.current?.querySelector<HTMLElement>('a, button:not(:disabled), input, [tabindex="0"]')?.focus({ preventScroll: true });
  }, [open, menuRef]);
  useEffect(() => {
    if (!open) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      // Dismiss this disclosure before a containing native dialog receives Escape.
      event.preventDefault(); event.stopImmediatePropagation(); close();
      buttonRef.current?.focus({ preventScroll: true });
    };
    document.addEventListener('keydown', escape, true);
    return () => document.removeEventListener('keydown', escape, true);
  }, [open, close, buttonRef]);
  return <>
    <button type="button" ref={buttonRef} className={`action-popover-trigger ${className}`} aria-label={label} title={label}
      aria-expanded={open} aria-controls={open ? id : undefined} onClick={() => { if (!open) onOpen?.(); setOpen(!open); }}>{trigger}</button>
    {open && createPortal(<div id={id} ref={menuRef} className={`action-popover${navigation ? ' header-action-menu site-nav-pop' : ''}`} role="region" aria-label={label}
      style={{ ...menuStyle, position: 'fixed' }} onKeyDown={event => {
        if (event.key !== 'Tab') return;
        const selector = 'a[href], button:not(:disabled), input:not(:disabled), [tabindex="0"]';
        const visible = (element: HTMLElement) => element.getClientRects().length && getComputedStyle(element).visibility !== 'hidden' && !element.closest('[inert]');
        const controls = [...event.currentTarget.querySelectorAll<HTMLElement>(selector)].filter(visible);
        const boundary = event.shiftKey ? controls[0] : controls.at(-1);
        if (document.activeElement !== boundary) return;
        // A portal sits at the end of its DOM root. Restore logical header order
        // instead of sending Tab into the footer or out of the browser document.
        event.preventDefault(); close();
        const trigger = buttonRef.current;
        if (!trigger) return;
        if (event.shiftKey) { trigger.focus(); return; }
        const root = trigger.closest('dialog') ?? document.body;
        const following = [...root.querySelectorAll<HTMLElement>(selector)].filter(element => visible(element) && !menuRef.current?.contains(element));
        (following[following.indexOf(trigger) + 1] ?? trigger).focus();
      }} onBlur={event => {
        if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget as Node) && event.relatedTarget !== buttonRef.current) close();
      }}>{children}</div>, buttonRef.current?.closest('dialog') ?? document.body)}
  </>;
}
