import { loadAssetImage } from '@/lib/assets/assetRetry';
import type { RewardSummary, SummaryItem } from './rewardSummary';

/** Download-only renderer: no export library, DOM capture or new totals calculation. */
type Options = {
  title: string;
  summary: RewardSummary;
  artwork?: string | null;
  rewardNote?: string | null;
  resolve: (path: string) => string;
};

function lines(ctx: CanvasRenderingContext2D, text: string, width: number): string[] {
  const result: string[] = [];
  let line = '';
  // Split long unspaced names too, so untranslated items never escape their tile.
  for (const word of text.split(/\s+/)) {
    if (line && ctx.measureText(`${line} ${word}`).width > width) { result.push(line); line = ''; }
    for (const character of `${line ? ' ' : ''}${word}`) {
      if (line && ctx.measureText(line + character).width > width) { result.push(line); line = ''; }
      line += character;
    }
  }
  if (line) result.push(line);
  return result;
}

export async function drawRewardSummary({ title, summary, artwork, rewardNote, resolve }: Options): Promise<Blob> {
  const css = getComputedStyle(document.documentElement);
  const token = (name: string) => css.getPropertyValue(name).trim();
  const bg = token('--bg'), panel = token('--panel-2'), border = token('--line-soft');
  const text = token('--text'), dim = token('--text-dim'), amber = token('--amber');
  const font = getComputedStyle(document.body).fontFamily;
  const display = token('--font-display');
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas unavailable');

  // One bounded, parallel load includes offscreen tiles; slow/missing art cannot block saving.
  const urls = new Set(summary.rows.flatMap(row => row.items.flatMap(item => item.iconPath ? [resolve(item.iconPath)] : [])));
  if (artwork) urls.add(artwork);
  const images = new Map<string, HTMLImageElement>();
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), 4000);
  try {
    await Promise.all([...urls].map(async url => {
      try { images.set(url, await loadAssetImage(url, { crossOrigin: 'anonymous', signal: abort.signal })); }
      catch { /* Every item retains its name and quantity even without an icon. */ }
    }));
  } finally { clearTimeout(timer); }

  const W = 1440, PAD = 36, GAP = 14, COLS = 8, INNER = W - PAD * 2;
  const UNIT = (INNER - GAP * (COLS - 1)) / COLS;
  const ICON = 78, LABEL = 22, HEAD = 48;
  ctx.font = `700 44px ${display}`;
  const titleLines = lines(ctx, title, INNER);
  ctx.font = `20px ${font}`;
  const sourceLines = lines(ctx, summary.sources.join('  +  '), INNER);
  const headerHeight = 112 + titleLines.length * 48 + sourceLines.length * 26;
  // Older content releases tied CN reward provenance to dates, which may now be confirmed.
  const note = rewardNote?.replace('Global dates and rewards await confirmation', 'Global rewards await confirmation')
    || 'First-clear rewards can be earned once per account.';
  const noteLines = lines(ctx, note, INNER);

  type Card = { label: string; items: SummaryItem[]; columns: number; x: number; y: number; w: number; h: number; tileHeight: number };
  // Long furniture/material groups go last rather than stranding small groups below them.
  const rows = [...summary.rows.filter(row => row.items.length <= COLS), ...summary.rows.filter(row => row.items.length > COLS)];
  const cards: Card[] = rows.map(row => {
    ctx.font = `700 22px ${display}`;
    const columns = Math.min(COLS, Math.max(row.items.length, Math.ceil((ctx.measureText(row.label.toUpperCase()).width + 28 + GAP) / (UNIT + GAP))));
    return { ...row, columns, x: 0, y: 0, w: 0, h: 0, tileHeight: 0 };
  });
  let y = headerHeight;
  for (let i = 0; i < cards.length;) {
    const row: Card[] = [];
    let used = 0;
    while (i < cards.length && used + cards[i].columns <= COLS) { used += cards[i].columns; row.push(cards[i++]); }
    // Divide spare space among this row's cards without shrinking their tiles.
    const extra = (COLS - used) * (UNIT + GAP) / row.length;
    let x = PAD;
    for (const card of row) {
      card.w = card.columns * (UNIT + GAP) - GAP + extra;
      card.x = x; card.y = y;
      const per = Math.min(card.items.length, COLS);
      ctx.font = `18px ${font}`;
      const nameHeight = Math.max(...card.items.map(item => lines(ctx, item.name, (card.w - 24) / per - 12).length)) * LABEL;
      card.tileHeight = ICON + nameHeight + 54;
      card.h = HEAD + Math.ceil(card.items.length / COLS) * card.tileHeight + 14;
      x += card.w + GAP;
    }
    const tileHeight = Math.max(...row.map(card => card.tileHeight));
    const height = HEAD + Math.max(...row.map(card => Math.ceil(card.items.length / COLS))) * tileHeight + 14;
    for (const card of row) { card.h = height; card.tileHeight = tileHeight; }
    y += height + GAP;
  }
  const H = y + 66 + noteLines.length * 26;
  // A fixed export size on phone and desktop, crisp when shared or zoomed.
  canvas.width = W * 2; canvas.height = H * 2;
  ctx.scale(2, 2);
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
  const banner = artwork ? images.get(artwork) : null;
  if (banner) {
    const height = W * banner.naturalHeight / banner.naturalWidth;
    ctx.globalAlpha = 0.24;
    ctx.drawImage(banner, 0, 0, W, height);
    ctx.globalAlpha = 1;
    // Reach the page color at the banner's lower edge, without enlarging or cropping the art.
    const fade = ctx.createLinearGradient(0, height * 0.35, 0, height);
    fade.addColorStop(0, 'transparent'); fade.addColorStop(1, bg);
    ctx.fillStyle = fade; ctx.fillRect(0, 0, W, height);
  }
  ctx.textBaseline = 'top';
  ctx.fillStyle = amber; ctx.fillRect(PAD, 34, 44, 4);
  ctx.font = `700 22px ${display}`;
  ctx.fillText('EVENT REWARDS', PAD + 58, 25);
  ctx.fillStyle = text; ctx.textAlign = 'right'; ctx.fillText('ARKPEDIA', W - PAD, 25); ctx.textAlign = 'left';
  ctx.font = `700 44px ${display}`;
  titleLines.forEach((line, i) => ctx.fillText(line, PAD, 68 + i * 48));
  ctx.font = `20px ${font}`; ctx.fillStyle = text;
  sourceLines.forEach((line, i) => ctx.fillText(line, PAD, 80 + titleLines.length * 48 + i * 26));

  for (const card of cards) {
    ctx.save();
    ctx.globalAlpha = banner ? 0.74 : 1;
    ctx.fillStyle = panel; ctx.fillRect(card.x, card.y, card.w, card.h);
    ctx.restore();
    ctx.strokeStyle = border; ctx.strokeRect(card.x + 0.5, card.y + 0.5, card.w - 1, card.h - 1);
    ctx.fillStyle = amber; ctx.fillRect(card.x, card.y, 3, HEAD);
    ctx.fillStyle = text; ctx.font = `700 22px ${display}`;
    ctx.fillText(card.label.toUpperCase(), card.x + 16, card.y + 11);
    ctx.fillStyle = border; ctx.fillRect(card.x + 14, card.y + HEAD - 1, card.w - 28, 1);
    const per = Math.min(card.items.length, COLS), cell = (card.w - 24) / per;
    card.items.forEach((item, i) => {
      const center = card.x + 12 + (i % COLS + 0.5) * cell;
      const top = card.y + HEAD + 12 + Math.floor(i / COLS) * card.tileHeight;
      const image = item.iconPath ? images.get(resolve(item.iconPath)) : null;
      if (image) {
        const ratio = Math.min(ICON / image.naturalWidth, ICON / image.naturalHeight);
        const w = image.naturalWidth * ratio, h = image.naturalHeight * ratio;
        ctx.drawImage(image, center - w / 2, top + (ICON - h) / 2, w, h);
      }
      ctx.textAlign = 'center'; ctx.fillStyle = text; ctx.font = `18px ${font}`;
      lines(ctx, item.name, cell - 12).forEach((line, n) => ctx.fillText(line, center, top + ICON + 8 + n * LABEL));
      ctx.fillStyle = amber; ctx.font = `700 30px ${display}`;
      ctx.fillText(`×${item.count.toLocaleString('en-US')}`, center, card.y + HEAD + (Math.floor(i / COLS) + 1) * card.tileHeight - 28);
      ctx.textAlign = 'left';
    });
  }
  ctx.fillStyle = dim; ctx.font = `18px ${font}`;
  noteLines.forEach((line, i) => ctx.fillText(line, PAD, y + 10 + i * 26));
  ctx.font = `700 20px ${display}`;
  ctx.fillText('ARKPEDIA.NET  /  EVENT REWARDS', PAD, H - 34);
  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Empty image')), 'image/png'));
}
