/**
 * The pages this tab has shown, for a detail page's Back (components/ui/BackLink.tsx): its
 * previous page is where Back goes. The browser's own history cannot answer that, because a
 * page adds entries of its own -- an operator page pushes one per section jumped to
 * ("#baseSkills") -- so history.back() from there steps through sections, not pages.
 *
 * A page is its path and query, never its hash. Moving within a page (a new query on the same
 * path: a stage picked on /stages/browse) updates its entry; returning to the page before, by
 * Back or by the browser's back button, drops the one left. Kept in sessionStorage, so it
 * survives a reload and dies with the tab; a browser that refuses storage simply has no trail,
 * and Back goes to the list.
 */
const KEY = 'arkpedia:page-trail';
const MAX = 30;

const pageOf = (url: string) => url.split('#')[0];
const pathOf = (url: string) => pageOf(url).split('?')[0];

function read(): string[] {
  try {
    const value = JSON.parse(window.sessionStorage.getItem(KEY) ?? '[]');
    return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];
  } catch {
    return [];
  }
}

function write(trail: string[]) {
  try { window.sessionStorage.setItem(KEY, JSON.stringify(trail.slice(-MAX))); } catch { /* no storage: no trail */ }
}

/** Records the page the router has just shown (pages/_app.tsx, on load and each route change). */
export function recordPage(url: string) {
  const page = pageOf(url);
  const trail = read();
  const last = trail[trail.length - 1];
  if (last !== undefined && pathOf(last) === pathOf(page)) trail[trail.length - 1] = page;
  else if (trail.length >= 2 && pathOf(trail[trail.length - 2]) === pathOf(page)) { trail.pop(); trail[trail.length - 1] = page; }
  else trail.push(page);
  write(trail);
}

/** The page shown before this one in this tab, or null when this is the first. */
export function previousPage(): string | null {
  const trail = read();
  return trail.length >= 2 ? trail[trail.length - 2] : null;
}
