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
/* A kind with more tiles than fit beside others (furniture: sixteen pieces) takes a line of its
   own; listed after the rest, so it does not push a one-tile kind onto a line alone. */
const WIDE = 10;
function packed<T extends { items: unknown[] }>(rows: T[]): T[] {
  return [...rows.filter((row) => row.items.length <= WIDE), ...rows.filter((row) => row.items.length > WIDE)];
}
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
        : <span className="reward-summary-tile-name"><span>{item.name}</span></span>}
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
        {packed(summary.rows).map((row) => (
          <div key={row.label} className="reward-summary-row">
            <span className="reward-summary-label">{row.label}</span>
            <span className="reward-summary-items">{row.items.map((item) => <Tile key={item.name} item={item} register={register} />)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** The card as a PNG: the same categories, packed as on the page, in the page's theme. */
async function drawSummary(eventName: string, summary: Summary, rendered: Map<string, HTMLImageElement>): Promise<Blob> {
  const css = getComputedStyle(document.documentElement);
  const color = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback;
  const bg = color('--bg', '#0f1419'), panel = color('--panel-2', '#1b222b'), line = color('--line-soft', '#2a333d');
  const text = color('--text', '#e6e6e6'), dim = color('--text-dim', '#9aa4ad'), amber = color('--amber', '#e8b04a'), heading = color('--heading', '#4fd1c5');
  const font = getComputedStyle(document.body).fontFamily || 'sans-serif';
  // A card per category: its label on top, its tiles below, as wide as they need; cards fill a
  // line left to right and share out what is left of it, as the page's wrapping cards do.
  const W = 1200, PAD = 28, CELL = 76, ICON = 44, TILE_H = 74, GAP = 8, INNER = 12, LABEL_H = 30, TITLE_H = 40, SECTION_GAP = 16;
  const inner = W - PAD * 2;
  const maxPer = Math.floor((inner - INNER * 2) / CELL);
  const measure = document.createElement('canvas').getContext('2d')!;
  measure.font = `700 13px ${font}`;
  type Card = { label: string; items: SummaryItem[]; x: number; y: number; w: number; h: number };
  const sections = [{ title: `${eventName.replace(/^\[[^\]]*\]\s*/, '')} — rewards (${summary.sources.join(' + ')})`, rows: packed(summary.rows).map((r) => ({ label: r.label, items: r.items })) }];
  let y = PAD;
  const laid = sections.map((section) => {
    const titleY = y;
    y += TITLE_H;
    const cards: Card[] = section.rows.map((row) => {
      const per = Math.max(1, Math.min(row.items.length, maxPer));
      const w = Math.min(inner, INNER * 2 + Math.max(measure.measureText(row.label.toUpperCase()).width, per * CELL));
      return { label: row.label, items: row.items, x: 0, y: 0, w, h: LABEL_H + Math.ceil(row.items.length / maxPer) * TILE_H + 6 };
    });
    for (let i = 0; i < cards.length;) {
      const lineCards: Card[] = [];
      let used = 0;
      while (i < cards.length && (lineCards.length === 0 || used + GAP + cards[i].w <= inner)) { used += (lineCards.length ? GAP : 0) + cards[i].w; lineCards.push(cards[i++]); }
      const extra = (inner - used) / lineCards.length, height = Math.max(...lineCards.map((c) => c.h));
      let x = PAD;
      for (const card of lineCards) { card.w += extra; card.x = x; card.y = y; card.h = height; x += card.w + GAP; }
      y += height + GAP;
    }
    y += SECTION_GAP;
    return { title: section.title, titleY, cards };
  });
  const H = y + 24;

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
  for (const section of laid) {
    ctx.fillStyle = heading;
    ctx.font = `700 20px ${font}`;
    ctx.textBaseline = 'top';
    ctx.fillText(section.title.toUpperCase(), PAD, section.titleY, inner);
    for (const card of section.cards) {
      ctx.fillStyle = panel;
      ctx.fillRect(card.x, card.y, card.w, card.h);
      ctx.strokeStyle = line;
      ctx.strokeRect(card.x + 0.5, card.y + 0.5, card.w - 1, card.h - 1);
      ctx.fillStyle = text;
      ctx.font = `700 13px ${font}`;
      ctx.textBaseline = 'middle';
      ctx.fillText(card.label.toUpperCase(), card.x + INNER, card.y + LABEL_H / 2 + 2, card.w - INNER * 2);
      card.items.forEach((item, i) => {
        const x = card.x + INNER + (i % maxPer) * CELL;
        const top = card.y + LABEL_H + Math.floor(i / maxPer) * TILE_H;
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
    }
  }
  ctx.fillStyle = dim;
  ctx.font = `12px ${font}`;
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(`arkpedia.net/events — ${eventName}`, PAD, H - 16);
  return new Promise((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('empty'))), 'image/png'));
}
