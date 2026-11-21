import { useState, type FormEvent } from 'react';
import type { CampaignEdit } from '@/lib/dashboard/campaignStore';
import { SPONSOR_PLACEMENTS, type SponsorArtwork, type SponsorCampaign } from '@/lib/sponsors/campaigns';
import { REFRESH_PAGES } from '@/lib/dashboard/refreshPages';
import StyledSelect from '@/components/ui/StyledSelect';
import { ContentImg } from '@/components/content/ContentImage';
import { loadAssetImage } from '@/lib/assets/assetRetry';
import styles from './CampaignEditor.module.css';

export interface Catalog { base: SponsorCampaign[]; edits: CampaignEdit[] }
const blankArt: SponsorArtwork = { image: '', width: 0, height: 0, alt: '' };
const blank: SponsorCampaign = { ...blankArt, id: '', sponsor: '', status: 'active', url: '', placements: ['header'], startAt: null, endAt: null };
type Upload = { art: SponsorArtwork; encoded: string };

async function readArtwork(file: File): Promise<Upload> {
  if (file.size > 600 * 1024) throw new Error('Choose a PNG, JPEG or WebP image of 600 KiB or less.');
  const data = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Could not read artwork.'));
    reader.readAsDataURL(file);
  });
  const img = await loadAssetImage(data);
  return { art: { image: data, width: img.naturalWidth, height: img.naturalHeight, alt: '' }, encoded: data.slice(data.indexOf(',') + 1) };
}

function ArtworkField({ title, art, change, upload, clear }: {
  title: string; art: SponsorArtwork; change: (alt: string) => void;
  upload: (file: File) => Promise<void>; clear?: () => void;
}) {
  return <fieldset className={styles.fields}><legend>{title}</legend>
    {art.image && <ContentImg className={styles.preview} src={art.image} width={art.width} height={art.height} alt={art.alt} />}
    <label>Image (600 KiB max)<input type="file" accept="image/png,image/jpeg,image/webp"
      onChange={e => { const file = e.target.files?.[0]; if (file) void upload(file); }} /></label>
    {art.image && <label>Image description<input required value={art.alt} onChange={e => change(e.target.value)} /></label>}
    {clear && art.image && <button className="btn btn-sm" type="button" onClick={clear}>Use page artwork on mobile</button>}
  </fieldset>;
}

export default function CampaignEditor({ initial }: { initial: Catalog }) {
  const [catalog, setCatalog] = useState(initial);
  const [selected, select] = useState(initial.base[0]?.id ?? '');
  const ids = [...new Set([...catalog.base.map(c => c.id), ...catalog.edits.map(e => e.id)])];
  const source = catalog.base.find(c => c.id === selected);
  const edit = catalog.edits.find(e => e.id === selected);
  const [message, setMessage] = useState('');
  const [route, setRoute] = useState<string>('/');
  const [checking, setChecking] = useState(false);
  async function refresh() {
    setChecking(true);
    try {
      const response = await fetch('/api/dashboard/campaigns', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'refresh', route }) });
      setMessage(response.ok ? 'Refreshed ' + route : 'Page refresh failed.');
    } catch { setMessage('Page refresh failed.'); }
    finally { setChecking(false); }
  }
  return <main className={styles.workspace}>
    <label className={styles.picker}>Campaign<StyledSelect label="Campaign" value={selected}
      onChange={id => { select(id); setMessage(''); }} options={[{ value: '', label: 'Add campaign…' },
        ...ids.map(id => ({ value: id, label: id }))]} /></label>
    <CampaignForm key={selected + '-' + (edit?.revision ?? 0)} source={source} edit={edit} selected={selected}
      onSave={(next, id) => { setCatalog(next); select(id); setMessage('Saved. Open pages refresh campaigns within about two minutes.'); }} />
    <p role="status">{message}</p>
    <section><h2 className="section-title">Page maintenance</h2>
      <div className={styles.actions}><label>Page <StyledSelect label="Page to refresh" value={route} onChange={setRoute} options={REFRESH_PAGES.map(path => ({ value: path, label: path }))} /></label>
        <button className="btn btn-sm" disabled={checking} onClick={() => void refresh()}>Refresh cached page</button>
      </div></section>
  </main>;
}

function CampaignForm({ source, edit, selected, onSave }: {
  source?: SponsorCampaign; edit?: CampaignEdit; selected: string;
  onSave: (next: Catalog, id: string) => void;
}) {
  const [c, set] = useState<SponsorCampaign>(edit?.campaign ?? source ?? { ...blank, id: selected });
  const [follow, setFollow] = useState(edit?.campaign ? edit.followsRelease : !!source);
  const [desktop, setDesktop] = useState<string>();
  const [mobile, setMobile] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const patch = (fields: Partial<SponsorCampaign>) => set(old => ({ ...old, ...fields }));

  async function upload(file: File, isMobile: boolean) {
    setBusy(true); setError('');
    try {
      const { art, encoded } = await readArtwork(file);
      if (isMobile) { patch({ mobileArtwork: { ...art, alt: c.mobileArtwork?.alt ?? c.alt } }); setMobile(encoded); }
      else { patch({ ...art, alt: c.alt }); setDesktop(encoded); }
    } catch { setError('Choose a readable PNG, JPEG or WebP image of 600 KiB or less.'); }
    finally { setBusy(false); }
  }

  async function save(reset = false) {
    setBusy(true); setError('');
    try {
      const image = desktop ? '' : c.image;
      const mobileArtwork = c.placements.includes('header') ? c.mobileArtwork : undefined;
      const campaign = { ...c, image, eventActivityId: undefined,
        mobileArtwork: mobileArtwork && { ...mobileArtwork, image: mobile ? '' : mobileArtwork.image },
        ...(follow && { startAt: null, endAt: null }) };
      const response = await fetch('/api/dashboard/campaigns', { method: 'POST',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: c.id, revision: edit?.revision ?? 0,
          campaign: reset ? null : campaign, followsRelease: follow, desktopUpload: desktop, mobileUpload: mobile }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Save failed.');
      onSave(result, reset && !source ? '' : c.id);
    } catch (err) { setError(err instanceof Error ? err.message : 'Save failed.'); }
    finally { setBusy(false); }
  }

  function submit(e: FormEvent) { e.preventDefault(); void save(); }
  return <form onSubmit={submit}><fieldset disabled={busy} className={styles.form}>
    <div className={styles.fields}>
      <label>Campaign ID<input required pattern="[a-z0-9][a-z0-9-]*" maxLength={100} readOnly={!!selected} value={c.id} onChange={e => patch({ id: e.target.value })} /></label>
      <label>Sponsor or site name<input required value={c.sponsor} onChange={e => patch({ sponsor: e.target.value })} /></label>
      <label>Destination (HTTPS or Arkpedia path)<input required value={c.url ?? ''} placeholder="/music/discover" onChange={e => patch({ url: e.target.value })} /></label>
      <label>Status<StyledSelect label="Status" value={c.status} onChange={status => patch({ status: status as SponsorCampaign['status'] })}
        options={[{ value: 'active', label: 'Active' }, { value: 'ended', label: 'Paused' }, { value: 'draft', label: 'Draft' }]} /></label>
      <fieldset><legend>Placements</legend>{SPONSOR_PLACEMENTS.map(p => <label key={p} className="check"><input type="checkbox"
        checked={c.placements.includes(p)} onChange={e => patch({ placements: e.target.checked ? [...c.placements, p] : c.placements.filter(x => x !== p) })} />
        {{ header: 'Page and mobile menu', home: 'Homepage', support: 'Support' }[p]}</label>)}</fieldset>
      {source && <label className="check"><input type="checkbox" checked={follow} onChange={e => setFollow(e.target.checked)} />Follow published schedule</label>}
      {!follow && (['startAt','endAt'] as const).map(key => <label key={key}>{key === 'startAt' ? 'Starts' : 'Ends'} (optional, with timezone)
        <input placeholder="2026-12-01T15:00:00Z" value={c[key] ?? ''} onChange={e => patch({ [key]: e.target.value || null })} /></label>)}
    </div>
    <div className={styles.fields}>
      <ArtworkField title="Page artwork" art={c} change={alt => patch({ alt })} upload={f => upload(f, false)} />
      {c.placements.includes('header') && <ArtworkField title="Mobile menu artwork" art={c.mobileArtwork ?? blankArt}
        change={alt => patch({ mobileArtwork: { ...(c.mobileArtwork ?? blankArt), alt } })} upload={f => upload(f, true)}
        clear={() => { patch({ mobileArtwork: undefined }); setMobile(undefined); }} />}
    </div>
    <div className={styles.actions}><button className="btn" disabled={!c.image || !c.placements.length}>Save campaign</button>
      {edit?.campaign && <button className="btn" type="button" onClick={() => void save(true)}>{source ? 'Restore published version' : 'Remove campaign'}</button>}
      {error && <p role="alert">{error}</p>}</div>
  </fieldset></form>;
}
