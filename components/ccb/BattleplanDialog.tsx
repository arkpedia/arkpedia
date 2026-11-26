import { useLayoutEffect, useRef, type ReactNode } from 'react';
import XButton from '@/components/ui/XButton';
import styles from './Battleplan.module.css';

export function jumpToDialogSection(id: string) {
  const target = document.getElementById(id);
  const body = target?.closest<HTMLElement>(`.${styles.dialogBody}`);
  if (!target || !body) return;
  const inset = Number.parseFloat(getComputedStyle(body).paddingBlockStart);
  body.scrollTop += target.getBoundingClientRect().top - body.getBoundingClientRect().top - body.clientTop - inset;
  target.focus({ preventScroll: true });
}

export default function BattleplanDialog({ label, onClose, children, wide = false, className = '', focusSection, headerAction }: {
  label: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
  className?: string;
  focusSection?: string | null;
  headerAction?: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useLayoutEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const trigger = document.activeElement;
    dialog.showModal();
    return () => {
      dialog.close();
      if (trigger instanceof HTMLElement) trigger.focus({ preventScroll: true });
    };
  }, []);

  useLayoutEffect(() => {
    if (focusSection) jumpToDialogSection(focusSection);
  }, [focusSection]);

  return <dialog ref={ref} className={`account-dialog ${styles.dialog} ${wide ? styles.wideDialog : ''} ${className}`} aria-label={label}
    onCancel={event => { event.preventDefault(); onClose(); }}
    onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <header className={styles.dialogHead}>
      <h2 className="entity-title">{label}</h2>
      <div className={styles.dialogActions}>
        {headerAction}
        <XButton label={`Close ${label}`} onClick={onClose} autoFocus />
      </div>
    </header>
    <div className={styles.dialogBody}>{children}</div>
  </dialog>;
}
