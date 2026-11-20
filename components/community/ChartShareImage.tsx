import { useEffect, useId, useRef, useState } from 'react';
import ImportDialog from '@/components/account/ImportDialog';
import { useContentUrl } from '@/lib/content/context';
import type { TierItem } from '@/lib/tier-list/catalogue';
import { AXIS_ENDS, AXIS_OF, BINGO_COLUMNS, cellLabelColor, chartGrid, chartTitle, isBingoFreeCell, type ChartState } from '@/lib/tier-list/chart';
import { labelInk } from '@/lib/tier-list/state';
import { CHART_STRINGS as C } from '@/lib/tier-list/chartStrings';
import { TIER_LIST_STRINGS as T } from '@/lib/tier-list/strings';
import { drawTile, fitText, loadCanvasFonts, loadTileArt } from './shareCanvas';
import { tileImage } from './tierTile';
import styles from './TierList.module.css';

const WIDTH = 1200;
const PAD = 24;
const GAP = 6;
const TILE = 88;
/** The margin round the axes plane that holds its labels. */
const BAND = 44;
const BINGO_HEADER = 48;

function bingoLabel(context: CanvasRenderingContext2D, label: string, x: number, y: number, width: number) {
  const lines: string[] = [];
  for (const word of label.trim().split(/\s+/)) {
    const last = lines.at(-1);
    const next = last ? `${last} ${word}` : word;
    if (last && context.measureText(next).width <= width) lines[lines.length - 1] = next;
    else lines.push(word);
  }
  const shown = lines.length <= 3 ? lines : [...lines.slice(0, 2), lines.slice(2).join(' ')];
  shown.forEach((line, i) => context.fillText(fitText(context, line, width), x, y + (i - (shown.length - 1) / 2) * 16));
}

/**
 * The chart as one picture, drawn from the version on screen when the dialog opens: the
 * grid with its cells and labels, or the plane with its axes, their labels and every item
 * where the reader put it.
 */
export default function ChartShareImage({ state: initial, byId, onClose }: { state: ChartState; byId: ReadonlyMap<string, TierItem>; onClose: () => void }) {
  const [state] = useState(initial);
  const canvas = useRef<HTMLCanvasElement>(null);
  const url = useContentUrl();
  const descriptionId = useId();
  const [ready, setReady] = useState(false);
  const [message, setMessage] = useState<string>(T.imagePreparing);
  const [retry, setRetry] = useState(0);
  const { cols, rows, cells: savedCells } = chartGrid(state);
  const bingo = state.kind === 'bingo';
  const title = chartTitle(state).trim();
  const cells = savedCells.map((cell, index) => isBingoFreeCell(state, index)
    ? { label: C.bingoFree, items: [] }
    : { ...cell, items: cell.items.flatMap((id) => byId.get(id) ?? []) });
  const points = state.points.flatMap((point) => { const item = byId.get(point.id); return item ? [{ ...point, item }] : []; });
  const description = state.kind !== 'axes'
    ? cells.map((cell, i) => isBingoFreeCell(state, i) ? C.bingoFree : `${cell.label || C.cellItems('', Math.floor(i / cols) + 1, (i % cols) + 1)}: ${cell.items.map((item) => item.name).join(', ') || T.imageEmptyRow}`).join('. ')
    : `${AXIS_ENDS.filter((end) => state.lines[AXIS_OF[end]]).map((end) => state.axes[end]).filter(Boolean).join(', ')}. ${points.map((point) => point.item.name).join(', ')}`;

  useEffect(() => {
    const abort = new AbortController();
    let disposed = false;
    setReady(false);
    setMessage(T.imagePreparing);
    void (async () => {
      await loadCanvasFonts();
      const placed = state.kind !== 'axes' ? cells.flatMap((cell) => cell.items) : points.map((point) => point.item);
      const images = await loadTileArt(placed, url, abort.signal);
      const element = canvas.current;
      if (disposed || !element) return;
      const measure = element.getContext('2d');
      if (!measure) return;
      const head = title ? 84 : PAD;
      const foot = 52;
      const inner = WIDTH - PAD * 2;
      const tile = Math.round(Math.max(56, Math.min(240, TILE * state.zoom / 100)));
      // Grid: each row is as tall as its fullest cell needs.
      const cellWidth = (inner - (cols - 1) * GAP) / cols;
      const size = Math.min(tile, cellWidth - GAP * 2);
      const perLine = Math.max(1, Math.floor((cellWidth - GAP) / (size + GAP)));
      const labelHeight = bingo ? 58 : 34;
      const rowHeights = Array.from({ length: rows }, (_, row) => Math.max(bingo ? cellWidth : 0, ...cells.slice(row * cols, (row + 1) * cols).map((cell) => (bingo ? Math.ceil(cell.items.length / perLine) : Math.max(1, Math.ceil(cell.items.length / perLine))) * (size + GAP) + GAP + labelHeight)));
      const body = state.kind !== 'axes' ? rowHeights.reduce((sum, h) => sum + h + GAP, bingo ? BINGO_HEADER : 0) : inner;
      const height = head + body + foot;
      element.height = height;
      const c = element.getContext('2d');
      if (!c) return;
      const theme = getComputedStyle(document.documentElement);
      const ink = (token: string) => theme.getPropertyValue(token).trim();
      const inks = { ground: ink('--panel-2'), dim: ink('--text-dim'), scrimInk: ink('--scrim-ink'), scrimAmber: ink('--scrim-amber') };
      c.fillStyle = ink('--bg'); c.fillRect(0, 0, WIDTH, height);
      c.textBaseline = 'middle';
      if (title) {
        c.font = '700 40px Rajdhani'; c.fillStyle = ink('--text-bright'); c.textAlign = bingo ? 'center' : 'left';
        c.fillText(fitText(c, title, inner), bingo ? WIDTH / 2 : PAD, 46);
      }
      if (state.kind !== 'axes') {
        let y = head;
        if (bingo) {
          c.font = '700 36px Rajdhani'; c.fillStyle = ink('--text-bright'); c.textAlign = 'center';
          BINGO_COLUMNS.forEach((letter, col) => c.fillText(letter, PAD + col * (cellWidth + GAP) + cellWidth / 2, y + BINGO_HEADER / 2));
          y += BINGO_HEADER;
        }
        for (let row = 0; row < rows; row += 1) {
          const h = rowHeights[row];
          for (let col = 0; col < cols; col += 1) {
            const index = row * cols + col, cell = cells[index], x = PAD + col * (cellWidth + GAP);
            const free = isBingoFreeCell(state, index);
            c.fillStyle = ink(free ? '--well' : '--panel'); c.fillRect(x, y, cellWidth, h);
            const color = cellLabelColor(state, index);
            if (bingo && !free && savedCells[index].color) {
              c.fillStyle = color; c.fillRect(x, y + h - 3, cellWidth, 3);
            }
            if (bingo && !cell.items.length) {
              c.font = free ? '700 28px Rajdhani' : '700 29px Rajdhani';
              c.textAlign = 'center'; c.fillStyle = ink('--text-bright');
              bingoLabel(c, cell.label, x + cellWidth / 2, y + h / 2, cellWidth - 20);
              continue;
            }
            // Tiles centred in the cell, line by line.
            const tileHeight = Math.ceil(cell.items.length / perLine) * (size + GAP) - GAP;
            const tileTop = bingo ? y + (h - labelHeight - tileHeight) / 2 : y + GAP;
            cell.items.forEach((item, i) => {
              const line = Math.floor(i / perLine), inLine = Math.min(perLine, cell.items.length - line * perLine);
              const left = x + (cellWidth - (inLine * (size + GAP) - GAP)) / 2;
              drawTile(c, item, images.get(tileImage(item)), left + (i % perLine) * (size + GAP), tileTop + line * (size + GAP), size, state.names, inks);
            });
            // The label bar, in the reader's colour or the cell's accent, with ink picked for it.
            c.fillStyle = bingo ? ink('--panel-2') : color;
            c.fillRect(x, y + h - labelHeight, cellWidth, labelHeight - (bingo && savedCells[index].color ? 3 : 0));
            c.font = '700 20px Rajdhani'; c.textAlign = 'center'; c.fillStyle = bingo ? ink('--text-bright') : labelInk(color) === 'dark' ? '#14181c' : '#ffffff';
            if (bingo) bingoLabel(c, cell.label, x + cellWidth / 2, y + h - labelHeight / 2, cellWidth - 12);
            else c.fillText(fitText(c, cell.label, cellWidth - 12), x + cellWidth / 2, y + h - labelHeight / 2);
          }
          y += h + GAP;
        }
      } else {
        // The plane, with a band on each side of it for the label at that end of an axis:
        // outside the plane, as on the page, so no label lies over an item.
        const side = inner - BAND * 2, x0 = PAD + BAND, y0 = head + BAND, mid = side / 2;
        c.fillStyle = ink('--panel'); c.fillRect(x0, y0, side, side);
        c.strokeStyle = ink('--text-dim'); c.lineWidth = 3;
        c.beginPath();
        if (state.lines.vertical) { c.moveTo(x0 + mid, y0); c.lineTo(x0 + mid, y0 + side); }
        if (state.lines.horizontal) { c.moveTo(x0, y0 + mid); c.lineTo(x0 + side, y0 + mid); }
        c.stroke();
        c.save(); c.beginPath(); c.rect(x0, y0, side, side); c.clip();
        for (const point of points) drawTile(c, point.item, images.get(tileImage(point.item)), x0 + point.x * side - tile / 2, y0 + point.y * side - tile / 2, tile, state.names, inks);
        c.restore();
        c.font = '700 26px Rajdhani'; c.fillStyle = ink('--text-bright'); c.textAlign = 'center';
        // Top and bottom read across; left and right read along their edge, turned to face the plane.
        const along = (text: string, cx: number, cy: number, turn: number) => {
          if (!text.trim()) return;
          c.save(); c.translate(cx, cy); c.rotate(turn); c.fillText(fitText(c, text.trim(), side - 40), 0, 0); c.restore();
        };
        if (state.lines.vertical) { along(state.axes.top, x0 + mid, head + BAND / 2, 0); along(state.axes.bottom, x0 + mid, y0 + side + BAND / 2, 0); }
        if (state.lines.horizontal) { along(state.axes.left, PAD + BAND / 2, y0 + mid, -Math.PI / 2); along(state.axes.right, x0 + side + BAND / 2, y0 + mid, Math.PI / 2); }
      }
      c.font = '700 26px Rajdhani'; c.textAlign = 'left'; c.fillStyle = ink('--text-bright'); c.fillText(T.imageBrand, PAD, height - foot / 2);
      c.font = '400 14px "JetBrains Mono"'; c.textAlign = 'right'; c.fillStyle = ink('--text-dim'); c.fillText(C.imageSource, WIDTH - PAD, height - foot / 2);
      abort.abort();
      setReady(true);
      setMessage(placed.some((item) => !images.has(tileImage(item))) ? T.imageMissingArt : T.imageReady(WIDTH, height));
    })().catch(() => { abort.abort(); if (!disposed) setMessage(T.imageFailed); });
    return () => { disposed = true; abort.abort(); };
    // The dialog owns one snapshot of the chart; it redraws on an explicit retry only.
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
        link.href = address; link.download = C.imageFile; link.click();
        window.setTimeout(() => URL.revokeObjectURL(address), 1000);
        setMessage(T.imageDownloaded);
      }
    } catch (error) { setMessage(error instanceof Error ? error.message : T.imageFailed); }
  }

  return (
    <ImportDialog title={C.imageDialog} className={styles.imageDialog} onClose={onClose}>
      <canvas ref={canvas} width={WIDTH} height={400} className={styles.imageCanvas} role="img" aria-label={C.imageAlt(title)} aria-describedby={descriptionId} data-ready={ready ? '' : undefined} />
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
