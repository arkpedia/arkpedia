import { isRerun } from '../events/eventName.mjs';
import { Skin } from '../skins/skinTypes';

/** Region and format tags a name may carry without changing which event it is:
 *  [CN], (CN), (event), [Side Story], [Rerun] and so on. */
function normalize(s: string): string {
  return (isRerun(s) ? `${s.replace(/\s+rerun\s*$/i, '')} rerun` : s)
    .toLowerCase()
    .replace(/\[[^\]]*\]/g, '')
    .replace(/\((?:cn|global|tw|event|jp|kr)\)/g, '')
    .replace(/^(?:cn|global|tw)\s*:/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Whether `short` is a whole-word prefix of `long`. Word-wise, never by
 *  characters: "stronghold protocol" is a character-prefix of "stronghold
 *  protocol alliance" and they are different events. */
function isWordPrefix(short: string, long: string): boolean {
  const a = short.split(' ');
  const b = long.split(' ');
  return a.length < b.length && b.slice(0, a.length).every((w, i) => w === a[i]);
}

/** What a skin's release text may add beyond an event's name while still meaning
 *  that event: a part or session marker and nothing else. */
const PART_MARKER = /^(?:part|pt|chapter|day|week|phase)?\s*\d*(?:st|nd|rd|th)?\s*(?:half|part|rerun|event|mission|special)?\s*$/;

/**
 * How well an event name and a skin's release text correspond. Lower is a better
 * match, and `null` is no match at all.
 *
 * The old test was `a.includes(b) || b.includes(a)` on the raw normalized strings,
 * which is true for any two names that merely share a stem. Every Stronghold
 * Protocol skin therefore matched every Stronghold Protocol event, and skins from
 * a run that ended in May showed as buyable during a later one. The same held for
 * a dozen Contingency Contract seasons, all collapsing onto one another.
 */
function matchRank(eventName: string, release: string): number | null {
  if (eventName === release) return 0;
  // An original release cannot establish a rerun's inventory (or the reverse).
  if (/\brerun$/.test(eventName) !== /\brerun$/.test(release)) return null;
  // The skin names a part of the event: "Heart of Surging Flame Part 2" -> the event.
  if (isWordPrefix(eventName, release)
      && PART_MARKER.test(release.split(' ').slice(eventName.split(' ').length).join(' '))) {
    return 1;
  }
  // The event carries a longer title for the same thing: "Ideal City" -> "Ideal
  // City: Endless Carnival". Weakest, because it is the direction that used to
  // let a later, longer-named event swallow an earlier skin.
  if (isWordPrefix(release, eventName)) return 2;
  return null;
}

/**
 * The skins an event sells.
 *
 * `allEventNames` is every event name in the schedule, and it is required. A weaker
 * match is only accepted when no other event matches that release better, so a skin
 * that names its own event exactly is never also handed to an event that merely
 * starts with the same words. Judging an event alone cannot see that, and gets
 * Stronghold Protocol's skins onto Stronghold Protocol Alliance 2nd Half.
 *
 * It was optional at first and that was a mistake worth naming: it made the buggy
 * answer the default, so the callers that forgot it kept the bug while looking
 * correct at the call site. Five of seven forgot it.
 */
export function getSkinsForEvent(eventName: string, skins: Skin[], allEventNames: string[]): Skin[] {
  const normEvent = normalize(eventName);
  if (!normEvent) return [];
  const others = allEventNames.map(normalize).filter(Boolean);

  return skins.filter((skin) => {
    if (!skin.release) return false;
    const normRelease = normalize(skin.release);
    if (!normRelease) return false;
    const rank = matchRank(normEvent, normRelease);
    if (rank === null) return false;
    if (rank === 0) return true;
    let best: number | null = null;
    for (const name of others) {
      const r = matchRank(name, normRelease);
      if (r !== null && (best === null || r < best)) best = r;
    }
    return rank === best;
  });
}

/**
 * Fails the build when the data drifts into a shape availability cannot answer.
 *
 * Two events matching one release exactly means two windows claim the same skin and
 * nothing here can tell them apart. The check is here rather than in a test because
 * this data is hand-maintained and arrives by edit, not by code: a new "Part 3" or a
 * renamed rerun is exactly the change that introduced this bug, and a build that
 * throws is the only kind of notice that cannot be missed.
 */
export function assertSkinMatching(eventNames: string[], skins: Skin[]): void {
  const names = eventNames.map(normalize).filter(Boolean);
  const ambiguous: string[] = [];
  for (const skin of skins) {
    if (!skin.release) continue;
    const normRelease = normalize(skin.release);
    if (!normRelease) continue;
    const exact = names.filter((n) => matchRank(n, normRelease) === 0);
    /* Release identities include the rerun marker; two different runs cannot claim one debut. */
    const distinct = new Set(exact);
    if (distinct.size > 1) {
      ambiguous.push(`${skin.name}: release "${skin.release}" matches ${distinct.size} different events exactly (${[...distinct].join('; ')})`);
    }
  }
  if (ambiguous.length > 0) {
    throw new Error(
      'Skin release text matches more than one event exactly, so availability cannot be decided:\n  '
      + ambiguous.join('\n  '),
    );
  }
}
