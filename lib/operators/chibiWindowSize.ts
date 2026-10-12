export type ChibiWindowEdge = 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw';
export interface ChibiWindowRect { x: number; y: number; width: number; height: number }
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

/** Resize against the opposite edge, keeping the whole viewer inside the page. */
export function resizeChibiWindow(rect: ChibiWindowRect, edge: ChibiWindowEdge, dx: number, dy: number, viewport: { width: number; height: number }): ChibiWindowRect {
  const margin = 8;
  const minWidth = Math.min(300, viewport.width - margin * 2);
  const minHeight = Math.min(320, viewport.height - margin * 2);
  let left = rect.x, right = rect.x + rect.width, top = rect.y, bottom = rect.y + rect.height;
  if (edge.includes('w')) left = clamp(left + dx, margin, right - minWidth);
  if (edge.includes('e')) right = clamp(right + dx, left + minWidth, viewport.width - margin);
  if (edge.includes('n')) top = clamp(top + dy, margin, bottom - minHeight);
  if (edge.includes('s')) bottom = clamp(bottom + dy, top + minHeight, viewport.height - margin);
  return { x: left, y: top, width: right - left, height: bottom - top };
}
