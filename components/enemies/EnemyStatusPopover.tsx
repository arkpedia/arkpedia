import Image from '@/components/content/ContentImage';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { EnemyStatusOperatorGroup } from '@/lib/enemies/statusOperators';

const MENU_WIDTH = 292;
const VIEWPORT_GAP = 12;

export default function EnemyStatusPopover({
  status,
  group,
  immune,
  children,
}: {
  status: string;
  group: EnemyStatusOperatorGroup;
  immune: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: VIEWPORT_GAP, top: VIEWPORT_GAP });

  const placeMenu = useCallback(() => {
    const button = buttonRef.current;
    const menu = menuRef.current;
    if (!button || !menu) return;
    const rect = button.getBoundingClientRect();
    const width = Math.min(MENU_WIDTH, window.innerWidth - VIEWPORT_GAP * 2);
    const left = Math.max(VIEWPORT_GAP, Math.min(rect.left, window.innerWidth - width - VIEWPORT_GAP));
    const menuHeight = menu.offsetHeight;
    const below = rect.bottom + 6;
    const top = below + menuHeight <= window.innerHeight - VIEWPORT_GAP
      ? below
      : Math.max(VIEWPORT_GAP, rect.top - menuHeight - 6);
    setPosition({ left, top });
  }, []);

  useEffect(() => {
    if (!open) return;
    placeMenu();
    const closeOutside = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setOpen(false);
      buttonRef.current?.focus({ preventScroll: true });
    };
    document.addEventListener('pointerdown', closeOutside);
    document.addEventListener('keydown', closeEscape);
    window.addEventListener('resize', placeMenu, { passive: true });
    window.addEventListener('scroll', placeMenu, true);
    return () => {
      document.removeEventListener('pointerdown', closeOutside);
      document.removeEventListener('keydown', closeEscape);
      window.removeEventListener('resize', placeMenu);
      window.removeEventListener('scroll', placeMenu, true);
    };
  }, [open, placeMenu]);

  return <div
    ref={rootRef}
    className="enemy-status-popover"
    onMouseEnter={() => setOpen(true)}
    onMouseLeave={() => {
      if (!rootRef.current?.contains(document.activeElement)) setOpen(false);
    }}
    onBlur={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false);
    }}
  >
    <button
      ref={buttonRef}
      type="button"
      className="enemy-status-trigger"
      aria-expanded={open}
      aria-haspopup="dialog"
      onClick={() => setOpen(value => !value)}
    >
      {children}
      <svg aria-hidden="true" viewBox="0 0 12 12"><path d="m3 4.5 3 3 3-3" /></svg>
    </button>
    {open && <div
      ref={menuRef}
      role="dialog"
      aria-label={`Operators who apply ${status}`}
      className="enemy-status-menu"
      style={{ left: position.left, top: position.top, width: `min(${MENU_WIDTH}px, calc(100vw - ${VIEWPORT_GAP * 2}px))` }}
    >
      <div className="enemy-status-menu-head">
        <div><strong>{status}</strong><span>{immune ? 'Immune here' : 'Can be applied'}</span></div>
        <span>{group.total}</span>
      </div>
      <div className="enemy-status-operator-list">
        {group.operators.map(operator => <Link
          prefetch={false}
          key={operator.name}
          href={`/operators/${encodeURIComponent(operator.name)}`}
          className="enemy-status-operator"
        >
          <Image src={operator.icon} alt="" width={38} height={38} />
          <span>{operator.name}</span>
          {operator.sourceIcon
            ? <Image className="enemy-status-source-icon" src={operator.sourceIcon} alt={operator.sourceLabel ?? ''} title={operator.sourceLabel ?? undefined} width={22} height={22} />
            : operator.sourceLabel && <small title={operator.sourceLabel}>{operator.sourceLabel}</small>}
        </Link>)}
      </div>
      <Link prefetch={false} className="enemy-status-more" href={`/techniques?q=${encodeURIComponent(group.technique)}`}>
        View all {group.total} operators
        <span aria-hidden="true">→</span>
      </Link>
    </div>}
  </div>;
}
