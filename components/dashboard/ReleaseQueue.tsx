import { useEffect, useState, type FormEvent } from 'react';
import ImportDialog from '@/components/account/ImportDialog';
import SiteUpdateContent from '@/components/site-updates/SiteUpdateContent';
import { LIVE_ORIGIN, PREVIEW_ORIGIN, reviewPaths, type ReleaseCommand, type ReleaseEntry, type ReleaseQueueData } from '@/lib/release-queue/types';
import { UPDATE_BODY_LENGTH, UPDATE_TITLE_LENGTH, type UpdateContent } from '@/lib/site-updates/types';
import styles from './ReleaseQueue.module.css';

export interface ReleaseQueueClient {
  load(): Promise<ReleaseQueueData>;
  send(command: ReleaseCommand): Promise<ReleaseQueueData>;
}

async function result(response: Response): Promise<ReleaseQueueData> {
  const data = await response.json().catch(() => null);
  if (!response.ok || !data) throw Error(data?.error ?? 'The release queue is unavailable.');
  return data;
}

const admin: ReleaseQueueClient = {
  load: async () => result(await fetch('/api/dashboard/releases', { cache: 'no-store' })),
  send: async command => result(await fetch('/api/dashboard/releases', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(command),
  })),
};

const labels = {
  queued: 'Queued',
  publishing: 'Publishing',
  published: 'Published',
  needs_review: 'Needs review',
};
const emptyNote: UpdateContent = { title: '', body: '', major: false, images: [] };
const messageOf = (error: unknown) => error instanceof Error ? error.message : 'The release action failed.';

export default function ReleaseQueue({ client = admin, demo = false }: { client?: ReleaseQueueClient; demo?: boolean }) {
  const Workspace = demo ? 'main' : 'section';
  const [data, setData] = useState<ReleaseQueueData | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [note, setNote] = useState<UpdateContent | null>(null);
  const [dialog, setDialog] = useState<'queue' | 'note' | 'publish' | null>(null);
  const [pr, setPr] = useState('');
  const [paths, setPaths] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const entry = data?.entries.find(row => row.source === selected);
  const dirty = JSON.stringify(note) !== JSON.stringify(entry?.note ?? null);
  const active = data?.entries.find(row => row.state === 'publishing');
  const current = !!entry && entry.source === data?.previewSource;
  const ready = !!entry && entry.source === data?.readySource;

  async function load() {
    setBusy(true);
    setError('');
    try {
      const next = await client.load();
      setData(next);
      setNote(next.entries.find(row => row.source === selected)?.note ?? null);
    } catch (error) { setError(messageOf(error)); }
    finally { setBusy(false); }
  }

  useEffect(() => {
    let active = true;
    void client.load().then(value => { if (active) setData(value); })
      .catch(error => { if (active) setError(messageOf(error)); });
    return () => { active = false; };
  }, [client]);

  useEffect(() => {
    if (!active || busy || demo) return;
    let valid = true;
    const timer = window.setTimeout(() => {
      void client.send({ action: 'refresh', source: active.source, revision: active.revision })
        .then(next => { if (valid) setData(next); })
        .catch(() => { if (valid) setError('Could not verify production. Use Check status to try again.'); });
    }, 15_000);
    return () => { valid = false; window.clearTimeout(timer); };
  }, [active, busy, client, demo]);

  function choose(row: ReleaseEntry) {
    if (selected === row.source || (dirty && !window.confirm('Discard the unsaved release note?'))) return;
    setSelected(row.source);
    setNote(row.note);
    setError('');
  }

  async function send(command: ReleaseCommand) {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const next = await client.send(command);
      setData(next);
      if (command.action === 'queue') {
        const row = next.entries.find(row => row.source === next.previewSource && row.pullRequest === command.pullRequest);
        if (row) { setSelected(row.source); setNote(row.note); }
        setPr(''); setPaths('');
      } else if (command.action === 'save-note') {
        setNote(next.entries.find(row => row.source === command.source)?.note ?? null);
      }
      setDialog(null);
    } catch (error) {
      setError(messageOf(error));
      // A write may have reached GitHub before its response was lost. Reload
      // the persisted release state without discarding a locally edited note.
      try { setData(await client.load()); } catch { /* Keep the last queue. */ }
      setDialog(null);
    } finally { setBusy(false); }
  }

  function queue(event: FormEvent) {
    event.preventDefault();
    try {
      const pullRequest = Number(pr);
      if (!Number.isSafeInteger(pullRequest) || pullRequest < 1) throw Error('Enter a pull request number.');
      void send({ action: 'queue', pullRequest, paths: reviewPaths(paths.split('\n').map(value => value.trim()).filter(Boolean)) });
    } catch (error) { setError(messageOf(error)); }
  }

  const message = error && <p role="alert" className="notice notice-danger">{error}</p>;
  return <Workspace className={styles.workspace} aria-label="Release queue">
    {dialog !== 'queue' && message}
    {demo && <p className="notice">Preview demo. Drafts and publication are simulated in this browser.</p>}
    {data ? <div className={entry ? styles.layout : undefined}>
      <section className={styles.list} aria-labelledby="releases-heading">
        <div className={styles.row}>
          <h2 className="section-title" id="releases-heading">Release queue</h2>
          <button type="button" className="ghost btn-sm" disabled={busy} onClick={() => { setError(''); setDialog('queue'); }}>Queue Preview</button>
          <button type="button" className="ghost btn-sm" disabled={busy} onClick={() => {
            if (!dirty || window.confirm('Discard the unsaved release note?')) void load();
          }}>Refresh queue</button>
        </div>
        {data.entries.length ? <ul>{data.entries.map(row => <li key={row.source}>
          <button className="btn-bare pick-card" type="button" disabled={busy} aria-pressed={selected === row.source} onClick={() => choose(row)}>
            {row.title}<span className="sub">{labels[row.state]}</span>
          </button>
        </li>)}</ul> : <p className="sub">No releases queued. Queue a checked pull request that is currently on Preview.</p>}
      </section>
      {entry && <section className={'panel ' + styles.detail} aria-label="Release details">
        <div className={styles.row}>
          <h2 className="section-title">{entry.title}</h2>
          <span className="sub" role="status">{labels[entry.state]}</span>
        </div>
        <div className={styles.row}>
          {demo ? <span className="sub">Sample PR #{entry.pullRequest}</span> : <>
            <a className="ghost btn-sm" href={'https://github.com/arkpedia/arkpedia/pull/' + entry.pullRequest} target="_blank" rel="noreferrer">PR #{entry.pullRequest} <span aria-hidden="true">↗</span></a>
            <code title={entry.source}>{entry.source.slice(0, 12)}</code>
          </>}
        </div>
        <section aria-label="Pages to review">
          <h3>Pages to review</h3>
          <ul className={styles.pages}>{entry.paths.map(path => <li key={path}>
            <code>{path}</code>
            <div className={styles.row}>
              {current && <a className="ghost btn-sm" href={PREVIEW_ORIGIN + path} target="_blank" rel="noreferrer" aria-label={'Preview ' + path}>Preview <span aria-hidden="true">↗</span></a>}
              <a className="ghost btn-sm" href={LIVE_ORIGIN + path} target="_blank" rel="noreferrer" aria-label={'Live ' + path}>Live <span aria-hidden="true">↗</span></a>
            </div>
          </li>)}</ul>
        </section>
        {entry.state === 'queued' && !current && <p className="notice">Preview is serving a different build. Restore this build on Preview before publishing it.</p>}
        {entry.state === 'needs_review' && <p className="notice">Production or main changed. Review the newer build before queuing it.</p>}
        {entry.state === 'queued' ? <fieldset className={styles.note} disabled={busy}>
          <legend>Update note</legend>
          <label className="check"><input type="checkbox" checked={note !== null} onChange={event => setNote(event.target.checked ? entry.note ?? emptyNote : null)} />Include an update note</label>
          {note && <>
            <label>Note title<input type="text" maxLength={UPDATE_TITLE_LENGTH} value={note.title} onChange={event => setNote({ ...note, title: event.target.value })} /></label>
            <label>Update notes<textarea rows={4} maxLength={UPDATE_BODY_LENGTH} value={note.body} onChange={event => setNote({ ...note, body: event.target.value })} /></label>
            <label className="check"><input type="checkbox" checked={note.major} onChange={event => setNote({ ...note, major: event.target.checked })} />Show as a major-update pop-up</label>
          </>}
          {(note || entry.note) && <div className={styles.row}>
            {note?.title.trim() && <button type="button" className="ghost btn-sm" onClick={() => setDialog('note')}>Preview note</button>}
            <button type="button" className="ghost btn-sm" disabled={!dirty || !!note && (!note.title.trim() || !note.body.trim())}
              onClick={() => void send({ action: 'save-note', source: entry.source, revision: entry.revision, note })}>Save note</button>
          </div>}
        </fieldset> : entry.note && <button type="button" className="ghost btn-sm" onClick={() => { setNote(entry.note); setDialog('note'); }}>View update note</button>}
        <div className={styles.row}>
          {entry.state === 'queued' && ready && <button className="primary btn-sm" type="button"
            disabled={busy || dirty} onClick={() => setDialog('publish')}>Publish release</button>}
          {entry.state === 'publishing' && <>
            <button className="ghost btn-sm" type="button" disabled={busy} onClick={() => void send({ action: 'refresh', source: entry.source, revision: entry.revision })}>Check status</button>
            {ready && <button type="button" className="ghost btn-sm" disabled={busy} onClick={() => setDialog('publish')}>Retry publication</button>}
          </>}
        </div>
        {entry.state === 'queued' && !data.publicationEnabled && <p className="sub">Production publication has not been configured.</p>}
        {entry.state === 'queued' && current && data.publicationEnabled && !ready && <p className="sub" role="status">
          {active ? 'Another release is publishing.' : 'Publish appears after the current Preview has a reusable full Check against main.'}
        </p>}
        {dirty && <p className="sub">Save the update note before publishing the release.</p>}
      </section>}
    </div> : error ? <button type="button" className="ghost btn-sm" onClick={() => void load()}>Retry</button> : <p role="status">Loading the release queue…</p>}
    {dialog === 'queue' && <ImportDialog title="Queue the current Preview" onClose={() => setDialog(null)} dismissible={!busy}>
      <form className={styles.note} onSubmit={queue}>
        {message}
        <label>Pull request number<input type="number" min="1" step="1" required value={pr} onChange={event => setPr(event.target.value)} /></label>
        <label>Page paths, one per line<textarea rows={3} required value={paths} placeholder={'/pull-planner\n/schedule'} onChange={event => setPaths(event.target.value)} /></label>
        <div><button type="submit" className="primary btn-sm" disabled={busy}>Queue checked build</button></div>
      </form>
    </ImportDialog>}
    {dialog === 'note' && note && <ImportDialog title={note.title} onClose={() => setDialog(null)}>
      <SiteUpdateContent content={note} preview />
    </ImportDialog>}
    {dialog === 'publish' && entry && ready && <ImportDialog title="Publish this release?" onClose={() => setDialog(null)} dismissible={!busy}>
      <p><strong>{entry.title}</strong> {demo ? 'will be marked published in the demo.' : 'will be sent to production.'}
        {entry.note && (demo ? ' Its update note will appear in the simulated release history.' : ' Its update note will go live after the new build is verified.')}</p>
      <div className={styles.row}>
        <button type="button" className="ghost btn-sm" disabled={busy} onClick={() => setDialog(null)}>Cancel</button>
        <button type="button" className="primary btn-sm" disabled={busy} onClick={() => void send({ action: 'publish', source: entry.source, revision: entry.revision })}>Publish</button>
      </div>
    </ImportDialog>}
  </Workspace>;
}
