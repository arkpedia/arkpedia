import { ReactNode, useEffect, useRef } from 'react';
import Image from 'next/image';
import Link from 'next/link';

import { getOperatorIconPath } from '@/lib/operators/operatorIcon';
import type { Operator } from '@/lib/operators/operatorTypes';
import styles from './OperatorPage.module.css';

export interface RelatedOperator {
  name: string;
  rarity: number | null;
  isFuture: boolean | null;
}

export default function OperatorRelationPopover({ label, title, operators, children }: {
  label: string;
  title: string;
  operators: RelatedOperator[];
  children?: ReactNode;
}) {
  const detailsRef = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    const closeOutside = (event: PointerEvent) => {
      const details = detailsRef.current;
      if (details?.open && !details.contains(event.target as Node)) details.open = false;
    };
    const closeWithEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || !detailsRef.current?.open) return;
      detailsRef.current.open = false;
      detailsRef.current.querySelector<HTMLElement>('summary')?.focus({ preventScroll: true });
    };
    document.addEventListener('pointerdown', closeOutside);
    document.addEventListener('keydown', closeWithEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOutside);
      document.removeEventListener('keydown', closeWithEscape);
    };
  }, []);

  if (operators.length === 0) return <span>{children ?? label}</span>;

  return <details ref={detailsRef} className={styles.relationPopover}>
    <summary aria-label={`${label}: show related operators`}>
      {children ?? label}
      <svg aria-hidden="true" viewBox="0 0 12 12" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="m3 4.5 3 3 3-3" />
      </svg>
    </summary>
    <div className={styles.relationMenu}>
      <div className={styles.relationHeading}>
        <b>{title}</b>
        <span>{operators.length}</span>
      </div>
      <div className={styles.relationGrid}>
        {operators.map(operator => <Link prefetch={false} key={operator.name}
          href={`/operators/${encodeURIComponent(operator.name)}`} title={operator.name}>
          <Image src={getOperatorIconPath(operator as Operator)} alt="" width={38} height={38} />
          <span>{operator.name}</span>
        </Link>)}
      </div>
    </div>
  </details>;
}
