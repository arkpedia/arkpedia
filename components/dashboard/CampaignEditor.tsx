import { useState, type FormEvent } from 'react';
import type { CampaignEdit } from '@/lib/dashboard/campaignStore';
import { samePlacements, type CampaignEvent } from '@/lib/sponsors/campaignSchedule';
import { SPONSOR_PLACEMENTS, type SponsorArtwork, type SponsorCampaign } from '@/lib/sponsors/campaigns';
import StyledSelect from '@/components/ui/StyledSelect';
import { ContentImg } from '@/components/content/ContentImage';
import { loadAssetImage } from '@/lib/assets/assetRetry';
import styles from './CampaignEditor.module.css';

export interface Catalog { base: SponsorCampaign[]; edits: CampaignEdit[]; events: CampaignEvent[]; groups: Record<string, string> }
const blankArt: SponsorArtwork = { image: '', width: 0, height: 0, alt: '' };
const blank: SponsorCampaign = { ...blankArt, id: '', sponsor: '', status: 'draft', url: '', placements: ['header'], startAt: null, endAt: null };
function campaignLabel(c: SponsorCampaign) {
  return c.id.split('-').map(word => word.toLowerCase() === c.sponsor.toLowerCase() ? c.sponsor : word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
}

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

function ArtworkField({ title, art, fallback, shape, change, upload, clear }: {
  title: string; art: SponsorArtwork; fallback?: SponsorArtwork; shape?: 'header' | 'menu'; change: (alt: string) => void;
  upload: (file: File) => Promise<void>; clear?: () => void;
}) {
  const preview = art.image ? art : fallback;
  return <fieldset className={styles.artwork}><legend>{title}</legend>
    {preview?.image && <ContentImg className={shape === 'header' ? styles.headerPreview : shape === 'menu' ? styles.menuPreview : styles.preview}
      src={preview.image} width={preview.width} height={preview.height} alt={preview.alt}
      style={shape === 'menu' ? { width: Math.min(preview.width, 60 * preview.width / preview.height) } : undefined} />}
    {!art.image && fallback?.image && <small>Using page artwork</small>}
    <label>Image (600 KiB max)<input type="file" accept="image/png,image/jpeg,image/webp"
      onChange={e => { const file = e.target.files?.[0]; if (file) void upload(file); }} /></label>
    {art.image && <label>Image description<input type="text" required value={art.alt} onChange={e => change(e.target.value)} /></label>}
    {clear && art.image && <button className="btn btn-sm" type="button" onClick={clear}>Use page artwork on mobile</button>}
  </fieldset>;
}

export default function CampaignEditor({ initial }: { initial: Catalog }) {
  const [catalog, setCatalog] = useState(initial);
  const [selected, select] = useState(initial.base[0]?.id ?? '');
  const [draft, setDraft] = useState<SponsorCampaign>(blank);
  const [draftKey, setDraftKey] = useState(0);
  const ids = [...new Set([...catalog.base.map(c => c.id), ...catalog.edits.filter(e => e.campaign).map(e => e.id)])];
  const records = ids.map(id => catalog.edits.find(e => e.id === id)?.campaign ?? catalog.base.find(c => c.id === id)!);
  const source = catalog.base.find(c => c.id === selected);
  const edit = catalog.edits.find(e => e.id === selected);
  const [message, setMessage] = useState('');
  function startDraft(copy?: SponsorCampaign) {
    let id = '';
    if (copy) {
      const prefix = copy.id.slice(0, 85) + '-next';
      id = prefix;
      let suffix = 2;
      while (ids.includes(id) || catalog.edits.some(e => e.id === id)) id = prefix + '-' + suffix++;
    }
    setDraft(copy ? { ...copy, id, status: 'draft', startAt: null, endAt: null, eventActivityId: undefined, replacesCampaignId: copy.status === 'active' ? copy.id : copy.replacesCampaignId } : blank);
    setDraftKey(n => n + 1);
    select('');
    setMessage('');
  }
  return <main className={styles.workspace}>
    <div className={styles.toolbar}>
      <label className={styles.picker}>Campaign<StyledSelect label="Campaign" value={selected}
        onChange={id => { select(id); setMessage(''); }} options={[...(!selected ? [{ value: '', label: 'New draft' }] : []),
          ...records.map(c => ({ value: c.id, label: campaignLabel(c), group: catalog.groups[c.id] }))]} /></label>
      <button type="button" className="btn-sm" onClick={() => startDraft()}>New draft</button>
      <button type="button" className="ghost" disabled={!selected} onClick={() => startDraft(edit?.campaign ?? source)}>Duplicate</button>
    </div>
    <CampaignForm key={selected + '-' + (edit?.revision ?? 0) + '-' + draftKey} source={source} edit={edit} selected={selected}
      draft={draft} events={catalog.events} records={records}
      onSave={(next, id) => { setCatalog(next); if (id) select(id); else startDraft(); setMessage(id && next.groups[id] === 'Drafts' ? 'Draft saved.' : 'Saved. Open pages refresh campaigns within about two minutes.'); }} />
    <p role="status">{message}</p>
  </main>;
}

function CampaignForm({ source, edit, selected, draft, events, records, onSave }: {
  source?: SponsorCampaign; edit?: CampaignEdit; selected: string;
  draft: SponsorCampaign; events: CampaignEvent[]; records: SponsorCampaign[];
  onSave: (next: Catalog, id: string) => void;
}) {
  const [c, set] = useState<SponsorCampaign>(edit?.campaign ?? source ?? draft);
  const [timing, setTiming] = useState(c.eventActivityId || !selected ? 'event'
    : (edit?.campaign ? edit.followsRelease : !!source) ? 'published' : 'fixed');
  const event = events.find(e => e.id === c.eventActivityId);
  const previous = records.find(r => r.id === c.replacesCampaignId && r.id !== c.id && r.status === 'active' && samePlacements(r, c));
  const replacements = records.filter(r => r.id !== c.id && r.status === 'active' && samePlacements(r, c));
  const eventOptions = events.map(e => ({ value: e.id, label: e.name }));
  if (c.eventActivityId && !event) eventOptions.push({ value: c.eventActivityId, label: c.eventActivityId });
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

  async function save(reset = false, status = c.status) {
    setBusy(true); setError('');
    try {
      const image = desktop ? '' : c.image;
      const mobileArtwork = c.placements.includes('header') ? c.mobileArtwork : undefined;
      const campaign = { ...c, status, image, eventActivityId: timing === 'event' ? c.eventActivityId : undefined,
        replacesCampaignId: timing === 'event' ? previous?.id : undefined,
        mobileArtwork: mobileArtwork && { ...mobileArtwork, image: mobile ? '' : mobileArtwork.image },
        ...(timing !== 'fixed' && { startAt: null, endAt: null }) };
      const response = await fetch('/api/dashboard/campaigns', { method: 'POST',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: c.id, revision: edit?.revision ?? 0,
          campaign: reset ? null : campaign, creating: !selected, followsRelease: timing === 'published', desktopUpload: desktop, mobileUpload: mobile }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Save failed.');
      onSave(result, reset && !source ? '' : c.id);
    } catch (err) { setError(err instanceof Error ? err.message : 'Save failed.'); }
    finally { setBusy(false); }
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    const button = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    void save(false, button?.value === 'schedule' ? 'active' : c.status);
  }
  const incomplete = !c.image || !c.placements.length || (timing === 'event' && !c.eventActivityId);
  return <form onSubmit={submit}><fieldset disabled={busy} className={styles.form}>
    <div className={styles.fields}>
      <h2 className="section-title">{selected ? campaignLabel(c) : 'New draft'}</h2>
      <label>Timing<StyledSelect label="Timing" value={timing} onChange={setTiming} options={[
        { value: 'event', label: 'Follow a Global event' }, { value: 'fixed', label: 'Set dates or run continuously' },
        ...(source ? [{ value: 'published', label: 'Follow published campaign schedule' }] : []),
      ]} /></label>
      {timing === 'event' && <>
        <label>Global event<StyledSelect label="Global event" value={c.eventActivityId ?? ''} placeholder="Choose an event"
          onChange={id => patch({ eventActivityId: id })} options={eventOptions} /></label>
        <label>At event opening<StyledSelect label="At event opening" value={previous?.id ?? ''}
          onChange={id => patch({ replacesCampaignId: id || undefined })}
          options={[{ value: '', label: 'Keep other campaigns' }, ...replacements.map(r => ({ value: r.id, label: 'Replace ' + campaignLabel(r) }))]} /></label>
        {!events.length && <p role="status">Global events are unavailable. Reload to try again or choose fixed dates.</p>}
        {c.eventActivityId && <p className="notice">
          {event?.startAt ? 'Confirmed Global opening · ' + new Date(event.startAt).toUTCString() : 'Waiting for confirmed Global dates.'}
          {previous && ' ' + campaignLabel(previous) + ' runs until the handoff.'}
          {c.status === 'draft' && ' Choose Schedule campaign when ready.'}
        </p>}
      </>}
      {timing === 'fixed' && (['startAt','endAt'] as const).map(key => <label key={key}>{key === 'startAt' ? 'Starts' : 'Ends'} (optional, with timezone)
        <input type="text" placeholder="2026-12-01T15:00:00Z" value={c[key] ?? ''} onChange={e => patch({ [key]: e.target.value || null })} /></label>)}
    </div>
    <div className={styles.fields}>
      <ArtworkField title="Page artwork" art={c} shape={c.placements.includes('header') ? 'header' : undefined} change={alt => patch({ alt })} upload={f => upload(f, false)} />
      {c.placements.includes('header') && <ArtworkField title="Mobile menu artwork" art={c.mobileArtwork ?? blankArt} fallback={c} shape="menu"
        change={alt => patch({ mobileArtwork: { ...(c.mobileArtwork ?? blankArt), alt } })} upload={f => upload(f, true)}
        clear={() => { patch({ mobileArtwork: undefined }); setMobile(undefined); }} />}
    </div>
    <details className={styles.details} open={!selected && !draft.sponsor}>
      <summary>Campaign details and placements</summary>
      <div className={styles.detailsGrid}>
      <label>Campaign ID<input type="text" required pattern="[a-z0-9][a-z0-9\-]*" maxLength={100} readOnly={!!selected} value={c.id} onChange={e => patch({ id: e.target.value })} /></label>
      <label>Sponsor or site name<input type="text" required value={c.sponsor} onChange={e => patch({ sponsor: e.target.value })} /></label>
      <label>Destination (HTTPS or Arkpedia path)<input type="text" required value={c.url ?? ''} placeholder="/music/discover" onChange={e => patch({ url: e.target.value })} /></label>
      <label>Status<StyledSelect label="Status" value={c.status} onChange={status => patch({ status: status as SponsorCampaign['status'] })}
        options={[{ value: 'active', label: 'Active' }, { value: 'ended', label: 'Paused' }, { value: 'draft', label: 'Draft' }]} /></label>
      <fieldset className={styles.placements}><legend>Placements</legend>{SPONSOR_PLACEMENTS.map(p => <label key={p} className="check"><input type="checkbox"
        checked={c.placements.includes(p)} onChange={e => patch({ placements: e.target.checked ? [...c.placements, p] : c.placements.filter(x => x !== p) })} />
        {{ header: 'Page and mobile menu', home: 'Homepage', support: 'Support' }[p]}</label>)}</fieldset>
      </div>
    </details>
    <div className={styles.actions}><button className="primary btn-sm" disabled={incomplete}>
      {c.status === 'draft' ? 'Save draft' : c.status === 'active' && timing === 'event' ? 'Schedule campaign' : 'Save campaign'}</button>
      {c.status === 'draft' && timing === 'event' && <button className="btn-sm" type="submit" value="schedule" disabled={incomplete}>Schedule campaign</button>}
      {edit?.campaign && <button className={source ? 'ghost' : 'danger'} type="button" onClick={() => void save(true)}>{source ? 'Restore published version' : 'Remove campaign'}</button>}
      {error && <p role="alert">{error}</p>}</div>
  </fieldset></form>;
}
