import { useEffect, useState, type FormEvent } from 'react';
import { ContentImg } from '@/components/content/ContentImage';
import NumberInput from '@/components/ui/NumberInput';
import { sponsorCampaignsFor, type SponsorCampaign, type SponsorCampaignTable } from '@/lib/sponsors/campaigns';
import { maxTurnSeconds, rotationLabels, rotationSlots, rotationTurns, type RotationPlan, type RotationPlans, type RotationSlot, type RotationTurn } from '@/lib/sponsors/rotation';
import { campaignLabel } from './CampaignEditor';
import { useDashboardRequest } from './DashboardRequest';
import styles from './CampaignEditor.module.css';

interface RotationCatalog { table: SponsorCampaignTable; plans: RotationPlans }
const emptyPlan: RotationPlan = { revision: 0, turns: [] };

function PlacementRotation({ slot, eligible, plan, refresh, saved }: {
  slot: RotationSlot; eligible: SponsorCampaign[]; plan: RotationPlan; refresh: () => void; saved: (plan: RotationPlan) => void;
}) {
  const fetch = useDashboardRequest();
  const [draft, setDraft] = useState<RotationPlan | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const turns = rotationTurns(eligible.map(c => c.id), draft?.turns ?? plan.turns);
  const shown = draft ? turns : turns.filter(t => t.enabled);
  const included = turns.filter(t => t.enabled);
  const label = rotationLabels[slot];
  const conflict = !!draft && draft.revision !== plan.revision;

  function edit(next: RotationTurn[]) {
    // Keep preferences for campaigns outside the current event window in their sequence positions.
    const ids = new Set(next.map(t => t.id));
    const prior = draft ?? plan;
    const pending = [...next];
    const merged = prior.turns.map(turn => ids.has(turn.id) ? pending.shift()! : turn);
    setDraft({ revision: prior.revision, turns: [...merged, ...pending] });
    setMessage(''); setError('');
  }

  function move(index: number, direction: number) {
    const ordered = [...turns];
    ordered.splice(index + direction, 0, ...ordered.splice(index, 1));
    edit(ordered);
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!draft || busy || conflict) return;
    setBusy(true); setMessage(''); setError('');
    try {
      const response = await fetch('/api/dashboard/campaigns', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'rotation', slot, revision: draft.revision, turns: draft.turns }) });
      const result = await response.json();
      if (!response.ok) {
        if (response.status === 409) refresh();
        throw new Error(result.error || 'Could not save the rotation.');
      }
      saved(result); setDraft(null); setMessage('Rotation saved.');
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not confirm the save. Reload to check.'); }
    finally { setBusy(false); }
  }

  return <section className={'panel ' + styles.dashboardSection} aria-label={label + ' rotation'}>
    <div className={styles.guideHeading}>
      <h2 className="section-title">{label}</h2>
      {!draft && <button type="button" className="btn-sm" onClick={() => edit(turns)} disabled={!turns.length}>Edit rotation</button>}
    </div>
    {included.length > 1 && <p className="sub">{included.reduce((total, t) => total + t.seconds, 0)} seconds per loop</p>}
    {included.length === 1 && <p className="sub">One banner · shown continuously</p>}
    {!included.length && <p>No banners in rotation.</p>}
    <form onSubmit={save}>
      <fieldset className={styles.rotationFields} disabled={busy}>
        <ol className={styles.rotationList}>{shown.map((turn, index) => {
          const campaign = eligible.find(c => c.id === turn.id)!;
          const name = campaignLabel(campaign);
          return <li key={turn.id}>
            <ContentImg src={campaign.image} alreadyPinned={campaign.image.startsWith('https://')} alt={campaign.alt} width={campaign.width} height={campaign.height} />
            <div><strong>{name}</strong> {!draft && <span className="sub">· {turn.seconds} s</span>}</div>
            {draft && <div className={styles.rotationControls}>
              <label>Seconds<NumberInput className="number-input" aria-label={name + ' seconds'} value={turn.seconds} min={1} max={maxTurnSeconds} step={1} required
                onChange={e => edit(turns.map(t => t.id === turn.id ? { ...t, seconds: e.target.valueAsNumber } : t))} /></label>
              <button type="button" className="btn-sm" disabled={index === 0} aria-label={'Move ' + name + ' earlier'} onClick={() => move(index, -1)}>↑</button>
              <button type="button" className="btn-sm" disabled={index === turns.length - 1} aria-label={'Move ' + name + ' later'} onClick={() => move(index, 1)}>↓</button>
              <label className="check"><input type="checkbox" checked={turn.enabled} aria-label={'Include ' + name}
                onChange={e => edit(turns.map(t => t.id === turn.id ? { ...t, enabled: e.target.checked } : t))} />Include</label>
            </div>}
          </li>;
        })}</ol>
        {draft && <div className={styles.actions}>
          <button type="submit" className="primary btn-sm" disabled={conflict}>Save rotation</button>
          <button type="button" className="ghost" onClick={() => { setDraft(null); setError(''); refresh(); }}>Discard edits</button>
        </div>}
      </fieldset>
    </form>
    {(error || conflict) && <p role="alert">{conflict ? 'Another editor saved this rotation. Discard edits to load their changes.' : error}</p>}
    {message && <p role="status">{message}</p>}
  </section>;
}

export default function CampaignRotations({ active }: { active: boolean }) {
  const fetch = useDashboardRequest();
  const [catalog, setCatalog] = useState<RotationCatalog | null>(null);
  const [request, setRequest] = useState(0);
  const [error, setError] = useState(false);
  const [now, setNow] = useState(Date.now);
  const refresh = () => setRequest(n => n + 1);
  useEffect(() => {
    if (!active) return;
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch('/api/dashboard/campaigns?view=rotation', { cache: 'no-store', signal: controller.signal });
        if (!response.ok) throw new Error();
        const result: RotationCatalog = await response.json();
        if (!controller.signal.aborted) { setCatalog(result); setNow(Date.now()); setError(false); }
      } catch { if (!controller.signal.aborted) setError(true); }
    }
    void load();
    const timer = window.setTimeout(refresh, 60000);
    window.addEventListener('focus', refresh);
    return () => { controller.abort(); window.clearTimeout(timer); window.removeEventListener('focus', refresh); };
  }, [active, request, fetch]);
  useEffect(() => {
    if (!active || !catalog) return;
    const next = Math.min(...catalog.table.campaigns.flatMap(c => [c.startAt, c.endAt])
      .map(date => date ? Date.parse(date) : NaN).filter(time => time > now));
    if (!Number.isFinite(next)) return;
    const timer = window.setTimeout(() => setNow(Date.now()), Math.min(Math.max(0, next - Date.now()), 2147483647));
    return () => window.clearTimeout(timer);
  }, [active, catalog, now]);
  return <main className={styles.workspace}>
    {error && <p role="alert">Could not refresh the current rotation. <button type="button" className="btn-sm" onClick={refresh}>Retry</button></p>}
    {!catalog && !error && <p role="status">Loading current rotation…</p>}
    {catalog && <div className={styles.rotationGrid}>{rotationSlots.map(slot => <PlacementRotation key={slot} slot={slot}
      eligible={sponsorCampaignsFor({ ...catalog.table, rotations: undefined }, slot, now)}
      plan={catalog.plans[slot] ?? emptyPlan} refresh={refresh} saved={plan => {
        setCatalog(current => current && { ...current, plans: { ...current.plans, [slot]: plan } });
        refresh();
      }} />)}</div>}
  </main>;
}
