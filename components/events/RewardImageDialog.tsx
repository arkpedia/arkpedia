import { useEffect, useState, type CSSProperties } from 'react';
import ImportDialog from '@/components/account/ImportDialog';
import { ContentImg } from '@/components/content/ContentImage';
import { useContentUrl } from '@/lib/content/context';
import { getOperatorIconPath } from '@/lib/operators/operatorIcon';
import type { EventWelfareOperator } from '@/lib/pulls/freeRewards';
import { rewardSkin } from '@/lib/events/rewardArtwork';
import type { RewardSummary } from '@/lib/events/rewardSummary';
import type { Skin } from '@/lib/skins/skinTypes';
import { downloadBlob } from '@/lib/ui/downloadBlob';
import { useImageViewport } from '@/lib/ui/useImageViewport';

export default function RewardImageDialog({ title, summary, artwork, rewardNote, skins, welfare, onClose }: {
  title: string; summary: RewardSummary; artwork?: string | null; rewardNote?: string | null;
  skins: Skin[]; welfare: EventWelfareOperator[]; onClose: () => void;
}) {
  const resolve = useContentUrl();
  const [image, setImage] = useState<{ blob: Blob; src: string; width: number; height: number } | null>(null);
  const { viewport, view, zoom, reset, handlers } = useImageViewport(image?.width ?? 1, image?.height ?? 1);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [note, setNote] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    let src: string | undefined;
    setImage(null);
    setFailed(false);
    void (async () => {
      try {
        const { drawRewardSummary } = await import('@/lib/events/rewardSummaryImage');
        const enriched = { ...summary, rows: summary.rows.map(row => row.label !== 'Outfits' ? row : { ...row, items: row.items.map(item => {
          const skin = rewardSkin(item.name, skins, item.iconPath);
          return skin?.image ? { ...item, artwork: skin.image } : item;
        }) }) };
        const { blob, width, height } = await drawRewardSummary({ title, summary: enriched, welfare: welfare.map(op => {
          const iconPath = getOperatorIconPath(op);
          return { name: op.name, iconPath, artwork: iconPath.replace('-star-icons/', '-star-skins/') };
        }), artwork: artwork ? resolve(artwork) : null, rewardNote, resolve });
        if (cancelled) return;
        src = URL.createObjectURL(blob);
        setImage({ blob, src, width, height });
      } catch { if (!cancelled) setFailed(true); }
    })();
    return () => { cancelled = true; if (src) URL.revokeObjectURL(src); };
  }, [title, summary, artwork, rewardNote, skins, welfare, resolve, attempt]);

  async function copyLink() {
    const link = new URL(window.location.href);
    link.hash = 'rewards/image';
    try { await navigator.clipboard.writeText(link.href); setNote('Link copied'); }
    catch { setNote(link.href); }
  }

  return <ImportDialog title={`${title} rewards`} className="reward-image-dialog account-dialog-fit" onClose={onClose}>
    <div className="reward-image-content">
    <div ref={viewport} className="reward-image-preview image-viewport" role="group" aria-label="Rewards image viewer" aria-describedby="reward-image-help" tabIndex={0} {...handlers} data-zoom={view.scale} aria-busy={!image && !failed} style={image ? { '--reward-image-ratio': `${image.width} / ${image.height}` } as CSSProperties : undefined}>
      {image ? <ContentImg src={image.src} alt={`${title}: event rewards infographic`} width={image.width} style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` }} draggable={false} />
        : failed ? <div><p role="alert">The picture could not be drawn in this browser.</p><button type="button" className="btn" onClick={() => setAttempt(value => value + 1)}>Try again</button></div>
          : <p className="hint" role="status">Preparing rewards image…</p>}
    </div>
    <div className="reward-image-footer">
      <div className="reward-image-zoom" role="group" aria-label="Image zoom">
        <button type="button" className="btn btn-sm" aria-label="Zoom out" disabled={!image || view.scale <= 1} onClick={() => zoom(view.scale / 1.5)}>−</button>
        <output aria-live="polite">{Math.round(view.scale * 100)}%</output>
        <button type="button" className="btn btn-sm" aria-label="Zoom in" disabled={!image || view.scale >= 5} onClick={() => zoom(view.scale * 1.5)}>+</button>
        <button type="button" className="btn btn-sm" disabled={!image} onClick={reset}>Fit image</button>
      </div>
      <p className="hint" id="reward-image-help">Scroll or pinch to zoom; drag or use arrow keys to move. Save image keeps the original resolution.</p>
      {note && <p className="hint" role="status">{note}</p>}
      <div className="reward-image-actions">
        <button type="button" className="btn" onClick={copyLink}>Copy link</button>
        <button type="button" className="btn primary" disabled={!image} onClick={() => {
          if (image) downloadBlob(image.blob, `${title.replace(/[\\/:*?"<>|]/g, '')} rewards.png`);
        }}>Save image</button>
      </div>
    </div>
    </div>
  </ImportDialog>;
}
