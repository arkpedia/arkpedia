import Head from 'next/head';
import Link from 'next/link';
import { useEffect } from 'react';
import PageHeader from '@/components/ui/PageHeader';
import { CHANGELOG, type ChangeItem } from '@/lib/changelog/entries';
import { markChangelogSeen } from '@/lib/changelog/seen';
import LocalTime from '@/components/ui/LocalTime';

/* What's new on the site, newest first (lib/changelog/entries.ts). Opening it clears the
   dot on the nav's What's new. */

const KINDS = [['added', 'Added'], ['changed', 'Changed'], ['fixed', 'Fixed']] as const;

function Item({ item }: { item: ChangeItem }) {
  return <li><span>{item.text}{item.href && <> <Link prefetch={false} href={item.href} className="changelog-go">Open →</Link></>}</span></li>;
}

export default function ChangelogPage() {
  useEffect(() => { markChangelogSeen(); }, []);
  return (
    <>
      <Head><title>What&apos;s new — Arkpedia</title></Head>
      <PageHeader eyebrow="Rhodes Island // What's new" title="What's new"
        sub="What was added, changed and fixed on Arkpedia, newest first." />
      <main>
        {CHANGELOG.map((entry) => (
          <section key={entry.at} className="op-section changelog-entry" aria-labelledby={`changes-${entry.at.slice(0, 16)}`}>
            {/* When it reached the site, in the reader's own time zone. */}
            <h2 id={`changes-${entry.at.slice(0, 16)}`}><LocalTime iso={entry.at} />{entry.title && <span className="hint changelog-title">{entry.title}</span>}</h2>
            {KINDS.map(([kind, label]) => entry[kind]?.length ? (
              <div key={kind} className={`changelog-group is-${kind}`}>
                <h3>{label}</h3>
                <ul>{entry[kind]!.map((item) => <Item key={item.text} item={item} />)}</ul>
              </div>
            ) : null)}
          </section>
        ))}
      </main>
    </>
  );
}
