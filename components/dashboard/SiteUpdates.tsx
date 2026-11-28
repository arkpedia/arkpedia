import { useEffect, useRef, useState } from 'react';
import ImportDialog from '@/components/account/ImportDialog';
import SiteUpdateContent from '@/components/site-updates/SiteUpdateContent';
import StyledSelect from '@/components/ui/StyledSelect';
import XButton from '@/components/ui/XButton';
import { useDashboardRequest } from './DashboardRequest';
import {
  UPDATE_BODY_LENGTH, UPDATE_IMAGE_COUNT, UPDATE_IMAGE_LIMIT, UPDATE_TITLE_LENGTH,
  type UpdateContent, type UpdateDraft, type UpdateImage, type UpdateListItem,
} from '@/lib/site-updates/types';
import styles from './SiteUpdates.module.css';

const EMPTY: UpdateContent = { title: '', body: '', major: false, images: [] };
const DEVICES = [{ value: 'all', label: 'All screens' }, { value: 'desktop', label: 'Desktop' }, { value: 'mobile', label: 'Mobile' }] as const;

async function readUpdateResponse<T>(pending: Promise<Response>): Promise<T> {
  const response = await pending;
  const result = await response.json().catch(() => null);
  if (!response.ok) throw new Error(result?.error ?? 'Update storage is unavailable.');
  return result as T;
}

function fileSource(file: File): Promise<string> {
  if (file.size > UPDATE_IMAGE_LIMIT || !['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
    return Promise.reject(new Error('Choose a PNG, JPEG, or WebP image up to 300 KiB.'));
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Could not read the image.'));
    reader.readAsDataURL(file);
  });
}

function contentOf(update: UpdateDraft): UpdateContent {
  return { title: update.title, body: update.body, major: update.major, images: update.images };
}

export default function SiteUpdates() {
  const fetch = useDashboardRequest();
  const [queue, setQueue] = useState<UpdateListItem[] | null>(null);
  const [saved, setSaved] = useState<UpdateDraft | null>(null);
  const [content, setContent] = useState<UpdateContent>(EMPTY);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dialog, setDialog] = useState<'preview' | 'publish' | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const queueTitle = useRef<HTMLHeadingElement>(null);
  const editorTitle = useRef<HTMLHeadingElement>(null);
  const locked = saved?.publishedAt != null;
  const dirty = JSON.stringify(content) !== JSON.stringify(saved ? contentOf(saved) : EMPTY);
  const complete = !!content.title.trim() && !!content.body.trim() && content.images.every(image => !!image.alt.trim());

  useEffect(() => {
    const controller = new AbortController();
    void readUpdateResponse<UpdateListItem[]>(fetch('/api/dashboard/site-updates', { cache: 'no-store', signal: controller.signal }))
      .then(setQueue).catch((cause: unknown) => {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'The queue could not be loaded.');
      });
    return () => controller.abort();
  }, [attempt, fetch]);

  useEffect(() => {
    if (locked && message) editorTitle.current?.focus();
  }, [locked, message]);

  useEffect(() => {
    if (editing) editorTitle.current?.focus();
  }, [editing]);

  function change(patch: Partial<UpdateContent>) {
    setContent(current => ({ ...current, ...patch }));
    setError('');
    setMessage('');
  }

  async function select(id: string, openEditor = true) {
    if (dirty && !window.confirm('Discard the unsaved changes to this draft?')) return;
    setError('');
    setMessage('');
    if (!id) {
      setSaved(null);
      setContent(EMPTY);
      setEditing(openEditor);
      if (!openEditor) queueTitle.current?.focus();
      return;
    }
    setBusy(true);
    try {
      const next = await readUpdateResponse<UpdateDraft>(fetch(`/api/dashboard/site-updates?id=${encodeURIComponent(id)}`));
      setSaved(next);
      setContent(contentOf(next));
      setEditing(true);
      setQueue(current => current?.map(row => row.id === next.id
        ? { id: next.id, title: next.title, publishedAt: next.publishedAt } : row) ?? null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The draft could not be loaded.');
    } finally {
      setBusy(false);
    }
  }

  async function save(action: 'save' | 'publish') {
    if (busy) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const next = await readUpdateResponse<UpdateDraft>(fetch('/api/dashboard/site-updates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, id: saved?.id ?? null, revision: saved?.revision ?? 0, ...(action === 'save' && { content }) }),
      }));
      setSaved(next);
      setContent(contentOf(next));
      setQueue(current => [{ id: next.id, title: next.title, publishedAt: next.publishedAt }, ...(current ?? []).filter(row => row.id !== next.id)]);
      setDialog(null);
      setMessage(action === 'publish' ? 'Update published to What’s New.' : 'Draft saved to the queue.');
    } catch (cause) {
      setDialog(null);
      setError(cause instanceof Error ? cause.message : 'The change could not be saved.');
    } finally {
      setBusy(false);
    }
  }

  async function addImage(file: File) {
    setBusy(true);
    setError('');
    try {
      const src = await fileSource(file);
      change({ images: [...content.images, { src, alt: '', device: 'all' }] });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The image could not be added.');
    } finally {
      setBusy(false);
    }
  }

  function updateImage(index: number, patch: Partial<UpdateImage>) {
    change({ images: content.images.map((image, imageIndex) => imageIndex === index ? { ...image, ...patch } : image) });
  }

  const drafts = queue?.filter(row => row.publishedAt === null) ?? [];
  const published = queue?.filter(row => row.publishedAt !== null) ?? [];

  function updateList(rows: UpdateListItem[]) {
    return <ul className={styles.updateList}>{rows.map(row => <li key={row.id}>
      <button className={`btn-bare pick-card ${styles.updateButton}`} type="button" disabled={busy}
        aria-pressed={saved?.id === row.id} onClick={() => { if (saved?.id !== row.id) void select(row.id); }}>
        {row.title}
      </button>
    </li>)}</ul>;
  }

  return <section className={styles.workspace} aria-label="Site updates">
    {error && <p role="alert" className="notice notice-danger">{error}</p>}
    {queue ? <div className={editing ? styles.editorLayout : undefined}>
      <div className={styles.queue}>
        <section className={styles.drafts} aria-labelledby="site-update-queue-title">
          <div className={styles.row}>
            <h2 ref={queueTitle} tabIndex={-1} className="section-title" id="site-update-queue-title">Draft queue</h2>
            <button className="ghost btn-sm" type="button" disabled={busy || (editing && !saved && !dirty)} onClick={() => void select('')}>New draft</button>
          </div>
          <p className="hint">Drafts are private until you publish them.</p>
          {drafts.length ? updateList(drafts) : <p className="hint">No drafts queued.</p>}
        </section>
        {!!published.length && <details className={styles.history}>
          <summary>Published updates</summary>
          {updateList(published)}
        </details>}
      </div>
      {editing && <form className="panel" onSubmit={event => { event.preventDefault(); if (dirty && complete && !locked) void save('save'); }}>
        <div className={styles.editorHeading}>
          <h2 ref={editorTitle} tabIndex={-1} className="section-title">{locked ? 'Published update' : saved ? 'Edit draft' : 'New draft'}</h2>
          <XButton label="Close editor" disabled={busy} onClick={() => void select('', false)} />
        </div>
        <fieldset className={styles.fields} disabled={busy || locked}>
          <label>Title<input type="text" value={content.title} onChange={event => change({ title: event.target.value })} maxLength={UPDATE_TITLE_LENGTH} required /></label>
          <label>Update notes<textarea rows={4} value={content.body} onChange={event => change({ body: event.target.value })} maxLength={UPDATE_BODY_LENGTH} required /></label>
          <label className="check"><input type="checkbox" checked={content.major} onChange={event => change({ major: event.target.checked })} />Show as a major-update pop-up</label>
          {content.images.map((image, index) => <div key={index} className={styles.image}>
            <div className={styles.row}><strong>Image {index + 1}</strong>
              <XButton label={`Remove image ${index + 1}`} onClick={() => change({ images: content.images.filter((_, i) => i !== index) })} />
            </div>
            <label>Image description<input aria-label={`Image ${index + 1} description`} value={image.alt} maxLength={180} required
              onChange={event => updateImage(index, { alt: event.target.value })} /></label>
            <StyledSelect label={`Show image ${index + 1} on`} value={image.device} options={DEVICES}
              onChange={device => updateImage(index, { device: device as UpdateImage['device'] })} />
          </div>)}
          {content.images.length < UPDATE_IMAGE_COUNT && <label>Add image
            <input type="file" accept="image/png,image/jpeg,image/webp" onChange={event => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (file) void addImage(file);
            }} />
          </label>}
        </fieldset>
        <div className={styles.row}>
          <button className="ghost btn-sm" type="button" disabled={!content.title.trim() || busy} onClick={() => setDialog('preview')}>Preview</button>
          {!locked && <>
            <button className="primary btn-sm" type="submit" disabled={!complete || !dirty || busy}>Save draft</button>
            <button className="ghost btn-sm" type="button" disabled={busy || !saved || dirty} onClick={() => setDialog('publish')}>Publish update</button>
            {saved && <button className="ghost btn-sm" type="button" disabled={busy} onClick={() => void select(saved.id)}>Reload draft</button>}
          </>}
        </div>
        {message && <p className="hint" role="status">{message}</p>}
      </form>}
    </div> : error ? <button className="ghost btn-sm" type="button" onClick={() => { setError(''); setAttempt(value => value + 1); }}>Retry</button>
      : <p role="status">Loading the update queue…</p>}
    {dialog === 'preview' && <ImportDialog title={content.title} onClose={() => setDialog(null)}>
      <SiteUpdateContent content={content} preview />
    </ImportDialog>}
    {dialog === 'publish' && <ImportDialog title="Publish this update?" onClose={() => setDialog(null)} dismissible={!busy}>
      <p><strong>{content.title}</strong> will appear on What&rsquo;s New.{content.major && ' Returning readers will also see a pop-up.'}</p>
      <div className={styles.row}>
        <button type="button" className="ghost btn-sm" disabled={busy} onClick={() => setDialog(null)}>Cancel</button>
        <button type="button" className="primary btn-sm" disabled={busy} onClick={() => void save('publish')}>Publish</button>
      </div>
    </ImportDialog>}
  </section>;
}
