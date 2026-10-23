/** Every number and date the Pull Planner renders goes through this file.
 *
 * /pull-planner is prerendered on the server and hydrated in the reader's browser. A
 * formatter that follows the reader's locale prints "49,700" on the server and
 * "49.700" for a German, French, Brazilian or Russian reader, and React then
 * throws away the server HTML (errors 418/423/425) and repaints the page. So the
 * locale is fixed here, never taken from the reader, and dates are read in UTC
 * because a reader's time zone can move a 12:00 UTC date across midnight.
 *
 * scripts/tests/test-pulls-format.ts fails when pages/pull-planner.tsx or a file under
 * components/pulls or lib/pulls formats a number or date anywhere but here. */

const NUMBER_LOCALE = 'en-US';
// Matches the date style of the rest of the site (/skins, the event lists).
const DATE_LOCALE = 'en-GB';

// No options: the same output en-US toLocaleString() gives, fractions included.
const numberFormat = new Intl.NumberFormat(NUMBER_LOCALE);
const oneDecimalFormat = new Intl.NumberFormat(NUMBER_LOCALE, { maximumFractionDigits: 1 });
const dayMonthFormat = new Intl.DateTimeFormat(DATE_LOCALE, { day: 'numeric', month: 'short', timeZone: 'UTC' });
const dayMonthYearFormat = new Intl.DateTimeFormat(DATE_LOCALE, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

/** 49700 → "49,700". */
export const formatNumber = (value: number) => numberFormat.format(value);

/** 12.345 → "12.3". */
export const formatOneDecimal = (value: number) => oneDecimalFormat.format(value);

// A YYYY-MM-DD calendar day, read at noon UTC. Intl throws on an invalid date
// where toLocaleDateString printed "Invalid Date", so text that is not a date
// (a hand-edited plan file) is shown as it is rather than breaking the page.
function formatCalendarDay(format: Intl.DateTimeFormat, date: string) {
  const time = Date.parse(`${date}T12:00:00Z`);
  return Number.isFinite(time) ? format.format(time) : date;
}

/** "2026-09-25" → "25 Sept". */
export const formatDayMonth = (date: string) => formatCalendarDay(dayMonthFormat, date);

/** "2026-09-25" → "25 Sept 2026". */
export const formatDayMonthYear = (date: string) => formatCalendarDay(dayMonthYearFormat, date);
