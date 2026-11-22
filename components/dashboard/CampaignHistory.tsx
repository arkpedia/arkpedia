import { useEffect, useState } from 'react';
import StyledSelect from '@/components/ui/StyledSelect';
import type { CampaignHistoryPage, CampaignRevision } from '@/lib/dashboard/campaignStore';
import type { SponsorCampaign } from '@/lib/sponsors/campaigns';
import ArtworkPreview from './ArtworkPreview';
import styles from './CampaignEditor.module.css';

export default function CampaignHistory({ campaignId, source, currentRevision, disabled, restore }: {
  campaignId: string; source?: SponsorCampaign; currentRevision: number; disabled?: boolean;
  restore?: (campaign: SponsorCampaign, label: string) => void;
}) {
  const [versions, setVersions] = useState<CampaignRevision[]>([]);
  const [selected, select] = useState('');
  const [nextBefore, setNextBefore] = useState<number | null>(null);
  const [request, setRequest] = useState<{ before?: number }>({});
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    const { before } = request;
    const params = new URLSearchParams({ history: campaignId });
    if (before) params.set('before', String(before));
    async function load() {
      try {
        const response = await fetch(`/api/dashboard/campaigns?${params}`, { signal: controller.signal });
        if (!response.ok) throw Error('History unavailable');
        const page: CampaignHistoryPage = await response.json();
        if (controller.signal.aborted) return;
        setVersions(previous => before ? [...previous, ...page.versions] : page.versions);
        setNextBefore(page.nextBefore);
        select(page.versions[0] ? String(page.versions[0].revision) : 'published');
      } catch {
        if (!controller.signal.aborted) setError('Could not load campaign history.');
      } finally { if (!controller.signal.aborted) setBusy(false); }
    }
    void load();
    return () => controller.abort();
  }, [campaignId, request]);

  function loadPage(before?: number) {
    setBusy(true); setError(''); setRequest({ before });
  }
  const version = versions.find(v => String(v.revision) === selected);
  const published = selected === 'published';
  const snapshot = published ? source : version?.campaign;
  const label = published ? 'Published' : 'Version ' + selected;
  const header = snapshot?.placements.includes('header');
  const onlyHome = snapshot?.placements.length === 1 && snapshot.placements[0] === 'home';
  return <div className={styles.fields}>
    <h2 className="section-title">Campaign history</h2>
    {busy && <p role="status">Loading history…</p>}
    {error && <p role="alert">{error} <button className="btn-sm" type="button" onClick={() => loadPage(request.before)}>Try again</button></p>}
    {!busy && !error && !versions.length && <p>No admin saves recorded for this campaign.</p>}
    {(versions.length > 0 || source) && <div className={styles.toolbar}>
      <label className={styles.picker}>Version<StyledSelect label="Version" value={selected} onChange={select}
        options={[...versions.map(row => ({ value: String(row.revision),
          label: 'v' + row.revision + ' · ' + row.actor + ' · ' + new Date(row.updatedAt).toLocaleString() })),
          ...(source ? [{ value: 'published', label: 'Published artwork' }] : [])]} /></label>
      {nextBefore && <button className="btn-sm" type="button" disabled={busy} onClick={() => loadPage(nextBefore)}>Load older versions</button>}
    </div>}
    {version && <p className="sub">{version.revision === currentRevision ? 'Latest save' : label} · {version.actor} · <time dateTime={version.updatedAt}>{new Date(version.updatedAt).toLocaleString()}</time></p>}
    {!!version?.changes.length && <p>Changed {version.changes.map(change => change.toLowerCase()).join(', ')}.</p>}
    {version && !snapshot && <p>{source ? 'This save switched back to the published campaign.' : 'This save removed the campaign.'}</p>}
    {snapshot && <><div className={styles.historyPreviews}>
      {snapshot.placements.includes('home') && snapshot.mainArtwork !== undefined && <div><h3 className="section-title">Main artwork</h3>
        {snapshot.mainArtwork ? <ArtworkPreview art={snapshot.mainArtwork} /> : <p className="sub">Awaiting main artwork</p>}</div>}
      {(!onlyHome || snapshot.mainArtwork === undefined) && <div><h3 className="section-title">{onlyHome ? 'Main artwork' : 'Page artwork'}</h3><ArtworkPreview art={snapshot} shape={header ? 'header' : undefined} /></div>}
      {header && <div><h3 className="section-title">Mobile menu artwork</h3>
        <ArtworkPreview art={snapshot.mobileArtwork ?? snapshot} shape="menu" />
        {!snapshot.mobileArtwork && <p className="sub">Uses page artwork</p>}</div>}
    </div>{restore && <div><button className="btn-sm" type="button" disabled={disabled} onClick={() => restore(snapshot, label)}>Restore artwork</button></div>}</>}
  </div>;
}
