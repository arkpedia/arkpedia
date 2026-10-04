/**
 * Reading Arknights Global's official event announcements (www.arknights.global news, cached by
 * scripts/sync/sync-official-news.mjs into data/official-news/global/<id>.json).
 *
 * An announcement is numbered sections ("01 SIDESTORY: PEOPLE, A PEOPLE OPEN", "06 LIMITED-TIME
 * PACKS AVAILABLE"), each a run of KEY: value lines (DURATION, DETAILS, REWARDS, CONTENTS). Every
 * section belongs to the announced event, which is what groups an event's packs, gifts and
 * furniture with it. Only what the post states outright is read as data: a pack's CONTENTS
 * (`Item * N`); a section's REWARDS prose ("..., etc.") is kept as written, never counted.
 */

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', rsquo: "'", lsquo: "'", ldquo: '"', rdquo: '"', ndash: '–', mdash: '—', times: '×', hellip: '…' };
/** HTML entities decoded, again until none is left: posts are sometimes encoded twice ("&amp;apos;"). */
export function decodeEntities(text) {
  let before;
  do {
    before = text;
    text = text.replace(/&(?:#x([0-9a-f]+)|#(\d+)|([a-z]+));/gi, (whole, hex, dec, name) =>
      hex ? String.fromCodePoint(parseInt(hex, 16)) : dec ? String.fromCodePoint(Number(dec)) : ENTITIES[name.toLowerCase()] ?? whole);
  } while (text !== before);
  return text;
}

/** The post's HTML as trimmed lines, with "KEY :" spelled "KEY:". */
export function newsLines(html) {
  const text = decodeEntities(String(html ?? '')
    .replace(/<br\s*\/?>|<\/(?:p|li|tr|h\d|div)>/gi, '\n')
    .replace(/<[^>]+>/g, ' '))
    .replace(/\u00a0/g, ' ');
  return text.split('\n').map(line => line.replace(/[ \t]+/g, ' ').trim().replace(/^([A-Z][A-Z ]{1,20}?)\s+:/, '$1:')).filter(Boolean);
}

/** The numbered sections: { number, title, lines }. A heading is "NN TITLE" in capitals. */
export function newsSections(lines) {
  const sections = [];
  let current = null;
  for (const line of lines) {
    const heading = line.match(/^(\d{2})\s+(.+)$/);
    if (heading && heading[2] === heading[2].toUpperCase() && /[A-Z]/.test(heading[2])) {
      current = { number: heading[1], title: heading[2].replace(/\s+/g, ' ').trim(), lines: [] };
      sections.push(current);
    } else if (current) {
      current.lines.push(line);
    }
  }
  return sections;
}

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
/** "September 16, 2026, 08:00 – October 7, 2026, 03:59 (UTC-7)" as { start, end } ISO instants. */
export function parseDuration(line) {
  const stamps = [...String(line ?? '').matchAll(/([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4}),?\s*(\d{1,2}):(\d{2})/g)];
  const at = match => {
    const month = MONTHS.indexOf(match[1].toLowerCase());
    if (month < 0) return null;
    return new Date(Date.UTC(+match[3], month, +match[2], +match[4] + 7, +match[5])).toISOString();
  };
  const [start, end] = stamps.map(at);
  return start ? { start, end: end ?? null } : null;
}

/** "Caster Chip Pack * 8, Caster Chip * 5, and LMD * 210000." as [{ name, count }]. */
export function parseContents(value) {
  // A comma between items, never one inside a number ("LMD * 1,000,000").
  return String(value ?? '').replace(/\.\s*$/, '').split(/,(?!\d{3}(?!\d))\s*(?:and\s+)?|\s+and\s+/)
    .map(part => part.trim().match(/^(.+?)\s*[*×xX]\s*([\d,]+)$/))
    .filter(Boolean)
    .map(match => ({ name: match[1].replace(/^\[|\]$/g, '').trim(), count: Number(match[2].replace(/,/g, '')) }));
}

const KEY = /^([A-Z][A-Z ]*?):\s*(.*)$/;
/**
 * The packs a section offers: each a name line, then its DURATION (or the section's) and its
 * CONTENTS. A pack whose CONTENTS line names nothing countable is left out rather than guessed.
 */
export function parsePacks(section) {
  const packs = [];
  let name = null;
  let sectionDuration = null;
  let duration = null;
  for (const line of section.lines) {
    const key = line.match(KEY);
    if (key) {
      const [, label, value] = key;
      if (label === 'DURATION') {
        const parsed = parseDuration(value);
        if (name) duration = parsed; else sectionDuration = parsed;
      } else if ((label === 'CONTENTS' || label === 'CONTENT' || label === 'INCLUDES' || label === 'DETAILS') && name) {
        // Older posts list a pack's items as CONTENT, INCLUDES or DETAILS; a DETAILS line that
        // names nothing countable is a description, and the pack waits for its items.
        const contents = parseContents(value);
        if (!contents.length && label === 'DETAILS') continue;
        if (contents.length) packs.push({ name, ...(duration ?? sectionDuration ?? {}), contents });
        name = null;
        duration = null;
      } else if (label === 'NOTE' || label === 'OTHERS') {
        name = null;
      }
    } else if (!/^[◆\-•]/.test(line) && !/^note/i.test(line) && line.length <= 80) {
      name = line.replace(/^\[|\]$/g, '').trim();
      duration = null;
    }
  }
  return packs;
}

/** The announced event's own window: the first DURATION in the post. */
export function postWindow(lines) {
  for (const line of lines) {
    const key = line.match(KEY);
    if (key && key[1] === 'DURATION') {
      const parsed = parseDuration(key[2]);
      if (parsed) return parsed;
    }
  }
  return null;
}

/** The event a post announces, by its title without "SIDESTORY:" and "OPEN": a name to match. */
export function postEventName(title) {
  return String(title ?? '')
    .replace(/^\s*(?:\[[^\]]*\]\s*)?(?:new\s+)?(?:sidestory|side story|story collection(?: event)?|main theme episode\s*\d+|collab event|intermezzi)\s*:\s*/i, '')
    .replace(/\s+(?:limited-time\s+event\s+)?(?:open|now open|rerun|begins|is open)\s*!?\s*$/i, '')
    .trim();
}
