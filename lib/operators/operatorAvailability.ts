export type ReleaseOperator = {
  releaseAt?: string;
  characterInfo?: Record<string, string> | null;
  /** Only a fallback for placeholder records that have no release date. */
  isFuture?: boolean | null;
};
const DAY = 86_400_000;

/** Global release dates are UTC-7 calendar dates, never the viewer's midnight.
 * Without a confirmed hour, wait until that calendar day has passed before
 * calling an operator released. Do not invent a precise opening time. */
export function operatorRelease(op: ReleaseOperator): { at: number; dayStart: number; exact: boolean } | null {
  if (op.releaseAt && /(?:Z|[+-]\d{2}:\d{2})$/i.test(op.releaseAt)) {
    const at = Date.parse(op.releaseAt);
    if (Number.isFinite(at)) return { at, dayStart: at, exact: true };
  }
  const raw = op.characterInfo?.['Release Date']?.trim();
  if (!raw) return null;
  const match = raw.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/);
  const day = match ? Date.UTC(+match[1], +match[2] - 1, +match[3]) : Date.parse(`${raw} UTC`);
  if (!Number.isFinite(day)) return null;
  const date = new Date(day);
  if (match && (date.getUTCFullYear() !== +match[1] || date.getUTCMonth() !== +match[2] - 1 || date.getUTCDate() !== +match[3])) return null;
  const dayStart = day + 7 * 3_600_000;
  return { at: dayStart + DAY, dayStart, exact: false };
}

export function operatorReleaseLabel(op: ReleaseOperator, now: number): string | null {
  const release = operatorRelease(op);
  if (!release || now >= release.at) return null;
  if (!release.exact && now >= release.dayStart) return 'Releases today';
  const remaining = (release.exact ? release.at : release.dayStart) - now;
  if (remaining < 3_600_000) return `In ${Math.ceil(remaining / 60_000)}m`;
  if (remaining < DAY) return `In ${Math.ceil(remaining / 3_600_000)}h`;
  const days = Math.ceil(remaining / DAY);
  return `In ${days} day${days === 1 ? '' : 's'}`;
}

/**
 * One release-state decision for every operator surface.
 *
 * Exact Global timestamps win, date-only legacy records keep the conservative
 * UTC-7 safeguard above, and `isFuture` is consulted only when neither exists.
 * That prevents a manually stored flag or calendar date from making an operator
 * playable before the confirmed Global release instant.
 */
export function isOperatorReleased(op: ReleaseOperator, now = Date.now()): boolean {
  const release = operatorRelease(op);
  if (release) return now >= release.at;
  return op.isFuture !== true;
}
