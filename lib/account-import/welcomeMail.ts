import type { RewardClaims } from '../account/rewardClaims';

const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const WELCOME = 'free:welcome-mail';

/** Only the retained Global newbie Orundum mail, identified by both subject and attachment.
 * No body, sender, recipient, mail ID or timestamp leaves this function. Deleted mail is unknown.
 * Subject reference: https://www.speedrun.com/arknights/guides/p7a6p (spelled Orundom there).
 */
export function welcomeMailClaims(rows: readonly unknown[]): RewardClaims {
  const matches = rows.flatMap(value => {
    const mail = object(value);
    if (typeof mail.subject !== 'string' || mail.subject.length > 200 || mail.hasItem !== 1 || (mail.state !== 0 && mail.state !== 1)) return [];
    const subject = mail.subject.toLowerCase().replace(/[^a-z]/g, '');
    if (!['orundumresupplyfornewbiedoctors', 'orundomresupplyfornewbiedoctors'].includes(subject)) return [];
    if (!Array.isArray(mail.items) || mail.items.length !== 1) return [];
    const item = object(mail.items[0]);
    return item.id === '4003' && item.count === 3800 ? [mail.state === 1] : [];
  });
  // Duplicate or conflicting candidates cannot establish this one-time gift's identity.
  return matches.length === 1 ? { known: [WELCOME], claimed: matches[0] ? [WELCOME] : [] } : { known: [], claimed: [] };
}

/** Partition only the two mailbox kinds the read endpoint supports. No numeric-ID heuristic. */
export function mailboxIds(value: unknown): { mailIdList: number[]; sysMailIdList: number[] } | null {
  if (!Array.isArray(value) || value.length > 500) return null;
  const mailIdList = new Set<number>(), sysMailIdList = new Set<number>();
  for (const row of value) {
    const mail = object(row);
    if (mail.hasItem !== 1) continue;
    if (!Number.isSafeInteger(mail.mailId) || (mail.mailId as number) <= 0 || (mail.type !== 0 && mail.type !== 1)) return null;
    (mail.type === 0 ? mailIdList : sysMailIdList).add(mail.mailId as number);
  }
  return { mailIdList: [...mailIdList], sysMailIdList: [...sysMailIdList] };
}
