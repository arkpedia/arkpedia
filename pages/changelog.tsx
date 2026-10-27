import Head from 'next/head';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import PageHeader from '@/components/ui/PageHeader';
import { CHANGELOG, type ChangeItem } from '@/lib/changelog/entries';
import { markChangelogSeen } from '@/lib/changelog/seen';
import { formatInstant } from '@/components/ui/LocalTime';
import { groupChangelogDays } from '@/lib/changelog/group';
import { canonicalPublicHref } from '@/lib/nav/publicRoutes';

/* What's new on the site, newest first (lib/changelog/entries.ts): each day's Added /
   Changed / Fixed as short bold titles to skim, each with one quieter line, the title linking to
   the page it is about. Opening it clears the dot on the nav's What's new. */

const KINDS = [['added', 'Added'], ['changed', 'Changed'], ['fixed', 'Fixed']] as const;

function Item({ item }: { item: ChangeItem }) {
  return (
    <li>
      {item.href
        ? <Link prefetch={false} href={canonicalPublicHref(item.href)} className="changelog-item-title">{item.title}<span className="changelog-go" aria-hidden="true"> →</span></Link>
        : <span className="changelog-item-title">{item.title}</span>}
      {item.detail && <span className="changelog-item-detail">{item.detail}</span>}
    </li>
  );
}

export default function ChangelogPage() {
  // UTC on the server and first client render, then group and label in the same local zone.
  const [timeZone, setTimeZone] = useState('UTC');
  useEffect(() => {
    setTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone);
    markChangelogSeen();
  }, []);
  const days = groupChangelogDays(CHANGELOG, timeZone);
  return (
    <>
      <Head><title>What&apos;s new — Arkpedia</title></Head>
      <PageHeader eyebrow="Rhodes Island // What's new" title="What's new"
        sub="What was added, changed and fixed on Arkpedia, newest first." />
      <main>
        {days.map((entry) => (
          <section key={entry.day} className="op-section changelog-entry" aria-labelledby={`changes-${entry.day}`}>
            {/* When it reached the site, in the reader's own time zone. */}
            <h2 id={`changes-${entry.day}`}><time dateTime={entry.at} title={formatInstant(entry.at, 'minute', timeZone)}>{formatInstant(entry.at, 'day', timeZone)}</time>{entry.title && <span className="hint changelog-title">{entry.title}</span>}</h2>
            <div className="changelog-groups">
            {KINDS.map(([kind, label]) => entry[kind]?.length ? (
              <div key={kind} className={`changelog-group is-${kind}`}>
                <h3>{label}</h3>
                <ul>{entry[kind]!.map((item, index) => <Item key={`${item.title}-${index}`} item={item} />)}</ul>
              </div>
            ) : null)}
            </div>
          </section>
        ))}
      </main>
    </>
  );
}
