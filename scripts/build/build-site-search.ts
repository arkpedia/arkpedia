import fs from 'node:fs';
import path from 'node:path';
import { getAllOperators } from '../../lib/operators/operators';
import { portraitStatus } from '../../lib/operators/operatorPortrait';
import { buildAliasMap } from '../../lib/operators/operatorAliases';
import { getEventCalendar } from '../../lib/home/frontPageContent';
import { getStageContents } from '../../lib/stages/stages';
import { getAllPlayerSongs } from '../../lib/music/albumsData';
import { NAV_ORDER } from '../../lib/nav/navLinks';
import { buildSiteSearchEntries } from '../../lib/search/siteSearchIndex';
import type { SiteSearchIndex } from '../../lib/search/siteSearch';

// The site search's index (lib/search/siteSearch.ts). scripts/content/export.mjs runs this
// after the stage and enemy builders and publishes the file in the release; prebuild and
// predev write the deployment's own fail-safe copy. The stage and enemy rows come from the
// index files those builders just wrote, read from disk rather than imported, so a release
// indexes the stages it publishes and not the ones this build was compiled with.
const root = process.cwd();
const readJson = <T>(file: string): T => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8')) as T;

const operators = getAllOperators();
const stages = readJson<{ slug: string; code: string | null; name: string | null; variantOf: string | null; contentId: string | null; contentName: string | null }[]>('public/stages-index.json');
// The same rule as /stages/content/[id]'s getStaticPaths: content with no stage of its own
// builds no page, so it gets no row to 404 on.
const withStages = new Set(stages.filter((s) => s.contentId && !s.variantOf).map((s) => s.contentId as string));
const contents = Object.entries(getStageContents())
  .filter(([id]) => withStages.has(id))
  .map(([id, content]) => ({ id, name: content.name, label: content.label }));

const entries = buildSiteSearchEntries({
  pages: NAV_ORDER,
  operators: operators.map((op) => ({ name: op.name, rarity: op.rarity, ...portraitStatus(op) })),
  operatorAliases: buildAliasMap(operators),
  events: getEventCalendar(),
  contents,
  stages,
  enemies: readJson<{ slug: string; name: string; index: string | null; icon?: string | null }[]>('public/enemies-index.json'),
  albums: readJson<{ albumId: string; albumName: string; albumAltName?: string | null }[]>('data/albums.json'),
  songs: getAllPlayerSongs(),
});

const counts = entries.reduce<Record<string, number>>((acc, e) => ({ ...acc, [e.kind]: (acc[e.kind] ?? 0) + 1 }), {});
for (const kind of ['page', 'operator', 'event', 'stage', 'enemy']) {
  if (!counts[kind]) throw new Error(`Site search index has no ${kind} rows; refusing to write it`);
}

const output: SiteSearchIndex = { entries };
const destination = path.join(root, 'public/site-search.json');
fs.writeFileSync(destination, `${JSON.stringify(output)}\n`);
console.log(`Wrote ${entries.length} site search rows to ${destination} (${Object.entries(counts).map(([k, n]) => `${n} ${k}`).join(', ')})`);
