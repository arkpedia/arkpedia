import eventColorsData from '@/data/event_colors.json';

export interface EventColor {
  background: string;
  text: string;
}

const EVENT_COLORS = eventColorsData as Record<string, EventColor>;

/** Returns the extracted dominant color for an event, or null if it
 * hasn't been extracted yet (falls back to the existing fixed color
 * scheme in that case). */
export function getEventColor(eventName: string): EventColor | null {
  return EVENT_COLORS[eventName] || null;
}