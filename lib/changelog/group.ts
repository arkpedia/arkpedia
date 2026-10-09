import type { ChangelogEntry } from './entries';

export interface ChangelogDay extends ChangelogEntry {
  day: string;
}

/** One entry per displayed calendar day, even when releases straddle midnight UTC.
 * Keep the newest instant for the shared timestamp; source entries stay untouched. */
export function groupChangelogDays(entries: readonly ChangelogEntry[], timeZone: string): ChangelogDay[] {
  const date = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' });
  const days = new Map<string, ChangelogDay>();
  for (const entry of [...entries].sort((a, b) => b.at.localeCompare(a.at))) {
    const parts = date.formatToParts(new Date(entry.at));
    const day = ['year', 'month', 'day'].map((part) => parts.find(({ type }) => type === part)!.value).join('-');
    const current = days.get(day);
    if (!current) {
      days.set(day, { ...entry, day, added: [...(entry.added ?? [])], changed: [...(entry.changed ?? [])], fixed: [...(entry.fixed ?? [])] });
    } else {
      // A mixed day's item headlines describe its updates without a competing release title.
      delete current.title;
      for (const kind of ['added', 'changed', 'fixed'] as const) current[kind]!.push(...(entry[kind] ?? []));
    }
  }
  return [...days.values()];
}
