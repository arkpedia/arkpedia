/**
 * The structured wiki pages the daily refresh reads, as enrichment that can never hold
 * the release back. The game tables decide what exists; these pages add English names
 * and the lineups the tables leave out. So a page that cannot be used today -- the wiki
 * is down, the page moved behind a redirect, was deleted, or was reformatted so that no
 * row parses where there were rows, or too few of them (see shrinkProblem) -- is read
 * from its last good copy, and the problem is reported to the quarantine list instead of
 * thrown.
 *
 * The last good copy is the page's parsed rows, kept in data/wiki-cache/<page>.json.
 * It is a data file, published with the release and hydrated into the next run, so it
 * survives the runner. It is rewritten only when the rows change, and holds no timestamp
 * but the day a shrink began (below): a page that did not change leaves the file alone,
 * and an unchanged day publishes nothing.
 */
import fs from 'node:fs';
import path from 'node:path';
import { wikiBase, wikiParseUrl, wikiText, parseWikiRows } from './catalogue-model.mjs';

export const WIKI_CACHE = 'data/wiki-cache';
// wiki.gg refuses requests that do not say who is asking.
const USER_AGENT = 'Arkpedia-refresh/1.0 (+https://arkpedia.net)';

export const wikiCacheFile = (root, page) => path.join(root, WIKI_CACHE, `${page.replaceAll('/', '-')}.json`);
/*
 * A page that parses to fewer rows than it held has most likely been reformatted under the
 * parser -- rows moved into another template, a nested template cutting cells short -- not
 * emptied. How few is too few depends on the page:
 *
 * A year's banner page (Headhunting/Banners/<year>) only grows during its year, so ANY
 * shrink from its last good copy is suspect.
 *
 * The Upcoming pages lose rows as Global catches up, so they are judged by half -- but
 * half of the most they held within PEAK_DAYS, not of yesterday's copy, or a page could
 * lose half its rows every day, each loss taken as the next day's yardstick. The cache
 * keeps that count as `peak` ({rows, since}) while it is above the rows it holds, set on
 * the day a shrink is taken and dropped once the page grows back past it. Pages this
 * small are not judged.
 */
export const SHRINK_JUDGED_FROM = 6;
export const PEAK_DAYS = 7;
const onlyGrows = page => /^Headhunting\/Banners\/\d{4}$/.test(page);
const utcDay = now => now.toISOString().slice(0, 10);
const daysFrom = (since, today) => (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${since}T00:00:00Z`)) / 86_400_000;
/** The most rows the page held within PEAK_DAYS, by the last good copy. */
function heldPeak(cached, today) {
  const peak = cached?.peak;
  const live = peak && Number.isInteger(peak.rows) && daysFrom(peak.since, today) <= PEAK_DAYS ? peak : null;
  return live && live.rows > cached.rows.length ? live : null;
}
/** Why today's rows are too few to take over the last good copy, or null. The words hold no
 * count of today's rows: the reason is a release input, and the good copy stands meanwhile. */
function shrinkProblem(page, template, rows, cached, today) {
  const had = cached?.rows.length ?? 0;
  if (!rows.length && had) return `it has no "${template}" row that parses, where the last good read had ${had}; the template or its fields have probably changed`;
  if (onlyGrows(page) && rows.length < had) return `fewer "${template}" rows parse than its last good read had, and a year's banner page only grows; rows have probably moved to another template or been cut short`;
  const held = Math.max(had, heldPeak(cached, today)?.rows ?? 0);
  if (!onlyGrows(page) && held >= SHRINK_JUDGED_FROM && rows.length < held / 2) {
    return `fewer than half the "${template}" rows it held within the last ${PEAK_DAYS} days parse; most of the page has probably been reformatted`;
  }
  return null;
}
/** The peak a taken read leaves in the cache: the running one while it stands above the
 * rows, else the count before today's shrink, from today. */
function nextPeak(page, rows, cached, today) {
  if (onlyGrows(page) || !cached) return null;
  const live = heldPeak(cached, today), had = cached.rows.length;
  if (live && live.rows > rows.length && live.rows >= had) return live;
  return had > rows.length ? { rows: had, since: today } : null;
}
export const wikiPageUrl = page => `${wikiBase()}/wiki/${encodeURI(page.replaceAll(' ', '_'))}`;

/* Why a request for the page failed, in words that stay the same while the problem does:
   the reason is published in data/quarantine.json, a release input, so an outage that
   answers 502 one day, refuses the connection the next and serves a maintenance page (or a
   403 challenge) the day after must not read as a new problem each day. Every failure of the
   request itself -- no answer, an HTTP error of any status, an answer that is not the API's
   JSON -- is this one kind; the exact error goes to the log. A page the wiki does serve but
   that cannot be used (missing, still a redirect) keeps wikiText's own words, which name the
   page's state. */
const UNREACHABLE = 'the wiki could not be reached';
class RequestFailed extends Error {}

async function fetchWikiJson(url) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(60000), headers: { 'User-Agent': USER_AGENT } });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } catch (error) {
    throw new RequestFailed(UNREACHABLE, { cause: error });
  }
}

function lastGoodRead(file) {
  try {
    const cached = JSON.parse(fs.readFileSync(file, 'utf8'));
    return Array.isArray(cached?.rows) ? cached : null;
  } catch {
    return null;
  }
}

/**
 * The rows of one structured page, never throwing. `alerts` is a quarantine stage
 * (scripts/lib/quarantine.mjs); `write: false` leaves the cache untouched (dry runs).
 */
export async function readWikiRows(root, page, template, { now = new Date(), alerts, write = true } = {}) {
  const file = wikiCacheFile(root, page);
  const cached = lastGoodRead(file);
  let problem;
  try {
    const text = wikiText(page, await fetchWikiJson(wikiParseUrl(page)), now);
    // The only excused absence: this year's banner page before the wiki creates it.
    if (!text) {
      console.warn(`${page} does not exist on the wiki yet; reading it as no rows until the end of January (UTC).`);
      return [];
    }
    const rows = parseWikiRows(text, template), today = utcDay(now);
    // No row where there were rows is a template or field rename, not a quiet day.
    const shrunk = shrinkProblem(page, template, rows, cached, today);
    if (shrunk) {
      problem = `${shrunk}. If it really lost them, delete source/${path.relative(root, file)} in arkpedia-data (a correction branch) and the next run takes the page as it is`;
    } else {
      // The same rows leave the file alone, whatever became of the peak meanwhile.
      if (write && JSON.stringify(cached?.rows) !== JSON.stringify(rows)) {
        const peak = nextPeak(page, rows, cached, today);
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, `${JSON.stringify({ page, template, rows, ...(peak ? { peak } : {}) }, null, 2)}\n`);
      }
      return rows;
    }
  } catch (error) {
    const exact = error instanceof RequestFailed ? error.cause : error;
    const cause = exact.cause?.code ?? exact.cause?.message;
    console.warn(`Reading ${page} failed: ${exact.message}${cause ? ` (${cause})` : ''}`);
    problem = error.message;
  }
  const fallback = cached?.rows ?? [];
  const outcome = cached ? `its last good read (${fallback.length} rows) is used instead` : 'no earlier read is cached, so it reads as no rows and nothing new is discovered from it';
  console.warn(`Wiki page ${page} cannot be used: ${problem}; ${outcome}.`);
  alerts?.add({ key: `wiki:${page}`, action: cached ? 'kept-previous' : 'omitted-new', reason: `Wiki page ${page} cannot be used: ${problem}; ${outcome}.`, sourceRef: wikiPageUrl(page) });
  return fallback;
}
