import { useEffect, useRef, type ReactNode } from 'react';

export function TransferDialog({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    ref.current?.showModal();
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = overflow; previous?.focus(); };
  }, []);
  return <dialog ref={ref} className="planner-transfer-dialog" aria-labelledby="planner-transfer-title" onCancel={onClose} onClick={e => {
    if (e.target !== e.currentTarget) return;
    const bounds = e.currentTarget.getBoundingClientRect();
    if (e.clientX < bounds.left || e.clientX > bounds.right || e.clientY < bounds.top || e.clientY > bounds.bottom) onClose();
  }}>
    <header><h2 id="planner-transfer-title">Import / Export</h2><button type="button" className="ghost" aria-label="Close" onClick={onClose}>×</button></header>
    <div className="planner-transfer-body">{children}</div>
  </dialog>;
}
