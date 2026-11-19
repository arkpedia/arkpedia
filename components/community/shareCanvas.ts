import { loadAssetImage } from '@/lib/assets/assetRetry';
import type { TierItem } from '@/lib/tier-list/catalogue';
import { cropsFromTop, tileImage } from './tierTile';

/*
 * What the makers' share images have in common (TierListShareImage, ChartShareImage): the
 * art, loaded again with CORS (the tiles on the page were not, and a canvas that drew
 * anything else cannot be exported), and one tile drawn as the page draws it.
 */

/** Every item's picture by its tile path, as far as it arrived within the deadline. */
export async function loadTileArt(items: readonly TierItem[], url: (path: string) => string, signal: AbortSignal): Promise<Map<string, HTMLImageElement>> {
  const images = new Map<string, HTMLImageElement>();
  const wanted = [...new Set(items.map(tileImage))];
  const deadline = new Promise<void>((resolve) => { const timer = window.setTimeout(resolve, 15000); signal.addEventListener('abort', () => { window.clearTimeout(timer); resolve(); }, { once: true }); });
  await Promise.race([Promise.all(wanted.map(async (path) => { try { images.set(path, await loadAssetImage(url(path), { crossOrigin: 'anonymous', signal })); } catch { /* drawn as its name */ } })), deadline]);
  return images;
}

/** The faces the images draw in, asked for by name: a canvas does not wait for a webfont the
 *  page has not used yet at that weight, and draws a serif in its place. */
export function loadCanvasFonts(): Promise<unknown> {
  const faces = ['500 12px Inter', '600 13px Inter', '700 26px Rajdhani', '400 14px "JetBrains Mono"'];
  return Promise.race([Promise.all(faces.map((face) => document.fonts.load(face))).then(() => document.fonts.ready), new Promise((resolve) => window.setTimeout(resolve, 2500))]).catch(() => undefined);
}

export const fitText = (c: CanvasRenderingContext2D, text: string, width: number) => { let value = text; while (value.length && c.measureText(value).width > width) value = value.slice(0, -1); return value === text ? value : `${value.slice(0, -1)}…`; };

export function wrapText(c: CanvasRenderingContext2D, text: string, width: number, lines: number): string[] {
  const out: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${word}` : word;
    if (c.measureText(next).width <= width || !line) line = next; else { out.push(line); line = word; }
  }
  if (line) out.push(line);
  return out.length > lines ? [...out.slice(0, lines - 1), fitText(c, out.slice(lines - 1).join(' '), width)] : out.map((value) => fitText(c, value, width));
}

export interface TileInks { ground: string; dim: string; scrimInk: string; scrimAmber: string }

/** One tile at (x, top): its picture cropped as on the page, a faction's emblem on its fixed
 *  dark plate, its name where the art did not arrive, and its name plate when names are on. */
export function drawTile(c: CanvasRenderingContext2D, item: TierItem, image: HTMLImageElement | undefined, x: number, top: number, tile: number, names: boolean, inks: TileInks) {
  const emblem = item.kind === 'factions';
  c.save();
  c.textBaseline = 'middle';
  c.fillStyle = emblem ? 'rgb(20 27 34)' : inks.ground; c.fillRect(x, top, tile, tile);
  if (image && emblem) {
    const room = tile * 0.76, scale = Math.min(room / image.naturalWidth, room / image.naturalHeight);
    const w = image.naturalWidth * scale, h = image.naturalHeight * scale;
    c.drawImage(image, x + (tile - w) / 2, top + (tile - h) / 2, w, h);
  } else if (image) {
    // Cover the square: an illustration from its top edge (the figure's upper body), an icon from its centre.
    const side = Math.min(image.naturalWidth, image.naturalHeight);
    const sx = (image.naturalWidth - side) / 2, sy = cropsFromTop(item) ? 0 : (image.naturalHeight - side) / 2;
    c.drawImage(image, sx, sy, side, side, x, top, tile, tile);
  } else {
    c.font = '600 13px Inter'; c.textAlign = 'center'; c.fillStyle = inks.dim;
    const name = wrapText(c, item.name, tile - 10, 4);
    name.forEach((line, n) => c.fillText(line, x + tile / 2, top + tile / 2 + (n - (name.length - 1) / 2) * 16));
  }
  if (names && image) {
    // The name plate, as on the page: whose it is, then which of theirs.
    const lines = [item.label, ...(item.sub ? [item.sub] : [])];
    const lineHeight = 15, plate = lines.length * lineHeight + 5;
    c.fillStyle = 'rgb(0 0 0 / 74%)'; c.fillRect(x, top + tile - plate, tile, plate);
    c.font = '500 12px Inter'; c.textAlign = 'center';
    lines.forEach((line, n) => { c.fillStyle = n ? inks.scrimAmber : inks.scrimInk; c.fillText(fitText(c, line, tile - 6), x + tile / 2, top + tile - plate + 3 + lineHeight / 2 + n * lineHeight); });
  }
  c.restore();
}
