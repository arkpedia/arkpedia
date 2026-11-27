import { useEffect, useState } from 'react';
import ImportDialog from '@/components/account/ImportDialog';
import SiteUpdateContent from '@/components/site-updates/SiteUpdateContent';
import StyledSelect from '@/components/ui/StyledSelect';
import XButton from '@/components/ui/XButton';
import {
  UPDATE_BODY_LENGTH, UPDATE_IMAGE_COUNT, UPDATE_IMAGE_LIMIT, UPDATE_TITLE_LENGTH,
  type UpdateContent, type UpdateDraft, type UpdateImage, type UpdateListItem,
} from '@/lib/site-updates/types';
import styles from './SiteUpdates.module.css';

const ENDPOINT = '/api/dashboard/site-updates';
const EMPTY: UpdateContent = { title: '', body: '', major: false, images: [] };
const DEVICES = [{ value: 'all', label: 'All screens' }, { value: 'desktop', label: 'Desktop' }, { value: 'mobile', label: 'Mobile' }] as const;

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
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
  const [queue, setQueue] = useState<UpdateListItem[] | null>(null);
  const [saved, setSaved] = useState<UpdateDraft | null>(null);
  const [content, setContent] = useState<UpdateContent>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [dialog, setDialog] = useState<'preview' | 'publish' | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const locked = saved?.publishedAt != null;
  const dirty = JSON.stringify(content) !== JSON.stringify(saved ? contentOf(saved) : EMPTY);
  const complete = !!content.title.trim() && !!content.body.trim() && content.images.every(image => !!image.alt.trim());

  useEffect(() => {
    const controller = new AbortController();
    void request<UpdateListItem[]>(ENDPOINT, { cache: 'no-store', signal: controller.signal })
      .then(setQueue).catch((cause: unknown) => {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'The queue could not be loaded.');
      });
    return () => controller.abort();
  }, [attempt]);

  function change(patch: Partial<UpdateContent>) {
    setContent(current => ({ ...current, ...patch }));
    setError('');
    setMessage('');
  }

  async function select(id: string) {
    if (dirty && !window.confirm('Discard the unsaved changes to this draft?')) return;
    setError('');
    setMessage('');
    if (!id) {
      setSaved(null);
      setContent(EMPTY);
      return;
    }
    setBusy(true);
    try {
      const next = await request<UpdateDraft>(`${ENDPOINT}?id=${encodeURIComponent(id)}`);
      setSaved(next);
      setContent(contentOf(next));
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
      const next = await request<UpdateDraft>(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, id: saved?.id ?? null, revision: saved?.revision ?? 0, ...(action === 'save' && { content }) }),
      });
      setSaved(next);
      setContent(contentOf(next));
      setQueue(current => [{ id: next.id, title: next.title, publishedAt: next.publishedAt }, ...(current ?? []).filter(row => row.id !== next.id)]);
      setDialog(null);
      setMessage(action === 'publish' ? 'Update published.' : 'Draft saved.');
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

  const options = [
    { value: '', label: 'New draft' },
    ...(queue ?? []).map(row => ({ value: row.id, label: `${row.publishedAt === null ? 'Draft' : 'Published'} · ${row.title}` })),
  ];

  return <section className={styles.workspace} aria-label="Site updates">
    {error && <p role="alert" className="notice notice-danger">{error}</p>}
    {message && <p role="status">{message}</p>}
    {queue ? <>
      <div className={styles.row}>
        <StyledSelect label="Update queue" value={saved?.id ?? ''} options={options} disabled={busy} onChange={id => void select(id)} />
        <button className="ghost btn-sm" type="button" disabled={busy || !saved} onClick={() => void select('')}>New draft</button>
        {saved && !locked && <button className="ghost btn-sm" type="button" disabled={busy} onClick={() => void select(saved.id)}>Reload draft</button>}
      </div>
      <form className="panel" onSubmit={event => { event.preventDefault(); if (dirty && complete && !locked) void save('save'); }}>
        <fieldset className={styles.fields} disabled={busy || locked}>
          <label>Title<input value={content.title} onChange={event => change({ title: event.target.value })} maxLength={UPDATE_TITLE_LENGTH} required /></label>
          <label>Update notes<textarea rows={5} value={content.body} onChange={event => change({ body: event.target.value })} maxLength={UPDATE_BODY_LENGTH} required /></label>
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
          </>}
        </div>
      </form>
    </> : error ? <button className="ghost btn-sm" type="button" onClick={() => { setError(''); setAttempt(value => value + 1); }}>Retry</button>
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
