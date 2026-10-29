import type { JSX } from 'react';
import type { EventExtras } from '@/lib/events/tableRewards';
import { REGIONAL_MATERIAL } from '@/lib/i18n/regionalMaterial';
import Image, { ContentImg } from '@/components/content/ContentImage';
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
        <article key={set.title} className="panel event-furniture-set">
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
        <article key={notice.title + notice.source} className="panel event-notice">
          <h3>{notice.title}</h3>
          {notice.lines.map((line, i) => <p key={i}>{line}</p>)}
          <p className="hint"><a href={notice.source} target="_blank" rel="noopener noreferrer">Official announcement</a></p>
        </article>
      ))}
    </div>
  );
}

/* An announcement line, as the post words it: "UPDATE TIME: …" keeps its key as a label, a
   "- …" or "◆ …" line is a list item, a bare "Note:" introduces the list under it. */
const NEWS_KEY = /^([A-Z][A-Z ]{1,30}):\s*(.*)$/;
const NEWS_ITEM = /^(?:[-◆•・]\s*)(.+)$/;
const sentence = (key: string) => key.charAt(0) + key.slice(1).toLowerCase();

function NewsLines({ lines }: { lines: string[] }) {
  const blocks: ({ kind: 'p'; text: string; key?: string } | { kind: 'ul'; items: string[] })[] = [];
  for (const line of lines) {
    const item = line.match(NEWS_ITEM);
    if (item) {
      const last = blocks[blocks.length - 1];
      if (last?.kind === 'ul') last.items.push(item[1]);
      else blocks.push({ kind: 'ul', items: [item[1]] });
      continue;
    }
    const key = line.match(NEWS_KEY);
    blocks.push(key ? { kind: 'p', key: sentence(key[1]), text: key[2] } : { kind: 'p', text: line });
  }
  return <>{blocks.map((block, i) => block.kind === 'ul'
    ? <ul key={i}>{block.items.map((text, j) => <li key={j}>{text}</li>)}</ul>
    : <p key={i}>{block.key && <span className="event-news-key">{block.key}</span>}{block.key && block.text ? ' ' : ''}{block.text}</p>)}</>;
}

/** The day an ISO time falls on, as the page writes dates (2026/10/09), the same on server and client. */
const newsDay = (iso: string | null) => (iso && /^\d{4}-\d{2}-\d{2}/.test(iso) ? iso.slice(0, 10).replace(/-/g, '/') : null);

/** A section's lines with the post's pictures where the post has them: each above the line `at`. */
function NewsBody({ section }: { section: EventExtras['news'][number] }) {
  const art = [...(section.art ?? [])].filter((picture) => picture.at >= 0).sort((a, b) => a.at - b.at);
  const parts: JSX.Element[] = [];
  let from = 0;
  for (const [i, picture] of art.entries()) {
    const at = Math.max(from, Math.min(picture.at, section.lines.length));
    if (at > from) parts.push(<NewsLines key={`l${i}`} lines={section.lines.slice(from, at)} />);
    parts.push(<ContentImg key={`a${i}`} className="event-news-art" src={picture.url} alt="" />);
    from = at;
  }
  if (from < section.lines.length) parts.push(<NewsLines key="rest" lines={section.lines.slice(from)} />);
  return <>{parts}</>;
}

const REGIONAL_SERVERS = ['jp', 'kr'] as const;
const SERVER_LABEL = { jp: 'JP', kr: 'KR' } as const;

/** A JP or KR board item, in English: the site's own name for what it is about (its event or
 *  banner), never the board's Japanese or Korean title, and an English label for the link. */
function RegionalBoardItem({ item, server }: { item: EventExtras['board'][number]; server: 'jp' | 'kr' }) {
  const label = `Official ${SERVER_LABEL[server]} notice`;
  return (
    <article className="panel event-notice event-news-board-item">
      {item.image && <ContentImg className="event-news-board-art" src={item.image} alt={item.name ?? label} />}
      <h3>{item.name ?? label}</h3>
      <p className="hint">
        {newsDay(item.shown) ? `Shown from ${newsDay(item.shown)}.` : null}
        {item.source && <>{' '}<a href={item.source} target="_blank" rel="noopener noreferrer">{label}</a></>}
      </p>
    </article>
  );
}

/** The News tab: the in-game board's items for the event (its banners', with their art), then each
 *  official announcement with its pictures where the post has them. Every picture is shown from
 *  the official host's address; none is kept.
 *
 *  Every server's items are in the markup and CSS shows the site's server's (events.css, by the
 *  <html data-site-server> _document's boot script sets before the first paint), as the home
 *  maintenance notice does: the server is the reader's choice, which the server render cannot
 *  know, and the lists differ in height. In JP or KR mode that server's board stands in place of
 *  Global's material; a server whose board has nothing for the event says so, and Global's
 *  follows (data-own-jp / data-own-kr say which servers have their own). */
export function EventNews({ news, board }: { news: EventExtras['news']; board: EventExtras['board'] }) {
  // Each announcement once, above its sections: the date it was published and a link to it.
  const posts = [...new Map(news.map((section) => [section.source, section])).entries()];
  // A release from before the servers were told apart has only Global's, with no server.
  const globalBoard = board.filter((item) => (item.server ?? 'en') === 'en');
  // No JP/KR notices until the site has those languages (lib/i18n/regionalMaterial.ts): Global's for every server.
  const regional = REGIONAL_MATERIAL ? REGIONAL_SERVERS.map((server) => ({ server, items: board.filter((item) => item.server === server) })) : [];
  const own = Object.fromEntries(regional.filter(({ items }) => items.length > 0).map(({ server }) => [`data-own-${server}`, '']));
  return (
    <div className="event-extras event-news" {...own}>
      {regional.map(({ server, items }) => (
        <div key={server} className="event-news-server" data-server={server}>
          {items.length > 0 ? (
            <div className="event-news-post">
              <p className="hint event-news-from">On the {SERVER_LABEL[server]} in-game notice board.</p>
              <div className="event-news-board">
                {items.map((item) => <RegionalBoardItem key={item.title + item.shown + item.source + item.image} item={item} server={server} />)}
              </div>
            </div>
          ) : (
            <p className="hint event-news-from">The {SERVER_LABEL[server]} in-game notice board has shown nothing for this event yet. Global&apos;s news follows.</p>
          )}
        </div>
      ))}
      <div className="event-news-server" data-server="en">
        {globalBoard.length > 0 && (
          <div className="event-news-post">
            <p className="hint event-news-from">On the in-game notice board.</p>
            <div className="event-news-board">
              {globalBoard.map((item) => (
                <article key={item.title + item.image} className="panel event-notice event-news-board-item">
                  {item.image && <ContentImg className="event-news-board-art" src={item.image} alt={item.title} />}
                  <h3>{item.title}</h3>
                  <p className="hint">
                    {newsDay(item.shown) ? `Shown from ${newsDay(item.shown)}.` : null}
                    {item.source && <>{' '}<a href={item.source} target="_blank" rel="noopener noreferrer">In-game notice</a></>}
                  </p>
                </article>
              ))}
            </div>
          </div>
        )}
        {posts.map(([source, first]) => (
          <div key={source} className="event-news-post">
            <p className="hint event-news-from">
              {newsDay(first.published) ? `From the official announcement of ${newsDay(first.published)}. ` : 'From the official announcement. '}
              <a href={source} target="_blank" rel="noopener noreferrer">Read it on arknights.global</a>
            </p>
            {first.postArt && <ContentImg className="event-news-art" src={first.postArt} alt="" />}
            {news.filter((section) => section.source === source).map((section) => (
              <article key={section.title} className="panel event-notice event-news-section">
                {(section.art ?? []).filter((picture) => picture.at < 0).map((picture) => <ContentImg key={picture.url} className="event-news-art" src={picture.url} alt="" />)}
                <h3>{section.title}</h3>
                <NewsBody section={section} />
              </article>
            ))}
          </div>
        ))}
      </div>
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
      {details.days.map((items, index) => <div key={index} className="panel event-login-day">
        <h4>Day {index + 1}</h4>
        <div className="event-reward-totals">{items.map(item => <RewardTile key={item.name} {...item} />)}</div>
      </div>)}
    </div>
  </>;
}
