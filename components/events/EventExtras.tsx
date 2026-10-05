import type { EventExtras } from '@/lib/events/tableRewards';
import { RewardTile } from './RewardTile';

/*
 * The parts of an event's Rewards that are not a list to total: the packs sold for real money,
 * the furniture sets its rewards belong to, and the gifts its announcement words in prose.
 * Each names its source (the official post, or the game's furniture data).
 */

/** A pack window's day, as the announcement dates it: on the Global server's clock (UTC-7) and in
 *  the site's day-month-year wording ("29 Sept 2026"), as /skins dates its windows. The post's
 *  "September 29, 2026, 23:59 (UTC-7)" is stored as the instant 2026-09-30T06:59Z
 *  (scripts/build/official-news.mjs parseDuration), and read in UTC it printed the 30th: a day
 *  longer to buy than the post gives, on every pack that ends late in the evening. Text that is not
 *  a date is shown as it is, never as "Invalid Date". */
export function packDay(iso: string): string {
  return Number.isNaN(Date.parse(iso)) ? iso : new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Etc/GMT+7' });
}

export function EventPacks({ groups }: { groups: EventExtras['packs'] }) {
  return (
    <div className="event-extras">
      {groups.map((group) => (
        <div key={group.title + group.source} className="event-extras-group">
          {group.packs.map((pack) => (
            <article key={pack.name} className="event-pack">
              <header className="event-pack-head">
                <h3>{pack.name}</h3>
                {pack.start && <span className="event-pack-window">{packDay(pack.start)}{pack.end ? ` – ${packDay(pack.end)}` : ''}</span>}
              </header>
              <div className="event-reward-totals">
                {pack.contents.map((item) => <RewardTile key={item.name} name={item.name} iconPath={item.iconPath} count={item.count} />)}
              </div>
            </article>
          ))}
          <p className="hint">Contents as the <a href={group.source} target="_blank" rel="noopener noreferrer">official announcement</a> lists them. Prices differ by region and are not listed.</p>
        </div>
      ))}
    </div>
  );
}

export function EventFurniture({ sets }: { sets: EventExtras['furniture'] }) {
  return (
    <div className="event-extras">
      {sets.map((set) => (
        <article key={set.title} className="event-furniture-set">
          <h3>{set.title}</h3>
          {set.description && <p className="hint">{set.description}</p>}
          <ul className="event-furniture-pieces">
            {set.pieces.map((piece) => (
              <li key={piece.id}>
                <span className="event-furniture-piece-name">{piece.name}</span>
                <span className="event-furniture-piece-meta">{[piece.obtain, piece.comfort != null ? `+${piece.comfort} Ambience` : null].filter(Boolean).join(' · ')}</span>
              </li>
            ))}
          </ul>
        </article>
      ))}
    </div>
  );
}

export function EventNotices({ notices }: { notices: EventExtras['notices'] }) {
  return (
    <div className="event-extras">
      {notices.map((notice) => (
        <article key={notice.title + notice.source} className="event-notice">
          <h3>{notice.title}</h3>
          {notice.lines.map((line, i) => <p key={i}>{line}</p>)}
          <p className="hint"><a href={notice.source} target="_blank" rel="noopener noreferrer">Official announcement</a></p>
        </article>
      ))}
    </div>
  );
}
