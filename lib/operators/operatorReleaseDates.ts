export function parseDate(s: string): Date | null {
  if (!s) return null;
  const trimmed = s.trim();

  // Strict YYYY/MM/DD or YYYY-MM-DD first, since that's unambiguous.
  const strict = trimmed.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/);
  if (strict) {
    const [, y, m, d] = strict;
    const date = new Date(Number(y), Number(m) - 1, Number(d));
    if (!isNaN(date.getTime())) return date;
  }

  // Fall back to JS's native flexible parser for anything else (e.g.
  // "October 24, 2023") -- but only trust the result if it's actually
  // valid, rather than silently producing an Invalid Date that would
  // make every downstream comparison quietly return false.
  const fallback = new Date(trimmed);
  if (!isNaN(fallback.getTime())) return fallback;

  return null;
}

function parseDateRangeStart(dateRange: string | null | undefined): Date | null {
  if (!dateRange) return null;
  const core = dateRange.split(';')[0].trim();
  const start = core.split(/\s*[–-]\s*/)[0].trim();
  return parseDate(start);
}

export type ReleaseDateLookup = Record<string, string>;

/** Derives each operator's earliest recorded release date by scanning
 * EVERY banner (not just Limited-type -- Standard/Featured/Kernel/
 * Joint/Orienteering debuts count too) for their first appearance as
 * a featured six-star, rate-up six-star, five-star, or four-star.
 * Uses global_date first, falling back to cn_date only when Global
 * isn't recorded -- the SAME priority parseBannerDate uses for the
 * banner being compared against, so both sides of every chronology
 * check stay on the same timeline (Global releases typically lag CN
 * by months, so mixing the two would make every derived date look
 * far earlier than it should relative to a Global-dated banner).
 * Used as a fallback for operators whose own file doesn't record a
 * Release Date at all, rather than leaving them excluded from every
 * pool that depends on release chronology. */
export function deriveReleaseDatesFromBanners(banners: { cn_date: string | null; global_date?: string | null; six_stars: string[]; rate_up_six_stars?: string[]; five_stars: string[]; four_stars?: string[] }[]): ReleaseDateLookup {
  const earliest: Record<string, Date> = {};
  for (const banner of banners) {
    const bannerDate = parseDateRangeStart(banner.global_date || banner.cn_date);
    if (!bannerDate) continue;
    const featured = [
      ...(banner.six_stars || []),
      ...(banner.rate_up_six_stars || []),
      ...(banner.five_stars || []),
      ...(banner.four_stars || []),
    ];
    for (const name of featured) {
      if (!earliest[name] || bannerDate < earliest[name]) {
        earliest[name] = bannerDate;
      }
    }
  }
  const lookup: ReleaseDateLookup = {};
  for (const name of Object.keys(earliest)) {
    lookup[name] = earliest[name].toISOString().slice(0, 10);
  }
  return lookup;
}

/** Returns the operator's own recorded release date from the lookup
 * (built server-side from each operator's own characterInfo['Release
 * Date']), or null if not recorded. */
export function getReleaseDate(name: string, lookup: ReleaseDateLookup): Date | null {
  const raw = lookup[name];
  return raw ? parseDate(raw) : null;
}

/** Whether this operator would have existed yet as of the given date.
 * If the release date is unknown, the operator is treated as NOT
 * available -- excluded from the pool rather than assumed to have
 * always existed, since we genuinely don't know when (or if) they
 * debuted. */
export function wasReleasedBy(name: string, asOf: Date, lookup: ReleaseDateLookup): boolean {
  const released = getReleaseDate(name, lookup);
  if (!released) return false;
  return released <= asOf;
}