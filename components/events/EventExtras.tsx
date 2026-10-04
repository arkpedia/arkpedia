import Image from '@/components/content/ContentImage';
import type { EventExtras } from '@/lib/events/tableRewards';

/*
 * The parts of an event's Rewards that are not a list to total: the packs sold for real money,
 * the furniture sets its rewards belong to, and the gifts its announcement words in prose.
 * Each names its source (the official post, or the game's furniture data).
 */
const day = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }) : null);

export function EventPacks({ groups }: { groups: EventExtras['packs'] }) {
  return (
    <div className="event-extras">
      {groups.map((group) => (
        <div key={group.title + group.source} className="event-extras-group">
          {group.packs.map((pack) => (
            <article key={pack.name} className="event-pack">
              <header className="event-pack-head">
                <h3>{pack.name}</h3>
                {pack.start && <span className="event-pack-window">{day(pack.start)}{pack.end ? ` – ${day(pack.end)}` : ''}</span>}
              </header>
              <div className="event-reward-totals">
                {pack.contents.map((item) => (
                  <span key={item.name} className="event-reward-total">
                    <span className="event-reward-total-icon">{item.iconPath && <Image src={item.iconPath} alt="" width={40} height={40} />}</span>
                    <span className="event-reward-total-name">{item.name}</span>
                    <b>×{item.count.toLocaleString('en-US')}</b>
                  </span>
                ))}
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
