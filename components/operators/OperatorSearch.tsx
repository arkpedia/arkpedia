import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import Image from '@/components/content/ContentImage';
import { useContentUrl } from '@/lib/content/context';
import { getOperatorIconPath } from '@/lib/operators/operatorIcon';
import { getOperatorSearchResults, loadOperatorSearch, SearchableOperatorRecord } from '@/lib/operators/operatorSearch';
import type { Operator } from '@/lib/operators/operatorTypes';
import styles from './OperatorPage.module.css';

export default function OperatorSearch({ compact }: { compact: boolean }) {
  const contentUrl = useContentUrl();
  const router = useRouter();
  const [operators, setOperators] = useState<SearchableOperatorRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const wrap = useRef<HTMLDivElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const results = useMemo(() => getOperatorSearchResults(operators, query), [operators, query]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    loadOperatorSearch(contentUrl('/operator-search.json'), controller.signal)
      .then(setOperators)
      .catch(error => { if (!controller.signal.aborted) console.error(error); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [contentUrl]);
  useEffect(() => setHighlight(0), [results]);
  useEffect(() => { setOpen(false); setQuery(''); }, [router.asPath, compact]);
  useEffect(() => {
    if (!compact || !open) return;
    const modal = dialog.current!;
    const opener = trigger.current;
    modal.showModal();
    modal.querySelector('input')?.focus();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      modal.close();
      document.body.style.overflow = overflow;
      opener?.focus();
    };
  }, [compact, open]);
  useEffect(() => {
    const outside = (event: MouseEvent) => {
      if (!compact && !wrap.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', outside);
    return () => document.removeEventListener('mousedown', outside);
  }, [compact]);

  function select(name: string) {
    setOpen(false);
    setQuery('');
    void router.push(`/operators/${encodeURIComponent(name)}`);
  }
  const search = <>
    <input type="search" className="op-header-search-input" placeholder="Search operators…"
      value={query} onChange={event => { setQuery(event.target.value); setOpen(true); }}
      onFocus={() => setOpen(true)}
      onKeyDown={event => {
        if (event.key === 'Escape') { setOpen(false); return; }
        if (!open || !results.length) return;
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault();
          setHighlight(index => Math.max(0, Math.min(results.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1))));
        } else if (event.key === 'Enter') { event.preventDefault(); select(results[highlight].name); }
      }}
      role="combobox" aria-label="Search operators" aria-autocomplete="list"
      aria-controls="operator-search-results" aria-expanded={open && !!query.trim()}
      aria-activedescendant={open && results.length ? `operator-search-result-${highlight}` : undefined} />
    {open && query.trim() && <div className="op-header-search-results" id="operator-search-results" role="listbox" aria-label="Matching operators">
      {results.map((operator, index) => <button type="button" key={operator.name}
        className={`op-header-search-result${index === highlight ? ' active' : ''}`}
        id={`operator-search-result-${index}`} role="option" aria-selected={index === highlight}
        onMouseEnter={() => setHighlight(index)} onClick={() => select(operator.name)}>
        <Image src={getOperatorIconPath(operator as Operator)} alt="" width={32} height={32} />
        <span>{operator.name}</span>
      </button>)}
      {!results.length && <div className="op-header-search-empty">{loading ? 'Loading operators…' : 'No operators found.'}</div>}
    </div>}
  </>;
  return <div ref={wrap} className="op-header-search-wrap">
    {compact ? <>
      <button ref={trigger} type="button" className={styles.searchTrigger} title="Search Operators" aria-label="Search Operators" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)}>
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="10" cy="10" r="6" /><path d="m15 15 6 6" /></svg>
      </button>
      {open && <dialog ref={dialog} className={styles.searchDialog} aria-labelledby="operator-search-title" onCancel={() => setOpen(false)} onClick={event => {
        if (event.target !== event.currentTarget) return;
        const r = event.currentTarget.getBoundingClientRect();
        if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) setOpen(false);
      }}>
        <header><h2 id="operator-search-title">Search Operators</h2><button type="button" className="ghost" aria-label="Close search" onClick={() => setOpen(false)}>×</button></header>
        {search}
      </dialog>}
    </> : search}
  </div>;
}
