import { useRef, useState, type FormEvent } from 'react';
import { ContentContext } from '@/lib/content/context';
import type { ContentRelease } from '@/lib/content/types';
import type { CampaignEdit } from '@/lib/dashboard/campaignStore';
import { samePlacements, type CampaignEvent } from '@/lib/sponsors/campaignSchedule';
import { SPONSOR_PLACEMENTS, type SponsorArtwork, type SponsorCampaign } from '@/lib/sponsors/campaigns';
import CampaignHistory from './CampaignHistory';
import ArtworkPreview from './ArtworkPreview';
import StyledSelect from '@/components/ui/StyledSelect';
import { loadAssetImage } from '@/lib/assets/assetRetry';
import styles from './CampaignEditor.module.css';

export interface Catalog { release?: ContentRelease | null; base: SponsorCampaign[]; edits: CampaignEdit[]; events: CampaignEvent[]; groups: Record<string, string> }
const blankArt: SponsorArtwork = { image: '', width: 0, height: 0, alt: '' };
const blank: SponsorCampaign = { ...blankArt, id: '', sponsor: '', status: 'draft', url: '', placements: [...SPONSOR_PLACEMENTS], mainArtwork: null, startAt: null, endAt: null };
export function campaignLabel(c: Pick<SponsorCampaign, 'id' | 'sponsor'>) {
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

function ArtworkField({ title, art, fallback, shape, change, upload, clear, clearLabel, empty }: {
  title: string; art: SponsorArtwork; fallback?: SponsorArtwork; shape?: 'header' | 'menu'; change: (alt: string) => void;
  upload: (file: File) => Promise<void>; clear?: () => void; clearLabel?: string; empty?: string;
}) {
  const preview = art.image ? art : fallback;
  return <fieldset className={styles.artwork}><legend>{title}</legend>
    {preview?.image && <ArtworkPreview art={preview} shape={shape} />}
    {!preview?.image && empty && <p className="sub">{empty}</p>}
    {!art.image && fallback?.image && <small>Using page artwork</small>}
    <label>Image (600 KiB max)<input type="file" accept="image/png,image/jpeg,image/webp"
      onChange={e => { const file = e.target.files?.[0]; if (file) void upload(file); }} /></label>
    {art.image && <label>Image description<input type="text" required value={art.alt} onChange={e => change(e.target.value)} /></label>}
    {clear && art.image && <button className="btn btn-sm" type="button" onClick={clear}>{clearLabel ?? 'Use page artwork on mobile'}</button>}
  </fieldset>;
}

export default function CampaignEditor({ initial, historyId }: { initial: Catalog; historyId?: string }) {
  const [catalog, setCatalog] = useState(initial);
  const [selected, select] = useState(historyId ?? initial.base[0]?.id ?? '');
  const [draft, setDraft] = useState<SponsorCampaign>(blank);
  const [draftKey, setDraftKey] = useState(0);
  const ids = [...new Set([...catalog.base.map(c => c.id), ...catalog.edits.filter(e => e.campaign).map(e => e.id)])];
  const records = ids.map(id => catalog.edits.find(e => e.id === id)?.campaign ?? catalog.base.find(c => c.id === id)!);
  const source = catalog.base.find(c => c.id === selected);
  const edit = catalog.edits.find(e => e.id === selected);
  const [message, setMessage] = useState('');
  const [historyOpen, setHistoryOpen] = useState(!!historyId);
  const removed = !!edit && !edit.campaign && !source;
  function startDraft(copy?: SponsorCampaign) {
    setHistoryOpen(false);
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
        onChange={id => { select(id); setMessage(''); setHistoryOpen(false); }} options={[...(!selected ? [{ value: '', label: 'New draft' }] : []),
          ...(removed ? [{ value: selected, label: campaignLabel({ id: selected, sponsor: '' }) + ' (removed)' }] : []),
          ...records.map(c => ({ value: c.id, label: campaignLabel(c), group: catalog.groups[c.id] }))]} /></label>
      <button type="button" className="btn-sm" onClick={() => startDraft()}>New draft</button>
      <button type="button" className="ghost" disabled={!selected || removed} onClick={() => startDraft(edit?.campaign ?? source)}>Duplicate</button>
      {selected && !removed && <button type="button" className="filter-chip" aria-pressed={historyOpen} aria-expanded={historyOpen} aria-controls="campaign-history"
        onClick={() => { setHistoryOpen(!historyOpen); setMessage(''); }}><span aria-hidden="true" className={styles.modeCheck}>✓</span>History</button>}
    </div>
    <ContentContext.Provider value={catalog.release ?? null}>
      {removed ? <CampaignHistory campaignId={selected} currentRevision={edit.revision} /> : <CampaignForm key={selected + '-' + (edit?.revision ?? 0) + '-' + draftKey} source={source} edit={edit} selected={selected}
        draft={draft} events={catalog.events} records={records} historyOpen={historyOpen}
        closeHistory={() => setHistoryOpen(false)}
        onSave={(next, id) => {
          setCatalog(next); setHistoryOpen(false);
          if (id) select(id); else startDraft();
          const group = next.groups[id];
          setMessage(group === 'Drafts' ? 'Draft saved.' : group === 'Waiting for Global dates'
            ? 'Saved. Waiting for confirmed Global dates.' : 'Saved. Open pages refresh campaigns within about two minutes.');
        }} />}
    </ContentContext.Provider>
    <p role="status">{message}</p>
  </main>;
}

function CampaignForm({ source, edit, selected, draft, events, records, historyOpen, closeHistory, onSave }: {
  source?: SponsorCampaign; edit?: CampaignEdit; selected: string;
  draft: SponsorCampaign; events: CampaignEvent[]; records: SponsorCampaign[];
  historyOpen: boolean; closeHistory: () => void;
  onSave: (next: Catalog, id: string) => void;
}) {
  const [c, set] = useState<SponsorCampaign>(edit?.campaign ?? source ?? draft);
  const [timing, setTiming] = useState((edit?.campaign ? edit.followsRelease : !!source) ? 'published'
    : c.eventActivityId || !selected ? 'event' : 'fixed');
  const onlyHome = c.placements.length === 1 && c.placements[0] === 'home';
  const separateMain = c.placements.includes('home') && (!onlyHome || c.mainArtwork !== undefined);
  const mainArt = c.mainArtwork === undefined ? c : c.mainArtwork ?? blankArt;
  const event = events.find(e => e.id === c.eventActivityId);
  const previous = records.find(r => r.id === c.replacesCampaignId && r.id !== c.id && r.status === 'active' && samePlacements(r, c));
  const replacements = records.filter(r => r.id !== c.id && r.status === 'active' && samePlacements(r, c));
  const eventOptions = events.map(e => ({ value: e.id, label: e.name }));
  if (c.eventActivityId && !event) eventOptions.push({ value: c.eventActivityId, label: c.eventActivityId });
  const [main, setMain] = useState<string>();
  const [desktop, setDesktop] = useState<string>();
  const [mobile, setMobile] = useState<string>();
  const saveButton = useRef<HTMLButtonElement>(null);
  const [restored, setRestored] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const patch = (fields: Partial<SponsorCampaign>) => set(old => ({ ...old, ...fields }));

  async function upload(file: File, slot: 'main' | 'page' | 'mobile') {
    setBusy(true); setError(''); setRestored('');
    try {
      const { art, encoded } = await readArtwork(file);
      if (slot === 'main') { patch({ mainArtwork: { ...art, alt: c.mainArtwork?.alt ?? c.alt } }); setMain(encoded); }
      else if (slot === 'mobile') { patch({ mobileArtwork: { ...art, alt: c.mobileArtwork?.alt ?? c.alt } }); setMobile(encoded); }
      else { patch({ ...art, alt: c.alt }); setDesktop(encoded); }
    } catch { setError('Choose a readable PNG, JPEG or WebP image of 600 KiB or less.'); }
    finally { setBusy(false); }
  }

  async function save(reset = false, status = c.status) {
    setBusy(true); setError('');
    try {
      const image = desktop ? '' : c.image;
      const mobileArtwork = c.placements.includes('header') ? c.mobileArtwork : undefined;
      const campaign = { ...c, status, image,
        mainArtwork: c.mainArtwork && { ...c.mainArtwork, image: main ? '' : c.mainArtwork.image },
        eventActivityId: timing === 'event' ? c.eventActivityId : undefined,
        replacesCampaignId: timing === 'event' ? previous?.id : undefined,
        mobileArtwork: mobileArtwork && { ...mobileArtwork, image: mobile ? '' : mobileArtwork.image },
        ...(timing !== 'fixed' && { startAt: null, endAt: null }) };
      const response = await fetch('/api/dashboard/campaigns', { method: 'POST',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: c.id, revision: edit?.revision ?? 0,
          campaign: reset ? null : campaign, creating: !selected, followsRelease: timing === 'published', mainUpload: main, desktopUpload: desktop, mobileUpload: mobile }) });
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
  const incomplete = !(onlyHome && separateMain ? mainArt.image : c.image) || !c.placements.length || (timing === 'event' && !c.eventActivityId);
  function restoreArtwork(version: SponsorCampaign, label: string) {
    const { image, width, height, alt } = version;
    patch({ image, width, height, alt, mainArtwork: version.mainArtwork, mobileArtwork: c.placements.includes('header') ? version.mobileArtwork : undefined });
    setMain(undefined); setDesktop(undefined); setMobile(undefined); setError('');
    setRestored(label + ' artwork loaded. Save your changes to apply it.');
    closeHistory();
    requestAnimationFrame(() => saveButton.current?.focus());
  }
  return <><section id="campaign-history" hidden={!historyOpen}>
    {historyOpen && <CampaignHistory campaignId={selected} source={source} currentRevision={edit?.revision ?? 0}
      disabled={busy} restore={restoreArtwork} />}
  </section><form hidden={historyOpen} onSubmit={submit}><fieldset disabled={busy} className={styles.form}>
    <div className={styles.fields}>
      <h2 className="section-title">{selected ? campaignLabel(c) : 'New draft'}</h2>
      <label>Timing<StyledSelect label="Timing" value={timing} onChange={setTiming} options={[
        { value: 'event', label: 'Follow a Global event' }, { value: 'fixed', label: 'Set dates or run continuously' },
        ...(source ? [{ value: 'published', label: 'Follow published campaign schedule' }] : []),
      ]} /></label>
      {timing === 'published' && source?.eventActivityId && <p className="notice">
        {events.find(e => e.id === source.eventActivityId)?.name ?? source.eventActivityId} · Waiting for Global dates
      </p>}
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
    <div className={styles.artworkGrid}>
      {separateMain && <ArtworkField title="Main artwork" art={mainArt}
        empty="Awaiting main artwork" change={alt => patch({ mainArtwork: { image: mainArt.image, width: mainArt.width, height: mainArt.height, alt } })}
        upload={f => upload(f, 'main')} clearLabel="Remove main artwork" clear={() => { patch({ mainArtwork: null }); setMain(undefined); }} />}
      {(!onlyHome || !separateMain) && <ArtworkField title={onlyHome ? 'Main artwork' : 'Page artwork'} art={c} shape={c.placements.includes('header') ? 'header' : undefined} change={alt => patch({ alt })} upload={f => upload(f, 'page')} />}
      {c.placements.includes('header') && <ArtworkField title="Mobile menu artwork" art={c.mobileArtwork ?? blankArt} fallback={c} shape="menu"
        change={alt => patch({ mobileArtwork: { ...(c.mobileArtwork ?? blankArt), alt } })} upload={f => upload(f, 'mobile')}
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
        checked={c.placements.includes(p)} onChange={e => patch({ placements: e.target.checked ? [...c.placements, p] : c.placements.filter(x => x !== p),
          ...(p === 'home' && e.target.checked && c.mainArtwork === undefined && { mainArtwork: null }) })} />
        {{ header: 'Page and mobile menu', home: 'Homepage', support: 'Support' }[p]}</label>)}</fieldset>
      </div>
    </details>
    <div className={styles.actions}><button ref={saveButton} className="primary btn-sm" disabled={incomplete}>
      {c.status === 'draft' ? 'Save draft' : c.status === 'active' && timing === 'event' ? 'Schedule campaign' : 'Save campaign'}</button>
      {c.status === 'draft' && timing === 'event' && <button className="btn-sm" type="submit" value="schedule" disabled={incomplete}>Schedule campaign</button>}
      {edit?.campaign && <button className={source ? 'ghost' : 'danger'} type="button" onClick={() => void save(true)}>{source ? 'Restore published version' : 'Remove campaign'}</button>}
      {restored && <p role="status">{restored}</p>}
      {error && <p role="alert">{error}</p>}</div>
  </fieldset></form></>;
}
