import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import ImportDialog from '@/components/account/ImportDialog';
import { ContentImg } from '@/components/content/ContentImage';
import SegmentedControl, { type SegmentOption } from '@/components/ui/SegmentedControl';
import { useContentUrl } from '@/lib/content/context';
import { eventStartRows, startCardCaption, type ClockFormat, type EventStartCard } from '@/lib/home/eventStartTimes';
import { downloadBlob } from '@/lib/ui/downloadBlob';

const CLOCK_FORMAT_KEY = 'arkpedia:event-start-clock';
const CLOCK_FORMATS: SegmentOption<ClockFormat>[] = [
  { value: '12h', label: '12h' },
  { value: '24h', label: '24h' },
];

type Picture = { blob: Blob; src: string; width: number; height: number };
type Preview = { format: ClockFormat; picture: Picture | null };

export default function EventStartTimesDialog({ card, onClose }: { card: EventStartCard; onClose: () => void }) {
  const resolve = useContentUrl();
  const artwork = card.artwork ? resolve(card.artwork) : null;
  const [format, setFormat] = useState<ClockFormat>(() => {
    try { return window.localStorage.getItem(CLOCK_FORMAT_KEY) === '24h' ? '24h' : '12h'; }
    catch { return '12h'; }
  });
  const rows = useMemo(() => eventStartRows(card.instant, format), [card.instant, format]);
  const caption = startCardCaption(card, format);
  const [textView, setTextView] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [attempt, setAttempt] = useState(0);
  const image = format === preview?.format ? preview.picture : null;
  const failed = format === preview?.format && !preview.picture;
  const previousPicture = preview?.picture;

  useEffect(() => {
    let closed = false;
    void (async () => {
      try {
        const { drawEventStartImage } = await import('@/lib/home/eventStartImage');
        const picture = await drawEventStartImage(card, rows, artwork, caption);
        if (closed) return;
        setPreview({ format, picture: { ...picture, src: URL.createObjectURL(picture.blob) } });
      } catch { if (!closed) setPreview({ format, picture: null }); }
    })();
    return () => { closed = true; };
  }, [card, rows, artwork, caption, format, attempt]);

  useEffect(() => () => { if (previousPicture) URL.revokeObjectURL(previousPicture.src); }, [previousPicture]);

  function changeFormat(choice: ClockFormat) {
    setFormat(choice);
    try { window.localStorage.setItem(CLOCK_FORMAT_KEY, choice); }
    catch { /* The current dialog still keeps the selection. */ }
  }

  return <ImportDialog title={`${card.title} · Start times`} className="account-dialog-fit event-start-dialog" onClose={onClose}>
    <div className="event-start-content">
      {textView ? <div className="event-start-table-scroll" role="region" aria-label="Local start times" tabIndex={0}>
        <table className="event-start-table">
          <caption>{caption}</caption>
          <thead><tr><th scope="col">Time</th><th scope="col">Date</th><th scope="col">Locations</th></tr></thead>
          <tbody>{rows.map(row => <tr key={row.key}>
            <td>{row.time}</td><td>{row.date}</td><td>{row.places.join(' · ')}</td>
          </tr>)}</tbody>
        </table>
      </div> : <div className="event-start-picture" aria-busy={!image && !failed}
        style={previousPicture ? { '--event-start-ratio': `${previousPicture.width} / ${previousPicture.height}` } as CSSProperties : undefined}>
        {image ? <ContentImg src={image.src} width={image.width} height={image.height} alt={`${card.title} worldwide start times. ${caption}. Select View as text for the full list.`} />
          : failed ? <div><p role="alert">Image unavailable.</p><button type="button" className="btn btn-sm" onClick={() => { setPreview(null); setAttempt(value => value + 1); }}>Try again</button></div>
            : <p className="hint" role="status">Preparing start times…</p>}
      </div>}
      <div className="event-start-actions">
        <SegmentedControl label="Clock format" options={CLOCK_FORMATS} value={format} onChange={changeFormat} />
        <div className="event-start-file-actions">
          <button type="button" className="btn ghost btn-sm" onClick={() => setTextView(value => !value)}>{textView ? 'View image' : 'View as text'}</button>
          <button type="button" className="btn primary btn-sm" disabled={!image} onClick={() => {
            if (image) downloadBlob(image.blob, `${card.title.replace(/[\\/:*?"<>|]/g, '')} start times (${format}).png`);
          }}>Save image</button>
        </div>
      </div>
    </div>
  </ImportDialog>;
}
