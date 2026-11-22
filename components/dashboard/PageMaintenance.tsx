import { useEffect, useState } from 'react';
import { PAGE_NAMES, type MaintenanceStatus, type RefreshPage } from '@/lib/dashboard/refreshPages';
import styles from './CampaignEditor.module.css';

async function readStatus(signal?: AbortSignal): Promise<MaintenanceStatus> {
  const response = await fetch('/api/dashboard/maintenance', { cache: 'no-store', signal });
  if (!response.ok) throw new Error('Page status is unavailable. Try checking again.');
  return response.json();
}

export default function PageMaintenance() {
  const [data, setData] = useState<MaintenanceStatus>();
  const [busy, setBusy] = useState<RefreshPage | 'check' | null>('check');
  const [message, setMessage] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    readStatus(controller.signal).then(result => {
      if (!controller.signal.aborted) setData(result);
    }).catch(() => {
      if (!controller.signal.aborted) setMessage('Page status is unavailable. Try checking again.');
    }).finally(() => { if (!controller.signal.aborted) setBusy(null); });
    return () => controller.abort();
  }, []);

  async function check(route?: RefreshPage) {
    setBusy(route ?? 'check');
    setMessage('');
    let refreshMessage = '';
    try {
      if (route) {
        const response = await fetch('/api/dashboard/maintenance', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'refresh', route }),
        });
        if (!response.ok) throw new Error('Could not refresh ' + PAGE_NAMES[route] + '. Check its status and try again.');
        const result = await response.json();
        refreshMessage = result.warning ?? PAGE_NAMES[route] + ' refreshed.';
      }
      setData(await readStatus());
      setMessage(refreshMessage || 'Page versions checked.');
    } catch (error) {
      setMessage([refreshMessage, error instanceof Error ? error.message : 'Could not check page status.'].filter(Boolean).join(' '));
    } finally { setBusy(null); }
  }

  return <main className={styles.workspace}><section className={'panel ' + styles.dashboardSection}>
    <div className={styles.maintenanceBar}>
      <h2 className="section-title">Public pages</h2>
      <button type="button" className="btn btn-sm" disabled={!!busy} onClick={() => void check()}>Check versions</button>
    </div>
    <p className="sub">{data ? <>Published version <code title={data.published ?? undefined}>{data.published?.slice(0, 12) ?? 'unavailable'}</code>
      {' · Checked ' }<time dateTime={data.checkedAt}>{new Date(data.checkedAt).toLocaleTimeString()}</time></> : busy ? 'Checking the public pages…' : null}</p>
    {data && <ul className={styles.pageList}>{data.pages.map(({ route, href, served, lastRefresh }) => {
      const status = !served ? 'Version unavailable' : !data.published ? 'Comparison unavailable'
        : served === data.published ? 'Current' : 'Different version';
      return <li key={route} className={styles.pageRow}>
        <div className="reading-copy"><a href={href} target="_blank" rel="noopener noreferrer">{PAGE_NAMES[route]} <span aria-hidden="true">↗</span></a></div>
        <div>{status}{served && <small className="sub"> <code title={served}>{served.slice(0, 12)}</code></small>}</div>
        <div><small className="sub">Last admin refresh</small><br />
          {lastRefresh ? <time dateTime={lastRefresh}>{new Date(lastRefresh).toLocaleString()}</time>
            : data.historyAvailable ? 'None recorded' : 'Unavailable'}</div>
        <button className="btn btn-sm" type="button" aria-label={'Refresh ' + PAGE_NAMES[route]}
          disabled={!!busy} onClick={() => void check(route)}>{busy === route ? 'Refreshing…' : 'Refresh'}</button>
      </li>;
    })}</ul>}
    <p role="status">{message}</p>
  </section></main>;
}
