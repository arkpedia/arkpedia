/** Stable English-site title; the original remains searchable. */
export function songTitle(title: string, altTitle?: string | null): string {
  return altTitle?.trim() || title;
}

/** Preview follows playback order, including the repeat boundary. */
export function upcomingIndices(order: readonly number[], position: number, repeat: 'off' | 'one' | 'all', count = 3): number[] {
  if (!order.length || repeat === 'one') return [];
  if (repeat === 'off') return order.slice(position + 1, position + 1 + count);
  return Array.from({ length: Math.min(count, order.length) }, (_, i) => order[(position + 1 + i) % order.length]);
}

export function lyricPreview<T extends { time: number; text: string }>(lines: readonly T[], seconds: number): { line: T; active: boolean }[] {
  const synced = lines.some(line => line.time > 0);
  if (!synced) return lines.slice(0, 3).map(line => ({ line, active: false }));
  let active = -1;
  lines.forEach((line, index) => { if (line.time <= seconds) active = index; });
  const start = Math.min(Math.max(0, active - 1), Math.max(0, lines.length - 3));
  return lines.slice(start, start + 3).map((line, i) => ({ line, active: start + i === active }));
}
