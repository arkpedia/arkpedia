import { useState } from 'react';
import LoadOnScroll from '@/components/ui/LoadOnScroll';
import { operatorHref } from '@/lib/operators/operatorHref';
import Head from 'next/head';
import Link from 'next/link';
import { ContentImg } from '@/components/content/ContentImage';
import SearchInput from '@/components/ui/SearchInput';
import PageHeader from '@/components/ui/PageHeader';
import type { CreditPerson } from '@/lib/operators/creditDatabase';
import { matchesSearch } from '@/lib/search/searchNormalize';
export default function CreditDatabase({ people, kind }: { people: CreditPerson[]; kind: 'artists' | 'voice-actors' }) {
  const [query, setQuery] = useState(''), [limit, setLimit] = useState(30), [open, setOpen] = useState<string | null>(null);
  const title = kind === 'artists' ? 'Artists' : 'Voice Actors';
  const filtered = people.filter(person => matchesSearch(person.name, query) || person.operators.some(op => matchesSearch(op.name, query)));
  return <><Head><title>{title} — Arkpedia</title></Head><PageHeader title={title} eyebrow="Rhodes Island // Personnel credits" actions={<Link prefetch={false} className="ghost" href={kind === 'artists' ? '/voice-actors' : '/artists'}>{kind === 'artists' ? 'Voice Actors' : 'Artists'}</Link>} />
    <main><SearchInput label={`Search ${title.toLowerCase()}`} placeholder="Name or operator" value={query} onChange={value => { setQuery(value); setLimit(30); }} />
      <div className="credit-database">{filtered.slice(0, limit).map(person => <section key={person.name} className="op-section">
        <button type="button" className="ghost credit-person" aria-expanded={open === person.name} onClick={() => setOpen(open === person.name ? null : person.name)}>{person.name}<span aria-hidden="true">{open === person.name ? '−' : '+'}</span></button>
        {open === person.name && <div className="credit-operators">{person.operators.map(op => <Link key={op.name} prefetch={false} href={operatorHref(op.name, kind === 'voice-actors' ? 'voiceLines' : null)}><ContentImg src={op.icon} alt="" width={72} height={72} /><span><b>{op.name}</b><small>{op.credits.join(' · ')}</small></span></Link>)}</div>}
      </section>)}</div>
      {!filtered.length && <p className="hint">No matching credits.</p>}
      <LoadOnScroll shown={Math.min(limit, filtered.length)} total={filtered.length} onMore={() => setLimit(value => value + 30)} />
    </main></>;
}
