import Image from '@/components/content/ContentImage';
import Link from 'next/link';
import { createPortal } from 'react-dom';
import { useAnchoredPopover } from '@/components/ui/useAnchoredPopover';
import type { EnemyStatusOperatorGroup } from '@/lib/enemies/statusOperators';

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
  const { open, setOpen, close, buttonRef, menuRef, menuStyle } = useAnchoredPopover(320);

  return <div className="enemy-status-popover">
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
    {open && createPortal(<div
      ref={menuRef}
      role="dialog"
      aria-label={`Operators who apply ${status}`}
      className="enemy-status-menu"
      style={menuStyle}
    >
      <div className="enemy-status-menu-head">
        <div><strong>{status}</strong><span>{immune ? 'Immune here' : 'Can be applied'}</span></div>
      </div>
      <div className="enemy-status-operator-list">
        {group.operators.map(operator => <Link
          prefetch={false}
          key={operator.name}
          href={`/operators/${encodeURIComponent(operator.name)}`}
          className="enemy-status-operator"
          onClick={close}
        >
          <Image src={operator.icon} alt="" width={38} height={38} />
          <span>{operator.name}</span>
          {operator.sourceLabel && <small title={operator.sourceTitle || operator.sourceLabel}>
            {operator.sourceIcon && <Image className="enemy-status-source-icon" src={operator.sourceIcon} alt="" width={22} height={22} />}
            {operator.sourceLabel}
          </small>}
        </Link>)}
      </div>
      <Link prefetch={false} className="enemy-status-more" onClick={close} href={`/techniques?q=${encodeURIComponent(group.technique)}`}>
        View all operators
        <span aria-hidden="true">→</span>
      </Link>
    </div>, document.body)}
  </div>;
}
