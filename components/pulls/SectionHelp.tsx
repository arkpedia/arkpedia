import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/** One opt-in help entry per section. Guidance can point to the actual controls,
 * including those in closed disclosures, without copying the form or its state. */
export function SectionHelp({ title, children, links = [], triggerLabel }: {
  title: string; children: ReactNode; triggerLabel?: string; links?: { label: string; selector: string }[];
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const destination = useRef<HTMLElement | null>(null);
  const highlight = useRef<{ element: HTMLElement; timer: number } | null>(null);
  useEffect(() => () => {
    if (highlight.current) {
      clearTimeout(highlight.current.timer);
      highlight.current.element.classList.remove('pulls-help-target');
    }
  }, []);
  useEffect(() => {
    if (!open || !dialog.current) return;
    const modal = dialog.current;
    const opener = trigger.current;
    const scroll = { left: window.scrollX, top: window.scrollY };
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    modal.showModal();
    return () => {
      modal.close();
      document.body.style.overflow = overflow;
      const target = destination.current;
      destination.current = null;
      if (target?.isConnected) {
        for (let node: HTMLElement | null = target; node; node = node.parentElement) {
          if (node instanceof HTMLDetailsElement) node.open = true;
        }
        const control = target.matches('button, input, select, summary, a[href]') ? target : target.querySelector<HTMLElement>('input:not([disabled]), button:not([disabled]), select, summary, a[href]');
        (control || opener)?.focus({ preventScroll: true });
        if (highlight.current) {
          clearTimeout(highlight.current.timer);
          highlight.current.element.classList.remove('pulls-help-target');
        }
        target.classList.add('pulls-help-target');
        target.scrollIntoView({ block: 'center', behavior: 'instant' });
        highlight.current = { element: target, timer: window.setTimeout(() => target.classList.remove('pulls-help-target'), 5000) };
      } else {
        opener?.focus({ preventScroll: true });
        window.scrollTo({ ...scroll, behavior: 'instant' });
      }
    };
  }, [open]);
  return <>
    <button type="button" ref={trigger} className={triggerLabel ? "ghost pulls-detail-button" : "pulls-help-button"} aria-label={triggerLabel ? title : `Help: ${title}`} aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)}>{triggerLabel ?? "?"}{triggerLabel && <span aria-hidden="true">↗</span>}</button>
    {open && createPortal(<dialog ref={dialog} className="pulls-help-dialog" aria-labelledby={id}
      onCancel={event => { event.preventDefault(); event.stopPropagation(); setOpen(false); }}
      onKeyDown={event => {
        event.stopPropagation(); // keep nested help separate from the forecast dialog
        if (event.key !== 'Tab') return;
        const controls = [...event.currentTarget.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], summary, [tabindex="0"]')].filter(el => el.getClientRects().length > 0);
        if (!controls.length) return;
        event.preventDefault();
        const current = controls.indexOf(document.activeElement as HTMLElement);
        controls[(current + (event.shiftKey ? -1 : 1) + controls.length) % controls.length].focus();
      }}
      onClick={event => {
        if (event.target !== event.currentTarget) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) setOpen(false);
      }}>
      <div className="pulls-help-heading"><h2 id={id} className="entity-title">{title}</h2><button type="button" className="ghost btn-sm" onClick={() => setOpen(false)} autoFocus>{triggerLabel ? 'Close' : 'Close help'}</button></div>
      <div className="pulls-help-content">{children}</div>
      {links.length > 0 && <nav className="pulls-help-links" aria-label="Find these controls">{links.map(link => <button key={link.selector} type="button" className="ghost btn-sm" onClick={() => {
        destination.current = trigger.current?.closest('section, fieldset')?.querySelector<HTMLElement>(link.selector) || document.querySelector<HTMLElement>(link.selector);
        const panel = destination.current?.closest<HTMLElement>('[role=tabpanel]');
        if (panel?.hidden) document.getElementById(panel.getAttribute('aria-labelledby') ?? '')?.click();
        setOpen(false);
      }}>Show {link.label}</button>)}</nav>}
    </dialog>, document.body)}
  </>;
}
