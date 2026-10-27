import { useId, useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import Image from '@/components/content/ContentImage';
import LoadOnScroll from '@/components/ui/LoadOnScroll';
import LocalTime from '@/components/ui/LocalTime';
import type { AccountRecord } from '@/lib/account/accountStore';
import { bannerPulls, pullSessions, rarityCounts, type PullRecord } from '@/lib/account/pulls';
import { pullHistoryCsv, pullHistoryCsvFilename, pullLabels } from '@/lib/account/pullHistoryCsv';
import { downloadBlob } from '@/lib/ui/downloadBlob';
import type { GameAccountMap } from '@/lib/planner/gameAccount';
import { getOperatorIconPath, OPERATOR_PORTRAIT_PLACEHOLDER } from '@/lib/operators/operatorIcon';
import { operatorHref } from '@/lib/operators/operatorHref';
import { archiveFromAccount, archiveKey, archiveStatus, mergePullArchives, unionPullHistory } from '@/lib/account/pullArchive';
import { usePullArchives } from '@/lib/account/pullArchiveStore';
import { useCloudSync } from '@/lib/cloud-account/SyncProvider';
import InfoPopover from '@/components/ui/InfoPopover';
import StyledSelect from '@/components/ui/StyledSelect';
import styles from './CloudAccountPanel.module.css';

/*
 * The Account page's Pull History: what the imports have kept of the reader's headhunting
 * (lib/account/pulls.ts). The totals, each banner with the six- and five-stars it gave, and every
 * press newest first when Every pull is opened, growing as the reader scrolls, and Export CSV for the reader's own charts
 * (lib/account/pullHistoryCsv.ts). Names and rarities come from pullLabels, which the CSV reads
 * too, so the two always agree.
 */

const DAY = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const day = (seconds: number) => DAY.format(new Date(seconds * 1000));
const percent = (part: number, total: number) => (total ? `${((part / total) * 100).toFixed(1)}%` : '0%');
const SESSIONS_PAGE = 20;

export default function PullHistory({ account, map }: { account: AccountRecord | null; map: GameAccountMap }) {
  const saved = usePullArchives(), sync = useCloudSync();
  const archives = mergePullArchives(saved, archiveFromAccount(account));
  const [selected, setSelected] = useState('');
  const current = account ? `${account.server}:${account.profile?.uid || 'unknown'}` : '';
  const archive = archives.find(entry => archiveKey(entry) === (selected || current)) ?? (!account ? archives[0] : undefined);
  const remote = sync.remote?.archives?.find(entry => archive && archiveKey(entry) === archiveKey(archive));
  const cloudCount = remote?.history.rows.length ?? 0;
  const status = archive ? archiveStatus(archive) : null;
  const storageLabel = !sync.remote?.historySync ? 'Browser only'
    : sync.status === 'error' ? 'Cloud saving needs attention'
      : sync.remote.paused ? 'Cloud saving paused' : 'Cloud saving on';
  const history = archive ? (account?.pulls && archiveKey(archive) === current ? unionPullHistory(archive.history, account.pulls) : archive.history) : account?.pulls;
  const shown: AccountRecord | null = archive ? { version: 1, server: archive.server, doctor: archive.doctor, importedAt: archive.history.readAt ?? '', operators: [], skins: [], cleared: [], pulls: history } : account;
  return <>
    <div className={styles.archiveSummary}>
      {archives.length > 1 && <StyledSelect label="Pull archive account" value={archive ? archiveKey(archive) : ''} onChange={setSelected}
        options={archives.map(entry => ({ value: archiveKey(entry), label: `${entry.doctor ?? 'Doctor'} · ${entry.server.toUpperCase()} · ${entry.uid === 'unknown' ? 'legacy import (UID unavailable)' : `UID ${entry.uid}`}` }))} />}
      {archive && status && <>
        <p role="status">{status.count.toLocaleString('en-US')} {status.count === 1 ? 'pull' : 'pulls'} archived{status.oldest ? ` · oldest ${day(status.oldest)}` : ''} · <span className="account-pulls-storage">{storageLabel}.
        <InfoPopover label="Pull archive details"><p>{status.readAt ? `Last imported ${DAY.format(new Date(status.readAt))}.` : 'History has not been imported yet.'} {sync.remote?.historySync
          ? `${cloudCount.toLocaleString('en-US')} ${cloudCount === 1 ? 'pull' : 'pulls'} saved to cloud${sync.remote.paused ? ' · cloud saving paused' : ''}.`
          : 'Cloud pull-history saving is off. This archive is stored in this browser.'}</p>
        {remote?.savedAt && <p>Last saved to cloud <LocalTime iso={remote.savedAt} precision="minute" />.</p>}
        <p>Import regularly before Yostar’s 90-day window expires. Arkpedia keeps older archived pulls; it cannot recover pulls that expired before they were imported.</p></InfoPopover></span></p>
      </>}
    </div>
    <PullHistoryDetails key={archive ? archiveKey(archive) : account?.server ?? 'empty'} account={shown} map={map} />
  </>;
}

function PullHistoryDetails({ account, map }: { account: AccountRecord | null; map: GameAccountMap }) {
  const history = account?.pulls;
  const [open, setOpen] = useState(false);
  const listId = useId();
  const view = useMemo(() => {
    if (!history?.rows.length) return null;
    const labels = pullLabels(history, map);
    return { ...labels, counts: rarityCounts(history.rows, labels.rarity), banners: bannerPulls(history.rows, labels.rarity) };
  }, [history, map]);

  if (!account) return <p className="hint">No account imported yet: use Import / export above, and the pulls Yostar keeps come with it.</p>;
  if (!history) return <p className="hint">Import again to add your pull history: this account was imported before Arkpedia read it.</p>;
  const note = history.error ? <p className="hint">The last import could not read your pull history ({history.error}).{history.rows.length ? ' What earlier imports kept is below.' : ''}</p> : null;
  if (!view) return <>{note ?? <p className="hint">No pulls in the last 90 days.</p>}</>;

  const { bannerName } = view;
  const operator = (row: PullRecord) => ({ name: view.operatorName(row), rarity: view.rarity(row), known: !!map.chars[row.char] });
  /* The whole history, one row per pull, as a spreadsheet's columns. The day in its name is read
     here, in the click, never during a render. */
  const exportCsv = () => downloadBlob(new Blob([pullHistoryCsv(history, map)], { type: 'text/csv;charset=utf-8' }), pullHistoryCsvFilename());
  const icon = (row: PullRecord, key: string | number, size: number) => {
    const op = operator(row);
    const picture = <Image src={op.known ? getOperatorIconPath(op) : OPERATOR_PORTRAIT_PLACEHOLDER} alt={op.name} title={op.name} width={size} height={size} />;
    return op.known
      ? <Link key={key} prefetch={false} href={operatorHref(op.name, null)} className="account-pulls-op rarity-frame" data-rarity={op.rarity}>{picture}</Link>
      : <span key={key} className="account-pulls-op rarity-frame" data-rarity={op.rarity}>{picture}</span>;
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
          <li key={banner.pool} className="account-pulls-banner panel">
            <div className="account-pulls-banner-head">
              <span className="account-pulls-banner-name">{bannerName(banner.pool)}</span>
              <span className="account-pulls-banner-meta">
                {banner.pulls.toLocaleString('en-US')} {banner.pulls === 1 ? 'pull' : 'pulls'}
                {' · '}{banner.six.length ? `${banner.sinceSix} since the last 6★` : 'no 6★ yet'}
                {' · '}{day(banner.first) === day(banner.last) ? day(banner.last) : `${day(banner.first)} – ${day(banner.last)}`}
              </span>
              <button type="button" className="ghost btn-sm" aria-label={`Export ${bannerName(banner.pool)} CSV`} onClick={() => downloadBlob(new Blob([pullHistoryCsv({ ...history, rows: history.rows.filter(row => row.pool === banner.pool) }, map)], { type: 'text/csv;charset=utf-8' }), `arkpedia-pulls-${banner.pool.replace(/[^a-z0-9_-]/gi, '_')}.csv`)}>Export CSV</button>
            </div>
            {banner.six.length + banner.five.length > 0 && (
              <div className="account-pulls-ops">
                {banner.six.map((row, index) => icon(row, `6-${index}`, 64))}
                {banner.five.map((row, index) => icon(row, `5-${index}`, 64))}
              </div>
            )}
          </li>
        ))}
      </ul>

      <div className="account-pulls-list-head">
        <h3><button type="button" className="ghost btn-sm" aria-expanded={open} aria-controls={listId} onClick={() => setOpen(!open)}><span aria-hidden="true">{open ? '▾' : '▸'}</span> Every pull</button></h3>
        <button type="button" className="ghost btn-sm" onClick={exportCsv} title="One row per pull, for a spreadsheet or a chart">Export CSV</button>
      </div>
      <div id={listId}>
        {open && <PullSessions rows={history.rows} bannerName={bannerName} icon={icon} />}
      </div>
      <p className="hint">
        Pulls sharing a timestamp are grouped as one batch. Their original order within that batch may be unavailable.
      </p>
    </>
  );
}

/** Group and mount individual pulls only on request; retire the rows and observer on close. */
function PullSessions({ rows, bannerName, icon }: {
  rows: PullRecord[];
  bannerName: (pool: string) => string;
  icon: (row: PullRecord, key: string | number, size: number) => ReactNode;
}) {
  const sessions = useMemo(() => pullSessions(rows), [rows]);
  const [shown, setShown] = useState(SESSIONS_PAGE);
  return <>
      <ol className="account-pulls-sessions">
        {sessions.slice(0, shown).map((session) => (
          <li key={`${session.at}|${session.pool}`} className="account-pulls-session panel">
            <div className="account-pulls-session-head">
              <LocalTime iso={new Date(session.at * 1000).toISOString()} precision="minute" />
              <span className="account-pulls-banner-meta">{bannerName(session.pool)}{session.rows.length > 1 ? ` · ×${session.rows.length}` : ''}</span>
            </div>
            <div className="account-pulls-ops">
              {session.rows.map((row, index) => icon(row, index, 64))}
            </div>
          </li>
        ))}
      </ol>
      <LoadOnScroll shown={shown} total={sessions.length} onMore={() => setShown((count) => count + SESSIONS_PAGE)} />
  </>;
}
