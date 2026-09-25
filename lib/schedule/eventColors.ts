export interface EventColor {
  background: string;
  text: string;
}

/** Returns the extracted dominant color for an event, or null if it
 * hasn't been extracted yet (falls back to the existing fixed color
 * scheme in that case). `colors` is the release's data/event_colors.json from the page's
 * props: required, so no caller answers from a copy compiled into the bundle. */
export function getEventColor(eventName: string, colors: Record<string, EventColor>): EventColor | null {
  return colors[eventName] || null;
}