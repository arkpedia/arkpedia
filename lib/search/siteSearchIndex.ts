import { operatorHref } from '../operators/operatorHref';
import type { NavLink } from '../nav/navLinks';
import { enemyIconFor, type SiteSearchEntry } from './siteSearch';

/*
 * Builds the site search's rows (lib/search/siteSearch.ts) from records the caller has
 * already read. Kept apart from the reading -- scripts/build/build-site-search.ts does
 * that, from data/ and the stage and enemy indexes -- so a test can hold every href this
 * writes to the URL shape the page it names actually reads.
 */

/** How a row names Arknights: Endfield's music. */
const ENDFIELD_LABEL = 'Endfield';

export interface SiteSearchSources {
  pages: readonly NavLink[];
  operators: readonly { name: string; rarity: number | null; portraitPending?: true }[];
  /** Operator name -> the other names it goes by (lib/operators/operatorAliases.ts). */
  operatorAliases: Readonly<Record<string, readonly string[]>>;
  events: readonly { name: string }[];
  /** Episodes, events and modes that have a /stages/content/<id> page. */
  contents: readonly { id: string; name: string; label: string | null }[];
  stages: readonly { slug: string; code: string | null; name: string | null; variantOf: string | null; contentName: string | null }[];
  enemies: readonly { slug: string; name: string; index: string | null; icon?: string | null }[];
  /** `game` 'endfield' marks Arknights: Endfield's music, which the row names (lib/music/songFilter.ts). */
  albums: readonly { albumId: string; albumName: string; albumAltName?: string | null; game?: string }[];
  songs: readonly { title: string; altTitle?: string | null; artist?: string | null; game?: string }[];
  /** The curated YouTube channels the community page lists (lib/music/youtubeConfig.ts). */
  creators: readonly { id: string; label: string }[];
  /** Every artist and voice actor the credit pages list (lib/operators/creditDatabase.ts),
   *  as a count and never the operators themselves: the index is downloaded whole. */
  people: readonly SiteSearchPerson[];
}

export interface SiteSearchPerson {
  kind: 'artist' | 'voice-actor';
  /** The name the credit page shows, which its ?q= is matched against. */
  name: string;
  operators: number;
  /** A voice actor's languages, most operators first ("Japanese"). */
  languages?: readonly string[];
  /** The name in Latin letters, worked out at build time (scripts/lib/credit-romanization.ts). */
  aliases?: readonly string[];
}

/** The page a person's row opens: their credit page, searched for their name, which the
 *  page reads as `q` (components/operators/CreditDatabase.tsx). Their name as the page shows
 *  it, never an alias: the page matches its own names and knows no romanization. */
export function creditPersonHref(person: Pick<SiteSearchPerson, 'kind' | 'name'>): string {
  return `/${person.kind === 'artist' ? 'artists' : 'voice-actors'}?q=${encodeURIComponent(person.name)}`;
}

/** "3 operators · Japanese, English": the kind is on the row already. */
export function creditPersonSub(person: Pick<SiteSearchPerson, 'operators' | 'languages'>): string {
  const count = `${person.operators} operator${person.operators === 1 ? '' : 's'}`;
  const languages = person.languages ?? [];
  if (!languages.length) return count;
  const shown = languages.slice(0, 3).join(', ');
  return `${count} · ${languages.length > 3 ? `${shown} +${languages.length - 3}` : shown}`;
}

/** What /api/search-feeds has from the feeds the community pages fetch: their latest videos,
 *  filtered as the pages filter them, and who is live in the Twitch category. */
export interface SiteSearchFeeds {
  videos: readonly { videoId: string; title: string; channelLabel: string; thumbnail: string; url: string }[];
  streams: readonly { userLogin: string; displayName: string; title: string; thumbnailUrl: string; url: string }[];
}

const others = (title: string, names: readonly (string | null | undefined)[]): string[] | undefined => {
  const list = [...new Set(names.filter((n): n is string => !!n && n.trim() !== '' && n !== title))];
  return list.length ? list : undefined;
};

const row = (entry: SiteSearchEntry): SiteSearchEntry => {
  // Absent rather than undefined, so the file carries no "terms": null noise.
  const out: SiteSearchEntry = { kind: entry.kind, title: entry.title, href: entry.href };
  if (entry.sub) out.sub = entry.sub;
  if (entry.terms?.length) out.terms = entry.terms;
  if (entry.rarity !== undefined) out.rarity = entry.rarity;
  if (entry.portraitPending) out.portraitPending = true;
  if (entry.icon) out.icon = entry.icon;
  if (entry.iconless) out.iconless = true;
  return out;
};

export function buildSiteSearchEntries(sources: SiteSearchSources): SiteSearchEntry[] {
  const entries: SiteSearchEntry[] = [];

  entries.push(row({ kind: 'page', title: 'Home', href: '/' }));
  for (const page of sources.pages) entries.push(row({ kind: 'page', title: page.label, href: page.href }));

  for (const op of sources.operators) {
    entries.push(row({
      kind: 'operator',
      title: op.name,
      href: operatorHref(op.name, null),
      terms: others(op.name, sources.operatorAliases[op.name] ?? []),
      rarity: op.rarity,
      portraitPending: op.portraitPending,
    }));
  }

  for (const person of sources.people) {
    entries.push(row({
      kind: person.kind,
      title: person.name,
      href: creditPersonHref(person),
      sub: creditPersonSub(person),
      terms: others(person.name, person.aliases ?? []),
    }));
  }

  for (const event of sources.events) {
    entries.push(row({ kind: 'event', title: event.name, href: `/events/${encodeURIComponent(event.name)}` }));
  }

  for (const content of sources.contents) {
    entries.push(row({
      kind: 'content',
      title: content.name,
      href: `/stages/content/${encodeURIComponent(content.id)}`,
      sub: content.label ?? undefined,
      terms: others(content.name, [content.label]),
    }));
  }

  // A variant (Challenge Mode, the adverse version of a story stage) is a tab on its
  // parent's page, and a second row reading the same code would only be a tie.
  // A stage with neither a code nor a name (one Sami IS boss node, 2026-10) has nothing to be
  // searched by.
  for (const stage of sources.stages) {
    if (stage.variantOf) continue;
    const title = stage.code || stage.name;
    if (!title) continue;
    entries.push(row({
      kind: 'stage',
      title,
      href: `/stages/browse?s=${encodeURIComponent(stage.slug)}`,
      // The name rides in terms, where the results line reads it from (siteSearchLabel).
      sub: stage.contentName ?? undefined,
      terms: others(title, [stage.name]),
    }));
  }

  for (const enemy of sources.enemies) {
    entries.push(row({
      kind: 'enemy',
      title: enemy.name,
      href: `/enemies?e=${encodeURIComponent(enemy.slug)}`,
      sub: enemy.index ?? undefined,
      // Only when it is not the handbook's usual file, which siteSearchIcon derives.
      icon: enemy.icon && enemy.icon !== enemyIconFor(enemy.name) ? enemy.icon : undefined,
      iconless: enemy.icon ? undefined : true,
    }));
  }

  for (const album of sources.albums) {
    const title = album.albumAltName || album.albumName;
    entries.push(row({
      kind: 'album',
      title,
      href: `/music/discover?facet=${encodeURIComponent(`album:${album.albumId}`)}`,
      // Discover offers to include Endfield music when it is off, so the row says whose it is.
      sub: album.game === 'endfield' ? ENDFIELD_LABEL : undefined,
      terms: others(title, [album.albumName]),
    }));
  }

  // The discover page's own search takes it from there: a song is a row in a list, not
  // a page, and ?q= is how that list is opened at it.
  const seenSongs = new Set<string>();
  for (const song of sources.songs) {
    if (seenSongs.has(song.title)) continue;
    seenSongs.add(song.title);
    entries.push(row({
      kind: 'song',
      title: song.title,
      href: `/music/discover?q=${encodeURIComponent(song.title)}`,
      sub: (song.game === 'endfield' ? [ENDFIELD_LABEL, song.artist].filter(Boolean).join(' · ') : song.artist) ?? undefined,
      terms: others(song.title, [song.altTitle]),
    }));
  }

  // The community page has no place of its own for a channel (its creator list is a set of
  // links out), so the row goes where that list does.
  for (const creator of sources.creators) {
    entries.push(row({
      kind: 'creator',
      title: creator.label,
      href: youtubeChannelHref(creator.id),
      sub: 'YouTube channel',
    }));
  }

  return refuseNameless(entries);
}

export const youtubeChannelHref = (id: string): string => `https://www.youtube.com/channel/${encodeURIComponent(id)}`;

/** The search normalises every name as a string, so one null took the whole box down in
 *  the browser. Refuse to write such a row rather than ship it. */
function refuseNameless(entries: SiteSearchEntry[]): SiteSearchEntry[] {
  const nameless = entries.filter((e) => typeof e.title !== 'string' || !e.title.trim()
    || (e.terms ?? []).some((t) => typeof t !== 'string'));
  if (nameless.length) throw new Error(`Site search rows with no name: ${nameless.slice(0, 5).map((e) => e.href).join(', ')}`);
  return entries;
}

/**
 * The live half of the search: rows for /api/search-feeds. A video reads its title over its
 * channel and answers to the channel's name too, so a search for a creator lists their videos
 * under the channel itself. Twitch has no curated list, so a streamer is known only while
 * live: each stream is a row for the streamer and a row for the stream, both to the channel,
 * the address a live stream plays at. A feed's nameless item (a stream with no title) reads
 * its streamer's name, or is left out, rather than taking the route down with the guard above.
 */
export function buildSiteSearchFeedEntries(feeds: SiteSearchFeeds): SiteSearchEntry[] {
  const entries: SiteSearchEntry[] = [];
  const seenVideos = new Set<string>();
  for (const video of feeds.videos) {
    if (!video.title?.trim() || !video.url || seenVideos.has(video.url)) continue;
    seenVideos.add(video.url);
    entries.push(row({
      kind: 'video',
      title: video.title,
      href: video.url,
      sub: video.channelLabel || undefined,
      terms: others(video.title, [video.channelLabel]),
      icon: video.thumbnail || undefined,
    }));
  }
  const seenStreams = new Set<string>();
  for (const stream of feeds.streams) {
    const name = stream.displayName?.trim() || stream.userLogin?.trim();
    if (!name || !stream.url || seenStreams.has(stream.url)) continue;
    seenStreams.add(stream.url);
    entries.push(row({
      kind: 'streamer',
      title: name,
      href: stream.url,
      sub: 'Live on Twitch now',
      terms: others(name, [stream.userLogin]),
    }));
    const title = stream.title?.trim() || name;
    entries.push(row({
      kind: 'stream',
      title,
      href: stream.url,
      sub: name,
      terms: others(title, [name, stream.userLogin]),
      icon: stream.thumbnailUrl || undefined,
    }));
  }
  return refuseNameless(entries);
}
