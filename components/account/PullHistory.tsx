import { useMemo, useState } from 'react';
import Link from 'next/link';
import Image from '@/components/content/ContentImage';
import LoadOnScroll from '@/components/ui/LoadOnScroll';
import LocalTime from '@/components/ui/LocalTime';
import type { AccountRecord } from '@/lib/account/accountStore';
import { bannerPulls, pullSessions, rarityCounts, type PullRecord } from '@/lib/account/pulls';
import type { GameAccountMap } from '@/lib/planner/gameAccount';
import { getOperatorIconPath, OPERATOR_PORTRAIT_PLACEHOLDER } from '@/lib/operators/operatorIcon';
import { operatorHref } from '@/lib/operators/operatorHref';

/*
 * The Account page's Pull History: what the imports have kept of the reader's headhunting
 * (lib/account/pulls.ts). The totals, each banner with the six- and five-stars it gave, and every
 * press newest first, growing as the reader scrolls. A pull's rarity and name are the id map's
 * where it has the operator, the Account Center's otherwise; a banner is named by its record
 * (the map's pools), else by the Account Center.
 */

const DAY = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const day = (seconds: number) => DAY.format(new Date(seconds * 1000));
const percent = (part: number, total: number) => (total ? `${((part / total) * 100).toFixed(1)}%` : '0%');
const SESSIONS_PAGE = 20;

/** Holds every pull at once: an account with years of history is still a few thousand rows. */
export default function PullHistory({ account, map }: { account: AccountRecord | null; map: GameAccountMap }) {
  const history = account?.pulls;
  const [shown, setShown] = useState(SESSIONS_PAGE);
  const view = useMemo(() => {
    if (!history?.rows.length) return null;
    const rarity = (row: PullRecord) => map.chars[row.char]?.rarity ?? row.star ?? 3;
    return { rarity, counts: rarityCounts(history.rows, rarity), banners: bannerPulls(history.rows, rarity), sessions: pullSessions(history.rows) };
  }, [history, map]);

  if (!account) return <p className="hint">No account imported yet: use Import / export above, and the pulls Yostar keeps come with it.</p>;
  if (!history) return <p className="hint">Import again to add your pull history: this account was imported before Arkpedia read it.</p>;
  const note = history.error ? <p className="hint">The last import could not read your pull history ({history.error}).{history.rows.length ? ' What earlier imports kept is below.' : ''}</p> : null;
  if (!view) return <>{note ?? <p className="hint">No pulls in the last 90 days.</p>}</>;

  const bannerName = (pool: string) => map.pools?.[pool] ?? history.pools[pool] ?? pool;
  const operator = (row: PullRecord) => {
    const known = map.chars[row.char];
    return { name: known?.name ?? history.names[row.char] ?? row.char, rarity: view.rarity(row), known: !!known };
  };
  const icon = (row: PullRecord, key: string | number, size: number) => {
    const op = operator(row);
    const picture = <Image src={op.known ? getOperatorIconPath(op) : OPERATOR_PORTRAIT_PLACEHOLDER} alt={op.name} title={op.name} width={size} height={size} className={`tier-${op.rarity}`} />;
    return op.known
      ? <Link key={key} prefetch={false} href={operatorHref(op.name, null)} className="account-pulls-op">{picture}</Link>
      : <span key={key} className="account-pulls-op">{picture}</span>;
  };
  const { counts } = view;
  const oldest = history.rows[history.rows.length - 1].at;

  return (
    <>
      {note}
      <dl className="account-pulls-stats">
        <div><dt className="label-tag">Pulls</dt><dd>{counts.total.toLocaleString('en-US')}</dd></div>
        <div><dt className="label-tag">6★</dt><dd className="rarity-6">{counts.six} <small>{percent(counts.six, counts.total)}</small></dd></div>
        <div><dt className="label-tag">5★</dt><dd className="rarity-5">{counts.five} <small>{percent(counts.five, counts.total)}</small></dd></div>
        <div><dt className="label-tag">Since</dt><dd>{day(oldest)}</dd></div>
      </dl>

      <h3>By banner</h3>
      <ul className="account-pulls-banners">
        {view.banners.map((banner) => (
          <li key={banner.pool} className="account-pulls-banner">
            <div className="account-pulls-banner-head">
              <span className="account-pulls-banner-name">{bannerName(banner.pool)}</span>
              <span className="account-pulls-banner-meta">
                {banner.pulls.toLocaleString('en-US')} {banner.pulls === 1 ? 'pull' : 'pulls'}
                {' · '}{banner.six.length ? `${banner.sinceSix} since the last 6★` : 'no 6★ yet'}
                {' · '}{day(banner.first) === day(banner.last) ? day(banner.last) : `${day(banner.first)} – ${day(banner.last)}`}
              </span>
            </div>
            {banner.six.length + banner.five.length > 0 && (
              <div className="account-pulls-ops">
                {banner.six.map((row, index) => icon(row, `6-${index}`, 44))}
                {banner.five.map((row, index) => icon(row, `5-${index}`, 44))}
              </div>
            )}
          </li>
        ))}
      </ul>

      <h3>Every pull</h3>
      <ol className="account-pulls-sessions">
        {view.sessions.slice(0, shown).map((session) => (
          <li key={`${session.at}|${session.pool}`} className="account-pulls-session">
            <div className="account-pulls-session-head">
              <LocalTime iso={new Date(session.at * 1000).toISOString()} />
              <span className="account-pulls-banner-meta">{bannerName(session.pool)}{session.rows.length > 1 ? ` · ×${session.rows.length}` : ''}</span>
            </div>
            <div className="account-pulls-ops">
              {session.rows.map((row, index) => icon(row, index, 36))}
            </div>
          </li>
        ))}
      </ol>
      <LoadOnScroll shown={shown} total={view.sessions.length} onMore={() => setShown((count) => count + SESSIONS_PAGE)} />
      <p className="hint">
        Yostar keeps 90 days of pulls, none before 11 Dec 2025. Each import adds what is new to what this browser has kept,
        {history.readAt ? ` last on ${DAY.format(new Date(history.readAt))}` : ''}, so the history here grows past that.
      </p>
    </>
  );
}
