import { useEffect, useId, useRef, useState } from 'react';
import ImportDialog from '@/components/account/ImportDialog';
import { useContentUrl } from '@/lib/content/context';
import type { TierItem } from '@/lib/tier-list/catalogue';
import { labelInk, type TierListState } from '@/lib/tier-list/state';
import { TIER_LIST_STRINGS as T } from '@/lib/tier-list/strings';
import { drawTile, fitText, loadCanvasFonts, loadTileArt, wrapText } from './shareCanvas';
import { tileImage } from './tierTile';
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
      await loadCanvasFonts();
      const placed = rows.flatMap((row) => row.items);
      const images = await loadTileArt(placed, url, abort.signal);
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
      const fit = (text: string, width: number) => fitText(c, text, width);
      const wrap = (text: string, width: number, lines: number) => wrapText(c, text, width, lines);
      const inks = { ground: ink('--panel-2'), dim: ink('--text-dim'), scrimInk: ink('--scrim-ink'), scrimAmber: ink('--scrim-amber') };
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
          drawTile(c, item, images.get(tileImage(item)), x, top, tile, state.names, inks);
        });
        y += h + GAP;
      });
      c.font = '700 26px Rajdhani'; c.textAlign = 'left'; c.fillStyle = ink('--text-bright'); c.fillText(T.imageBrand, PAD, height - foot / 2);
      c.font = '400 14px "JetBrains Mono"'; c.textAlign = 'right'; c.fillStyle = ink('--text-dim'); c.fillText(T.imageSource, WIDTH - PAD, height - foot / 2);
      abort.abort();
      setReady(true);
      setMessage(placed.some((item) => !images.has(tileImage(item))) ? T.imageMissingArt : T.imageReady(WIDTH, height));
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
