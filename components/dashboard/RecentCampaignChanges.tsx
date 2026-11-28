import { useEffect, useState } from 'react';
import type { RecentCampaignChange } from '@/lib/dashboard/campaignStore';
import type { SponsorCampaign } from '@/lib/sponsors/campaigns';
import { campaignLabel } from './CampaignEditor';
import { useDashboardRequest } from './DashboardRequest';
import styles from './CampaignEditor.module.css';

export default function RecentCampaignChanges({ base, historyPath = '/dashboard/campaigns' }: { base?: SponsorCampaign[]; historyPath?: string }) {
  const fetch = useDashboardRequest();
  const [rows, setRows] = useState<RecentCampaignChange[]>([]);
  const [request, setRequest] = useState(0);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch('/api/dashboard/campaigns?view=recent', { signal: controller.signal });
        if (!response.ok) throw Error();
        const result: RecentCampaignChange[] = await response.json();
        if (!controller.signal.aborted) { setRows(result); setStatus('ready'); }
      } catch {
        if (!controller.signal.aborted) setStatus('error');
      }
    }
    void load();
    return () => controller.abort();
  }, [request, fetch]);

  return <main className={styles.workspace}><section className={'panel ' + styles.dashboardSection}>
    <div className={styles.maintenanceBar}>
      <h2 className="section-title">Latest save per campaign</h2>
      <button className="btn-sm" type="button" disabled={status === 'loading'}
        onClick={() => { setStatus('loading'); setRequest(n => n + 1); }}>Refresh</button>
    </div>
    {status === 'loading' && <p role="status">Loading recent changes…</p>}
    {status === 'error' && <p role="alert">Could not load recent changes. Use Refresh to try again.</p>}
    {status === 'ready' && !rows.length && <p>No campaign edits yet.</p>}
    <ul className={styles.pageList}>{rows.map(row => {
      const source = base?.find(campaign => campaign.id === row.id);
      const change = row.cleared ? (source ? 'Reverted to published campaign' : base ? 'Campaign removed' : 'Campaign override cleared')
        : row.changes.join(', ') || (row.revision === 1 ? 'First admin save' : 'Campaign saved');
      return <li key={row.id} className={styles.changeRow}>
        <div><div className="reading-copy"><a href={historyPath + '?history=' + encodeURIComponent(row.id)}>
          {campaignLabel(row.sponsor ? row : source ?? row)}</a></div><div>{change}</div></div>
        <div>{row.actor}<div className="sub"><time dateTime={row.updatedAt}>{new Date(row.updatedAt).toLocaleString()}</time> · v{row.revision}</div></div>
      </li>;
    })}</ul>
  </section></main>;
}
