import { useEffect, useState } from 'react';
import StyledSelect from '@/components/ui/StyledSelect';
import { placementLabels, pollNames, type ClosedPlacement, type PollSettings, type ResultsMode } from '@/lib/polls/settings';
import styles from './CampaignEditor.module.css';

function requestSettings(options: RequestInit) {
  return fetch('/api/dashboard/polls',options);
}
function utcInput(time: number | null) {
  return time === null ? '' : new Date(time).toISOString().slice(0,16);
}

function PollRow({ initial, onSaved }: { initial: PollSettings; onSaved: (s: PollSettings) => void }) {
  const [visible, setVisible] = useState(initial.visible);
  const [results, setResults] = useState(initial.results);
  const [closedPlacement, setClosedPlacement] = useState(initial.closedPlacement);
  const [scheduled, setScheduled] = useState(initial.closesAt !== null);
  const [date, setDate] = useState(utcInput(initial.closesAt));
  const [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  const [conflict, setConflict] = useState(false);
  const archive = initial.id === 'power-scale';
  const closesAt = scheduled ? Date.parse(date + 'Z') : null;
  const dirty = initial.closedPlacement !== closedPlacement || initial.visible !== visible || initial.results !== results || initial.closesAt !== closesAt;
  async function save(unhide = false) {
    setBusy(true); setMessage('');
    try {
      const response = await requestSettings({method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({...initial, visible:unhide || visible, results, closesAt, closedPlacement})});
      const data = await response.json();
      if (!response.ok) { setConflict(response.status === 409); throw Error(data.error); }
      onSaved(data); setVisible(data.visible); setMessage(unhide ? 'Poll is public.' : 'Saved.');
    } catch (error) { setMessage(error instanceof Error && error.message || 'Could not save the settings.'); }
    finally { setBusy(false); }
  }
  async function reload() {
    setBusy(true);
    try {
      const response = await requestSettings({cache:'no-store'});
      if (!response.ok) throw Error();
      const updated = ((await response.json()) as PollSettings[]).find(s => s.id === initial.id);
      if (!updated) throw Error();
      setClosedPlacement(updated.closedPlacement); setVisible(updated.visible); setResults(updated.results); setScheduled(updated.closesAt !== null);
      setDate(utcInput(updated.closesAt)); onSaved(updated); setConflict(false); setMessage('Latest settings loaded.');
    } catch { setMessage('Could not reload the settings.'); }
    finally { setBusy(false); }
  }
  return <form className={styles.guideEntry} aria-label={pollNames[initial.id]} onSubmit={e => {e.preventDefault(); void save();}}>
    <h2 className="section-title">{pollNames[initial.id]}</h2>
    <fieldset disabled={busy} className={styles.rotationFields} onChange={() => setMessage('')}>
      <div className={styles.guideControls}>
        <label>Poll visibility<StyledSelect label="Poll visibility" value={visible ? 'shown' : 'hidden'}
          onChange={v => {setVisible(v === 'shown'); setMessage('');}} options={[{value:'shown',label:'Public'},{value:'hidden',label:'Hidden'}]}/></label>
        <label>Results<StyledSelect label="Results" value={results} onChange={v => {setResults(v as ResultsMode); setMessage('');}}
          options={[{value:'live',label:archive ? 'Published' : 'Show live'},...(archive ? [] : [{value:'closed',label:'Show after voting closes'}]),{value:'hidden',label:'Hidden'}]}/></label>
        {archive ? <span className="hint">Archived · Voting closed</span> : <>
          <label>Voting closes<StyledSelect label="Voting closes" value={scheduled ? 'scheduled' : 'never'}
            onChange={v => {setScheduled(v === 'scheduled'); setMessage('');}} options={[{value:'never',label:'Never'},{value:'scheduled',label:'At a set time'}]}/></label>
          {scheduled && <label>Closing time (UTC)<input type="datetime-local" required value={date} onChange={e => setDate(e.target.value)}/></label>}
        </>}
        <label>After voting closes<StyledSelect label="After voting closes" value={archive && closedPlacement === 'auto' ? 'archive' : closedPlacement}
          onChange={v => {setClosedPlacement(v as ClosedPlacement); setMessage('');}}
          options={Object.entries(placementLabels).filter(([value]) => !archive || value !== 'auto').map(([value,label]) => ({value,label}))}/></label>
        {!initial.visible && !dirty ? <button className="primary btn-sm" type="button" disabled={conflict} onClick={()=>void save(true)}>Unhide poll</button> :
        <button className="primary btn-sm" disabled={!dirty || conflict || scheduled && !Number.isFinite(closesAt)}>Save settings</button>}
        {conflict && <button type="button" className="ghost btn-sm" onClick={() => void reload()}>Reload settings</button>}
      </div>
    </fieldset>
    {!visible && <span className="hint">You can save a deadline while hidden. Unhide the poll when you’re ready to publish.</span>}
    {visible && results === 'closed' && !scheduled && <span className="hint">Results stay hidden until you set a closing time.</span>}
    {message && <span role="status">{message}</span>}
  </form>;
}

export default function PollControls() {
  const [settings, setSettings] = useState<PollSettings[]>([]), [error, setError] = useState(false), [attempt, retry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await requestSettings({cache:'no-store',signal:controller.signal});
        if (!response.ok) throw Error();
        const data = await response.json();
        if (!controller.signal.aborted) { setSettings(data); setError(false); }
      } catch { if (!controller.signal.aborted) setError(true); }
    }
    void load(); return () => controller.abort();
  },[attempt]);
  return <main className={styles.workspace}>
    {error ? <p role="alert">Poll settings are unavailable. <button className="ghost btn-sm" onClick={() => retry(n => n + 1)}>Retry</button></p>
      : !settings.length && <p role="status">Loading poll settings…</p>}
    {settings.map(s => <PollRow key={s.id} initial={s} onSaved={saved => setSettings(rows => rows.map(row => row.id === saved.id ? saved : row))}/>)}
  </main>;
}
