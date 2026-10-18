import { operatorHref } from '../operators/operatorHref';
import type { NavLink } from '../nav/navLinks';
import { enemyIconFor, type SiteSearchEntry } from './siteSearch';

/*
 * Builds the site search's rows (lib/search/siteSearch.ts) from records the caller has
 * already read. Kept apart from the reading -- scripts/build/build-site-search.ts does
 * that, from data/ and the stage and enemy indexes -- so a test can hold every href this
 * writes to the URL shape the page it names actually reads.
 */

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
  albums: readonly { albumId: string; albumName: string; albumAltName?: string | null }[];
  songs: readonly { title: string; altTitle?: string | null; artist?: string | null }[];
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
      sub: song.artist ?? undefined,
      terms: others(song.title, [song.altTitle]),
    }));
  }

  // The search normalises every name as a string, so one null took the whole box down in
  // the browser. Refuse to write such a row rather than ship it.
  const nameless = entries.filter((e) => typeof e.title !== 'string' || !e.title.trim()
    || (e.terms ?? []).some((t) => typeof t !== 'string'));
  if (nameless.length) throw new Error(`Site search rows with no name: ${nameless.slice(0, 5).map((e) => e.href).join(', ')}`);
  return entries;
}
