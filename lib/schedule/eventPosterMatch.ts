import { ScheduleEvent } from './scheduleTypes';

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/\[[^\]]*\]/g, '') // strip [Story Collection]/[Side Story]-style tags
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Whether `needle` appears in `haystack` as whole words.
 *
 * Plain substring containment matched things that merely share letters, and
 * every false positive it produced was a wrong banner on a card: the event "Ato"
 * matched "Trials for Navig-ato-r" and "Autom-ato-n Arena", and the Annihilation
 * zone "Kazdel" matched "A Kazdel-ian Rescue". Normalized names are
 * space-separated lowercase words, so checking the two ends is enough.
 */
function containsWords(haystack: string, needle: string): boolean {
  if (!needle) return false;
  for (let from = 0; ; ) {
    const at = haystack.indexOf(needle, from);
    if (at < 0) return false;
    const end = at + needle.length;
    if ((at === 0 || haystack[at - 1] === ' ') && (end === haystack.length || haystack[end] === ' ')) return true;
    from = at + 1;
  }
}

/** Finds the matching event's poster image, given a stage_index.json
 * event name (clean, e.g. "Crossing") against the per-year event records'
 * bracket-tagged names (e.g. "[Story Collection] Crossing"). This is
 * why stage banners weren't showing at all -- event names differ
 * between the two data sources, and the previous code didn't even
 * attempt a lookup (referenced a "cover" field that never existed on
 * the stage index's event entries).
 *
 * Containment is still two-way, because both directions are real: an event's
 * own name carries suffixes the stage data drops ("So Long, Adele: Home Away
 * From Home"), and a rerun's stage content adds one of its own ("Dorothy's
 * Vision - Retrospection", which is that event run again). It is whole words in
 * both directions now -- see containsWords. */
export function getEventPoster(eventName: string, events: ScheduleEvent[]): string | null {
  const target = normalize(eventName);
  if (!target) return null;

  // An exact match wins over a containment match ANYWHERE in the list, rather than
  // whichever comes first. Containment is a fallback for names that differ between
  // the two sources, and settling for the first event that merely contains the
  // target let a shorter name win outright: "Vector Breakthrough" is whole-word
  // contained in both "Vector Breakthrough Inorganic Matters" and "Vector
  // Breakthrough #2: Trial from Misery", so all three Vector Breakthroughs showed
  // the first one's banner -- while each of the three has its own poster, under its
  // own name, in the very same list.
  for (const event of events) {
    if (normalize(event.name) === target) return event.poster;
  }
  for (const event of events) {
    const normName = normalize(event.name);
    if (containsWords(normName, target) || containsWords(target, normName)) return event.poster;
  }
  return null;
}
