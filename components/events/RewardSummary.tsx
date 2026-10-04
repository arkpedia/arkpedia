import { useRef, useState } from 'react';
import Image from '@/components/content/ContentImage';
import type { RewardSummary as Summary, SummaryItem } from '@/lib/events/rewardSummary';

/*
 * An event's free rewards as one card, laid out the way community compilations share them, with
 * a link to it and a picture of it to share. The picture is drawn here on a canvas from the same
 * rows, in the page's own theme colours; the icons come from the asset host, which allows any
 * origin, so the canvas stays exportable.
 */
const fmt = (n: number) => n.toLocaleString('en-US');
/** `text` in lines no wider than `width`, at most `max` of them, the last ending in … if cut. */
function wrapText(ctx: CanvasRenderingContext2D, text: string, width: number, max: number): string[] {
  const lines: string[] = [];
  let current = '';
  for (const word of text.split(/\s+/)) {
    const next = current ? `${current} ${word}` : word;
    if (current && ctx.measureText(next).width > width) { lines.push(current); current = word; } else current = next;
  }
  if (current) lines.push(current);
  if (lines.length <= max) return lines;
  const kept = lines.slice(0, max);
  let last = `${kept[max - 1]}…`;
  while (last.length > 1 && ctx.measureText(last).width > width) last = `${last.slice(0, -2)}…`;
  kept[max - 1] = last;
  return kept;
}

function Tile({ item, register }: { item: SummaryItem; register: (name: string, el: HTMLImageElement | null) => void }) {
  return (
    <span className="reward-summary-tile" title={item.name}>
      {item.iconPath
        ? <><Image src={item.iconPath} alt="" width={40} height={40} ref={(el: HTMLImageElement | null) => register(item.name, el)} /><span className="visually-hidden">{item.name}</span></>
        : <span className="reward-summary-tile-name">{item.name}</span>}
      <b>×{fmt(item.count)}</b>
    </span>
  );
}

export function RewardSummaryCard({ eventName, summary }: { eventName: string; summary: Summary }) {
  const icons = useRef(new Map<string, HTMLImageElement>());
  const register = (name: string, el: HTMLImageElement | null) => { if (el) icons.current.set(name, el); };
  const [note, setNote] = useState<string | null>(null);

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
    setNote('Drawing…');
    try {
      const blob = await drawSummary(eventName, summary, icons.current);
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${eventName.replace(/^\[[^\]]*\]\s*/, '').replace(/[\\/:*?"<>|]/g, '')} rewards.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
      setNote(null);
    } catch {
      setNote('The picture could not be drawn in this browser.');
    }
  }

  return (
    <div className="reward-summary">
      <div className="reward-summary-actions">
        <span className="hint">Free rewards: {summary.sources.join(' + ')}</span>
        <span className="reward-summary-buttons">
          <button type="button" className="btn" onClick={copyLink}>Copy link</button>
          <button type="button" className="btn" onClick={saveImage}>Save image</button>
        </span>
      </div>
      {note && <p className="hint" role="status">{note}</p>}
      <div className="reward-summary-table">
        {summary.rows.map((row) => (
          <div key={row.label} className="reward-summary-row">
            <span className="reward-summary-label">{row.label}</span>
            <span className="reward-summary-items">{row.items.map((item) => <Tile key={item.name} item={item} register={register} />)}</span>
          </div>
        ))}
      </div>
      {summary.pulls.length > 0 && (
        <>
          <h3 className="reward-summary-heading">Orundum, Originite Prime and Headhunting Permits</h3>
          <div className="reward-summary-table">
            {summary.pulls.map((row) => (
              <div key={row.source} className="reward-summary-row">
                <span className="reward-summary-label">{row.source}</span>
                <span className="reward-summary-items">{row.items.map((item) => <Tile key={item.name} item={item} register={register} />)}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/** The card as a PNG: the same rows, in the page's theme. */
async function drawSummary(eventName: string, summary: Summary, rendered: Map<string, HTMLImageElement>): Promise<Blob> {
  const css = getComputedStyle(document.documentElement);
  const color = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback;
  const bg = color('--bg', '#0f1419'), panel = color('--panel-2', '#1b222b'), line = color('--line-soft', '#2a333d');
  const text = color('--text', '#e6e6e6'), dim = color('--text-dim', '#9aa4ad'), amber = color('--amber', '#e8b04a'), heading = color('--heading', '#4fd1c5');
  const font = getComputedStyle(document.body).fontFamily || 'sans-serif';
  const W = 1200, PAD = 28, LABEL = 210, CELL = 76, ICON = 44, ROW_GAP = 8;
  const perLine = Math.floor((W - PAD * 2 - LABEL) / CELL);
  const lines = (n: number) => Math.max(1, Math.ceil(n / perLine));
  const rowHeight = (n: number) => lines(n) * 74 + 12;
  const sections = [{ title: `${eventName.replace(/^\[[^\]]*\]\s*/, '')} — rewards (${summary.sources.join(' + ')})`, rows: summary.rows.map((r) => ({ label: r.label, items: r.items })) }];
  if (summary.pulls.length) sections.push({ title: 'Orundum, Originite Prime and Headhunting Permits', rows: summary.pulls.map((r) => ({ label: r.source, items: r.items })) });
  const H = PAD + sections.reduce((h, s) => h + 56 + s.rows.reduce((t, r) => t + rowHeight(r.items.length) + ROW_GAP, 0), 0) + 40;

  // Fresh, CORS-enabled copies of the icons the card has already loaded.
  const images = new Map<string, HTMLImageElement>();
  await Promise.all([...rendered.entries()].map(([name, el]) => new Promise<void>((resolve) => {
    const img = new window.Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => { images.set(name, img); resolve(); };
    img.onerror = () => resolve();
    img.src = el.currentSrc || el.src;
  })));

  const canvas = document.createElement('canvas');
  const scale = 2;
  canvas.width = W * scale;
  canvas.height = H * scale;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(scale, scale);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  let y = PAD;
  for (const section of sections) {
    ctx.fillStyle = heading;
    ctx.font = `700 20px ${font}`;
    ctx.textBaseline = 'top';
    ctx.fillText(section.title.toUpperCase(), PAD, y, W - PAD * 2);
    y += 40;
    for (const row of section.rows) {
      const h = rowHeight(row.items.length);
      ctx.fillStyle = panel;
      ctx.fillRect(PAD, y, W - PAD * 2, h);
      ctx.strokeStyle = line;
      ctx.strokeRect(PAD + 0.5, y + 0.5, W - PAD * 2 - 1, h - 1);
      ctx.fillStyle = text;
      ctx.font = `700 16px ${font}`;
      ctx.textBaseline = 'middle';
      ctx.fillText(row.label.toUpperCase(), PAD + 14, y + h / 2, LABEL - 24);
      row.items.forEach((item, i) => {
        const x = PAD + LABEL + (i % perLine) * CELL;
        const top = y + 8 + Math.floor(i / perLine) * 74;
        const img = images.get(item.name);
        ctx.textAlign = 'center';
        // An icon and its count, as on the page; an item with no icon gets its name in the icon's place.
        if (img) ctx.drawImage(img, x + (CELL - ICON) / 2, top, ICON, ICON);
        else {
          // The name, wrapped to at most three lines in the icon's square, as the page shows it.
          ctx.fillStyle = dim;
          ctx.font = `10px ${font}`;
          const lines = wrapText(ctx, item.name, CELL - 6, 3);
          lines.forEach((part, n) => ctx.fillText(part, x + CELL / 2, top + ICON / 2 + (n - (lines.length - 1) / 2) * 12));
        }
        ctx.fillStyle = amber;
        ctx.font = `700 15px ${font}`;
        ctx.fillText(fmt(item.count), x + CELL / 2, top + ICON + 12, CELL - 6);
        ctx.textAlign = 'left';
      });
      y += h + ROW_GAP;
    }
    y += 16;
  }
  ctx.fillStyle = dim;
  ctx.font = `12px ${font}`;
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(`arkpedia.net/events — ${eventName}`, PAD, H - 16);
  return new Promise((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('empty'))), 'image/png'));
}
