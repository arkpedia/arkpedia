export interface ChibiBounds { left: number; bottom: number; right: number; top: number }

/** Frame the main connected group of body parts, not detached scenery or effects.
 * Keep the complete animation envelope separately so these attachments still render. */
export function chibiBodyBounds(parts: ChibiBounds[]): ChibiBounds | undefined {
  const valid = parts.filter(p => Object.values(p).every(Number.isFinite) && p.right > p.left && p.top > p.bottom);
  const remaining = [...valid];
  let best: ChibiBounds[] = [];
  while (remaining.length) {
    const group = [remaining.pop()!];
    for (let i = 0; i < group.length; i++) {
      const a = group[i];
      for (let j = remaining.length - 1; j >= 0; j--) {
        const b = remaining[j];
        if (a.left <= b.right && a.right >= b.left && a.bottom <= b.top && a.top >= b.bottom) group.push(remaining.splice(j, 1)[0]);
      }
    }
    if (group.length > best.length) best = group;
  }
  if (!best.length) return undefined;
  const body = { left: Math.min(...best.map(p => p.left)), right: Math.max(...best.map(p => p.right)), bottom: Math.min(...best.map(p => p.bottom)), top: Math.max(...best.map(p => p.top)) };
  const full = { left: Math.min(...valid.map(p => p.left)), right: Math.max(...valid.map(p => p.right)), bottom: Math.min(...valid.map(p => p.bottom)), top: Math.max(...valid.map(p => p.top)) };
  // Preserve ordinary detached equipment; only correct substantially inflated frames.
  return Math.max((full.right - full.left) / (body.right - body.left), (full.top - full.bottom) / (body.top - body.bottom)) > 1.5 ? body : full;
}
