import { useEffect, useId, useRef, type ReactNode } from 'react';
import XButton from '@/components/ui/XButton';

/*
 * The account page's Import popup: a modal <dialog> with the explanation and the sign-in
 * (components/account-import/GameSignIn) inside. Escape, the close button and a click on the
 * backdrop close it, and focus goes back to the button that opened it. The Pull Planner's
 * Past events open in the same frame (`className` widens it).
 */
export default function ImportDialog({ title, children, onClose, className, dismissible = true }: { title: string; children: ReactNode; onClose: () => void; className?: string; dismissible?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    ref.current?.showModal();
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = overflow; previous?.focus(); };
  }, []);
  return (
    <dialog ref={ref} className={`account-dialog${className ? ` ${className}` : ''}`} aria-labelledby={titleId} onCancel={event => { event.preventDefault(); event.stopPropagation(); if (dismissible) onClose(); }} onClick={(event) => {
      if (!dismissible || event.target !== event.currentTarget) return;
      const box = event.currentTarget.getBoundingClientRect();
      if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) onClose();
    }}>
      <header><h2 id={titleId} className="entity-title">{title}</h2>{dismissible && <XButton label="Close" onClick={onClose} />}</header>
      <div className="account-dialog-body">{children}</div>
    </dialog>
  );
}
