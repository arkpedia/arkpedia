import { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useAnchoredPopover } from '@/components/ui/useAnchoredPopover';
import Image from '@/components/content/ContentImage';
import Link from 'next/link';

import { getOperatorIconPath } from '@/lib/operators/operatorIcon';
import type { Operator } from '@/lib/operators/operatorTypes';
import styles from './OperatorPage.module.css';

export interface RelatedOperator {
  name: string;
  rarity: number | null;
  portraitPending?: boolean;
}

export default function OperatorRelationPopover({ label, title, operators, children }: {
  label: string;
  title: string;
  operators: RelatedOperator[];
  children?: ReactNode;
}) {
  const { open, setOpen, close, buttonRef, menuRef, menuStyle } = useAnchoredPopover(360);

  if (operators.length === 0) return <span>{children ?? label}</span>;

  return <span className={styles.relationPopover}>
    <button ref={buttonRef} type="button" aria-expanded={open} aria-haspopup="dialog" onClick={() => setOpen(value => !value)} aria-label={`${label}: show related operators`}>
      {children ?? label}
      <svg aria-hidden="true" viewBox="0 0 12 12" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="m3 4.5 3 3 3-3" />
      </svg>
    </button>
    {open && createPortal(<div ref={menuRef} role="dialog" aria-label={title} className={styles.relationMenu} style={menuStyle}>
      <div className={styles.relationHeading}>
        <b>{title}</b>
      </div>
      <div className={styles.relationGrid}>
        {operators.map(operator => <Link prefetch={false} key={operator.name}
          href={`/operators/${encodeURIComponent(operator.name)}`} title={operator.name} onClick={close}>
          <Image src={getOperatorIconPath(operator as Operator)} alt="" width={38} height={38} />
          <span>{operator.name}</span>
        </Link>)}
      </div>
    </div>, document.body)}
  </span>;
}
