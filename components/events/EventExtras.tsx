import type { EventExtras } from '@/lib/events/tableRewards';
import Image from '@/components/content/ContentImage';
import { PackButton } from './RewardDetails';
import { RewardTile } from './RewardTile';
import { packDay } from '@/lib/events/packDay';
export { packDay } from '@/lib/events/packDay';

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

export function EventPacks({ groups }: { groups: EventExtras['packs'] }) {
  return (
    <div className="event-extras">
      {groups.map((group) => (
        <div key={group.title + group.source} className="event-extras-group">
          <div className="event-pack-cards">
          {group.packs.map((pack) => (
            <PackButton key={pack.name} pack={pack} source={group.source}>
              {pack.imagePath && <Image className="event-pack-card-image" src={pack.imagePath} alt="" width={112} height={84} />}
              <span className="event-pack-card-copy">
              <span className="event-pack-card-name">{pack.name}</span>
              {pack.start && <span className="event-pack-window">{packDay(pack.start)}{pack.end ? ` – ${packDay(pack.end)}` : ''}</span>}
              <span className="event-pack-preview">{pack.contents.slice(0, 2).map(item => `${item.name} ×${item.count.toLocaleString('en-US')}`).join(' · ')}</span>
              <span className="event-pack-more">View contents ↗</span>
              </span>
            </PackButton>
          ))}
          </div>
          <p className="hint">Pack information: <a href={group.source} target="_blank" rel="noopener noreferrer">source announcement</a>. Prices differ by region.</p>
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
          <div className="event-furniture-overview">
            {set.imagePath && <Image className="event-furniture-art" src={set.imagePath} alt={`${set.title} in-game shop artwork`} width={226} height={169} />}
            {set.description && <p className="event-furniture-description hint">{set.description}</p>}
          </div>
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

export interface LoginDetails {
  description: string | null;
  days: { name: string; count: number; iconPath: string | null }[][];
}

export function EventLoginDays({ details }: { details: LoginDetails }) {
  return <>
    {details.description && <p className="hint">{details.description}</p>}
    <div className="event-login-days">
      {details.days.map((items, index) => <div key={index} className="event-login-day">
        <h4>Day {index + 1}</h4>
        <div className="event-reward-totals">{items.map(item => <RewardTile key={item.name} {...item} />)}</div>
      </div>)}
    </div>
  </>;
}
