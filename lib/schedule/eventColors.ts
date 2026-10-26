export interface EventColor {
  background: string;
  text: string;
}

/** Prefer the extracted poster color. New events get a stable identity tint until
 * extraction catches up. `colors` is the release's data/event_colors.json from the page's
 * props: required, so no caller answers from a copy compiled into the bundle. */
export function getEventColor(eventName: string, colors: Record<string, EventColor>): EventColor {
  if (colors[eventName]) return colors[eventName];
  let hash = 0;
  for (const char of eventName) hash = (Math.imul(hash, 31) + char.codePointAt(0)!) | 0;
  return { background: `hsl(${(hash >>> 0) % 360} 52% 56%)`, text: '#18212a' };
}
