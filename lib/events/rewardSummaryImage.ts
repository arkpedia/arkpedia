import { loadAssetImage } from '@/lib/assets/assetRetry';
import type { RewardSummary, SummaryItem } from './rewardSummary';
import { withRewardRowTotal } from './rewardRowTotals';

/** Download-only renderer: no export library, DOM capture or new totals calculation. */
type Options = {
  title: string;
  summary: RewardSummary;
  artwork?: string | null;
  welfare?: Omit<SummaryItem, 'count'>[];
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

export async function drawRewardSummary({ title, summary, artwork, rewardNote, resolve, welfare = [] }: Options): Promise<Blob> {
  summary = { ...summary, rows: summary.rows.map(row => ({ ...row, items: row.items.map(item => row.label === 'Operators' && !item.artwork && item.iconPath?.includes('-star-icons/') ? { ...item, artwork: item.iconPath.replace('-star-icons/', '-star-skins/') } : item) })) };
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
  const urls = new Set(summary.rows.flatMap(row => row.items.flatMap(item => [item.iconPath, item.artwork].filter((path): path is string => !!path).map(resolve))));
  for (const op of welfare) for (const path of [op.iconPath, op.artwork]) if (path) urls.add(resolve(path));
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

  const W = 1440, PAD = 36, GAP = 14, INNER = W - PAD * 2;
  const features: (Omit<SummaryItem, 'count'> & { count?: number; label: string })[] = summary.rows.filter(row => ['Operators', 'Outfits'].includes(row.label)).flatMap(row => row.items.map(item => ({ ...item, label: row.label === 'Operators' ? 'FREE OPERATOR' : 'FREE SKIN' })));
  for (const op of welfare) if (!features.some(item => item.name === op.name)) features.push({ ...op, count: undefined, label: 'FREE OPERATOR' });
  const COLS = features.length ? 6 : 8, FEATURE = features.length ? 310 : 0;
  const gridX = PAD + (FEATURE ? FEATURE + GAP : 0), gridWidth = W - PAD - gridX;
  const UNIT = (gridWidth - GAP * (COLS - 1)) / COLS;
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

  type Card = { label: string; items: SummaryItem[]; columns: number; x: number; y: number; w: number; h: number; tileHeight: number; total?: { value: number; unit: string } };
  // Long furniture/material groups go last rather than stranding small groups below them.
  const materialRows = summary.rows.filter(row => !['Operators', 'Outfits'].includes(row.label)).map(row => withRewardRowTotal(row));
  const rows = [...materialRows.filter(row => row.items.length <= COLS), ...materialRows.filter(row => row.items.length > COLS)];
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
    let x = gridX;
    for (const card of row) {
      card.w = card.columns * (UNIT + GAP) - GAP + extra;
      card.x = x; card.y = y;
      const per = Math.min(card.items.length, COLS);
      ctx.font = `18px ${font}`;
      const nameHeight = Math.max(...card.items.map(item => lines(ctx, item.name, (card.w - 24) / per - 12).length)) * LABEL;
      card.tileHeight = ICON + nameHeight + 54;
      card.h = HEAD + Math.ceil(card.items.length / COLS) * card.tileHeight + (card.total ? 42 : 14);
      x += card.w + GAP;
    }
    const tileHeight = Math.max(...row.map(card => card.tileHeight));
    const height = HEAD + Math.max(...row.map(card => Math.ceil(card.items.length / COLS))) * tileHeight + (row.some(card => card.total) ? 42 : 14);
    for (const card of row) { card.h = height; card.tileHeight = tileHeight; }
    y += height + GAP;
  }
  y = Math.max(y, headerHeight + features.length * 360 + Math.max(0, features.length - 1) * GAP);
  const H = y + 66 + noteLines.length * 26;
  // A fixed export size on phone and desktop, crisp when shared or zoomed.
  // Keep exceptionally long stores below mobile Safari's canvas-area limit.
  const scale = Math.min(2, Math.sqrt(15_500_000 / (W * H)));
  canvas.width = Math.floor(W * scale); canvas.height = Math.floor(H * scale);
  ctx.scale(scale, scale);
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

  const featureHeight = features.length ? (y - headerHeight - GAP * features.length) / features.length : 0;
  features.forEach((item, index) => {
    const top = headerHeight + index * (featureHeight + GAP);
    ctx.save(); ctx.globalAlpha = banner ? 0.74 : 1; ctx.fillStyle = panel; ctx.fillRect(PAD, top, FEATURE, featureHeight); ctx.restore();
    ctx.strokeStyle = border; ctx.strokeRect(PAD + .5, top + .5, FEATURE - 1, featureHeight - 1);
    ctx.fillStyle = amber; ctx.font = `700 22px ${display}`; ctx.fillText(item.label, PAD + 16, top + 16);
    const image = (item.artwork ? images.get(resolve(item.artwork)) : null) ?? (item.iconPath ? images.get(resolve(item.iconPath)) : null);
    const artHeight = featureHeight - 152;
    if (image) { const ratio = Math.min((FEATURE - 28) / image.naturalWidth, artHeight / image.naturalHeight); const w = image.naturalWidth * ratio, h = image.naturalHeight * ratio; ctx.drawImage(image, PAD + (FEATURE - w) / 2, top + 58 + (artHeight - h) / 2, w, h); }
    ctx.textAlign = 'center'; ctx.fillStyle = text; ctx.font = `20px ${font}`;
    lines(ctx, item.name, FEATURE - 28).forEach((line, n) => ctx.fillText(line, PAD + FEATURE / 2, top + featureHeight - 88 + n * 23));
    ctx.fillStyle = amber; ctx.font = `700 30px ${display}`; if (item.count !== undefined) ctx.fillText(`×${item.count.toLocaleString('en-US')}`, PAD + FEATURE / 2, top + featureHeight - 34); ctx.textAlign = 'left';
  });

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
    if (card.total) {
      ctx.textAlign = 'right'; ctx.fillStyle = dim; ctx.font = `15px ${font}`;
      ctx.fillText(`Total ${card.total.value.toLocaleString('en-US', { maximumFractionDigits: 2 })} ${card.total.unit}`, card.x + card.w - 14, card.y + card.h - 24, card.w - 28);
      ctx.textAlign = 'left';
    }
  }
  ctx.fillStyle = dim; ctx.font = `18px ${font}`;
  noteLines.forEach((line, i) => ctx.fillText(line, PAD, y + 10 + i * 26));
  ctx.font = `700 20px ${display}`;
  ctx.fillText('ARKPEDIA.NET  /  EVENT REWARDS', PAD, H - 34);
  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Empty image')), 'image/png'));
}
