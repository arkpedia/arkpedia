import { useEffect, useId, useRef, useState } from 'react';
import ImportDialog from '@/components/account/ImportDialog';
import { loadAssetImage } from '@/lib/assets/assetRetry';
import { useContentUrl } from '@/lib/content/context';
import type { TierItem } from '@/lib/tier-list/catalogue';
import { labelInk, type TierListState } from '@/lib/tier-list/state';
import { TIER_LIST_STRINGS as T } from '@/lib/tier-list/strings';
import { cropsFromTop, tileImage } from './tierTile';
import styles from './TierList.module.css';

const WIDTH = 1200;
const PAD = 24;
const LABEL = 168;
const GAP = 6;
/** A tile at 100% zoom; the list's zoom scales it, within what a 1200px image can hold. */
const TILE = 88;

/**
 * The tier list as one picture: drawn on a canvas from the rows as they are when the
 * dialog opens, then saved as a PNG or copied. The art is loaded again with CORS (the
 * tiles on the page were not), since a canvas that drew anything else cannot be exported;
 * a picture that does not arrive is drawn as its name, and the image is still made.
 */
export default function TierListShareImage({ state: initial, byId, onClose }: { state: TierListState; byId: ReadonlyMap<string, TierItem>; onClose: () => void }) {
  const [state] = useState(initial);
  const canvas = useRef<HTMLCanvasElement>(null);
  const url = useContentUrl();
  const descriptionId = useId();
  const [ready, setReady] = useState(false);
  const [message, setMessage] = useState<string>(T.imagePreparing);
  const [retry, setRetry] = useState(0);
  const rows = state.rows.map((row) => ({ ...row, items: row.items.flatMap((id) => byId.get(id) ?? []) }));
  const description = rows.map((row, i) => `${T.rowName(row.label, i + 1)}: ${row.items.map((item) => item.name).join(', ') || T.imageEmptyRow}`).join('. ');

  useEffect(() => {
    const abort = new AbortController();
    let disposed = false;
    setReady(false);
    setMessage(T.imagePreparing);
    void (async () => {
      await Promise.race([document.fonts.ready, new Promise((resolve) => window.setTimeout(resolve, 1500))]);
      const images = new Map<string, HTMLImageElement>();
      const wanted = [...new Set(rows.flatMap((row) => row.items.map(tileImage)))];
      const deadline = new Promise<void>((resolve) => { const timer = window.setTimeout(resolve, 15000); abort.signal.addEventListener('abort', () => { window.clearTimeout(timer); resolve(); }, { once: true }); });
      await Promise.race([Promise.all(wanted.map(async (path) => { try { images.set(path, await loadAssetImage(url(path), { crossOrigin: 'anonymous', signal: abort.signal })); } catch { /* drawn as its name */ } })), deadline]);
      const element = canvas.current;
      if (disposed || !element) return;
      const tile = Math.round(Math.max(56, Math.min(240, TILE * state.zoom / 100)));
      const perLine = Math.max(1, Math.floor((WIDTH - PAD * 2 - LABEL - GAP) / (tile + GAP)));
      const heights = rows.map((row) => Math.max(1, Math.ceil(row.items.length / perLine)) * (tile + GAP) + GAP);
      const head = state.title.trim() ? 84 : PAD;
      const foot = 52;
      const height = head + heights.reduce((sum, h) => sum + h + GAP, 0) + foot;
      element.height = height;
      const c = element.getContext('2d');
      if (!c) return;
      const theme = getComputedStyle(document.documentElement);
      const ink = (token: string) => theme.getPropertyValue(token).trim();
      const fit = (text: string, width: number) => { let value = text; while (value.length && c.measureText(value).width > width) value = value.slice(0, -1); return value === text ? value : `${value.slice(0, -1)}…`; };
      const wrap = (text: string, width: number, lines: number) => {
        const out: string[] = [];
        let line = '';
        for (const word of text.split(/\s+/).filter(Boolean)) {
          const next = line ? `${line} ${word}` : word;
          if (c.measureText(next).width <= width || !line) line = next; else { out.push(line); line = word; }
        }
        if (line) out.push(line);
        return out.length > lines ? [...out.slice(0, lines - 1), fit(out.slice(lines - 1).join(' '), width)] : out.map((value) => fit(value, width));
      };
      const scrimInk = ink('--scrim-ink'), scrimAmber = ink('--scrim-amber');
      c.fillStyle = ink('--bg'); c.fillRect(0, 0, WIDTH, height);
      c.textBaseline = 'middle';
      if (state.title.trim()) { c.font = '700 40px Rajdhani'; c.fillStyle = ink('--text-bright'); c.textAlign = 'left'; c.fillText(fit(state.title.trim(), WIDTH - PAD * 2), PAD, 46); }
      let y = head;
      rows.forEach((row, index) => {
        const h = heights[index];
        c.fillStyle = ink('--panel'); c.fillRect(PAD, y, WIDTH - PAD * 2, h);
        c.fillStyle = row.color; c.fillRect(PAD, y, LABEL, h);
        c.font = '700 28px Rajdhani'; c.textAlign = 'center'; c.fillStyle = labelInk(row.color) === 'dark' ? '#14181c' : '#ffffff';
        const lines = wrap(row.label, LABEL - 20, Math.max(1, Math.floor((h - 12) / 32)));
        lines.forEach((line, i) => c.fillText(line, PAD + LABEL / 2, y + h / 2 + (i - (lines.length - 1) / 2) * 32));
        row.items.forEach((item, i) => {
          const x = PAD + LABEL + GAP + (i % perLine) * (tile + GAP), top = y + GAP + Math.floor(i / perLine) * (tile + GAP);
          const emblem = item.kind === 'factions';
          // A faction's white emblem keeps its fixed dark plate, whatever the theme.
          c.fillStyle = emblem ? 'rgb(20 27 34)' : ink('--panel-2'); c.fillRect(x, top, tile, tile);
          const image = images.get(tileImage(item));
          if (image && emblem) {
            const room = tile * 0.76, scale = Math.min(room / image.naturalWidth, room / image.naturalHeight);
            const w = image.naturalWidth * scale, h2 = image.naturalHeight * scale;
            c.drawImage(image, x + (tile - w) / 2, top + (tile - h2) / 2, w, h2);
          } else if (image) {
            // Cover the square: an illustration from its top edge (the figure's upper body), an icon from its centre.
            const side = Math.min(image.naturalWidth, image.naturalHeight);
            const sx = (image.naturalWidth - side) / 2, sy = cropsFromTop(item) ? 0 : (image.naturalHeight - side) / 2;
            c.drawImage(image, sx, sy, side, side, x, top, tile, tile);
          } else {
            c.font = '600 13px Inter'; c.textAlign = 'center'; c.fillStyle = ink('--text-dim');
            const name = wrap(item.name, tile - 10, 4);
            name.forEach((line, n) => c.fillText(line, x + tile / 2, top + tile / 2 + (n - (name.length - 1) / 2) * 16));
          }
          if (state.names && image) {
            // The name plate, as on the page: whose it is, then which of theirs.
            const lines = [item.label, ...(item.sub ? [item.sub] : [])];
            const lineHeight = 15, plate = lines.length * lineHeight + 5;
            c.fillStyle = 'rgb(0 0 0 / 74%)'; c.fillRect(x, top + tile - plate, tile, plate);
            c.font = '500 12px Inter'; c.textAlign = 'center';
            lines.forEach((line, n) => { c.fillStyle = n ? scrimAmber : scrimInk; c.fillText(fit(line, tile - 6), x + tile / 2, top + tile - plate + 3 + lineHeight / 2 + n * lineHeight); });
          }
        });
        y += h + GAP;
      });
      c.font = '700 26px Rajdhani'; c.textAlign = 'left'; c.fillStyle = ink('--text-bright'); c.fillText(T.imageBrand, PAD, height - foot / 2);
      c.font = '400 14px "JetBrains Mono"'; c.textAlign = 'right'; c.fillStyle = ink('--text-dim'); c.fillText(T.imageSource, WIDTH - PAD, height - foot / 2);
      abort.abort();
      setReady(true);
      setMessage(wanted.some((path) => !images.has(path)) ? T.imageMissingArt : T.imageReady(WIDTH, height));
    })().catch(() => { abort.abort(); if (!disposed) setMessage(T.imageFailed); });
    return () => { disposed = true; abort.abort(); };
    // The dialog owns one snapshot of the list; it redraws on an explicit retry only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [retry]);

  const blob = () => new Promise<Blob>((resolve, reject) => {
    try { canvas.current?.toBlob((value) => (value ? resolve(value) : reject(new Error(T.imageFailed))), 'image/png'); } catch { reject(new Error(T.imageFailed)); }
  });
  async function save(copy: boolean) {
    try {
      if (copy) {
        if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') throw new Error(T.imageCopyUnavailable);
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob() })]);
        setMessage(T.imageCopied);
      } else {
        const address = URL.createObjectURL(await blob());
        const link = document.createElement('a');
        link.href = address; link.download = T.imageFile; link.click();
        window.setTimeout(() => URL.revokeObjectURL(address), 1000);
        setMessage(T.imageDownloaded);
      }
    } catch (error) { setMessage(error instanceof Error ? error.message : T.imageFailed); }
  }

  return (
    <ImportDialog title={T.imageDialog} className={styles.imageDialog} onClose={onClose}>
      <canvas ref={canvas} width={WIDTH} height={400} className={styles.imageCanvas} role="img" aria-label={T.imageAlt(state.title)} aria-describedby={descriptionId} data-ready={ready ? '' : undefined} />
      <p id={descriptionId} className="visually-hidden">{description}</p>
      <div className={styles.imageActions}>
        <span className="hint" role="status">{message}</span>
        <button type="button" className="primary btn-sm" disabled={!ready} onClick={() => void save(false)}>{T.imageDownload}</button>
        <button type="button" className="ghost" disabled={!ready} onClick={() => void save(true)}>{T.imageCopy}</button>
        <button type="button" className="ghost" onClick={() => setRetry((value) => value + 1)}>{T.imageRetry}</button>
      </div>
    </ImportDialog>
  );
}
