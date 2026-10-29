// PR release checks protect reader journeys. Exhaustive visual contracts run in
// Browser audit; omitted identities remain explicit in the existing evidence.
const CORE = ['nav-bar', 'mobile-touch-nav', 'navigation-continuity', 'account-import', 'music-navigation'];
const OPTIONAL_CORE = ['privacy', 'statistics-prompt'];
const SHARED = ['core', 'music-navigation', 'story-progress', 'base-account', 'reward-import', 'planning-pages', 'media-community-games'];
const OPTIONAL_SHARED = ['navigation-account-redesign', 'credits-games-review', 'music-workspace'];
const AUDIT = /^(?:layout-census(?:-after)?|motion|tabs|x-buttons|cards-and-headings|row-alignment|on-states|artwork-zoom-contrast|operator-caption-motion)\.spec\.ts$/;
const FAMILIES = [
  [/^(?:music|song)(?:\/|[-.])/, /^(?:music|song)-/],
  [/^(?:account|account-import|cloud-account|friends|medals)(?:\/|[-.])/, /^(?:account-|cloud-accounts|friends|medal-collection|reward-import|music-resume)/],
  [/^story(?:\/|\.)/, /^story-/],
  [/^(?:schedule|events)(?:\/|\.)/, /^(?:schedule-|event-|regional-schedules|banner-forecasts|home-banner-status)/],
  [/^(?:pulls|free-op|skin-planner|planner|planning|recruitment)(?:\/|\.)/, /^(?:pulls|reward-|rewards-projects|skin-planner|planning-pages|planner-|recruitment-)/],
  [/^(?:base|bases)(?:\/|\.)/, /^base-/],
  [/^(?:artists|voice-actors|credits|operators|operator)(?:\/|\.)/, /^(?:credit-|credits-games|operator-|core)/],
  [/^(?:games|minigames|chibi)(?:\/|\.)/, /^(?:credits-games|media-community-games|chibi)/],
  [/^(?:community|home)(?:\/|\.)|^index\./, /^(?:media-community-games|home-|rewards-projects)/],
];
import { decide } from './browser-relevant.mjs';

const base = file => file.replaceAll('\\', '/').split('/').at(-1);
// A runtime file outside the named families is placed by the pages that import it. One that
// reaches the app shell, or more pages than this, is shared chrome.
const SHELL = /^pages\/_(?:app|document|error)\./;
const MAX_ROUTED_PAGES = 12;

/** The route a page file serves, by its first segment: '' for the home page, 'api/<name>' for an API route. */
export function pageRoute(file) {
  const parts = file.replace(/^pages\//, '').replace(/\.[cm]?[jt]sx?$/, '').split('/');
  if (parts[0] === 'api') return parts.length > 1 ? `api/${parts[1]}` : null;
  return parts[0] === 'index' ? '' : parts[0];
}

const ROUTE_LITERAL = /['"`]\/((?:api\/)?[a-z0-9][\w-]*)?(?=[/?#'"`])/g;
const literalRoutes = source => new Set([...source.matchAll(ROUTE_LITERAL)].map(match => match[1] ?? ''));
// Helpers that hold every census route: a spec importing these names visits them all.
const EVERY_ROUTE = new Set(['CENSUS_STATES', 'censusRoutes']);

/** The routes in each exported declaration of a helper module, by exported name. */
function exportedRoutes(source) {
  const byName = new Map();
  for (const chunk of source.split(/\n(?=export )/)) {
    const name = chunk.match(/^export (?:async )?(?:function\*?|const|let|class|type|interface) (\w+)/)?.[1];
    if (name) byName.set(name, literalRoutes(chunk));
  }
  return byName;
}

/** Which routes each browser spec visits: the first segment of every site path it spells out,
 *  and those of the helper functions it imports from tests/browser. '*' is every route. */
export function specRoutes(specs, read) {
  const routes = new Map(), helpers = new Map();
  for (const spec of specs) {
    const source = read(spec);
    if (source == null) return null;
    const found = literalRoutes(source);
    for (const match of source.matchAll(/import\s+(?:type\s+)?\{([^}]*)\}\s+from\s+['"]\.\/([\w-]+)['"]/g)) {
      const helper = `tests/browser/${match[2]}.ts`;
      if (!helpers.has(helper)) {
        const text = read(helper);
        if (text == null) return null;
        helpers.set(helper, exportedRoutes(text));
      }
      for (const raw of match[1].split(',')) {
        const name = raw.replace(/^\s*type\s+/, '').split(/\s+as\s+/)[0].trim();
        if (!name) continue;
        if (EVERY_ROUTE.has(name)) found.add('*');
        for (const route of helpers.get(helper).get(name) ?? []) found.add(route);
      }
    }
    routes.set(spec, found);
  }
  return routes;
}

/** Runtime files that spell out a data file's name in a string, as a computed-path reader would. */
export function dataReaders(file, files, read) {
  const name = file.split('/').at(-1);
  const quoted = new RegExp(`['"\`][^'"\`\n]*${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"\`]`);
  return [...files].filter(path => /^(?:pages|components|lib)\/.*\.[cm]?[jt]sx?$/.test(path) && quoted.test(read(path) ?? ''));
}

/** The pages that import `file`, transitively, through the dependency index's consumer edges. */
function pagesOf(file, consumers) {
  const seen = new Set([file]), queue = [file], pages = new Set();
  while (queue.length) {
    const target = queue.shift();
    if (target.startsWith('pages/')) pages.add(target);
    for (const consumer of consumers.get(target) ?? []) if (!seen.has(consumer)) { seen.add(consumer); queue.push(consumer); }
  }
  return [...pages];
}

export function releaseBrowserPlan(plan, { changes, specs, baselineVerified, dependencies, routes, relevant, readers }) {
  if (!baselineVerified || plan.lane === 'none') return plan;
  const inventory = [...new Set(specs)].sort();
  const selected = new Set();
  const addNames = names => names.every(name => {
    const file = inventory.find(file => base(file) === `${name}.spec.ts`);
    if (file) selected.add(file);
    return !!file;
  });
  if (!addNames(CORE)) return plan;
  for (const name of OPTIONAL_CORE) if (inventory.some(file => base(file) === `${name}.spec.ts`)) addNames([name]);
  const addFamily = pattern => {
    const matching = inventory.filter(file => pattern.test(base(file)) && !AUDIT.test(base(file)));
    matching.forEach(file => selected.add(file));
    return matching.length > 0;
  };
  const addShared = () => {
    if (!addNames(SHARED)) return false;
    for (const name of OPTIONAL_SHARED) if (inventory.some(file => base(file) === `${name}.spec.ts`)) addNames([name]);
    return true;
  };
  // Every functional spec that visits one of these routes, or is named for it.
  const addRoutes = pageRoutes => {
    for (const file of inventory) {
      if (AUDIT.test(base(file))) continue;
      const visited = routes.get(file);
      if (pageRoutes.some(route => visited?.has('*') || visited?.has(route) || (route ? base(file).startsWith(`${route}-`) || base(file) === `${route}.spec.ts` : base(file).startsWith('home-')))) selected.add(file);
    }
  };
  // Only a complete import graph and a read of every spec may place a file by its pages.
  const routable = dependencies?.consumers instanceof Map && Array.isArray(dependencies.unreadable) && !dependencies.unreadable.length
    && routes instanceof Map && inventory.every(file => routes.has(file));
  for (const { path: raw, status } of changes) {
    const path = raw.replaceAll('\\', '/');
    if (/^docs\/|^[^/]+\.md$/.test(path)) continue;
    // Outside what the build and the browser specs read (the dependency closure browserPlan
    // uses too): a unit test or an importer cannot change a browser result.
    if (relevant instanceof Set && !path.startsWith('scripts/ci/') && !decide([{ status, path }], relevant).run) continue;
    if (path.startsWith('tests/browser/')) {
      if (!inventory.includes(path) || status?.startsWith('D')) return plan;
      if (!AUDIT.test(base(path))) selected.add(path);
      continue;
    }
    // Toolchain, build policy, public files, deleted inputs and anything no page is shown to
    // read still use the conservative original plan. This is not a blanket skip switch.
    const runtime = /^(?:pages|components|lib|styles)\//.test(path);
    // A data file only when every runtime file that names it imports it: a reader that builds
    // the path at run time (lib/content/dataTable.ts) has no import edge to follow.
    const data = routable && /^data\/[^/]+\.json$/.test(path) && typeof readers === 'function'
      && readers(path).every(reader => dependencies.consumers.get(path)?.has(reader));
    if (!runtime && !data) return plan;
    const relative = path.replace(/^(?:pages|components|lib|styles)\//, '');
    // The pages that import it, when they can be known. A deleted file has no edges left.
    const pages = routable && !status?.startsWith('D') ? pagesOf(path, dependencies.consumers) : null;
    const narrow = pages?.length > 0 && pages.length <= MAX_ROUTED_PAGES && !pages.some(page => SHELL.test(page))
      && pages.every(page => pageRoute(page) !== null);
    // Named shared chrome and families keep their sets, plus the specs of the few pages that use it.
    if (runtime && /^(?:core|layout|ui|nav|time|content|assets|privacy)\/|^_(?:app|document)\./.test(relative)) {
      if (!addShared()) return plan;
      if (narrow) addRoutes(pages.map(pageRoute));
      continue;
    }
    const family = runtime && FAMILIES.find(([code]) => code.test(relative));
    if (family) {
      if (!addFamily(family[1])) return plan;
      if (narrow) addRoutes(pages.map(pageRoute));
      continue;
    }
    // Anything else is placed by its pages alone; with none known, the original plan stands.
    if (!pages?.length) return plan;
    if (narrow) addRoutes(pages.map(pageRoute));
    else if (pages.some(page => pageRoute(page) === null) || !addShared()) return plan;
  }
  if (!selected.size || selected.size === inventory.length) return plan;
  return { ...plan, lane: 'targeted', releaseOnly: true, domains: [],
    reason: 'PR release journeys: core navigation/consent plus affected features; exhaustive visual checks run separately',
    selected: [...selected].sort(), omitted: inventory.filter(file => !selected.has(file)) };
}
