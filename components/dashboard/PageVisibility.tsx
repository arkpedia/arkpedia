import { useEffect, useState } from 'react';
import StyledSelect from '@/components/ui/StyledSelect';
import { managedPages, pageIsListed, validPageVisibility, type PageVisibilitySetting, type VisibilityMode } from '@/lib/page-visibility/settings';
import styles from './CampaignEditor.module.css';

const endpoint = '/api/dashboard/page-visibility';
const modes: { value: VisibilityMode; label: string }[] = [
  { value: 'unlisted', label: 'Unlisted' },
  { value: 'listed', label: 'Listed' },
  { value: 'scheduled', label: 'Scheduled' },
];
const utcInput = (value: number | null) => value === null ? '' : new Date(value).toISOString().slice(0, 16);
const utcTime = (value: string) => value ? Date.parse(`${value}Z`) : null;

function PageVisibilityRow({ initial, reload }: { initial: PageVisibilitySetting; reload: () => void }) {
  const [saved, setSaved] = useState(initial);
  const [mode, setMode] = useState(saved.mode);
  const [show, setShow] = useState(utcInput(saved.showAt));
  const [hide, setHide] = useState(utcInput(saved.hideAt));
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [conflict, setConflict] = useState(false);
  const [now, setNow] = useState(Date.now);
  const page = managedPages[saved.id];
  const draft = {
    ...saved, mode,
    showAt: mode === 'scheduled' ? utcTime(show) : null,
    hideAt: mode === 'scheduled' ? utcTime(hide) : null,
  };
  const valid = validPageVisibility(draft);
  const dirty = draft.mode !== saved.mode || draft.showAt !== saved.showAt || draft.hideAt !== saved.hideAt;

  useEffect(() => {
    const next = [saved.showAt, saved.hideAt].find(time => time !== null && time > now);
    if (next == null) return;
    const timer = window.setTimeout(() => setNow(Date.now()), Math.min(2_147_483_647, next - now));
    return () => window.clearTimeout(timer);
  }, [now, saved]);

  async function save() {
    setBusy(true);
    setNotice('');
    try {
      const response = await fetch(endpoint, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(draft),
      });
      const result = await response.json();
      if (!response.ok) {
        setConflict(response.status === 409);
        throw new Error(result.error);
      }
      setSaved(result);
      setShow(utcInput(result.showAt));
      setHide(utcInput(result.hideAt));
      setNow(Date.now());
      setNotice('Page visibility saved.');
    } catch (error) {
      setNotice(error instanceof Error && error.message || 'Page visibility could not be saved.');
    } finally {
      setBusy(false);
    }
  }

  return <form aria-label={page.title} className={styles.guideEntry} onSubmit={event => {
    event.preventDefault();
    if (valid && dirty && !busy && !conflict) void save();
  }}>
    <div className={styles.maintenanceBar}>
      <h2 className="section-title">{page.title}</h2>
      <span>{pageIsListed(saved, now) ? 'Listed now' : 'Unlisted now'}</span>
    </div>
    <fieldset disabled={busy} className={styles.rotationFields}>
      <div className={styles.guideControls}>
        <label>Listing<StyledSelect label="Listing" value={mode} options={modes}
          onChange={value => { setMode(value as VisibilityMode); setNotice(''); }} /></label>
        {mode === 'scheduled' && <>
          <label>Show at (UTC)<input className="datetime-input" type="datetime-local" value={show} onChange={event => {
            setShow(event.target.value); setNotice('');
          }} /></label>
          <label>Hide at (UTC)<input className="datetime-input" type="datetime-local" value={hide} onChange={event => {
            setHide(event.target.value); setNotice('');
          }} /></label>
        </>}
        <button className="primary btn-sm" disabled={!valid || !dirty || conflict}>Save visibility</button>
        {conflict && <button type="button" className="ghost btn-sm" onClick={reload}>Reload settings</button>}
      </div>
    </fieldset>
    {mode === 'scheduled' && <small className="sub">
      {valid ? 'Set either time or a window. Both fields use UTC.' : 'Enter a show or hide time. When both are set, show must come first.'}
    </small>}
    <span role="status">{notice}</span>
  </form>;
}

export default function PageVisibility() {
  const [settings, setSettings] = useState<PageVisibilitySetting[] | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const reload = () => { setSettings(null); setError(false); setAttempt(value => value + 1); };
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch(endpoint, { cache: 'no-store', signal: controller.signal });
        if (!response.ok) throw new Error();
        const rows = await response.json();
        if (!controller.signal.aborted) setSettings(rows);
      } catch {
        if (!controller.signal.aborted) setError(true);
      }
    }
    void load();
    return () => controller.abort();
  }, [attempt]);

  return <main className={styles.workspace}>
    <p className="sub">Unlisted pages remain available by direct link.</p>
    {error ? <p role="alert">Page visibility is unavailable. <button type="button" className="ghost btn-sm" onClick={reload}>Retry</button></p>
      : settings === null ? <p role="status">Loading page visibility…</p>
      : !settings.length ? <p className="sub">No pages are configured for visibility control.</p>
      : settings.map(setting => <PageVisibilityRow key={setting.id} initial={setting} reload={reload} />)}
  </main>;
}
