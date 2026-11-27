import { siteTablesStaticProps } from '@/lib/content/server';
import Link from 'next/link';
import PublishedUpdates from '@/components/site-updates/PublishedUpdates';
import PageMeta from '@/components/layout/PageMeta';
import { useEffect, useMemo, useState } from 'react';
import PageHeader from '@/components/ui/PageHeader';
import { CHANGELOG, type ChangeItem } from '@/lib/changelog/entries';
import { markChangelogSeen } from '@/lib/changelog/seen';
import { formatInstant } from '@/components/ui/LocalTime';
import { groupChangelogDays } from '@/lib/changelog/group';
import { canonicalPublicHref } from '@/lib/nav/publicRoutes';
import { managedPageForHref } from '@/lib/page-visibility/settings';
import { usePageVisibility } from '@/lib/page-visibility/usePageVisibility';

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
  const listed = usePageVisibility();
  useEffect(() => {
    setTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone);
    markChangelogSeen();
  }, []);
  const days = useMemo(() => {
    function isListed(item: ChangeItem) {
      const page = item.href ? managedPageForHref(item.href) : undefined;
      return page === undefined || listed.includes(page);
    }
    const entries = CHANGELOG.map(entry => ({
      ...entry,
      added: entry.added?.filter(isListed),
      changed: entry.changed?.filter(isListed),
      fixed: entry.fixed?.filter(isListed),
    })).filter(entry => entry.added?.length || entry.changed?.length || entry.fixed?.length);
    return groupChangelogDays(entries, timeZone);
  }, [listed, timeZone]);
  return (
    <>
      <PageMeta title="What's new" description="What changed on Arkpedia, release by release." path="/changelog" />
      <PageHeader eyebrow="Rhodes Island // What's new" title="What's new"
        sub="What was added, changed and fixed on Arkpedia, newest first." />
      <main>
        <PublishedUpdates />
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

// No data of its own: the site's tables only (the header's Sponsored slot).
export const getStaticProps = siteTablesStaticProps;
