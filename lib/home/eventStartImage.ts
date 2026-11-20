import { loadAssetImage } from '@/lib/assets/assetRetry';
import { isReleaseEstimate } from '@/lib/time/releaseTiming';
import type { EventStartCard, EventStartRow } from './eventStartTimes';

const WIDTH = 1600;
const INSET = 56;
const COLUMN_GAP = 64;
const COLUMN_WIDTH = (WIDTH - INSET * 2 - COLUMN_GAP) / 2;
const PLACES_INSET = 182;
const LINE_HEIGHT = 30;

function wrap(ctx: CanvasRenderingContext2D, text: string, width: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(next).width > width) { lines.push(line); line = word; }
    else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

async function loadArtwork(url: string | null): Promise<HTMLImageElement | null> {
  if (!url) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3500);
  try { return await loadAssetImage(url, { crossOrigin: 'anonymous', signal: controller.signal }); }
  catch { return null; }
  finally { clearTimeout(timer); }
}

/** Pick a colorful part of the poster and lighten it for text on the dark card. */
function posterAccent(ctx: CanvasRenderingContext2D, artwork: HTMLImageElement | null, fallback: string): string {
  if (!artwork) return fallback;
  ctx.drawImage(artwork, 0, 0, 24, 12);
  const pixels = ctx.getImageData(0, 0, 24, 12).data;
  const colors = new Map<number, { rgb: number[]; weight: number }>();
  for (let index = 0; index < pixels.length; index += 4) {
    const rgb = [pixels[index], pixels[index + 1], pixels[index + 2]];
    const chroma = Math.max(...rgb) - Math.min(...rgb);
    if (pixels[index + 3] < 200 || chroma < 48) continue;
    const key = rgb.reduce((bucket, channel) => bucket * 4 + Math.floor(channel / 64), 0);
    const entry = colors.get(key) ?? { rgb, weight: 0 };
    entry.weight += chroma;
    colors.set(key, entry);
  }
  const best = [...colors.values()].sort((a, b) => b.weight - a.weight)[0];
  return best ? `rgb(${best.rgb.map(channel => Math.round(118 + channel * 0.53)).join(', ')})` : fallback;
}

export async function drawEventStartImage(card: EventStartCard, rows: EventStartRow[], artworkUrl: string | null, caption: string) {
  const artwork = await loadArtwork(artworkUrl);
  const css = getComputedStyle(document.documentElement);
  const token = (name: string) => css.getPropertyValue(name).trim();
  const ground = token('--scrim-ground');
  const ink = token('--scrim-ink');
  const muted = token('--scrim-ink-dim');
  const amber = token('--scrim-amber');
  const bright = token('--scrim-ink-bright');
  const display = token('--font-display');
  const titleFont = `700 82px ${display}`;
  const timeFont = `700 40px ${display}`;
  const bodyFont = `500 24px ${token('--font-body')}`;
  const labelFont = `500 21px ${token('--font-mono')}`;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas unavailable');
  const accent = posterAccent(ctx, artwork, token('--scrim-teal'));

  ctx.font = titleFont;
  const title = wrap(ctx, card.title, WIDTH - INSET * 2);
  const artworkHeight = artwork ? Math.min(520, Math.max(430, WIDTH * artwork.naturalHeight / artwork.naturalWidth)) : 205;
  const masthead = artworkHeight + (title.length - 1) * 76;
  ctx.font = bodyFont;
  const table = rows.map(row => {
    const places = wrap(ctx, row.places.join(' · '), COLUMN_WIDTH - PLACES_INSET);
    return { ...row, places, height: Math.max(71, places.length * LINE_HEIGHT + 20) };
  });
  const totalHeight = table.reduce((height, row) => height + row.height, 0);
  let leftHeight = 0;
  let split = 0;
  while (split < table.length && leftHeight + table[split].height / 2 < totalHeight / 2) {
    leftHeight += table[split].height;
    split++;
  }
  canvas.width = WIDTH;
  canvas.height = masthead + 137 + Math.max(leftHeight, totalHeight - leftHeight);
  ctx.fillStyle = ground;
  ctx.fillRect(0, 0, WIDTH, canvas.height);
  ctx.globalAlpha = 0.08;
  ctx.fillStyle = accent;
  ctx.fillRect(0, 0, WIDTH, canvas.height);
  ctx.globalAlpha = 1;

  if (artwork) {
    const scale = Math.max(WIDTH / artwork.naturalWidth, artworkHeight / artwork.naturalHeight);
    const width = artwork.naturalWidth * scale;
    const height = artwork.naturalHeight * scale;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, WIDTH, artworkHeight);
    ctx.clip();
    ctx.drawImage(artwork, (WIDTH - width) / 2, (artworkHeight - height) * 0.42, width, height);
    const shade = ctx.createLinearGradient(0, 0, 0, artworkHeight);
    shade.addColorStop(0.2, `${ground}00`);
    shade.addColorStop(0.55, `${ground}50`);
    shade.addColorStop(0.81, `${ground}ec`);
    shade.addColorStop(1, ground);
    ctx.fillStyle = shade;
    ctx.fillRect(0, 0, WIDTH, artworkHeight);
    ctx.restore();
  }

  ctx.font = labelFont;
  ctx.fillStyle = accent;
  ctx.fillRect(INSET, artworkHeight - 163, ctx.measureText('START TIMES').width + 28, 34);
  ctx.fillStyle = ground;
  ctx.fillText('START TIMES', INSET + 14, artworkHeight - 139);
  ctx.font = titleFont;
  ctx.fillStyle = bright;
  title.forEach((part, index) => ctx.fillText(part, INSET, artworkHeight - 52 + index * 76, WIDTH - INSET * 2));
  ctx.font = labelFont;
  ctx.fillStyle = isReleaseEstimate(card.timing) ? amber : ink;
  ctx.fillText(caption, INSET, masthead - 12);
  ctx.fillStyle = accent;
  ctx.fillRect(INSET, masthead + 21, WIDTH - INSET * 2, 3);

  const utcDay = new Date(card.instant).toISOString().slice(0, 10);
  [table.slice(0, split), table.slice(split)].forEach((column, index) => {
    const x = INSET + index * (COLUMN_WIDTH + COLUMN_GAP);
    let y = masthead + 46;
    for (const row of column) {
      ctx.fillStyle = ink;
      ctx.globalAlpha = 0.15;
      ctx.fillRect(x, y + row.height, COLUMN_WIDTH, 1);
      ctx.globalAlpha = 1;
      ctx.font = timeFont;
      ctx.fillStyle = bright;
      ctx.fillText(row.time, x, y + 30);
      ctx.font = labelFont;
      ctx.fillStyle = row.key.startsWith(utcDay) ? muted : accent;
      ctx.fillText(row.date, x, y + 55);
      ctx.font = bodyFont;
      ctx.fillStyle = bright;
      row.places.forEach((place, line) => ctx.fillText(place, x + PLACES_INSET, y + 28 + line * LINE_HEIGHT));
      y += row.height;
    }
  });
  ctx.fillStyle = accent;
  ctx.font = labelFont;
  ctx.textAlign = 'right';
  ctx.fillText('ARKPEDIA.NET', WIDTH - INSET, canvas.height - 36);

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(value => value ? resolve(value) : reject(new Error('Could not export image')), 'image/png');
  });
  return { blob, width: canvas.width, height: canvas.height };
}
