import type { EventWelfareOperator } from '@/lib/pulls/freeRewards';
import type { Skin } from '@/lib/skins/skinTypes';
import { useEffect, useState } from 'react';
import { RewardClick } from './RewardDetails';
import Image from '@/components/content/ContentImage';
import { eventTitle } from '@/lib/events/eventName.mjs';
import type { RewardSummary as Summary, SummaryItem } from '@/lib/events/rewardSummary';
import RewardImageDialog from './RewardImageDialog';

const EMPTY_SKINS: Skin[] = [];
const EMPTY_WELFARE: EventWelfareOperator[] = [];
const IMAGE_HASH = '#rewards/image';

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

export function RewardSummaryCard({ eventName, summary, artwork, rewardNote, skins = EMPTY_SKINS, welfare = EMPTY_WELFARE }: { welfare?: EventWelfareOperator[]; skins?: Skin[]; eventName: string; summary: Summary; artwork?: string | null; rewardNote?: string | null }) {
  const [imageOpen, setImageOpen] = useState(false);
  const title = eventTitle(eventName);
  useEffect(() => {
    const follow = () => setImageOpen(window.location.hash === IMAGE_HASH);
    follow();
    window.addEventListener('hashchange', follow);
    return () => window.removeEventListener('hashchange', follow);
  }, [eventName]);
  function showImage(open: boolean) {
    window.history.replaceState(window.history.state, '', `${window.location.pathname}${window.location.search}${open ? IMAGE_HASH : '#rewards'}`);
    setImageOpen(open);
  }

  return (
    <div className="reward-summary">
      <div className="reward-summary-actions">
        <span className="hint">Free rewards: {summary.sources.join(' + ')}</span>
        <span className="reward-summary-buttons">
          <button type="button" className="btn btn-icon" onClick={() => showImage(true)} aria-label="View rewards image fullscreen" title="View rewards image fullscreen" aria-haspopup="dialog">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5" /></svg>
          </button>
        </span>
      </div>
      <div className="reward-summary-table">
        {packed(summary.rows).map((row) => (
          <div key={row.label} className="panel reward-summary-row">
            <span className="reward-summary-label">{row.label}</span>
            <span className="reward-summary-items">{row.items.map((item) => <Tile key={item.name} item={item} />)}</span>
          </div>
        ))}
      </div>
      {imageOpen && <RewardImageDialog title={title} summary={summary} artwork={artwork} rewardNote={rewardNote} skins={skins} welfare={welfare} onClose={() => showImage(false)} />}
    </div>
  );
}
