export function chibiDimensions(percent: number, viewportWidth: number, viewportHeight: number) {
  const scale = Math.min(Math.max(.5, Math.min(2, percent / 100)), Math.max(1, viewportWidth - 16) / 160, Math.max(1, viewportHeight - 16) / 180);
  return { width: 160 * scale, height: 180 * scale };
}
