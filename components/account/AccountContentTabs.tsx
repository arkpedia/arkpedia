import { useEffect, useRef } from 'react';
import Tabs, { tabPanelProps, type TabOption } from '@/components/ui/Tabs';
import StickyControls from '@/components/ui/StickyControls';
import styles from './AccountPage.module.css';

/** Account navigation shared by private and published profiles. */
export default function AccountContentTabs<V extends string>({ id, label, value, onChange, options, sticky = true }: {
  id: string; label: string; value: V; onChange: (value: V) => void; options: readonly TabOption<V>[]; sticky?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null), previous = useRef(value), navigate = useRef(false);
  useEffect(() => {
    const changed = previous.current !== value;
    previous.current = value;
    if (!changed || !navigate.current) return;
    navigate.current = false;
    // After the old panel's height reserve settles, show the newly selected panel
    // below both sticky bars instead of leaving the reader in the old roster's tail.
    const frame = requestAnimationFrame(() => document.getElementById(tabPanelProps(id, value).id)?.scrollIntoView({ block: 'start', behavior: 'instant' }));
    return () => cancelAnimationFrame(frame);
  }, [id, sticky, value]);
  const tabs = <div ref={ref}><Tabs id={id} label={label} className={styles.contentTabs} value={value} onChange={next => {
    const bar = ref.current?.closest<HTMLElement>('.sticky-controls');
    const nav = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--nav-h')) || 60;
    navigate.current = sticky && bar?.dataset.sticky === 'true' && bar.getBoundingClientRect().top <= nav + 1;
    onChange(next);
  }} options={options} /></div>;
  return sticky ? <StickyControls>{tabs}</StickyControls> : tabs;
}
