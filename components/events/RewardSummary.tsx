import { useState } from 'react';
import { RewardClick } from './RewardDetails';
import Image from '@/components/content/ContentImage';
import { eventTitle } from '@/lib/events/eventName.mjs';
import type { RewardSummary as Summary, SummaryItem } from '@/lib/events/rewardSummary';
import { downloadBlob } from '@/lib/ui/downloadBlob';
import { useContentUrl } from '@/lib/content/context';

/* The page and saved infographic share the same reward totals. */
const fmt = (n: number) => n.toLocaleString('en-US');
const WIDE = 10;
function packed<T extends { items: unknown[] }>(rows: T[]): T[] {
  return [...rows.filter((row) => row.items.length <= WIDE), ...rows.filter((row) => row.items.length > WIDE)];
}
function Tile({ item }: { item: SummaryItem }) {
  return (
    <RewardClick name={item.name} className="reward-summary-tile">
      {item.iconPath
        ? <><Image src={item.iconPath} alt="" width={40} height={40} /><span className="visually-hidden">{item.name}</span></>
        : <span className="reward-summary-tile-name"><span>{item.name}</span></span>}
      <b>×{fmt(item.count)}</b>
    </RewardClick>
  );
}

export function RewardSummaryCard({ eventName, summary, artwork, rewardNote }: { eventName: string; summary: Summary; artwork?: string | null; rewardNote?: string | null }) {
  const url = useContentUrl();
  const [note, setNote] = useState<string | null>(null);
  // One picture at a time: each press started another round of icon loads and another download.
  const [drawing, setDrawing] = useState(false);
  // The event's short title ("People, A People"), for the picture's heading and its file name.
  const title = eventTitle(eventName);

  async function copyLink() {
    const url = `${window.location.origin}${window.location.pathname}#rewards`;
    try {
      await navigator.clipboard.writeText(url);
      setNote('Link copied');
    } catch {
      setNote(url);
    }
  }

  async function saveImage() {
    if (drawing) return;
    setDrawing(true);
    setNote('Drawing…');
    try {
      const { drawRewardSummary } = await import('@/lib/events/rewardSummaryImage');
      const blob = await drawRewardSummary({ title, summary, artwork: artwork ? url(artwork) : null, rewardNote, resolve: url });
      downloadBlob(blob, `${title.replace(/[\\/:*?"<>|]/g, '')} rewards.png`);
      setNote(null);
    } catch {
      setNote('The picture could not be drawn in this browser.');
    } finally {
      setDrawing(false);
    }
  }

  return (
    <div className="reward-summary">
      <div className="reward-summary-actions">
        <span className="hint">Free rewards: {summary.sources.join(' + ')}</span>
        <span className="reward-summary-buttons">
          <button type="button" className="btn" onClick={copyLink}>Copy link</button>
          <button type="button" className="btn" onClick={saveImage} disabled={drawing}>Save image</button>
        </span>
      </div>
      {note && <p className="hint" role="status">{note}</p>}
      <div className="reward-summary-table">
        {packed(summary.rows).map((row) => (
          <div key={row.label} className="panel reward-summary-row">
            <span className="reward-summary-label">{row.label}</span>
            <span className="reward-summary-items">{row.items.map((item) => <Tile key={item.name} item={item} />)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
