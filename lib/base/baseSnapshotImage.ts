export interface BaseImageRoom { title: string; lines: string[] }
/** Export the calculated numbers as a self-contained PNG, without remote image/CORS dependencies. */
export async function downloadBaseSnapshotImage(rooms: BaseImageRoom[], summary: string[]) {
  const width = 1440, cardWidth = 456, header = 150;
  const rowHeights = Array.from({ length: Math.ceil(rooms.length / 3) }, (_, row) => Math.max(...rooms.slice(row * 3, row * 3 + 3).map(room => 76 + room.lines.length * 25)));
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = header + rowHeights.reduce((sum, h) => sum + h + 16, 0) + 30;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Image export is unavailable in this browser.');
  ctx.fillStyle = '#101923'; ctx.fillRect(0, 0, width, canvas.height);
  ctx.fillStyle = '#f2f6fa'; ctx.font = 'bold 30px sans-serif'; ctx.fillText('ARKPEDIA · BASE SNAPSHOT', 24, 44);
  ctx.font = '18px sans-serif'; ctx.fillStyle = '#b7c6d3';
  summary.forEach((line, i) => ctx.fillText(line, 24, 76 + i * 25));
  let y = header;
  rowHeights.forEach((height, row) => {
    rooms.slice(row * 3, row * 3 + 3).forEach((room, col) => {
      const x = 24 + col * 468;
      ctx.fillStyle = '#1d2d3c'; ctx.fillRect(x, y, cardWidth, height);
      ctx.fillStyle = '#f2f6fa'; ctx.font = 'bold 21px sans-serif'; ctx.fillText(room.title, x + 16, y + 32, cardWidth - 32);
      ctx.font = '17px sans-serif'; ctx.fillStyle = '#c7d7e6';
      room.lines.forEach((line, i) => ctx.fillText(line, x + 16, y + 62 + i * 25, cardWidth - 32));
    });
    y += height + 16;
  });
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('Could not export image.')), 'image/png'));
  const url = URL.createObjectURL(blob), link = document.createElement('a');
  link.href = url; const now = new Date();
  const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  link.download = `arkpedia-base-${date}.png`; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
