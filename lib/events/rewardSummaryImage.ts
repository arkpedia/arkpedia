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
  const COLS = 8, UNIT = (INNER - GAP * (COLS - 1)) / COLS;
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

  type Feature = (typeof features)[number] & { x: number; y: number; w: number; h: number; artHeight: number; nameLines: string[]; image?: HTMLImageElement };
  const featureCards: Feature[] = [];
  // One or two rewards sit beside the opening material rows. Larger collections
  // form a compact gallery above them, instead of an increasingly tall sidebar.
  const rail = features.length > 0 && features.length <= 2;
  const railColumns = rail ? features.length * 2 : 0;
  const featureColumns = Math.min(3, features.length);
  const featureWidth = rail ? UNIT * 2 + GAP : (INNER - GAP * (featureColumns - 1)) / featureColumns;
  let featureBottom = headerHeight;
  for (let i = 0; i < features.length;) {
    const batch = features.slice(i, i + featureColumns);
    ctx.font = `20px ${font}`;
    const prepared = batch.map(item => ({ ...item,
      image: (item.artwork ? images.get(resolve(item.artwork)) : null) ?? (item.iconPath ? images.get(resolve(item.iconPath)) : undefined),
      nameLines: lines(ctx, item.name, featureWidth - 32),
    }));
    const artHeight = prepared.some(item => item.image) ? (rail ? 340 : 280) : 0;
    const height = 58 + artHeight + 14 + Math.max(...prepared.map(item => item.nameLines.length)) * 23
      + (prepared.some(item => item.count !== undefined) ? 44 : 10) + 16;
    prepared.forEach((item, column) => featureCards.push({ ...item, x: PAD + column * (featureWidth + GAP), y: featureBottom, w: featureWidth, h: height, artHeight }));
    featureBottom += height + GAP;
    i += batch.length;
  }
  if (featureCards.length) featureBottom -= GAP;

  type Card = { label: string; items: SummaryItem[]; perRow: number; x: number; y: number; w: number; h: number; tileHeight: number; total?: { value: number; unit: string } };
  const materialRows = summary.rows.filter(row => !['Operators', 'Outfits'].includes(row.label)).map(row => withRewardRowTotal(row));
  const rows = [...materialRows.filter(row => row.items.length <= COLS), ...materialRows.filter(row => row.items.length > COLS)];
  const cards: Card[] = [];
  let y = !rail && features.length ? featureBottom + GAP : headerHeight;
  for (let i = 0; i < rows.length;) {
    // Snap a nearly complete opening block to the gutter, so a tiny height
    // difference cannot strand the final material row beside an empty rail.
    if (rail && y > headerHeight && y < featureBottom && featureBottom - y <= GAP * 2) y = featureBottom + GAP;
    const besideFeatures = rail && y < featureBottom;
    const columns = besideFeatures ? COLS - railColumns : COLS;
    const gridX = besideFeatures ? PAD + railColumns * (UNIT + GAP) : PAD;
    const row: { card: Card; columns: number }[] = [];
    let used = 0;
    while (i < rows.length) {
      const next = rows[i];
      ctx.font = `700 22px ${display}`;
      const span = Math.min(columns, Math.max(next.items.length, Math.ceil((ctx.measureText(next.label.toUpperCase()).width + 28 + GAP) / (UNIT + GAP))));
      if (used + span > columns) break;
      used += span;
      row.push({ card: { ...next, perRow: Math.min(next.items.length, columns), x: 0, y, w: 0, h: 0, tileHeight: 0 }, columns: span });
      i++;
    }
    const extra = (columns - used) * (UNIT + GAP) / row.length;
    let x = gridX;
    for (const { card, columns: span } of row) {
      card.w = span * (UNIT + GAP) - GAP + extra;
      card.x = x;
      ctx.font = `18px ${font}`;
      const nameHeight = Math.max(...card.items.map(item => lines(ctx, item.name, (card.w - 24) / card.perRow - 12).length)) * LABEL;
      card.tileHeight = ICON + nameHeight + 54;
      x += card.w + GAP;
    }
    const tileHeight = Math.max(...row.map(({ card }) => card.tileHeight));
    const height = HEAD + Math.max(...row.map(({ card }) => Math.ceil(card.items.length / card.perRow))) * tileHeight + (row.some(({ card }) => card.total) ? 42 : 14);
    for (const { card } of row) { card.h = height; card.tileHeight = tileHeight; cards.push(card); }
    y += height + GAP;
  }
  y = Math.max(y, featureBottom + (features.length ? GAP : 0));
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

  for (const item of featureCards) {
    ctx.save(); ctx.globalAlpha = banner ? 0.74 : 1; ctx.fillStyle = panel; ctx.fillRect(item.x, item.y, item.w, item.h); ctx.restore();
    ctx.strokeStyle = border; ctx.strokeRect(item.x + .5, item.y + .5, item.w - 1, item.h - 1);
    ctx.fillStyle = amber; ctx.fillRect(item.x, item.y, 3, HEAD);
    ctx.font = `700 22px ${display}`; ctx.fillText(item.label, item.x + 16, item.y + 16);
    if (item.image) {
      const ratio = Math.min((item.w - 32) / item.image.naturalWidth, item.artHeight / item.image.naturalHeight);
      const w = item.image.naturalWidth * ratio, h = item.image.naturalHeight * ratio;
      ctx.drawImage(item.image, item.x + (item.w - w) / 2, item.y + 58 + (item.artHeight - h) / 2, w, h);
    }
    const nameTop = item.y + 58 + item.artHeight + 14;
    ctx.textAlign = 'center'; ctx.fillStyle = text; ctx.font = `20px ${font}`;
    item.nameLines.forEach((line, n) => ctx.fillText(line, item.x + item.w / 2, nameTop + n * 23));
    ctx.fillStyle = amber; ctx.font = `700 30px ${display}`;
    if (item.count !== undefined) ctx.fillText(`×${item.count.toLocaleString('en-US')}`, item.x + item.w / 2, nameTop + item.nameLines.length * 23 + 12);
    ctx.textAlign = 'left';
  }

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
    const cell = (card.w - 24) / card.perRow;
    card.items.forEach((item, i) => {
      const center = card.x + 12 + (i % card.perRow + 0.5) * cell;
      const top = card.y + HEAD + 12 + Math.floor(i / card.perRow) * card.tileHeight;
      const image = item.iconPath ? images.get(resolve(item.iconPath)) : null;
      if (image) {
        const ratio = Math.min(ICON / image.naturalWidth, ICON / image.naturalHeight);
        const w = image.naturalWidth * ratio, h = image.naturalHeight * ratio;
        ctx.drawImage(image, center - w / 2, top + (ICON - h) / 2, w, h);
      }
      ctx.textAlign = 'center'; ctx.fillStyle = text; ctx.font = `18px ${font}`;
      lines(ctx, item.name, cell - 12).forEach((line, n) => ctx.fillText(line, center, top + ICON + 8 + n * LABEL));
      ctx.fillStyle = amber; ctx.font = `700 30px ${display}`;
      ctx.fillText(`×${item.count.toLocaleString('en-US')}`, center, card.y + HEAD + (Math.floor(i / card.perRow) + 1) * card.tileHeight - 28);
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
